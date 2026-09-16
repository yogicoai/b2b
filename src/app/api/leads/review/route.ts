import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { EmailSchedule } from '@/models/EmailSchedule';

export const runtime = 'nodejs';

/**
 * 직접 검토 전용 API.
 *
 * 검증 완료 400여 곳을 표에서 한 줄씩 열고 닫으며 판단하면 지친다.
 * 한 곳씩 카드로 보여주고, 한 번 누르면 다음 곳으로 넘어가게 한다.
 *
 * ── 대기열 기준이 왜 바뀌었나 ──
 * 예전에는 readyForOutreach 가 false 인 것만 "아직 판단 안 한 것"으로 봤다.
 * 그런데 예전 스크립트가 검증 완료 전 건에 그 플래그를 켜 두어서, 418곳 중
 * 9곳만 대기열에 올라왔다. 버튼은 "400곳 검토" 처럼 보이는데 눌러보면 9곳에서
 * 끝나는 상태였다.
 *
 * 지금 기준은 단계 하나뿐이다 — stage 가 'verified' 면 아직 안 고른 것이다.
 * 고르고 나면 'queued'(메일 보낼 곳) 나 'failed'(검증 실패) 로 옮겨가므로
 * 자연히 대기열에서 빠진다. 판단의 결과가 곧 대기열의 정의가 된다.
 */

const REVIEW_PROJECTION = {
  leadId: 1, Company: 1, Region: 1, Email: 1, WebsiteContact: 1, Phone: 1,
  Type: 1, TypeKo: 1, Category: 1, Priority: 1,
  Evidence: 1, EvidenceKo: 1, Sources: 1, Confidence: 1,
  BrandsChannels: 1, notes: 1, importBatch: 1,
  recoScore: 1, recoReasons: 1, stage: 1,
  'verification.aiVerdict': 1, 'verification.aiReasoning': 1,
};

/** 보낼 수 있는 주소인가 — "Contact form on site" 같은 값을 거른다 */
const REAL_EMAIL = { Email: { $regex: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ } };

/**
 * 아직 안 고른 것.
 *
 * q/region 를 반드시 함께 받는다. 예전에는 목록(items)에만 조건을 얹고
 * 집계는 조건 없는 필터를 새로 만들어 썼는데, 그래서 스웨덴 12곳만 보면서
 * 진행바에는 "0 / 418" 이 떴다. 12곳을 다 판단해도 3% 에서 끝났다.
 * 보는 범위와 세는 범위는 같은 곳에서 나와야 한다.
 */
/**
 * 어느 풀을 검토하는가.
 *
 *  verified — AI 검증을 통과해 [AI 검증 완료]에 있는 곳 (기본)
 *  legacy   — 엑셀로 올린 것 중 아직 보낼 곳으로 고르지 않은 곳.
 *             AI 검증에서 '애매함'으로 남은 것이 대부분 여기 모인다.
 *             AI 서칭으로 들어온 건(ai-search-*)은 제 갈래가 따로 있어 뺀다.
 */
function sourceFilter(source?: string, batch?: string) {
  if (source === 'legacy') {
    return {
      // 올린 파일 하나를 열고 들어왔으면 **그 파일 안의 업체만** 본다.
      // 폴더를 열어놓고 검토를 눌렀는데 다른 파일 업체가 나오면
      // "내가 올린 그 목록을 보는 중" 이라는 전제가 깨진다.
      importBatch: batch ? batch : { $not: /^ai-search-/ },
      stage: { $in: ['imported', 'verifying', 'archived', 'ai-searched'] },
      // AI 가 무관으로 판정한 것은 뺀다.
      // 그건 [🚫 검증 실패] 화면이 보여주는 것과 같은 집합이라
      // (archived + not-fit), 여기에도 띄우면 같은 회사를 두 곳에서
      // 두 번 판단하게 된다.
      'verification.aiVerdict': { $ne: 'not-fit' },
      // [AI 검증 완료]에 같은 업체가 이미 있어 감춘 것도 뺀다 (같은 이유).
      legacyHiddenAt: { $exists: false },
      // ⚠️ 목록 API(legacy/route.ts NOT_HIDDEN)와 **같은 조건**이어야 한다.
      //    예전에는 이 두 줄이 없어서, 목록에서는 숨긴 업체가 검토 화면에는 떴다.
      //    dupHiddenAt  — 같은 업체가 이미 있어 숨긴 중복 (416곳)
      //    badEmailAt   — 주소가 그 회사 것이 아닌 곳 (83곳, 예: 'Ulta Beauty' 에 jubao@lingying.com)
      //    검토에서 [메일 보낼곳]을 누르면 **엉뚱한 사람에게 실제 메일이 나간다.**
      dupHiddenAt: { $exists: false },
      badEmailAt: { $exists: false },
    };
  }
  // 검증 완료에서도 중복으로 감춘 곳·엉뚱한 주소는 검토에 띄우지 않는다 (stage-counts reviewNeeded 와 같은 조건)
  return { stage: 'verified', dupHiddenAt: { $exists: false }, badEmailAt: { $exists: false } };
}

