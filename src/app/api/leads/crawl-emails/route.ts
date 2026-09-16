import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/leads/crawl-emails
 * 리드의 회사 사이트를 크롤링해서 이메일 자동 수집.
 *
 * body:
 *   scope?: 'verified-no-email' (default) | 'verifying-no-email' | 'all-no-email' | 'ids'
 *   ids?: string[]                 // scope='ids' 일 때 leadId 배열
 *   limit?: number                 // 이번 배치 최대 처리 건수 (default 50)
 *   promoteToEmail?: boolean       // true 면 Email 필드 비어있을 때 최우선 후보를 Email 로 승격 (default true)
 *   dryRun?: boolean               // true 면 DB 업데이트 안 함 (미리보기)
 *
 * response:
 *   { success, processed, foundCount, updatedCount, promotedCount, samples: [...], skipped: [...] }
 */

// 실제 브라우저처럼 보이는 UA
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// 이메일 정규식 — RFC 100% 는 아니지만 실무 커버율 99%+
// - `%` 를 char class 에서 제외 (URL-encoded 조각 %20 등이 오탐되는 문제)
// - lookbehind `(?<![a-zA-Z0-9%])` : `%20info@…` 처럼 앞에 hex 나 % 가 있으면 매치 거부
// - local-part 는 반드시 알파벳으로 시작 (실무 B2B 이메일 99% 커버, `2ndbureau@` 같은 예외는 포기)
const EMAIL_RE = /(?<![a-zA-Z0-9%])[a-zA-Z][a-zA-Z0-9._+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24}/g;

// 무시할 이메일 패턴 (스팸/시스템/서드파티/이미지 파일명/placeholder)
const NOISE_PATTERNS = [
  // 서비스/시스템
  /sentry\.(io|wixpress)/i, /wixpress\.com$/i, /wordpress\.(com|org)$/i,
  /noreply/i, /no-reply/i, /donotreply/i, /mailer-daemon/i,
  /postmaster@/i, /abuse@/i, /webmaster@/i,
  // CDN/이미지/캐시버스터
  /@sentry\./i, /@2x\.png$/i, /\.(png|jpg|jpeg|webp|gif|svg|ico|pdf|css|js)$/i,
  /^[a-f0-9]{32,}@/i, /jsdelivr/i, /cdn\./i, /gravatar/i,
  // placeholder/template (오탐 방지)
  /@example\.(com|org|net|io)$/i, /@domain\.(com|org)$/i,
  /@yourdomain/i, /@your-domain/i, /@companyname\./i,
  /@email\.(de|com)$/i,
  /^(ihre|deine|your|meine|my|dein)@/i,
  /^example@/i, /^info@example/i,
  /@website\./i, /@yoursite\./i, /@yourcompany\./i,
  /@test\.(com|org|io)$/i, /@localhost/i,
  /^user@/i, /^name@/i, /^address@/i,
  /@lorem/i, /@ipsum/i,
];

// 역할별 우선순위 (낮을수록 최우선)
function priorityScore(email: string): number {
  const local = email.split('@')[0]?.toLowerCase() || '';
  if (/^(partnership|partnerships|partner)$/.test(local)) return 1;
  if (/^(business|biz|b2b|wholesale)/.test(local)) return 2;
  if (/^(sales|export)/.test(local)) return 3;
  if (/^(marketing|brand)/.test(local)) return 4;
  if (/^(buyer|buying|purchas)/.test(local)) return 5;
  if (/^(ceo|founder|owner)/.test(local)) return 6;
  if (/^(pr|press|media)/.test(local)) return 7;
  if (/^(hello|hi|hey)/.test(local)) return 8;
  if (/^(contact|info|inquiries|inquiry)/.test(local)) return 9;
  if (/^(support|help|service)/.test(local)) return 10;
  if (/^(admin|office)/.test(local)) return 11;
  return 20;  // named person mailboxes, etc.
}

function isNoise(email: string): boolean {
  return NOISE_PATTERNS.some((r) => r.test(email));
}

