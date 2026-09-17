/**
 * 예약 발송을 여기서 직접 집행한다.
 *
 * 왜 스크립트인가: 배포본 크론은 아직 하루 한 번이고(수정 커밋 미배포),
 * 화면 버튼은 한 번에 33통을 4분 만에 쏟아낸다 — 이카운트가 막았던 속도다.
 * 여기서 간격과 상한을 직접 쥐고 보낸다.
 *
 * 사용: npx tsx scripts/run-due-schedules.mts <보낼통수> [통사이간격초]
 *   예: npx tsx scripts/run-due-schedules.mts 3 20
 */
import fs from 'node:fs';

const env: any = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
for (const [k, v] of Object.entries(env)) process.env[k] = v as string;
// 수신거부 링크가 실제로 열리는 주소. compliance.ts 가 모듈 로드 때 잡으므로 import 전에.
process.env.APP_BASE_URL = 'https://b2b-ochre-seven.vercel.app';
process.env.MAIL_DRY_RUN = '0';

const LIMIT = Math.max(1, Number(process.argv[2]) || 3);
const GAP_S = Math.max(5, Number(process.argv[3]) || 60);

const dbConnect = (await import('./../src/lib/mongodb')).default;
const { EmailSchedule } = await import('./../src/models/EmailSchedule');
const { processScheduleItem } = await import('./../src/lib/schedule-runner');
const { isNightBlocked } = await import('./../src/lib/email/compliance');
const { DAILY_SEND_CAP } = await import('./../src/lib/outbound-lock');
const { Lead } = await import('./../src/models/Lead');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 19);

await dbConnect();

// 오늘 이미 나간 통수 — 하루 상한을 넘기지 않는다
const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
const sentToday = await Lead.aggregate([
  { $unwind: '$emailHistory' },
  { $match: { 'emailHistory.status': 'sent', 'emailHistory.sentAt': { $gte: dayStart.toISOString() } } },
  { $count: 'n' },
]);
const already = sentToday[0]?.n || 0;
console.log(`오늘 이미 나간 것 ${already} / 상한 ${DAILY_SEND_CAP}`);

const due = await EmailSchedule.find({ status: 'pending', scheduledFor: { $lte: new Date() } })
  .sort({ scheduledFor: 1 }).limit(LIMIT);
console.log(`시각이 지난 예약 중 ${due.length}건 처리 · 간격 ${GAP_S}초\n`);

let ok = 0, ng = 0, consecutiveFail = 0;
for (let i = 0; i < due.length; i++) {
  const night = isNightBlocked();
  if (night.blocked) { console.log(`\n⏸ 야간차단(KST ${night.kstHour}시) — 여기서 멈춘다. 남은 건 pending 그대로.`); break; }
  if (already + ok >= DAILY_SEND_CAP) { console.log('\n⏸ 하루 상한 도달 — 멈춘다.'); break; }
  if (i > 0) await sleep(GAP_S * 1000);

  const doc: any = due[i];
  const r = await processScheduleItem(doc);
  if (r.ok) { ok++; consecutiveFail = 0; }
  else { ng++; consecutiveFail++; }
  console.log(`[${kst()}] ${r.ok ? '✅' : '❌'} ${String(doc.to).padEnd(34)} ${r.ok ? '' : r.error || ''}`);

  // 연속 실패면 즉시 멈춘다 — 발신 차단이 시작된 신호일 수 있다
  if (consecutiveFail >= 3) { console.log('\n🛑 연속 3건 실패 — 발신 차단 의심. 멈춘다.'); break; }
}
console.log(`\n보냄 ${ok} · 실패 ${ng}`);
const left = await EmailSchedule.countDocuments({ status: 'pending' });
console.log(`남은 예약 ${left}건`);
process.exit(0);
