import { promises as dns } from 'dns';

/**
 * Lead 자동 정합성 검증 유틸.
 * - 외부 유료 서비스 없이 무료 체크만 수행:
 *   email: syntax + MX 레코드
 *   website: HEAD 요청 (5초 타임아웃, 폴백으로 GET)
 *   phone: 지역코드 매칭 (대표 지역 한정)
 *   linkedin: URL 형식 + 200 응답 검사
 */

export interface EmailCheck {
  valid: boolean | null;
  reason?: string;
}
export interface SiteCheck {
  alive: boolean | null;
  status: number;
}
export interface PhoneCheck {
  match: boolean | null;
  reason?: string;
}
export interface LinkedInCheck {
  valid: boolean | null;
  reason?: string;
}

// ── Email ─────────────────────────────────────────────────────────
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'throwaway.email', 'yopmail.com', 'trashmail.com', 'fakeinbox.com',
]);

export async function verifyEmail(email: string): Promise<EmailCheck> {
  const e = (email || '').trim().toLowerCase();
  if (!e) return { valid: null, reason: 'empty' };
  if (!EMAIL_RX.test(e)) return { valid: false, reason: 'syntax' };

  const domain = e.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) return { valid: false, reason: 'disposable' };

  try {
    const mx = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('mx-timeout')), 5000)),
    ]);
    if (!mx || mx.length === 0) return { valid: false, reason: 'no-mx' };
    return { valid: true };
  } catch (err: any) {
    if (err?.message === 'mx-timeout') return { valid: false, reason: 'mx-timeout' };
    // NXDOMAIN / ENODATA 등
    return { valid: false, reason: 'mx-error' };
  }
}

// ── Website ───────────────────────────────────────────────────────
export async function verifyWebsite(url: string): Promise<SiteCheck> {
  const raw = (url || '').trim();
  if (!raw) return { alive: null, status: 0 };

  // URL 정규화
  let target = raw;
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  try {
    new URL(target);
  } catch {
    return { alive: false, status: 0 };
  }

  const tryRequest = async (method: 'HEAD' | 'GET') => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(target, {
        method,
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'YogicoCRM-Verifier/1.0' },
      });
      return res.status;
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const status = await tryRequest('HEAD');
    // 일부 서버는 HEAD 막아서 405/403/501 줄 수 있음 → GET 폴백
    if (status === 405 || status === 403 || status === 501) {
      const s2 = await tryRequest('GET');
      return { alive: s2 >= 200 && s2 < 400, status: s2 };
    }
    return { alive: status >= 200 && status < 400, status };
  } catch {
    // 마지막 폴백: GET 시도
    try {
      const s = await tryRequest('GET');
      return { alive: s >= 200 && s < 400, status: s };
    } catch {
      return { alive: false, status: 0 };
    }
  }
}

// ── Phone ─────────────────────────────────────────────────────────
/**
 * 국내 전화번호 검사.
 *
 * 해외판은 "이 번호의 국가번호가 리드의 국가와 맞나"를 봤다(REGION_DIAL_CODES).
 * 국내판에서는 그 질문이 의미가 없다 — 전부 한국이다. 대신 확인할 것은
 * **번호 형태가 실재하는 국내 번호인가**다. 네이버 지역검색이 주는 전화번호는
 * 02-0000-0000 같은 자리 채우기나 빈 값이 섞여 온다.
 */

/** 국내 지역번호 + 이동통신 + 대표번호(15xx·16xx·18xx) */
const KR_AREA_CODES = [
  '02',                                                   // 서울
  '031', '032', '033',                                    // 경기·인천·강원
  '041', '042', '043', '044',                             // 충남·대전·충북·세종
  '051', '052', '053', '054', '055',                      // 부산·울산·대구·경북·경남
  '061', '062', '063', '064',                             // 전남·광주·전북·제주
  '070',                                                  // 인터넷전화
  '010', '011', '016', '017', '018', '019',               // 이동통신
];

const KR_REPRESENTATIVE = /^1(5|6|8)\d{2}\d{4}$/;         // 15xx-xxxx 형태

