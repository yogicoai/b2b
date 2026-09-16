import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, mailFilter, UNAUTHORIZED, type MailScope } from '@/lib/mail/scope';

// 리스트 뷰에서 필요한 필드만 프로젝션 — 5MB+ 감소, 3~5x 응답 속도 개선
// 상세 뷰는 개별 조회 (모달) 시 전체 필드 반환.
// 리스트 뷰에서 실제로 화면에 렌더되는 필드만 · aiReasoning (긴 텍스트) 등 제외
// 상세는 개별 GET /api/leads/[id] 에서 전체 반환.
const LIST_PROJECTION = {
  // 발송 우선순위 — 목록에서 바로 배지로 보여준다
  recoScore: 1, recoReasons: 1, Category: 1,
  // 근거·업종의 한국어본 (화면은 이쪽을 우선 표시)
  EvidenceKo: 1, TypeKo: 1,
  // AI 판정 사유 — 이미 한국어로 저장돼 있는데 화면에 안 나오고 있었다.
  // 검증 실패 화면에서 "왜 실패했나"를 설명하는 유일한 근거다.
  // (aiVerdict 는 아래 검증 배지용으로 이미 들어 있다)
  'verification.aiReasoning': 1,
  // 필수 식별/표시
  leadId: 1, Company: 1, Region: 1,
  BuyerContact: 1, Title: 1, Email: 1, Phone: 1,
  WebsiteContact: 1,
  // CRM 상태
  status: 1, lastContact: 1, favorite: 1,
  // 파이프라인 stage
  stage: 1, readyForOutreach: 1,
  importBatch: 1,
  // 크롤링 상태 (티어 판정 · 배지)
  crawledEmails: 1, crawledAt: 1,
  // 발송 이력 (배지 카운터 표시용 · status 만 필요하지만 mongoose 는 배열 서브셋 프로젝션이 까다로워서 전체 포함)
  emailHistory: 1,
  lastEmailSentAt: 1,
  // 받은 답장 지표 — 목록의 💬 대화 배지와 "회신 필요" 표시에 쓴다.
  // (본문은 InboundMail 에 있고 여기선 개수·시각만 필요하다)
  inboundCount: 1,
  lastInboundAt: 1,
  needsReply: 1,
  replyDeadline: 1,
  // 검증 배지 (verifyBucketOf 최소 필드)
  'verification.aiVerdict': 1, 'verification.aiVerifiedAt': 1,
  'verification.verifiedAt': 1, 'verification.score': 1,
  // (aiReasoning · businessLevel · emailValid · websiteAlive · phoneMatch · linkedinValid · aiConfidence
  //  → 상세뷰에서만 사용 · 리스트 payload 에서 제거)
  createdAt: 1, deleted: 1,
} as const;

/**
 * 목록의 답장 지표(inboundCount · lastInboundAt · needsReply · replyDeadline)를
 * 로그인한 아이디의 메일 기준으로 고친다 (아이디별 메일 분리, 2026-09-14).
 *
 * 왜 필요한가:
 * 이 네 값은 수집할 때(lib/mail/ingest.ts) Lead 문서에 미리 적어 두는데, 그때는
 * 어느 계정으로 받은 메일인지 가리지 않고 센다. 리드 목록은 모두가 함께 보므로
 * 그대로 내려보내면 "💬 답장 3통 ⚠" 배지로 남의 메일함에 온 답장 수와
 * 회신 필요 여부가 보인다.
 *
 * 매번 전부 다시 세면 목록이 느려지므로, 남의 계정 메일이 실제로 붙어 있는
 * 리드만 골라 내 메일로 다시 센다. 나머지는 저장된 값이 곧 내 값이다.
 *
 * ⚠️ 상세(src/app/api/leads/[id]/route.ts)에 같은 함수의 복사본이 있다 — 고치면 둘 다 고친다.
 */
