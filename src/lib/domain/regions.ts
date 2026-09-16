/**
 * 전국 17개 시·도 + 권역.
 *
 * 해외판의 REGION_CONTINENTS(국가 → 대륙)가 있던 자리다. 화면에서 리드를
 * 넓은 단위로 묶어 보여줄 때 쓴다 — 17개를 그대로 나열하면 목록이 길어서
 * "우리가 수도권을 얼마나 훑었나" 같은 질문에 답이 안 나온다.
 *
 * 크롤링은 이 목록을 키워드와 곱해서 돈다 (키워드 × 17).
 */

export const REGIONS = [
  '서울', '경기', '인천',
  '강원',
  '대전', '세종', '충북', '충남',
  '광주', '전북', '전남',
  '대구', '경북', '부산', '울산', '경남',
  '제주',
] as const;

export type Region = (typeof REGIONS)[number];

/** 권역 — 화면에서 접어 보여주는 단위 */
export const REGION_ZONES: Record<string, Region[]> = {
  수도권: ['서울', '경기', '인천'],
  강원: ['강원'],
  충청: ['대전', '세종', '충북', '충남'],
  호남: ['광주', '전북', '전남'],
  영남: ['대구', '경북', '부산', '울산', '경남'],
  제주: ['제주'],
};

const ZONE_OF = new Map<string, string>();
for (const [zone, list] of Object.entries(REGION_ZONES)) {
  for (const r of list) ZONE_OF.set(r, zone);
}

/**
 * 주소 문자열에서 시·도를 뽑는다.
 * 네이버 지역검색이 주는 주소는 "서울특별시 강남구 …" / "경기도 성남시 …" 형태라
 * 앞 토큰만 보면 되지만, "전라북도"·"충청남도"처럼 축약형과 표기가 다른 것들이 있어
 * 축약 이름으로 정규화해서 돌려준다.
 */
export function regionFromAddress(address: string | undefined | null): Region | '' {
  const a = String(address || '').trim();
  if (!a) return '';
  const head = a.split(/\s+/)[0] || '';
  const table: Array<[RegExp, Region]> = [
    [/^서울/, '서울'], [/^경기/, '경기'], [/^인천/, '인천'],
    [/^강원/, '강원'],
    [/^대전/, '대전'], [/^세종/, '세종'], [/^충청북|^충북/, '충북'], [/^충청남|^충남/, '충남'],
    [/^광주/, '광주'], [/^전라북|^전북/, '전북'], [/^전라남|^전남/, '전남'],
    [/^대구/, '대구'], [/^경상북|^경북/, '경북'], [/^부산/, '부산'], [/^울산/, '울산'], [/^경상남|^경남/, '경남'],
    [/^제주/, '제주'],
  ];
  for (const [rx, name] of table) if (rx.test(head)) return name;
  return '';
}

export function zoneOf(region: string | undefined | null): string {
  return ZONE_OF.get(String(region || '')) ?? '기타';
}

export function isRegion(v: unknown): v is Region {
  return typeof v === 'string' && (REGIONS as readonly string[]).includes(v);
}
