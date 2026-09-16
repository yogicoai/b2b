/**
 * 보낸 메일에 잘못 찍힌 '회신 필요'·기한을 걷어낸다 (수집 규칙도 함께 고쳤다).
 * AI 분석이 아니라 수집 때 도는 로컬 분석이 붙인 값만 대상으로 한다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
const APPLY = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');
const f = { direction: 'out', $or: [{ 'analysis.needsReply': true }, { 'analysis.deadline': { $ne: null, $exists: true } }] };
console.log('대상 보낸 메일', await M.countDocuments(f), '통 (방법별:', JSON.stringify(await M.aggregate([{ $match: f }, { $group: { _id: '$analysis.method', n: { $sum: 1 } } }]).toArray()), ')');
if (APPLY) {
  const r = await M.updateMany(f, { $set: { 'analysis.needsReply': false, 'analysis.deadline': null } });
  console.log('정리', r.modifiedCount, '통 · 남은 것', await M.countDocuments(f));
}
await mongoose.disconnect();
