import { NextResponse, after } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
import { processScheduleItem } from '@/lib/schedule-runner';
import { DAILY_SEND_CAP, SEND_INTERVAL_MS } from '@/lib/outbound-lock';
import { isNightBlocked } from '@/lib/email/compliance';
import { seoulDayStart } from '@/lib/mail/period';
import {
  newRunId, claimNext, settleClaim, releaseStale,
  acquireLease, releaseLease, recordRun,
} from '@/lib/schedule-claim';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * **선점**을 이 시각까지만 한다 (실행 시작부터).
 *
 * 예전에는 270초까지 새 건을 집었다. 마지막 건이 느리면(첨부 받기·보낸메일함 사본)
 * 300초 강제 종료가 'SMTP 성공 뒤, 기록 전' 에 걸려 보냈는지 모르는 건이 생긴다.
 * 한 건 최악 소요(SMTP 타임아웃 ~60초 + 사본 20초)를 빼고 여유를 둔다.
 */
const CLAIM_DEADLINE_MS = 180_000;

const MAX_PER_RUN = Math.max(1, Number(process.env.SCHEDULE_MAX_PER_RUN) || 10);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET /api/cron/process-schedules
 *   Vercel Cron 이 호출. scheduledFor <= now && status=pending 항목을 배치 처리.
 *
 * ── 언제 깨어나는가 (vercel.json) ──
 * Vercel 크론은 하루 한 번(09:00 KST)이다. **안전망**일 뿐 주력이 아니다.
 * Hobby 요금제는 크론을 하루 1회로 제한해서, 10분마다로 적어도 그렇게 돌지 않는다.
 * 9/21 16:52 에 깔아 둔 예약 10건이 17:00 회차에 안 나간 게 그 때문이다.
 * 주력은 외부 크론(cron-job.org)이 10분마다 Authorization: Bearer <CRON_SECRET>
 * 로 이 경로를 부르는 것이다. 둘이 겹쳐 돌아도 한 예약은 한 번만 나간다 —
 * 아래에서 한 건씩 원자적으로 선점하기 때문이다.
 *
 * ⚠️ vercel.json 에 설명을 달지 말 것. 주석용 키를 넣으면 스키마 검증이
 *    "crons[0] should NOT have additional property" 로 **배포 자체를 막는다.**
 *    9/28 에 이것 때문에 그날 푸시한 배포가 전부 실패했다. 서버는 9/21 코드로
 *    계속 돌았고, 선점 규칙이 없는 그 코드가 수동 발송과 겹쳐 11곳에 메일이
 *    두 번 나갔다. 설명은 여기 주석에 적는다.
 *
 * ── 왜 한 번에 다 보내지 않는가 ──
 * 예전에는 due 항목 50건을 지연 없이 연속 발송했다. 화면에서 "30곳씩 10분 간격"
 * 으로 예약을 깔아도, 크론이 하루 한 번 깨어나 그때까지 밀린 것을 전부 집어
 * 연달아 보내버리니 나눠 보내기가 사실상 없는 것과 같았다.
 *
 * 그래서 여기서 실제로 간격을 둔다.
 *   · 한 통과 다음 통 사이 SEND_INTERVAL_MS 만큼 쉰다
 *   · 하루 총량은 DAILY_SEND_CAP 을 넘지 않는다 (이미 나간 것까지 세어서)
 *   · 선점 마감(CLAIM_DEADLINE_MS)에 닿으면 남은 것은 다음 실행으로 넘긴다
 *     (status 는 pending 그대로라 다음 크론이 이어서 집어간다)
 *
 * ── 보안 ──
 * 이 경로는 proxy.ts 의 로그인 검사에서 빠져 있다(/api/cron 은 통과).
 * 크론이 쿠키를 들고 올 수 없기 때문인데, 그 말은 URL 만 알면 누구나
 * 발송을 돌릴 수 있다는 뜻이기도 하다. 그래서 여기서 직접 검사한다.
 *
 * 셋 중 하나면 통과한다.
 *   1) Authorization: Bearer <CRON_SECRET>   — 외부 크론·Vercel 크론
 *      (Vercel 은 CRON_SECRET 환경변수가 있으면 이 헤더를 자동으로 붙인다)
 *   2) 로그인한 관리자 세션                    — 화면의 [⏱ 지금 예약분 내보내기]
 *   3) CRON_SECRET 을 아예 안 걸어둔 경우      — 개발 편의
 *
 * 2번이 필요한 이유: 브라우저 fetch 는 Bearer 를 붙일 수 없다.
 * 이게 없으면 CRON_SECRET 을 켜는 순간 화면의 버튼이 401 을 받는다.
 */
async function authorized(req: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;                       // 3) 안 걸어뒀으면 통과

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader === `Bearer ${cronSecret}`) return true;   // 1) 크론

  // 2) 로그인한 사람이 화면에서 직접 누른 경우
  try {
    const c = await cookies();
    const token = c.get('admin_session')?.value;
    if (!token) return false;
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret'));
    return true;
  } catch {
    return false;
  }
}

/** 크론이 부른 것인가(Bearer) — 화면 버튼은 쿠키로 온다 */
function viaCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && (req.headers.get('authorization') || '') === `Bearer ${secret}`;
}

/**
 * 한 번의 발송 실행. 임대를 쥔 채로만 부른다.
 */
