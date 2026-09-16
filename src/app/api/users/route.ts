import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { isMasterUser, masterIds } from '@/lib/masters';
import dbConnect from '@/lib/mongodb';
import { AdminUser } from '@/models/AdminUser';
import crypto from 'crypto';

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

// GET: 서브 계정 목록 조회 (마스터만 가능)
export async function GET(req: Request) {
  if (!(await isMaster(req))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  try {
    await dbConnect();
    // 마스터 계정은 목록에서 제외할 수도 있지만, 우선 모든 계정 반환 (비밀번호 제외)
    const users = await AdminUser.find({}, { username: 1, createdAt: 1 }).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 서브 계정 생성 (마스터만 가능)
export async function POST(req: Request) {
  if (!(await isMaster(req))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Username and password are required' }, { status: 400 });
    }

    await dbConnect();
    const existingUser = await AdminUser.findOne({ username });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'User already exists' }, { status: 400 });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const newUser = await AdminUser.create({ username, passwordHash });

    return NextResponse.json({ success: true, data: { username: newUser.username, createdAt: newUser.createdAt } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