export function verifyPhone(phone: string, _region?: string): PhoneCheck {
  const p = (phone || '').trim();
  if (!p) return { match: null, reason: 'empty' };

  let digits = p.replace(/[^\d+]/g, '');

  // +82-2-1234-5678 / 0082… 처럼 국제표기로 온 것을 국내표기로 되돌린다
  digits = digits.replace(/^\+/, '').replace(/^00/, '');
  if (digits.startsWith('82')) digits = '0' + digits.slice(2);

  if (KR_REPRESENTATIVE.test(digits)) return { match: true };

  if (digits.length < 9) return { match: false, reason: 'too-short' };
  if (digits.length > 11) return { match: false, reason: 'too-long' };

  const area = KR_AREA_CODES.find((c) => digits.startsWith(c));
  if (!area) return { match: false, reason: 'unknown-area-code' };

  // 02 는 9~10자리, 나머지 지역번호·휴대폰은 10~11자리
  const min = area === '02' ? 9 : 10;
  if (digits.length < min) return { match: false, reason: 'too-short' };

  return { match: true };
}

// ── LinkedIn ──────────────────────────────────────────────────────
const LINKEDIN_RX = /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[^\s/]+/i;

export function verifyLinkedIn(url: string): LinkedInCheck {
  const u = (url || '').trim();
  if (!u) return { valid: null, reason: 'empty' };
  if (!LINKEDIN_RX.test(u)) return { valid: false, reason: 'format' };
  return { valid: true };
}

// ── Business Relevance (K-beauty 관련성) ───────────────────────────
// 사이트 HTML 의 <title>, <meta description>, <h1>, 본문을 가중치 다르게 분석.
// 다국어(영/한/스/프/포/독/아) 키워드 사전 + 인접 산업 + 바이어 시그널.
// 정밀 판단(LLM) 없이 휴리스틱이므로 1차 필터 용도.
export interface RelevanceCheck {
  level: 'relevant' | 'unclear' | 'unrelated' | null;
  score: number;                // 0~3
  matchedKeywords: string[];
  evidence?: {
    title?: string;             // 추출된 <title>
    description?: string;       // 추출된 <meta description>
    h1?: string;                // 추출된 첫 <h1>
    titleHit?: string;          // 타이틀에서 매칭된 핵심 키워드
    metaHit?: string;           // 메타에서 매칭된 핵심 키워드
  };
  reason?: string;              // 'no-url' / 'fetch-failed' / 'empty-content'
}

