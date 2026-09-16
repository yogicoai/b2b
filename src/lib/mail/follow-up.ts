import { EmailSchedule } from '@/models/EmailSchedule';
import { Lead } from '@/models/Lead';
import { MAX_SEND_COUNT_PER_LEAD, MIN_INTERVAL_HOURS } from '@/lib/send-limits';
import { CONVERSATION_STAGES as SHARED_CONVERSATION_STAGES } from '@/lib/stages';

/**
 * 자동 재발송(팔로우업) — 보냈는데 답이 없는 곳에 다시 보낸다.
 *
 * 왜 미리 깔아두지 않는가:
 * 첫 발송과 동시에 2차·3차 예약까지 만들어 두면, 답장이 온 뒤에 그 예약들을
 * 찾아 지워야 한다. 하나라도 놓치면 이미 대화가 시작된 곳에 광고 메일이
 * 다시 나간다. 그래서 "보낸 뒤에 답이 없으면 그때 만든다".
 *
 * 멈추는 조건 (하나라도 걸리면 안 만든다)
 *   · 답장이 왔다            → 리드가 replied/negotiating/partner 로 올라가 있다
 *   · 발송 한도를 다 썼다     → 3회
 *   · 아직 기다릴 때가 아니다  → 마지막 발송 후 followUpDays 가 안 지났다
 *   · 이미 다음 예약이 있다    → 같은 곳에 두 번 깔리면 연달아 나간다
 */

/** 팔로우업 대상이 아닌 단계 — 이미 대화가 시작된 곳 (lib/stages.ts 공용) */
const CONVERSATION_STAGES: string[] = SHARED_CONVERSATION_STAGES;

export interface FollowUpResult {
  created: number;
  skipped: Array<{ leadId: string; reason: string }>;
  checked: number;
}

/**
 * 지금 시점에 만들어야 할 팔로우업 예약을 만든다.
 * 크론에서 하루 한 번 부르면 된다.
 */
export async function createDueFollowUps(now = new Date()): Promise<FollowUpResult> {
  const skipped: FollowUpResult['skipped'] = [];
  let created = 0;

  // 팔로우업을 켜고 실제로 나간 예약들 — 이게 "다음 차례"의 근거다
  const sentWithFollowUp: any[] = await EmailSchedule.find({
    status: 'sent',
    followUp: true,
  }).sort({ sentAt: 1 }).lean();

  // 리드별로 가장 최근에 나간 것만 본다
  const latest = new Map<string, any>();
  for (const s of sentWithFollowUp) {
    const prev = latest.get(s.leadId);
    const t = new Date(s.sentAt || s.scheduledFor).getTime();
    if (!prev || t > new Date(prev.sentAt || prev.scheduledFor).getTime()) latest.set(s.leadId, s);
  }
  if (!latest.size) return { created: 0, skipped, checked: 0 };

  const leadIds = [...latest.keys()];
  const leads: any[] = await Lead.find(
    { leadId: { $in: leadIds }, deleted: { $ne: true } },
    { leadId: 1, Email: 1, stage: 1, emailHistory: 1, lastEmailSentAt: 1, inboundCount: 1 },
  ).lean();
  const leadMap = new Map<string, any>(leads.map((l) => [l.leadId, l]));

  // 이미 다음 예약이 걸린 곳은 건너뛴다
  const pending: any[] = await EmailSchedule.find(
    { leadId: { $in: leadIds }, status: 'pending' }, { leadId: 1 },
  ).lean();
  const pendingSet = new Set(pending.map((p) => p.leadId));

  const toInsert: any[] = [];
  for (const [leadId, last] of latest) {
    const lead = leadMap.get(leadId);
    if (!lead) { skipped.push({ leadId, reason: '리드 없음' }); continue; }

    // 답장이 왔다 — 여기서 멈춘다. 이게 팔로우업의 가장 중요한 정지 조건이다.
    if (CONVERSATION_STAGES.includes(lead.stage || '') || (lead.inboundCount || 0) > 0) {
      skipped.push({ leadId, reason: '답장 옴' }); continue;
    }
    if (pendingSet.has(leadId)) { skipped.push({ leadId, reason: '다음 예약 이미 있음' }); continue; }

    const sentCount = (lead.emailHistory || []).filter((h: any) => h?.status === 'sent').length;
    if (sentCount >= MAX_SEND_COUNT_PER_LEAD) {
      skipped.push({ leadId, reason: `발송 한도 ${MAX_SEND_COUNT_PER_LEAD}회 소진` }); continue;
    }

    const days = Math.max(1, Number(last.followUpDays) || 7);
    const lastSentAt = new Date(last.sentAt || last.scheduledFor);
    const dueAt = new Date(lastSentAt.getTime() + days * 86_400_000);
    if (dueAt.getTime() > now.getTime()) {
      skipped.push({ leadId, reason: `아직 ${days}일 안 됨` }); continue;
    }
    // 48시간 최소 간격도 함께 지킨다 (send-limits 와 같은 기준)
    const hoursSince = (now.getTime() - lastSentAt.getTime()) / 3_600_000;
    if (hoursSince < MIN_INTERVAL_HOURS) {
      skipped.push({ leadId, reason: `최근 발송 후 ${MIN_INTERVAL_HOURS}시간 안 지남` }); continue;
    }

    const email = String(lead.Email || '').trim();
    if (!email || !email.includes('@') || /^Not found/i.test(email)) {
      skipped.push({ leadId, reason: '메일 주소 없음' }); continue;
    }

    toInsert.push({
      leadId,
      templateId: last.templateId,
      mailAccountId: last.mailAccountId || '',
      to: email,
      scheduledFor: now,
      status: 'pending',
      attempts: 0,
      attemptNo: sentCount + 1,
      followUp: true,                 // 3회를 다 쓸 때까지 이어진다
      followUpDays: days,
      batchId: `followup-${now.toISOString().slice(0, 10)}`,
      createdBy: last.createdBy || 'system',
    });
    created++;
  }

  if (toInsert.length) await EmailSchedule.insertMany(toInsert);
  return { created, skipped, checked: latest.size };
}
