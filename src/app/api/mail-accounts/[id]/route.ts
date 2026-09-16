import { NextResponse } from 'next/server';
import { getSessionUser, ownerFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { MailAccount } from '@/models/MailAccount';
import { encryptSecret, sanitizeMailAccount } from '@/lib/crypto';
import { decryptSecret } from '@/lib/crypto';
import { isAllowedMailHost, verifySmtpLogin, HOST_NOT_ALLOWED, FROM_MUST_MATCH } from '@/lib/mail/account-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * PUT    /api/mail-accounts/:id → 계정 정보 부분 업데이트 (비번 포함 시 재검증)
 * DELETE /api/mail-accounts/:id → 계정 삭제
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  await dbConnect();
  // 자기 범위(lib/mail/scope.ts ownerFilter) 계정만 고친다 — 마스터라도 다른 아이디의 계정은 404
  const acc = await MailAccount.findOne({ _id: id, ...ownerFilter(user) });
  if (!acc) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });

  const update: any = {};
  const allowed = ['accountName', 'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'fromName', 'fromAddress', 'isActive', 'senderTitle', 'senderPhone', 'senderCompany', 'senderAddress', 'senderWebsite'];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
  }

  if (typeof update.smtpUser === 'string') update.smtpUser = update.smtpUser.trim().toLowerCase();
  const nextHost = update.smtpHost ?? acc.smtpHost;
  const nextUser = update.smtpUser ?? acc.smtpUser;
  if (!isAllowedMailHost(nextHost)) {
    return NextResponse.json({ success: false, error: HOST_NOT_ALLOWED }, { status: 400 });
  }
  const nextFrom = update.fromAddress ?? acc.fromAddress;
  if (String(nextFrom || '').trim().toLowerCase() !== String(nextUser || '').trim().toLowerCase()) {
    return NextResponse.json({ success: false, error: FROM_MUST_MATCH }, { status: 400 });
  }

  // 로그인 주소·서버가 바뀌면 비밀번호를 새로 안 넣었어도 **반드시 다시 로그인해 본다**.
  // (예전에는 비밀번호를 넣을 때만 확인해서, 주소만 david@ 로 바꿔 그 메일함을 여는 길이 있었다)
  const identityChanged = ['smtpUser', 'smtpHost', 'smtpPort', 'smtpSecure'].some(
    (k) => Object.prototype.hasOwnProperty.call(update, k) && String(update[k]).toLowerCase() !== String((acc as any)[k]).toLowerCase(),
  );
  if (body.smtpPass || identityChanged) {
    try {
      await verifySmtpLogin({
        host: String(nextHost).trim(),
        port: Number(update.smtpPort ?? acc.smtpPort),
        secure: Boolean(update.smtpSecure ?? acc.smtpSecure),
        user: String(nextUser).trim(),
        pass: body.smtpPass ? String(body.smtpPass) : decryptSecret(acc.smtpPassEnc),
      });
      if (body.smtpPass) update.smtpPassEnc = encryptSecret(String(body.smtpPass));
      update.lastVerifiedAt = new Date().toISOString();
      update.lastVerifyError = '';
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: `SMTP 재검증 실패: ${e?.message || 'unknown'}` },
        { status: 400 },
      );
    }
  }

  // isDefault=true 로 변경 시 다른 계정 해제 — 같은 범위 안에서만 (다른 아이디의 기본 계정은 그 사람 것)
  if (body.isDefault === true) {
    await MailAccount.updateMany({ ...ownerFilter(user), isDefault: true, _id: { $ne: acc._id } }, { $set: { isDefault: false } });
    update.isDefault = true;
  }

  Object.assign(acc, update);
  await acc.save();
  return NextResponse.json({ success: true, account: sanitizeMailAccount(acc) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const { id } = await params;
  await dbConnect();
  // 자기 범위 계정만 지운다 — 마스터라도 다른 아이디의 계정은 404
  const acc = await MailAccount.findOneAndDelete({ _id: id, ...ownerFilter(user) });
  if (!acc) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  // default 계정 삭제하면 같은 범위에서 가장 오래된 것을 새 default 로
  // (범위 밖 계정을 기본으로 올리면 다른 아이디의 기본 계정이 둘이 된다)
  if (acc.isDefault) {
    const next = await MailAccount.findOne(ownerFilter(user)).sort({ createdAt: 1 });
    if (next) { next.isDefault = true; await next.save(); }
  }
  return NextResponse.json({ success: true });
}
