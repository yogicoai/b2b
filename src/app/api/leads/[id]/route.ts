import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, mailFilter, UNAUTHORIZED, type MailScope } from '@/lib/mail/scope';

/**
 * 리드의 답장 지표(inboundCount · lastInboundAt · needsReply · replyDeadline)를
 * 로그인한 아이디의 메일 기준으로 고친다 (아이디별 메일 분리, 2026-09-14).
 *
 * ⚠️ src/app/api/leads/route.ts 의 scopeMailStats 와 **같은 함수**다 (복사본).
 *    목록과 상세가 다른 숫자를 보이면 안 되므로 한쪽을 고치면 반드시 다른 쪽도 고친다.
 *    (route 파일은 GET/PUT 같은 정해진 이름만 내보낼 수 있어 import 로 나눠 쓰지 못한다)
 *
 * 저장된 네 값은 수집할 때(lib/mail/ingest.ts) 어느 계정으로 받은 메일인지 가리지 않고 적힌다.
 * 남의 계정 메일이 실제로 붙어 있는 리드만 내 메일로 다시 센다. 나머지는 저장된 값이 곧 내 값이다.
 */
async function scopeMailStats(leads: any[], scope: MailScope): Promise<void> {
  // 저장된 지표가 비어 있으면 드러날 것이 없다 — 대상만 추린다
  const touched = leads.filter((l) =>
    l && l.leadId && ((l.inboundCount || 0) > 0 || l.lastInboundAt || l.needsReply || l.replyDeadline));
  if (!touched.length) return;

  // 남의 계정(범위 밖) 메일이 하나라도 붙은 리드.
  // 휴지통 것도 포함한다 — 저장된 lastInboundAt·needsReply 는 휴지통 여부와 무관하게 적힌다.
  // 방향도 가리지 않는다 — 받은 메일만 보면 남의 메일 흔적이 붙은 리드를 놓쳐 저장값이 그대로 나간다.
  // (다시 셀 때는 아래 $match 처럼 받은 메일만 센다)
  const foreign: string[] = await InboundMail.distinct('leadId', {
    leadId: { $in: touched.map((l) => l.leadId) },
    accountId: { $nin: scope.accountIds },
  });
  if (!foreign.length) return;

  const now = new Date();
  const agg: any[] = await InboundMail.aggregate([
    // ingest 가 inboundCount 를 셀 때와 같은 조건 + 내 계정 메일만
    { $match: { leadId: { $in: foreign }, direction: 'in', trashedAt: null, ...mailFilter(scope) } },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: '$leadId',
        n: { $sum: 1 },
        lastIn: { $first: '$date' },
        // 저장값도 "마지막으로 받은 메일" 의 판정이다
        lastNeedsReply: { $first: '$analysis.needsReply' },
        // 아직 안 지난 기한 중 가장 이른 것 (Lead.replyDeadline 의 뜻). $min 은 null 을 건너뛴다
        deadline: { $min: { $cond: [{ $gte: ['$analysis.deadline', now] }, '$analysis.deadline', null] } },
      },
    },
  ]);
  const by = new Map(agg.map((r) => [r._id, r]));
  const foreignSet = new Set(foreign);

  for (const l of touched) {
    if (!foreignSet.has(l.leadId)) continue;
    const r = by.get(l.leadId);
    // 내 메일이 한 통도 없으면 답장이 없는 리드로 보인다
    l.inboundCount = r?.n || 0;
    l.lastInboundAt = r?.lastIn ? new Date(r.lastIn).toISOString() : '';
    l.needsReply = Boolean(r?.lastNeedsReply);
    l.replyDeadline = r?.deadline ? new Date(r.deadline).toISOString() : '';
  }
}

/**
 * GET /api/leads/[id] — 리드 1건 전문.
 *
 * 목록 API 는 5천 건을 한 번에 내려주느라 프로젝션으로 칸을 줄인다
 * (Evidence·Sources 는 한 건에 수백 자라 전부 실으면 응답이 수 MB 가 된다).
 * 그래서 상세 화면이 목록 캐시를 읽으면 업종·근거·출처가 빈칸으로 보였다.
 * DB 에는 값이 있는데 화면에만 없던 것이라, 상세는 여기서 따로 읽는다.
 *
 * 리드는 모두가 함께 보지만 답장 지표는 로그인한 아이디의 메일 기준으로 고쳐 내보낸다 (목록과 같다).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await dbConnect();
    // 답장 지표를 누구 메일로 셀지 정해야 하므로 로그인이 필요하다
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // threadKeys 는 내보내지 않는다 — 남의 계정으로 오간 대화의 스레드 키까지 들어 있다
    const lead: any = await Lead.findById(id).select('-threadKeys').lean();
    if (!lead) {
      return NextResponse.json({ success: false, error: '리드를 찾을 수 없습니다' }, { status: 404 });
    }
    await scopeMailStats([lead], scope);
    return NextResponse.json({ success: true, lead });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    await dbConnect();
    // 응답에 메일에서 온 값은 싣지 않는다 (GET 과 같은 이유 — 다른 아이디의 메일 흔적)
    const lead = await Lead.findByIdAndUpdate(id, body, { new: true, runValidators: true })
      .select('-threadKeys -inboundCount -lastInboundAt -needsReply -replyDeadline');
    
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: lead });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    await dbConnect();
    const lead = await Lead.findByIdAndDelete(id);
    
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
