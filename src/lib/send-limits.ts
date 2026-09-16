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
export function checkSendGuard(input: SendGuardInput): { ok: boolean; reason?: string; sentCount: number } {
  const now = input.now || new Date();
  const sentCount = countSentHistory(input.emailHistory);
  if (sentCount >= MAX_SEND_COUNT_PER_LEAD) {
    return { ok: false, reason: `발송 횟수 초과 (${sentCount}/${MAX_SEND_COUNT_PER_LEAD})`, sentCount };
  }
  if (input.lastEmailSentAt) {
    const last = new Date(input.lastEmailSentAt);
    if (!isNaN(last.getTime())) {
      const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
      if (hoursSince < MIN_INTERVAL_HOURS) {
        const remain = Math.ceil(MIN_INTERVAL_HOURS - hoursSince);
        return { ok: false, reason: `최근 발송 후 ${MIN_INTERVAL_HOURS}시간 안 지남 (${remain}h 남음)`, sentCount };
      }
    }
  }
  return { ok: true, sentCount };
}
