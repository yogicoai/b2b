import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { Lead } from '@/models/Lead';
import { CATEGORIES } from '@/lib/domain/categories';
import { STAGES } from '@/lib/stages';

export const runtime = 'nodejs';

/**
 * GET /api/categories — 카테고리 × 단계 집계.
 *
 * 화면이 묻는 것은 늘 "어느 타깃이 어디까지 갔나"다. 카테고리마다 따로 세면
 * 질의가 5번 나가므로 한 번의 집계로 끝낸다.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  await dbConnect();

  const rows = await Lead.aggregate([
    { $group: { _id: { category: '$category', stage: '$stage' }, n: { $sum: 1 } } },
  ]);

  const table: Record<string, Record<string, number>> = {};
  let uncategorized = 0;
  for (const r of rows) {
    const cat = r._id?.category || '';
    const stage = r._id?.stage || 'imported';
    if (!cat) { uncategorized += r.n; continue; }
    (table[cat] ||= {})[stage] = ((table[cat] ||= {})[stage] || 0) + r.n;
  }

  const categories = CATEGORIES.map((c) => {
    const byStage = table[c.key] || {};
    const total = Object.values(byStage).reduce((a, b) => a + b, 0);
    return { key: c.key, label: c.label, pitch: c.pitch, total, byStage };
  });

  return NextResponse.json({ success: true, categories, stages: STAGES, uncategorized });
}
