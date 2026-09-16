/**
 * 크롤링 한 번 = 발굴 → 이메일 추출 → AI 검증까지.
 *
 * 세 단계를 한 작업으로 묶는 이유:
 * 중간에 사람이 할 판단이 없다. 네이버가 돌려준 상호와 주소만 보고는 그곳이
 * 요기보를 여러 개 들일 규모인지 알 수 없고, 그 판단은 어차피 AI 가 한다.
 * 그래서 [수집함]·[검증 대기] 같은 중간 칸을 두지 않고, 한 번 돌리면
 * [AI 검증 완료] 또는 [검증 실패] 로 바로 떨어진다.
 *
 * 이메일이 없는 곳은 AI 를 돌리지 않는다. 보낼 수단이 없는데 판정할 이유가 없고,
 * 크롤링해 보면 그런 곳이 꽤 나온다 — 거기에 돈과 시간을 쓰면 둘 다 낭비다.
 *
 * ⚠️ 이 경로는 Vercel(서버리스)에서 못 돈다. Playwright 바이너리가 없고 실행시간
 *    제한에도 걸린다. 로컬 또는 전용 워커에서 돌린다.
 */
import { Lead } from '@/models/Lead';
import { Keyword } from '@/models/Keyword';
import { CrawlJob } from '@/models/CrawlJob';
import { searchLocal, type NaverPlace } from './naver';
import { crawlHomepage } from './homepage';
import { extractEmails, keepLikelyOwnEmails } from './extract-email';
import { REGIONS, regionFromAddress } from '@/lib/domain/regions';
import { getCategory, categoryLabel, type CategoryKey } from '@/lib/domain/categories';
import { findUnsubscribed } from '@/models/Unsubscribe';
import { verifyWithAI } from '@/lib/verify-ai';

export interface CrawlOptions {
  category: CategoryKey;
  /** 비우면 카테고리에 등록된 키워드 전부 */
  keywords?: string[];
  /** 이번 실행에서 처리할 검색 조합 상한 */
  maxQueries?: number;
  jobId: string;
}

/** 이 카테고리에서 실제로 돌릴 키워드 — DB 에 등록된 것이 있으면 그쪽이 우선 */
export async function resolveKeywords(category: CategoryKey): Promise<string[]> {
  const rows = await Keyword.find({ category, active: true }).select('keyword').lean();
  if (rows.length) return rows.map((r: { keyword: string }) => r.keyword);
  return getCategory(category)?.keywords ?? [];
}

/**
 * 같은 업체를 다시 만났을 때 같은 id 가 나와야 중복이 안 쌓인다.
 * 홈페이지 호스트가 제일 안정적인 열쇠다 — 상호는 표기가 조금씩 바뀌고("요기보 강남점" /
 * "요기보강남") 주소도 이전한다.
 */
function leadIdFor(place: NaverPlace, category: string): string {
  let key = '';
  try {
    if (place.url) key = new URL(place.url).hostname.replace(/^www\./, '');
  } catch { /* 형식이 깨진 URL 은 무시하고 상호로 떨어진다 */ }
  if (!key) key = `${place.companyName}|${place.address}`.trim();
  return `kr-${category}-${Buffer.from(key).toString('base64url').slice(0, 32)}`;
}

/** 진행률 문서 갱신 — 화면이 이걸 읽어서 실시간으로 보여준다 */
async function bump(jobId: string, inc: Record<string, number>, set?: Record<string, unknown>) {
  const update: Record<string, unknown> = {};
  if (Object.keys(inc).length) update.$inc = inc;
  if (set && Object.keys(set).length) update.$set = set;
  if (!Object.keys(update).length) return;
  await CrawlJob.updateOne({ jobId }, update);
}

/** 실시간 피드에 한 줄 밀어 넣는다 (최근 40건만 유지) */
async function pushFind(
  jobId: string,
  find: { company: string; region: string; email: string; state: string; score?: number; reason?: string },
) {
  await CrawlJob.updateOne(
    { jobId },
    { $push: { recentFinds: { $each: [{ ...find, at: new Date() }], $position: 0, $slice: 40 } } },
  );
}

/**
 * 작업 하나를 끝까지 돌린다. 호출자를 기다리게 하지 않는다 —
 * API 라우트는 이 함수를 띄워만 두고 jobId 를 바로 돌려준다.
 */
