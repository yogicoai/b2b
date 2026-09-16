import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { Keyword } from '@/models/Keyword';
import { CATEGORIES, isCategoryKey } from '@/lib/domain/categories';

export const runtime = 'nodejs';

/**
 * GET /api/keywords?category=
 * 카테고리별 키워드 목록. DB 가 비어 있으면 카테고리 정의의 시드 키워드를
 * `seeded: true` 로 함께 내려준다 — 화면에서 "아직 등록 안 됨"을 구분해 보여주려고.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const category = url.searchParams.get('category') || '';
  const filter = isCategoryKey(category) ? { category } : {};

  const rows = await Keyword.find(filter).sort({ category: 1, keyword: 1 }).lean();

  const byCategory = CATEGORIES.map((c) => {
    const saved = rows.filter((r) => r.category === c.key);
    return {
      key: c.key,
      label: c.label,
      pitch: c.pitch,
      keywords: saved.length
        ? saved.map((r) => ({
            id: String(r._id), keyword: r.keyword, active: r.active,
            foundCount: r.foundCount, lastCrawledAt: r.lastCrawledAt, seeded: false,
          }))
        : c.keywords.map((k) => ({ id: '', keyword: k, active: true, foundCount: 0, seeded: true })),
    };
  });

  return NextResponse.json({ success: true, categories: byCategory });
}

/** POST /api/keywords — { category, keyword } 추가 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* 아래 검증에서 걸린다 */ }

  const category = body.category;
  const keyword = String(body.keyword || '').trim();
  if (!isCategoryKey(category) || !keyword) {
    return NextResponse.json({ success: false, error: 'category·keyword 가 필요합니다.' }, { status: 400 });
  }

  await dbConnect();
  try {
    await Keyword.updateOne(
      { category, keyword },
      { $setOnInsert: { category, keyword, active: true, foundCount: 0, createdAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

/** PATCH /api/keywords — { id, active } 켜고 끄기 */
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* 아래 검증에서 걸린다 */ }
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ success: false, error: 'id 가 필요합니다.' }, { status: 400 });

  await dbConnect();
  await Keyword.updateOne({ _id: id }, { $set: { active: body.active !== false } });
  return NextResponse.json({ success: true });
}

/** DELETE /api/keywords?id= */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ success: false, error: 'id 가 필요합니다.' }, { status: 400 });

  await dbConnect();
  await Keyword.deleteOne({ _id: id });
  return NextResponse.json({ success: true });
}
