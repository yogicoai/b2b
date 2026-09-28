import { EmailSchedule } from '@/models/EmailSchedule';
import { Lead } from '@/models/Lead';
import { EmailTemplate } from '@/models/EmailTemplate';
import { MailAccount } from '@/models/MailAccount';
import { InboundMail } from '@/models/InboundMail';
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
 *   · 답장이 왔다            → 리드가 replied/negotiating/partner 로 올라가 있거나
 *                            사람이 쓴 것으로 보이는 메일이 붙어 있다
 *                            (자동응답·반송은 답장으로 세지 않는다)
 *   · 발송 한도를 다 썼다     → 3회
 *   · 아직 기다릴 때가 아니다  → 마지막 발송 후 followUpDays 가 안 지났다
 *   · 이미 다음 예약이 있다    → 같은 곳에 두 번 깔리면 연달아 나간다
 *
 * ⚠️ 근거는 **리드의 발송 이력(Lead.emailHistory)** 이다. 예약 기록이 아니다.
 *    예전에는 EmailSchedule 에서만 대상을 찾았다. 그런데 [보낼 메일]에서 바로
 *    보내면 예약 문서가 아예 안 생긴다 — 그런 곳은 팔로우업이 **영영 안 잡혔다.**
 *    9/16 에 직접 발송한 408곳이 12일 동안 2차 없이 방치된 게 그 때문이다.
 *    어떻게 나갔든 '보냈다' 는 사실은 emailHistory 에 남으므로 거기서 찾는다.
 */

/** 예약 기록이 없는(직접 발송) 곳에 쓸 기본 간격 */
const DEFAULT_FOLLOW_UP_DAYS = 7;

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

  // 한 번이라도 **실제로 나간** 곳 — 예약으로 갔든 직접 보냈든
  const leads: any[] = await Lead.find(
    { deleted: { $ne: true }, 'emailHistory.status': 'sent' },
    { leadId: 1, Email: 1, stage: 1, category: 1, emailHistory: 1, lastEmailSentAt: 1 },
  ).lean();
  if (!leads.length) return { created: 0, skipped, checked: 0 };

  const leadIds = leads.map((l) => l.leadId);
  const leadMap = new Map<string, any>(leads.map((l) => [l.leadId, l]));

  // 예약으로 나간 적이 있으면 그때 쓰던 계정·양식·간격을 이어 쓴다
  const prior: any[] = await EmailSchedule.find(
    { leadId: { $in: leadIds } },
    { leadId: 1, templateId: 1, mailAccountId: 1, createdBy: 1, followUpDays: 1, createdAt: 1 },
  ).sort({ createdAt: 1 }).lean();
  const priorMap = new Map<string, any>();
  for (const p of prior) priorMap.set(p.leadId, p);   // 정렬이 오름차순이라 마지막이 남는다

  // 직접 발송분에는 이어 쓸 계정이 없다 — 대표 발송 계정으로 보낸다
  const fallbackAcc: any = await MailAccount.findOne({ isActive: { $ne: false } })
    .sort({ isDefault: -1, createdAt: 1 }).lean();
  // 양식도 이력에 안 남아 있으면 분류에 맞는 것으로 (분류마다 문구가 다르다)
  const tpls: any[] = await EmailTemplate.find({}, { category: 1 }).lean();
  const tplForCategory = (cat: string) => tpls.find((t) => t.category === cat);

  /** 이 리드의 '다음 차례' 근거 — 마지막으로 실제 나간 메일 */
  const latest = new Map<string, any>();
  for (const l of leads) {
    const sent = (l.emailHistory || [])
      .filter((h: any) => h?.status === 'sent' && h?.sentAt)
      .sort((a: any, b: any) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    if (!sent.length) continue;
    const p = priorMap.get(l.leadId);
    const tpl = sent[0].templateId || p?.templateId || tplForCategory(l.category)?._id;
    if (!tpl) { skipped.push({ leadId: l.leadId, reason: '쓸 양식이 없음' }); continue; }
    latest.set(l.leadId, {
      sentAt: sent[0].sentAt,
      templateId: String(tpl),
      mailAccountId: p?.mailAccountId || (fallbackAcc ? String(fallbackAcc._id) : ''),
      createdBy: p?.createdBy || fallbackAcc?.owner || '',
      followUpDays: Number(p?.followUpDays) || DEFAULT_FOLLOW_UP_DAYS,
    });
  }
  if (!latest.size) return { created: 0, skipped, checked: 0 };

  // 이미 다음 예약이 걸린 곳은 건너뛴다
  const pending: any[] = await EmailSchedule.find(
    // processing(지금 나가는 중)도 센다 — 같은 곳에 다음 메일이 겹쳐 잡히지 않게
    { leadId: { $in: leadIds }, status: { $in: ['pending', 'processing'] } }, { leadId: 1 },
  ).lean();
  const pendingSet = new Set(pending.map((p) => p.leadId));

  /**
   * 사람이 쓴 것으로 보이는 답장이 붙은 곳.
   *
   * 예전에는 inboundCount > 0 이면 답장이 온 것으로 봤다. 그런데 그 수에는
   * 자동응답·반송이 들어간다 — 한국비엠에스제약은 athena@bms.com 이 우리 제목을
   * 그대로 되돌려 보낸 자동응답 1통 때문에 12일 동안 2차가 **영영 안 잡혔다.**
   * 화면([발송 완료] 의 '자동응답만') 과 같은 기준으로 센다.
   *
   * unknown 은 답장 쪽에 남긴다 — 사람이 쓴 것일 수 있으니, 애매하면 안 보내는
   * 편이 안전하다. 광고 메일이 대화 중인 곳에 한 번 더 나가는 게 더 큰 사고다.
   */
  const replyMails: any[] = await InboundMail.find(
    { leadId: { $in: leadIds }, classification: { $nin: ['system', 'ad', 'newsletter'] } },
    { leadId: 1 },
  ).lean();
  const realReply = new Set<string>(replyMails.map((m) => String(m.leadId)));

  const toInsert: any[] = [];
  for (const [leadId, last] of latest) {
    const lead = leadMap.get(leadId);
    if (!lead) { skipped.push({ leadId, reason: '리드 없음' }); continue; }

    // 답장이 왔다 — 여기서 멈춘다. 이게 팔로우업의 가장 중요한 정지 조건이다.
    if (CONVERSATION_STAGES.includes(lead.stage || '') || realReply.has(leadId)) {
      skipped.push({ leadId, reason: '답장 옴' }); continue;
    }
    if (pendingSet.has(leadId)) { skipped.push({ leadId, reason: '다음 예약 이미 있음' }); continue; }

    const sentCount = (lead.emailHistory || []).filter((h: any) => h?.status === 'sent').length;
    if (sentCount >= MAX_SEND_COUNT_PER_LEAD) {
      skipped.push({ leadId, reason: `발송 한도 ${MAX_SEND_COUNT_PER_LEAD}회 소진` }); continue;
    }

    const days = Math.max(1, Number(last.followUpDays) || DEFAULT_FOLLOW_UP_DAYS);
    const lastSentAt = new Date(last.sentAt);
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
