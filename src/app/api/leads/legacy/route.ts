import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';

/**
 * 기존 데이터 — 클라이언트가 원래 가지고 있던 CSV 업로드분.
 *
 * 대부분 중복 정리·일괄 이동으로 보관함에 들어가 있다. 지운 게 아니므로
 * "이건 살려서 보내자" 싶은 걸 골라 발송대기로 되돌릴 수 있어야 한다.
 *
 * AI 서칭으로 새로 발굴한 건(importBatch = ai-search-*)은 여기서 제외한다.
 * 그건 [발송 대기]에서 보는 것이고, 여기는 '예전 것'을 뒤지는 자리다.
 */

const NOT_AI = { importBatch: { $not: /^ai-search-/ } };

/**
 * 지운 건은 빼고 센다.
 *
 * 이게 없던 동안에는 중복 정리로 deleted=true 를 붙인 건까지 폴더 숫자에 잡혀서,
 * 정리를 하고도 화면 숫자가 그대로였다. 지운 것이 다시 보이면 "정리가 안 됐나"
 * 하고 또 지우게 된다.
 */
const NOT_DELETED = { deleted: { $ne: true } };

/**
 * 기존 데이터의 Email 칸에는 주소가 아닌 말이 섞여 있다 —
 * "Contact form on site" 1243건, "Not found publicly" 550건, "DM via Instagram" 112건 …
 * 5068건 중 2497건이 이런 값이다. 크롤링 담당자가 '연락 방법'을 적어둔 것이라
 * 비어 있지 않다는 이유로 통과시키면 발송대기에 쌓였다가 전부 발송 실패한다.
 * 그래서 "칸이 비었나"가 아니라 "실제 주소 형태인가"로 거른다.
 */
const REAL_EMAIL = { Email: { $regex: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ } };

/**
 * 정리 과정에서 걸러낸 것들 (scripts/dedup-legacy.mjs).
 * 지운 게 아니라 표시만 해 둔 것이라, 필드를 지우면 다시 보인다.
 *
 *  dupHiddenAt — 같은 회사·같은 주소가 여러 건 (2571건이 실제로는 660곳이었다)
 *  badEmailAt  — 주소 하나가 서로 다른 회사 수십 곳에 붙어 있음.
 *                dev7561@gmail.com 이 이집트·키프로스·부르키나파소 회사에 동시에 달려 있었다.
 *                회사는 진짜지만 주소가 그 회사 것이 아니므로 보내면 엉뚱한 사람에게 간다.
 */
/**
 * legacyHiddenAt — [AI 검증 완료]에 같은 업체가 이미 있어서 이쪽에서 감춘 것.
 *
 * 같은 회사가 두 곳에 뜨면 두 번 판단하게 되고, 더 나쁘게는 한쪽에서 "보낼 곳",
 * 다른 쪽에서 "검증 실패"로 골라 서로 엇갈린다. 뒤 단계인 검증 완료 쪽을 남긴다.
 * (scripts/dedup-verified-vs-legacy.mjs — 이메일 일치 우선, 그다음 회사명+지역)
 */
const NOT_HIDDEN = {
  dupHiddenAt: { $exists: false },
  badEmailAt: { $exists: false },
  legacyHiddenAt: { $exists: false },
};

