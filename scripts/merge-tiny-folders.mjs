/**
 * 자동 배치로 생긴 잔챙이 폴더를 '· 기타' 로 합친다.
 *
 * 대표가 손으로 나눠둔 폴더(groupBy 가 folder/sender/name)는 건드리지 않는다.
 * 자동 배치(groupBy: auto:*)로 생긴 것만 대상이다.
 */
import mongoose from 'mongoose';
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const MIN = 5;
const MISC = '· 기타';
const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
await mongoose.connect(uri);
const M = mongoose.connection.db.collection('inboundmails');

const rows = await M.aggregate([
  { $match: { groupBy: /^auto:sender-domain/, trashedAt: null } },
  { $group: { _id: '$group', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();

const tiny = rows.filter(r => r.n < MIN);
console.log(`자동 생성 폴더 ${rows.length}개 중 ${MIN}통 미만 ${tiny.length}개를 '${MISC}' 로 합칩니다\n`);
for (const r of rows) console.log('  ', String(r._id).padEnd(22), r.n, '통', r.n < MIN ? '→ · 기타' : '(유지)');

if (!APPLY) { console.log('\n[미적용] --apply'); await mongoose.disconnect(); process.exit(0); }
const res = await M.updateMany(
  { groupBy: /^auto:sender-domain/, group: { $in: tiny.map(t => t._id) } },
  { $set: { group: MISC, groupBy: 'auto:misc' } },
);
console.log('\n합침:', res.modifiedCount, '통');
console.log('\n=== 정리 후 폴더 ===');
for (const r of await M.aggregate([
  { $match: { group: { $nin: ['', null] }, trashedAt: null } },
  { $group: { _id: '$group', n: { $sum: 1 } } }, { $sort: { n: -1 } },
]).toArray()) console.log('  ', String(r._id).padEnd(28), r.n, '통');
await mongoose.disconnect();
