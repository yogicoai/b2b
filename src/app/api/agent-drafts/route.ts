/**
 * GET /api/agent-drafts?status=pending&inboundMailId=&countOnly=true — [발송 관리 → 🤖 승인 대기]
 * 로그인한 사람용. 에이전트는 /api/agent/v1/drafts 로 본다.
 * 메일과 같은 규칙으로 보인다 — 그 메일을 받은 계정을 볼 수 있거나, 내 키로 넣은 것 (lib/agent/drafts.ts).
 */
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getMailScope, UNAUTHORIZED } from '@/lib/mail/scope';
import { listAgentDrafts, countPendingDrafts } from '@/lib/agent/drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    const sp = new URL(req.url).searchParams;
    if (sp.get('countOnly') === 'true') {
      return NextResponse.json({ success: true, pending: await countPendingDrafts(scope) });
    }
    const [items, pending] = await Promise.all([
      listAgentDrafts(scope, {
        status: sp.get('status') || 'pending',
        inboundMailId: sp.get('inboundMailId') || undefined,
        withBody: sp.get('withBody') === 'true',
        limit: Number(sp.get('limit')) || 200,
      }),
      countPendingDrafts(scope),
    ]);
    return NextResponse.json({ success: true, items, pending });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '불러오지 못했습니다' }, { status: 500 });
  }
}
