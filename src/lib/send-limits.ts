/**
 * 리드 · 단체 메일 과도 발송 방지 정책 (전역 상수).
 * 서버 (mail/send · schedule) 에서 검증 · 클라이언트 (배지) 에서 표시.
 */
export const MAX_SEND_COUNT_PER_LEAD = 3;    // 리드당 최대 발송 횟수 (1차 + 팔로우업 2회)
export const MIN_INTERVAL_HOURS = 48;         // 마지막 발송 후 재발송 최소 간격 (48시간)

/**
 * Lead.emailHistory 배열에서 실제 발송된 (status='sent') 건수만 계산.
 */
export function countSentHistory(emailHistory?: Array<{ status?: string }>): number {
  if (!Array.isArray(emailHistory)) return 0;
  return emailHistory.filter((h) => h?.status === 'sent').length;
}

/**
 * 지금 발송 가능한지 검증.
 * 반환: { ok:boolean, reason?:string }
 */
export interface SendGuardInput {
  emailHistory?: Array<{ status?: string; sentAt?: string }>;
  lastEmailSentAt?: string;
  now?: Date;
}
/** 실제로 나간 메일 중 가장 늦은 시각 (status==='sent' 만) */
export function lastSuccessfulSendAt(
  emailHistory?: Array<{ status?: string; sentAt?: string }>,
): Date | null {
  let best = 0;
  for (const h of emailHistory || []) {
    if (h?.status !== 'sent' || !h?.sentAt) continue;
    const t = new Date(h.sentAt).getTime();
    if (!Number.isNaN(t) && t > best) best = t;
  }
  return best ? new Date(best) : null;
}

export function checkSendGuard(input: SendGuardInput): { ok: boolean; reason?: string; sentCount: number } {
  const now = input.now || new Date();
  const sentCount = countSentHistory(input.emailHistory);
  if (sentCount >= MAX_SEND_COUNT_PER_LEAD) {
    return { ok: false, reason: `발송 횟수 초과 (${sentCount}/${MAX_SEND_COUNT_PER_LEAD})`, sentCount };
  }

  // ── 48시간 간격은 **실제로 나간 메일** 기준이다 ──────────────────
  //
  // 예전에는 Lead.lastEmailSentAt 만 봤다. 그런데 그 값은 발송이 실패한
  // 건에도, mktCl 에서 이관해 온 건에도 찍혀 있다. 그래서 **한 번도 메일을
  // 받은 적이 없는 업체**가 48시간 동안 재시도조차 못 했다.
  //
  // 실측(2026-09-17): 9/16 이카운트 발신 차단으로 실패한 222곳이 전부 이 상태였다.
  // emailHistory 는 failed 뿐, stage 는 queued, 보낸메일함에도 흔적이 없는데
  // "최근 발송 후 48시간 안 지남" 으로 막혀 있었다. 가드의 목적은 같은 곳에
  // 두 번 보내지 않는 것인데, 보낸 적이 없으면 막을 이유가 없다.
  if (sentCount === 0) return { ok: true, sentCount };

  const last = lastSuccessfulSendAt(input.emailHistory)
    || (input.lastEmailSentAt ? new Date(input.lastEmailSentAt) : null);
  if (last) {
    {
      const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
      if (hoursSince < MIN_INTERVAL_HOURS) {
        const remain = Math.ceil(MIN_INTERVAL_HOURS - hoursSince);
        return { ok: false, reason: `최근 발송 후 ${MIN_INTERVAL_HOURS}시간 안 지남 (${remain}h 남음)`, sentCount };
      }
    }
  }
  return { ok: true, sentCount };
}
