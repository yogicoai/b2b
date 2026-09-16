import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { seoulDayStart, replyWindowFilter, REPLY_WINDOW_DAYS } from '@/lib/mail/period';
import { learnSenderGroups, suggestGroupBySender } from '@/lib/mail/groups';
import { getMailScope, accountParamFilter, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * GET /api/mail/inbox — 수신 메일함 목록 (스레드 단위로 접어서)
 *
 * 쿼리:
 *   classification=b2b,inquiry   분류 필터 (콤마 구분)
 *   status=new,reviewing         상태 필터
 *   needsReply=1                 답변 필요만
 *   linked=1 | 0                 리드 연결된 것만 / 연결 안 된 것만
 *   q=검색어                     제목·발신·요약 검색
 *   page=1&limit=50
 *   flat=1                       스레드로 접지 않고 낱개로
 *
 * 답장이 20번 오간 건이 20줄로 늘어나면 "이 건이 어디까지 왔나"를 볼 수 없다.
 * 기본은 대화당 한 줄 + 오간 통수 배지 (emailData 설계 그대로).
 */

// 목록에 본문(raw)을 실으면 문서당 평균 71KB — 200통이면 14MB 를 읽고 메모리 정렬한다.
// 실측으로 한 요청이 10~40초까지 걸렸던 부분이라 반드시 제외한다.
const LIST_PROJECTION = {
  raw: 0,
  bodyStripped: 0,
  drafts: 0,
  'analysis.usage': 0,
};

/**
 * 폴더가 안 붙은 메일에 "이 발신자는 전에 여기 넣으셨습니다" 를 달아준다.
 *
 * 목록에서 바로 폴더를 지정할 수 있게 되면서 필요해졌다. 폴더가 스무 개쯤
 * 되면 매번 목록을 훑어 고르는 것이 일이 된다. 같은 곳에서 온 메일을
 * 예전에 어디 넣었는지는 이미 DB 가 알고 있으므로 그걸 맨 위에 올려준다.
 *
 * 자동으로 넣지는 않는다 — 애매한 것을 전부 자동 배치했다가 1통짜리 폴더가
 * 무더기로 생긴 적이 있다. 제안만 하고 누르는 것은 사람이 한다.
 *
 * 미분류가 한 건도 없으면 학습 질의 자체를 돌리지 않는다.
 *
 * 학습도 볼 수 있는 계정(accountIds)의 메일에서만 한다 — 남의 메일에서 배우면
 * 그 사람의 폴더 이름이 내 목록의 추천으로 새어 나온다.
 */
async function attachGroupSuggestions(items: any[], accountIds: string[]): Promise<any[]> {
  if (!items.some((m) => !m?.group)) return items;
  let learned = null;
  try {
    learned = await learnSenderGroups(accountIds);
  } catch {
    return items;   // 제안은 거들 뿐이라 실패해도 목록은 그대로 내보낸다
  }
  return items.map((m) =>
    m?.group ? m : { ...m, groupSuggest: suggestGroupBySender(m, learned) });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;
    const flat = searchParams.get('flat') === '1';

    const classification = searchParams.get('classification');
    const status = searchParams.get('status');
    const needsReply = searchParams.get('needsReply');
    const linked = searchParams.get('linked');
    const leadId = searchParams.get('leadId');
    const q = searchParams.get('q');
    const accountId = searchParams.get('accountId');

    await dbConnect();

    // 로그인한 아이디가 볼 수 있는 계정의 메일만 (lib/mail/scope.ts)
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const query: any = {};

    // 휴지통은 기본 목록에서 제외 (DB 에서 지우지 않으므로 언제든 되짚을 수 있다)
    query.trashedAt = searchParams.get('trashed') === '1' ? { $ne: null } : null;

    // 어느 메일함을 볼지. 'all' 이거나 미지정이면 **내가 볼 수 있는 계정 전체**.
    // 계정 개념이 생기기 전 메일은 accountId='main' 으로 저장돼 있다(마스터 몫).
    // 남의 계정 id 를 넘기면 거절 — 범위를 안 걸면 id 만 알아도 남의 메일함이 열린다.
    // accountId 는 최상위 조건이라 아래 $or/$and(검색·연결 여부)로 우회되지 않는다.
    const acc = accountParamFilter(scope, accountId);
    if (acc.denied) return NextResponse.json(NOT_YOURS, { status: 403 });
    Object.assign(query, acc.filter);

    // ── 오늘 온 메일 ──
    // 폴더와 섞이지 않는 별도의 축이다. 폴더는 "어느 거래처인가",
    // 이건 "언제 왔는가" 라서 둘을 겹쳐 걸면 오늘 온 것을 통째로 볼 수 없다.
    // 그래서 today=1 이면 폴더 조건은 무시한다 — 대신 목록의 각 줄에
    // 그 메일이 어느 폴더로 들어갔는지 태그가 붙는다.
    const today = searchParams.get('today') === '1';
    if (today) {
      query.date = { $gte: seoulDayStart() };
      query.direction = 'in';
    }

    // 거래처(폴더) 필터 — '__none__' 은 아직 분류 안 된 것
    const group = searchParams.get('group');
    if (!today) {
      if (group === '__none__') query.group = { $in: [null, ''] };
      else if (group) query.group = group;
    }

    if (classification) query.classification = { $in: classification.split(',') };
    if (status) query.status = { $in: status.split(',') };
    // 회신 필요 — 배지와 **같은 기간**을 써야 한다.
    // 한쪽만 기간을 걸면 "배지 12건인데 목록은 40건" 이 되어
    // 어느 쪽이 맞는지 알 수 없어진다 (검증실패 841 vs 51 과 같은 종류의 사고).
    // status 조건도 배지와 맞춘다 — 이미 답한 건은 셋 다에서 빠져야 한다.
    if (needsReply === '1') {
      query['analysis.needsReply'] = true;
      // 사이드바 배지(counts)와 같은 기준 — 광고·자동발송·뉴스레터는 '할 일'이 아니다.
      // 빠져 있어서 '[오늘의집] 오감리뷰 30% 할인' 같은 광고가 회신 필요 목록에 떴다.
      if (!query.classification) query.classification = { $nin: ['ad', 'system', 'newsletter'] };
      query.status = { $in: ['new', 'reviewing'] };
      query.direction = 'in';
      // today=1 이 이미 date 를 잡고 있으면 건드리지 않는다.
      // 덮어쓰면 "오늘 온 것 중 답할 것"이 "최근 2주"로 넓어진다.
      if (!query.date) Object.assign(query, replyWindowFilter());
    }
    if (leadId) query.leadId = leadId;
    else if (linked === '1') query.leadId = { $nin: ['', null] };
    else if (linked === '0') query.$or = [{ leadId: '' }, { leadId: { $exists: false } }];

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const search = [
        { subject: rx }, { 'from.address': rx }, { 'from.name': rx },
        { 'analysis.summary': rx }, { 'analysis.topic': rx },
      ];
      // linked=0 이 이미 $or 를 쓰고 있으면 $and 로 합친다
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: search }];
        delete query.$or;
      } else {
        query.$or = search;
      }
    }

    // ── 낱개 목록 ──
    if (flat || leadId) {
      const [items, total] = await Promise.all([
        InboundMail.find(query, LIST_PROJECTION).sort({ date: -1 }).skip(skip).limit(limit).lean(),
        InboundMail.countDocuments(query),
      ]);
      return NextResponse.json({
        success: true,
        items: await attachGroupSuggestions(items, scope.accountIds),
        total, page, limit, mode: 'flat',
      });
    }

    // ── 스레드 단위 ──
    const pipeline: any[] = [
      { $match: query },
      // 본문을 먼저 걷어낸다. raw 를 안고 정렬하면 32MB 정렬 한도를 넘는다.
      { $project: { raw: 0, bodyStripped: 0, drafts: 0, 'analysis.usage': 0 } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: { $ifNull: ['$threadKey', { $toString: '$_id' }] },
          latest: { $first: '$$ROOT' },
          count: { $sum: 1 },
          firstDate: { $min: '$date' },
          // 아직 안 지난 기한 중 가장 이른 것.
          // 스레드 최소값을 그냥 쓰면 몇 달 전 끝난 기한이 계속 D-day 로 뜨고,
          // 최신 메일만 보면 두 통 전의 기한을 놓친다.
          nearestDeadline: {
            $min: {
              $cond: [{ $gte: ['$analysis.deadline', '$$NOW'] }, '$analysis.deadline', null],
            },
          },
        },
      },
      { $sort: { 'latest.date': -1 } },
      {
        $facet: {
          rows: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ];

    const [res] = await InboundMail.aggregate(pipeline, { allowDiskUse: true });
    const rows = res?.rows || [];

    return NextResponse.json({
      success: true,
      mode: 'thread',
      items: await attachGroupSuggestions(rows.map((r: any) => ({
        ...r.latest,
        threadKey: r._id,
        threadCount: r.count,
        threadFirstDate: r.firstDate,
        threadDeadline: r.nearestDeadline || null,
      })), scope.accountIds),
      total: res?.total?.[0]?.n || 0,
      page,
      limit,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
