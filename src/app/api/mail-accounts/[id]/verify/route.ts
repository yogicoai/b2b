import { NextResponse } from 'next/server';
import { getSessionUser, ownerFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { MailAccount } from '@/models/MailAccount';
import { decryptSecret } from '@/lib/crypto';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/mail-accounts/:id/verify
 * 저장된 자격증명으로 다시 SMTP 연결 테스트 (비밀번호 만료 감지 등).
 * 성공/실패 결과와 시각을 lastVerifiedAt / lastVerifyError 에 기록.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 위조·만료 토큰이면 예전엔 jwtVerify 가 던져 500 이 났다 — getSessionUser 는 null 로 돌려 401
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await params;
  await dbConnect();
  // 자기 범위(lib/mail/scope.ts ownerFilter) 계정만 — 남의 계정 비밀번호로 연결을 시험하지 못하게
  const acc = await MailAccount.findOne({ _id: id, ...ownerFilter(user) });
  if (!acc) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });

  const now = new Date().toISOString();
  try {
    const pass = decryptSecret(acc.smtpPassEnc);
    const t = nodemailer.createTransport({
      host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpSecure,
      auth: { user: acc.smtpUser, pass },
    });
    await t.verify();
    acc.lastVerifiedAt = now;
    acc.lastVerifyError = '';
    await acc.save();
    return NextResponse.json({ success: true, verifiedAt: now });
  } catch (e: any) {
    acc.lastVerifyError = e?.message || 'unknown';
    await acc.save();
    return NextResponse.json({ success: false, error: e?.message || 'unknown', at: now });
  }
}
