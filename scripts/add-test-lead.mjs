/**
 * 예약 발송 테스트용 업체를 발송 리스트에 넣는다.
 *
 * 두 곳을 1분 간격으로 예약해 실제로 나가는지 보기 위한 것이다.
 *   1) Yogico Test Company — fe@yogico.kr  (이미 있음)
 *   2) Yogico Test Company 2 — leshwann@naver.com  (이 스크립트가 만든다)
 *
 * stage 를 'queued'(발송 리스트)로 넣는다. 검증 단계를 거치지 않아도
 * 바로 [보낼 메일] 에 뜨게 하려는 것이다.
 *
 * 다시 돌려도 같은 결과가 되게 leadId 로 upsert 한다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local' });

await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.collection('leads');

const now = new Date().toISOString();

const TESTS = [
  {
    leadId: 'test-manual-2',
    Company: 'Yogico Test Company 2',
    Region: 'South Korea',
    Email: 'leshwann@naver.com',
    Type: '예약 발송 테스트용 가상 업체',
    TypeKo: '예약 발송 테스트용 가상 업체',
    Category: 'Other',
    Evidence: 'Internal test record for scheduled-send verification. Not a real buyer.',
    EvidenceKo: '예약 발송이 제 시각에 나가는지 확인하려고 만든 내부 테스트 기록입니다. 실제 업체가 아닙니다.',
    BuyerContact: 'Yogico QA',
    WebsiteContact: 'https://yogico.kr',
  },
];

for (const t of TESTS) {
  const r = await L.updateOne(
    { leadId: t.leadId },
    {
      $set: {
        ...t,
        stage: 'queued',            // 발송 리스트 — 사람이 고른 것과 같은 자리
        stageChangedAt: now,
        deleted: false,
        readyForOutreach: true,
        importBatch: 'test-manual',
        updatedInfoAt: now,
      },
      $setOnInsert: { createdAt: new Date(), emailHistory: [] },
    },
    { upsert: true },
  );
  console.log(`${r.upsertedCount ? '새로 만듦' : '갱신'}  ${t.Company}  ${t.Email}`);
}

// 지금 발송 리스트에 무엇이 있는지 확인
const queued = await L.find({ stage: 'queued', deleted: { $ne: true } })
  .project({ leadId: 1, Company: 1, Email: 1, emailHistory: 1, lastEmailSentAt: 1 })
  .toArray();

console.log(`\n발송 리스트(보낼 메일) ${queued.length}곳`);
for (const q of queued) {
  const sent = (q.emailHistory || []).filter((h) => h?.status === 'sent').length;
  console.log(`   ${String(q.Company).padEnd(26)} ${String(q.Email).padEnd(24)} 발송이력 ${sent}회` +
    (q.lastEmailSentAt ? ` · 최근 ${new Date(q.lastEmailSentAt).toISOString().slice(0, 16)}` : ''));
}

// 48시간 가드에 걸릴 것이 있는지 미리 알려준다 — 테스트가 "실패"로 보이는 흔한 원인
const MIN_H = 48;
const blocked = queued.filter((q) => {
  if (!q.lastEmailSentAt) return false;
  return (Date.now() - new Date(q.lastEmailSentAt).getTime()) / 3600000 < MIN_H;
});
if (blocked.length) {
  console.log(`\n⚠ 48시간 가드에 걸리는 곳 ${blocked.length}곳 — 이번 테스트에서는 건너뛰어집니다:`);
  for (const b of blocked) console.log(`   ${b.Company} (최근 발송 ${new Date(b.lastEmailSentAt).toISOString().slice(0, 16)})`);
  console.log('   테스트를 다시 하려면 그 리드의 lastEmailSentAt / emailHistory 를 비우면 됩니다.');
}

await mongoose.disconnect();
