/**
 * 보낸메일함에 빠진 **내가 보낸 메일**을 채워 넣는다 (2026-09-15, 대표님 요청).
 *
 * 왜 빠지나:
 * 메일을 보내는 프로그램이 서버 보낸메일함에 사본을 남기지 않으면(아웃룩 POP 설정 등) 이카운트
 * 보낸메일함에 아무것도 안 남는다. 실제로 대표님 보낸메일함은 9/14 23:20 이 마지막이고,
 * 9/15 에 보낸 메일은 받은편지함 사본으로만 남아 있었다.
 *
 * 이 스크립트는 DB 에 '우리가 보낸 메일(direction=out)'로 들어와 있지만 서버 보낸메일함에는 없는 것을 찾아,
 * 원본을 메일 서버에서 그대로 받아 보낸메일함에 넣는다(IMAP APPEND). 메일 내용은 손대지 않는다.
 *
 * 내 주소로 보낸 것만 넣는다 — 같은 회사 다른 사람이 보낸 메일을 내 보낸메일함에 넣으면 안 된다.
 *
 * 사용:
 *   npx tsx scripts/repair-sent-folder.mts --user=david --days=7           (미리보기)
 *   npx tsx scripts/repair-sent-folder.mts --user=david --days=7 --apply   (실제로 넣기)
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k: string, d = '') => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const APPLY = process.argv.includes('--apply');
const user = arg('user', 'david');
const days = Number(arg('days', '7'));

const { MailAccount } = await import('../src/models/MailAccount.ts');
const { InboundMail } = await import('../src/models/InboundMail.ts');
const { toImapConfig } = await import('../src/lib/mail/accounts.ts');
const { withOpenAccount, findSentPath, fetchSinceBatch, appendMessage } = await import('../src/lib/mail/imap.ts');

await mongoose.connect(process.env.MONGODB_URI!);
const accounts: any[] = await MailAccount.find({ owner: user, isActive: { $ne: false } }).lean();
if (!accounts.length) { console.error(`${user} 아이디로 등록된 메일 계정이 없습니다`); process.exit(1); }
const since = new Date(Date.now() - days * 86400000);

for (const account of accounts) {
  const me = String(account.smtpUser).toLowerCase();
  console.log(`\n── ${account.accountName} (${me}) · 최근 ${days}일`);

  // 내가 보낸 것으로 수집된 메일 (받은편지함 사본 등)
  const mine: any[] = await InboundMail.find({
    direction: 'out',
    date: { $gte: since },
    'from.address': new RegExp(`^${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  }, { messageId: 1, subject: 1, date: 1, folder: 1, uid: 1, to: 1, accountId: 1 }).sort({ date: 1 }).lean();
  console.log(`  DB 의 내가 보낸 메일 ${mine.length}통`);
  if (!mine.length) continue;

  let settings;
  try { settings = toImapConfig(account, 'INBOX'); }
  catch (e: any) { console.error('  계정 설정 오류:', e?.message); continue; }

  await withOpenAccount(settings, async (scoped: any) => {
    const sentPath = await findSentPath(scoped.__client);
    if (!sentPath) { console.error('  보낸메일함 폴더를 찾지 못했습니다'); return; }

    // 보낸메일함에 이미 있는 Message-ID 를 모은다 (기간 안만)
    const have = new Set<string>();
    let afterUid = 0;
    for (let i = 0; i < 40; i++) {
      const b = await fetchSinceBatch(scoped, { folder: sentPath, since, afterUid, limit: 100 });
      if (!b.messages.length) break;
      for (const m of b.messages) {
        const mid = String(m.source).match(/^message-id:\s*(<[^>]+>)/im)?.[1];
        if (mid) have.add(mid.trim().toLowerCase());
      }
      afterUid = b.lastUid;
      if (!b.remaining) break;
    }
    console.log(`  보낸메일함(${sentPath})에 이미 있는 메일 ${have.size}통`);

    // 나에게만 보낸 메일(브리핑 등)은 넣지 않는다 — lib/mail/sent-copy.ts syncOutboxCopies 와 같은 규칙
    const missing = mine.filter((m) => m.messageId && !have.has(String(m.messageId).trim().toLowerCase())
      && (m.to || []).some((t: any) => String(t.address || '').toLowerCase() !== me));
    console.log(`  보낸메일함에 없는 것 ${missing.length}통`);
    missing.forEach((m) => console.log(`    ${new Date(m.date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · ${String(m.subject).slice(0, 44)} → ${(m.to || []).map((t: any) => t.address).join(', ').slice(0, 40)}`));
    if (!APPLY || !missing.length) return;

    let done = 0;
    for (const m of missing) {
      try {
        // 원본을 있던 폴더에서 그대로 받아 보낸메일함에 넣는다
        const lock = await scoped.__client.getMailboxLock(m.folder);
        let source: Buffer | null = null;
        try {
          const one = await scoped.__client.fetchOne(String(m.uid), { source: true }, { uid: true });
          source = (one as any)?.source || null;
        } finally { lock.release(); }
        if (!source) { console.log(`    건너뜀(원본 없음): ${String(m.subject).slice(0, 30)}`); continue; }
        await appendMessage(scoped, sentPath, source, ['\\Seen'], new Date(m.date));
        done++;
      } catch (e: any) {
        console.log(`    실패: ${String(m.subject).slice(0, 30)} — ${String(e?.message || e).slice(0, 60)}`);
      }
    }
    console.log(`  보낸메일함에 넣음 ${done}통`);
  });
}

console.log(APPLY ? '\n끝 — 보낸 메일함 화면에서 바로 보입니다.' : '\n(미리보기 — 실제로 넣으려면 --apply)');
await mongoose.disconnect();
