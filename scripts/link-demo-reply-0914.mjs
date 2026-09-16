/**
 * 발표 시연용 (2026-09-14): fe@ 에서 보낸 답장 "RE: test" 를 Yogico Test Company 2 의 답장으로 연결하고
 * 그 업체를 [답장 받음] 으로 옮긴다. 우리 주소에서 온 메일이라 자동 연결은 되지 않으므로 손으로 연결한다.
 * 되돌리기: node scripts/link-demo-reply-0914.mjs --undo
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const M = db.collection('inboundmails');
const L = db.collection('leads');
const MAIL_ID = new mongoose.Types.ObjectId('6aa7994a2eceefc1b3e3ff40');
const LEAD = 'test-send-0914-2';

if (process.argv.includes('--undo')) {
  await M.updateOne({ _id: MAIL_ID }, { $set: { leadId: '', direction: 'out' }, $unset: { leadMatchedBy: '' } });
  await L.updateOne({ leadId: LEAD }, { $set: { stage: 'contacted', inboundCount: 0, needsReply: false } });
  console.log('되돌림');
  await mongoose.disconnect(); process.exit(0);
}

const mail = await M.findOne({ _id: MAIL_ID }, { projection: { subject: 1, date: 1, threadKey: 1 } });
if (!mail) { console.log('메일 없음'); process.exit(1); }
await M.updateOne({ _id: MAIL_ID }, { $set: { leadId: LEAD, leadMatchedBy: 'manual', direction: 'in', needsReplyDemo: true } });
const now = new Date().toISOString();
await L.updateOne(
  { leadId: LEAD },
  {
    $set: { stage: 'replied', stageChangedAt: now, lastInboundAt: new Date(mail.date).toISOString(), inboundCount: 1, needsReply: true },
    ...(mail.threadKey ? { $addToSet: { threadKeys: mail.threadKey } } : {}),
  },
);
const l = await L.findOne({ leadId: LEAD }, { projection: { Company: 1, stage: 1, inboundCount: 1 } });
console.log(`연결: "${mail.subject}" → ${l.Company} · 단계 ${l.stage} · 받은 답장 ${l.inboundCount}`);
await mongoose.disconnect();
