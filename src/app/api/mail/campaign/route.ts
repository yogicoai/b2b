import { NextResponse } from 'next/server';
import { resolveOutreachAccount } from '@/lib/mail/accounts';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
import { EmailTemplate } from '@/models/EmailTemplate';
import { Lead } from '@/models/Lead';
import { MAX_SEND_COUNT_PER_LEAD } from '@/lib/send-limits';
import { loadTemplateAttachments } from '@/lib/mail/template-attachments';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/mail/campaign — 발송 리스트를 실제 발송 예약으로 펼친다.
 *
 * 왜 한 번에 안 보내는가:
 * 100곳을 한 요청에서 연속 발송하면 SMTP 가 받아주는 속도로 쏟아진다.
 * 수신 서버는 그걸 대량 발송으로 보고, yogico.kr 도메인 평판이 깎인다.
 * 같은 도메인으로 실거래 메일도 나가기 때문에 그쪽까지 스팸함으로 간다.
 * 그래서 몇 개씩 · 몇 분 간격으로 끊어서 예약으로 깔아 둔다.
 *
 * 자동 재발송은 여기서 미리 만들지 않는다. 답장이 오면 보낼 필요가 없어지고,
 * 미리 깔아 둔 예약을 나중에 지우는 것보다 "보낸 뒤에 답이 없으면 그때 만드는"
 * 편이 어긋날 여지가 없다 (lib/mail/follow-up.ts).
 *
 * Body: {
 *   leadIds: string[], templateId: string, mailAccountId?: string,
 *   startAt?: string(ISO),      // 없으면 지금부터
 *   batchSize?: number,         // 한 묶음에 몇 곳 (기본 30)
 *   intervalMinutes?: number,   // 묶음 사이 간격 (기본 10)
 *   followUp?: boolean,         // 답 없으면 자동 재발송
 *   followUpDays?: number,      // 며칠 뒤 (기본 7)
 * }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];
  const templateId: string = String(body.templateId || '');
  if (!leadIds.length) return NextResponse.json({ success: false, error: 'leadIds 필수' }, { status: 400 });
  if (!templateId) return NextResponse.json({ success: false, error: 'templateId 필수' }, { status: 400 });

  const batchSize = Math.max(1, Math.min(200, Number(body.batchSize) || 100));
  const intervalMinutes = Math.max(1, Math.min(1440, Number(body.intervalMinutes) || 10));
  const followUp = body.followUp === true;
  const followUpDays = Math.max(1, Math.min(60, Number(body.followUpDays) || 7));

  let startAt = body.startAt ? new Date(body.startAt) : new Date();
  if (isNaN(startAt.getTime())) startAt = new Date();
  // 과거 시각으로 깔면 크론이 한 번에 전부 집어간다 — 나눠 보내는 의미가 없어진다
  if (startAt.getTime() < Date.now()) startAt = new Date();

  try {
    await dbConnect();

    const tpl = await EmailTemplate.findById(templateId).lean();
    if (!tpl) return NextResponse.json({ success: false, error: '메일 양식을 찾을 수 없습니다' }, { status: 400 });
    // 첨부 주소가 깨져 있으면 예약을 깔기 전에 알린다 — 발송 시각에 줄줄이 실패로 떨어지는 것보다 낫다
    const att = await loadTemplateAttachments((tpl as any).attachments);
    if (!att.ok) return NextResponse.json({ success: false, error: att.error }, { status: 400 });

    const leads: any[] = await Lead.find(
      { leadId: { $in: leadIds }, deleted: { $ne: true } },
      { leadId: 1, Email: 1, Company: 1, stage: 1, emailHistory: 1 },
    ).lean();

    // 이미 예약이 걸린 곳은 건너뛴다 — 같은 곳에 두 번 깔리면 이틀 연속 나간다
    const already = await EmailSchedule.find(
      { leadId: { $in: leadIds }, status: 'pending' }, { leadId: 1 },
    ).lean();
    const pendingSet = new Set(already.map((a: any) => a.leadId));

    const targets: any[] = [];
    const skipped: Array<{ leadId: string; reason: string }> = [];
    for (const l of leads) {
      const email = String(l.Email || '').trim();
      if (!email || /^Not found/i.test(email) || !email.includes('@')) {
        skipped.push({ leadId: l.leadId, reason: '메일 주소 없음' }); continue;
      }
      if (pendingSet.has(l.leadId)) {
        skipped.push({ leadId: l.leadId, reason: '이미 예약됨' }); continue;
      }
      const sentCount = (l.emailHistory || []).filter((h: any) => h?.status === 'sent').length;
      if (sentCount >= MAX_SEND_COUNT_PER_LEAD) {
        skipped.push({ leadId: l.leadId, reason: `발송 한도 ${MAX_SEND_COUNT_PER_LEAD}회 소진` }); continue;
      }
      targets.push({ ...l, email, attemptNo: sentCount + 1 });
    }

    if (!targets.length) {
      return NextResponse.json({
        success: false, error: '보낼 수 있는 곳이 없습니다', skipped,
      }, { status: 400 });
    }

    // 고른 계정(없으면 대표 계정)으로 예약을 깐다. 그 계정이 없으면 예약을 만들지 않는다.
    // user 를 넘겨 자기 계정만 — 예약 실행은 id 만 믿으므로 남의 계정 id 는 여기서 막는다.
    const { account: outreach, error: accError } = await resolveOutreachAccount(body.mailAccountId, user);
    if (!outreach) {
      return NextResponse.json({ success: false, error: accError }, { status: 400 });
    }

    const batchId = `camp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const docs = targets.map((t, i) => {
      const slot = Math.floor(i / batchSize);          // 몇 번째 묶음인가
      const when = new Date(startAt.getTime() + slot * intervalMinutes * 60_000);
      return {
        leadId: t.leadId,
        templateId,
        mailAccountId: String(outreach._id),
        to: t.email,
        scheduledFor: when,
        status: 'pending' as const,
        attempts: 0,
        attemptNo: t.attemptNo,
        followUp,
        followUpDays,
        batchId,
        createdBy: user,
      };
    });

    await EmailSchedule.insertMany(docs);

    const slots = Math.ceil(targets.length / batchSize);
    const lastAt = new Date(startAt.getTime() + (slots - 1) * intervalMinutes * 60_000);

    return NextResponse.json({
      success: true,
      batchId,
      scheduled: docs.length,
      skipped,
      batches: slots,
      batchSize,
      intervalMinutes,
      startAt: startAt.toISOString(),
      lastAt: lastAt.toISOString(),
      followUp,
      followUpDays,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '예약 생성 실패' }, { status: 500 });
  }
}
