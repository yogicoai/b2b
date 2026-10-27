/**
 * GET  /api/agent-keys              → 내 에이전트 키 목록 + 사용 기록 (마스터는 전부)
 * POST /api/agent-keys { name, tool } → 새 키 발급 — 원문은 이 응답에서 한 번만 보인다
 *
 * 로그인한 사람만 쓴다(proxy.ts 쿠키 검사). 에이전트 키로는 이 주소에 들어올 수 없다 —
 * 키가 스스로 키를 만들거나 늘릴 수 없게 하려는 것이다.
 */
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { isMasterUser } from '@/lib/masters';
import { listKeys, createKey, AGENT_TOOLS, AGENT_TOOL_LABELS } from '@/lib/agent/keys';
import { listAudit } from '@/lib/agent/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  try {
    await dbConnect();
    const isMaster = isMasterUser(user);
    const sp = new URL(req.url).searchParams;
    const keyId = sp.get('keyId') || undefined;
    const [keys, audit] = await Promise.all([
      listKeys(isMaster ? undefined : user),
      listAudit({ owner: isMaster ? undefined : user, keyId, limit: Number(sp.get('limit')) || 100 }),
    ]);
    return NextResponse.json({
      success: true,
      user,
      isMaster,
      keys,
      audit,
      tools: AGENT_TOOLS.map((v) => ({ value: v, label: AGENT_TOOL_LABELS[v] })),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '불러오지 못했습니다' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const { key, info } = await createKey(user, { name: body.name, tool: body.tool });
    return NextResponse.json({ success: true, key, info });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '발급 실패' }, { status: e?.status || 500 });
  }
}
