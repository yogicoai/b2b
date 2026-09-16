import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { resolveOutreachAccount } from '@/lib/mail/accounts';
import { MailAccount } from '@/models/MailAccount';
import { Lead } from '@/models/Lead';
import { sendMail } from '@/lib/mailer';
import { buildSignatureBlock } from '@/lib/template-vars';
import { decryptSecret } from '@/lib/crypto';
import { findUnsubscribed } from '@/models/Unsubscribe';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/mail/compose — 손으로 쓴 메일을 그대로 보낸다 (이카운트 SMTP).
 *
 * [📨 발송 관리]와 다른 길이다. 그쪽은 양식을 골라 여러 곳에 나눠 보내는
 * 영업 발송이고, 여기는 **아는 상대에게 한 통 쓰는** 곳이다 — 거래처 회신,
 * 자료 전달, 일정 조율 같은 것.
 *
 * 그래서 기본은 광고가 아니다(ad:false). 정보통신망법의 (광고) 표기·수신거부는
 * "우리가 먼저 보내는 광고성 정보"에 붙는 것이고, 주고받던 상대에게 답하는
 * 메일에까지 붙이면 오히려 이상하다. 다만 이 창으로 콜드메일을 쓸 수도 있으니
 * ad:true 를 넘기면 그때는 전부 붙는다.
 *
 * Body: {
 *   to: string | string[],    // 받는 사람 (쉼표로 여러 명도 가능)
 *   subject: string,
 *   body: string,             // HTML
 *   mailAccountId?: string,   // 안 주면 대표 계정
 *   ad?: boolean,             // true 면 광고성으로 보고 법규 항목을 붙인다
 *   appendSignature?: boolean // 기본 true
 * }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* 아래 검증에서 걸린다 */ }

  const recipients = (Array.isArray(body.to) ? body.to : String(body.to || '').split(','))
    .map((t: string) => String(t).trim().toLowerCase())
    .filter((t: string) => t.includes('@'));

  const subject = String(body.subject || '').trim();
  const html = String(body.body || '').trim();

  if (!recipients.length) {
    return NextResponse.json({ success: false, error: '받는 사람을 넣어 주세요.' }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ success: false, error: '제목을 넣어 주세요.' }, { status: 400 });
  }
  if (!html) {
    return NextResponse.json({ success: false, error: '내용을 넣어 주세요.' }, { status: 400 });
  }
  if (recipients.length > 20) {
    // 여기는 한 통 쓰는 곳이다. 대량은 [발송 관리]가 나눠 보낸다 —
    // 그쪽에는 발송 간격과 하루 상한이 있고 여기에는 없다.
    return NextResponse.json({
      success: false,
      error: '한 번에 20명까지입니다. 그 이상은 [📨 발송 관리]에서 나눠 보내세요.',
    }, { status: 400 });
  }

  await dbConnect();

  // 수신거부한 주소로는 어떤 경우에도 나가지 않는다.
  // 광고가 아니어도 마찬가지다 — 그 사람은 우리 메일을 안 받겠다고 했다.
  const blocked = await findUnsubscribed(recipients);
  const targets = recipients.filter((t: string) => !blocked.has(t));
  if (!targets.length) {
    return NextResponse.json({
      success: false,
      error: '받는 사람이 모두 수신거부한 주소입니다.',
    }, { status: 400 });
  }

  // 보내는 계정 — 안 고르면 대표 계정. 로그인한 아이디 몫 안에서만 찾는다.
  const { account: acc, error: accError } = await resolveOutreachAccount(body.mailAccountId, user);
  if (!acc) return NextResponse.json({ success: false, error: accError }, { status: 400 });

  let smtpConfig;
  try {
    smtpConfig = {
      host: acc.smtpHost,
      port: acc.smtpPort,
      secure: acc.smtpSecure,
      user: acc.smtpUser,
      pass: decryptSecret(acc.smtpPassEnc),
    };
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `계정 복호화 실패: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const profile = await MailAccount.findById(acc._id).lean() as Record<string, any> | null;
  const appendSignature = body.appendSignature !== false;
  const sigHtml = profile && appendSignature ? buildSignatureBlock(profile, { html: true }) : '';
  const sigText = profile && appendSignature ? buildSignatureBlock(profile, { html: false }) : '';

  const htmlPayload =
    `<div style="font-family:Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;` +
    `font-size:15px;line-height:1.7;color:#111827">${html}${sigHtml}</div>`;
  const textPayload = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') + sigText;

  const results: Array<{ to: string; ok: boolean; error?: string; messageId?: string }> = [];
  let sent = 0;

  for (const to of targets) {
    const r = await sendMail({
      to,
      subject,
      html: htmlPayload,
      text: textPayload,
      smtpConfig,
      fromOverride: { name: acc.fromName || acc.smtpUser, address: acc.fromAddress },
      // 보낸메일함에 사본을 남긴다 — 웹메일·아웃룩에서도 보여야 한다
      sentCopyAccount: profile,
      ad: body.ad === true,
    });
    if (r.ok) sent++;
    results.push({ to, ok: r.ok, error: r.error, messageId: r.messageId });
  }

  // 리드로 등록된 상대에게 보냈으면 그 회사 이력에도 남긴다.
  // 안 남기면 "이 회사에 뭘 보냈더라"를 발송 관리에서 찾을 수 없다.
  const now = new Date().toISOString();
  for (const r of results) {
    if (!r.ok) continue;
    await Lead.updateOne(
      { Email: r.to },
      {
        $push: {
          emailHistory: {
            subject,
            body: html.replace(/<[^>]+>/g, '').slice(0, 500),
            to: r.to,
            sentAt: now,
            status: 'sent',
            messageId: r.messageId || '',
          },
        },
        $set: { lastEmailSentAt: now },
      },
    );
  }

  return NextResponse.json({
    success: sent > 0,
    sent,
    failed: results.length - sent,
    skipped: recipients.filter((t: string) => blocked.has(t)),
    usedAccount: { user: acc.smtpUser, from: acc.fromAddress },
    results,
  });
}