// 다국어 키워드 사전 (소문자로 매칭)
const BEAUTY_KEYWORDS = {
  // 영어 — 직결 뷰티/화장품
  general: [
    'beauty', 'cosmetic', 'cosmetics', 'skincare', 'skin care',
    'makeup', 'make-up', 'make up', 'fragrance', 'perfume',
    'lipstick', 'mascara', 'foundation', 'eyeliner', 'blush',
    'serum', 'cream', 'lotion', 'cleanser', 'toner', 'essence',
    'sheet mask', 'face mask', 'spa', 'dermatology', 'derma',
    'hair care', 'haircare', 'nail polish', 'manicure',
    'personal care', 'health and beauty', 'health & beauty',
  ],
  // K-beauty 직결 (모든 점수에서 결정적)
  kbeauty: [
    'k-beauty', 'k beauty', 'kbeauty', 'korean beauty',
    'korean cosmetic', 'korean cosmetics', 'korean skincare',
    'korea cosmetic', 'made in korea', 'import from korea',
    'asian beauty', 'j-beauty', 'asian skincare',
  ],
  // 한국어
  korean: [
    '뷰티', '화장품', '코스메틱', '스킨케어', '메이크업',
    '에센스', '세럼', '마스크팩', '클렌저', '토너',
    'k-뷰티', 'k뷰티', '한국 화장품', '한국 뷰티',
  ],
  // 스페인어 (스페인/멕시코/중남미)
  spanish: [
    'belleza', 'cosmético', 'cosmeticos', 'cuidado de la piel',
    'maquillaje', 'perfumería', 'crema facial', 'sérum',
    'mascarilla', 'productos de belleza', 'cosmética',
  ],
  // 프랑스어 (프랑스/벨기에/캐나다)
  french: [
    'beauté', 'cosmétique', 'cosmétiques', 'soin de la peau',
    'maquillage', 'parfumerie', 'crème visage', 'sérum',
    'masque visage', 'produits de beauté', 'soin du visage',
  ],
  // 포르투갈어 (브라질/포르투갈)
  portuguese: [
    'beleza', 'cosmético', 'cosméticos', 'cuidado da pele',
    'maquiagem', 'perfumaria', 'creme facial',
    'máscara facial', 'produtos de beleza',
  ],
  // 독일어 (독일/오스트리아)
  german: [
    'schönheit', 'kosmetik', 'hautpflege', 'gesichtspflege',
    'make-up-produkte', 'parfümerie',
  ],
  // 아랍어 (UAE/사우디/이집트 등 — 영어 사이트가 흔하지만 옵션으로)
  arabic: [
    'مستحضرات التجميل', 'العناية بالبشرة', 'الجمال', 'مكياج',
  ],
  // 인접 산업 (뷰티와 크로스오버 흔함 — 약한 가중치)
  adjacent: [
    'fashion', 'lifestyle', 'wellness', 'pharmacy', 'drugstore',
    'beauty supply', 'beauty store', 'salon', 'esthetic',
    'aesthetic', 'apothecary',
  ],
  // B2B 바이어 시그널 (뷰티 키워드와 같이 보이면 가중치)
  buyer: [
    'distributor', 'distribution', 'wholesale', 'wholesaler',
    'importer', 'import', 'retailer', 'retail chain',
    'sourcing', 'procurement', 'b2b', 'supplier', 'brand partner',
    'exclusive distributor', 'we represent',
    'distribuidor', 'distribuidora', 'mayorista',  // ES
    'grossiste', 'distributeur',                    // FR
    'distribuidora', 'atacadista',                  // PT
    'distributor', 'großhändler',                   // DE
    '디스트리뷰터', '도매', '수입', '바이어',
  ],
  // 명백히 다른 산업 (부정 신호)
  negative: [
    'automotive', 'real estate', 'construction', 'banking',
    'insurance', 'hosting', 'web design', 'software development',
    'cryptocurrency', 'crypto', 'mining', 'oil & gas',
    'casino', 'gambling', 'logistics', 'shipping company',
  ],
};

// CJK(한·중·일) 문자 포함 여부 — 포함 시 word boundary 사용 불가
const CJK_RX = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

function countMatches(text: string, words: string[]): { count: number; matched: string[] } {
  const matched: string[] = [];
  let count = 0;
  for (const w of words) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 한국어/일본어/중국어는 \b 가 안 먹어서 그대로 부분 매칭 — Latin 만 word boundary 적용
    const pattern = CJK_RX.test(w) ? escaped : `\\b${escaped}\\b`;
    const re = new RegExp(pattern, 'gi');
    const m = text.match(re);
    if (m && m.length > 0) {
      count += m.length;
      matched.push(w);
    }
  }
  return { count, matched };
}