export async function runCrawlJob(opts: CrawlOptions): Promise<void> {
  const { category, jobId, maxQueries = 400 } = opts;
  const now = () => new Date().toISOString();

  try {
    const keywords = opts.keywords?.length ? opts.keywords : await resolveKeywords(category);
    if (!keywords.length) {
      await CrawlJob.updateOne({ jobId }, {
        $set: {
          status: 'failed',
          phase: '중단됨',
          finishedAt: new Date(),
        },
        $push: { problems: `[${categoryLabel(category)}] 등록된 키워드가 없습니다 — 키워드 관리에서 추가하세요.` },
      });
      return;
    }

    // 지역은 늘 전국이다. 고르게 하지 않는다 — 전국을 다 도는 것이 기본 사용법이라
    // 선택지를 두면 매번 같은 선택을 반복하게 만들 뿐이다.
    const combos: Array<{ region: string; keyword: string }> = [];
    for (const region of REGIONS) {
      for (const keyword of keywords) combos.push({ region, keyword });
    }
    const plan = combos.slice(0, maxQueries);

    await CrawlJob.updateOne({ jobId }, {
      $set: { keywords, queriesTotal: plan.length, phase: '업체 찾는 중' },
    });

    // ── 1단계: 네이버로 업체 발굴 ────────────────────────────
    // 먼저 전부 모은 뒤에 홈페이지를 돈다. 섞어서 돌리면 진행률이
    // "몇 곳 중 몇 곳" 으로 안 나와서, 남은 시간을 짐작할 수가 없다.
    const fresh: Array<NaverPlace & { region: string; keyword: string; leadId: string }> = [];
    const seen = new Set<string>();

    for (const { region, keyword } of plan) {
      const query = `${region} ${keyword}`;
      await bump(jobId, { queriesDone: 1 }, { currentLabel: query });

      let places: NaverPlace[] = [];
      try {
        places = await searchLocal(query);
      } catch (e) {
        await CrawlJob.updateOne({ jobId }, { $push: { problems: `[${query}] ${(e as Error).message}` } });
        continue;
      }
      await bump(jobId, { found: places.length });

      for (const place of places) {
        const leadId = leadIdFor(place, category);
        if (seen.has(leadId)) { await bump(jobId, { duplicate: 1 }); continue; }
        seen.add(leadId);

        const exists = await Lead.findOne({ leadId }).select('_id').lean();
        if (exists) { await bump(jobId, { duplicate: 1 }); continue; }

        fresh.push({ ...place, region, keyword, leadId });
        await pushFind(jobId, {
          company: place.companyName,
          region: regionFromAddress(place.address) || region,
          email: '',
          state: 'found',
        });
      }
    }

    // ── 2단계: 홈페이지에서 이메일 캐기 ─────────────────────
    // 전체 시간의 대부분이 여기서 나간다 (업체당 3~15초).
    await CrawlJob.updateOne({ jobId }, {
      $set: { phase: '이메일 찾는 중', homepageTotal: fresh.length, currentLabel: '' },
    });

    const withEmail: Array<(typeof fresh)[number] & { emails: string[] }> = [];

    for (const place of fresh) {
      await bump(jobId, { homepageDone: 1 }, { currentLabel: place.companyName });

      let emails: string[] = [];
      if (place.url) {
        try {
          emails = (await crawlHomepage(place.url)).emails;
        } catch (e) {
          await CrawlJob.updateOne({ jobId }, { $push: { problems: `[${place.companyName}] 홈페이지: ${(e as Error).message}` } });
        }
      }
      if (!emails.length && place.description) emails = extractEmails(place.description);

      // 그 사이트와 무관한 도메인은 떨군다 — 페이지에 박힌 남의 스크립트·위젯 주소다.
      // 첫 크롤에서 5개 중 4개가 그런 것이었다 (ic.net · cdninstagram.com · office.com).
      emails = keepLikelyOwnEmails(emails, place.url);

      // 한 번 거부한 주소로 다시 접근하지 않는다 — 수집 단계에서 미리 털어낸다
      if (emails.length) {
        const blocked = await findUnsubscribed(emails);
        emails = emails.filter((e) => !blocked.has(e));
      }

      const region = regionFromAddress(place.address) || place.region;

      if (!emails.length) {
        // 보낼 수단이 없으니 AI 를 돌리지 않는다. 버리지도 않는다 —
        // 나중에 전화로 딸 수도 있고, 다시 크롤링했을 때 또 돌지 않게 기록이 필요하다.
        await Lead.create({
          leadId: place.leadId,
          Company: place.companyName,
          Region: region,
          Email: '',
          WebsiteContact: place.url,
          Phone: place.tel,
          address: place.address,
          category,
          keyword: place.keyword,
          naverCategory: place.naverCategory,
          crawlSource: place.source,
          crawledFromUrl: place.url,
          crawledEmails: [],
          crawledAt: now(),
          stage: 'failed',
          stageChangedAt: now(),
          registeredAt: now(),
          status: 'new',
          verification: { aiReasoning: '메일 주소를 찾지 못했습니다 (홈페이지 없음·문의 폼만 있음 등)' },
        });
        await bump(jobId, { noEmail: 1, failed: 1 });
        await pushFind(jobId, { company: place.companyName, region, email: '', state: 'no-email' });
        continue;
      }

      withEmail.push({ ...place, emails });
      await bump(jobId, { withEmail: 1 });
      await pushFind(jobId, { company: place.companyName, region, email: emails[0], state: 'found' });
    }

    // ── 3단계: 이메일을 확보한 곳만 AI 검증 ──────────────────
    await CrawlJob.updateOne({ jobId }, {
      $set: { phase: 'AI 검증 중', aiTotal: withEmail.length, currentLabel: '' },
    });

    const cat = getCategory(category);

    for (const place of withEmail) {
      await bump(jobId, { aiDone: 1 }, { currentLabel: place.companyName });
      const region = regionFromAddress(place.address) || place.region;

      let verdict = null;
      try {
        verdict = await verifyWithAI({
          Company: place.companyName,
          Region: region,
          WebsiteContact: place.url,
          category,
          categoryLabel: cat?.label,
          categoryPitch: cat?.pitch,
          naverCategory: place.naverCategory,
          phone: place.tel,
          address: place.address,
        });
      } catch (e) {
        await CrawlJob.updateOne({ jobId }, { $push: { problems: `[${place.companyName}] AI: ${(e as Error).message}` } });
      }

      if (verdict?.usage) {
        await bump(jobId, {
          inputTokens: verdict.usage.inputTokens,
          outputTokens: verdict.usage.outputTokens,
        });
      }

      // AI 가 답을 못 주면 부적합으로 버리지 않는다. 판정이 없는 것과 부적합은 다르다 —
      // 사람이 볼 수 있게 검증 완료로 넣고 사유를 적어 둔다.
      const pass = !verdict || verdict.verdict !== 'not-fit';
      const stage = pass ? 'verified' : 'failed';

      await Lead.create({
        leadId: place.leadId,
        Company: place.companyName,
        Region: region,
        Email: place.emails[0],
        WebsiteContact: place.url,
        Phone: place.tel,
        address: place.address,
        category,
        keyword: place.keyword,
        naverCategory: place.naverCategory,
        crawlSource: place.source,
        crawledFromUrl: place.url,
        crawledEmails: place.emails,
        crawledAt: now(),
        stage,
        stageChangedAt: now(),
        registeredAt: now(),
        status: 'new',
        verification: {
          aiVerdict: verdict?.verdict ?? null,
          aiConfidence: verdict?.confidence ?? null,
          aiReasoning: verdict?.reasoning ?? 'AI 판정을 받지 못했습니다 — 직접 확인이 필요합니다',
          score: verdict?.score ?? null,
          verifiedAt: now(),
        },
      });

      await bump(jobId, pass ? { verified: 1 } : { failed: 1 });
      await pushFind(jobId, {
        company: place.companyName,
        region,
        email: place.emails[0],
        state: pass ? 'verified' : 'rejected',
        score: verdict?.score,
        reason: verdict?.reasoning,
      });
    }

    await CrawlJob.updateOne({ jobId }, {
      $set: { status: 'done', phase: '완료', currentLabel: '', finishedAt: new Date() },
    });
    await startNextInQueue(jobId);
  } catch (e) {
    await CrawlJob.updateOne({ jobId }, {
      $set: { status: 'failed', phase: '오류로 중단', finishedAt: new Date() },
      $push: { problems: (e as Error).message },
    });
    // 하나가 엎어져도 나머지는 돌린다 — 다섯 개를 걸어 놨는데 첫 번째가
    // 실패했다고 전부 멈추면, 돌아와서 보고 다시 걸어야 한다.
    await startNextInQueue(jobId);
  } finally {
    // 브라우저를 놔두면 다음 실행에서 프로세스가 쌓인다
    const { closeBrowser } = await import('./browser');
    await closeBrowser().catch(() => {});
  }
}

