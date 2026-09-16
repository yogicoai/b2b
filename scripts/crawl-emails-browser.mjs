#!/usr/bin/env node
// 브라우저 (Playwright headless Chrome) 기반 이메일 크롤러
// 정적 fetch 로 실패한 리드들을 대상으로 JS 렌더 완료 후 이메일 추출.
//
// 사용법:
//   node scripts/crawl-emails-browser.mjs [--limit=50] [--concurrency=3] [--dry-run]
//
// 로직:
//   1. 로그인 → /api/leads?stage=verified 조회
//   2. 필터: Email 없음 + WebsiteContact 있음 + (crawledAt 있어도 재시도)
//   3. 각 리드 사이트 방문 (contact/about 등 22개 경로)
//   4. Playwright 로 렌더 완료 대기 → HTML + mailto: + JSON-LD 추출
//   5. 발견 시 /api/leads/[id] PUT 으로 Email 필드 업데이트
//   6. 진행 상황 콘솔 출력

import { chromium } from 'playwright';

const BASE = process.env.CRAWLER_BASE || 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin';

// CLI args
const args = Object.fromEntries(
  process.argv.slice(2).map(a => a.replace(/^--/, '').split('='))
);
const LIMIT = parseInt(args.limit || '50', 10);
const CONCURRENCY = parseInt(args.concurrency || '3', 10);
const DRY_RUN = args['dry-run'] !== undefined;

const EMAIL_RE = /(?<![a-zA-Z0-9%])[a-zA-Z][a-zA-Z0-9._+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24}/g;
const NOISE = [
  // 서비스/시스템/CDN
  /sentry\./i, /wixpress\.com$/i, /wordpress\.(com|org)$/i,
  /noreply/i, /no-reply/i, /donotreply/i, /mailer-daemon/i,
  /postmaster@/i, /abuse@/i, /webmaster@/i,
  /^[a-f0-9]{32,}@/i, /jsdelivr/i, /cdn\./i, /gravatar/i,
  /\.(png|jpg|jpeg|webp|gif|svg|ico|pdf|css|js)$/i,
  // 흔한 template/placeholder 이메일 (오탐 방지)
  /@example\.(com|org|net|io)$/i, /@domain\.(com|org)$/i,
  /@yourdomain/i, /@your-domain/i, /@companyname\./i,
  /@email\.(de|com)$/i,               // ihre@email.de (독일 예시)
  /^(ihre|deine|your|meine|my|dein)@/i,
  /^example@/i, /^info@example/i,
  /@website\./i, /@yoursite\./i, /@yourcompany\./i,
  /@test\.(com|org|io)$/i,
  /@localhost/i,
  /^user@/i, /^name@/i, /^address@/i,
  // 이메일 마스킹 서비스
  /@lorem/i, /@ipsum/i,
];
const isNoise = (e) => NOISE.some(r => r.test(e));

const PRIORITY = (email) => {
  const l = (email.split('@')[0] || '').toLowerCase();
  if (/^(partnership|partnerships|partner)$/.test(l)) return 1;
  if (/^(business|biz|b2b|wholesale)/.test(l)) return 2;
  if (/^(sales|export)/.test(l)) return 3;
  if (/^(marketing|brand)/.test(l)) return 4;
  if (/^(buyer|buying|purchas)/.test(l)) return 5;
  if (/^(ceo|founder|owner)/.test(l)) return 6;
  if (/^(pr|press|media)/.test(l)) return 7;
  if (/^(hello|hi|hey)/.test(l)) return 8;
  if (/^(contact|info|inquiries|inquiry)/.test(l)) return 9;
  if (/^(support|help|service)/.test(l)) return 10;
  if (/^(admin|office)/.test(l)) return 11;
  return 20;
};

const isKorean = (c) => /korea|한국|대한민국/i.test(c || '') && !/north/i.test(c || '');