async function runBatch(runId: string, by: 'cron' | 'button') {
  const startedAt = Date.now();

  // 죽은 실행이 남긴 선점 정리 — 보내기 전이면 대기로, 보내기 시작했으면 '불명'
  const stale = await releaseStale();

  // 오늘 이미 나간 통수. **서울 기준 자정**부터 센다.
  // 예전엔 setHours(0) 이었는데 Vercel 은 UTC 라 그게 한국 09시였다 —
  // 하루 상한이 아침 9시에 초기화되고, 0~9시 발송분은 전날 몫으로 세졌다.
  const sentToday = await EmailSchedule.countDocuments({ status: 'sent', sentAt: { $gte: seoulDayStart() } });
  const remainingToday = Math.max(0, DAILY_SEND_CAP - sentToday);
  const due = await EmailSchedule.countDocuments({ status: 'pending', scheduledFor: { $lte: new Date() } });

  const results: Array<{ id: string; to?: string; ok: boolean; error?: string; settled?: string }> = [];
  let stoppedFor: string | null = remainingToday === 0 ? 'daily-cap' : null;
  const touched: any[] = [];
  // 실제로 발송을 시도한 수. 속도 상한과 간격은 **이것만** 센다 —
  // 가드에 걸려 미뤄진 건까지 세면 그 건들이 자리(회당 10통)만 차지해 뒤가 굶는다.
  let attempted = 0;
  let needGap = false;

  while (!stoppedFor) {
    if (attempted >= MAX_PER_RUN) { stoppedFor = 'rate-limit'; break; }
    if (attempted >= remainingToday) { stoppedFor = 'daily-cap'; break; }
    if (needGap) {
      await sleep(SEND_INTERVAL_MS);
      needGap = false;
    }
    if (Date.now() - startedAt > CLAIM_DEADLINE_MS) { stoppedFor = 'time-budget'; break; }
    // 실행 도중 21시가 되면 멈춘다 (남은 건 pending 그대로)
    if (isNightBlocked().blocked) { stoppedFor = 'night'; break; }

    const doc = await claimNext(runId, touched);
    if (!doc) break;   // 더 보낼 것이 없다
    touched.push(doc._id);

    let r: any;
    try {
      r = await processScheduleItem(doc);
    } catch (e: any) {
      // 어디서 터졌는지 모른다 — 보낸 것으로 치고(보수적) 정리는 settleClaim 이 한다
      r = { ok: false, error: e?.message || 'unknown', attempted: true };
    }
    // processing 에 남았으면 정리. 보내기 시작한 뒤라면 절대 되돌리지 않는다.
    const settled = await settleClaim(doc._id, runId);
    results.push({ id: String(doc._id), to: doc.to, ok: !!r.ok, error: r.error, settled: settled === 'none' ? undefined : settled });
    if (r.attempted) { attempted++; needGap = true; }
  }

  const ok = results.filter((x) => x.ok).length;
  console.log(
    `[cron:process-schedules] ${by} ${runId} · 처리 ${results.length}/${due} · 발송시도 ${attempted} · 성공 ${ok}` +
    ` · 오늘 ${sentToday}/${DAILY_SEND_CAP}${stoppedFor ? ` · 멈춤:${stoppedFor}` : ''}` +
    (stale.released || stale.unknown ? ` · 정리 ${stale.released}대기/${stale.unknown}불명` : ''),
  );

  const out = {
    success: true,
    runId,
    processed: results.length,
    attempted,
    due,
    releasedStale: stale.released,
    unknownStale: stale.unknown,
    results,
    sentToday,
    dailyCap: DAILY_SEND_CAP,
    intervalMs: SEND_INTERVAL_MS,
    stoppedFor,
  };
  await recordRun(by, { processed: results.length, attempted, ok, due, stoppedFor, at: new Date() });
  return out;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  const by = viaCron(req) ? 'cron' : 'button';

  try {
    await dbConnect();

    // 야간(21~08시 KST)에는 아무것도 집지 않는다. 외부 크론은 밤새 10분마다 부른다.
    // 심장 박동은 찍는다 — 밤에도 크론이 살아 있다는 표시다.
    if (isNightBlocked().blocked) {
      await recordRun(by, { skipped: 'night', at: new Date() });
      return NextResponse.json({ success: true, processed: 0, results: [], skipped: 'night' });
    }

    // 한 번에 한 실행만 보낸다. 겹치면 발신 속도·하루 상한이 겹친 수만큼 배가 된다.
    const runId = newRunId(by);
    if (!(await acquireLease(runId))) {
      await recordRun(by, { skipped: 'busy', at: new Date() });
      return NextResponse.json({
        success: true, processed: 0, results: [], skipped: 'busy',
        message: '다른 발송이 진행 중입니다. 잠시 뒤 다시 시도하세요.',
      });
    }

    const work = async () => {
      try {
        return await runBatch(runId, by);
      } finally {
        await releaseLease(runId);
      }
    };

    // 크론에는 **바로 202** 로 답하고 발송은 뒤에서 한다 (maxDuration 안에서).
    // 발송은 1~3분 걸리는데 cron-job.org 는 30초가 지나면 실패로 기록하고,
    // 실패가 쌓이면 작업을 스스로 꺼 버린다 — 그러면 크론이 조용히 멈춘다.
    if (by === 'cron') {
      after(async () => {
        try { await work(); } catch (e: any) { console.error('[cron:process-schedules] error:', e); }
      });
      return NextResponse.json({ success: true, accepted: true, runId }, { status: 202 });
    }

    // 화면 버튼은 결과를 기다려 보여준다
    return NextResponse.json(await work());
  } catch (e: any) {
    console.error('[cron:process-schedules] error:', e);
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
