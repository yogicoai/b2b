/** 테스트 발송 계정 지정 — 대량 발송을 대표 주소가 아닌 개발 주소로 나가게 한다. */
import mongoose from 'mongoose';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
const target = process.argv[2] || 'fe@yogico.kr';
await mongoose.connect(uri);
const A = mongoose.connection.db.collection('mailaccounts');
await A.updateMany({}, { $set: { isTestSender: false } });
const r = await A.updateOne({ $or:[{fromAddress:target},{smtpUser:target}] }, { $set: { isTestSender: true } });
console.log(r.modifiedCount ? `테스트 발송 계정 = ${target}` : `⚠️ ${target} 계정을 찾지 못했습니다`);
for (const a of await A.find({}).toArray())
  console.log('  ', String(a.accountName).padEnd(16), (a.fromAddress||a.smtpUser).padEnd(20),
              '| 기본(수신·답장):', a.isDefault ? 'O' : '-', '| 테스트 발송:', a.isTestSender ? 'O' : '-');
await mongoose.disconnect();
