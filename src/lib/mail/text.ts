/**
 * 받은 메일 본문을 화면에 보여주기 좋게 다듬는다.
 *
 * ── 왜 필요한가 ──
 * 요즘 메일은 대부분 표(table)로 짠 HTML 이다. 우리는 안전 때문에 HTML 을
 * 그대로 그리지 않고 **텍스트 버전**을 보여주는데, 표를 텍스트로 풀면
 * 칸마다 공백 한 칸짜리 줄이 생긴다. 실제 메일(이용약관 위반 안내)을 재 보면
 *
 *     "이용약관 위반 안내 \n\n \n \n\n \n\n \n\n \n \n\n …"
 *
 * 처럼 본문이 시작하기도 전에 빈 줄이 스무 개 넘게 이어지고, 문장 한 줄마다
 * 빈 줄이 하나씩 끼어 있다. 화면에서는 "이미지가 빠진 건가?" 싶은 빈칸으로 보인다.
 * 이미지가 날아간 것이 아니라 표의 뼈대가 빈 줄로 남은 것이다.
 *
 * ── 표에서 온 글인지 어떻게 아나 ──
 * 사람이 직접 쓴 메일의 빈 줄은 **정말 비어 있다** ("").
 * 표를 풀어낸 글의 빈 줄은 **공백이 한 칸 들어 있다** (" ").
 * 공백만 있는 줄이 여러 개이고 전체 줄의 상당 부분이면 표에서 온 글로 본다.
 *
 * ── 무엇을 하나 ──
 *   공통
 *     · 줄 끝 공백 제거, 공백만 있는 줄은 빈 줄로
 *     · 줄 앞 공백은 **한 칸일 때만** 제거 — 사람이 넣은 들여쓰기(두 칸 이상)는 둔다
 *     · 앞뒤 빈 줄 제거
 *   사람이 쓴 글
 *     · 빈 줄이 여러 개 이어지면 하나로 (문단 구분은 그대로)
 *   표에서 온 글
 *     · 빈 줄 **하나**는 표 칸 사이였을 뿐이라 없앤다 → 문장이 붙어서 읽힌다
 *     · 빈 줄 **둘 이상**은 실제 구역 구분이라 빈 줄 하나로 남긴다
 *
 * 저장된 원문은 건드리지 않는다. 화면에 내보낼 때만 다듬는다.
 */
const INVISIBLE = /[​‌‍﻿]/g;

export function tidyMailText(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(INVISIBLE, '')
    .split('\n');

  // 표에서 온 글인가 — 공백만 든(비어 있지 않은) 줄의 비율
  const spaceOnly = raw.filter((l) => l.length > 0 && !l.trim()).length;
  const tableLike = spaceOnly >= 5 && spaceOnly / raw.length >= 0.2;

  const lines = raw.map((line) => {
    const right = line.replace(/[ \t]+$/g, '');
    if (!right.trim()) return '';
    return /^ [^ \t]/.test(right) ? right.slice(1) : right;
  });

  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line === '') { blankRun++; continue; }
    if (out.length && blankRun > 0) {
      // 표에서 온 글은 빈 줄 하나를 칸 구분으로 보고 버린다
      const keepBlank = tableLike ? blankRun >= 2 : true;
      if (keepBlank) out.push('');
    }
    out.push(line);
    blankRun = 0;
  }
  return out.join('\n');
}
