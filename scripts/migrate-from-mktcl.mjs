#!/usr/bin/env node
/**
 * mktCl(구 시스템) → yogiboB2b 데이터 이관.
 *
 * mktCl DB 는 **읽기만** 한다. 구 시스템이 아직 돌고 있으므로 건드리면 안 된다.
 *
 * 어려운 부분은 상태 모델이 다르다는 것이다.
 * mktCl 은 축이 셋이었다 — aiStatus(검증) × status(승인) × sendStatus(발송).
 * 새 앱은 stage 하나로 합쳐져 있다. 그래서 세 축의 조합을 단계 하나로 접어야 한다:
 *
 *   AI 부적합                     → failed     (판단 기록을 남겨 재수집 때 다시 안 뜨게)
 *   AI 적합 + 미승인              → verified   (보낼 수 있는 곳, 사람이 고르기 전)
 *   AI 적합 + 승인 + 발송완료     → contacted  (+ 발송 이력)
 *   AI 적합 + 승인 + 발송실패     → queued     (발송 리스트에 남긴다 — 다시 보내야 하므로)
 *
 * 사용:
 *   node scripts/migrate-from-mktcl.mjs --dry     # 세어만 보고 쓰지 않음
 *   node scripts/migrate-from-mktcl.mjs
 *
 * 여러 번 돌려도 안전하다 — leadId 기준 upsert 라 같은 리드가 두 번 안 쌓인다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const DRY = process.argv.includes('--dry');
const MKTCL_ENV = 'C:/Users/Yogibo Design/Desktop/mktCl/.env.local';

function readEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function loadOwnEnv() {
  const p = path.resolve('.env.local');
  if (!fs.existsSync(p)) throw new Error('.env.local 이 없습니다.');
  return readEnvFile(p);
}

/** mktCl 리드의 세 축을 새 앱 stage 하나로 접는다 */
function toStage(lead, recipient) {
  if (lead.aiStatus === 'invalid') return 'failed';
  if (lead.status === 'rejected') return 'archived';
  if (!recipient) return 'verified';
  if (recipient.sendStatus === 'sent') return 'contacted';
  if (recipient.sendStatus === 'unsubscribed') return 'archived';
  // failed / ready — 아직 나가야 할 곳이다
  return 'queued';
}

/**
 * mktCl 은 리드 식별자가 mongo _id 뿐이다. 새 앱은 leadId(문자열)를 쓰므로
 * 구 _id 를 그대로 접두사와 함께 옮긴다 — 나중에 "이건 어디서 온 리드인가"를
 * 되짚을 수 있고, 다시 돌려도 같은 값이 나와 중복이 안 쌓인다.
 */
const leadIdOf = (doc) => `mktcl-${doc._id}`;

