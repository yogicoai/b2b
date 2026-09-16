/**
 * 발송 테스트로 만든 흔적을 치운다.
 *
 * 지우는 것이 네 군데에 흩어져 있다. 하나만 치우면 다른 화면에 남는다.
 *   1) 리드            — 발송 리스트·발송 완료·답장 받음에 뜬다
 *   2) 예약 레코드     — [예약 발송]·[발송 완료] 탭에 뜬다
 *   3) 받은 답장       — 받은 메일함과 대화 이력에 뜬다
 *   4) 리드의 발송 이력 — 리드를 살려도 "이미 3회 보냄" 으로 남는다
 *
 * 전부 되돌릴 수 있게 지운다(deleted / trashedAt 표시). 진짜로 삭제하면
 * "그때 뭘 보냈더라" 를 확인할 방법이 없어진다.
 *
 * --hard 를 붙이면 예약 레코드만 실제로 지운다 (테스트 찌꺼기라 이력 가치가 없다).
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const HARD = process.argv.includes('--hard');
const TEST_BATCH = 'test-manual';
const TEST_ADDRESSES = ['fe@yogico.kr', 'leshwann@naver.com'];

const KST = 9 * 3600000;
const k = (d) => (d ? new Date(new Date(d).getTime() + KST).toISOString().slice(0, 19).replace('T', ' ') : '—');

await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.collection('leads');
const S = mongoose.connection.collection('emailschedules');
const M = mongoose.connection.collection('inboundmails');

const leads = await L.find({ importBatch: TEST_BATCH }).toArray();
if (!leads.length) {
  console.log('테스트 리드가 없습니다 — 이미 정리됐습니다.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log('지울 대상:');
for (const l of leads) {
  console.log(`  ${String(l.Company).padEnd(24)} ${String(l.Email).padEnd(22)} ${l.stage}`);
}
const ids = leads.map((l) => l.leadId);
const now = new Date();

// 1) 리드 — 지우지 않고 표시만 (모든 목록이 deleted 를 제외한다)
const r1 = await L.updateMany(
  { importBatch: TEST_BATCH },
  {
    $set: { deleted: true, deletedReason: '발송 테스트 정리', deletedAt: now.toISOString() },
    // 4) 발송 이력도 비운다 — 되살렸을 때 48시간 가드에 걸리지 않게
    $unset: { emailHistory: '', lastEmailSentAt: '' },
  },
);

// 2) 예약 레코드 — 테스트 찌꺼기라 이력 가치가 없다
let r2;
if (HARD) {
  r2 = await S.deleteMany({ leadId: { $in: ids } });
  console.log(`\n예약 레코드 ${r2.deletedCount}건 삭제`);
} else {
  r2 = await S.updateMany(
    { leadId: { $in: ids } },
    { $set: { status: 'canceled', canceledReason: '발송 테스트 정리' } },
  );
  console.log(`\n예약 레코드 ${r2.modifiedCount}건 취소 처리 (--hard 로 실제 삭제 가능)`);
}

// 3) 테스트로 주고받은 메일 — 휴지통으로 (되돌릴 수 있다)
const mails = await M.find({
  $or: [
    { leadId: { $in: ids } },
    { 'from.address': { $in: TEST_ADDRESSES.map((a) => new RegExp(`^${a}$`, 'i')) } },
  ],
  trashedAt: null,
}).project({ subject: 1, date: 1, 'from.address': 1 }).toArray();

let r3 = { modifiedCount: 0 };
if (mails.length) {
  console.log('\n휴지통으로 보낼 메일:');
  for (const m of mails) console.log(`  ${k(m.date)}  ${m.from?.address}  ${String(m.subject || '').slice(0, 46)}`);
  r3 = await M.updateMany(
    { _id: { $in: mails.map((m) => m._id) } },
    { $set: { trashedAt: now, trashedReason: '발송 테스트 정리' }, $unset: { leadId: '' } },
  );
}

console.log('\n── 결과 ──');
console.log(`  리드        ${r1.modifiedCount}건 숨김 (deleted=true · 되돌릴 수 있음)`);
console.log(`  예약        ${HARD ? r2.deletedCount + '건 삭제' : r2.modifiedCount + '건 취소'}`);
console.log(`  메일        ${r3.modifiedCount}건 휴지통`);

// 확인 — 화면에 뜨는 기준으로 다시 센다
const alive = { deleted: { $ne: true } };
const left = {
  queued: await L.countDocuments({ stage: 'queued', ...alive }),
  contacted: await L.countDocuments({ stage: 'contacted', ...alive }),
  replied: await L.countDocuments({ stage: 'replied', ...alive }),
  pending: await S.countDocuments({ status: 'pending' }),
};
console.log('\n── 정리 후 화면 숫자 ──');
console.log(`  보낼 메일 ${left.queued} · 발송 완료 ${left.contacted} · 답장 받음 ${left.replied} · 예약 대기 ${left.pending}`);

await mongoose.disconnect();
