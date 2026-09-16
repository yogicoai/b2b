import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

export async function proxy(req: NextRequest) {
  // Protect all routes except /login, /api/auth, /api/cron (bearer-protected), and public assets
  if (
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/api/auth') ||
    req.nextUrl.pathname.startsWith('/api/cron') ||
    // 수신거부는 로그인 뒤에 둘 수 없다 — 누르는 사람은 우리 직원이 아니라
    // 메일을 받은 바깥 업체다. 여기서 막으면 링크가 로그인 화면으로 튕기고,
    // 그건 "수신거부 수단을 제공하지 않은 것"과 같다 (정보통신망법 제50조).
    // 대신 주소마다 HMAC 서명을 실어 남의 주소를 대신 거부시키지 못하게 한다.
    req.nextUrl.pathname.startsWith('/api/unsubscribe') ||
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.startsWith('/assets') ||
    req.nextUrl.pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('admin_session')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch (err) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
