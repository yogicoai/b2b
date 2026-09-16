/**
 * 마스터 계정 — 한 곳에서 정한다.
 *
 * 왜 파일을 따로 두는가:
 * 마스터 판정이 네 군데에 각자 적혀 있었다(auth/me, users, users/[username]).
 * 전부 `username === (process.env.ADMIN_ID || 'yogico')` 라 **한 명만** 마스터가
 * 될 수 있었고, ADMIN_ID 가 'admin' 이라 yogico 로 로그인하면 마스터가 아니었다.
 * 한 곳만 고치고 고쳤다고 착각하기 쉬운 모양이라 여기로 모은다.
 *
 * ── 왜 여러 명이어야 하는가 ──
 * 실제로 admin 과 yogico 둘 다 대표가 쓰는 계정이다. 그런데 메일 계정
 * (MailAccount)은 owner 로 묶여 있어서, admin 이 등록한 발송 계정이
 * yogico 로 로그인하면 하나도 안 보였다 — "보내는 계정" 칸이 통째로 비어
 * 메일을 못 보내는 상태가 된다.
 *
 * ── 설정 ──
 * ADMIN_IDS 에 쉼표로 여러 개를 적는다.  예) ADMIN_IDS=admin,yogico
 * 없으면 ADMIN_ID 한 개를 쓰고, 그것도 없으면 아래 기본값을 쓴다.
 */
const DEFAULT_MASTERS = ['admin', 'yogico'];

function parse(v?: string | null): string[] {
  return String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function masterIds(): string[] {
  const many = parse(process.env.ADMIN_IDS);
  if (many.length) return many;
  const one = parse(process.env.ADMIN_ID);
  if (one.length) {
    // ADMIN_ID 하나만 쓰던 설정에서 올라온 경우.
    // 기본 마스터를 같이 인정한다 — 안 그러면 예전 설정 그대로 배포된 서버에서
    // 한쪽 계정이 또 빈 화면을 보게 된다.
    return [...new Set([...one, ...DEFAULT_MASTERS])];
  }
  return DEFAULT_MASTERS;
}

export function isMasterUser(username?: string | null): boolean {
  if (!username) return false;
  return masterIds().includes(String(username).trim().toLowerCase());
}