async function main() {
  const src = readEnvFile(MKTCL_ENV);
  const dst = loadOwnEnv();

  const srcClient = await new MongoClient(src.MONGODB_URI).connect();
  const dstClient = await new MongoClient(dst.MONGODB_URI).connect();
  const S = srcClient.db(src.MONGODB_DB || 'mktcl');
  const D = dstClient.db(); // URI 경로에 DB명이 박혀 있다

  console.log(`읽기: ${S.databaseName}  →  쓰기: ${D.databaseName}${DRY ? '  (DRY RUN)' : ''}\n`);

  // ── 리드 ──────────────────────────────────────────────
  const leads = await S.collection('leads').find({}).toArray();
  const recipients = await S.collection('recipients').find({}).toArray();
  const campaigns = await S.collection('campaigns').find({}).toArray();

  const campaignById = new Map(campaigns.map((c) => [String(c._id), c]));
  // recipient 는 leadId(구 _id 문자열)로 리드를 가리킨다
  const recipientByLead = new Map(recipients.map((r) => [String(r.leadId), r]));

  const tally = {};
  const ops = [];

  for (const l of leads) {
    const r = recipientByLead.get(String(l._id));
    const stage = toStage(l, r);
    tally[stage] = (tally[stage] || 0) + 1;

    const now = new Date().toISOString();
    const createdAt = l.createdAt || now;

    // 발송 이력 — 나갔든 실패했든 "언제 무엇을 보내려 했나"는 남겨야 한다
    const emailHistory = [];
    if (r && (r.sendStatus === 'sent' || r.sendStatus === 'failed')) {
      const camp = r.campaignId ? campaignById.get(String(r.campaignId)) : null;
      emailHistory.push({
        subject: camp?.subject || '(제목 기록 없음 — mktCl 이관분)',
        to: l.email,
        sentAt: r.sentAt || r.createdAt || createdAt,
        status: r.sendStatus === 'sent' ? 'sent' : 'failed',
        error: r.sendError || undefined,
      });
    }

    ops.push({
      updateOne: {
        filter: { leadId: leadIdOf(l) },
        update: {
          $set: {
            Company: l.companyName || '',
            Email: l.email || '',
            WebsiteContact: l.url || '',
            Phone: l.tel || '',
            address: l.address || '',
            category: l.category || '',
            keyword: l.keyword || '',
            naverCategory: l.naverCategory || '',
            crawlSource: l.source || 'mktcl',
            crawledFromUrl: l.url || '',
            notes: l.memo || '',
            stage,
            stageChangedAt: l.updatedAt || createdAt,
            // 승인까지 끝난 곳만 발송 게이트를 열어 둔다.
            // 구 시스템에서 사람이 이미 "보내도 된다"고 판단한 것들이다.
            readyForOutreach: l.status === 'approved',
            // AI 판정을 그대로 옮긴다. 다시 돌리면 토큰이 또 나가고,
            // 무엇보다 사람이 그 판정을 보고 승인한 이력이 어긋나게 된다.
            'verification.aiVerdict':
              l.aiStatus === 'valid' ? 'target-fit' : l.aiStatus === 'invalid' ? 'not-fit' : null,
            'verification.aiReasoning': l.aiReason || '',
            'verification.score': typeof l.aiScore === 'number' ? l.aiScore : undefined,
            'verification.verifiedAt': l.updatedAt || createdAt,
            ...(emailHistory.length
              ? { emailHistory, lastEmailSentAt: emailHistory[0].sentAt }
              : {}),
          },
          $setOnInsert: {
            leadId: leadIdOf(l),
            Region: '',
            status: 'new',
            registeredAt: createdAt,
            importedAt: createdAt,
            importBatch: 'mktcl-migration',
          },
        },
        upsert: true,
      },
    });
  }

  console.log('── 리드 단계별 ──');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(11)} ${v}`);
  }
  console.log(`   ${'합계'.padEnd(10)} ${leads.length}\n`);

  // ── 키워드 ────────────────────────────────────────────
  const keywords = await S.collection('keywords').find({}).toArray();
  const kwOps = keywords.map((k) => ({
    updateOne: {
      filter: { category: k.category, keyword: k.keyword },
      update: {
        $setOnInsert: {
          category: k.category,
          keyword: k.keyword,
          active: true,
          foundCount: 0,
          createdAt: k.createdAt ? new Date(k.createdAt) : new Date(),
        },
      },
      upsert: true,
    },
  }));

  // ── 템플릿 ────────────────────────────────────────────
  // mktCl 은 카테고리당 양식 하나였다. 새 앱은 양식이 여러 개일 수 있으므로
  // '첫 제안(intro)' 목적으로 옮기고 카테고리를 달아 둔다.
  const templates = await S.collection('templates').find({}).toArray();
  const CATEGORY_LABEL = {
    public: '학교·공공기관·복지시설',
    company: '기업',
    medical: '병·의원',
    resort: '리조트·호텔',
    sports: '스포츠시설·단체',
  };
  const tplOps = templates.map((t) => ({
    updateOne: {
      filter: { category: t.category, purpose: 'intro' },
      update: {
        $set: {
          name: `${CATEGORY_LABEL[t.category] || t.category} — 첫 제안`,
          language: 'ko',
          subject: t.subject || '',
          body: t.bodyHtml || '',
          bodyIsHtml: true,
          purpose: 'intro',
          category: t.category,
          isActive: true,
          appendAccountSignature: true,
        },
      },
      upsert: true,
    },
  }));

  console.log(`── 키워드 ${keywords.length}건 · 템플릿 ${templates.length}건 ──\n`);

  if (DRY) {
    console.log('DRY RUN — 아무것도 쓰지 않았습니다.');
    await srcClient.close(); await dstClient.close();
    return;
  }

  const rLeads = await D.collection('leads').bulkWrite(ops, { ordered: false });
  const rKw = await D.collection('keywords').bulkWrite(kwOps, { ordered: false });
  const rTpl = await D.collection('emailtemplates').bulkWrite(tplOps, { ordered: false });

  console.log('── 반영 ──');
  console.log(`   리드    신규 ${rLeads.upsertedCount} · 갱신 ${rLeads.modifiedCount}`);
  console.log(`   키워드  신규 ${rKw.upsertedCount}`);
  console.log(`   템플릿  신규 ${rTpl.upsertedCount} · 갱신 ${rTpl.modifiedCount}`);

  await srcClient.close();
  await dstClient.close();
}

main().catch((e) => {
  console.error('이관 실패:', e.message);
  process.exit(1);
});
