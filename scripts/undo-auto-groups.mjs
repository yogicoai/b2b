/**
 * 내가 임의로 만든 폴더 배치를 되돌린다.
 *
 * 학습(발신자 이력·제목 매칭)으로 잡은 것은 그대로 두고,
 * 자동 배치(groupBy: auto:*)로 넣은 것만 미분류로 돌린다.
 * 애매한 것은 사람이 직접 옮기는 게 맞다.
 */
import mongoose from 'mongoose';
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
await mongoose.connect(uri);
const M = mongoose.connection.db.collection('inboundmails');

const rows = await M.aggregate([
  { $match: { groupBy: /^auto:/, trashedAt: null } },
  { $group: { _id: { g:'$group', by:'$groupBy' }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('자동 배치로 넣었던 것 → 미분류로 되돌림\n');
let tot = 0;
for (const r of rows) { tot += r.n; console.log('  ', String(r._id.g).padEnd(20), String(r._id.by).padEnd(20), r.n, '통'); }
console.log('  합계', tot, '통');

if (!APPLY) { console.log('\n[미적용] --apply'); await mongoose.disconnect(); process.exit(0); }
const res = await M.updateMany({ groupBy: /^auto:/ }, { $set: { group: '', groupBy: '' } });
console.log('\n되돌림:', res.modifiedCount, '통');
console.log('\n=== 정리 후 폴더 (대표가 나눠둔 것만) ===');
for (const r of await M.aggregate([
  { $match: { group: { $nin: ['', null] }, trashedAt: null } },
  { $group: { _id: '$group', n: { $sum: 1 } } }, { $sort: { n: -1 } },
]).toArray()) console.log('  ', String(r._id).padEnd(28), r.n, '통');
console.log('  미분류:', await M.countDocuments({ $or:[{group:''},{group:null}], trashedAt:null }), '통');
await mongoose.disconnect();
