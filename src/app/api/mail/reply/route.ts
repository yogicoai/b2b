import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import { sendMail } from '@/lib/mailer';
import { getMailScope, canUseAccount, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';
import { moveRepliedToNegotiating } from '@/lib/mail/stage-on-reply';
import { composeReply, pickReplyAccount } from '@/lib/mail/compose-reply';
import { buildSignatureBlock } from '@/lib/template-vars';
import { decryptSecret } from '@/lib/crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/mail/reply?inboundMailId=… — 이 메일에 답장하면 **끝에 붙을 서명**을 미리 돌려준다.
 *
 * 화면이 들고 있는 계정 목록으로 서명을 그리면, 목록을 아직 안 불러온 화면(답장 받음에서 바로 대화를 연 경우)
 * 에서는 서명이 비어 보였다. 보낼 때와 같은 계정 고르기(lib/mail/compose-reply.ts)를 서버에서 그대로 돌려 결과만 준다.
 * 메일을 보내지 않는다.
 */
export async function GET(req: Request) {
  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const url = new URL(req.url);
    const inboundMailId = String(url.searchParams.get('inboundMailId') || '').trim();
    if (!/^[0-9a-f]{24}$/i.test(inboundMailId)) {
      return NextResponse.json({ success: false, error: 'inboundMailId 필요' }, { status: 400 });
    }
    const mail: any = await InboundMail.findById(inboundMailId, { accountId: 1 }).lean();
    // 남의 메일은 없는 메일과 똑같이 404 — 응답이 다르면 그런 메일이 있다는 게 드러난다
    if (!mail || !canUseAccount(scope, mail.accountId)) return NextResponse.json(NOT_YOURS, { status: 404 });

    const { account, error } = await pickReplyAccount(scope, mail, url.searchParams.get('mailAccountId') || undefined);
    if (!account) return NextResponse.json({ success: false, error }, { status: 400 });

    return NextResponse.json({
      success: true,
      from: { name: account.fromName || '', address: account.fromAddress || account.smtpUser || '' },
      signatureHtml: buildSignatureBlock(account, { html: true }),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서명을 불러오지 못했습니다' }, { status: 500 });
  }
}

/**
 * POST /api/mail/reply — 받은 메일에 스레드로 회신.
 *
 * 새 메일 발송(/api/mail/send)과 다른 점:
 *   - In-Reply-To / References 헤더를 붙여 **상대 메일함에서 같은 대화로 묶인다**.
 *     이게 없으면 상대에게는 뜬금없는 새 메일로 보이고, 우리 쪽에서도
 *     이후 답장이 스레드로 이어지지 않는다.
 *   - 발송 가드(3회 제한)를 적용하지 않는다. 상대가 먼저 보낸 메일에 답하는 것이라
 *     스팸이 될 수 없고, 오히려 막으면 대화가 끊긴다.
 *
 * 메일 조립은 미리보기(POST /api/mail/reply/preview)와 **같은 함수**를 쓴다 (lib/mail/compose-reply.ts).
 *
 * Body: {
 *   inboundMailId: string,   // 어느 메일에 답하는지 (필수)
 *   body: string,            // 본문 (필수)
 *   subject?: string,        // 생략 시 "Re: 원문제목"
 *   mailAccountId?: string,  // 생략 시 기본 계정
 *   appendSignature?: boolean, // 기본 true
 * }
 */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const composed = await composeReply(scope, body);
    if (!composed.ok) return NextResponse.json(composed.payload, { status: composed.status });
    const { mail, account, to, subject, html, text, bodySource, headers, threaded, from } = composed.reply;

    let smtpPass = '';
    try {
      smtpPass = decryptSecret(account.smtpPassEnc);
    } catch {
      return NextResponse.json({ success: false, error: '메일 계정 비밀번호 복호화 실패 — 계정을 다시 저장하세요.' }, { status: 500 });
    }

    const result = await sendMail({
      to,
      subject,
      html,
      text,
      headers,
      smtpConfig: {
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure,
        user: account.smtpUser,
        pass: smtpPass,
      },
      fromOverride: from,
      sentCopyAccount: account,   // 보낸메일함에 사본을 남긴다 (lib/mail/sent-copy.ts)
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error || '발송 실패' }, { status: 500 });
    }

    const now = new Date().toISOString();

    // ── 원본 메일을 '답변완료' 로 ──
    await InboundMail.updateOne(
      { _id: mail._id },
      { $set: { status: 'replied', 'analysis.needsReply': false, repliedAt: now } },
    );

    // ── 리드에 발송 이력 기록 ──
    // 여기 남겨야 대화 타임라인에 우리 회신이 함께 보이고,
    // 다음에 상대가 답장하면 이 messageId 로 다시 매칭된다.
    if (mail.leadId) {
      await Lead.updateOne(
        { leadId: mail.leadId },
        {
          $push: {
            emailHistory: {
              subject,
              body: bodySource.slice(0, 500),
              to,
              sentAt: now,
              status: 'sent',
              messageId: result.messageId || '',
            },
          },
          $set: {
            lastEmailSentAt: now,
            needsReply: false,
          },
        },
      );
      // 답장 받은 업체에 우리가 다시 답했으면 → [대화 진행 중] (대표님 요청 2026-09-14)
      await moveRepliedToNegotiating(mail.leadId);
    }

    return NextResponse.json({
      success: true,
      to,
      subject,
      messageId: result.messageId,
      dryRun: Boolean(result.dryRun),
      threaded,
      leadId: mail.leadId || null,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '회신 실패' }, { status: 500 });
  }
}
