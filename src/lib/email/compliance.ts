/**
 * 정보통신망법 제50조 준수 — (광고) 표기 · 발신자 정보 · 수신거부 · 야간 발송 제한.
 *
 * 해외판(vercelData)에는 이 파일에 해당하는 것이 아예 없었다. 상대가 해외 바이어라
 * 국내 광고성 정보 규제의 적용 대상이 아니었기 때문이다. 국내 업체에 먼저 보내는
 * 콜드메일은 전부 "광고성 정보"이고, 아래 세 가지가 빠지면 건당 과태료 대상이 된다.
 *
 *   1. 제목 맨 앞에 (광고)
 *   2. 본문에 발신자 명칭·주소·연락처
 *   3. 수신거부 수단을 본문에 명시, 그리고 실제로 동작할 것
 *
 * 그래서 이 모듈은 "쓰면 좋은 유틸"이 아니라 발송 경로가 반드시 통과해야 하는
 * 관문이다. mailer.sendMail({ ad: true }) 가 이 함수들을 호출한다.
 */
import crypto from 'crypto';

const SECRET = process.env.UNSUB_SECRET || 'dev-unsub-secret';

/**
 * 수신거부 링크가 가리킬 주소.
 *
 * ⚠️ 실제 발송 전에 **반드시 바깥에서 열리는 주소**로 바꿔야 한다.
 * localhost 로 나가면 받는 사람 브라우저에서 열리지 않고, 그건 수신거부 수단을
 * 제공하지 않은 것과 같다 (정보통신망법 제50조 제4항).
 * 개발 중에만 localhost 로 떨어진다.
 */
const BASE = process.env.APP_BASE_URL || 'http://localhost:5610';

/** 바깥에서 열리는 주소인가 — 실발송 직전에 확인한다 */
export function isPublicBaseUrl(): boolean {
  return !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(BASE);
}

export const COMPANY = {
  name: process.env.COMPANY_NAME || '주식회사 요기코퍼레이션',
  addr: process.env.COMPANY_ADDR || '',
  tel: process.env.COMPANY_TEL || '',
};

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function sign(email: string): string {
  return crypto.createHmac('sha256', SECRET).update(email.toLowerCase()).digest('base64url');
}

/**
 * 수신거부 링크.
 * 이메일을 그대로 쿼리에 넣으면 남의 주소를 손으로 바꿔 수신거부시킬 수 있어
 * HMAC 서명을 함께 싣는다.
 */
export function unsubscribeUrl(email: string): string {
  return `${BASE}/api/unsubscribe?e=${b64url(email.toLowerCase())}&t=${sign(email)}`;
}

/** 수신거부 토큰 검증 → 유효하면 이메일, 아니면 null */
export function verifyUnsubscribe(e: unknown, t: unknown): string | null {
  try {
    const email = Buffer.from(String(e), 'base64url').toString('utf8').toLowerCase();
    const a = Buffer.from(String(t));
    const b = Buffer.from(sign(email));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return email;
    return null;
  } catch {
    return null;
  }
}

/** 제목 (광고) 표기. 이미 붙어 있으면 덧붙이지 않는다. */
export function adSubject(subject: string, useAd = true): string {
  const s = String(subject || '').trim();
  if (!useAd) return s;
  return s.startsWith('(광고)') ? s : `(광고) ${s}`;
}

export const LOGO_URL = 'https://yogibo.openhost.cafe24.com/web/img/icon/logo3_on.png';

export function logoHeader(): string {
  return `<div style="text-align:left;padding:8px 0 16px;margin-bottom:16px;border-bottom:1px solid #eee">
  <img src="${LOGO_URL}" alt="요기보 Yogibo" style="max-width:170px;height:auto;display:inline-block" />
</div>`;
}

/** 본문 하단에 발신자 정보 + 수신거부 링크. 이미 붙어 있으면 다시 붙이지 않는다. */
export function withComplianceFooter(bodyHtml: string, email: string): string {
  if (bodyHtml.includes('data-compliance-footer')) return bodyHtml;
  const unsub = unsubscribeUrl(email);
  const lines = [COMPANY.name, COMPANY.addr, COMPANY.tel].filter(Boolean).join(' · ');
  return `${bodyHtml}
<hr style="margin:32px 0 16px;border:none;border-top:1px solid #e5e5e5" />
<div data-compliance-footer style="font-size:12px;color:#888;line-height:1.6">
  <p>본 메일은 정보통신망법에 따른 <strong>광고성 정보</strong>이며, 귀사의 이메일 주소가 인터넷상에 공개되어 있어 발송되었습니다.</p>
  <p>${lines}</p>
  <p>더 이상 메일 수신을 원치 않으시면 <a href="${unsub}" style="color:#3FA6D3">여기를 눌러 수신거부</a> 하실 수 있습니다.</p>
</div>`;
}

/**
 * 야간(21:00~08:00 KST) 광고성 메일 전송 제한.
 * 서버가 어느 시간대에 있든 KST 기준으로 판단해야 한다 — Vercel 함수는 UTC 로 돈다.
 */
export function isNightBlocked(now: Date = new Date()): { blocked: boolean; kstHour: number } {
  const kstHour = (now.getUTCHours() + 9) % 24;
  return { blocked: kstHour >= 21 || kstHour < 8, kstHour };
}

/**
 * 광고성 메일 한 통에 위 규칙을 한꺼번에 입힌다.
 * 발송 직전 단계에서 부르는 것이 원칙 — 미리보기와 실제 발송이 달라지면 안 되므로
 * 미리보기 화면도 같은 함수를 쓴다.
 */
export function applyCompliance(
  { subject, html, to }: { subject: string; html: string; to: string },
  { useAdMark = true }: { useAdMark?: boolean } = {}
): { subject: string; html: string } {
  return {
    subject: adSubject(subject, useAdMark),
    html: withComplianceFooter(`${logoHeader()}${html}`, to),
  };
}

/** {{companyName}} 같은 치환자 처리 */
export function renderTemplate(str: string, vars: Record<string, string | undefined>): string {
  return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}
