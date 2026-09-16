/**
 * 가져온 메일이 **실제 메일함과 맞는지** 대조한다 (2026-09-15, "840개가 다 맞는지 체크").
 *
 * 세 가지를 본다:
 *   1) DB 안에 같은 메일이 두 번 들어와 있지는 않은가 (Message-ID 기준 · 폴더+uid 기준)
 *   2) 같은 메일함을 여러 계정으로 등록해 두어 두 번 센 것은 아닌가
 *   3) 이카운트 서버의 폴더별 실제 통수와 DB 통수가 맞는가 (수집 기간 안에서)
 *
 * 메일 서버에는 폴더마다 한 번씩만 붙는다 — 연달아 붙으면 뒤쪽 폴더가 통째로 실패한다.
 *
 * 사용: npx tsx scripts/verify-mailbox-count.mts --mailbox=david@yogico.kr [--days=60]
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k: string, d = '') => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const MAILBOX = arg('mailbox', 'david@yogico.kr');
const DAYS = Number(arg('days', '60'));

const { MailAccount } = await import('../src/models/MailAccount.ts');
const { toImapConfig } = await import('../src/lib/mail/accounts.ts');
const { withOpenAccount } = await import('../src/lib/mail/imap.ts');

await mongoose.connect(process.env.MONGODB_URI!);
const I = mongoose.connection.db!.collection('inboundmails');
const escaped = MAILBOX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const accounts: any[] = await MailAccount.find({ smtpUser: new RegExp(`^${escaped}$`, 'i') }).lean();
if (!accounts.length) { console.error(`${MAILBOX} 로 등록된 계정이 없습니다`); process.exit(1); }
const ids = accounts.map((a) => String(a._id));
const since = new Date(Date.now() - DAYS * 86400000);

console.log(`메일함 ${MAILBOX} · 등록된 계정 ${accounts.length}개`);
for (const a of accounts) {
  const n = await I.countDocuments({ accountId: String(a._id) });
  console.log(`  [${a.owner}] ${a.accountName} — DB ${n}통 · ${a.backfilledAt ? '2달치 완료' : '2달치 미완료'}`);
}
const total = await I.countDocuments({ accountId: { $in: ids } });
console.log(`  합계 ${total}통 (중복 없이 센 값)\n`);

// ── 1) 같은 메일이 두 번 들어와 있는가 ──
console.log('── 중복 검사 ──');
const dupMid = await I.aggregate([
  { $match: { accountId: { $in: ids }, messageId: { $nin: ['', null] } } },
  { $group: { _id: '$messageId', n: { $sum: 1 }, subjects: { $push: '$subject' } } },
  { $match: { n: { $gt: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 },
]).toArray();
console.log(`같은 Message-ID 가 두 번 이상: ${dupMid.length}건`);
dupMid.slice(0, 5).forEach((d) => console.log(`   ${d.n}회 · ${String(d.subjects[0]).slice(0, 50)}`));

const dupUid = await I.aggregate([
  { $match: { accountId: { $in: ids } } },
  { $group: { _id: { a: '$accountId', f: '$folder', u: '$uid' }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }, { $limit: 10 },
]).toArray();
console.log(`같은 계정·폴더·번호(uid)가 두 번 이상: ${dupUid.length}건`);

// 계정을 두 번 등록해 같은 메일을 양쪽에 담고 있지는 않은가
if (ids.length > 1) {
  const cross = await I.aggregate([
    { $match: { accountId: { $in: ids }, messageId: { $nin: ['', null] } } },
    { $group: { _id: '$messageId', accts: { $addToSet: '$accountId' } } },
    { $match: { $expr: { $gt: [{ $size: '$accts' }, 1] } } }, { $count: 'n' },
  ]).toArray();
  console.log(`두 계정에 같이 들어 있는 메일: ${cross[0]?.n || 0}건 (0 이어야 정상 — 같은 메일은 한 번만 저장됩니다)`);
}

// ── 2) 서버 실제 통수와 대조 ──
console.log(`\n── 메일 서버와 대조 (최근 ${DAYS}일) ──`);
const account = accounts.find((a) => a.backfilledAt) || accounts[0];
let settings;
try { settings = toImapConfig(account, 'INBOX'); }
catch (e: any) { console.error('계정 설정 오류:', e?.message); await mongoose.disconnect(); process.exit(1); }

await withOpenAccount(settings, async (scoped: any) => {
  const client = scoped.__client;
  const boxes: any[] = await client.list();
  const folders = boxes.map((b) => b.path).filter((p: string) => !/trash|spam|junk|deleted/i.test(p));
  let serverTotal = 0; let dbTotal = 0;
  const gaps: string[] = [];
  for (const path of folders) {
    let serverN = 0;
    try {
      const lock = await client.getMailboxLock(path);
      try { serverN = (await client.search({ since }, { uid: true }) || []).length; }
      finally { lock.release(); }
    } catch (e: any) { gaps.push(`${path}: 서버 조회 실패 ${String(e?.message || e).slice(0, 40)}`); continue; }
    const dbN = await I.countDocuments({ accountId: { $in: ids }, folder: path, date: { $gte: since } });
    serverTotal += serverN; dbTotal += dbN;
    const mark = serverN === dbN ? '　' : (dbN < serverN ? '⚠' : '·');
    if (serverN || dbN) console.log(`  ${mark} ${path.padEnd(34)} 서버 ${String(serverN).padStart(5)} · DB ${String(dbN).padStart(5)}${serverN !== dbN ? `  (차이 ${dbN - serverN})` : ''}`);
    if (dbN < serverN) gaps.push(`${path}: ${serverN - dbN}통 덜 가져옴`);
  }
  console.log(`\n  합계 — 서버 ${serverTotal}통 · DB ${dbTotal}통`);
  if (!gaps.length) console.log('  ✅ 빠진 메일 없음');
  else { console.log(`  ⚠ 확인 필요 ${gaps.length}건:`); gaps.slice(0, 12).forEach((g) => console.log('    - ' + g)); }
});
await mongoose.disconnect();