const LIST_PROJECTION = {
  leadId: 1, Company: 1, Region: 1, Email: 1, WebsiteContact: 1, Phone: 1,
  Type: 1, Category: 1, stage: 1, importBatch: 1, Evidence: 1,
  dedupReason: 1, bulkMoveReason: 1,
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const batch = searchParams.get('batch') || '';
    const q = (searchParams.get('q') || '').trim();
    const region = searchParams.get('region') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    await dbConnect();

    // 배치를 고르지 않았으면 배치 목록만 (어디에 뭐가 있는지 먼저 보여준다)
    if (!batch) {
      const batches = await Lead.aggregate([
        { $match: { ...NOT_AI, ...NOT_DELETED } },
        {
          $group: {
            _id: '$importBatch',
            total: { $sum: 1 },
            // 실제 주소 형태인 것만 센다 (위 REAL_EMAIL 주석 참고)
            // 실제로 보낼 수 있는 곳 = 주소 형태 + 중복/오염 제외
            withEmail: {
              $sum: { $cond: [{ $and: [
                { $regexMatch: { input: { $ifNull: ['$Email', ''] }, regex: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ } },
                { $eq: [{ $type: '$dupHiddenAt' }, 'missing'] },
                { $eq: [{ $type: '$badEmailAt' }, 'missing'] },
                // 검증 완료에 같은 업체가 있어 감춘 것도 숫자에서 뺀다.
                // 목록에서는 안 보이는데 폴더 숫자에만 남으면, 열어봤을 때
                // "3건이라더니 왜 1건이지" 가 된다.
                { $eq: [{ $type: '$legacyHiddenAt' }, 'missing'] },
              ] }, 1, 0] },
            },
            archived: { $sum: { $cond: [{ $eq: ['$stage', 'archived'] }, 1, 0] } },
            last: { $max: '$createdAt' },     // 올린 시각 — 목록을 최신순으로 세우는 기준
            live: {
              $sum: {
                $cond: [
                  { $in: ['$stage', ['verified', 'queued', 'contacted', 'replied', 'negotiating', 'partner']] },
                  1, 0,
                ],
              },
            },
          },
        },
        { $match: { total: { $gte: 3 } } },   // 테스트로 한두 건 들어간 배치는 잡음이다
        // **방금 올린 파일이 맨 위**에 와야 한다 — 건수 순으로 두면 새로 올린 파일이 큰 파일들 밑에 묻혀
        // "왜 안 올라갔지" 가 된다 (대표님 2026-09-15). 올린 시각이 없는 옛 배치는 이름(날짜)으로 잇는다.
        { $sort: { last: -1, _id: -1 } },
      ]);
      return NextResponse.json({ success: true, mode: 'batches', batches });
    }

    // 배치 안의 리드 목록. 이메일 없는 건은 보내지 못하므로 기본에서 뺀다.
    const query: any = { ...NOT_AI, ...NOT_DELETED, importBatch: batch, ...REAL_EMAIL, ...NOT_HIDDEN };
    if (region) query.Region = region;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ Company: rx }, { Email: rx }, { WebsiteContact: rx }];
    }

    const [items, total, countries] = await Promise.all([
      Lead.find(query, LIST_PROJECTION).sort({ Region: 1, Company: 1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      Lead.countDocuments(query),
      Lead.aggregate([
        { $match: { ...NOT_AI, ...NOT_DELETED, importBatch: batch, ...REAL_EMAIL, ...NOT_HIDDEN } },
        { $group: { _id: '$Region', n: { $sum: 1 } } },
        { $sort: { n: -1 } }, { $limit: 30 },
      ]),
    ]);

    return NextResponse.json({ success: true, mode: 'leads', items, total, page, limit, countries });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/leads/legacy — 올린 업체를 고른 단계로 옮긴다.
 * Body: { leadIds: string[], stage?: 'verified' | 'queued' | 'replied' | 'negotiating' | 'partner' | 'failed' | 'archived' }
 *
 * stage 를 안 넘기면 예전처럼 'verified'(AI 검증 완료).
 * 올린 화면에서 바로 [2차 검토]·[발송 관리]·[대화 진행 중] 등으로 보낼 수 있게 열어 둔다 (대표님 요청 2026-09-15).
 *
 * 사람이 직접 고른 것이므로 발송 단계(verified·queued)로 보낼 때는 승인(readyForOutreach)까지 같이 준다.
 * 되돌릴 수 있게 이전 stage 를 남긴다.
 */
/** 올린 화면에서 옮길 수 있는 단계 — 화면에 없는 단계(imported·verifying)로 보내면 업체가 사라진 것처럼 된다 */
const LEGACY_MOVE_STAGES = ['verified', 'queued', 'replied', 'negotiating', 'partner', 'failed', 'archived'] as const;
/** 실제 메일 주소가 있어야만 보낼 수 있는 단계 (발송 대상) */
const NEEDS_EMAIL = ['verified', 'queued'];
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  const ids: string[] = Array.isArray(body?.leadIds) ? body.leadIds : [];
  if (!ids.length) {
    return NextResponse.json({ success: false, error: 'leadIds 필요' }, { status: 400 });
  }
  const stage: string = String(body?.stage || 'verified');
  if (!LEGACY_MOVE_STAGES.includes(stage as any)) {
    return NextResponse.json({ success: false, error: `옮길 수 없는 단계입니다: ${stage}` }, { status: 400 });
  }
  const needsEmail = NEEDS_EMAIL.includes(stage);

  try {
    await dbConnect();
    const now = new Date();

    // 주소가 아닌 값("Contact form on site" 등)이 섞여 들어오면
    // 발송대기에 보낼 수 없는 채로 쌓였다가 전부 발송 실패한다.
    const targets = await Lead.find(
      { leadId: { $in: ids }, ...(needsEmail ? REAL_EMAIL : {}), ...NOT_HIDDEN },
      { leadId: 1, stage: 1, becamePartnerAt: 1 },
    ).lean();

    const ops = targets.map((t: any) => {
      const set: any = {
        stage,
        stageChangedAt: now.toISOString(),
        updatedInfoAt: now.toISOString(),
        restoredFrom: t.stage,      // 되돌리기용
        restoredAt: now,
      };
      // 발송 단계로 보낼 때만 승인, 파트너·보관·실패는 자동 발송 대상에서 빼둔다 (leads/[id]/stage 와 같은 규칙)
      if (needsEmail) set.readyForOutreach = true;
      if (['partner', 'archived', 'failed'].includes(stage)) set.readyForOutreach = false;
      if (stage === 'partner' && !t.becamePartnerAt) set.becamePartnerAt = now.toISOString();
      return { updateOne: { filter: { leadId: t.leadId }, update: { $set: set } } };
    });

    if (!ops.length) {
      return NextResponse.json(
        {
          success: false,
          error: needsEmail
            ? '이동할 수 있는 업체가 없습니다 (발송 단계로는 실제 메일 주소가 있는 곳만 옮길 수 있습니다)'
            : '이동할 수 있는 업체가 없습니다',
        },
        { status: 400 },
      );
    }

    const r = await Lead.bulkWrite(ops);
    const verified = await Lead.countDocuments({ stage: 'verified' });

    return NextResponse.json({
      success: true,
      stage,
      moved: r.modifiedCount,
      skipped: ids.length - ops.length,
      verified,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '이동 실패' }, { status: 500 });
  }
}
