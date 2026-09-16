/**
 * 네이버 검색 API 어댑터 — 업체 발굴.
 * 지역검색(local)이 주력이고, 웹검색(webkr)은 홈페이지 링크를 넓힐 때 보조로 쓴다.
 * https://developers.naver.com/docs/serviceapi/search/local/local.md
 *
 * 지역검색은 한 번에 5건까지만 준다(display 최대 5, 페이징 없음). 그래서 수집량은
 * "키워드 × 지역" 조합 수로 벌어야 한다 — 키워드를 늘리지 않으면 아무리 돌려도
 * 같은 업체만 다시 나온다.
 */

export interface NaverPlace {
  companyName: string;
  url: string;
  naverCategory: string;
  tel: string;
  address: string;
  source: 'naver_local' | 'naver_web';
  description?: string;
}

/**
 * 자격증명은 **부를 때** 읽는다.
 * 모듈 최상단에서 한 번 잡아 두면, 모듈이 .env 로딩보다 먼저 평가되는 실행 경로
 * (스크립트·워커)에서 조용히 빈 값이 박힌 채로 굳는다.
 */
function creds() {
  return {
    id: process.env.NAVER_CLIENT_ID || '',
    secret: process.env.NAVER_CLIENT_SECRET || '',
  };
}

function stripTags(s: string | undefined): string {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

export function naverHasCreds(): boolean {
  const { id, secret } = creds();
  return Boolean(id && secret);
}

async function naverGet(path: string, params: Record<string, string | number>) {
  if (!naverHasCreds()) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정 — .env.local 을 확인하세요.');
  }
  const url = new URL(`https://openapi.naver.com/v1/search/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const { id, secret } = creds();
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': id,
      'X-Naver-Client-Secret': secret,
      Accept: 'application/json',
    },
    // 검색 결과를 캐시하면 안 된다 — 같은 키워드를 다시 돌리는 이유가
    // "그 사이 새로 생긴 곳을 줍는 것"이기 때문이다.
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`네이버 API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** 지역 검색 — 업체명·주소·전화·홈페이지. 한 번에 최대 5건. */
export async function searchLocal(query: string): Promise<NaverPlace[]> {
  const data = await naverGet('local.json', { query, display: 5, sort: 'random' });
  return (data.items || []).map((it: Record<string, string>) => ({
    companyName: stripTags(it.title),
    url: it.link || '',
    naverCategory: stripTags(it.category),
    tel: it.telephone || '',
    address: stripTags(it.roadAddress || it.address),
    source: 'naver_local' as const,
  }));
}

/** 웹 검색 — 지역검색에 안 잡히는 기관·기업 홈페이지를 줍는 보조 경로. */
export async function searchWeb(query: string, display = 20): Promise<NaverPlace[]> {
  const data = await naverGet('webkr.json', { query, display });
  return (data.items || []).map((it: Record<string, string>) => ({
    companyName: stripTags(it.title),
    url: it.link || '',
    naverCategory: '',
    tel: '',
    address: '',
    description: stripTags(it.description),
    source: 'naver_web' as const,
  }));
}
