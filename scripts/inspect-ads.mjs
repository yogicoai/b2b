import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path:'.env.local', quiet:true });
await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');
const rows = await M.find({
  trashedAt:null, direction:'in',
  classification:{ $in:['ad','system','newsletter'] },
  group:{ $ne:'광고·자동발송' },
}).project({subject:1,from:1,group:1,groupBy:1,classification:1,classifiedBy:1,receivedAt:1,date:1}).toArray();

console.log(`광고 폴더 밖 광고성 메일 ${rows.length}통\n`);
for (const r of rows) {
  const d = (r.receivedAt||r.date||'').toString().slice(0,10);
  console.log(`[${String(r.classification).padEnd(10)}] ${d}  ${String(r.group||'미분류').padEnd(22)} (${r.groupBy||'-'}/${r.classifiedBy||'-'})`);
  console.log(`     보낸이: ${r.from?.address || r.from || '?'}`);
  console.log(`     제목  : ${String(r.subject||'').slice(0,72)}\n`);
}
await mongoose.disconnect();
