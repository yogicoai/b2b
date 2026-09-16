/**
 * 이카운트 **보낸메일함**의 메일을 CRM 으로 가져온다 (2026-09-15, 대표님 요청 — 최근 1주일치).
 *
 * 왜 필요한가:
 * 지금까지 수집 대상은 받은편지함과 거래처 폴더뿐이었다. 그래서 대표님이 웹메일·아웃룩에서 보낸 메일은
 * CRM 어디에도 없었고, 업체 대화 이력이 "받은 것만" 남아 반쪽이었다.
 * (📤 보낸 메일함 화면은 서버를 그때그때 읽으므로 보이지만, 업체별 대화·답장 판정에는 쓰이지 않았다.)
 *
 * 저장 방식은 새 규칙을 따른다 — 원문 HTML 은 넣지 않고 미리보기(4,000자)만 넣는다.
 * 원문은 메일 서버에 있으므로 필요할 때 받아 온다.
 *
 * 사용:
 *   npx tsx scripts/import-sent-mails.mts --user=david --days=7          (미리보기)
 *   npx tsx scripts/import-sent-mails.mts --user=david --days=7 --apply  (저장)
 *   --all 을 주면 등록된 모든 계정
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k: string, d = '') => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const user = arg('user', 'david');
const days = Number(arg('days', '7'));
const PREVIEW = 4000;

const { MailAccount } = await import('../src/models/MailAccount.ts');
const { InboundMail } = await import('../src/models/InboundMail.ts');
const { Lead } = await import('../src/models/Lead.ts');
const { toImapConfig } = await import('../src/lib/mail/accounts.ts');
const { withOpenAccount, findSentPath, fetchSinceBatch } = await import('../src/lib/mail/imap.ts');
const { parseMessage } = await import('../src/lib/mail/parse.ts');
const { threadKey } = await import('../src/lib/mail/thread.ts');

await mongoose.connect(process.env.MONGODB_URI!);
const accounts: any[] = await MailAccount.find(ALL ? { isActive: { $ne: false } } : { owner: user, isActive: { $ne: false } }).lean();
if (!accounts.length) { console.error(`계정을 찾지 못했습니다 (${ALL ? '전체' : user})`); process.exit(1); }
const since = new Date(Date.now() - days * 86400000);
console.log(`보낸메일함 가져오기 — ${accounts.map((a) => a.smtpUser).join(', ')} · 최근 ${days}일 (${since.toLocaleDateString('ko-KR')} 이후)${APPLY ? '' : ' · 미리보기'}`);

// 업체 메일 주소 → leadId (보낸 메일을 업체 대화에 붙인다)
const leads: any[] = await Lead.find({ deleted: { $ne: true }, Email: { $regex: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ } }, { leadId: 1, Email: 1, Company: 1 }).lean();
const leadByEmail = new Map<string, any>(leads.map((l) => [String(l.Email).trim().toLowerCase(), l]));
const leadByDomain = new Map<string, any>();
for (const l of leads) {
  const d = String(l.Email).split('@')[1]?.toLowerCase();
  if (d && !leadByDomain.has(d)) leadByDomain.set(d, l);
}

let totals = { fetched: 0, inserted: 0, duplicate: 0, linked: 0, errors: [] as string[] };
for (const account of accounts) {
  const accountId = String(account._id);
  let settings;
  try { settings = toImapConfig(account, 'INBOX'); }
  catch (e: any) { totals.errors.push(`[${account.smtpUser}] ${e?.message}`); continue; }

  await withOpenAccount(settings, async (scoped: any) => {
    const folder = await findSentPath(scoped.__client);
    if (!folder) { totals.errors.push(`[${account.smtpUser}] 보낸메일함 폴더 없음`); return; }
    let afterUid = 0;
    for (let round = 0; round < 40; round++) {
      const batch = await fetchSinceBatch(scoped, { folder, since, afterUid, limit: 40 });
      if (!batch.messages.length) break;
      totals.fetched += batch.messages.length;
      for (const msg of batch.messages) {
        try {
          const parsed: any = await parseMessage(msg.source, { uid: msg.uid, folder, internalDate: msg.internalDate });
          const to = (parsed.to || []).map((t: any) => String(t.address || '').toLowerCase());
          const hit = to.map((a: string) => leadByEmail.get(a) || leadByDomain.get(a.split('@')[1] || '')).find(Boolean);
          const doc: any = {
            messageId: parsed.messageId,
            accountId, folder, uid: parsed.uid,
            subject: parsed.subject, from: parsed.from, to: parsed.to, cc: parsed.cc,
            date: parsed.date, receivedAt: parsed.receivedAt, lang: parsed.lang,
            direction: 'out',
            // 저장 공간 규칙 — 원문 HTML 은 넣지 않는다 (필요하면 서버에서 받아 온다)
            raw: { text: String(parsed.raw?.text || '').slice(0, PREVIEW), html: '' },
            bodyStripped: String(parsed.bodyStripped || parsed.raw?.text || '').slice(0, PREVIEW),
            rawTruncated: true,
            attachments: parsed.attachments,
            inReplyTo: parsed.headers?.inReplyTo,
            references: parsed.headers?.references,
            classification: 'b2b',
            classifiedBy: 'rule',
            leadId: hit?.leadId || '',
            leadMatchedBy: hit ? 'sent-import' : undefined,
            // 우리가 보낸 메일은 '할 일'이 아니다
            analysis: { method: 'local', needsReply: false, deadline: null, urgency: 'low', summary: '', keyPoints: [], analyzedAt: new Date().toISOString() },
          };
          doc.threadKey = threadKey({ subject: doc.subject, messageId: doc.messageId, group: '', from: doc.from });
          if (hit) totals.linked++;
          if (APPLY) {
            const r = await InboundMail.updateOne({ messageId: doc.messageId }, { $setOnInsert: doc }, { upsert: true });
            if (r.upsertedCount) totals.inserted++; else totals.duplicate++;
          } else if (await InboundMail.exists({ messageId: doc.messageId })) totals.duplicate++;
          else totals.inserted++;
        } catch (e: any) {
          totals.errors.push(`[${account.smtpUser}/uid ${msg.uid}] ${String(e?.message || e).slice(0, 80)}`);
        }
      }
      afterUid = batch.lastUid;
      if (!batch.remaining) break;
    }
    console.log(`  ${account.smtpUser} · 폴더 "${folder}" · 가져옴 ${totals.fetched}통`);
  });
}

console.log(`\n${APPLY ? '저장' : '미리보기'} — 새로 ${totals.inserted}통 · 이미 있던 ${totals.duplicate}통 · 업체 연결 ${totals.linked}건`);
if (totals.errors.length) console.log(`오류 ${totals.errors.length}건: ${totals.errors.slice(0, 5).join(' | ')}`);
if (!APPLY) console.log('(적용하려면 --apply)');
await mongoose.disconnect();
