/**
 * 요기보 국내 B2B 타깃 5개 카테고리.
 *
 * 해외판(vercelData)에는 이 개념이 없었다. 거기서는 리드를 "국가"로 갈랐고,
 * 어느 나라든 파는 물건과 소구점이 같았기 때문이다. 국내는 반대다 —
 * 나라는 하나뿐이고, 대신 "어디에 놓을 빈백인가"에 따라 제안 내용이 통째로 달라진다.
 * 병원 대기실에 보낼 메일과 호텔 로비에 보낼 메일은 같은 메일이 될 수 없다.
 * 그래서 카테고리가 해외판의 국가 자리를 대신하는 1차 축이 된다.
 *
 * pitch 는 두 곳에서 쓴다 — AI 검증이 "이 업체가 이 소구점에 맞나"를 판단할 때,
 * 그리고 메일 양식의 기본값을 만들 때.
 */

export interface Category {
  key: CategoryKey;
  label: string;
  /** 이 타깃에 요기보를 제안할 때의 핵심 소구점 */
  pitch: string;
  /** 크롤링 시드 키워드 — 화면에서 추가·수정하면 DB(keywords) 값이 우선한다 */
  keywords: string[];
  /** 이 카테고리에서 "규모 있는 곳"으로 볼 신호 (AI 검증 힌트) */
  scaleHints: string[];
}

export const CATEGORY_KEYS = ['public', 'company', 'medical', 'resort', 'sports'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORIES: Category[] = [
  {
    key: 'public',
    label: '학교·공공기관·복지시설',
    pitch: '휴게공간·도서관·상담실·복지시설 라운지에 안전하고 편안한 좌석. 내구성·유지관리·조달 납품.',
    keywords: ['도서관 휴게공간', '학교 라운지', '복지관', '평생학습관', '청소년수련관'],
    scaleHints: ['시립', '도립', '국립', '교육청', '대학교', '지자체', '재단'],
  },
  {
    key: 'company',
    label: '기업',
    pitch: '오피스 휴게실·라운지·수유실·리프레시존 조성. 임직원 복지, 브랜드 협업 커스텀 빈백.',
    keywords: ['기업 휴게실', '오피스 라운지', '사옥 리프레시존', '스타트업 오피스'],
    scaleHints: ['본사', '사옥', '연구소', '그룹', '주식회사', '캠퍼스'],
  },
  {
    key: 'medical',
    label: '병·의원',
    pitch: '대기실·소아 진료실·요양시설 라운지 편의. 위생 관리 가능한 커버, 낙상 완화.',
    keywords: ['소아과', '요양병원', '병원 대기실', '재활병원', '한방병원'],
    scaleHints: ['의료원', '대학병원', '종합병원', '재단', '네트워크'],
  },
  {
    key: 'resort',
    label: '리조트·호텔',
    pitch: '로비·키즈존·풀사이드·객실 라운지 연출. 포토존·브랜드 감성, 실내외 커버 옵션.',
    keywords: ['리조트', '호텔 키즈존', '풀빌라', '펜션', '글램핑'],
    scaleHints: ['리조트', '호텔', '체인', '워터파크', '컨벤션', '객실'],
  },
  {
    key: 'sports',
    label: '스포츠시설·단체',
    pitch: '선수 라운지·회복공간·관람 라운지·클라이밍짐 매트존. 충격 완화, 대형 사이즈.',
    keywords: ['클라이밍짐', '스포츠센터', '체육관', '실내스포츠', '프로구단'],
    scaleHints: ['구단', '협회', '연맹', '국민체육', '시설공단', '경기장'],
  },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function getCategory(key: string | undefined | null): Category | undefined {
  return key ? BY_KEY.get(key as CategoryKey) : undefined;
}

export function categoryLabel(key: string | undefined | null): string {
  return getCategory(key)?.label ?? '미분류';
}

export function isCategoryKey(v: unknown): v is CategoryKey {
  return typeof v === 'string' && (CATEGORY_KEYS as readonly string[]).includes(v);
}
