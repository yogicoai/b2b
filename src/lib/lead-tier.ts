/**
 * 검증완료 리드 tier 등급 (A/B/C).
 *
 * A: 연락 가능(이메일+사이트) + **규모 신호가 뚜렷한 곳** — 최우선 컨택
 * B: 연락 가능하지만 규모 신호가 없는 일반 타깃
 * C: 연락 수단이 부실한 곳 (이메일이 없거나 사이트가 없음)
 *
 * 해외판에서는 A 를 가르는 기준이 '대형 리테일러 체인인가'였다. 국내 B2B 는 파는
 * 방식이 달라서 기준도 다르다 — 한 번에 수십 개가 들어가는 곳, 즉 지점·시설이
 * 여럿이거나 기관 단위로 움직이는 곳이 A 다. 상호에 법인격·기관명이 드러나는
 * 경우가 많아서 상호와 도메인 문자열만으로도 1차 신호는 잡힌다.
 */

// 대형 리테일러 · 체인 · 유통사 키워드 (회사명 / 도메인 매칭 · 소문자 substring)
/**
 * 규모 신호 — 상호·도메인에 이 말이 들어 있으면 기관/체인 단위로 움직일 가능성이 높다.
 * 정확한 판정은 AI 검증(verify-ai.ts)이 하고, 여기는 값싼 1차 신호일 뿐이다.
 */
export const SCALE_SIGNALS: string[] = [
  // 공공·교육
  '시청', '군청', '구청', '도청', '교육청', '교육지원청', '시설공단', '공사', '공단',
  '국립', '시립', '도립', '군립', '공립', '대학교', '대학', '캠퍼스', '평생학습',
  '복지관', '문화재단', '진흥원', '연구원', '연구소', '도서관',
  // 의료
  '의료원', '대학병원', '종합병원', '병원재단', '요양병원', '재활병원', '보건소',
  // 기업
  '주식회사', '㈜', '그룹', '본사', '사옥', '연수원', '지주', '홀딩스',
  // 숙박·레저
  '리조트', '호텔', '워터파크', '컨벤션', '관광단지', '체인', '지점', '점포',
  // 스포츠
  '구단', '협회', '연맹', '국민체육', '체육회', '경기장', '아레나', '스타디움',
  // 영문 표기
  'resort', 'hotel', 'group', 'corp', 'inc', 'univ', 'hospital', 'medical',
  'foundation', 'institute', 'center', 'centre',
];

const REAL_EMAIL_RE = /@/;

function hasScaleSignal(company: string, website: string): boolean {
  const c = (company || '').toLowerCase();
  const w = (website || '').toLowerCase();
  return SCALE_SIGNALS.some((kw) => c.includes(kw.toLowerCase()) || w.includes(kw.toLowerCase()));
}

function hasRealEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const e = String(email).trim();
  if (!e) return false;
  if (/^not found/i.test(e)) return false;
  return REAL_EMAIL_RE.test(e);
}

function hasWebsite(url: string | undefined | null): boolean {
  const s = (url || '').toString().trim();
  if (!s) return false;
  // 국내 업체라 .kr/.co.kr 계열이 대부분이고, go.kr·ac.kr·or.kr 은 기관이라는 신호까지 된다.
  return /^https?:\/\/|^www\.|\.(kr|com|net|org|co|io|me)($|\/)/i.test(s);
}

export type LeadTier = 'A' | 'B' | 'C';

export interface LeadTierInput {
  Company?: string;
  Email?: string;
  WebsiteContact?: string;
  /** 크롤링이 따로 모아 둔 주소들 — Email 이 비었어도 여기 있으면 연락은 된다 */
  crawledEmails?: string[];
}

export function getLeadTier(lead: LeadTierInput): LeadTier {
  // 크롤링이 찾아낸 주소도 연락 수단으로 인정한다. 국내 수집분은 대표 Email 칸이
  // 비어 있고 crawledEmails 에만 들어 있는 경우가 흔하다.
  const email = hasRealEmail(lead.Email) || (lead.crawledEmails || []).some(hasRealEmail);
  const site = hasWebsite(lead.WebsiteContact);
  if (!email) return 'C';
  if (!site) return 'C';
  if (hasScaleSignal(lead.Company || '', lead.WebsiteContact || '')) return 'A';
  return 'B';
}
