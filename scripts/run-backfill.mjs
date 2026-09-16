/**
 * [📥 전체 메일함 2달 가져오기] 를 서버에서 끝까지 돌린다 (화면 없이).
 * 사용: node scripts/run-backfill.mjs --user=david [--account=<id>] [--days=60]
 * 화면에서 누르는 것과 같은 API(/api/mail/backfill)를 done 이 올 때까지 이어 부른다.
 */
import { SignJWT } from 'jose';
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const user = arg('user', 'admin');
const days = Number(arg('days', 60));
let accountId = arg('account', '');

await mongoose.connect(process.env.MONGODB_URI);
const A = mongoose.connection.db.collection('mailaccounts');
if (!accountId) {
  const own = await A.find({ owner: user, isActive: { $ne: false } }).toArray();
  if (!own.length) { console.error(`${user} 아이디로 등록된 메일 계정이 없습니다`); process.exit(1); }
  accountId = String(own[0]._id);
  console.log(`대상: ${own[0].accountName} (${own[0].smtpUser}) · ${user} 아이디`);
}
const jwt = await new SignJWT({ user, role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(process.env.JWT_SECRET));

let cursor = null;
const t0 = Date.now();
const totals = { fetched: 0, inserted: 0, duplicate: 0, matched: 0, errors: [] };
for (let round = 1; round <= 400; round++) {
  const t = Date.now();
  const r = await fetch('http://localhost:3000/api/mail/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `admin_session=${jwt}` },
    body: JSON.stringify({ accountId, days, cursor }),
  }).then((x) => x.json());
  if (!r.success) { console.error('실패:', r.error); break; }
  totals.fetched += r.fetched; totals.inserted += r.inserted; totals.duplicate += r.duplicate; totals.matched += r.matched;
  if (r.errors?.length) totals.errors.push(...r.errors);
  const c = r.cursor;
  const prog = c ? Object.entries(c.progress || {}).map(([f, p]) => `${f.replace(/^INBOX[./]/, '')} ${p.done}/${p.total}`).slice(-2).join(' · ') : '';
  console.log(`${String(round).padStart(3)} ${((Date.now() - t) / 1000).toFixed(0).padStart(3)}초 · 새로 ${String(totals.inserted).padStart(4)} · 중복 ${String(totals.duplicate).padStart(4)}` +
    (c ? ` · 폴더 ${c.folderIndex + 1}/${c.folders.length} · ${prog}` : ' · 완료'));
  if (r.done) break;
  cursor = c;
}
console.log(`\n끝 — ${((Date.now() - t0) / 60000).toFixed(1)}분 · 새로 ${totals.inserted}통 · 이미 있던 ${totals.duplicate}통 · 업체 연결 ${totals.matched}건`);
if (totals.errors.length) console.log(`오류 ${totals.errors.length}건:`, totals.errors.slice(0, 5).join(' | '));
const acc = await A.findOne({ _id: new mongoose.Types.ObjectId(accountId) }, { projection: { backfilledAt: 1 } });
console.log('완료 표시:', acc?.backfilledAt ? new Date(acc.backfilledAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '없음');
await mongoose.disconnect();
