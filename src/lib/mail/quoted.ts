/**
 * 인용부 제거 — 답장이 쌓인 메일에서 "이번에 새로 쓴 부분"만 남긴다.
 *
 * 실무 메일은 Re: 가 20번씩 붙으며 이전 대화가 통째로 따라온다.
 * 이걸 걸러내지 않으면 여러 판정이 한꺼번에 틀어진다.
 *   - 언어 감지: 인용부의 영문 헤더(From:/Sent:/mailto:)가 한글보다 많아 한국어 메일이 영어로 잡힘
 *   - 답변 필요: 몇 달 전 인용문의 물음표까지 세어 과대 판정
 *   - 기한 추출: 이미 지난 인용문의 날짜를 이번 기한으로 오인
 *   - 요약 비용: 같은 내용을 매번 다시 읽어 토큰 낭비
 *
 * (emailData/src/lib/mail/quoted.js 이식)
 */

/** 인용 시작을 알리는 표식들 — 메일 클라이언트·언어별로 형태가 다르다 */
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*Original Message/im,
  /^-{5,}\s*$/m,
  /^_{10,}\s*$/m,
  /^From:\s.+$\n^Sent:\s/im,
  /^보낸\s?사람:\s/im,
  /^보낸사람:\s/im,
  /^差出人:\s/im,               // 일본어
  /^送信日時:\s/im,
  /^Fra:\s.+$\n^Dato:\s/im,     // 덴마크·노르웨이
  /^Von:\s.+$\n^Gesendet:\s/im, // 독일
  /^De:\s.+$\n^Enviado:\s/im,   // 스페인·포르투갈
  /^On .{5,80} wrote:\s*$/im,
  /^\d{4}년 \d{1,2}월 \d{1,2}일.{0,40}작성/im,
];

/**
 * 인용부를 잘라낸 본문을 돌려준다.
 *
 * 두 개의 안전장치가 있다:
 *   1) minIndex — 표지가 이 위치보다 앞이면 무시한다.
 *      전달(FW) 메일은 본문이 헤더로 시작하므로, 거기서 자르면 내용이 통째로 사라진다.
 *   2) minKeep  — 잘라낸 결과가 이 길이 미만이면 원문을 그대로 쓴다.
 *      분석 입력으로 쓸 때 너무 짧으면 판정할 게 없어지기 때문이다.
 *
 * ⚠️ 두 기본값(40/80)은 **분석용** 기준이다. 화면에 본문을 보여줄 때 이 값을 쓰면
 *    "네, 확인했습니다" 같은 짧은 답장에서 인용문이 통째로 남아 읽을 수가 없다.
 *    화면용으로는 forDisplay() 를 쓸 것.
 */
export function stripQuoted(
  text = '',
  { minKeep = 80, minIndex = 40 }: { minKeep?: number; minIndex?: number } = {},
): string {
  const s = String(text);
  if (!s) return '';

  // ⚠️ 가드는 **가장 앞선 표지**에 적용해야 한다.
  //    표지별로 따로 걸러내면, 맨 앞의 표지(전달메일 헤더)를 건너뛴 뒤
  //    그 헤더 안쪽의 다른 표지(From:/Sent:)에서 잘려 본문이 통째로 날아간다.
  let earliest = -1;
  const mark = (idx: number | undefined | null) => {
    if (idx == null || idx < 0) return;
    if (earliest < 0 || idx < earliest) earliest = idx;
  };

  for (const re of QUOTE_MARKERS) mark(s.match(re)?.index);
  // '>' 로 시작하는 줄이 연속으로 나오는 지점도 인용 시작으로 본다
  const gt = s.search(/^>.*\n^>/m);
  if (gt >= 0) mark(gt);

  if (earliest < 0) return s;             // 인용 표지 없음 — 전부 새로 쓴 내용
  if (earliest <= minIndex) return s;     // 맨 앞이 표지 = 전달메일 → 통째로 유지

  const head = s.slice(0, earliest).trim();
  return head.length >= minKeep ? head : s;
}

/**
 * 화면 표시용 인용부 제거 — 새로 쓴 부분만 남긴다.
 *
 * 분석용과 기준이 다르다:
 *   - minIndex 0  : 표지 앞에 **내용이 한 글자라도 있으면** 자른다.
 *                   (표지가 맨 앞 = 전달메일이므로 그때만 통째로 유지)
 *   - minKeep 1   : 답장이 "네, 확인했습니다" 한 줄이어도 그 한 줄만 보여준다.
 *                   원문 전체는 호출부가 따로 들고 있으므로 정보가 사라지지 않는다.
 */
export function stripQuotedForDisplay(text = ''): string {
  return stripQuoted(text, { minKeep: 1, minIndex: 0 });
}

/** 인용부가 실제로 잘렸는지 (통계·디버깅용) */
export function quotedRatio(text = ''): number {
  const full = String(text).length;
  if (!full) return 0;
  return 1 - stripQuoted(text).length / full;
}
