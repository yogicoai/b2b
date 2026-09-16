import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { getMailSettings } from '@/lib/mail-settings';
import { draftReply } from '@/lib/ai/draft-reply';
import { actualCost } from '@/lib/ai/estimate';
import { getMailScope, mailFilter, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';
import { loadMailBody } from '@/lib/mail/body';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/mail/draft — 답장 초안 생성 (유료).
 *
 * 담당자가 한국어로 "무슨 말을 할지" 만 적으면, 상대 언어로 된 초안과
 * 그 한국어 대역본을 함께 돌려준다.
 *
 * **자동 발송하지 않는다.** 초안은 화면의 회신 상자에 채워지고,
 * 사람이 읽고 고친 뒤 [보내기] 를 눌러야 나간다.
 *
 * Body: { inboundMailId: string, intent: string }
 */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  const inboundMailId = String(body?.inboundMailId || '').trim();
  const intent = String(body?.intent || '').trim();
  if (!inboundMailId) return NextResponse.json({ success: false, error: 'inboundMailId 필요' }, { status: 400 });
  if (!intent) return NextResponse.json({ success: false, error: '답장에 담을 내용을 입력하세요.' }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'ANTHROPIC_API_KEY 미설정 — .env.local 에 넣어야 AI 기능이 동작합니다.' },
      { status: 400 },
    );
  }

  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    const settings = await getMailSettings();

    // 남의 계정 메일로는 초안을 만들지 않는다 — 초안 응답에 원문 내용이 녹아 나오고 유료 호출이기도 하다.
    // 범위 조건을 조회에 바로 걸어 없는 메일과 남의 메일이 똑같은 404 가 되게 한다 (있는지 떠보기 방지)
    const mail: any = await InboundMail.findOne({ _id: inboundMailId, ...mailFilter(scope) }).lean();
    if (!mail) return NextResponse.json(NOT_YOURS, { status: 404 });

    // 리드 회사명을 넘겨 초안이 맥락을 갖게 한다
    let leadCompany = '';
    if (mail.leadId) {
      const lead: any = await Lead.findOne({ leadId: mail.leadId }, { Company: 1 }).lean();
      leadCompany = lead?.Company || '';
    }

    // 본문은 DB 에 미리보기만 있다 (lib/mail/ingest.ts) — 초안을 쓰기 전에 메일 서버에서
    // 원문을 받아온다 (lib/mail/body.ts). 상대가 물어본 것이 미리보기 뒤에 있으면
    // 그 질문을 빠뜨린 초안이 나온다.
    const loaded = await loadMailBody(mail);
    const draft = await draftReply(
      {
        ...mail,
        leadCompany,
        raw: { ...(mail.raw || {}), text: loaded.text || mail.raw?.text || '' },
        bodyStripped: loaded.stripped || mail.bodyStripped || '',
      },
      intent,
      settings,
    );

    // 초안을 메일에 남긴다 — 화면을 닫았다 열어도 유지되고, 무엇을 보냈는지 이력이 된다
    await InboundMail.updateOne(
      { _id: mail._id, ...mailFilter(scope) },
      {
        $push: {
          drafts: {
            subject: draft.subject,
            body: draft.body,
            createdAt: draft.createdAt,
            createdBy: 'ai',
          },
        },
      },
    );

    const cost = actualCost(draft.usage, draft.model);

    return NextResponse.json({
      success: true,
      draft: {
        subject: draft.subject,
        body: draft.body,
        bodyKo: draft.bodyKo,
        notes: draft.notes,
        lang: draft.lang,
      },
      model: draft.model,
      krw: cost?.krw || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '초안 생성 실패' }, { status: 500 });
  }
}
