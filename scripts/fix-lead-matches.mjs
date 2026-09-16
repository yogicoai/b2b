#!/usr/bin/env node
/**
 * 잘못 붙은 답장 매칭을 걷어낸다.
 *
 * 도메인 매칭(match-lead.ts 4단계)이 대형 공용 도메인에서 사고를 냈다.
 * shinsegae.com(신세계 그룹 전체)·navercorp.com(네이버 전체) 에서 온
 * 자동발송 메일이 리드 하나에 통째로 붙어 '답장받음' 으로 올라갔다.
 *
 * 코드는 고쳤지만(isBulkSender + 발송이력 조건) 이미 들어간 데이터는 그대로다.
 * 이 스크립트가 그걸 정리한다.
 *
 * 사용: node scripts/fix-lead-matches.mjs           # 미리보기
 *       node scripts/fix-lead-matches.mjs --apply   # 실제 정정
 */
import fs from 'node:fs';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = readEnv('.env.local');

// src/lib/mail/match-lead.ts 의 isBulkSender 와 같은 규칙.
// 여기서 다시 쓰는 이유: 스크립트는 TS 를 import 하지 않는다.
// 규칙이 바뀌면 양쪽을 같이 고칠 것.
// ⚠️ 글자 경계를 건다. 부분 일치로 두면 'ads?' 가 adam·adrian·advisor 안의 'ad' 를
//    잡아 실제 담당자를 자동발송으로 몰아버린다.
const BULK = new RegExp('(^|[^a-z])(' + [
  'no-?_?reply', 'donot-?reply', 'do-?not-?reply', 'noreply',
  'mailer-?daemon', 'postmaster', 'bounce', 'return-?path',
  'billing', 'invoices?', 'tax-?invoice', 'taxinvoice', 'payments?',
  'alimtalk', 'notifications?', 'notice', 'alerts?',
  'newsletter', 'marketing', 'promo', 'ads?', 'advert(ising)?',
  'auto(mated)?', 'system', 'daemon', 'robot', 'bot',
  'webmaster', 'administrator', 'admin',
  'tracking', 'delivery', 'shipment',
].join('|') + ')([^a-z]|$)', 'i');

// 붙여 쓴 형태(hometaxadmin · webadmin · trackingupdates) — 끝에 왔을 때
// 사람 이름일 수 없는 단어만 넣는다.
const BULK_SUFFIX = /(admin|no-?_?reply|daemon|notifications?|updates?|mailer|noti)$/i;

const isBulk = (addr) => {
  const l = String(addr || '').toLowerCase().split('@')[0] || '';
  return Boolean(l) && (BULK.test(l) || BULK_SUFFIX.test(l));
};

const lastSentAt = (hist) => {
  let best = 0;
  for (const h of hist || []) {
    if (h?.status !== 'sent' || !h?.sentAt) continue;
    const t = new Date(h.sentAt).getTime();
    if (!Number.isNaN(t) && t > best) best = t;
  }
  return best ? new Date(best) : null;
};

