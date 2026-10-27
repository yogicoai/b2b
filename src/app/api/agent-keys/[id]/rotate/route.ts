/**
 * POST /api/agent-keys/[id]/rotate → 재발급. 예전 키는 그 즉시 막힌다.
 * 새 키 원문은 이 응답에서 한 번만 보인다. 원문을 받는 사람이 키 주인이어야 하므로 내 키만 된다.
 */
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { rotateKey } from '@/lib/agent/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  try {
    await dbConnect();
    const { id } = await params;
    const { key, info } = await rotateKey(id, user);
    return NextResponse.json({ success: true, key, info });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '재발급 실패' }, { status: e?.status || 500 });
  }
}
