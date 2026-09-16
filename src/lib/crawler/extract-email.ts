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

/** 담당자 메일이 아닌 흔한 노이즈 도메인 */
const JUNK_DOMAINS = [
  'example.com', 'example.org', 'domain.com', 'email.com', 'test.com',
  'sentry.io', 'wixpress.com', 'wix.com', 'schema.org', 'w3.org',
  'googleapis.com', 'gstatic.com', 'cloudflare.com', 'jsdelivr.net',
  'yourdomain.com', 'company.com',
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