async function main() {
  const c = await new MongoClient(env.MONGODB_URI).connect();
  const db = c.db();
  const IM = db.collection('inboundmails');
  const L = db.collection('leads');

  console.log(APPLY ? '── 실제 정정 ──\n' : '── 미리보기 (--apply 로 실행) ──\n');

  // ── 1. 자동발송 주소가 도메인 매칭으로 붙은 것을 떼어낸다 ──
  const linked = await IM.find(
    { leadId: { $nin: [null, ''] }, leadMatchedBy: 'domain' },
    { projection: { subject: 1, from: 1, leadId: 1, classification: 1, date: 1 } },
  ).toArray();

  const unlink = linked.filter((m) => isBulk(m?.from?.address));
  console.log(`도메인 매칭 ${linked.length}건 중 자동발송 발신 ${unlink.length}건을 떼어낸다:`);
  const touched = new Set();
  for (const m of unlink) {
    const l = await L.findOne({ leadId: m.leadId }, { projection: { Company: 1 } });
    console.log(`  ✂ ${(l?.Company || '?').padEnd(16)} ← ${m.from?.address}  | ${String(m.subject || '').slice(0, 50)}`);
    touched.add(m.leadId);
  }
  if (APPLY && unlink.length) {
    await IM.updateMany(
      { _id: { $in: unlink.map((m) => m._id) } },
      { $set: { leadId: '', leadMatchedBy: null } },
    );
  }

  // ── 2. '답장받음' 자격 재계산 ──
  // 자격 = 우리가 보낸 이력이 있고 + 그 이후에 + 광고/자동발송이 아닌 수신이 있다
  console.log('\n답장받음(replied) 리드 재검증:');
  const replied = await L.find({ stage: 'replied' }, { projection: { leadId: 1, Company: 1, emailHistory: 1 } }).toArray();
  for (const l of replied) {
    const sent = lastSentAt(l.emailHistory);
    const q = {
      leadId: l.leadId,
      direction: 'in',
      trashedAt: null,
      classification: { $nin: ['ad', 'system', 'newsletter'] },
    };
    // 방금 뗀 것은 이미 leadId 가 비었으므로 미리보기에서도 제외해야 실제와 같아진다
    if (!APPLY) q._id = { $nin: unlink.map((m) => m._id) };
    if (sent) q.date = { $gte: new Date(sent.getTime() - 24 * 60 * 60 * 1000) };

    const real = sent ? await IM.countDocuments(q) : 0;
    if (sent && real > 0) {
      console.log(`  ✓ 유지  ${l.Company} — 발송 후 실제 답장 ${real}건`);
      continue;
    }
    const to = sent ? 'contacted' : 'verified';
    const why = !sent ? '보낸 이력이 없다' : '발송 이후의 실제 답장이 없다';
    console.log(`  ↩ 되돌림 ${l.Company} → ${to}  (${why})`);
    if (APPLY) {
      await L.updateOne(
        { leadId: l.leadId },
        { $set: { stage: to, stageChangedAt: new Date().toISOString() }, $unset: { needsReply: '', replyDeadline: '' } },
      );
      touched.add(l.leadId);
    }
  }

  // ── 3. 떼어낸 리드의 답장 통수 다시 세기 ──
  if (APPLY && touched.size) {
    console.log('\n답장 통수 재계산:');
    for (const leadId of touched) {
      const n = await IM.countDocuments({ leadId, direction: 'in', trashedAt: null });
      const l = await L.findOne({ leadId }, { projection: { Company: 1 } });
      const last = await IM.find({ leadId, direction: 'in', trashedAt: null }).sort({ date: -1 }).limit(1).toArray();
      const set = { inboundCount: n };
      if (last[0]?.date) set.lastInboundAt = new Date(last[0].date).toISOString();
      else set.lastInboundAt = null;
      await L.updateOne({ leadId }, { $set: set });
      console.log(`  ${l?.Company || leadId}: 답장 ${n}건`);
    }
  }

  // ── 4. 오염된 리드 이메일 지적 ──
  // 메디그린한방병원의 Email 이 dl_bookingcustomer@navercorp.com 이었다.
  // 홈페이지가 네이버 플레이스라 크롤러가 네이버 예약 주소를 병원 주소로 긁어왔다.
  //
  // ⚠️ naver.com(평범한 웹메일)은 절대 넣지 말 것. 국내 업체가 흔히 쓰는 주소다.
  //    처음에 넣었다가 미리보기에서 섬마을양조장·북구청소년수련관 등 멀쩡한 리드
  //    수백 개가 걸렸다. 지웠으면 발송 대상이 통째로 날아갈 뻔했다.
  //    오염은 **네이버 법인·서비스 도메인**이다 — 업체가 쓸 이유가 없는 주소.
  console.log('\n업체가 쓸 수 없는 주소가 박힌 리드 (크롤러 오수집):');
  const suspect = await L.find(
    {
      Email: /@(navercorp\.com|(booking|smartstore|partner|talk|shopping|pay)\.naver\.com)$/i,
      deleted: { $ne: true },
    },
    { projection: { leadId: 1, Company: 1, Email: 1, Website: 1, stage: 1 } },
  ).limit(50).toArray();
  for (const l of suspect) {
    console.log(`  ⚠ ${(l.Company || '?').padEnd(16)} ${l.Email}  (홈페이지 ${l.Website || '-'})`);
    if (APPLY) {
      // 주소를 지우면 이 리드로는 발송도 매칭도 되지 않는다 — 잘못된 주소로
      // 보내는 것보다 낫다. 사람이 다시 채우거나 크롤링이 다시 찾는다.
      await L.updateOne({ leadId: l.leadId }, { $set: { Email: '', emailSource: 'cleared:wrong-domain' } });
    }
  }
  if (!suspect.length) console.log('  (없음)');

  console.log(APPLY ? '\n완료.' : '\n미리보기였다. 실제로 하려면 --apply');
  await c.close();
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
