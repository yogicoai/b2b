import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 실제로 보낼 수 있는 주소인가 — "Contact form on site" 같은 값을 거른다 */
const REAL_EMAIL = [
  { Email: { $regex: '@' } },
  { Email: { $not: /^Not found/i } },
];

/**
 * POST /api/leads/queue — 리드를 발송 리스트(queued)로 옮긴다.
 *
 * 검증만 끝난 것(verified)과 "이제 보내도 된다"고 사람이 정한 것을 나눈다.
 * 이 구분이 없으면 검증 통과한 전 건이 곧바로 발송 대상이 되어, 고르는
 * 단계 자체가 사라진다.
 *
 * Body 두 가지 방식
 *   { leadIds: [...] }           → 고른 것만
 *   { all: true, q?, region? }  → 지금 검증 완료에 남아 있는 것 전부
 *                                  (화면에서 검색·지역로 좁혀 놨으면 그 범위만)
 *
 * undo: true 면 발송 리스트에서 빼서 검증 완료로 되돌린다.
 * 되돌리기는 'queued' 에서만 한다 — 이미 나간 곳(contacted)을 앞으로 돌리면
 * "안 보낸 곳"으로 보여 두 번 보내게 된다.
 */
export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}

  const ids: string[] = Array.isArray(body?.leadIds) ? body.leadIds : [];
  const all = body?.all === true;
  const undo = body?.undo === true;

  if (!all && !ids.length) {
    return NextResponse.json({ success: false, error: 'leadIds 또는 all 필요' }, { status: 400 });
  }

  try {
    await dbConnect();

    const from = undo ? ['queued'] : ['verified'];
    const to = undo ? 'verified' : 'queued';

    const filter: any = { stage: { $in: from }, deleted: { $ne: true } };
    const and: any[] = [];

    if (all) {
      // 화면에서 좁혀 놓은 범위를 그대로 따른다.
      // 검색 결과 12건을 보면서 "전체 옮기기"를 눌렀는데 418건이 옮겨지면
      // 무엇이 옮겨졌는지 알 수 없게 된다.
      const q = String(body?.q || '').trim();
      const region = String(body?.region || '').trim();
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        and.push({ $or: [{ Company: rx }, { Region: rx }, { Email: rx }, { WebsiteContact: rx }] });
      }
      if (region) filter.Region = region;
    } else {
      filter.leadId = { $in: ids };
    }

    // 메일 없는 곳은 옮겨도 보낼 수 없다 — 목록만 부풀린다
    if (!undo) and.push(...REAL_EMAIL);
    if (and.length) filter.$and = and;

    // 몇 건이 대상인지 먼저 세어 둔다 (all 일 때 skipped 계산용)
    const targetCount = await Lead.countDocuments(filter);

    const r = await Lead.updateMany(filter, {
      $set: { stage: to, stageChangedAt: new Date().toISOString() },
    });

    const [queuedTotal, verifiedTotal] = await Promise.all([
      Lead.countDocuments({ stage: 'queued', deleted: { $ne: true } }),
      Lead.countDocuments({ stage: 'verified', deleted: { $ne: true } }),
    ]);

    return NextResponse.json({
      success: true,
      moved: r.modifiedCount,
      // 고른 것 중 조건에 안 맞아 빠진 수 (메일 없음·이미 옮겨짐 등)
      skipped: all ? 0 : Math.max(0, ids.length - r.modifiedCount),
      targetCount,
      queuedTotal,
      verifiedTotal,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '이동 실패' }, { status: 500 });
  }
}

/**
 * GET /api/leads/queue/preview 대용 —
 * "지금 전체 옮기면 몇 건인가" 를 미리 알려준다.
 * 확인 창에 정확한 수를 띄우려면 옮기기 전에 세어야 한다.
 */
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const region = (searchParams.get('region') || '').trim();

    const filter: any = { stage: 'verified', deleted: { $ne: true } };
    const and: any[] = [...REAL_EMAIL];
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({ $or: [{ Company: rx }, { Region: rx }, { Email: rx }, { WebsiteContact: rx }] });
    }
    if (region) filter.Region = region;
    filter.$and = and;

    const [movable, verifiedTotal] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.countDocuments({ stage: 'verified', deleted: { $ne: true } }),
    ]);
    // 메일이 없어서 못 옮기는 수
    return NextResponse.json({
      success: true,
      movable,
      verifiedTotal,
      noEmail: Math.max(0, verifiedTotal - movable),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
