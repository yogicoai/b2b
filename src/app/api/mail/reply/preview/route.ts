import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getMailScope, UNAUTHORIZED } from '@/lib/mail/scope';
import { composeReply } from '@/lib/mail/compose-reply';

export const runtime = 'nodejs';

/**
 * POST /api/mail/reply/preview — 답장을 **보내기 전에 받는 사람이 볼 모습 그대로** 돌려준다.
 *
 * 보내는 사람·받는 사람·제목·본문·서명을 실제 발송(POST /api/mail/reply)과 **같은 함수**로 조립한다
 * (lib/mail/compose-reply.ts). 따로 만들면 미리보기와 실제로 나간 메일이 어긋날 수 있다.
 *
 * ⚠ 이 파일은 메일 발송 모듈(lib/mailer)을 **불러오지 않는다**. 어떤 값을 넣어도 여기서는 메일이 나갈 수 없다.
 *    DB 에도 쓰지 않는다 — 미리보기를 눌렀다고 [답변 완료]로 바뀌거나 이력이 남으면 안 된다.
 *
 * Body: /api/mail/reply 와 같다.
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
    const r = composed.reply;

    return NextResponse.json({
      success: true,
      preview: {
        from: r.from,
        to: r.to,
        subject: r.subject,
        html: r.html,
        text: r.text,
        threaded: r.threaded,
        signatureAppended: r.signatureAppended,
        // 원래 메일 — "어느 메일에 대한 답장인지" 를 미리보기 위에 한 줄로 보여준다
        inReplyTo: { subject: r.mail.subject || '', from: r.mail.from?.address || '', date: r.mail.date || null },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '미리보기를 만들지 못했습니다' }, { status: 500 });
  }
}
