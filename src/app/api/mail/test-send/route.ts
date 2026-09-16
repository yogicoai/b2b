import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { EmailTemplate } from '@/models/EmailTemplate';
import { MailAccount } from '@/models/MailAccount';
import { sendMail, renderTemplate } from '@/lib/mailer';
import { buildVarsFromLead, buildSignatureBlock } from '@/lib/template-vars';
import { decryptSecret } from '@/lib/crypto';
import { resolveOutreachAccount } from '@/lib/mail/accounts';
import { getSessionUser, ownerFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import { loadTemplateAttachments } from '@/lib/mail/template-attachments';
import { OUTBOUND_LOCKED, canSendTo, TEST_RECIPIENTS } from '@/lib/outbound-lock';

export const runtime = 'nodejs';
export const maxDuration = 60;

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

/**
 * POST /api/mail/test-send — 발송관리의 [🧪 테스트 메일 보내기]
 * Body: { to, templateId, previewLeadId?, mailAccountId? }
 *
 * 업체에 보내기 전에 **실제로 나갈 모양 그대로** 내 메일함으로 한 통 보내 본다.
 * 그래서 화면에 적힌 글이 아니라 저장된 양식으로 만든다 — 업체 발송(예약)도 저장된 양식을 쓰기 때문이다.
 * 회사명 치환 · 서명 · 글꼴 · 첨부까지 예약 발송(schedule-runner)과 같게 만들고, 제목 앞에만 [테스트] 를 붙인다.
 *
 * 예약을 거치지 않고 바로 보낸다. 업체의 발송 기록·단계·하루 한도에는 넣지 않는다.
 */
export async function POST(req: Request) {
  // 테스트 메일도 자기 계정으로만 보낸다 (lib/mail/scope.ts)
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const to = String(body?.to || '').trim();
    if (!EMAIL.test(to)) return NextResponse.json({ success: false, error: '받을 메일 주소가 올바르지 않습니다' }, { status: 400 });
    if (!body?.templateId) return NextResponse.json({ success: false, error: '메일 양식을 먼저 고르세요' }, { status: 400 });

    await dbConnect();
    const tpl: any = await EmailTemplate.findById(body.templateId).lean();
    if (!tpl) return NextResponse.json({ success: false, error: '메일 양식을 찾을 수 없습니다' }, { status: 404 });

    const { account: acc, error: accError } = await resolveOutreachAccount(body.mailAccountId, user);
    if (!acc) return NextResponse.json({ success: false, error: accError }, { status: 400 });

    // 발송 잠금 중에는 테스트 주소나 우리 메일 계정 주소로만 보낸다
    if (OUTBOUND_LOCKED && !canSendTo(to)) {
      // 내가 등록(로그인 검증)한 주소로만 — 다른 사람 메일함이나 아무 주소로 새지 않게
      const own = await MailAccount.exists({ ...ownerFilter(user), smtpUser: to.toLowerCase() });
      if (!own) {
        return NextResponse.json({ success: false, error: `발송 잠금 중 — 테스트 메일은 우리 메일 계정이나 ${TEST_RECIPIENTS.join(', ')} 로만 보낼 수 있습니다` }, { status: 423 });
      }
    }

    const lead: any = body.previewLeadId ? await Lead.findOne({ leadId: body.previewLeadId }).lean() : null;
    const vars = lead ? buildVarsFromLead(lead) : { Company: 'Acme Beauty Co.', Region: 'United States', BuyerContact: 'Jane Doe' };

    const subject = `[테스트] ${renderTemplate(tpl.subject || '', vars as any)}`;
    let rendered = renderTemplate(tpl.body || '', vars as any);
    const sig = tpl.appendAccountSignature !== false ? buildSignatureBlock(acc, { html: !!tpl.bodyIsHtml }) : '';
    if (sig) rendered += sig;

    let html: string | undefined;
    let text: string | undefined;
    if (tpl.bodyIsHtml) {
      const bodyHtml = rendered.includes('<') ? rendered : rendered.replace(/\n/g, '<br>');
      html = `<div style="font-family:Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;font-size:15px;line-height:1.65;color:#111827">${bodyHtml}</div>`;
      text = rendered.replace(/<[^>]+>/g, '');
    } else {
      text = rendered;
    }

    const att = await loadTemplateAttachments(tpl.attachments);
    if (!att.ok) return NextResponse.json({ success: false, error: att.error }, { status: 400 });

    const result = await sendMail({
      to,
      subject,
      html,
      text,
      attachments: att.files,
      smtpConfig: { host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpSecure, user: acc.smtpUser, pass: decryptSecret(acc.smtpPassEnc) },
      fromOverride: { name: acc.fromName || acc.smtpUser, address: acc.fromAddress },
      sentCopyAccount: acc,   // 테스트 메일도 보낸메일함에 남겨 "실제로 이렇게 나갔다" 를 볼 수 있게
    });
    if (!result.ok) return NextResponse.json({ success: false, error: `보내지 못했습니다: ${result.error}` }, { status: 502 });

    return NextResponse.json({
      success: true,
      to,
      from: acc.fromAddress || acc.smtpUser,
      subject,
      company: lead?.Company || vars.Company,
      attachments: att.files.length,
      dryRun: !!result.dryRun,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '테스트 메일 발송 실패' }, { status: 500 });
  }
}
