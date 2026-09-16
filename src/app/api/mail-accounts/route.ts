import { NextResponse } from 'next/server';
import { isMasterUser } from '@/lib/masters';
import { getSessionUser, ownerFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { MailAccount } from '@/models/MailAccount';
import { encryptSecret, sanitizeMailAccount } from '@/lib/crypto';
import { isAllowedMailHost, verifySmtpLogin, HOST_NOT_ALLOWED, FROM_MUST_MATCH } from '@/lib/mail/account-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

/*
 * 이 사람이 볼 수 있는 계정 조건은 lib/mail/scope.ts ownerFilter 한 곳에서 정한다.
 *
 * 마스터끼리는 마스터 아이디들이 등록한 계정을 함께 본다 (admin 이 등록한 계정이
 * yogico 로 로그인하면 안 보여 메일을 못 보내던 문제). 다만 예전처럼 "마스터는 전부" 가 아니다 —
 * 다른 사람 아이디의 계정까지 띄우면 "대표 계정" 이 사람마다 하나씩 겹쳐 보여 헷갈렸고,
 * 그 계정으로 남의 메일함을 열 수 있게 된다 (2026-09-14 아이디별 메일 분리).
 */

/**
 * GET  /api/mail-accounts             → 쓸 수 있는 계정 목록 (비번 제외)
 * POST /api/mail-accounts             → 새 계정 등록 (저장 전 SMTP verify 강제)
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  await dbConnect();
  const list = await MailAccount.find(ownerFilter(user)).sort({ isDefault: -1, createdAt: 1 });
  return NextResponse.json({
    success: true,
    accounts: list.map(sanitizeMailAccount),
    master: isMasterUser(user),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const {
    accountName, smtpHost, smtpPort, smtpSecure,
    smtpUser, smtpPass, fromName, fromAddress, isDefault,
    senderTitle, senderPhone, senderCompany, senderAddress, senderWebsite,
  } = body;

  // 필수값 검증
  if (!accountName || !smtpHost || !smtpUser || !smtpPass || !fromAddress) {
    return NextResponse.json(
      { success: false, error: '필수값 누락: accountName / smtpHost / smtpUser / smtpPass / fromAddress' },
      { status: 400 },
    );
  }

  // 서버 주소는 이카운트만 — 아무 로그인이나 받아주는 서버를 넣고 남의 주소를 등록하는 것을 막는다
  if (!isAllowedMailHost(smtpHost)) {
    return NextResponse.json({ success: false, error: HOST_NOT_ALLOWED }, { status: 400 });
  }
  // 발신 주소는 로그인한 주소와 같아야 한다 — 내 계정으로 로그인해서 From 만 대표 주소로 바꿔 보내는 것을 막는다
  if (String(fromAddress).trim().toLowerCase() !== String(smtpUser).trim().toLowerCase()) {
    return NextResponse.json({ success: false, error: FROM_MUST_MATCH }, { status: 400 });
  }

  // 저장 전 반드시 연결 테스트 (잘못된 자격증명 저장 방지)
  const port = parseInt(String(smtpPort ?? 465), 10);
  const secure = smtpSecure !== false;
  try {
    await verifySmtpLogin({ host: String(smtpHost).trim(), port, secure, user: String(smtpUser).trim(), pass: String(smtpPass) });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `SMTP 연결 실패: ${e?.message || 'unknown'}` },
      { status: 400 },
    );
  }

  await dbConnect();

  // 이 계정이 default 면 기존 default 해제
  if (isDefault === true) {
    // 기본 계정은 (자기가 보는 범위 안에서) 하나뿐이어야 한다. 마스터는 마스터끼리 계정을 같이 보므로
    // 자기 것만 내리면 기본이 두 개가 되어 어느 주소로 나가는지 알 수 없다.
    // 범위 밖(다른 아이디)의 기본 계정은 그 사람 것이라 건드리지 않는다.
    await MailAccount.updateMany({ ...ownerFilter(user), isDefault: true }, { $set: { isDefault: false } });
  }
  // 자기 범위의 첫 계정이면 자동으로 default — 마스터는 마스터 계정 전체 기준
  // (다른 마스터가 이미 기본 계정을 정해 뒀는데 또 기본이 생기면 기본이 둘이 된다)
  const count = await MailAccount.countDocuments(ownerFilter(user));
  const shouldDefault = isDefault === true || count === 0;

  const now = new Date().toISOString();
  try {
    const doc = await MailAccount.create({
      owner: user,
      accountName: String(accountName).trim(),
      smtpHost: String(smtpHost).trim(),
      smtpPort: port,
      smtpSecure: secure,
      smtpUser: String(smtpUser).trim().toLowerCase(),
      smtpPassEnc: encryptSecret(String(smtpPass)),
      fromName: String(fromName || '').trim(),
      fromAddress: String(fromAddress).trim(),
      senderTitle: String(senderTitle || '').trim(),
      senderPhone: String(senderPhone || '').trim(),
      senderCompany: String(senderCompany || '').trim(),
      senderAddress: String(senderAddress || '').trim(),
      senderWebsite: String(senderWebsite || '').trim(),
      isDefault: shouldDefault,
      isActive: true,
      lastVerifiedAt: now,
      lastVerifyError: '',
    });
    return NextResponse.json({ success: true, account: sanitizeMailAccount(doc) });
  } catch (e: any) {
    // duplicate key (같은 owner+smtpUser)
    if (e?.code === 11000) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 계정입니다 (같은 smtpUser).' },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
