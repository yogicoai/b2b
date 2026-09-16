import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import { tidyMailText } from '@/lib/mail/text';

export const runtime = 'nodejs';

/**
 * GET /api/mail/history?email=someone@example.com — 이 주소와 오간 메일.
 *
 * /api/mail/thread 와 다르다. 그쪽은 **리드 기준**이라 리드로 등록된 업체만
 * 볼 수 있는데, 메일을 쓰다가 "이 사람과 전에 무슨 얘기를 했더라"가 궁금해지는
 * 상대는 사내 동료이기도 하고 리드가 아닌 거래처이기도 하다.
 * 여기는 **주소 하나**를 놓고 받은 것과 보낸 것을 시간순으로 엮는다.
 *
 * 응답: { contact, mails: [{direction, subject, date, preview, ...}], stats }
 */
export async function GET(req: Request) {
  const scope = await getMailScope();
  if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const email = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!email.includes('@')) {
    return NextResponse.json({ success: false, error: '메일 주소가 필요합니다.' }, { status: 400 });
  }
  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit')) || 12, 40);

  await dbConnect();

  // 받은 것은 from, 보낸 것은 to·cc 에 그 주소가 있다.
  // 한쪽만 보면 "내가 보내기만 하고 답이 없는 상대"나 그 반대가 통째로 빠진다.
  const rows = await InboundMail.find(
    {
      ...mailFilter(scope),
      trashedAt: null,
      $or: [
        { 'from.address': email },
        { 'to.address': email },
        { 'cc.address': email },
      ],
    },
    {
      subject: 1, date: 1, direction: 1, from: 1, to: 1,
      'analysis.summary': 1, 'analysis.needsReply': 1,
      'raw.text': 1, attachments: 1, leadId: 1,
    },
  ).sort({ date: -1 }).limit(limit).lean() as Array<Record<string, any>>;

  // 이 주소가 우리가 아는 업체면 그 이름을 같이 준다
  const lead = await Lead.findOne(
    { $or: [{ Email: email }, { crawledEmails: email }] },
    { leadId: 1, Company: 1, stage: 1 },
  ).lean() as Record<string, any> | null;

  const mails = rows.map((m) => ({
    id: String(m._id),
    direction: m.direction === 'out' ? 'out' : 'in',
    subject: String(m.subject || '(제목 없음)'),
    date: m.date,
    name: String(m?.from?.name || '').trim(),
    // 본문은 목록에 붙일 만큼만. 전체는 메일함에서 연다 —
    // 여기서 다 내려보내면 응답이 수 MB 가 된다.
    preview: tidyMailText(String(m?.raw?.text || ''))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220),
    needsReply: Boolean(m?.analysis?.needsReply),
    summary: String(m?.analysis?.summary || ''),
    hasAttachment: Array.isArray(m.attachments) && m.attachments.length > 0,
    leadId: m.leadId || '',
  }));

  return NextResponse.json({
    success: true,
    contact: { email, company: lead?.Company || '', leadId: lead?.leadId || '', stage: lead?.stage || '' },
    stats: {
      total: mails.length,
      received: mails.filter((m) => m.direction === 'in').length,
      sent: mails.filter((m) => m.direction === 'out').length,
      lastAt: mails[0]?.date || null,
    },
    mails,
  });
}