async function scopeMailStats(leads: any[], scope: MailScope): Promise<void> {
  // 저장된 지표가 비어 있으면 드러날 것이 없다 — 대상만 추린다
  const touched = leads.filter((l) =>
    l && l.leadId && ((l.inboundCount || 0) > 0 || l.lastInboundAt || l.needsReply || l.replyDeadline));
  if (!touched.length) return;

  // 남의 계정(범위 밖) 메일이 하나라도 붙은 리드.
  // 휴지통 것도 포함한다 — 저장된 lastInboundAt·needsReply 는 휴지통 여부와 무관하게 적힌다.
  // 방향도 가리지 않는다 — 받은 메일만 보면 남의 메일 흔적이 붙은 리드를 놓쳐 저장값이 그대로 나간다.
  // (다시 셀 때는 아래 $match 처럼 받은 메일만 센다)
  const foreign: string[] = await InboundMail.distinct('leadId', {
    leadId: { $in: touched.map((l) => l.leadId) },
    accountId: { $nin: scope.accountIds },
  });
  if (!foreign.length) return;

  const now = new Date();
  const agg: any[] = await InboundMail.aggregate([
    // ingest 가 inboundCount 를 셀 때와 같은 조건 + 내 계정 메일만
    { $match: { leadId: { $in: foreign }, direction: 'in', trashedAt: null, ...mailFilter(scope) } },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: '$leadId',
        n: { $sum: 1 },
        lastIn: { $first: '$date' },
        // 저장값도 "마지막으로 받은 메일" 의 판정이다
        lastNeedsReply: { $first: '$analysis.needsReply' },
        // 아직 안 지난 기한 중 가장 이른 것 (Lead.replyDeadline 의 뜻). $min 은 null 을 건너뛴다
        deadline: { $min: { $cond: [{ $gte: ['$analysis.deadline', now] }, '$analysis.deadline', null] } },
      },
    },
  ]);
  const by = new Map(agg.map((r) => [r._id, r]));
  const foreignSet = new Set(foreign);

  for (const l of touched) {
    if (!foreignSet.has(l.leadId)) continue;
    const r = by.get(l.leadId);
    // 내 메일이 한 통도 없으면 답장이 없는 리드로 보인다
    l.inboundCount = r?.n || 0;
    l.lastInboundAt = r?.lastIn ? new Date(r.lastIn).toISOString() : '';
    l.needsReply = Boolean(r?.lastNeedsReply);
    l.replyDeadline = r?.deadline ? new Date(r.deadline).toISOString() : '';
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50000');
    const full = searchParams.get('full') === '1';
    // 정렬 — 'reco' 면 발송 우선순위(recoScore) 높은 순.
    // 점수는 미리 계산해 저장해 둔다(scripts/rebuild-reco.mjs). 매번 계산하면
    // 정렬·페이지네이션을 DB 에 맡길 수 없어 전 건을 메모리로 올려야 한다.
    // 타입은 Record<string, SortOrder> 로 고정한다. 삼항으로 두 객체를 만들면
    // 유니온 타입이 되어 mongoose 의 sort() 시그니처와 맞지 않는다.
    // reco    — 발송 우선순위 높은 순
    // region — 같은 나라끼리 묶어서 (나라 안에서는 다시 우선순위 순)
    // 그 외    — 최근 등록순
    const sortKey = searchParams.get('sort');
    const sort: Record<string, 1 | -1> =
      sortKey === 'reco'    ? { recoScore: -1, Region: 1, Company: 1 } :
      sortKey === 'region' ? { Region: 1, recoScore: -1, Company: 1 } :
                              { createdAt: -1 };
    const stage = searchParams.get('stage');
    const sub = searchParams.get('sub');
    const tier = searchParams.get('tier');   // 'A' | 'B' | 'C' (verified 전용)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));

    // 검색어 — 단계 안에서 좁히는 용도.
    // 이게 없던 동안에는 검색하면 화면이 통째로 '전체 리드'로 튕겨서,
    // 검증 완료 409건을 보다가 갑자기 보관함까지 섞인 6,073건을 보게 됐다.
    const q = (searchParams.get('q') || '').trim();
    // 지역 — 화면 필터에 있는데 서버가 안 받아서 골라도 아무 일이 없었다
    const region = (searchParams.get('region') || '').trim();

    // 지운 건은 어느 화면에도 나오면 안 된다.
    // 이게 없던 동안에는 중복 정리로 deleted=true 를 붙인 2,771건이 보관함
    // 목록에 그대로 떠서, 정리를 하고도 숫자가 줄지 않았다.
    // (화면 쪽에서 l.deleted 로 한 번 더 거르는 곳이 있지만, 서버가 내려보내면
    //  total 과 페이지 수가 이미 틀어져 "50건씩 122페이지" 같은 값이 나온다.)
    const filter: any = { deleted: { $ne: true } };
    const and: any[] = [];
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { Company: rx }, { Region: rx }, { Email: rx },
        { BuyerContact: rx }, { BrandsChannels: rx }, { WebsiteContact: rx },
      ];
    }
    if (region && region !== 'All') filter.Region = region;
    if (stage === '__failed') {
      // 검증 실패는 두 갈래로 쌓여 있다. 하나만 보여주면 배지(841)와 목록이 어긋난다.
      //   · stage 'failed'                     790건 — 대부분 보낼 메일 주소가 없어 걸러진 것
      //     ("Contact form on site" 332 · "Not found publicly" 161 · 빈칸 103 …)
      //     AI 판정으로는 759건이 오히려 target-fit 다.
      //   · archived + aiVerdict 'not-fit'    51건 — AI 가 K-뷰티 무관으로 본 것
      // 사이드바 배지는 원래 둘을 합쳐 세고 있었는데 목록은 뒤쪽만 보여줘서,
      // 790건이 숫자에만 있고 어느 화면에서도 열리지 않았다.
      const failedOr = [
        { stage: 'failed' },
        { stage: 'archived', 'verification.aiVerdict': 'not-fit' },
      ];
      if (filter.$or) { and.push({ $or: filter.$or }); delete filter.$or; }
      and.push({ $or: failedOr });
    } else if (stage) {
      filter.stage = stage;
    }
    if (stage === 'verifying') {
      if (sub === 'unverified') {
        if (filter.$or) { filter.$and = [...(filter.$and || []), { $or: filter.$or }]; delete filter.$or; }
        filter.$or = [
          { 'verification.aiVerifiedAt': { $exists: false } },
          { 'verification.aiVerifiedAt': '' },
        ];
      } else if (sub === 'maybe') {
        filter['verification.aiVerdict'] = 'maybe';
      }
    } else if (stage === 'verified') {
      if (sub === 'approved') filter.readyForOutreach = true;
      else if (sub === 'pending') filter.readyForOutreach = { $ne: true };
      else if (sub === 'no-email') {
        // 검색어의 $or 와 충돌하지 않게 $and 로 합친다 — 그냥 덮으면 검색이 무시된다
        const noEmail = [{ Email: '' }, { Email: /^Not found/i }, { Email: { $exists: false } }];
        if (filter.$or) { filter.$and = [...(filter.$and || []), { $or: filter.$or }, { $or: noEmail }]; delete filter.$or; }
        else filter.$or = noEmail;
      }
    }

    if (and.length) filter.$and = [...(filter.$and || []), ...and];

    await dbConnect();

    // 리드는 공용이지만 목록에 붙는 답장 지표는 내 메일 기준이어야 한다 (scopeMailStats)
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // ── tier 필터 (verified 전용, 계산 필드라 별도 처리) ──
    if (stage === 'verified' && (tier === 'A' || tier === 'B' || tier === 'C')) {
      const { getLeadTier } = await import('@/lib/lead-tier');
      const allMatching = await Lead.find(filter, { Company: 1, Email: 1, WebsiteContact: 1 }).lean();
      const matchIds = allMatching.filter((l) => getLeadTier(l as any) === tier).map((l) => l._id);
      const tierFilter = { ...filter, _id: { $in: matchIds } };
      const skip = (page - 1) * limit;
      const query = Lead.find(tierFilter).sort(sort).skip(skip).limit(limit).lean();
      // full 이어도 threadKeys 는 뺀다 — 남의 계정으로 오간 대화의 스레드 키까지 들어 있다
      query.select(full ? '-threadKeys' : LIST_PROJECTION);
      const leads = await query.exec();
      await scopeMailStats(leads as any[], scope);
      const total = matchIds.length;
      return NextResponse.json({
        success: true,
        data: leads,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    // idsOnly — 상세 팝업에서 "다음 업체"로 넘길 순서를 받아가는 용도.
    // 418건을 전부 훑으려면 목록이 필요한데, 표시용 필드까지 다 내리면
    // 수 MB 가 오간다. 식별자만 순서대로 준다.
    if (searchParams.get('idsOnly') === '1') {
      const rows = await Lead.find(filter, { leadId: 1 }).sort(sort).limit(20000).lean();
      return NextResponse.json({
        success: true,
        ids: rows.map((r: any) => ({ leadId: r.leadId, _id: String(r._id) })),
        total: rows.length,
      });
    }

    // 지역 목록은 달라고 할 때만 센다 — 페이지를 넘길 때마다 집계할 이유가 없다
    const regionFacet = searchParams.get('countries') === '1';

    const skip = (page - 1) * limit;
    const query = Lead.find(filter)
      .sort(sort)
      .skip(stage ? skip : 0)
      .limit(limit)
      .lean();
    // full 이어도 threadKeys 는 뺀다 — 남의 계정으로 오간 대화의 스레드 키까지 들어 있다
    query.select(full ? '-threadKeys' : LIST_PROJECTION);

    const [leads, total, countries] = await Promise.all([
      query.exec(),
      // estimatedDocumentCount 는 필터를 못 받아 지운 건까지 센다.
      // 그래서 전체 화면 상단이 6,073 으로 떴다 (실제로 볼 수 있는 건 3,302).
      Lead.countDocuments(filter),
      // ── 지역 목록 ──
      // 화면의 [지역] 칸은 브라우저가 들고 있는 전체 리드에서 뽑아 채웠다.
      // 그런데 첫 화면이 전체를 받지 않게 되면서(3.3MB → 45KB) 그 배열이 비어
      // 지역 칸에 'All' 하나만 남았다.
      //
      // **지금 보고 있는 범위**로 센다 — 검증 성공에서는 성공한 곳의 지역,
      // 검증 실패로 넘어가면 실패한 곳의 지역가 뜬다. 목록에 없는 나라가
      // 고를 수 있게 떠 있으면 골라도 0건이 나온다.
      regionFacet
        ? Lead.aggregate([
            { $match: filter },
            { $group: { _id: '$Region', n: { $sum: 1 } } },
            { $match: { _id: { $nin: [null, ''] } } },
            { $sort: { n: -1 } },
            { $limit: 300 },
          ])
        : Promise.resolve([]),
    ]);
    await scopeMailStats(leads as any[], scope);

    return NextResponse.json({
      success: true,
      data: leads,
      total,
      page: stage ? page : 1,
      limit,
      totalPages: stage ? Math.max(1, Math.ceil(total / limit)) : 1,
      countries: (countries as any[]).map((c) => ({ region: c._id, n: c.n })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await dbConnect();
    
    // Auto-generate leadId if not provided
    if (!body.leadId) {
      body.leadId = `lead-${Date.now()}`;
    }
    
    const lead = await Lead.create(body);
    return NextResponse.json({ success: true, data: lead });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
