/**
 * 홈페이지에서 이메일 수집 — 메인 렌더 → 없으면 연락처류 서브페이지 순회.
 */
import { getBrowser } from './browser';
import { extractEmails } from './extract-email';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 연락처·기관정보가 있을 법한 서브페이지 힌트 (국문 표기 포함) */
const CONTACT_HINTS = [
  'contact', 'about', 'company', 'privacy', 'introduction', 'intro', 'org',
  '문의', '연락', '오시', '개인정보', '기관', '소개', '이용약관', 'sitemap',
];

interface Scraped {
  mailto: string[];
  bodyText: string;
  html: string;
  links: Array<{ href: string; text: string }>;
}

function normalizeUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

function collectEmails(data: Scraped): string[] {
  const found = new Set<string>();
  for (const m of data.mailto || []) extractEmails(m).forEach((x) => found.add(x));
  extractEmails(data.bodyText).forEach((x) => found.add(x));
  extractEmails(data.html).forEach((x) => found.add(x));
  return [...found];
}

function pickContactLinks(links: Scraped['links'], baseUrl: string, max = 3): string[] {
  const base = normalizeUrl(baseUrl);
  if (!base) return [];
  const out = new Set<string>();
  for (const { href, text } of links) {
    if (out.size >= max) break;
    const hay = `${href || ''} ${text || ''}`.toLowerCase();
    if (!CONTACT_HINTS.some((h) => hay.includes(h))) continue;
    const u = normalizeUrl(href);
    // 같은 호스트만 — 외부 링크를 따라가면 끝이 없다
    if (u && u.hostname === base.hostname) out.add(u.toString());
  }
  return [...out];
}

export async function crawlHomepage(
  url: string,
  { maxSubpages = 3, timeoutMs = 15000 }: { maxSubpages?: number; timeoutMs?: number } = {}
): Promise<{ emails: string[]; visited: number }> {
  const u = normalizeUrl(url);
  if (!u) return { emails: [], visited: 0 };

  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: UA, ignoreHTTPSErrors: true });

  async function loadAndScrape(target: string): Promise<Scraped | null> {
    const page = await context.newPage();
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(1200); // JS 렌더 여유
      return (await page.evaluate(() => {
        const emails = new Set<string>();
        document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
          const addr = (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
          if (addr) emails.add(addr);
        });
        const links: Array<{ href: string; text: string }> = [];
        document.querySelectorAll('a[href]').forEach((a) => {
          links.push({
            href: (a as HTMLAnchorElement).href,
            text: (a.textContent || '').trim().slice(0, 40),
          });
        });
        return {
          mailto: [...emails],
          bodyText: document.body ? document.body.innerText : '',
          html: document.documentElement ? document.documentElement.outerHTML : '',
          links,
        };
      })) as Scraped;
    } catch {
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }

  let visited = 0;
  try {
    const main = await loadAndScrape(u.toString());
    if (!main) return { emails: [], visited: 0 };
    visited = 1;

    const emails = new Set(collectEmails(main));

    // 메인에서 못 찾았을 때만 서브페이지를 판다. 찾았는데도 더 도는 건 시간 낭비다.
    if (emails.size === 0 && maxSubpages > 0) {
      for (const link of pickContactLinks(main.links, u.toString(), maxSubpages)) {
        const sub = await loadAndScrape(link);
        visited++;
        if (sub) collectEmails(sub).forEach((e) => emails.add(e));
        if (emails.size > 0) break;
      }
    }
    return { emails: [...emails], visited };
  } finally {
    await context.close().catch(() => {});
  }
}
