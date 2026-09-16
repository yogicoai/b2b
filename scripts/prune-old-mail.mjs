/**
 * 오래된 메일을 **나중에 쌓였을 때 정리한다** (2026-09-16, 대표님 방침).
 *
 * 방침: 2달 지난 메일은 **새로 불러오지 않는다**(lib/mail/retention.ts KEEP_DAYS).
 *       이미 들어와 있는 것은 그냥 둔다. 너무 쌓이면 그때 이 도구로 정리한다.
 *
 * 이 도구는 **함부로 지우지 않는다**:
 *   · 업체(리드)에 연결된 메일은 남긴다 — 지우면 [대화 진행 중]·[파트너십 확정] 의 대화 이력이 끊긴다
 *   · 우리가 보낸 메일은 남긴다 — 무엇을 보냈는지가 사라지면 안 된다
 *   · 답장·문의(b2b·inquiry·partner)는 남긴다
 *   · 지우는 것은 **광고·자동발송·뉴스레터, 그리고 아무 데도 연결되지 않은 오래된 메일**뿐이다
 *
 * 지우기 전에 목록을 backups/ 에 남긴다. 메일 서버(이카운트)에는 원본이 그대로 있다.
 *
 * 보기만:  node scripts/prune-old-mail.mjs [--days=60]
 * 실제로:  node scripts/prune-old-mail.mjs [--days=60] --apply
 *   --noise-only  광고·자동발송만 지운다 (가장 안전)
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k, d = '') => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const APPLY = process.argv.includes('--apply');
const NOISE_ONLY = process.argv.includes('--noise-only');
const DAYS = Number(arg('days', '60')) || 60;
const NOISE = ['ad', 'system', 'newsletter'];
const KEEP_CLASS = ['b2b', 'inquiry', 'partner'];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const I = db.collection('inboundmails');
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
const cut = new Date(Date.now() - DAYS * 86400000);

const size = async (filter) => {
  const [r] = await I.aggregate([
    { $match: filter },
    { $group: { _id: null, n: { $sum: 1 }, b: { $sum: { $add: [
      { $strLenBytes: { $ifNull: ['$raw.html', ''] } },
      { $strLenBytes: { $ifNull: ['$raw.text', ''] } },
      { $strLenBytes: { $ifNull: ['$bodyStripped', ''] } },
    ] } } } },
  ]).toArray();
  return { n: r?.n || 0, b: r?.b || 0 };
};

const st = await db.command({ collStats: 'inboundmails' });
const all = await I.countDocuments({});
const older = await size({ date: { $lt: cut } });
console.log(`메일 ${all}통 · 컬렉션 ${mb(st.size)}`);
console.log(`${DAYS}일 지난 메일 ${older.n}통 (본문 ${mb(older.b)})\n`);

// ── 남길 것 / 지울 것 ──
const keepFilter = {
  date: { $lt: cut },
  $or: [
    { leadId: { $nin: ['', null] } },              // 업체와 연결됨
    { direction: 'out' },                          // 우리가 보낸 것
    { classification: { $in: KEEP_CLASS } },       // 실제 거래·문의
    { status: { $in: ['replied', 'reviewing'] } }, // 손을 댄 것
  ],
};
const dropFilter = NOISE_ONLY
  ? { date: { $lt: cut }, classification: { $in: NOISE }, leadId: { $in: ['', null] }, direction: { $ne: 'out' } }
  : { date: { $lt: cut }, $nor: [keepFilter] };

const keep = await size(keepFilter);
const drop = await size(dropFilter);
const byCls = await I.aggregate([
  { $match: dropFilter },
  { $group: { _id: '$classification', n: { $sum: 1 } } }, { $sort: { n: -1 } },
]).toArray();

console.log(`남길 것  ${keep.n}통 — 업체 연결 · 우리가 보낸 것 · 거래/문의 · 손댄 것`);
console.log(`지울 것  ${drop.n}통 (본문 ${mb(drop.b)})${NOISE_ONLY ? ' · 광고·자동발송만' : ''}`);
if (byCls.length) console.log(`  분류별 ${byCls.map((c) => `${c._id || '(없음)'} ${c.n}`).join(' · ')}`);
const sample = await I.find(dropFilter, { projection: { subject: 1, date: 1, 'from.address': 1, classification: 1 } })
  .sort({ date: 1 }).limit(5).toArray();
sample.forEach((s) => console.log(`   ${new Date(s.date).toLocaleDateString('ko-KR')} [${s.classification}] ${String(s.subject).slice(0, 40)} ← ${s.from?.address || ''}`));

if (!drop.n) { console.log('\n지울 것이 없습니다.'); await mongoose.disconnect(); process.exit(0); }
if (!APPLY) {
  console.log('\n(보기만 했습니다 — 실제로 지우려면 --apply, 광고만 지우려면 --noise-only 도 함께)');
  await mongoose.disconnect();
  process.exit(0);
}

fs.mkdirSync('backups', { recursive: true });
const path = `backups/pruned-mail-${new Date().toISOString().slice(0, 10)}.json`;
const list = await I.find(dropFilter, { projection: { messageId: 1, subject: 1, date: 1, from: 1, folder: 1, uid: 1, accountId: 1, classification: 1 } }).toArray();
fs.writeFileSync(path, JSON.stringify(list, null, 1));
const r = await I.deleteMany(dropFilter);
const after = await db.command({ collStats: 'inboundmails' });
console.log(`\n지움 ${r.deletedCount}통 · 목록 ${path}`);
console.log(`컬렉션 ${mb(st.size)} → ${mb(after.size)}`);
console.log('원본은 이카운트 메일 서버에 그대로 있습니다.');
await mongoose.disconnect();
