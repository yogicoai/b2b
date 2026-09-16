/**
 * MongoDB 저장 공간을 **무엇이 차지하고 있는지** 한 눈에 본다 (무료 512MB 를 지키기 위한 계기판).
 *
 * 사용: node scripts/db-space.mjs
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const stats = await db.stats();
const used = stats.dataSize + (stats.indexSize || 0);
console.log(`이 DB 합계 ${mb(used)} (데이터 ${mb(stats.dataSize)} + 색인 ${mb(stats.indexSize || 0)})`);
console.log(`무료 한도 512MB 는 **계정의 모든 DB 를 합친 값**입니다 — 다른 프로젝트 DB 도 같이 셉니다.\n`);

const cols = await db.listCollections().toArray();
const rows = [];
for (const c of cols) {
  try {
    const s = await db.command({ collStats: c.name });
    rows.push({ name: c.name, n: s.count || 0, data: s.size || 0, idx: s.totalIndexSize || 0, avg: s.avgObjSize || 0 });
  } catch { /* 권한 없는 시스템 컬렉션은 건너뛴다 */ }
}
rows.sort((a, b) => (b.data + b.idx) - (a.data + a.idx));
console.log('컬렉션별:');
for (const r of rows.slice(0, 12)) {
  console.log(`  ${r.name.padEnd(22)} ${String(r.n).padStart(7)}건 · 데이터 ${mb(r.data).padStart(8)} · 색인 ${mb(r.idx).padStart(8)} · 평균 ${(r.avg / 1024).toFixed(1)}KB`);
}

// 메일 본문이 얼마나 차지하나 — 줄일 수 있는 여지를 본다
const I = db.collection('inboundmails');
const agg = await I.aggregate([
  {
    $project: {
      date: 1, accountId: 1, folder: 1, uid: 1, rawTruncated: 1,
      htmlLen: { $strLenBytes: { $ifNull: ['$raw.html', ''] } },
      textLen: { $strLenBytes: { $ifNull: ['$raw.text', ''] } },
      stripLen: { $strLenBytes: { $ifNull: ['$bodyStripped', ''] } },
    },
  },
  {
    $group: {
      _id: null,
      n: { $sum: 1 },
      html: { $sum: '$htmlLen' },
      text: { $sum: '$textLen' },
      strip: { $sum: '$stripLen' },
      bigHtml: { $sum: { $cond: [{ $gt: ['$htmlLen', 4000] }, 1, 0] } },
      bigText: { $sum: { $cond: [{ $gt: ['$textLen', 4000] }, 1, 0] } },
    },
  },
]).toArray();
const a = agg[0] || {};
console.log(`\n메일 본문: 전체 ${a.n}통 · HTML ${mb(a.html || 0)} · 텍스트 ${mb(a.text || 0)} · 인용제거본 ${mb(a.strip || 0)}`);
console.log(`  본문이 아직 큰 메일: HTML 있는 것 ${a.bigHtml}통 · 텍스트 4천자 넘는 것 ${a.bigText}통`);

// 되찾아올 수 없는 메일 = 지우면 영영 없어진다
const noPlace = await I.countDocuments({ $or: [{ folder: { $in: ['', null] } }, { uid: { $in: [0, null] } }] });
const accts = await db.collection('mailaccounts').find({}, { projection: { _id: 1 } }).toArray();
const liveIds = accts.map((x) => String(x._id));
const orphan = await I.countDocuments({ accountId: { $nin: liveIds } });
console.log(`  ⚠ 위치 정보(folder/uid)가 없어 다시 못 받아올 메일 ${noPlace}통`);
console.log(`  ⚠ 등록된 계정에 안 붙은 메일 ${orphan}통 — 이것도 본문을 비우면 영영 못 봅니다`);

const cut = new Date(Date.now() - 14 * 86400000);
const trimmable = await I.countDocuments({
  date: { $lt: cut },
  accountId: { $in: liveIds },
  folder: { $nin: ['', null] }, uid: { $nin: [0, null] },
  $or: [{ 'raw.html': { $nin: ['', null] } }, { rawTruncated: { $ne: true } }],
});
console.log(`\n안전하게 비울 수 있는 것(14일 지남 + 서버에서 다시 받아올 수 있음): ${trimmable}통`);
await mongoose.disconnect();
