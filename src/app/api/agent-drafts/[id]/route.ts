/**
 * GET   /api/agent-drafts/[id]                          → 초안 1건 (회신 상자로 불러올 때)
 * PATCH /api/agent-drafts/[id] { status: 'discarded' | 'pending' } → 버리기 · 되살리기
 *
 * 발송은 여기서 하지 않는다. 회신 상자의 [보내기](/api/mail/reply, agentDraftId 포함) 하나로만 나간다.
 */
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getMailScope, UNAUTHORIZED } from '@/lib/mail/scope';
import { getAgentDraft, publicDraft, setAgentDraftStatus } from '@/lib/agent/drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    const { id } = await params;
    const d = await getAgentDraft(scope, id);
    if (!d) return NextResponse.json({ success: false, error: '초안을 찾을 수 없습니다.' }, { status: 404 });
    return NextResponse.json({ success: true, draft: publicDraft(d) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '불러오지 못했습니다' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const draft = await setAgentDraftStatus(scope, id, body.status);
    return NextResponse.json({ success: true, draft });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '변경 실패' }, { status: e?.status || 500 });
  }
}
