/**
 * 아웃바운드(먼저 보내는 메일) 잠금 — 한 곳에서 관리한다.
 *
 * 왜 파일을 따로 두는가:
 * 발송 경로가 흩어져 있어서 한 곳만 막으면 다른 경로로 새어 나간다.
 * 실제로 그런 구멍이 있었다 — send/route.ts 의 스위치는 벌크 발송만 막는데,
 * 예약 발송(schedule-runner.ts)은 그 라우트를 거치지 않고 sendMail 을 직접
 * 부르기 때문에, 예약 시각이 되면 차단과 무관하게 메일이 나갔다.
 *
 * ── 무엇을 막고 무엇을 여는가 ──
 * 막는 것 (아웃바운드 = 우리가 먼저 보내는 것)
 *   · 벌크 발송        /api/mail/send
 *   · 예약 발송        lib/schedule-runner.ts
 *   · 크론 자동 발송   /api/cron/daily-mail
 *
 * 여는 것 (상대가 먼저 보낸 것에 답하는 것 — 스팸이 될 수 없다)
 *   · 받은 메일 답장   /api/mail/reply
 *   · 연결 테스트      /api/mail/test
 *   · 내부 브리핑      /api/mail/briefing  (우리 주소로만 간다)
 *
 * ── 현재 상태: 열림 (2026-09-11 해제) ──
 * 사용자 요청으로 수신자 제한을 풀었다. 이제 검증 완료 업체로 실제 발송이
 * 가능하다. 대신 아래 안전장치는 그대로 남아 있다.
 *
 *   · 하루 상한   DAILY_SEND_CAP (기본 20통)
 *   · 발송 간격   SEND_INTERVAL_MS (기본 8초)
 *   · 같은 곳 재발송  lib/send-limits.ts — 최대 3회, 48시간 간격
 *   · 발송 리스트  사람이 queued 로 옮긴 곳에만 나간다
 *
 * ── 다시 잠그려면 ──
 * 코드를 고치지 않아도 된다. 환경변수 OUTBOUND_LOCKED=1 만 넣고 서버를
 * 다시 띄우면 그 즉시 테스트 주소(fe@yogico.kr) 외에는 전부 막힌다.
 * 급할 때 코드 수정·배포를 기다릴 필요가 없게 하려고 이렇게 뒀다.
 */
export const OUTBOUND_LOCKED = process.env.OUTBOUND_LOCKED === '1';

/** 잠겨 있을 때 화면·로그에 그대로 쓰는 문구 */
export const OUTBOUND_LOCK_MESSAGE =
  '아웃바운드 메일 발송이 잠겨 있습니다 (테스트 중). ' +
  '해제하려면 환경변수 OUTBOUND_LOCKED 를 지우고 서버를 다시 띄우세요.';

/* ═══════════════════════════════════════════════════════════════════
   테스트 수신 허용 목록 — 잠금을 유지한 채 우리 주소로만 실제 발송한다.

   잠금을 통째로 풀면 검증 완료 409곳으로 진짜 메일이 나갈 수 있다.
   발송·수신 흐름을 끝까지 확인하려면 실제로 한 통은 나가야 하는데,
   그 한 통이 실수로 400통이 되는 사고를 막아야 한다.

   그래서 "누구에게 가는가"로 한 번 더 거른다. 이 목록에 있는 주소로만
   실제 발송하고, 나머지는 잠금 그대로 막는다. 목록을 비우면 전면 차단이다.
   ═══════════════════════════════════════════════════════════════════ */
export const TEST_RECIPIENTS: readonly string[] = ['fe@yogico.kr'];

/** 이 주소로는 잠금 중에도 실제 발송한다 (테스트 대상인가) */
export function isTestRecipient(to?: string): boolean {
  if (!to) return false;
  // "이름 <주소>" 형태로 올 수 있어 꺾쇠 안을 우선 본다
  const m = String(to).match(/<([^>]+)>/);
  const addr = (m ? m[1] : String(to)).trim().toLowerCase();
  return TEST_RECIPIENTS.some((t) => t.toLowerCase() === addr);
}

/**
 * 지금 이 주소로 보내도 되는가.
 * 잠금이 풀려 있으면 전부 허용, 잠겨 있으면 테스트 주소만 허용한다.
 */
export function canSendTo(to?: string): boolean {
  if (!OUTBOUND_LOCKED) return true;
  return isTestRecipient(to);
}

/* ═══════════════════════════════════════════════════════════════════
   발송 속도 정책 — 잠금을 풀었을 때 한 번에 쏟아지지 않게 하는 안전장치.

   왜 필요한가:
   현재 발송 루프에는 간격도 상한도 없어서, 409건을 누르면 SMTP 가
   받아주는 속도로 연속 발송된다. 두 가지가 문제다.

   1. 이카운트 SMTP 하루 한도 — 중간에 끊기면 어디까지 나갔는지 뒤엉킨다.
      정확한 수치는 이카운트에 직접 확인해야 한다.
   2. 도메인 평판 — 이쪽이 더 크다. yogico.kr 로 실거래 메일
      (Schestowitz·Blue Marble·오스템파마 등)도 나간다. 콜드메일이
      하루에 터져 스팸 신고가 붙으면 그 실거래 메일까지 스팸함으로 간다.
      발굴한 리드를 잃는 것보다 진행 중인 거래를 잃는 쪽이 훨씬 크다.

   테스트 발송은 fe@yogico.kr(isTestSender)로 분리했지만 도메인이 같아
   완전히 분리되지는 않는다. 수신 서버는 도메인 단위로도 평판을 본다.

   ── 워밍업 ──
   발송 이력이 적은 주소일수록 낮게 시작해 서서히 올려야 한다.
   1일차 10~20 → 2~3일차 30~50 → 이후 50~80 정도가 무난하다.
   ═══════════════════════════════════════════════════════════════════ */

/** 하루에 내보낼 수 있는 최대 통수 (아웃바운드만 · 답장은 제외).
 *  기본 300 — 대표님 결정(2026-09-14): 100곳씩 나눠 예약하고 하루 300통까지.
 *  Vercel 환경변수 DAILY_SEND_CAP 을 넣으면 그 값이 우선한다 (낮추고 싶을 때 재배포만 하면 된다). */
export const DAILY_SEND_CAP = Number(process.env.DAILY_SEND_CAP) || 300;

/** 한 통과 다음 통 사이 최소 간격(ms). 한꺼번에 쏟아붓지 않게 한다. */
export const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS) || 8000;

/** 한 번의 요청에서 처리할 최대 통수 — 서버리스 타임아웃(60s)에 걸리지 않게 */
export const MAX_PER_REQUEST = Math.max(
  1,
  Math.min(DAILY_SEND_CAP, Math.floor(55_000 / SEND_INTERVAL_MS)),
);