/**
 * 같은 묶음에서 아직 대기 중인 다음 작업을 이어서 돌린다.
 *
 * 순차로 도는 이유: 한꺼번에 돌리면 네이버 API 와 헤드리스 브라우저를 동시에
 * 여러 개 쓰게 되고, 진행률이 "몇 중 몇"으로 안 나와 남은 시간을 짐작할 수 없다.
 */
async function startNextInQueue(finishedJobId: string): Promise<void> {
  const done = await CrawlJob.findOne({ jobId: finishedJobId }).select('queueId').lean() as { queueId?: string } | null;
  if (!done?.queueId) return;

  const next = await CrawlJob.findOne({ queueId: done.queueId, status: 'queued' })
    .sort({ queueIndex: 1 })
    .lean() as Record<string, any> | null;
  if (!next) return;

  await CrawlJob.updateOne(
    { jobId: next.jobId },
    { $set: { status: 'running', phase: '준비 중', startedAt: new Date() } },
  );
  // 기다리지 않는다 — 이 함수를 부른 작업은 이미 끝났고, 다음 것은 스스로 돈다
  void runCrawlJob({
    category: next.category,
    keywords: next.keywords?.length ? next.keywords : undefined,
    jobId: next.jobId,
    maxQueries: 400,
  });
}
