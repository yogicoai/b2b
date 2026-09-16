import { NextResponse } from 'next/server';
import { getPublicMailSettings, saveMailSettings } from '@/lib/mail-settings';

export const runtime = 'nodejs';

/**
 * GET  /api/mail/settings — 수신(IMAP) 설정 조회 (비밀번호는 boolean 만)
 * POST /api/mail/settings — 설정 저장 (imapPass 가 빈 값이면 기존 비밀번호 유지)
 */

export async function GET() {
  try {
    const settings = await getPublicMailSettings();
    return NextResponse.json({ success: true, settings });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || '설정 조회 실패' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  try {
    const settings = await saveMailSettings(body || {});
    return NextResponse.json({ success: true, settings });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || '설정 저장 실패' },
      { status: 500 },
    );
  }
}
