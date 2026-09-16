/**
 * 발송 테스트용 업체를 발송관리(발송 리스트, stage 'queued')에 넣는다 (2026-09-14).
 *
 * 받는 주소는 fe@yogico.kr — 우리 메일함이라 실제로 나가도 바깥 업체에 닿지 않는다.
 * 보내는 쪽은 앱 규칙대로 대표 계정(david@)이다.
 *
 * 예전 테스트 업체(lead-test-1787215511)는 발송 기록이 남은 채 삭제 표시돼 있어
 * 되살리지 않고 새로 만든다 — 발송 기록이 없어야 48시간·3회 제한에 안 걸린다.
 * 다시 돌려도 같은 결과(leadId 로 upsert). 치울 때: --remove
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.collection('leads');
const leadId = 'test-send-0914';
const now = new Date().toISOString();

if (process.argv.includes('--remove')) {
  const r = await L.updateOne({ leadId }, { $set: { deleted: true, deletedAt: now, deletedReason: '발송 테스트 끝 (test-send-0914)' } });
  console.log(`삭제 표시 ${r.modifiedCount}건`);
  await mongoose.disconnect(); process.exit(0);
}

const r = await L.updateOne(
  { leadId },
  {
    $set: {
      leadId,
      Company: 'Yogico Test Company',
      Region: 'South Korea',
      Email: 'fe@yogico.kr',
      BuyerContact: 'Yogico QA',
      Title: 'QA',
      Type: '발송 테스트용 가상 업체',
      TypeKo: '발송 테스트용 가상 업체',
      Category: 'Other',
      Evidence: 'Internal test record for outbound send testing. Not a real buyer.',
      EvidenceKo: '발송이 제대로 나가는지 확인하려고 만든 내부 테스트 업체입니다. 실제 업체가 아닙니다.',
      WebsiteContact: 'https://yogico.kr',
      stage: 'queued',
      stageChangedAt: now,
      readyForOutreach: true,
      deleted: false,
      importBatch: 'test-manual',
      updatedInfoAt: now,
      emailHistory: [],
      lastEmailSentAt: null,
    },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
);
console.log(`${r.upsertedCount ? '새로 만듦' : '갱신'}  Yogico Test Company  fe@yogico.kr  → 발송관리(queued)`);
const q = await L.find({ stage: 'queued', deleted: { $ne: true } }).project({ Company: 1, Email: 1 }).toArray();
console.log(`발송 리스트 ${q.length}곳:`, q.map((x) => `${x.Company} <${x.Email}>`).join(', '));
await mongoose.disconnect();