function buildPending(q?: string, region?: string, source?: string, batch?: string) {
  const f: any = { ...sourceFilter(source, batch), deleted: { $ne: true }, ...REAL_EMAIL };
  if (region && region !== 'All') f.Region = region;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ Company: rx }, { Region: rx }, { Email: rx }, { WebsiteContact: rx }];
  }
  return f;
}

/**
 * 화면 위쪽 숫자.
 *
 * remaining 은 지금 보고 있는 범위 기준(진행바의 분모).
 * queued/failed 는 전체 누적 — "지금까지 보낼 곳으로 몇 곳을 모았나" 는
 * 검색을 좁힌다고 줄어들 성질이 아니다.
 */
async function tallies(pending: any) {
  const [remaining, queued, failed] = await Promise.all([
    Lead.countDocuments(pending),
    Lead.countDocuments({ stage: 'queued', deleted: { $ne: true } }),
    // '검증 실패' 는 두 갈래를 합친 수다 — 탭 배지·목록(/api/leads?stage=__failed)과 같은 기준.
    // stage 'failed' 만 세서 탭은 955, 검토 화면은 790 으로 어긋났다.
    Lead.countDocuments({
      deleted: { $ne: true },
      $or: [{ stage: 'failed' }, { stage: 'archived', 'verification.aiVerdict': 'not-fit' }],
    }),
  ]);
  return { remaining, queued, failed };
}

/**
 * GET /api/leads/review?limit=30&skip=0&q=&region=
 *
 * 분류(category) 축은 뺐다. AI 가 이미 한 번 걸러낸 목록이라 분류를 또 고르는
 * 것은 단계만 하나 늘리는 일이었다. 대신 화면에서 검색·지역로 좁힌 조건을
 * 그대로 따른다 — 목록에서 보던 범위와 검토 대상이 어긋나면 안 된다.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '30')));
    const skip = Math.max(0, parseInt(searchParams.get('skip') || '0'));
    const q = (searchParams.get('q') || '').trim();
    const region = (searchParams.get('region') || '').trim();
    const source = (searchParams.get('source') || '').trim();
    const batch = (searchParams.get('batch') || '').trim();

    await dbConnect();

    const pending = buildPending(q, region, source, batch);

    const [items, counts] = await Promise.all([
      // 추천 우선순위 높은 것부터. 도중에 그만두더라도 값어치 있는 곳은
      // 이미 판단이 끝나 있게 된다. 점수가 같으면 나라로 묶어
      // 같은 시장을 연달아 보게 한다 (판단 기준이 덜 흔들린다).
      Lead.find(pending, REVIEW_PROJECTION)
        .sort({ recoScore: -1, Region: 1, Company: 1 })
        .skip(skip).limit(limit).lean(),
      tallies(pending),
    ]);

    return NextResponse.json({ success: true, items, ...counts, skip, limit });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/leads/review — 한 건 판단
 * Body: { leadId, decision: 'send' | 'reject' | 'later', force?: boolean }
 *
 *   send   → queued   (메일 보낼 곳으로 선정)
 *   reject → failed   (검증실패 업체로 선정)
 *   later  → archived (지금은 아님 · 보관함)
 *
 * 셋 다 지우지 않고 단계만 옮긴다. 되돌릴 수 있어야
 * "잘못 눌렀다"가 자료 손실이 되지 않는다.
 */
const DECISION_STAGE: Record<string, string> = {
  send: 'queued',
  reject: 'failed',
  later: 'archived',
};

const STAGE_LABEL: Record<string, string> = {
  verified: '검증 완료',
  queued: '보낼 메일',
  failed: '검증 실패',
  archived: '보관함',
  contacted: '발송 완료',
  replied: '답장 받음',
  negotiating: '협의 중',
  partner: '거래처',
};

