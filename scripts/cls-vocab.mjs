import mongoose from 'mongoose';
import { config } from 'dotenv';
config({path:'.env.local',quiet:true});
await mongoose.connect(process.env.MONGODB_URI);
const M=mongoose.connection.collection('inboundmails');
const a=await M.aggregate([{$match:{trashedAt:null}},{$group:{_id:{c:'$classification',by:'$classifiedBy'},n:{$sum:1}}},{$sort:{n:-1}}]).toArray();
console.log('분류값 × 판정주체:');
for(const r of a) console.log(`  ${String(r._id.c||'(없음)').padEnd(12)} ${String(r._id.by||'-').padEnd(20)} ${r.n}통`);
await mongoose.disconnect();
