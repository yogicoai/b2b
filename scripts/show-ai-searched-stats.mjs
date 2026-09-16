import 'dotenv/config';
import mongoose from 'mongoose';
const URI = process.env.MONGODB_URI;
await mongoose.connect(URI);
const Lead = mongoose.connection.db.collection('leads');

const total = await Lead.countDocuments({ stage: 'ai-searched' });
console.log(`\n=== 🤖 AI 서칭 stage 총 ${total}건 ===\n`);

const byRegion = await Lead.aggregate([
  { $match: { stage: 'ai-searched' } },
  { $group: { _id: '$Region', n: { $sum: 1 }, withEmail: { $sum: { $cond: [{ $and: [{ $ne: ['$Email', ''] }, { $ne: ['$Email', null] }] }, 1, 0] } } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('지역별 (총 · 이메일 있음):');
byRegion.forEach(c => console.log(`  ${(c._id || 'none').padEnd(20)} ${String(c.n).padStart(3)} · ${c.withEmail}`));

const seedCheck = await Lead.find({ stage: 'ai-searched', $or: [{ WebsiteContact: /dermaofficial/i }, { WebsiteContact: /venuseurope/i }, { Company: /venus europe/i }, { Company: /derma official/i }] }).project({ Company: 1, Region: 1, WebsiteContact: 1, Email: 1 }).toArray();
console.log('\n=== 시드 URL 확인 ===');
seedCheck.forEach(d => console.log(`  ✅ [${d.Region}] ${d.Company} — ${d.WebsiteContact} — ${d.Email || 'no-email'}`));

const emailCoverage = await Lead.aggregate([
  { $match: { stage: 'ai-searched' } },
  { $group: { _id: null, total: { $sum: 1 }, withEmail: { $sum: { $cond: [{ $and: [{ $ne: ['$Email', ''] }, { $ne: ['$Email', null] }] }, 1, 0] } }, withBrands: { $sum: { $cond: [{ $ne: ['$BrandsChannels', ''] }, 1, 0] } } } },
]).toArray();
const c = emailCoverage[0];
console.log(`\n=== 커버리지 ===`);
console.log(`  이메일 있음: ${c.withEmail}/${c.total} (${Math.round(c.withEmail/c.total*100)}%)`);
console.log(`  브랜드 정보 있음: ${c.withBrands}/${c.total} (${Math.round(c.withBrands/c.total*100)}%)`);

await mongoose.disconnect();
