/** 광고 폴더 안에 진짜 업무 메일이 잘못 들어가 있지 않은지 본다. */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path:'.env.local', quiet:true });
await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');
const AD='광고·자동발송';
const inAd = await M.find({ trashedAt:null, group:AD })
  .project({subject:1,from:1,classification:1,classifiedBy:1,receivedAt:1,date:1,direction:1}).toArray();
console.log(`광고 폴더 안 ${inAd.length}통\n`);
const byCls = {};
for (const r of inAd) byCls[r.classification||'?'] = (byCls[r.classification||'?']||0)+1;
console.log('종류별:', JSON.stringify(byCls), '\n');

// 업무 메일일 가능성이 있는 신호 — 답장 접두어, 우리 회사명, 사람 도메인
const SUS = /\b(re|fw|fwd)\s*:|yogi|osstem|vussen|soosul|kaine|moq|quotation|invoice|contract|proposal|partnership|샘플|견적|계약/i;
const sus = inAd.filter(r => SUS.test(String(r.subject||'')));
console.log(`업무 메일일 수 있는 것 ${sus.length}통:`);
for (const r of sus.slice(0,25)) {
  console.log(`  [${String(r.classification).padEnd(10)}/${String(r.classifiedBy||'-').padEnd(4)}] ${String(r.from?.address||'?').padEnd(34)} ${String(r.subject||'').slice(0,56)}`);
}
await mongoose.disconnect();
