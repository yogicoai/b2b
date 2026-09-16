/**
 * 발송 우선순위 점수.
 *
 * "어디부터 보낼까"를 정하는 기준이다. 등급(A/B/C)으로 나누지 않는다 —
 * 나누는 순간 "B는 봐야 하나"가 생기고, 어차피 전부 보낼 것이기 때문이다.
 * 순서만 정하고, 왜 그 순서인지 근거를 함께 돌려준다.
 *
 * 점수를 매기는 축은 세 가지다.
 *   1. 거래 규모   — 성사됐을 때 얼마나 큰가 (유통사 한 곳 = 리테일 여러 곳)
 *   2. 담당자 도달 — 그 주소가 구매 담당 책상까지 가는가
 *   3. K-뷰티 실적 — 이미 한국 제품을 팔아본 곳인가
 *
 * ⚠️ Confidence 는 일부러 뺐다. 실측해 보니 Brand/Manufacturer 101건 중 97건이
 *    High, Online Store 163건은 전부 Medium 이었다. 분류를 다르게 적은 것일 뿐
 *    독립된 신호가 아니라서, 넣으면 같은 사실을 두 번 세게 된다.
 */

export interface RecoResult {
  score: number;          // 0~100
  reasons: string[];      // 화면에 그대로 보여줄 근거
}

/** 1. 거래 규모 — 성사 시 매출 크기와 채널 파급력 */
const CATEGORY_SCORE: Record<string, [number, string]> = {
  'Distributor':        [30, '유통사 — 한 곳 뚫리면 여러 채널로 퍼짐'],
  'Retail Chain':       [25, '리테일 체인 — 매장 수만큼 물량'],
  'Brand/Manufacturer': [20, '브랜드·제조사 — 역방향 제안(그쪽 제품을 아시아로)도 가능'],
  'Retailer':           [15, '매장·편집숍'],
  'Online Store':       [12, '온라인몰'],
  'Clinic':             [8,  '클리닉 — 물량은 작음'],
};

/**
 * 2. 담당자 도달 — 주소 앞부분으로 어느 책상에 떨어지는지 가늠한다.
 * 고객지원(support/help) 주소가 제일 나쁘다. 제안 메일이 문의 티켓에 묻힌다.
 */
const PREFIX_SCORE: Array<[RegExp, number, string]> = [
  [/^(b2b|wholesale|purchas|buying|buyer|procure|vendor|supplier|partner|bd|business)/i,
    25, 'B2B·구매 담당 주소 — 제안이 바로 닿음'],
  [/^(sales|commercial|export|import|trade|marketing)/i,
    18, '영업·수출입 담당 주소'],
  [/^(office|kontakt|contact|hello|hola|bonjour|ciao|mail|inquiry|enquir)/i,
    10, '대표 문의 주소'],
  [/^(info|admin)/i, 8, '일반 대표 주소'],
  [/^(support|help|customer|service|care|shop|eshop|order|webshop)/i,
    3, '고객지원 주소 — 제안 메일이 묻히기 쉬움'],
];

/** 한국 브랜드를 이미 취급 중인지 — 카테고리 이해도가 곧 회신율이다 */
const KR_BRAND = /cosrx|beauty of joseon|anua|medicube|skin1004|torriden|round lab|laneige|innisfree|tirtir|numbuz|axis-?y|biodance|dr\.?\s*althea|purito|isntree|tocobo|mixsoon|beauty ?of ?joseon|k-?beauty|korean/i;

const brandCount = (s?: string): number =>
  String(s || '').split(/[,;·]/).map((x) => x.trim()).filter((x) => x.length > 1).length;

export function recoScore(lead: any): RecoResult {
  const reasons: string[] = [];
  let score = 0;

  // ── 1. 거래 규모 ──
  const [catPts, catWhy] = CATEGORY_SCORE[lead?.Category] || [10, ''];
  score += catPts;
  if (catWhy) reasons.push(catWhy);

  // ── 2. 담당자 도달 ──
  const prefix = String(lead?.Email || '').split('@')[0] || '';
  for (const [rx, pts, why] of PREFIX_SCORE) {
    if (rx.test(prefix)) { score += pts; reasons.push(why); break; }
  }

  // ── 3. K-뷰티 실적 ──
  const haystack = `${lead?.BrandsChannels || ''} ${lead?.Evidence || ''}`;
  if (KR_BRAND.test(haystack)) {
    score += 15;
    reasons.push('한국 브랜드를 이미 취급 — 카테고리 설명이 필요 없음');
  } else {
    reasons.push('한국 브랜드 미취급 — 신규 개척 대상');
  }

  const bc = brandCount(lead?.BrandsChannels);
  if (bc >= 11)     { score += 10; reasons.push(`취급 브랜드 ${bc}개 — 편집 역량 있음`); }
  else if (bc >= 6) { score += 7;  reasons.push(`취급 브랜드 ${bc}개`); }
  else if (bc >= 3) { score += 4;  reasons.push(`취급 브랜드 ${bc}개`); }

  // ── 4. 확인 가능성 — 근거가 얇으면 헛물켤 확률이 올라간다 ──
  const evLen = String(lead?.Evidence || '').length;
  if (evLen >= 200)      { score += 8; }
  else if (evLen >= 100) { score += 4; }
  else if (evLen < 40)   { reasons.push('근거가 얇음 — 사이트 확인 권장'); }

  if (String(lead?.Phone || '').trim()) score += 4;

  // 위 배점 합계 상한(30+25+15+10+8+4 = 92)을 100 으로 환산
  return { score: Math.min(100, Math.round((score / 92) * 100)), reasons };
}

/**
 * 목록 전체를 추천순으로 정렬.
 * 점수가 같으면 지역로 묶는다 — 같은 나라를 연달아 보면 판단 기준이 덜 흔들린다.
 */
export function sortByReco<T extends Record<string, any>>(leads: T[]): Array<T & RecoResult> {
  return leads
    .map((l) => ({ ...l, ...recoScore(l) }))
    .sort((a, b) => b.score - a.score
      || String(a.Region || '').localeCompare(String(b.Region || ''))
      || String(a.Company || '').localeCompare(String(b.Company || '')));
}
