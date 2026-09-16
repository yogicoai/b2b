import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection;
const names = (await db.db.listCollections().toArray()).map(c=>c.name).sort();
console.log('── 컬렉션 ──');
for (const n of names) console.log(`  ${n.padEnd(24)} ${await db.collection(n).countDocuments({})}`);

const L = db.collection('leads');
const one = await L.findOne({ translation: { $exists: true, $ne: null } });
console.log('\n translation 예시:', one ? JSON.stringify(one.translation).slice(0,160) : '없음');
const h = await L.findOne({ emailHistory: { $exists: true, $ne: [] } });
console.log(' emailHistory 예시:', h ? JSON.stringify(h.emailHistory).slice(0,220) : '없음');
console.log('\n translation 있는 리드:', await L.countDocuments({translation:{$exists:true,$ne:null}}));
console.log(' emailHistory 있는 리드:', await L.countDocuments({emailHistory:{$exists:true,$ne:[]}}));
await mongoose.disconnect();
