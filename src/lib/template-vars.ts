import type { ILead } from '@/models/Lead';

/**
 * 템플릿에서 사용 가능한 변수 정의.
 * key = {{key}} 로 템플릿에 삽입 · label = 에디터 UI 에 표시할 한글 라벨.
 * example = 미리보기용 폴백 값.
 */
export type TemplateVarGroup = 'recipient' | 'company';

export interface TemplateVar {
  key: string;
  label: string;                  // 사람 친화 한글 라벨
  example: string;                // 미리보기 폴백
  description: string;            // 비개발자 설명 (툴팁/카드 서브텍스트)
  group: TemplateVarGroup;        // 팔레트 그룹핑
  fromLead: (lead: Partial<ILead>) => string;
}

export const TEMPLATE_VAR_GROUPS: Array<{ key: TemplateVarGroup; label: string; icon: string; color: string }> = [
  // 업체를 먼저 둔다 — 국내 콜드메일은 업체명이 주인공이고 담당자는 대개 모른다
  { key: 'company',   label: '받는 업체', icon: '🏢', color: '#3FA6D3' },
  { key: 'recipient', label: '담당자 (아는 경우)', icon: '👤', color: '#8b5cf6' },
];

export const TEMPLATE_VARS: TemplateVar[] = [
  // ── 상대 회사 ─────────────────────────
  //
  // 국내 콜드메일에서 제일 많이 쓰는 변수. 크롤링으로 들어온 리드는 담당자
  // 이름을 알 수 없고(공개된 대표 메일로 보낸다) 업체명만 안다. 그래서
  // 인사말이 "○○병원 담당자님께" 형태가 되고, 여기 들어가는 것이 업체명이다.
  {
    key: 'companyName',
    label: '업체명',
    example: '서울아산병원',
    description: '받는 업체 이름 · 인사말에 씁니다 (예: "{{companyName}} 담당자님께")',
    group: 'company',
    // 업체명이 없으면 빈칸으로 둔다. '담당자' 같은 값을 넣으면 양식이
    // "{{companyName}} 담당자님께" 라서 "담당자 담당자님께" 가 된다.
    fromLead: (l) => l.Company || '',
  },
  {
    key: 'Company',
    label: '업체명 (같은 값)',
    example: '서울아산병원',
    description: 'companyName 과 같습니다. 예전 양식이 이 이름을 쓰고 있어 함께 둡니다',
    group: 'company',
    fromLead: (l) => l.Company || '',
  },
  {
    key: 'Region',
    label: '지역',
    example: '서울',
    description: '업체가 있는 시·도 (예: "서울", "제주")',
    group: 'company',
    fromLead: (l) => l.Region || '',
  },

  // ── 받는 사람 ─────────────────────────
  // 크롤링으로 들어온 곳은 대개 비어 있다. 담당자를 아는 곳(직접 넣었거나
  // 이미 대화가 오간 곳)에만 값이 있으므로, 없을 때를 항상 염두에 두고 쓸 것.
  {
    key: 'BuyerContact',
    label: '담당자 이름',
    example: '김담당',
    description: '아는 경우에만 들어갑니다. 모르면 "담당자" 로 대체됩니다',
    group: 'recipient',
    fromLead: (l) => l.BuyerContact || '담당자',
  },
  {
    key: 'Title',
    label: '담당자 직함',
    example: '과장',
    description: '아는 경우에만 (예: 과장, 팀장). 모르면 빈칸으로 들어갑니다',
    group: 'recipient',
    fromLead: (l) => l.Title || '',
  },
  {
    key: 'Email',
    label: '받는 메일 주소',
    example: 'contact@amc.seoul.kr',
    description: '이 업체로 보낼 주소. 실제 받는사람 주소로도 쓰입니다',
    group: 'recipient',
    fromLead: (l) => l.Email || '',
  },
  {
    key: 'Phone',
    label: '업체 전화번호',
    example: '02-3010-3114',
    description: '크롤링이 가져온 대표 전화 (있는 경우)',
    group: 'recipient',
    fromLead: (l) => l.Phone || '',
  },
  // 발송자 정보(내 이름·직함·전화·회사)는 본문 변수로 넣지 않는다.
  // 발송할 때 고른 메일 계정의 "서명 블록"이 본문 끝에 자동으로 붙는다
  // (appendAccountSignature=true 가 기본).
];

