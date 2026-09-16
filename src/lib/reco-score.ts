/**
 * 발송 우선순위 점수.
 *
 * "어디부터 보낼까"를 정하는 기준이다. 등급(A/B/C)으로 나누지 않는다 —
 * 나누는 순간 "B는 봐야 하나"가 생기고, 어차피 전부 보낼 것이기 때문이다.
 * 순서만 정하고, 왜 그 순서인지 근거를 함께 돌려준다.
 *
 * 점수를 매기는 축은 세 가지다.
 *   1. 납품 규모   — 한 번에 몇 개가 들어갈 곳인가
 *   2. 담당자 도달 — 그 주소가 구매·총무 담당 책상까지 가는가
 *   3. 규모 신호   — 상호·도메인에 기관·체인임이 드러나는가
 *
 * 해외판에서는 1번이 'Distributor / Retail Chain' 같은 바이어 유형이었고
 * 3번이 'K-뷰티를 이미 취급하는가' 였다. 국내는 파는 방식이 달라서 둘 다 바뀌었다 —
 * 우리가 찾는 것은 재판매할 유통사가 아니라, 자기 공간에 빈백을 깔 곳이다.
 */

import { SCALE_SIGNALS } from './lead-tier';

export interface RecoResult {
  score: number;          // 0~100
  reasons: string[];      // 화면에 그대로 보여줄 근거
}

/** 1. 납품 규모 — 그 공간에 한 번에 몇 개가 들어가는가 */
const CATEGORY_SCORE: Record<string, [number, string]> = {
  resort:  [30, '리조트·호텔 — 로비·키즈존·객실까지 한 번에 물량이 큼'],
  public:  [26, '공공·교육 — 조달 납품이고 시설 단위로 움직임'],
  company: [22, '기업 — 사옥·연수원 단위. 복지 예산이 잡혀 있음'],
  medical: [16, '병·의원 — 대기실 중심이라 물량은 중간'],
  sports:  [14, '스포츠시설 — 라운지·회복공간 중심'],
};

/**
 * 2. 담당자 도달 — 주소 앞부분으로 어느 책상에 떨어지는지 가늠한다.
 * 고객지원(support/help) 주소가 제일 나쁘다. 제안 메일이 문의 티켓에 묻힌다.
 */
const PREFIX_SCORE: Array<[RegExp, number, string]> = [
  [/^(gu|purchas|buying|buyer|procure|vendor|supplier|partner|b2b|bd|business|chongmu|ga)/i,
    25, '구매·총무 담당 주소 — 제안이 바로 닿음'],
  [/^(sales|marketing|plan|project|facility|manage)/i,
    18, '영업·기획·시설 담당 주소'],
  [/^(office|kontakt|contact|hello|hola|bonjour|ciao|mail|inquiry|enquir)/i,
    10, '대표 문의 주소'],
  [/^(info|admin)/i, 8, '일반 대표 주소'],
  [/^(support|help|customer|service|care|shop|eshop|order|webshop)/i,
    3, '고객지원 주소 — 제안 메일이 묻히기 쉬움'],
];


export function recoScore(lead: any): RecoResult {
  const reasons: string[] = [];
  let score = 0;

  // ── 1. 납품 규모 ──
  const [catPts, catWhy] = CATEGORY_SCORE[lead?.category] || [10, ''];
  score += catPts;
  if (catWhy) reasons.push(catWhy);

  // ── 2. 담당자 도달 ──
  const prefix = String(lead?.Email || '').split('@')[0] || '';
  for (const [rx, pts, why] of PREFIX_SCORE) {
    if (rx.test(prefix)) { score += pts; reasons.push(why); break; }
  }

  // ── 3. 규모 신호 ── (lib/lead-tier.ts 와 같은 목록을 쓴다 — 두 벌로 갈리면 어긋난다)
  const haystack = `${lead?.Company || ''} ${lead?.WebsiteContact || ''}`.toLowerCase();
  if (SCALE_SIGNALS.some((kw) => haystack.includes(kw.toLowerCase()))) {
    score += 15;
    reasons.push('상호·도메인에 기관·체인 신호 — 한 번에 여러 개가 들어갈 곳');
  } else {
    reasons.push('규모 신호 없음 — 규모는 회신 뒤 확인');
  }

  // 홈페이지가 있으면 우리 쪽에서 미리 확인할 것이 있다는 뜻이고,
  // 상대도 제안 내용을 확인할 창구가 있다는 뜻이다.
  if (String(lead?.WebsiteContact || '').trim()) {
    score += 6;
    reasons.push('홈페이지 있음');
  }

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
