import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { tidyMailText } from '@/lib/mail/text';
import { loadMailBody } from '@/lib/mail/body';
import { getMailScope, mailFilter, canUseAccount, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * GET /api/mail/[id] — 메일 1통 전문.
 *
 * 목록은 본문을 빼고 내려주므로(문서당 평균 71KB) 상세는 여기서 따로 읽는다.
 * 같은 스레드의 다른 메일도 함께 주어 대화 흐름을 볼 수 있게 한다.
 * 로그인한 아이디가 볼 수 있는 계정의 메일만 연다 (lib/mail/scope.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // 남의 계정 메일은 id 를 알아도 못 연다. 범위 조건을 조회에 바로 걸어
    // 없는 메일과 남의 메일이 똑같은 404 가 되게 한다 — 응답이 다르면 그런 메일이 있다는 게 드러난다
    const mail: any = await InboundMail.findOne({ _id: id, ...mailFilter(scope) }).lean();
    if (!mail) {
      return NextResponse.json(NOT_YOURS, { status: 404 });
    }

    // 연결된 리드
    let lead: any = null;
    if (mail.leadId) {
      lead = await Lead.findOne(
        { leadId: mail.leadId },
        { leadId: 1, Company: 1, Region: 1, stage: 1, Email: 1 },
      ).lean();
    }

    // 같은 대화의 다른 메일 (본문 없이 — 목록만)
    // 같은 스레드라도 다른 아이디의 계정으로 오간 메일은 빼야 한다 — 참조로 걸린 남의 메일이 새어 나온다
    const thread: any[] = mail.threadKey
      ? await InboundMail.find(
          { threadKey: mail.threadKey, _id: { $ne: mail._id }, ...mailFilter(scope) },
          { subject: 1, from: 1, date: 1, direction: 1, status: 1 },
        ).sort({ date: 1 }).limit(30).lean()
      : [];

    // ── 본문 ──
    // 본문은 DB 에 미리보기만 있다 (lib/mail/ingest.ts trimRawForStorage).
    // 메일을 여는 이 순간에 메일 서버에서 원문을 받아온다 — 첨부파일과 같은 방식이다.
    // 실패해도 예외를 던지지 않는다(lib/mail/body.ts). 미리보기라도 화면은 열려야 한다.
    const loaded = await loadMailBody(mail);
    const fullText = loaded.text || '';
    // 인용부를 걷어낸 본문 — 서버에서 받아왔으면 그쪽이 전문이고, 아니면 저장된 값을 쓴다
    const stripped = loaded.stripped || mail.bodyStripped || '';

    return NextResponse.json({
      success: true,
      mail: {
        id: String(mail._id),
        messageId: mail.messageId,
        subject: mail.subject,
        from: mail.from,
        to: mail.to || [],
        cc: mail.cc || [],
        date: mail.date,
        receivedAt: mail.receivedAt,
        folder: mail.folder,
        group: mail.group || '',
        groupBy: mail.groupBy || '',
        lang: mail.lang,
        direction: mail.direction,
        classification: mail.classification,
        classifiedBy: mail.classifiedBy,
        status: mail.status,
        memo: mail.memo || '',
        trashedAt: mail.trashedAt || null,
        leadId: mail.leadId || '',
        leadMatchedBy: mail.leadMatchedBy || null,
        // 인용부를 걷어낸 본문을 먼저 보여주고, 원문은 토글로.
        // 표로 짠 HTML 메일의 텍스트판은 빈 줄투성이라 다듬어서 내보낸다 (lib/mail/text.ts).
        // hasQuoted 는 **다듬기 전 길이**로 판단한다.
        body: tidyMailText(stripped || fullText),
        bodyFull: tidyMailText(fullText),
        hasQuoted: Boolean(stripped && fullText && stripped.length < fullText.length),
        html: loaded.html || '',
        // 이 본문을 지금 메일 서버에서 받아왔는지 (false = 저장된 미리보기)
        bodyFromServer: loaded.fromServer,
        // 못 받아온 이유 — 화면은 미리보기라도 그대로 열린다
        bodyError: loaded.error || '',
        attachments: (mail.attachments || []).filter((a: any) => !a.inline),
        analysis: mail.analysis || null,
        translation: mail.translation || null,
        drafts: mail.drafts || [],
      },
      lead,
      thread: thread.map((t) => ({
        id: String(t._id),
        subject: t.subject,
        from: t.from,
        date: t.date,
        direction: t.direction,
        status: t.status,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

/**
 * PATCH /api/mail/[id] — 상태·메모·분류 수정.
 *
 * 사람이 고친 분류는 classifiedBy='manual' 로 표시해 재분석이 덮지 않게 한다.
 * Body: { status?, memo?, classification?, needsReply? }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // 고치기 전에 내 메일인지 먼저 본다 — 남의 메일 상태·메모를 id 만으로 바꾸지 못하게
    const mail: any = await InboundMail.findById(id, { accountId: 1, leadId: 1 }).lean();
    if (!mail || !canUseAccount(scope, mail.accountId)) {
      return NextResponse.json(NOT_YOURS, { status: 404 });
    }

    const set: any = {};
    if (body.status) set.status = body.status;
    if (typeof body.memo === 'string') set.memo = body.memo;
    if (body.classification) {
      set.classification = body.classification;
      set.classifiedBy = 'manual';   // 재분석이 덮지 않도록
    }
    if (typeof body.needsReply === 'boolean') set['analysis.needsReply'] = body.needsReply;
    if (body.group !== undefined) {
      set.group = body.group;
      set.groupBy = 'manual';        // 자동 분류가 덮지 않도록
    }

    if (!Object.keys(set).length) {
      return NextResponse.json({ success: false, error: '변경할 내용이 없습니다' }, { status: 400 });
    }

    // 범위 조건을 수정 쿼리에도 한 번 더 건다 (위 확인과 수정 사이에 계정이 바뀌는 경우까지)
    await InboundMail.updateOne({ _id: id, ...mailFilter(scope) }, { $set: set });

    // 회신 완료로 표시하면 리드의 '회신 필요' 도 내린다 (리드는 모두가 함께 쓴다)
    if (set.status === 'replied' || set['analysis.needsReply'] === false) {
      if (mail.leadId) await Lead.updateOne({ leadId: mail.leadId }, { $set: { needsReply: false } });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '수정 실패' }, { status: 500 });
  }
}