/**
 * Lead 객체 → 변수 dict.
 * 발송자 정보(SenderName, SenderCompany 등)는 env 나 별도 옵션에서.
 */
export function buildVarsFromLead(
  lead: Partial<ILead>,
  extras?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of TEMPLATE_VARS) {
    out[v.key] = v.fromLead(lead);
  }
  // 발송자 정보는 서명 블록으로 자동 처리되므로 여기서 안 넣음.
  // extras 는 유지 (기존 커스텀 변수 넣을 여지)
  Object.assign(out, extras || {});
  return out;
}

/**
 * 예시 변수 (템플릿 미리보기 - 리드 미지정 시).
 */
export function buildExampleVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of TEMPLATE_VARS) {
    out[v.key] = v.example;
  }
  return out;
}

/**
 * 발송자 서명 블록 (HTML/텍스트) — 선택한 메일 계정 정보로 자동 생성.
 * template.appendAccountSignature=true 일 때 본문 끝에 붙여서 발송.
 * 사용자는 본문에 발송자 정보를 쓸 필요 없음.
 */
export interface SenderProfile {
  fromName?: string;
  fromAddress?: string;
  senderTitle?: string;
  senderPhone?: string;
  senderCompany?: string;
  senderAddress?: string;
  senderWebsite?: string;
}

/**
 * 발송자 서명 블록 · Yogi Corporation 스타일
 *   [담당자 이름]
 *   [직함]
 *
 *   [회사명]
 *   A: [주소]
 *   M: [전화번호]
 *      [웹사이트]
 */
export function buildSignatureBlock(
  sender: SenderProfile,
  opts: { html: boolean } = { html: true },
): string {
  const name    = (sender.fromName || '').trim();
  const title   = (sender.senderTitle || '').trim();
  const company = (sender.senderCompany || '').trim();
  const email   = (sender.fromAddress || '').trim();
  const phone   = (sender.senderPhone || '').trim();
  const address = (sender.senderAddress || '').trim();
  const website = (sender.senderWebsite || '').trim();
  if (!name && !title && !company && !email && !phone && !address && !website) return '';

  const normalizeUrl = (u: string) => /^https?:\/\//i.test(u) ? u : `http://${u}`;

  // ── 서명 모양 (대표님이 쓰는 서명 그대로 · 2026-09-14) ──
  //   David I Daejin Park, CEO
  //
  //   Yogi Corporation Inc.
  //
  //   A: 201, 125, Bongeunsa-ro, Gangnam-gu, Seoul, Korea
  //
  //   M: +82 10 1234 5678
  //
  //   www.yogico.kr
  // 이름과 직함은 한 줄에 쉼표로 붙이고, 줄마다 한 줄씩 띄운다.
  const headline = [name, title].filter(Boolean).join(', ');
  const rows: Array<{ text: string; html: string }> = [];
  if (headline) rows.push({ text: headline, html: `<span style="font-weight:600">${escapeHtml(headline)}</span>` });
  if (company) rows.push({ text: company, html: escapeHtml(company) });
  if (address) rows.push({ text: `A: ${address}`, html: `A: ${escapeHtml(address)}` });
  if (phone) rows.push({ text: `M: ${phone}`, html: `M: ${escapeHtml(phone)}` });
  if (email && !address && !phone && !website) {
    rows.push({ text: `E: ${email}`, html: `E: <a href="mailto:${escapeHtml(email)}" style="color:#2563eb;text-decoration:none">${escapeHtml(email)}</a>` });
  }
  if (website) rows.push({ text: website, html: `<a href="${escapeHtml(normalizeUrl(website))}" style="color:#2563eb;text-decoration:none">${escapeHtml(website)}</a>` });

  if (opts.html) {
    return `
<div style="margin-top:24px;font-family:inherit;font-size:13px;line-height:1.5;color:#111827">
  ${rows.map((r) => `<div style="margin:0 0 12px">${r.html}</div>`).join('\n  ')}
</div>`.trim();
  }
  // plain text — 줄마다 빈 줄 하나
  return '\n\n' + rows.map((r) => r.text).join('\n\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
