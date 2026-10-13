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

// Atlas 가 잠깐 끊기면 드라이버가 떠돌이 거부를 던지고 node 가 그대로 죽는다.
// 2026-10-13 에 285통째에서 이렇게 멈췄다. 루프가 알아서 재시도하게 둔다.
process.on('unhandledRejection', (e: any) =>
  console.log(`⚠️ 처리 안 된 오류(무시하고 계속): ${String(e?.message || e).slice(0, 80)}`));

const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 19);
const runId = C.newRunId('manual');
if (!(await C.acquireLease(runId))) { console.log('다른 발송이 진행 중 — 중단'); process.exit(0); }

let ok = 0, ng = 0, realFail = 0, dbFail = 0;
const touched: any[] = [];
try {
  const due = await EmailSchedule.countDocuments({ status: 'pending', scheduledFor: { $lte: new Date() } });
  console.log(`보낼 것 ${due}건 · 간격 ${GAP_S}초 · 예상 ${Math.round(due * GAP_S / 60)}분\n`);
  for (let i = 0; i < LIMIT; i++) {
    if (isNightBlocked().blocked) { console.log(`\n야간(21~08시) — 여기서 멈춘다. 남은 건 대기 그대로.`); break; }
    if (i > 0) await new Promise((r) => setTimeout(r, GAP_S * 1000));
    let doc: any = null;
    try {
      doc = await C.claimNext(runId, touched);
    } catch (e: any) {
      dbFail++;
      console.log(`[${kst()}] ⚠️ DB 일시 오류 ${dbFail}/5 — 30초 뒤 다시: ${String(e?.message || e).slice(0, 60)}`);
      if (dbFail >= 5) { console.log('
🛑 DB 연결이 계속 끊긴다. 멈춘다. 남은 건 대기 그대로.'); break; }
      await new Promise((r) => setTimeout(r, 30_000));
      i--;                       // 이 회차는 안 센다
      continue;
    }
    dbFail = 0;
    if (!doc) { console.log('\n더 보낼 것이 없다.'); break; }
    touched.push(doc._id);
    let r: any;
    try { r = await processScheduleItem(doc); } catch (e: any) { r = { ok: false, error: e?.message, attempted: true }; }
    // 여기서 실패해도 다음 실행의 releaseStale 가 정리한다 — 죽일 이유가 없다
    try { await C.settleClaim(doc._id, runId); } catch { /* 넘어간다 */ }
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
