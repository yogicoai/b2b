#!/usr/bin/env node
/**
 * 전국 대량 크롤 — 키워드 × 17개 시·도.
 *
 * 왜 화면(/api/crawl)이 아니라 스크립트인가:
 * 홈페이지 렌더에 업체당 몇 초가 걸린다. 키워드 10개 × 지역 17개면 조합만 170개고,
 * 조합마다 업체가 5곳씩 나오니 한 번 도는 데 수십 분이다. HTTP 요청 하나가 그걸
 * 기다릴 수 없고, 배포된 Vercel 함수에는 브라우저 바이너리도 없다.
 * 그래서 대량 수집은 로컬(또는 전용 워커)에서 이 스크립트로 돈다.
 *
 * 사용:
 *   npm run crawl:all                 # 5개 카테고리 전부
 *   npm run crawl:all -- resort       # 특정 카테고리만
 *   npm run crawl:all -- resort 서울 경기
 *
 * 중단해도 안전하다 — 이미 넣은 곳은 다음 실행에서 중복으로 걸러진다.
 */
import 'dotenv/config';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// TS 소스를 그대로 불러오려고 ts-node 로더를 건다.
// 크롤러 로직을 .mjs 로 복사해 두면 화면 쪽과 규칙이 갈라진다 — 실제로 해외판에서
// reco-score 가 그렇게 갈려서 "스크립트와 화면 점수가 다른" 일이 있었다.
register('ts-node/esm', pathToFileURL('./'));

const args = process.argv.slice(2);
const CATEGORY_KEYS = ['public', 'company', 'medical', 'resort', 'sports'];

const wantedCategory = args.find((a) => CATEGORY_KEYS.includes(a));
const wantedRegions = args.filter((a) => !CATEGORY_KEYS.includes(a));

async function main() {
  const [{ default: dbConnect }, { crawlCategory }, { CATEGORIES }] = await Promise.all([
    import('../src/lib/mongodb.ts'),
    import('../src/lib/crawler/run.ts'),
    import('../src/lib/domain/categories.ts'),
  ]);

  await dbConnect();

  const targets = wantedCategory
    ? CATEGORIES.filter((c) => c.key === wantedCategory)
    : CATEGORIES;

  const totals = { queries: 0, found: 0, inserted: 0, duplicate: 0, withEmail: 0 };

  for (const cat of targets) {
    console.log(`\n═══ ${cat.label} (${cat.key}) ═══`);
    const started = Date.now();

    const result = await crawlCategory({
      category: cat.key,
      regions: wantedRegions.length ? wantedRegions : undefined,
      withHomepage: true,
      // 한 카테고리에서 도는 조합 상한. 전국 17개 시·도 × 키워드 10개 = 170.
      maxQueries: 200,
      onProgress: (msg) => console.log('  ·', msg),
    });

    for (const k of Object.keys(totals)) totals[k] += result[k] || 0;

    const mins = ((Date.now() - started) / 60000).toFixed(1);
    console.log(
      `  → 신규 ${result.inserted} · 중복 ${result.duplicate} · 이메일 확보 ${result.withEmail} (${mins}분)`,
    );
    if (result.errors.length) {
      console.log(`  → 건너뜀 ${result.errors.length}건`);
      for (const e of result.errors.slice(0, 5)) console.log('     ', e);
    }
  }

  console.log('\n═══ 전체 ═══');
  console.log(
    `검색 ${totals.queries} · 발견 ${totals.found} · 신규 ${totals.inserted} · ` +
    `중복 ${totals.duplicate} · 이메일 ${totals.withEmail}`,
  );
  console.log('\n새로 들어온 곳은 앱의 [🧲 수집함]에 있습니다. AI 검증을 돌린 뒤 검토하세요.');

  const { closeBrowser } = await import('../src/lib/crawler/browser.ts');
  await closeBrowser();
  process.exit(0);
}

main().catch((e) => {
  console.error('크롤 실패:', e);
  process.exit(1);
});
