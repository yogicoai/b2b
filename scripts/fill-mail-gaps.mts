/**
 * 서버에는 있는데 DB 에 없는 메일을 **그것만 골라 채운다** (2026-09-15).
 *
 * 왜 필요한가:
 * 2달치 가져오기는 폴더를 처음부터 훑으며 번호(uid) 순서로 나아간다. 도중에 한 통이 실패하거나
 * 접속이 끊기면 그 통은 건너뛴 채 커서만 앞으로 가서, "완료" 로 끝나도 구멍이 남는다.
 * 실제로 대표님 메일함에서 받은편지함 79통 등 94통이 빠져 있었다.
 *
 * 이 스크립트는 폴더마다 서버의 uid 목록과 DB 의 uid 목록을 맞대어 **없는 것만** 받아온다.
 * 이미 있는 것은 건드리지 않는다. 폴더마다 접속을 새로 만들지 않는다.
 *
 * 저장은 지금 규칙을 그대로 따른다 — 원문은 넣지 않고 미리보기 4,000자만 (lib/mail/ingest.ts).
 *
 * 미리보기: npx tsx scripts/fill-mail-gaps.mts --mailbox=david@yogico.kr --days=60
 * 적용:     npx tsx scripts/fill-mail-gaps.mts --mailbox=david@yogico.kr --days=60 --apply
 *   --sent 를 주면 보낸메일함도 함께 채운다 (기본은 받은편지함·거래처 폴더만).
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k: string, d = '') => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const APPLY = process.argv.includes('--apply');
const WITH_SENT = process.argv.includes('--sent');
const MAILBOX = arg('mailbox', 'david@yogico.kr');
const DAYS = Number(arg('days', '60'));
const LIMIT = Number(arg('limit', '0'));            // 0 = 제한 없음

const { MailAccount } = await import('../src/models/MailAccount.ts');
const { InboundMail } = await import('../src/models/InboundMail.ts');
const { Lead } = await import('../src/models/Lead.ts');
const { toImapConfig } = await import('../src/lib/mail/accounts.ts');
const { withOpenAccount, findSentPath } = await import('../src/lib/mail/imap.ts');
const { parseMessage } = await import('../src/lib/mail/parse.ts');
const { threadKey } = await import('../src/lib/mail/thread.ts');
const { ruleClassify } = await import('../src/lib/mail/classify.ts');
const { matchLead } = await import('../src/lib/mail/match-lead.ts');

const PREVIEW = 4000;

await mongoose.connect(process.env.MONGODB_URI!);
const I = mongoose.connection.db!.collection('inboundmails');
const escaped = MAILBOX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const accounts: any[] = await MailAccount.find({ smtpUser: new RegExp(`^${escaped}$`, 'i'), isActive: { $ne: false } }).lean();
if (!accounts.length) { console.error(`${MAILBOX} 로 등록된 계정이 없습니다`); process.exit(1); }

// 같은 메일함을 여러 계정으로 등록해 두었을 수 있다 — DB 대조는 그 전부를 합쳐서 본다
const allIds = accounts.map((a) => String(a._id));
// 받아올 때 쓰는 계정은 2달치를 끝낸 것 우선 (검증된 접속)
const account = accounts.find((a) => a.backfilledAt) || accounts[0];
const accountId = String(account._id);
const since = new Date(Date.now() - DAYS * 86400000);
const me = String(account.smtpUser).toLowerCase();

console.log(`메일함 ${MAILBOX} · 최근 ${DAYS}일 · 받아올 계정 [${account.owner}] ${account.accountName}${APPLY ? '' : ' · 미리보기'}`);

let settings;
try { settings = toImapConfig(account, 'INBOX'); }
catch (e: any) { console.error('계정 설정 오류:', e?.message); process.exit(1); }

const totals = { gaps: 0, inserted: 0, failed: 0, linked: 0 };
const errors: string[] = [];

await withOpenAccount(settings, async (scoped: any) => {
  const client = scoped.__client;
  const sentPath = WITH_SENT ? await findSentPath(client) : '';
  const boxes: any[] = await client.list();
  const folders = boxes.map((b) => b.path)
    .filter((p: string) => !/trash|spam|junk|deleted|drafts/i.test(p))
    .filter((p: string) => WITH_SENT || p !== sentPath)
    .filter((p: string) => p === sentPath || /^INBOX/i.test(p));

  for (const folder of folders) {
    const isSent = folder === sentPath;
    let serverUids: number[] = [];
    try {
      const lock = await client.getMailboxLock(folder);
      try { serverUids = (await client.search({ since }, { uid: true })) || []; }
      finally { lock.release(); }
    } catch (e: any) { errors.push(`${folder}: 목록 조회 실패 ${String(e?.message || e).slice(0, 50)}`); continue; }
    if (!serverUids.length) continue;

    const have = new Set<number>(
      (await I.distinct('uid', { accountId: { $in: allIds }, folder, uid: { $in: serverUids } })).map(Number),
    );
    const missing = serverUids.filter((u) => !have.has(Number(u)));
    if (!missing.length) { console.log(`  ${folder.padEnd(34)} 빠진 것 없음 (${serverUids.length}통)`); continue; }
    totals.gaps += missing.length;
    console.log(`  ${folder.padEnd(34)} 서버 ${serverUids.length}통 · 빠진 것 ${missing.length}통`);
    if (!APPLY) continue;

    const take = LIMIT ? missing.slice(0, LIMIT) : missing;
    const lock = await client.getMailboxLock(folder);
    try {
      for (const uid of take) {
        try {
          const one: any = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
          const source = one?.source;
          if (!source) { totals.failed++; continue; }
          const parsed: any = await parseMessage(source, { uid: Number(uid), folder, internalDate: one.internalDate });
          const fromAddr = String(parsed.from?.address || '').toLowerCase();
          const direction = isSent || fromAddr === me ? 'out' : 'in';

          const doc: any = {
            messageId: parsed.messageId,
            accountId, folder, uid: Number(uid),
            subject: parsed.subject, from: parsed.from, to: parsed.to, cc: parsed.cc,
            date: parsed.date, receivedAt: parsed.receivedAt, lang: parsed.lang,
            direction,
            // 저장 규칙 — 원문은 넣지 않는다. 필요하면 메일 서버에서 받아온다 (lib/mail/body.ts)
            raw: { text: String(parsed.raw?.text || '').slice(0, PREVIEW), html: '' },
            bodyStripped: String(parsed.bodyStripped || parsed.raw?.text || '').slice(0, PREVIEW),
            rawTruncated: true,
            attachments: parsed.attachments,
            inReplyTo: parsed.headers?.inReplyTo,
            references: parsed.headers?.references,
          };
          doc.threadKey = threadKey({ subject: doc.subject, messageId: doc.messageId, group: '', from: doc.from });

          if (direction === 'out') {
            doc.classification = 'b2b';
            doc.classifiedBy = 'rule';
            // 우리가 보낸 메일은 '할 일'이 아니다
            doc.analysis = { method: 'local', needsReply: false, deadline: null, urgency: 'low', summary: '', keyPoints: [], analyzedAt: new Date().toISOString() };
          } else {
            const cls = ruleClassify(parsed);
            doc.classification = cls?.classification || 'unknown';
            doc.classifiedBy = 'rule';
          }

          const hit = await matchLead({
            inReplyTo: doc.inReplyTo, references: doc.references, from: doc.from,
          });
          if (hit?.leadId) { doc.leadId = hit.leadId; doc.leadMatchedBy = hit.matchedBy; totals.linked++; }

          const r = await InboundMail.updateOne({ messageId: doc.messageId }, { $setOnInsert: doc }, { upsert: true });
          if (r.upsertedCount) totals.inserted++;
        } catch (e: any) {
          totals.failed++;
          if (errors.length < 20) errors.push(`${folder}/uid ${uid}: ${String(e?.message || e).slice(0, 60)}`);
        }
      }
    } finally { lock.release(); }
    console.log(`    → 채움 ${totals.inserted}통 누적 · 실패 ${totals.failed}`);
  }
});

console.log(`\n${APPLY ? '완료' : '미리보기'} — 빠져 있던 ${totals.gaps}통 · 새로 넣은 것 ${totals.inserted}통 · 업체 연결 ${totals.linked}건 · 실패 ${totals.failed}`);
if (errors.length) { console.log(`오류 ${errors.length}건:`); errors.slice(0, 8).forEach((e) => console.log('  - ' + e)); }
if (!APPLY) console.log('(실제로 채우려면 --apply)');
await mongoose.disconnect();
