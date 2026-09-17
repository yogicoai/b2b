import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, UNAUTHORIZED } from '@/lib/mail/scope';

/**
 * ⚠️ 여기에 있던 scopeMailStats 를 걷어냈다 (2026-09-17).
 *
 * 그 함수는 저장된 리드 지표(inboundCount·lastInboundAt·needsReply·replyDeadline)를
 * **로그인한 사람의 메일함 것만으로 다시 깎아내렸다.** 그래서 마케팅팀원(hjs)이
 * 받은 답장 11통이 이사님(jay)·마스터 화면에서는 0으로 보였다.
 *
 * 리드에 붙은 메일은 개인 메일이 아니라 회사 기록이고, 파이프라인은 두 아이디가
 * 함께 쓴다 (대표님 지시 2026-09-16, lib/mail/scope.ts 상단 '예외' 참고).
 * 저장된 지표는 수집할 때(lib/mail/ingest.ts) 계정을 가리지 않고 적히므로
 * **그대로 내보내는 것이 맞다.**
 *
 * leadId 가 없는 메일(개인 메일함)은 여전히 계정별로 갈린다 — 그건 안 건드렸다.
 */

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
