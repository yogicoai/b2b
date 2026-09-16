/**
 * AI 가 잘못 분류한 메일을 바로잡는다.
 *
 * classifiedBy 를 'manual' 로 박아야 이후 재분석이 다시 덮지 않는다
 * (InboundMail 주석: manual 이면 재분석이 덮지 않음).
 */
import mongoose from 'mongoose';
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
await mongoose.connect(uri);
const M = mongoose.connection.db.collection('inboundmails');

const FIXES = [
  { addr:'official@suelokorea.com', subj:/Dangaard/i, to:'b2b',
    why:'계약서 제10.4조 검토 의견에 대한 실제 회신 — 자동발송이 아니다' },
  { addr:'op@besko.kr', subj:/도착통지/, to:'b2b',
    why:'포워더 담당자가 직접 보낸 화물 도착통지 — 업무 처리가 필요한 실제 메일' },
];

for (const f of FIXES) {
  const docs = await M.find({ 'from.address':f.addr, subject:f.subj, classification:'system' }).toArray();
  console.log(`${f.addr} — ${docs.length}통`);
  for (const d of docs) console.log('   ', String(d.subject).slice(0,60), '→', f.to);
  if (APPLY && docs.length) {
    await M.updateMany(
      { _id: { $in: docs.map(d=>d._id) } },
      { $set: { classification:f.to, classifiedBy:'manual', reclassifiedAt:new Date(), reclassifyReason:f.why } },
    );
  }
}
if (!APPLY) { console.log('\n[미적용] --apply'); }
else {
  console.log('\n적용 완료');
  for (const r of await M.aggregate([{$match:{trashedAt:null}},{$group:{_id:'$classification',n:{$sum:1}}},{$sort:{n:-1}}]).toArray())
    console.log('  ', String(r._id).padEnd(12), r.n);
}
await mongoose.disconnect();
