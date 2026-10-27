/**
 * PATCH  /api/agent-keys/[id] { enabled?, name? } → 끄기·켜기·이름 바꾸기 (내 키 · 마스터는 전부)
 * DELETE /api/agent-keys/[id]                      → 삭제 (사용 기록·넣어 둔 초안은 남는다)
 */
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { isMasterUser } from '@/lib/masters';
import { updateKey, deleteKey } from '@/lib/agent/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  try {
    await dbConnect();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const info = await updateKey(id, user, isMasterUser(user), { enabled: body.enabled, name: body.name });
    return NextResponse.json({ success: true, info });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '변경 실패' }, { status: e?.status || 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  try {
    await dbConnect();
    const { id } = await params;
    await deleteKey(id, user, isMasterUser(user));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '삭제 실패' }, { status: e?.status || 500 });
  }
}
