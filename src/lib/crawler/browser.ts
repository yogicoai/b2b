/**
 * Playwright 브라우저 싱글턴.
 *
 * 왜 브라우저가 필요한가: 국내 기관·기업 홈페이지 상당수가 SPA 거나 본문을 JS 로
 * 그린다. fetch 로 HTML 만 받아오면 연락처 영역이 통째로 비어 있는 일이 잦다.
 *
 * 주의 — 이 경로는 Vercel(서버리스)에서 못 돈다. 브라우저 바이너리가 없고
 * 실행시간 제한에도 걸린다. 크롤링은 로컬/전용 워커에서 스크립트로 돌리고,
 * 배포된 앱은 그 결과를 보고 다루기만 한다.
 */
import type { Browser } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const { chromium } = await import('playwright');
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => {});
}