function candidatePaths(baseUrl) {
  try {
    const u = new URL(baseUrl);
    const origin = u.origin;
    return Array.from(new Set([
      baseUrl,
      `${origin}/contact`, `${origin}/contact-us`, `${origin}/contactus`, `${origin}/contacts`,
      `${origin}/about`, `${origin}/about-us`, `${origin}/aboutus`,
      `${origin}/wholesale`, `${origin}/b2b`, `${origin}/business`,
      `${origin}/partnerships`, `${origin}/partners`,
      `${origin}/impressum`, `${origin}/kontakt`,
      `${origin}/press`, `${origin}/media`,
      `${origin}/support`, `${origin}/customer-service`,
    ]));
  } catch {
    return [baseUrl];
  }
}

function extractFromText(text) {
  const out = new Set();
  const matches = text.match(EMAIL_RE) || [];
  for (const e of matches) {
    const low = e.toLowerCase();
    if (!isNoise(low)) out.add(low);
  }
  return out;
}

async function loginCookie(fetch) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_ID, password: ADMIN_PW }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/admin_session=([^;]+)/);
  if (!m) throw new Error('no admin_session cookie');
  return `admin_session=${m[1]}`;
}

async function fetchTargets(cookie, fetch, limit) {
  const url = `${BASE}/api/leads?stage=verified&page=1&limit=5000`;
  const res = await fetch(url, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`leads fetch ${res.status}`);
  const data = await res.json();
  const leads = (data.data || []).filter(l => {
    const e = (l.Email || '').trim();
    const noEmail = !e || /^Not found/i.test(e) || !/@/.test(e);
    const notTried = !l.crawledAt || String(l.crawledAt).trim() === '';
    return noEmail
      && notTried
      && !isKorean(l.Region)
      && l.WebsiteContact && String(l.WebsiteContact).trim();
  });
  return leads.slice(0, limit);
}

// 하드 타임아웃 wrapper (모든 페이지 조회 통틀어 최대 N 초, 초과 시 강제 중단)
async function withHardTimeout(promise, ms, tag) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`hard-timeout:${tag}`)), ms)),
  ]);
}

async function crawlLead(browser, lead, opts = {}) {
  const perPageMs = opts.perPageMs || 12000;
  const totalMs = opts.totalMs || 45000;   // 리드 전체 최대 45초 (모든 경로 통틀어)
  const site = normalizeUrl(lead.WebsiteContact);
  if (!site) return { emails: [], error: 'invalid-url' };
  const paths = candidatePaths(site);
  const found = new Set();
  let ctx, page;
  try {
    ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });
    page = await ctx.newPage();
    // 이미지/폰트/미디어 로딩 차단 (속도)
    await page.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') return route.abort();
      return route.continue();
    });

    // 리드 전체를 하드 타임아웃으로 감쌈 — hang 감지되면 context 강제 종료
    await withHardTimeout((async () => {
      for (const url of paths) {
        if (found.size >= 5) break;
        try {
          await withHardTimeout((async () => {
            const res = await page.goto(url, { timeout: perPageMs, waitUntil: 'domcontentloaded' });
            if (!res || res.status() >= 400) return;
            await page.waitForTimeout(400);
            const html = await page.content();
            extractFromText(html).forEach(e => found.add(e));
            const mailtos = await page.$$eval('a[href^="mailto:"]', els =>
              els.map(el => (el.getAttribute('href') || '').replace(/^mailto:/, '').split('?')[0])
            ).catch(() => []);
            for (const raw of mailtos) {
              try {
                const dec = decodeURIComponent(raw).trim();
                const matches = dec.match(EMAIL_RE);
                if (matches) matches.forEach(e => found.add(e.toLowerCase()));
              } catch {}
            }
          })(), perPageMs + 2000, `page:${url}`);
          if (url === paths[0] && found.size > 0) break;
        } catch (e) { /* 페이지 하나 실패 무시 */ }
      }
    })(), totalMs, `lead:${lead.leadId}`);
  } catch (e) {
    // hard-timeout: hang 감지 → 결과는 지금까지 모은 것으로
  } finally {
    // 컨텍스트 강제 종료 (일부 사이트는 close 도 hang 됨 → race)
    try { await Promise.race([page?.close(), new Promise(r => setTimeout(r, 3000))]); } catch {}
    try { await Promise.race([ctx?.close(), new Promise(r => setTimeout(r, 3000))]); } catch {}
  }

  const clean = [...found].filter(e => !isNoise(e));
  const sorted = clean.sort((a, b) => {
    const pa = PRIORITY(a), pb = PRIORITY(b);
    return pa !== pb ? pa - pb : a.localeCompare(b);
  });
  return { emails: sorted };
}

function normalizeUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

async function updateLead(cookie, fetch, lead, emails) {
  const now = new Date().toISOString();
  const body = emails.length
    ? { Email: emails[0], crawledEmails: emails, crawledAt: now, updatedInfoAt: now }
    : { crawledEmails: [], crawledAt: now, updatedInfoAt: now };
  const res = await fetch(`${BASE}/api/leads/${lead._id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`update ${lead.leadId} failed: ${res.status}`);
}

async function pool(items, worker, size) {
  const out = [];
  let idx = 0;
  const runner = async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        out[i] = await worker(items[i], i);
      } catch (e) {
        out[i] = { error: e?.message || 'unknown' };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => runner()));
  return out;
}

(async () => {
  console.log(`▶ Playwright 크롤러 시작 · limit=${LIMIT} concurrency=${CONCURRENCY} dryRun=${DRY_RUN}`);
  const cookie = await loginCookie(fetch);
  console.log('✓ 로그인');

  const targets = await fetchTargets(cookie, fetch, LIMIT);
  console.log(`✓ 대상 ${targets.length} 건`);
  if (!targets.length) { console.log('처리할 리드 없음.'); process.exit(0); }

  const BROWSER_RECYCLE_EVERY = 40;   // 40건마다 브라우저 재시작 (메모리 leak 방지)
  let browser = await chromium.launch({ headless: true });
  console.log('✓ Chromium 실행');

  let done = 0;
  let found = 0;
  let promoted = 0;
  let lastRecycle = 0;
  const t0 = Date.now();

  // 청크 단위로 pool 실행 → 청크 사이에 브라우저 재시작 (hang 누적 방지)
  const chunkSize = BROWSER_RECYCLE_EVERY;
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    await pool(chunk, async (lead) => {
      const { emails } = await crawlLead(browser, lead);
      done++;
      if (emails.length && !DRY_RUN) {
        found++;
        try { await updateLead(cookie, fetch, lead, emails); promoted++; } catch {}
      } else if (!DRY_RUN) {
        // 시도했지만 못 찾은 것도 crawledAt 저장 → UI 에서 "이미 시도됨" 으로 처리
        try { await updateLead(cookie, fetch, lead, []); } catch {}
      }
      if (emails.length && DRY_RUN) found++;
      const rate = ((Date.now() - t0) / done / 1000).toFixed(1);
      console.log(`  [${done}/${targets.length}] ${lead.Company.slice(0, 40)} → ${emails.length ? emails[0] : '(none)'}   ${rate}s/lead · found=${found}`);
    }, CONCURRENCY);

    // 청크 끝나면 브라우저 재시작 (마지막 청크 아니면)
    if (i + chunkSize < targets.length) {
      console.log(`  ↺ 브라우저 재시작 (누적 ${done}건 · 발견 ${found}건)`);
      try { await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]); } catch {}
      browser = await chromium.launch({ headless: true });
    }
  }

  try { await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]); } catch {}
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`▪ 완료 · 시간 ${secs}s · 처리 ${done} · 발견 ${found} · 승격 ${promoted}`);
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
