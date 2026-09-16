/**
 * 크롤링 한 바퀴 — 키워드 × 지역 → 네이버 발굴 → 홈페이지 이메일 추출 → 리드 적재.
 *
 * 수집물은 stage:'ai-searched'(수집함)로 들어간다. 바로 'verified' 로 넣지 않는 이유는
 * 네이버가 돌려주는 것이 "그 키워드로 검색되는 곳"일 뿐, 요기보를 납품할 만한
 * 규모인지는 전혀 따지지 않기 때문이다. 규모 판정은 AI 검증(lib/verify-ai.ts)이 하고,
 * 최종 판단은 사람이 한다.
 */
import { Lead } from '@/models/Lead';
import { Keyword } from '@/models/Keyword';
import { searchLocal, type NaverPlace } from './naver';
import { crawlHomepage } from './homepage';
import { extractEmails } from './extract-email';
import { regionFromAddress } from '@/lib/domain/regions';
import { CATEGORIES, getCategory, type CategoryKey } from '@/lib/domain/categories';
import { findUnsubscribed } from '@/models/Unsubscribe';

export interface CrawlOptions {
  category: CategoryKey;
  /** 비우면 카테고리의 활성 키워드 전부 */
  keywords?: string[];
  /** 비우면 전국 17개 시·도 */
  regions?: string[];
  /** 홈페이지까지 들어가 이메일을 팔지 (느리다 — 건당 수 초) */
  withHomepage?: boolean;
  /** 이번 실행에서 처리할 검색 조합 상한 — 무한정 도는 것을 막는다 */
  maxQueries?: number;
  /** 진행 상황 보고 (스크립트에서 콘솔로 흘릴 때) */
  onProgress?: (msg: string) => void;
}

export interface CrawlResult {
  queries: number;
  found: number;        // 네이버가 돌려준 업체 수
  inserted: number;     // 새로 쌓인 리드
  duplicate: number;    // 이미 있던 곳
  withEmail: number;    // 이메일까지 확보한 수
  errors: string[];
}

/** 이 카테고리에서 실제로 돌릴 키워드 — DB 에 등록된 것이 있으면 그쪽이 우선 */
export async function resolveKeywords(category: CategoryKey): Promise<string[]> {
  const rows = await Keyword.find({ category, active: true }).select('keyword').lean();
  if (rows.length) return rows.map((r: { keyword: string }) => r.keyword);
  return getCategory(category)?.keywords ?? [];
}

function leadIdFor(place: NaverPlace, category: string): string {
  // 같은 업체를 다시 만났을 때 같은 id 가 나와야 중복이 안 쌓인다.
  // 홈페이지 URL 이 있으면 그 호스트가 제일 안정적인 열쇠다 —
  // 상호는 표기가 조금씩 바뀌고("요기보 강남점" / "요기보강남"), 주소도 이전한다.
  let key = '';
  try {
    if (place.url) key = new URL(place.url).hostname.replace(/^www\./, '');
  } catch { /* 형식이 깨진 URL 은 무시하고 상호로 떨어진다 */ }
  if (!key) key = `${place.companyName}|${place.address}`.trim();
  return `kr-${category}-${Buffer.from(key).toString('base64url').slice(0, 32)}`;
}

export async function crawlCategory(opts: CrawlOptions): Promise<CrawlResult> {
  const {
    category,
    withHomepage = true,
    maxQueries = 50,
    onProgress = () => {},
  } = opts;

  const { REGIONS } = await import('@/lib/domain/regions');
  const keywords = opts.keywords?.length ? opts.keywords : await resolveKeywords(category);
  const regions = opts.regions?.length ? opts.regions : [...REGIONS];

  const result: CrawlResult = {
    queries: 0, found: 0, inserted: 0, duplicate: 0, withEmail: 0, errors: [],
  };
  if (!keywords.length) {
    result.errors.push(`[${category}] 활성 키워드가 없습니다 — 키워드 관리에서 추가하세요.`);
    return result;
  }

  const now = new Date().toISOString();

  outer:
  for (const region of regions) {
    for (const keyword of keywords) {
      if (result.queries >= maxQueries) break outer;
      result.queries++;
      const query = `${region} ${keyword}`;

      let places: NaverPlace[] = [];
      try {
        places = await searchLocal(query);
      } catch (e) {
        result.errors.push(`[${query}] ${(e as Error).message}`);
        continue;
      }
      result.found += places.length;
      onProgress(`${query} → ${places.length}곳`);

      for (const place of places) {
        const leadId = leadIdFor(place, category);
        const existing = await Lead.findOne({ leadId }).select('_id').lean();
        if (existing) { result.duplicate++; continue; }

        // 홈페이지에서 이메일 캐기 — 여기가 전체 시간의 대부분을 쓴다.
        let emails: string[] = [];
        if (withHomepage && place.url) {
          try {
            const r = await crawlHomepage(place.url);
            emails = r.emails;
          } catch (e) {
            result.errors.push(`[${place.companyName}] 홈페이지: ${(e as Error).message}`);
          }
        }
        if (!emails.length && place.description) {
          // 웹검색 요약문에 주소가 그대로 적혀 있는 경우가 종종 있다
          emails = extractEmails(place.description);
        }

        // 수신거부한 주소로 다시 접근하지 않는다 — 수집 단계에서 미리 털어낸다.
        if (emails.length) {
          const blocked = await findUnsubscribed(emails);
          emails = emails.filter((e) => !blocked.has(e));
        }

        await Lead.create({
          leadId,
          Company: place.companyName,
          Region: regionFromAddress(place.address) || region,
          Email: emails[0] || '',
          WebsiteContact: place.url,   // 해외판이 쓰던 '회사 사이트' 필드를 그대로 쓴다
          category,
          keyword,
          naverCategory: place.naverCategory,
          Phone: place.tel,
          address: place.address,
          crawlSource: place.source,
          crawledFromUrl: place.url,
          crawledEmails: emails,
          crawledAt: now,
          stage: 'ai-searched',
          stageChangedAt: now,
          registeredAt: now,
          status: 'new',
        });
        result.inserted++;
        if (emails.length) result.withEmail++;
      }

      await Keyword.updateOne(
        { category, keyword },
        { $set: { lastCrawledAt: new Date() }, $inc: { foundCount: places.length } }
      );
    }
  }

  return result;
}

export { CATEGORIES };
