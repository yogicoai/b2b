/** 일회용 — 밀린 예약을 지금 내보낸다. 크론 라우트와 **같은 선점 규칙**을 쓴다. */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
process.env.APP_BASE_URL = 'https://b2b-ochre-seven.vercel.app';  // 수신거부 링크가 열리는 주소
process.env.MAIL_DRY_RUN = '0';                                   // 진짜로 보낸다

const GAP_S = Number(process.argv[2]) || 45;
const LIMIT = Number(process.argv[3]) || 200;

const dbConnect = (await import('./src/lib/mongodb')).default;
const { EmailSchedule } = await import('./src/models/EmailSchedule');
const { processScheduleItem } = await import('./src/lib/schedule-runner');
const { isNightBlocked } = await import('./src/lib/email/compliance');
const C = await import('./src/lib/schedule-claim');
await dbConnect();

const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 19);
const runId = C.newRunId('manual');
if (!(await C.acquireLease(runId))) { console.log('다른 발송이 진행 중 — 중단'); process.exit(0); }

let ok = 0, ng = 0, realFail = 0;
const touched: any[] = [];
try {
  const due = await EmailSchedule.countDocuments({ status: 'pending', scheduledFor: { $lte: new Date() } });
  console.log(`보낼 것 ${due}건 · 간격 ${GAP_S}초 · 예상 ${Math.round(due * GAP_S / 60)}분\n`);
  for (let i = 0; i < LIMIT; i++) {
    if (isNightBlocked().blocked) { console.log(`\n야간(21~08시) — 여기서 멈춘다. 남은 건 대기 그대로.`); break; }
    if (i > 0) await new Promise((r) => setTimeout(r, GAP_S * 1000));
    const doc: any = await C.claimNext(runId, touched);
    if (!doc) { console.log('\n더 보낼 것이 없다.'); break; }
    touched.push(doc._id);
    let r: any;
    try { r = await processScheduleItem(doc); } catch (e: any) { r = { ok: false, error: e?.message, attempted: true }; }
    await C.settleClaim(doc._id, runId);
    if (r.ok) { ok++; realFail = 0; } else { ng++; if (r.attempted) realFail++; }
    console.log(`[${kst()}] ${r.ok ? '✅' : '❌'} ${String(doc.to).padEnd(34)} ${r.ok ? '' : (r.error || '').slice(0, 60)}`);
    if (realFail >= 3) { console.log('\n🛑 연속 3건 실제 실패 — 발신 차단 의심. 멈춘다.'); break; }
  }
} finally {
  await C.releaseLease(runId);
}
console.log(`\n보냄 ${ok} · 못 보냄 ${ng}`);
console.log(`남은 대기 ${await EmailSchedule.countDocuments({ status: 'pending' })}건`);
process.exit(0);
