import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { runCrawlJob, resolveKeywords } from '@/lib/crawler/run';
import { naverHasCreds } from '@/lib/crawler/naver';
import { isCategoryKey, getCategory } from '@/lib/domain/categories';
import { REGIONS } from '@/lib/domain/regions';
import { CrawlJob, aiCostKrw, crawlQuotaFor, DAILY_CRAWL_LIMIT } from '@/models/CrawlJob';

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
 * POST /api/crawl             { categories[], keywords?, maxQueries? } → { jobId, queueId }
 *
 * 아이디 하나당 하루 DAILY_CRAWL_LIMIT 회까지. 버튼 한 번 = 1회다
 * (카테고리를 다섯 개 걸어도 queueId 가 하나라 1회로 센다).
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
    // 카테고리를 여러 개 걸 수 있으므로 합산해서 돌려준다
    const cats = (url.searchParams.get('categories') || url.searchParams.get('category') || '')
      .split(',').map((c) => c.trim()).filter(isCategoryKey);
    if (!cats.length) {
      return NextResponse.json({ success: false, error: '카테고리를 하나 이상 골라 주세요.' }, { status: 400 });
    }
    const typed = (url.searchParams.get('keywords') || '')
      .split(',').map((k) => k.trim()).filter(Boolean);

    let queries = 0;
    const perCategory: Array<{ key: string; label: string; keywords: number; queries: number }> = [];
    for (const c of cats) {
      // 키워드를 직접 적었으면 고른 카테고리 전부에 같은 것을 쓴다
      const kws = typed.length ? typed : await resolveKeywords(c);
      const q = kws.length * REGIONS.length;
      queries += q;
      perCategory.push({ key: c, label: getCategory(c)?.label || c, keywords: kws.length, queries: q });
    }

    const found = queries * PLACES_PER_QUERY;
    const withEmail = Math.round(found * EMAIL_HIT_RATE);
    const costKrw = aiCostKrw(
      withEmail * AI_TOKENS_PER_LEAD.input,
      withEmail * AI_TOKENS_PER_LEAD.output,
    );
    const minutes = Math.ceil((found * SECONDS_PER_HOMEPAGE) / 60);

    // 누르기 전에 오늘 몇 번 남았는지도 같이 알려준다
    const quota = await crawlQuotaFor(user);

    return NextResponse.json({
      success: true,
      categories: perCategory,
      usingDefaults: typed.length === 0,
      quota,
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

    // 같은 묶음의 다른 카테고리도 같이 준다. 다섯 개를 걸어 놨으면
    // "지금 두 번째가 돌고 나머지 셋은 대기" 가 한눈에 보여야 한다.
    const queue = job.queueId
      ? await CrawlJob.find({ queueId: job.queueId })
          .sort({ queueIndex: 1 })
          .select('jobId category status queueIndex verified failed found')
          .lean() as Array<Record<string, any>>
      : [];

    // 지금 돌고 있는 것이 바뀌었으면 화면이 그쪽을 따라가야 한다
    const active = queue.find((q) => q.status === 'running');

    return NextResponse.json({
      success: true,
      job: { ...job, costKrw: aiCostKrw(job.inputTokens || 0, job.outputTokens || 0) },
      queue,
      activeJobId: active?.jobId || null,
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

  // 카테고리를 여러 개 걸 수 있다. 하나씩 차례로 돈다.
  const cats: string[] = Array.isArray(body.categories)
    ? body.categories.map(String).filter(isCategoryKey)
    : isCategoryKey(body.category) ? [body.category as string] : [];

  if (!cats.length) {
    return NextResponse.json(
      { success: false, error: '카테고리를 하나 이상 골라 주세요.' },
      { status: 400 },
    );
  }

  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map(String).map((k) => k.trim()).filter(Boolean)
    : undefined;

  await dbConnect();

  // 하루 실행 횟수. 한 번이 40분~3시간짜리라 여러 사람이 각자 돌리면
  // 네이버 쿼터와 토큰이 금방 빠지고 같은 업체를 서로 다시 뒤지게 된다.
  const quota = await crawlQuotaFor(user);
  if (quota.left <= 0) {
    return NextResponse.json({
      success: false,
      error: `오늘 크롤링 횟수를 다 쓰셨습니다 (${quota.used}/${quota.limit}회). `
           + `내일 0시에 다시 채워집니다.`,
      quota,
    }, { status: 429 });
  }

  // 이미 돌고 있거나 대기 중인 카테고리는 또 걸지 않는다.
  // 두 작업이 같은 업체를 동시에 집으면 중복 검사가 소용없어진다.
  const busy = await CrawlJob.find({
    category: { $in: cats },
    status: { $in: ['running', 'queued'] },
  }).select('category').lean() as Array<{ category: string }>;

  const busySet = new Set(busy.map((b) => b.category));
  const todo = cats.filter((c) => !busySet.has(c));

  if (!todo.length) {
    return NextResponse.json({
      success: false,
      error: `이미 돌고 있습니다: ${[...busySet].map((c) => getCategory(c)?.label || c).join(', ')}`,
    }, { status: 409 });
  }

  const queueId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stamp = Date.now();
  const jobs = todo.map((category, i) => ({
    jobId: `crawl-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`,
    category,
    keywords: keywords || [],
    // 첫 번째만 바로 돌린다. 나머지는 앞의 것이 끝나면 스스로 이어받는다
    // (lib/crawler/run.ts startNextInQueue)
    status: i === 0 ? 'running' : 'queued',
    phase: i === 0 ? '준비 중' : '대기 중',
    queueId,
    queueIndex: i,
    queueTotal: todo.length,
    createdBy: user,
  }));
  await CrawlJob.insertMany(jobs);

  // 기다리지 않는다 — 작업은 응답을 보낸 뒤에도 계속 돈다.
  // (Vercel 서버리스에서는 응답과 함께 함수가 죽으므로 이 경로는 로컬/워커 전용이다)
  void runCrawlJob({
    category: jobs[0].category as never,
    keywords,
    jobId: jobs[0].jobId,
    maxQueries: Math.min(Number(body.maxQueries) || 400, 400),
  });

  return NextResponse.json({
    success: true,
    jobId: jobs[0].jobId,
    queueId,
    queued: jobs.length,
    skipped: [...busySet],
    // 방금 쓴 것까지 반영해서 돌려준다 — 화면이 바로 남은 횟수를 갱신한다
    quota: { ...quota, used: quota.used + 1, left: quota.left - 1 },
  });
}
