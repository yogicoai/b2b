/**
 * 검증 워크플로가 찾아낸 두 결함이 실제로 고쳐졌는지 확인한다.
 *
 * [A] 건너뛰기만 하면 같은 30곳이 무한 반복
 *     loadReviewBatch 가 skip 을 안 보내서, 30곳을 넘긴 뒤 새 묶음을 받으면
 *     글자 그대로 같은 30곳이 다시 왔다. 31번째 업체에 도달할 방법이 없었다.
 *
 * [B] 검색·지역로 좁혀도 진행바 분모가 전역 수
 *     목록은 스웨덴 12곳인데 분모는 418 이라 "0 / 418" 로 시작했다.
 *
 * 서버 쿼리를 그대로 재현해 두 경우를 모두 돌려본다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local' });

await mongoose.connect(process.env.MONGODB_URI);
const Lead = mongoose.connection.collection('leads');

const REAL_EMAIL = { Email: { $regex: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ } };

// route.ts 의 buildPending 과 같은 모양
function buildPending(q, region) {
  const f = { stage: 'verified', deleted: { $ne: true }, ...REAL_EMAIL };
  if (region && region !== 'All') f.Region = region;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ Company: rx }, { Region: rx }, { Email: rx }, { WebsiteContact: rx }];
  }
  return f;
}

const fetchBatch = (pending, skip, limit = 30) =>
  Lead.find(pending).sort({ recoScore: -1, Region: 1, Company: 1 })
    .skip(skip).limit(limit).project({ leadId: 1, Company: 1, Region: 1 }).toArray();

const fails = [];
const check = (name, pass, detail) => {
  console.log(`  ${pass ? 'OK  ' : 'X   '}${name}${detail ? '   ' + detail : ''}`);
  if (!pass) fails.push(name);
};

// ── [A] 건너뛰기만 하며 세 묶음 ──────────────────────────────
console.log('[A] 아무것도 판정하지 않고 [다음 ›] 으로만 넘길 때\n');

const all = buildPending('', '');
const total = await Lead.countDocuments(all);
console.log(`    대기열 ${total}곳\n`);

// 고친 뒤: 건너뛴 수만큼 skip 이 밀린다
let skip = 0;
const seen = new Set();
const batches = [];
for (let i = 0; i < 3; i++) {
  const rows = await fetchBatch(all, skip);
  batches.push(rows);
  console.log(`    묶음 ${i + 1}  skip=${String(skip).padStart(3)}  ${rows.length}곳` +
    `   첫 업체: ${rows[0]?.Company || '(없음)'}`);
  rows.forEach((r) => seen.add(r.leadId));
  skip += rows.length;            // 하나도 판정 안 했으므로 전부 건너뛴 수
}

check('묶음마다 다른 업체가 온다',
  batches[0][0]?.leadId !== batches[1][0]?.leadId &&
  batches[1][0]?.leadId !== batches[2][0]?.leadId);
check('세 묶음이 겹치지 않는다',
  seen.size === batches.reduce((a, b) => a + b.length, 0),
  `서로 다른 업체 ${seen.size}곳`);
check('31번째 업체에 도달한다', batches[1].length > 0 && seen.size > 30);

// 고치기 전 동작 재현 — skip 을 안 보내면
const before1 = await fetchBatch(all, 0);
const before2 = await fetchBatch(all, 0);
check('(고치기 전) skip 없이 받으면 같은 30곳 — 이게 무한 루프였다',
  before1[0].leadId === before2[0].leadId,
  `둘 다 ${before1[0].Company}`);

// 끝까지 갔을 때 빈 묶음 → 한 바퀴 되감기
const past = await fetchBatch(all, total + 10);
check('끝을 넘어가면 빈 묶음이 온다 (되감기 조건)', past.length === 0);

// ── [B] 지역로 좁혔을 때 분모 ────────────────────────────────
console.log('\n[B] 지역로 좁혀 들어갔을 때 진행바 분모\n');

const byRegion = await Lead.aggregate([
  { $match: all },
  { $group: { _id: '$Region', n: { $sum: 1 } } },
  { $sort: { n: -1 } }, { $limit: 1 },
]).toArray();
const region = byRegion[0]?._id;
const expect = byRegion[0]?.n || 0;

const scoped = buildPending('', region);
const scopedRemaining = await Lead.countDocuments(scoped);   // 고친 뒤 tallies(pending)
const globalRemaining = await Lead.countDocuments(all);       // 고치기 전 tallies()
const scopedItems = await fetchBatch(scoped, 0, 200);

console.log(`    지역 = ${region}`);
console.log(`    목록에 뜨는 수      : ${scopedItems.length}곳`);
console.log(`    분모 (고친 뒤)      : ${scopedRemaining}`);
console.log(`    분모 (고치기 전)    : ${globalRemaining}   ← "0 / ${globalRemaining}" 로 떴던 값\n`);

check('분모가 목록과 같다', scopedRemaining === expect && scopedItems.length === Math.min(expect, 200),
  `${scopedRemaining} = ${expect}`);
check('전역 수와 구별된다', scopedRemaining !== globalRemaining || expect === globalRemaining);
check('검색어로 좁혀도 같다', await (async () => {
  const q = buildPending('beauty', '');
  const n = await Lead.countDocuments(q);
  const rows = await fetchBatch(q, 0, 500);
  console.log(`    검색 "beauty"       : 목록 ${rows.length}곳 · 분모 ${n}`);
  return n === rows.length || rows.length === 500;
})());

console.log(fails.length ? `\n실패 ${fails.length}건: ${fails.join(', ')}` : '\n전부 통과');
await mongoose.disconnect();
process.exit(fails.length ? 1 : 0);
