/**
 * Type(자유 문장)을 필터 가능한 Category 몇 개로 접는다.
 * Type 자체는 엑셀 컬럼이므로 손대지 않고, Category 를 새로 채운다.
 *
 * 우선순위가 중요하다. "Distributor / Retail Chain (자체 브랜드 제조·유통…)" 처럼
 * 여러 성격이 섞인 값이 많은데, 클라이언트가 찾는 축이 '유통사'라서 유통을 먼저 본다.
 */
import mongoose from 'mongoose';
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
await mongoose.connect(uri);
const L = mongoose.connection.db.collection('leads');

const RULES = [
  ['Distributor',        /distribut|도매|유통사|wholesale/i],
  ['Brand/Manufacturer', /manufactur|brand|제조|자사\s*브랜드|oem|odm/i],
  ['Clinic',             /clinic|클리닉|derma(tology)?\s*clinic|spa\b/i],
  ['Retail Chain',       /retail\s*chain|체인|drugstore|드럭스토어|pharmac|파라파마|perfumer|백화점/i],
  ['Online Store',       /online|e-?commerce|e-?tailer|웹샵|온라인|webshop|web\s*shop/i],
  ['Retailer',           /concept\s*store|편집|retail|store|shop|리테일/i],
];
const categorize = (t) => {
  const s = String(t || '');
  if (!s.trim()) return 'Other';
  for (const [cat, rx] of RULES) if (rx.test(s)) return cat;
  return 'Other';
};

const leads = await L.find({}, { projection: { leadId: 1, Type: 1, Company: 1, stage: 1 } }).toArray();
const counts = {};
const ops = [];
for (const l of leads) {
  const c = categorize(l.Type);
  counts[c] = (counts[c] || 0) + 1;
  ops.push({ updateOne: { filter: { _id: l._id }, update: { $set: { Category: c } } } });
}
console.log(`전체 ${leads.length}건 분류 결과`);
for (const [k, v] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) console.log('  ', k.padEnd(20), v);

console.log('\n발송대기(410) 기준:');
const vCounts = {};
for (const l of leads.filter(l => l.stage === 'verified')) {
  const c = categorize(l.Type);
  vCounts[c] = (vCounts[c] || 0) + 1;
}
for (const [k, v] of Object.entries(vCounts).sort((a,b)=>b[1]-a[1])) console.log('  ', k.padEnd(20), v);

console.log('\n기타로 빠진 것 예시:');
for (const l of leads.filter(l => l.stage==='verified' && categorize(l.Type)==='Other').slice(0,8))
  console.log('   ', (l.Company||'').slice(0,34).padEnd(36), '|', String(l.Type||'(비어있음)').slice(0,44));

if (!APPLY) { console.log('\n[미적용] --apply 로 기록'); await mongoose.disconnect(); process.exit(0); }
for (let i = 0; i < ops.length; i += 500) await L.bulkWrite(ops.slice(i, i + 500));
console.log('\n기록 완료');
await mongoose.disconnect();
