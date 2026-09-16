import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { runCrawlJob, resolveKeywords } from '@/lib/crawler/run';
import { naverHasCreds } from '@/lib/crawler/naver';
import { isCategoryKey, getCategory } from '@/lib/domain/categories';
import { REGIONS } from '@/lib/domain/regions';
import { CrawlJob, aiCostKrw } from '@/models/CrawlJob';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 크롤링 = 발굴 + 이메일 추출 + AI 검증까지 한 번에.
 *
 * 한 번 돌면 15분이 넘게 걸린다. HTTP 요청 하나가 그걸 기다릴 수 없으므로
 * (브라우저가 먼저 끊는다) 작업을 띄워 두고 jobId 만 바로 돌려준다.
 * 화면은 GET 으로 진행률을 읽는다.
 *
 * GET  /api/crawl?jobId=...   진행률
 * GET  /api/crawl?estimate=1&category=...&keywords=a,b   실행 전 예상치
 * POST /api/crawl             { category, keywords?, maxQueries? } → { jobId }
 */

/** 한 검색 조합이 돌려주는 업체 수 (네이버 지역검색은 한 번에 최대 5) */
const PLACES_PER_QUERY = 5;
/** 이 중 몇 곳에서 이메일이 나오는지 — 첫 크롤을 돌려 실측하면 여기를 고친다 */
const EMAIL_HIT_RATE = 0.4;
/** 홈페이지 한 곳 여는 데 걸리는 시간(초) — 렌더 대기 1.2초 + 서브페이지 */
const SECONDS_PER_HOMEPAGE = 6;
/** AI 검증 한 건 (토큰 기준 추정) */
const AI_TOKENS_PER_LEAD = { input: 900, output: 150 };

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const url = new URL(req.url);
  await dbConnect();

  // ── 실행 전 예상치 ──────────────────────────────────────
  // 돈과 시간이 나가는 일이라, 누르기 전에 얼마나 드는지 보여준다.
  if (url.searchParams.get('estimate')) {
    const category = url.searchParams.get('category') || '';
    if (!isCategoryKey(category)) {
      return NextResponse.json({ success: false, error: '카테고리를 골라 주세요.' }, { status: 400 });
    }
    const typed = (url.searchParams.get('keywords') || '')
      .split(',').map((k) => k.trim()).filter(Boolean);
    const keywords = typed.length ? typed : await resolveKeywords(category);

    const queries = keywords.length * REGIONS.length;
    const found = queries * PLACES_PER_QUERY;
    const withEmail = Math.round(found * EMAIL_HIT_RATE);
    const costKrw = aiCostKrw(
      withEmail * AI_TOKENS_PER_LEAD.input,
      withEmail * AI_TOKENS_PER_LEAD.output,
    );
    const minutes = Math.ceil((found * SECONDS_PER_HOMEPAGE) / 60);

    return NextResponse.json({
      success: true,
      keywords,
      usingDefaults: typed.length === 0,
      regions: REGIONS.length,
      queries,
      found,
      withEmail,
      aiCount: withEmail,
      costKrw,
      minutes,
      /** 추정치의 근거 — 화면에서 "왜 이 숫자인가"를 설명할 수 있어야 한다 */
      basis: `조합당 ${PLACES_PER_QUERY}곳 · 이메일 확보율 ${Math.round(EMAIL_HIT_RATE * 100)}% 가정`,
    });
  }

  // ── 진행률 ──────────────────────────────────────────────
  const jobId = url.searchParams.get('jobId');
  if (jobId) {
    const job = await CrawlJob.findOne({ jobId }).lean() as Record<string, any> | null;
    if (!job) return NextResponse.json({ success: false, error: '작업을 찾을 수 없습니다.' }, { status: 404 });
    return NextResponse.json({
      success: true,
      job: { ...job, costKrw: aiCostKrw(job.inputTokens || 0, job.outputTokens || 0) },
    });
  }

  // ── 최근 작업 (화면을 다시 열었을 때 돌고 있던 것을 되찾는다) ──
  const recent = await CrawlJob.find({}).sort({ startedAt: -1 }).limit(5).lean();
  return NextResponse.json({ success: true, jobs: recent });
}

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
  try { body = await req.json(); } catch { /* 아래 검증에서 걸린다 */ }

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

  await dbConnect();

  // 같은 카테고리가 이미 돌고 있으면 또 띄우지 않는다.
  // 두 작업이 같은 업체를 동시에 집으면 중복 검사가 소용없어진다.
  const running = await CrawlJob.findOne({ category, status: 'running' }).lean() as Record<string, any> | null;
  if (running) {
    return NextResponse.json({
      success: false,
      error: `${getCategory(category)?.label} 크롤링이 이미 돌고 있습니다.`,
      jobId: running.jobId,
    }, { status: 409 });
  }

  const jobId = `crawl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await CrawlJob.create({
    jobId,
    category,
    keywords: keywords || [],
    status: 'running',
    phase: '준비 중',
    createdBy: user,
  });

  // 기다리지 않는다 — 작업은 응답을 보낸 뒤에도 계속 돈다.
  // (Vercel 서버리스에서는 응답과 함께 함수가 죽으므로 이 경로는 로컬/워커 전용이다)
  void runCrawlJob({
    category,
    keywords,
    jobId,
    maxQueries: Math.min(Number(body.maxQueries) || 400, 400),
  });

  return NextResponse.json({ success: true, jobId });
}