// 한국 기업 판별 (Region 필드 기준 — 다양한 표기 커버)
const KOREA_REGION_PATTERNS = [
  /^kr$/i,
  /^ko$/i,
  /korea/i,          // South Korea, Korea, Republic of Korea, Korea Republic
  /^republic of korea/i,
  /^south korea/i,
  /대한민국/,
  /한국/,
  /^koreano/i,       // 스페인어권 표기
];
function isKoreanCompany(region: string): boolean {
  if (!region) return false;
  const c = region.trim();
  if (!c) return false;
  // 명시적으로 North Korea 는 제외 대상 아님 (요청 맥락상 남한 기업)
  if (/north\s*korea|dprk|조선민주주의/i.test(c)) return false;
  return KOREA_REGION_PATTERNS.some((r) => r.test(c));
}

// URL 정규화
function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

// 3-4 UA 회전 (기본 봇 차단 우회)
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];
let _uaIdx = 0;
function pickUA() { _uaIdx = (_uaIdx + 1) % UAS.length; return UAS[_uaIdx]; }

// 사이트에서 이메일 뽑기
async function fetchAndExtract(url: string, ac: AbortController, maxBytes = 500_000): Promise<string[]> {
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': pickUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8,de;q=0.7,fr;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
    });
    if (!res.ok) return [];
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(ct)) return [];

    // 스트림에서 500KB 만 읽기 (거대 페이지 방지)
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return extractEmails(text.slice(0, maxBytes));
    }
    let bytesRead = 0;
    const chunks: Uint8Array[] = [];
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytesRead += value.length;
    }
    try { await reader.cancel(); } catch {}
    const buf = new Uint8Array(bytesRead);
    let off = 0;
    for (const c of chunks) {
      const take = Math.min(c.length, maxBytes - off);
      buf.set(c.subarray(0, take), off);
      off += take;
      if (off >= maxBytes) break;
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    return extractEmails(text);
  } catch {
    return [];
  }
}

