/**
 * 받은 메일 분석 상태를 센다.
 *
 * ⚠️ analysis.summary 가 있다고 AI 가 분석한 것이 아니다.
 *    수집할 때 로컬 분석(무료)이 "기한 명시", "질문 1개" 같은 한 줄을 summary 에
 *    먼저 채운다. 진짜 AI 분석은 analysis.method === 'ai' 로만 가려진다.
 *    (analyze 라우트도 이 값으로 대상을 고른다)
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');
const ALIVE = { trashedAt: null };
const IN = { ...ALIVE, direction: { $ne: 'out' } };
/** analyze 라우트의 대상 조건과 같게 */
const TARGET = { ...IN, classification: { $nin: ['ad', 'system'] }, 'analysis.method': { $ne: 'ai' } };

const kst = (d) => new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const latest = await M.find(IN).sort({ date: -1 }).limit(1).project({ date: 1, subject: 1 }).toArray();

console.log(`받은 메일 (휴지통 제외)       ${await M.countDocuments(IN)}`);
console.log(`  진짜 AI 분석 (method=ai)    ${await M.countDocuments({ ...IN, 'analysis.method': 'ai' })}`);
console.log(`  로컬 분석만                 ${await M.countDocuments({ ...IN, 'analysis.method': { $ne: 'ai' }, 'analysis.summary': { $exists: true } })}`);
console.log(`  AI 분석 대상 (광고·자동 제외) ${await M.countDocuments(TARGET)}`);
console.log(`  가장 최근 메일: ${latest[0] ? kst(latest[0].date) + ' · ' + String(latest[0].subject).slice(0, 40) : '-'}`);

const byDay = await M.aggregate([
  { $match: TARGET },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Seoul' } }, n: { $sum: 1 } } },
  { $sort: { _id: -1 } }, { $limit: 12 },
]).toArray();
console.log('\n분석 대상 날짜별 (최근 12일):');
for (const d of byDay) console.log(`  ${d._id}  ${d.n}통`);
await mongoose.disconnect();
