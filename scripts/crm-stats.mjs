import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection;
const L = db.collection('leads'), M = db.collection('inboundmails'),
      S = db.collection('emailschedules'), T = db.collection('emailtemplates'),
      A = db.collection('mailaccounts'), U = db.collection('users');

const stage = await L.aggregate([{$match:{deleted:{$ne:true}}},{$group:{_id:'$stage',n:{$sum:1}}},{$sort:{n:-1}}]).toArray();
console.log('── 리드 단계별 ──');
for (const s of stage) console.log(`  ${String(s._id||'(없음)').padEnd(14)} ${String(s.n).padStart(6)}`);
console.log(`  ${'합계'.padEnd(13)} ${String(await L.countDocuments({deleted:{$ne:true}})).padStart(6)}`);

console.log('\n── 메일 ──');
console.log(`  수신 메일 총     ${await M.countDocuments({trashedAt:null})}`);
console.log(`  폴더(거래처) 수  ${(await M.distinct('group',{trashedAt:null,group:{$nin:[null,'']}})).length}`);
console.log(`  대화(스레드) 수  ${(await M.distinct('threadKey',{trashedAt:null})).length}`);
console.log(`  발송 예약 건     ${await S.countDocuments({})}`);
console.log(`  메일 양식        ${await T.countDocuments({})}`);
console.log(`  보내는 계정      ${await A.countDocuments({})}`);
console.log(`  사용자 계정      ${await U.countDocuments({})}`);

const trans = await L.countDocuments({deleted:{$ne:true},'translation.body':{$exists:true,$ne:null}});
console.log(`\n  AI 번역 완료 리드 ${trans}`);
const sent = await L.countDocuments({deleted:{$ne:true},'emailHistory.status':'sent'});
console.log(`  실제 메일 나간 곳 ${sent}`);
await mongoose.disconnect();