// HTML 엔티티 디코딩 (&#64; → @, &amp; → &, &nbsp; → space 등)
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// 난독화된 이메일을 정상 형태로 복원
// "info [at] company [dot] com" → "info@company.com"
// "info(at)company(dot)com", "info AT company DOT com", "info＠company．com" (fullwidth) 등
function deobfuscateEmails(text: string): string {
  return text
    // fullwidth 문자 → ASCII
    .replace(/[＠﹫]/g, '@')
    .replace(/[．․﹒]/g, '.')
    // (at) / [at] / {at} / AT 패턴
    .replace(/\s*[\(\[\{]\s*at\s*[\)\]\}]\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    // (dot) / [dot] / {dot} / DOT 패턴
    .replace(/\s*[\(\[\{]\s*dot\s*[\)\]\}]\s*/gi, '.')
    .replace(/\s+dot\s+/gi, '.')
    // "info AT company DOT com" 대문자 특수 케이스
    .replace(/\bAT\b/g, '@')
    .replace(/\bDOT\b/g, '.');
}

function extractEmails(html: string): string[] {
  const out = new Set<string>();

  // 0) HTML 엔티티 디코드 (전체 HTML)
  const decoded = decodeHtmlEntities(html);

  // 1) mailto: 링크
  const mailtoRe = /mailto:([^"'<>\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(decoded)) !== null) {
    let raw = m[1].split('?')[0];
    try { raw = decodeURIComponent(raw); } catch {}
    const clean = raw.match(EMAIL_RE);
    if (clean) clean.forEach((e) => out.add(e.toLowerCase()));
  }

  // 2) JSON-LD 구조화 데이터 (schema.org Organization/Person)
  //    <script type="application/ld+json">{"email":"info@x.com",...}</script>
  const jsonLdRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jm: RegExpExecArray | null;
  while ((jm = jsonLdRe.exec(decoded)) !== null) {
    try {
      const data = JSON.parse(jm[1]);
      const collectEmails = (obj: any): void => {
        if (!obj) return;
        if (typeof obj === 'string') {
          const found = obj.match(EMAIL_RE);
          if (found) found.forEach((e) => out.add(e.toLowerCase()));
          return;
        }
        if (Array.isArray(obj)) { obj.forEach(collectEmails); return; }
        if (typeof obj === 'object') {
          // "email" 필드 우선 처리
          if (obj.email && typeof obj.email === 'string') {
            const found = obj.email.match(EMAIL_RE);
            if (found) found.forEach((e: string) => out.add(e.toLowerCase()));
          }
          Object.values(obj).forEach(collectEmails);
        }
      };
      collectEmails(data);
    } catch {}
  }

  // 3) 텍스트에서 직접 (일반적인 케이스)
  const textMatches = decoded.match(EMAIL_RE) || [];
  for (const e of textMatches) out.add(e.toLowerCase());

  // 4) 난독화된 이메일 (at/dot/fullwidth) 복원 후 재추출
  const deobfuscated = deobfuscateEmails(decoded);
  const deobfMatches = deobfuscated.match(EMAIL_RE) || [];
  for (const e of deobfMatches) out.add(e.toLowerCase());

  // 5) data-email 속성 등 (React/Vue 컴포넌트 자주)
  const dataEmailRe = /data-email=["']([^"']+)["']/gi;
  while ((m = dataEmailRe.exec(decoded)) !== null) {
    const found = m[1].match(EMAIL_RE);
    if (found) found.forEach((e) => out.add(e.toLowerCase()));
  }

  // 노이즈 필터링
  return Array.from(out).filter((e) => !isNoise(e));
}

// 후보 사이트 URL 조합 — 다국어 · impressum(DE) · 배급/도매 관련 경로 확장
function candidatePaths(baseUrl: string): string[] {
  try {
    const u = new URL(baseUrl);
    const origin = u.origin;
    // baseUrl 이 /en/foo 같은 서브패스면 그 언어 유지 위해 그대로 포함
    const paths = [
      baseUrl,
      `${origin}/contact`,
      `${origin}/contact-us`,
      `${origin}/contactus`,
      `${origin}/contacts`,
      `${origin}/about`,
      `${origin}/about-us`,
      `${origin}/aboutus`,
      // B2B 특화 (파트너십/도매)
      `${origin}/wholesale`,
      `${origin}/b2b`,
      `${origin}/business`,
      `${origin}/partnerships`,
      `${origin}/partners`,
      // 독일어권 (impressum 은 법적 컨택 정보 의무 노출)
      `${origin}/impressum`,
      `${origin}/kontakt`,
      // 한국어
      `${origin}/ko/contact`,
      `${origin}/kr/contact`,
      // 언론/PR
      `${origin}/press`,
      `${origin}/media`,
      // 지원/고객서비스
      `${origin}/support`,
      `${origin}/customer-service`,
      // 흔한 다국어 prefix 조합
      `${origin}/en/contact`,
      `${origin}/en/about`,
    ];
    // 중복 제거
    return Array.from(new Set(paths));
  } catch {
    return [baseUrl];
  }
}

// 리드 하나 크롤
async function crawlLead(lead: any, timeoutMs = 10000): Promise<{ emails: string[]; error?: string }> {
  const site = normalizeUrl(lead.WebsiteContact);
  if (!site) return { emails: [], error: 'invalid-url' };

  const found = new Set<string>();
  const paths = candidatePaths(site);
  for (const url of paths) {
    if (found.size >= 5) break;  // 5개 확보되면 조기 종료
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const emails = await fetchAndExtract(url, ac);
      emails.forEach((e) => found.add(e));
    } catch {
      /* 페이지 하나 실패해도 다음 경로 시도 */
    } finally {
      clearTimeout(timer);
    }
    // 홈에서 이미 발견되면 나머지 경로 스킵 (트래픽 절약)
    if (url === site && found.size > 0) break;
  }

  // 우선순위 정렬
  const sorted = Array.from(found).sort((a, b) => {
    const pa = priorityScore(a);
    const pb = priorityScore(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  return { emails: sorted };
}

// 병렬 워커 풀 (max concurrency)
async function runPool<T, R>(items: T[], worker: (item: T, i: number) => Promise<R>, concurrency = 5): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function pull() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => pull());
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const scope: string = body.scope || 'verified-no-email';
  const limit: number = Math.max(1, Math.min(500, Number(body.limit) || 50));
  const promoteToEmail: boolean = body.promoteToEmail !== false;  // default true
  const dryRun: boolean = body.dryRun === true;
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

  try {
    await dbConnect();
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `DB 연결 실패: ${e?.message || 'unknown'}` }, { status: 500 });
  }

  // 필터 구성
  let filter: any = {};
  if (scope === 'ids') {
    if (!ids.length) return NextResponse.json({ success: false, error: 'ids 필요' }, { status: 400 });
    filter = { leadId: { $in: ids } };
  } else if (scope === 'verifying-no-email') {
    filter = {
      stage: 'verifying',
      $and: [
        { $or: [{ Email: '' }, { Email: null }, { Email: { $exists: false } }] },
        { WebsiteContact: { $exists: true, $ne: '' } },
      ],
    };
  } else if (scope === 'all-no-email') {
    filter = {
      stage: { $in: ['verified', 'verifying'] },
      $and: [
        { $or: [{ Email: '' }, { Email: null }, { Email: { $exists: false } }] },
        { WebsiteContact: { $exists: true, $ne: '' } },
      ],
    };
  } else {
    // 'verified-no-email' (default)
    filter = {
      stage: 'verified',
      $and: [
        { $or: [{ Email: '' }, { Email: null }, { Email: { $exists: false } }] },
        { WebsiteContact: { $exists: true, $ne: '' } },
      ],
    };
  }

  // 이미 크롤된 것 제외 옵션 (재시도 안 하려면)
  // crawledAt 이 세팅되어 있으면 = 이미 한 번 시도한 리드 → 재시도 안 함
  // (crawledEmails 이 빈 배열이더라도 crawledAt 은 세팅됨 → "0건 발견" 도 완료 처리)
  if (body.skipAlreadyCrawled !== false) {
    filter.$and = (filter.$and || []).concat([
      { $or: [{ crawledAt: { $exists: false } }, { crawledAt: '' }, { crawledAt: null }] },
    ]);
  }

  // 한국 기업 제외 (사용자 요청 — 국내 리드는 별도 채널로 관리)
  if (body.excludeKorea !== false) {
    filter.$and = (filter.$and || []).concat([
      { Region: { $not: /korea|kr|대한민국|한국/i } },
    ]);
  }

  const targets = await Lead.find(filter)
    .select('leadId Company Region WebsiteContact Email crawledEmails')
    .limit(limit)
    .lean();

  // 방어적 2차 필터 — regex 로 못 잡는 표기 대비 (JS 판별)
  const filteredTargets = body.excludeKorea === false
    ? (targets as any[])
    : (targets as any[]).filter((l) => !isKoreanCompany(l.Region || ''));

  const now = new Date().toISOString();
  let foundCount = 0;
  let promotedCount = 0;
  const samples: any[] = [];
  const ops: any[] = [];

  const results = await runPool(filteredTargets, async (lead) => {
    const { emails, error } = await crawlLead(lead);
    if (emails.length > 0) foundCount++;

    if (samples.length < 20) {
      samples.push({
        leadId: lead.leadId,
        company: lead.Company,
        site: lead.WebsiteContact,
        emails: emails.slice(0, 5),
        error,
      });
    }

    if (!dryRun) {
      const update: any = {
        crawledEmails: emails,
        crawledAt: now,
      };
      // Email 이 비어있고 후보가 있으면 최우선 후보 자동 승격
      if (promoteToEmail && emails.length > 0 && (!lead.Email || lead.Email.trim() === '')) {
        update.Email = emails[0];
        promotedCount++;
      }
      ops.push({
        updateOne: {
          filter: { leadId: lead.leadId },
          update: { $set: update },
        },
      });
    }

    return { leadId: lead.leadId, count: emails.length };
  }, 5);

  let updatedCount = 0;
  if (!dryRun && ops.length > 0) {
    const r = await Lead.bulkWrite(ops, { ordered: false });
    updatedCount = r.modifiedCount || 0;
  }

  return NextResponse.json({
    success: true,
    scope,
    processed: results.length,
    foundCount,
    updatedCount,
    promotedCount,
    dryRun,
    samples,
  });
}
