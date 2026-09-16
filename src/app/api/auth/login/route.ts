import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import dbConnect from '@/lib/mongodb';
import { AdminUser } from '@/models/AdminUser';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

async function createSession(username: string) {
  const alg = 'HS256';
  const jwt = await new SignJWT({ user: username, role: 'admin' })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

  const response = NextResponse.json({ success: true });
  response.cookies.set('admin_session', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    await dbConnect();
    
    // 1) DB에서 먼저 확인 (가장 우선)
    const user = await AdminUser.findOne({ username });
    
    if (user) {
      if (user.passwordHash === passwordHash) {
        return await createSession(username);
      } else {
        return NextResponse.json({ success: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' }, { status: 401 });
      }
    }

    // 2) DB에 없는 경우, .env.local 마스터 계정과 일치하는지 확인 (초기 시드용)
    const envId = process.env.ADMIN_ID || 'yogico';
    const envPw = process.env.ADMIN_PASSWORD || 'yogico';
    
    if (username === envId && password === envPw) {
      // DB에 마스터 계정 자동 생성
      await AdminUser.create({ username, passwordHash });
      return await createSession(username);
    }

    return NextResponse.json({ success: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' }, { status: 401 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
