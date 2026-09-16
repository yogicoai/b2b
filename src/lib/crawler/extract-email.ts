/**
 * 페이지 텍스트·HTML 에서 이메일을 뽑고 노이즈를 걸러낸다.
 *
 * 해외판에도 같은 일을 하는 정규식이 crawl-emails 라우트 안에 있지만, 국내 사이트는
 * "이메일: hong (at) yogibo (dot) kr" 처럼 사람이 읽으라고 난독화해 둔 경우가 많아
 * 복원 단계를 한 겹 더 둔다.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** logo@2x.png 같은 자산 파일명이 이메일로 잡히는 오탐 */
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?)$/i;

/**
 * 담당자 메일이 아닌 노이즈 도메인.
 *
 * 아래 목록은 실측으로 늘렸다. 첫 크롤(클라이밍짐 6곳)에서 뽑힌 5개 중 4개가
 * 가짜였다 — ntm.pst@ic.net · ssl.pst@ic.net(스크립트 조각),
 * st@ic.cdninstagram.com(인스타 임베드), information@office.com(MS 기본값).
 * 가짜 주소는 AI 검증비를 쓰고 발송까지 흘러간다.
 */
const JUNK_DOMAINS = [
  'example.com', 'example.org', 'domain.com', 'email.com', 'test.com',
  'sentry.io', 'wixpress.com', 'wix.com', 'schema.org', 'w3.org',
  'googleapis.com', 'gstatic.com', 'cloudflare.com', 'jsdelivr.net',
  'yourdomain.com', 'company.com',
  // 실측으로 추가
  'ic.net', 'cdninstagram.com', 'office.com', 'microsoft.com',
  'fbcdn.net', 'akamaihd.net', 'unpkg.com', 'bootstrapcdn.com',
  'googletagmanager.com', 'google-analytics.com', 'doubleclick.net',
  'youtube.com', 'vimeo.com', 'kakaocdn.net', 'pstatic.net', 'daumcdn.net',
];

/** 보내봐야 사람이 안 보는 주소 */
const JUNK_LOCAL = ['noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'postmaster'];

export function isValidEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (ASSET_EXT.test(lower)) return false;
  const [local, domain] = lower.split('@');
  if (!local || !domain) return false;
  if (domain.length < 4 || !domain.includes('.')) return false;
  if (JUNK_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return false;
  if (JUNK_LOCAL.includes(local)) return false;
  // 캐시버스터·해시가 로컬파트로 잡힌 것 (@a1b2c3d4…)
  if (/^[0-9a-f]{8,}$/.test(local)) return false;
  return true;
}

/**
 * 그 업체의 진짜 주소로 볼 수 있는가.
 *
 * 홈페이지에서 긁은 주소의 도메인은 셋 중 하나여야 한다:
 *   1. 그 사이트 자신의 도메인   (info@climbing.co.kr — 제일 확실)
 *   2. 흔한 웹메일               (naver·gmail·daum — 소상공인은 이걸 쓴다)
 *   3. 그 외                     → 대개 페이지에 박힌 남의 스크립트·위젯이다
 *
 * 3번을 막는 것이 핵심이다. 노이즈 도메인 목록을 아무리 늘려도 새로운 CDN 이
 * 계속 나오는데, "이 사이트와 무관한 도메인" 이라는 기준은 한 번에 걸러진다.
 */
const COMMON_WEBMAIL = new Set([
  'naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'nate.com',
  'kakao.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
]);

function siteHost(url: string | undefined | null): string {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 같은 회사 도메인인가 (서브도메인·co.kr 형태까지 같이 본다) */
function sameOrg(emailDomain: string, host: string): boolean {
  if (!host) return false;
  if (emailDomain === host) return true;
  if (emailDomain.endsWith('.' + host) || host.endsWith('.' + emailDomain)) return true;
  // climbing.co.kr vs mail.climbing.co.kr 같은 경우를 위해 핵심 토큰 비교
  const core = (d: string) => {
    const parts = d.split('.');
    const SECOND = new Set(['co', 'com', 'net', 'org', 'or', 'go', 'ac', 'ne', 'pe']);
    let i = parts.length - 2;
    if (i > 0 && SECOND.has(parts[i])) i -= 1;
    return parts[Math.max(0, i)] || '';
  };
  const a = core(emailDomain);
  return Boolean(a) && a === core(host);
}

/**
 * 그 사이트에서 뽑은 주소 중 믿을 만한 것만 남긴다.
 * siteUrl 을 모르면 웹메일만 통과시킨다 — 근거가 없으면 보수적으로 간다.
 */
export function keepLikelyOwnEmails(emails: string[], siteUrl?: string | null): string[] {
  const host = siteHost(siteUrl);
  return emails.filter((e) => {
    const domain = e.split('@')[1] || '';
    if (COMMON_WEBMAIL.has(domain)) return true;
    return sameOrg(domain, host);
  });
}

export function extractEmails(text: string | undefined | null): string[] {
  if (!text) return [];
  const deobf = String(text)
    .replace(/\s*\[?\(?\s*at\s*\)?\]?\s*/gi, '@')
    .replace(/\s*\[?\(?\s*dot\s*\)?\]?\s*/gi, '.');

  const found = new Set<string>();
  for (const raw of [String(text), deobf]) {
    for (const m of raw.match(EMAIL_RE) || []) {
      const email = m.toLowerCase();
      if (isValidEmail(email)) found.add(email);
    }
  }
  return [...found];
}