/**
 * 다시 고를 수 있는 단계.
 *
 * 화면에 [‹ 이전] [다음 ›] 을 달면서 필요해졌다. 되돌아가는 이유는 대개
 * "방금 잘못 눌렀다" 이므로, verified 만 받으면 정작 고치러 온 건은 못 고친다.
 *
 * 메일이 이미 나간 뒤(contacted 이후)는 넣지 않는다. 보낸 사실은 되돌릴 수
 * 없는데 단계만 되돌리면 화면과 실제가 어긋난다.
 */
const REDECIDABLE = [
  'imported', 'ai-searched', 'verifying',   // 올린 데이터에서 바로 고를 때
  'verified', 'queued', 'failed', 'archived',
];

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  const { leadId, decision, force } = body || {};
  const nextStage = DECISION_STAGE[decision];
  // 화면이 보고 있는 범위. 이게 없으면 판정할 때마다 응답의 remaining 이
  // 전체 수로 덮어써져서, GET 에서 맞춰둔 진행바가 첫 판정에 다시 어긋난다.
  const pending = buildPending(
    typeof body?.q === 'string' ? body.q.trim() : '',
    typeof body?.region === 'string' ? body.region : '',
    typeof body?.source === 'string' ? body.source : '',
    typeof body?.batch === 'string' ? body.batch : '',
  );
  if (!leadId || !nextStage) {
    return NextResponse.json(
      { success: false, error: "leadId 와 decision('send'|'reject'|'later') 이 필요합니다" },
      { status: 400 },
    );
  }

  try {
    await dbConnect();

    const lead = await Lead.findOne(
      { leadId, deleted: { $ne: true } },
      { leadId: 1, Company: 1, stage: 1, emailHistory: 1 },
    ).lean<any>();

    if (!lead) {
      return NextResponse.json({ success: false, error: '해당 업체를 찾을 수 없습니다' }, { status: 404 });
    }

    // 이미 그 칸에 있으면 아무것도 하지 않는다.
    // 연타나 뒤로 갔다 같은 버튼을 다시 누른 경우가 여기다.
    if (lead.stage === nextStage) {
      return NextResponse.json({ success: true, moved: 0, stage: nextStage, ...(await tallies(pending)) });
    }

    if (!REDECIDABLE.includes(lead.stage)) {
      return NextResponse.json({
        success: false,
        error: `이미 [${STAGE_LABEL[lead.stage] || lead.stage}] 단계로 넘어간 업체라 여기서 바꿀 수 없습니다.`,
      }, { status: 409 });
    }

    const sentCount = (lead.emailHistory || []).filter((h: any) => h?.status === 'sent').length;
    if (sentCount > 0) {
      return NextResponse.json({
        success: false,
        error: `이 업체에는 이미 메일이 ${sentCount}회 나갔습니다. 보낸 것은 되돌릴 수 없어 단계를 바꾸지 않습니다.`,
      }, { status: 409 });
    }

    // 보낼 곳에서 빼는데 예약이 걸려 있으면, 그냥 두면 예약은 그대로 나간다.
    // "검증 실패로 뺐는데 메일이 갔다" 가 되므로 먼저 알리고 확인을 받는다.
    const pendingSchedules = nextStage === 'queued'
      ? 0
      : await EmailSchedule.countDocuments({ leadId, status: 'pending' });

    if (pendingSchedules > 0 && !force) {
      return NextResponse.json({
        success: false,
        needsConfirm: true,
        pendingSchedules,
        error: `이 업체에는 예약된 메일 ${pendingSchedules}통이 남아 있습니다. ` +
               `[${STAGE_LABEL[nextStage]}]로 옮기면 그 예약도 함께 취소됩니다.`,
      }, { status: 409 });
    }

    const now = new Date().toISOString();
    const r = await Lead.updateOne(
      { leadId, stage: { $in: REDECIDABLE }, deleted: { $ne: true } },
      { $set: { stage: nextStage, stageChangedAt: now } },
    );

    let canceledSchedules = 0;
    if (pendingSchedules > 0) {
      const c = await EmailSchedule.updateMany(
        { leadId, status: 'pending' },
        { $set: { status: 'canceled', canceledReason: `직접 검토에서 [${STAGE_LABEL[nextStage]}]로 이동` } },
      );
      canceledSchedules = c.modifiedCount;
    }

    return NextResponse.json({
      success: true,
      moved: r.modifiedCount,
      stage: nextStage,
      from: lead.stage,
      canceledSchedules,
      ...(await tallies(pending)),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '처리 실패' }, { status: 500 });
  }
}
