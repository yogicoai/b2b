import { NextResponse } from 'next/server';
import { resolveOutreachAccount } from '@/lib/mail/accounts';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
import { readHeartbeat } from '@/lib/schedule-claim';
import { EmailTemplate } from '@/models/EmailTemplate';
import { loadTemplateAttachments } from '@/lib/mail/template-attachments';
import { Lead } from '@/models/Lead';
import { MailAccount } from '@/models/MailAccount';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET  /api/mail/schedule                 → 예약 큐 목록
 * POST /api/mail/schedule                 → 새 예약 등록
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { searchParams } = new URL(req.url);
  // 기본은 '대기 + 보내는 중'. processing 은 몇 초짜리라 따로 부르면 목록에서 깜빡 사라진다.
  const status = searchParams.get('status') || 'pending,processing';
  const limit = Math.min(500, parseInt(searchParams.get('limit') || '100', 10));

  await dbConnect();
  const filter: any = { createdBy: user };
  if (status !== 'all') filter.status = status.includes(',') ? { $in: status.split(',') } : status;

  const items = await EmailSchedule.find(filter).sort({ scheduledFor: 1 }).limit(limit).lean();

  const leadIds = [...new Set(items.map((i: any) => i.leadId))];
  const leads = await Lead.find({ leadId: { $in: leadIds } }, { leadId: 1, Company: 1, Region: 1, Email: 1 }).lean();
  const leadMap = new Map<string, any>();
  for (const l of leads as any[]) leadMap.set(l.leadId, l);

  return NextResponse.json({
    success: true,
    items: items.map((i: any) => ({
      _id: String(i._id),
      leadId: i.leadId,
      to: i.to,
      scheduledFor: i.scheduledFor,
      status: i.status,
      attempts: i.attempts,
      lastError: i.lastError,
      batchId: i.batchId,
      templateId: i.templateId,
      sentAt: i.sentAt,
      createdAt: i.createdAt,
      canceledReason: i.canceledReason || '',
      lead: leadMap.get(i.leadId) || null,
    })),
    // 예약 발송기 심장 박동 — 외부 크론이 조용히 멈추면 화면이 경고한다
    cron: await readHeartbeat(),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];
  const templateId: string = body.templateId || '';
  const scheduledForStr: string = body.scheduledFor || '';
  const mailAccountId: string = body.mailAccountId || '';

  if (leadIds.length === 0) return NextResponse.json({ success: false, error: 'leadIds 필수' }, { status: 400 });
  if (!templateId) return NextResponse.json({ success: false, error: 'templateId 필수' }, { status: 400 });
  if (!scheduledForStr) return NextResponse.json({ success: false, error: 'scheduledFor 필수' }, { status: 400 });

  const scheduledFor = new Date(scheduledForStr);
  if (isNaN(scheduledFor.getTime())) return NextResponse.json({ success: false, error: 'scheduledFor 파싱 실패' }, { status: 400 });
  if (scheduledFor.getTime() < Date.now() - 60 * 1000) {
    return NextResponse.json({ success: false, error: '과거 시각으로 예약할 수 없습니다' }, { status: 400 });
  }

  await dbConnect();

  const tpl = await EmailTemplate.findById(templateId).lean();
  if (!tpl) return NextResponse.json({ success: false, error: '템플릿을 찾을 수 없음' }, { status: 404 });
  // 첨부 주소가 깨져 있으면 예약 전에 알린다 (발송 시각에 실패로 떨어지기 전에)
  const att = await loadTemplateAttachments((tpl as any).attachments);
  if (!att.ok) return NextResponse.json({ success: false, error: att.error }, { status: 400 });

  // 고른 계정(없으면 대표 계정)을 예약에 적어 둔다 — 발송 시각에 그 계정으로 나간다.
  // 예약 실행(schedule-runner)은 id 만 믿고 보내므로, 여기서 자기 계정인지 반드시 걸러야 한다.
  const { account: outreach, error: accError } = await resolveOutreachAccount(mailAccountId, user);
  if (!outreach) return NextResponse.json({ success: false, error: accError }, { status: 400 });

  const leads = await Lead.find({ leadId: { $in: leadIds } }, { leadId: 1, Email: 1 }).lean();
  const validLeads = (leads as any[]).filter((l) => {
    const e = (l.Email || '').trim();
    return e && !/^Not found/i.test(e) && /@/.test(e);
  });
  if (validLeads.length === 0) {
    return NextResponse.json({ success: false, error: '이메일이 유효한 리드가 없습니다' }, { status: 400 });
  }

  // 이미 예약이 걸려 있거나 지금 나가는 중인 곳은 빼고 건다.
  //
  // [보낼 메일] 캠페인과 팔로우업은 이 확인을 하는데 여기(메일 쓰기 → 예약)만
  // 안 했다. 그래서 한 업체에 예약이 둘 쌓일 수 있었다 — 9/18 에 실패한 10곳을
  // 마케터가 다시 예약해서 리드마다 두 개씩 쌓인 게 그 모양이다. 둘이면 하나 나간
  // 뒤 48시간이 지나 **같은 광고가 한 번 더** 나간다.
  const busy = await EmailSchedule.find(
    { leadId: { $in: validLeads.map((l) => l.leadId) }, status: { $in: ['pending', 'processing'] } },
    { leadId: 1 },
  ).lean();
  const busySet = new Set((busy as any[]).map((b) => b.leadId));
  const skipped = validLeads.filter((l) => busySet.has(l.leadId)).map((l) => l.leadId);
  const toSchedule = validLeads.filter((l) => !busySet.has(l.leadId));
  if (toSchedule.length === 0) {
    return NextResponse.json({
      success: false,
      error: `고른 ${validLeads.length}곳 모두 이미 예약이 걸려 있습니다 — [예약 발송] 에서 확인하세요`,
      skipped,
    }, { status: 409 });
  }

  const batchId = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const docs = toSchedule.map((l) => ({
    leadId: l.leadId,
    templateId,
    mailAccountId: String(outreach._id),
    to: (l.Email as string).trim(),
    scheduledFor,
    status: 'pending' as const,
    attempts: 0,
    lastError: '',
    batchId,
    createdBy: user,
  }));

  const created = await EmailSchedule.insertMany(docs);

  return NextResponse.json({
    success: true,
    scheduled: created.length,
    skipped: leadIds.length - created.length,
    // 그중 '이미 예약이 걸려 있어서' 뺀 곳 (나머지는 메일 주소가 없는 곳)
    alreadyScheduled: skipped.length,
    batchId,
    scheduledFor: scheduledFor.toISOString(),
  });
}
