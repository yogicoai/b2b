/**
 * 메일 주소 목록 정리 — 회신의 참조(cc)와 AI 초안(lib/agent/drafts.ts)이 같이 쓴다.
 *
 * 문자열("a@x.com, b@y.com")이든 배열이든 받아 쉼표로 이은 문자열로 돌려준다.
 * "이름 <주소>" 는 주소만 남긴다. 형식이 틀린 주소가 하나라도 있으면 **통째로 거절한다** —
 * 하나를 조용히 빼고 보내면 사람이 그 빠진 것을 눈치채지 못한다.
 */
const EMAIL_RX = /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/;

export function parseAddressList(v: unknown, { max = 20, field = '주소' }: { max?: number; field?: string } = {}): string {
  const list = (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/))
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .map((x) => {
      const m = /<([^>]+)>/.exec(x);
      return (m ? m[1] : x).trim().toLowerCase();
    });
  const bad = list.filter((x) => !EMAIL_RX.test(x));
  if (bad.length) throw Object.assign(new Error(`${field} 형식이 아닙니다: ${bad.slice(0, 3).join(', ')}`), { status: 400 });
  if (list.length > max) throw Object.assign(new Error(`${field}는 ${max}개까지 넣을 수 있습니다.`), { status: 400 });
  return Array.from(new Set(list)).join(', ');
}
