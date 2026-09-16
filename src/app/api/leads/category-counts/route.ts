import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { CATEGORIES } from '@/lib/domain/categories';

export const runtime = 'nodejs';

/**
 * GET /api/leads/category-counts?stage=verified
 *
 * 리드 목록 위 카테고리 탭에 붙일 숫자. 지금 보고 있는 단계 안에서만 센다 —
 * 탭에 전체 건수를 띄우면 "기업 244" 를 눌렀는데 목록에 12건만 나오는,
 * 숫자와 목록이 어긋나는 화면이 된다.
 *
 * stage 를 안 주면 전 단계 합계.
 */
export async function GET(req: Request) {
  await dbConnect();

  const stage = (new URL(req.url).searchParams.get('stage') || '').trim();
  const match: Record<string, unknown> = { deleted: { $ne: true } };

  if (stage === '__failed') {
    // 목록 쪽과 같은 규칙으로 세야 한다 (api/leads/route.ts 참고)
    match.$or = [
      { stage: 'failed' },
      { stage: 'archived', 'verification.aiVerdict': 'not-fit' },
    ];
  } else if (stage) {
    match.stage = stage;
  }

  const rows = await Lead.aggregate([
    { $match: match },
    { $group: { _id: '$category', n: { $sum: 1 } } },
  ]);

  const byKey: Record<string, number> = {};
  let uncategorized = 0;
  let total = 0;
  for (const r of rows) {
    total += r.n;
    if (!r._id) { uncategorized += r.n; continue; }
    byKey[r._id] = r.n;
  }

  return NextResponse.json({
    success: true,
    total,
    uncategorized,
    categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label, n: byKey[c.key] || 0 })),
  });
}