// HTML 에서 핵심 구조 추출 (제목/메타/h1)
function extractStructured(html: string): { title: string; description: string; h1: string; body: string } {
  const get = (re: RegExp): string => {
    const m = html.match(re);
    return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  };
  const title = get(/<title[^>]*>([\s\S]*?)<\/title>/i).slice(0, 200);
  const description = get(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i).slice(0, 300)
    || get(/<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']/i).slice(0, 300);
  const h1 = get(/<h1[^>]*>([\s\S]*?)<\/h1>/i).slice(0, 200);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return { title, description, h1, body };
}

export async function verifyBusinessRelevance(url: string): Promise<RelevanceCheck> {
  const raw = (url || '').trim();
  if (!raw) return { level: null, score: 0, matchedKeywords: [], reason: 'no-url' };

  let target = raw;
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  try {
    new URL(target);
  } catch {
    return { level: null, score: 0, matchedKeywords: [], reason: 'invalid-url' };
  }

  // 본문 다운로드 — 최대 600KB
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  let html = '';
  try {
    const res = await fetch(target, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'YogicoCRM-Verifier/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok || !res.body) {
      return { level: null, score: 0, matchedKeywords: [], reason: 'fetch-failed' };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let bytes = 0;
    const MAX = 600 * 1024;
    while (bytes < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
    try { reader.cancel(); } catch { /* noop */ }
  } catch {
    return { level: null, score: 0, matchedKeywords: [], reason: 'fetch-failed' };
  } finally {
    clearTimeout(t);
  }

  if (!html) return { level: null, score: 0, matchedKeywords: [], reason: 'empty-content' };

  // 구조화 추출 — 타이틀/메타/h1 는 본문보다 가중치 높음
  const struct = extractStructured(html);
  const titleLower = struct.title.toLowerCase();
  const descLower = struct.description.toLowerCase();
  const h1Lower = struct.h1.toLowerCase();
  // 헤더(타이틀+메타+h1) 텍스트 합본 — 강한 신호 검사용
  const header = `${titleLower} ${descLower} ${h1Lower}`;
  const body = struct.body;

  // 카테고리별 매칭 (본문 기준)
  const general    = countMatches(body, BEAUTY_KEYWORDS.general);
  const kbeauty    = countMatches(body, BEAUTY_KEYWORDS.kbeauty);
  const korean     = countMatches(body, BEAUTY_KEYWORDS.korean);
  const spanish    = countMatches(body, BEAUTY_KEYWORDS.spanish);
  const french     = countMatches(body, BEAUTY_KEYWORDS.french);
  const portuguese = countMatches(body, BEAUTY_KEYWORDS.portuguese);
  const german     = countMatches(body, BEAUTY_KEYWORDS.german);
  const arabic     = countMatches(body, BEAUTY_KEYWORDS.arabic);
  const adjacent   = countMatches(body, BEAUTY_KEYWORDS.adjacent);
  const buyer      = countMatches(body, BEAUTY_KEYWORDS.buyer);
  const negative   = countMatches(body, BEAUTY_KEYWORDS.negative);

  // 헤더(타이틀/메타) 매칭 — 결정적 신호
  const allBeautyWords = [
    ...BEAUTY_KEYWORDS.general,
    ...BEAUTY_KEYWORDS.kbeauty,
    ...BEAUTY_KEYWORDS.korean,
    ...BEAUTY_KEYWORDS.spanish,
    ...BEAUTY_KEYWORDS.french,
    ...BEAUTY_KEYWORDS.portuguese,
    ...BEAUTY_KEYWORDS.german,
    ...BEAUTY_KEYWORDS.arabic,
  ];
  const headerHit = countMatches(header, allBeautyWords);
  const titleHit = countMatches(titleLower, allBeautyWords);
  const metaHit = countMatches(descLower, allBeautyWords);

  // 다국어 직결 카운트 합산
  const directBeauty =
    general.count + spanish.count + french.count + portuguese.count + german.count + arabic.count;
  const strongKbeauty = kbeauty.count + korean.count;

  // 점수 산정 — 헤더 가중치 적용
  //   3점: K-beauty/한국어 1+ OR (타이틀에 뷰티 키워드 + 바이어 시그널)
  //   2점: 헤더에 뷰티 키워드 1+ OR 본문 직결 뷰티 3+ OR 본문 뷰티 1+ AND 바이어 1+
  //   1점: 본문 뷰티 1~2 OR 인접 산업 1+
  //   0점: 매칭 없음
  let score = 0;
  if (strongKbeauty > 0) {
    score = 3;
  } else if (titleHit.count > 0 && buyer.count > 0) {
    score = 3; // 타이틀이 뷰티 + 디스트리뷰터/바이어 시그널 → K-beauty 바이어 가능성 매우 높음
  } else if (headerHit.count > 0 || directBeauty >= 3 || (directBeauty >= 1 && buyer.count >= 1)) {
    score = 2;
  } else if (directBeauty >= 1) {
    score = 1;
  } else if (adjacent.count >= 1 && buyer.count >= 1) {
    score = 1; // 인접 산업 + 바이어 시그널은 모호하지만 가능성 있음
  } else {
    score = 0;
  }

  // 부정 키워드 다수 — 한 단계 감점 (단 헤더에 뷰티 매칭 있으면 보호)
  if (negative.count >= 3 && score > 0 && headerHit.count === 0) {
    score = Math.max(0, score - 1);
  }

  // 매칭 키워드 — 사용자에게 보여줄 샘플
  const matched = [
    ...kbeauty.matched,
    ...korean.matched,
    ...general.matched.slice(0, 4),
    ...spanish.matched.slice(0, 2),
    ...french.matched.slice(0, 2),
    ...portuguese.matched.slice(0, 2),
    ...german.matched.slice(0, 2),
    ...adjacent.matched.slice(0, 2),
    ...buyer.matched.slice(0, 2),
  ];

  const level: RelevanceCheck['level'] =
    score >= 2 ? 'relevant' : score === 1 ? 'unclear' : 'unrelated';

  return {
    level,
    score,
    matchedKeywords: matched,
    evidence: {
      title: struct.title || undefined,
      description: struct.description || undefined,
      h1: struct.h1 || undefined,
      titleHit: titleHit.matched[0],
      metaHit: metaHit.matched[0],
    },
  };
}

// ── Aggregate ─────────────────────────────────────────────────────
export interface VerificationResult {
  emailValid: boolean | null;
  emailReason: string;
  websiteAlive: boolean | null;
  websiteStatus: number;
  phoneMatch: boolean | null;
  phoneReason: string;
  linkedinValid: boolean | null;
  linkedinReason: string;
  // 사업 관련성 (K-beauty)
  businessLevel: 'relevant' | 'unclear' | 'unrelated' | null;
  businessScore: number;        // 0~3
  businessKeywords: string[];
  businessReason: string;       // no-url / fetch-failed / invalid-url / empty-content
  businessEvidence: {
    title?: string;
    description?: string;
    h1?: string;
    titleHit?: string;
    metaHit?: string;
  };
  score: number;                // 종합 점수 0~5 (기존 0~4 + 비즈니스 통과 1점)
  verifiedAt: string;
}

export async function runAllChecks(lead: {
  Email?: string;
  WebsiteContact?: string;
  Phone?: string;
  Region?: string;
  LinkedInCompany?: string;
  ContactLinkedIn?: string;
}): Promise<VerificationResult> {
  const linkedinUrl = lead.LinkedInCompany || lead.ContactLinkedIn || '';

  const [email, site, phone, linkedin, relevance] = await Promise.all([
    verifyEmail(lead.Email || ''),
    verifyWebsite(lead.WebsiteContact || ''),
    Promise.resolve(verifyPhone(lead.Phone || '', lead.Region || '')),
    Promise.resolve(verifyLinkedIn(linkedinUrl)),
    verifyBusinessRelevance(lead.WebsiteContact || ''),
  ]);

  // 종합 점수 0~5: 기존 4개 + 비즈니스 관련성(2점 이상이면 1점 추가)
  const score =
    (email.valid === true ? 1 : 0) +
    (site.alive === true ? 1 : 0) +
    (phone.match === true ? 1 : 0) +
    (linkedin.valid === true ? 1 : 0) +
    (relevance.score >= 2 ? 1 : 0);

  return {
    emailValid: email.valid,
    emailReason: email.reason || '',
    websiteAlive: site.alive,
    websiteStatus: site.status,
    phoneMatch: phone.match,
    phoneReason: phone.reason || '',
    linkedinValid: linkedin.valid,
    linkedinReason: linkedin.reason || '',
    businessLevel: relevance.level,
    businessScore: relevance.score,
    businessKeywords: relevance.matchedKeywords,
    businessReason: relevance.reason || '',
    businessEvidence: relevance.evidence || {},
    score,
    verifiedAt: new Date().toISOString(),
  };
}
