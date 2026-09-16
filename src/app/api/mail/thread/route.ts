import { NextResponse } from 'next/server';
import { tidyMailText } from '@/lib/mail/text';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * GET /api/mail/thread?leadId=xxx — 한 리드의 메일 대화 타임라인
 *
 * **이 앱을 합친 이유가 되는 화면.**
 *   - 보낸 메일은 Lead.emailHistory 에 있고 (아웃바운드 CRM)
 *   - 받은 메일은 InboundMail 에 있다 (인바운드 메일함)
 * 둘을 시간순으로 엮어 "무슨 얘기가 오갔나"를 한 줄기로 보여준다.
 * 어느 한쪽 앱만으로는 만들 수 없는 화면이다.
 *
 * 응답: { lead, timeline: [{direction:'out'|'in', ...}], stats }
 *
 * 리드는 모두가 함께 쓰지만, 받은 메일은 로그인한 아이디가 볼 수 있는 계정 것만 엮는다
 * (lib/mail/scope.ts). 보낸 기록(emailHistory)은 리드 자료라 그대로 보여준다.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');
    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId 필요' }, { status: 400 });
    }

    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const lead: any = await Lead.findOne({ leadId }).lean();
    if (!lead) {
      return NextResponse.json({ success: false, error: '리드를 찾을 수 없음' }, { status: 404 });
    }

    // ── 받은 메일 (본문 포함 — 대화를 읽어야 하므로) ──
    //
    // **리드에 붙은 메일은 계정을 가리지 않는다.**
    // 예전에는 여기에 mailFilter(scope) 를 걸어 자기 계정으로 받은 것만 엮었다.
    // 그런데 리드(파이프라인)는 원래 모두가 함께 쓰는 자료다. 그래서 이사님이
    // [대화 진행 중]에서 서울아산병원을 열면 회사는 있는데 대화가 **0건**으로 떴다 —
    // 그 메일 11통이 전부 담당자 계정으로 들어왔기 때문이다.
    // 리드에 붙었다는 것은 "이 회사와의 업무 대화" 라는 뜻이고, 그건 개인 메일이
    // 아니라 회사 기록이다. 리드에 안 붙은 메일(개인 메일함)은 지금처럼 계정별로
    // 갈린다 — 받은 메일함·회신 필요·메일 쓰기 연락처는 그대로다.
    const inbound: any[] = await InboundMail.find(
      { leadId },
      // 옛 메일에만 남아 있는 HTML 원문은 무거워서 제외한다 (지금은 아예 저장하지 않는다).
      // 본문 원문이 필요하면 메일을 열 때 메일 서버에서 받아온다 (api/mail/[id] · lib/mail/body.ts).
      { 'raw.html': 0 },
    ).sort({ date: 1 }).lean();

    // ── 보낸 메일 (emailHistory) ──
    const sent = (lead.emailHistory || [])
      .filter((h: any) => h && h.status === 'sent')
      .map((h: any) => ({
        direction: 'out' as const,
        at: h.sentAt,
        subject: h.subject || '',
        body: h.body || '',
        to: h.to || '',
        messageId: h.messageId || '',
        templateId: h.templateId || '',
        scheduledFor: h.scheduledFor || '',
      }));

    // ── 받은 메일 → 타임라인 항목 ──
    const received = inbound.map((m: any) => ({
      direction: 'in' as const,
      at: m.date ? new Date(m.date).toISOString() : m.receivedAt,
      _id: String(m._id),
      subject: m.subject || '',
      // 인용부를 걷어낸 본문을 우선 보여준다 — 이전 대화가 통째로 딸려오면 읽을 수가 없다.
      //
      // ⚠️ 여기 본문은 **저장된 미리보기**(4,000자)다. 이 화면은 한 리드의 메일을 통째로 펼치므로
      //    통마다 메일 서버에서 원문을 받으면 IMAP 연결이 수십 개 열린다. 전문은 메일을 열 때
      //    한 통씩 받아온다 (api/mail/[id] · lib/mail/body.ts).
      //    raw 가 비어 있는 메일도 있어 ?. 로 읽는다 — 비면 빈 문자열이 되어 화면은 그대로 뜬다.
      body: tidyMailText(m.bodyStripped || m.raw?.text || ''),
      bodyFull: tidyMailText(m.raw?.text || ''),
      hasQuoted: Boolean(m.bodyStripped && m.raw?.text && m.bodyStripped.length < m.raw.text.length),
      // 미리보기라 뒷부분이 잘렸는지 — 화면이 "메일 열기" 로 안내할 수 있게
      bodyTruncated: Boolean(m.rawTruncated),
      from: m.from || {},
      lang: m.lang || '',
      classification: m.classification || 'unknown',
      matchedBy: m.leadMatchedBy || null,
      status: m.status || 'new',
      needsReply: m.analysis?.needsReply ?? null,
      deadline: m.analysis?.deadline || null,
      deadlineText: m.analysis?.deadlineText || '',
      urgency: m.analysis?.urgency || null,
      // AI 분석 결과 (유료 경로를 돌린 메일만 채워진다)
      analyzedBy: m.analysis?.method || null,
      topic: m.analysis?.topic || '',
      summary: m.analysis?.summary || '',
      keyPoints: m.analysis?.keyPoints || [],
      intent: m.analysis?.intent || '',
      suggestedAction: m.analysis?.suggestedAction || '',
      translation: m.translation?.body || '',
      translationSubject: m.translation?.subject || '',
      attachments: (m.attachments || []).filter((a: any) => !a.inline),
      folder: m.folder,
      uid: m.uid,
    }));

    // 시간순 정렬 (오래된 것 → 최신, 대화 흐름대로)
    const timeline = [...sent, ...received].sort(
      (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime(),
    );

    // 아직 안 지난 기한 중 가장 이른 것
    const now = Date.now();
    const futureDeadlines = received
      .map((r) => r.deadline)
      .filter(Boolean)
      .map((d: any) => new Date(d))
      .filter((d: Date) => d.getTime() >= now)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());

    const lastIn = received.length ? received[received.length - 1] : null;

    // Lead.inboundCount · lastInboundAt 은 모든 계정의 메일로 센 값이다.
    // 그대로 내보내면 남의 계정으로 온 답장 통수·시각이 드러나므로, 이 사람이 볼 수 있는 메일로 다시 센다
    // (ingest.ts 와 같은 기준: 받은 메일 · 휴지통 제외).
    const myIn = inbound.filter((m: any) => m.direction === 'in' && !m.trashedAt);
    const myLastIn = myIn.reduce((best: string, m: any) => {
      const at = m.date ? new Date(m.date).toISOString() : '';
      return at > best ? at : best;
    }, '');
    // Lead.needsReply 도 어느 계정 메일이든 마지막으로 받은 한 통의 판정으로 덮인 값이다 —
    // 남의 메일함에 온 답장 때문에 '회신 필요' 가 켜지거나 꺼져 보이지 않게, 내 메일 중 마지막 한 통으로 정한다.
    // (inbound 는 date 오름차순이라 myIn 의 끝이 가장 최근 메일이다)
    const myLatestIn = myIn.length ? myIn[myIn.length - 1] : null;
    const myNeedsReply = Boolean(
      myLatestIn && myLatestIn.analysis?.needsReply === true && myLatestIn.status !== 'replied',
    );

    return NextResponse.json({
      success: true,
      lead: {
        leadId: lead.leadId,
        Company: lead.Company,
        Region: lead.Region,
        Email: lead.Email,
        BuyerContact: lead.BuyerContact,
        WebsiteContact: lead.WebsiteContact,
        stage: lead.stage,
        stageChangedAt: lead.stageChangedAt,
        inboundCount: myIn.length,
        lastInboundAt: myLastIn,
        needsReply: myNeedsReply,
      },
      timeline,
      stats: {
        sentCount: sent.length,
        receivedCount: received.length,
        // 마지막이 상대 메일이면 우리가 답할 차례다
        awaitingOurReply: Boolean(lastIn && timeline[timeline.length - 1]?.direction === 'in'),
        needsReply: Boolean(lastIn?.needsReply),
        nearestDeadline: futureDeadlines[0]?.toISOString() || null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
