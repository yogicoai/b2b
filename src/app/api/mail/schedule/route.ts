import { NextResponse } from 'next/server';
import { resolveOutreachAccount } from '@/lib/mail/accounts';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
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
  const status = searchParams.get('status') || 'pending';
  const limit = Math.min(500, parseInt(searchParams.get('limit') || '100', 10));

  await dbConnect();
  const filter: any = { createdBy: user };
  if (status !== 'all') filter.status = status;

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
      lead: leadMap.get(i.leadId) || null,
    })),
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

  const batchId = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const docs = validLeads.map((l) => ({
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
    batchId,
    scheduledFor: scheduledFor.toISOString(),
  });
}
