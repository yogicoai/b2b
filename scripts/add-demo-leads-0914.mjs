/**
 * 발표 시연용 테스트 업체 (2026-09-14). 받는 주소는 모두 fe@yogico.kr — 우리 메일함이라 바깥에 나가지 않는다.
 *
 *   Yogico Test Company 2 — 발송 완료 화면에 두 번째 건이 보이게, 실제로 한 통 보낸다 (fe@ → fe@)
 *   Yogico Test Company 3 — 발송관리 [보낼 메일]에 넣어 두기만 한다. 발표 때 앞에서 직접 보낸다.
 *
 * 치울 때: node scripts/add-demo-leads-0914.mjs --remove   (deleted 표시만)
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.collection('leads');
const now = new Date().toISOString();

const DEMO = [
  { leadId: 'test-send-0914-2', Company: 'Yogico Test Company 2' },
  { leadId: 'test-send-0914-3', Company: 'Yogico Test Company 3' },
];

if (process.argv.includes('--remove')) {
  const r = await L.updateMany({ leadId: { $in: [...DEMO.map((d) => d.leadId), 'test-send-0914'] } }, { $set: { deleted: true, deletedAt: now, deletedReason: '발표 시연 끝' } });
  console.log(`삭제 표시 ${r.modifiedCount}건`);
  await mongoose.disconnect();
  process.exit(0);
}

for (const d of DEMO) {
  const r = await L.updateOne(
    { leadId: d.leadId },
    {
      $set: {
        ...d,
        Region: 'South Korea',
        Email: 'fe@yogico.kr',
        BuyerContact: 'Yogico QA',
        Title: 'QA',
        Type: '발송 테스트용 가상 업체',
        TypeKo: '발송 테스트용 가상 업체',
        Category: 'Other',
        Evidence: 'Internal test record for outbound send demo. Not a real buyer.',
        EvidenceKo: '발송 시연용 내부 테스트 업체입니다. 실제 업체가 아닙니다.',
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
  console.log(`${r.upsertedCount ? '새로 만듦' : '갱신'}  ${d.Company}  fe@yogico.kr → 발송관리(queued)`);
}
await mongoose.disconnect();
