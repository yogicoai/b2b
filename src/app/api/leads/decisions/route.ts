import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';

/**
 * GET /api/leads/decisions — 지금까지 판정한 결과를 되돌아보는 화면용.
 *
 * 왜 필요한가:
 * 상세 팝업에서 [메일 보낼곳으로 선정] / [검증실패 업체로 선정] 을 눌러가며
 * 수백 곳을 훑고 나면, 정작 "내가 뭘 골랐더라" 를 볼 곳이 없다. 잘못 누른 것도
 * 그때는 모르고 지나간다. 판정한 것만 최근 순으로 모아 보여주고, 거기서 바로
 * 되돌릴 수 있게 한다.
 *
 * 왜 날짜로 묶는가:
 * 이 데이터에는 사람이 고른 것과 정리 스크립트가 옮긴 것이 섞여 있다.
 * 필드만으로는 안 갈린다 — 9/8~9/9 에 스크립트가 옮긴 2,000건에도
 * bulkMoveReason 이 없는 것이 많고, 8/18 의 790건은 예전 AI 검증 결과다.
 * 대신 날짜로 묶으면 "오늘 내가 한 것"이 맨 위에 그대로 올라온다.
 * 사람이 판단하기엔 이쪽이 정확하다.
 */
const PROJECTION = {
  leadId: 1, Company: 1, Region: 1, Email: 1, WebsiteContact: 1,
  Type: 1, TypeKo: 1, Category: 1, stage: 1, stageChangedAt: 1,
  bulkMoveReason: 1, recoScore: 1, emailHistory: 1, inboundCount: 1,
};

/** 사람이 팝업에서 고를 수 있는 결과들 */
const DECIDED = ['queued', 'failed', 'archived'] as const;
type Decided = (typeof DECIDED)[number];

const isDecided = (v: string): v is Decided => (DECIDED as readonly string[]).includes(v);

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const days = Math.max(0, parseInt(searchParams.get('days') || '7', 10));
    const stageParam = searchParams.get('stage') || '';
    const limit = Math.min(500, parseInt(searchParams.get('limit') || '200', 10));

    // 기간 — 0 이면 전체
    const base: any = {
      deleted: { $ne: true },
      stage: { $in: DECIDED },
      stageChangedAt: { $exists: true, $ne: '' },
    };
    if (days > 0) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      base.stageChangedAt = { $gte: since };
    }

    // 탭 숫자는 단계 필터와 무관해야 한다 — 안 그러면 탭을 누를 때마다
    // 다른 탭 숫자가 0 으로 바뀐다 (전에 그렇게 동작했다).
    const agg = await Lead.aggregate([
      { $match: base },
      { $group: { _id: '$stage', n: { $sum: 1 } } },
    ]);
    const counts: Record<string, number> = { queued: 0, failed: 0, archived: 0 };
    for (const r of agg as any[]) if (isDecided(r._id)) counts[r._id] = r.n;

    // 목록은 고른 단계만
    const listFilter = { ...base };
    if (stageParam && isDecided(stageParam)) listFilter.stage = stageParam;

    const items = await Lead.find(listFilter, PROJECTION)
      .sort({ stageChangedAt: -1 })
      .limit(limit)
      .lean();

    // 날짜별 묶음 — 화면이 "며칠에 무엇을 골랐나"로 읽히게
    const byDayMap = new Map<string, Record<string, number>>();
    const dayAgg = await Lead.aggregate([
      { $match: base },
      {
        $group: {
          _id: { d: { $substr: ['$stageChangedAt', 0, 10] }, s: '$stage' },
          n: { $sum: 1 },
        },
      },
      { $sort: { '_id.d': -1 } },
      { $limit: 120 },
    ]);
    for (const r of dayAgg as any[]) {
      const d = r._id.d;
      if (!byDayMap.has(d)) byDayMap.set(d, { queued: 0, failed: 0, archived: 0 });
      const row = byDayMap.get(d)!;
      if (isDecided(r._id.s)) row[r._id.s] = r.n;
    }
    const byDay = [...byDayMap.entries()]
      .map(([date, c]) => ({ date, ...c, total: c.queued + c.failed + c.archived }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      success: true,
      items: items.map((l: any) => ({
        ...l,
        _id: String(l._id),
        sentCount: (l.emailHistory || []).filter((h: any) => h?.status === 'sent').length,
        emailHistory: undefined,
      })),
      counts,
      byDay,
      total: counts.queued + counts.failed + counts.archived,
      returned: items.length,
      days,
      stage: stageParam || 'all',
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
