import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const dbConnect = (await import('./src/lib/mongodb')).default;
const mongoose = (await import('mongoose')).default;
await dbConnect();
console.log('앱이 붙은 DB: ' + mongoose.connection.db!.databaseName + ' @ ' + mongoose.connection.host);
const { Lead } = await import('./src/models/Lead');
const { InboundMail } = await import('./src/models/InboundMail');
const { EmailSchedule } = await import('./src/models/EmailSchedule');
console.log(`리드 ${await Lead.countDocuments()} · 받은메일 ${await InboundMail.countDocuments()} · 예약 ${await EmailSchedule.countDocuments()}`);
process.exit(0);
