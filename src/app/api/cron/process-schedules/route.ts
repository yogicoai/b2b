import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
import { processScheduleItem } from '@/lib/schedule-runner';
import { DAILY_SEND_CAP, SEND_INTERVAL_MS } from '@/lib/outbound-lock';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 이 실행에서 쓸 수 있는 시간 (maxDuration 300s 중 여유를 남긴다) */
const RUN_BUDGET_MS = 270_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET /api/cron/process-schedules
 *   Vercel Cron 이 호출. scheduledFor <= now && status=pending 항목을 배치 처리.
 *
 * ── 왜 한 번에 다 보내지 않는가 ──
 * 예전에는 due 항목 50건을 지연 없이 연속 발송했다. 화면에서 "30곳씩 10분 간격"
 * 으로 예약을 깔아도, 크론이 하루 한 번 깨어나 그때까지 밀린 것을 전부 집어
 * 연달아 보내버리니 나눠 보내기가 사실상 없는 것과 같았다.
 *
 * 그래서 여기서 실제로 간격을 둔다.
 *   · 한 통과 다음 통 사이 SEND_INTERVAL_MS 만큼 쉰다
 *   · 하루 총량은 DAILY_SEND_CAP 을 넘지 않는다 (이미 나간 것까지 세어서)
 *   · 실행 시간이 RUN_BUDGET_MS 에 닿으면 남은 것은 다음 실행으로 넘긴다
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

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    await dbConnect();
    const now = new Date();

    // 오늘 이미 나간 통수 — 하루 상한은 실행 단위가 아니라 하루 단위로 센다
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = await EmailSchedule.countDocuments({
      status: 'sent',
      sentAt: { $gte: dayStart },
    });
    const remainingToday = Math.max(0, DAILY_SEND_CAP - sentToday);

    if (remainingToday === 0) {
      return NextResponse.json({
        success: true, processed: 0, results: [],
        skipped: 'daily-cap', sentToday, dailyCap: DAILY_SEND_CAP,
      });
    }

    const items = await EmailSchedule.find({
      status: 'pending',
      scheduledFor: { $lte: now },
    }).sort({ scheduledFor: 1 }).limit(remainingToday);

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    let stoppedFor: string | null = null;

    for (let i = 0; i < items.length; i++) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) { stoppedFor = 'time-budget'; break; }

      // 첫 통은 바로, 그다음부터 간격을 둔다
      if (i > 0) {
        const left = RUN_BUDGET_MS - (Date.now() - startedAt);
        if (left < SEND_INTERVAL_MS) { stoppedFor = 'time-budget'; break; }
        await sleep(SEND_INTERVAL_MS);
      }

      const doc = items[i];
      try {
        const r = await processScheduleItem(doc);
        results.push({ id: String(doc._id), ok: !!r.ok, error: r.error });
      } catch (e: any) {
        results.push({ id: String(doc._id), ok: false, error: e?.message || 'unknown' });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    console.log(
      `[cron:process-schedules] processed ${results.length}/${items.length} · ok=${ok}` +
      ` · sentToday=${sentToday}/${DAILY_SEND_CAP}${stoppedFor ? ` · stopped:${stoppedFor}` : ''}`,
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
      due: items.length,
      results,
      sentToday,
      dailyCap: DAILY_SEND_CAP,
      intervalMs: SEND_INTERVAL_MS,
      stoppedFor,
    });
  } catch (e: any) {
    console.error('[cron:process-schedules] error:', e);
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
