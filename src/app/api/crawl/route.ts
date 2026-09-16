import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { crawlCategory } from '@/lib/crawler/run';
import { naverHasCreds } from '@/lib/crawler/naver';
import { isCategoryKey } from '@/lib/domain/categories';
import { isRegion } from '@/lib/domain/regions';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/crawl — 화면에서 누르는 소규모 크롤.
 *
 * 전국 대량 크롤은 이 경로로 돌리지 않는다. 홈페이지 렌더에 건당 수 초가 걸려서
 * 키워드 × 17개 시·도를 한 요청 안에서 끝낼 수 없고, 배포(Vercel)에서는 브라우저
 * 바이너리도 없다. 대량 수집은 `npm run crawl:all`(로컬 스크립트) 몫이고,
 * 여기는 "키워드 하나 넣어보고 뭐가 걸리나 보는" 용도다.
 *
 * Body: { category, keywords?: string[], regions?: string[], withHomepage?, maxQueries? }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  if (!naverHasCreds()) {
    return NextResponse.json(
      { success: false, error: '네이버 검색 API 키가 없습니다 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET).' },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* 빈 본문이면 아래 검증에서 걸린다 */ }

  const category = body.category;
  if (!isCategoryKey(category)) {
    return NextResponse.json(
      { success: false, error: 'category 는 public|company|medical|resort|sports 중 하나여야 합니다.' },
      { status: 400 },
    );
  }

  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map(String).map((k) => k.trim()).filter(Boolean)
    : undefined;
  const regions = Array.isArray(body.regions)
    ? body.regions.map(String).filter(isRegion)
    : undefined;

  // 화면에서 도는 것이라 상한을 낮게 잡는다. 크게 돌리고 싶으면 스크립트를 쓴다.
  const maxQueries = Math.min(Number(body.maxQueries) || 10, 30);

  await dbConnect();
  try {
    const result = await crawlCategory({
      category,
      keywords,
      regions,
      withHomepage: body.withHomepage !== false,
      maxQueries,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
