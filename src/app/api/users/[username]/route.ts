import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { isMasterUser, masterIds } from '@/lib/masters';
import dbConnect from '@/lib/mongodb';
import { AdminUser } from '@/models/AdminUser';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

async function isMaster(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return false;
  
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return isMasterUser(payload.user as string);
  } catch {
    return false;
  }
}

// DELETE: 서브 계정 삭제 (마스터만 가능)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  if (!(await isMaster(req))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { username } = await params;
    // 마스터는 여럿일 수 있다. 그중 누구도 지울 수 없다 —
    // 마지막 마스터를 지우면 사용자 관리 화면에 다시 들어갈 방법이 없어진다.
    if (isMasterUser(username)) {
      return NextResponse.json({
        success: false,
        error: `마스터 계정(${masterIds().join(', ')})은 삭제할 수 없습니다`,
      }, { status: 400 });
    }

    await dbConnect();
    const result = await AdminUser.deleteOne({ username });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PATCH: 서브 계정 비밀번호 재설정 (마스터만).
 *
 * 쓰는 사람이 비밀번호를 잊으면 스스로 되돌릴 방법이 없다 — 이 앱에는 메일로
 * 재설정 링크를 보내는 기능이 없고, 넣는다고 해도 그 메일함에 못 들어가는
 * 상황이면 소용이 없다. 관리자가 새로 정해 주는 쪽이 현실적이다.
 *
 * Body: { password }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  if (!(await isMaster(req))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { username } = await params;
    const { password } = await req.json();
    if (!password || String(password).length < 4) {
      return NextResponse.json(
        { success: false, error: '비밀번호는 4자 이상이어야 합니다' },
        { status: 400 },
      );
    }

    await dbConnect();
    const crypto = await import('crypto');
    const passwordHash = crypto.createHash('sha256').update(String(password)).digest('hex');
    const r = await AdminUser.updateOne({ username }, { $set: { passwordHash } });
    if (!r.matchedCount) {
      return NextResponse.json({ success: false, error: '없는 계정입니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, username });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
