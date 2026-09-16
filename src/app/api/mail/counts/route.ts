import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { countSince, seoulDayStart, replyWindowFilter, REPLY_WINDOW_DAYS, COUNT_PERIOD_LABEL, COUNT_PERIOD_DAYS } from '@/lib/mail/period';
import { getMailScope, accountParamFilter, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * GET /api/mail/counts — 사이드바 "메일함" 배지용 카운트.
 *
 * 목록 API 를 다시 호출하지 않고 숫자만 가볍게 가져온다.
 * 광고·자동발송은 배지에서 제외한다 — 사람이 볼 것만 세어야 숫자가 의미를 갖는다.
 */
export async function GET(req: Request) {
  try {
    await dbConnect();

    // 배지 숫자도 내가 볼 수 있는 계정 것만 센다 — 남의 메일 수가 섞이면 목록과 어긋난다
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // as const 로 리터럴 고정 — string[] 로 추론되면 classification union 타입과 맞지 않는다
    const NOISE = ['ad', 'system', 'newsletter'] as const;

    // 메일함에서 계정을 고르면 배지도 그 계정 기준으로 센다.
    // 'all'·미지정은 "내 계정 전체" — 예전처럼 {} 로 두면 모든 사람의 메일을 센다.
    // 모든 조건에 ...acc 로 들어가므로 여기서 한 번만 좁히면 된다.
    const accountId = new URL(req.url).searchParams.get('accountId');
    const { filter: acc, denied } = accountParamFilter(scope, accountId);
    if (denied) return NextResponse.json(NOT_YOURS, { status: 403 });

    // 화면 숫자는 최근 2개월 기준. 기간을 두지 않으면 1년치가 전부 잡혀
    // "밀린 일이 산더미"로 읽히고, 매일 늘어나는 몇 건이 그 안에 묻힌다.
    const since = { date: { $gte: countSince() } };

    // ── 오늘 온 메일 ──
    // 다른 배지와 달리 광고·자동발송을 빼지 않고 온 그대로 센다.
    // "오늘 몇 통 왔나"는 메일함을 열었을 때 실제로 보이는 줄 수와 같아야 한다.
    // 광고가 몇 통인지는 따로 세어 옆에 적어준다.
    const todayStart = seoulDayStart();
    const todayBase = { ...acc, trashedAt: null, direction: 'in' as const, date: { $gte: todayStart } };

    const [inbox, needsReply, unlinked, total, deadlines, trash,
           today, todayNoise, todayNeedsReply] = await Promise.all([
      // 받은 메일함 배지 — 광고 제외한 수신 메일
      InboundMail.countDocuments({
        ...acc, ...since,
        trashedAt: null,
        direction: 'in',
        classification: { $nin: NOISE },
      }),
      // 회신 필요 — 상대가 질문·요청을 보냈고 아직 처리 안 된 것.
      //
      // ⚠️ 기간이 다른 배지들과 다르다 (2개월이 아니라 최근 REPLY_WINDOW_DAYS).
      // 2주가 지나도록 답하지 않은 건은 답할 일이 아니거나 이미 다른 경로로
      // 정리된 것이다. 남겨두면 숫자가 줄지 않아 밀린 일처럼 보이고,
      // 한참 지난 건에 뒤늦게 답장을 보내는 사고가 난다.
      // 목록(/api/mail/inbox?needsReply=1)도 **같은 기간**을 써야 숫자가 맞는다.
      InboundMail.countDocuments({
        ...acc,
        ...replyWindowFilter(),
        trashedAt: null,
        direction: 'in',
        classification: { $nin: NOISE },
        'analysis.needsReply': true,
        status: { $in: ['new', 'reviewing'] },
      }),
      // 리드에 연결되지 않은 메일 (우리가 보낸 적 없는 곳에서 온 것)
      InboundMail.countDocuments({
        ...acc, ...since,
        trashedAt: null,
        direction: 'in',
        classification: { $nin: NOISE },
        $or: [{ leadId: '' }, { leadId: { $exists: false } }],
      }),
      InboundMail.countDocuments({ ...acc }),
      // 기한이 잡혔고 아직 답하지 않은 것 — 처리한 건이 D-day 로 남으면 안 된다
      InboundMail.countDocuments({
        ...acc, ...since,
        trashedAt: null,
        direction: 'in',
        classification: { $nin: NOISE },
        'analysis.deadline': { $ne: null },
        status: { $nin: ['replied', 'archived', 'ignored'] },
      }),
      // 휴지통 — 여기는 기간을 걸지 않는다. 배지는 "되돌릴 게 남아 있나"를
      // 알리는 용도라, 두 달 지났다고 숫자에서 사라지면 오분류를 영영 못 찾는다.
      InboundMail.countDocuments({ ...acc, trashedAt: { $ne: null } }),

      // 오늘 온 것 전부
      InboundMail.countDocuments(todayBase),
      // 그중 광고·자동발송·뉴스레터 — 숫자 옆에 "이만큼은 볼 것 없음"을 적기 위해
      InboundMail.countDocuments({ ...todayBase, classification: { $in: NOISE } }),
      // 그중 오늘 안에 답해야 하는 것
      InboundMail.countDocuments({
        ...todayBase,
        classification: { $nin: NOISE },
        'analysis.needsReply': true,
        status: { $in: ['new', 'reviewing'] },
      }),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        inbox, needsReply, unlinked, total, deadlines, trash,
        today, todayNoise, todayNeedsReply,
      },
      todayStart: todayStart.toISOString(),   // 화면이 같은 기준을 쓰는지 확인용
      period: { days: COUNT_PERIOD_DAYS, label: COUNT_PERIOD_LABEL },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
