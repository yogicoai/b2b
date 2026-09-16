import { Lead } from '@/models/Lead';

/**
 * [💬 답장 받음] 업체에 **우리가 다시 답장을 보내면** [🤝 대화 진행 중] 으로 옮긴다.
 * (대표님 요청 2026-09-14 — "답장 받은 업체한테 다시 답변을 보냈을 때 기준으로 대화 진행 중")
 *
 * 부르는 곳 두 군데:
 *   - CRM 에서 회신했을 때 (api/mail/reply)
 *   - 웹메일·아웃룩·휴대폰에서 답한 것을 보낸메일함에서 찾아냈을 때 (lib/mail/reconcile.ts)
 *
 * 지금 단계가 'replied' 일 때만 옮긴다 — 이미 대화 중·파트너인 곳을 뒤로 되돌리거나,
 * 아직 답장이 오지 않은 곳(발송 완료)을 건너뛰어 올리지 않는다.
 */
export async function moveRepliedToNegotiating(leadId?: string | null): Promise<boolean> {
  if (!leadId) return false;
  const now = new Date().toISOString();
  const r = await Lead.updateOne(
    { leadId, stage: 'replied', deleted: { $ne: true } },
    { $set: { stage: 'negotiating', stageChangedAt: now, updatedInfoAt: now } },
  );
  return r.modifiedCount > 0;
}
