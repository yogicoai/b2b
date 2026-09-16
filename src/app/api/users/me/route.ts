import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongodb';
import { AdminUser } from '@/models/AdminUser';
import { MailAccount } from '@/models/MailAccount';
import { EmailSchedule } from '@/models/EmailSchedule';
import { isMasterUser } from '@/lib/masters';
import { getSessionUser } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/** 로그인과 같은 방식으로 비밀번호를 해시한다 (api/auth/login) */
const hash = (pw: string) => crypto.createHash('sha256').update(pw).digest('hex');
const ID_RULE = /^[a-z0-9._-]{3,20}$/;

/**
 * PUT /api/users/me — 로그인한 사람이 **자기** 아이디·비밀번호를 바꾼다.
 * (사이드바 [⚙ 설정 · 도구] → [🔑 아이디 변경하기] · 대표님 요청 2026-09-14)
 *
 * Body: { currentPassword, newUsername?, newPassword? }
 *
 * - 현재 비밀번호를 반드시 확인한다 — 자리를 비운 사이 남이 바꾸는 것을 막는다.
 * - 아이디를 바꾸면 그 아이디에 묶인 것(메일 계정 owner · 예약 createdBy)도 함께 옮긴다.
 *   안 옮기면 새 아이디로 로그인했을 때 자기 메일 계정이 하나도 안 보인다.
 * - 마스터 아이디(admin·yogico — 환경설정 ADMIN_IDS)는 이름을 바꿀 수 없다. 바꾸는 순간 마스터가 아니게 된다.
 * - 바꾼 뒤에는 로그아웃시킨다 — 새 아이디·비밀번호로 다시 로그인하게.
 */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || '');
  const newUsername = String(body?.newUsername || '').trim().toLowerCase();
  const newPassword = String(body?.newPassword || '');

  if (!currentPassword) return NextResponse.json({ success: false, error: '현재 비밀번호를 입력하세요' }, { status: 400 });
  const renaming = !!newUsername && newUsername !== user.toLowerCase();
  if (!renaming && !newPassword) return NextResponse.json({ success: false, error: '바꿀 아이디나 새 비밀번호를 입력하세요' }, { status: 400 });
  if (renaming && !ID_RULE.test(newUsername)) {
    return NextResponse.json({ success: false, error: '아이디는 영문 소문자·숫자·._- 로 3~20자입니다' }, { status: 400 });
  }
  if (newPassword && newPassword.length < 6) {
    return NextResponse.json({ success: false, error: '새 비밀번호는 6자 이상이어야 합니다' }, { status: 400 });
  }

  await dbConnect();
  const me: any = await AdminUser.findOne({ username: user });
  if (!me) {
    return NextResponse.json({ success: false, error: '계정 정보를 찾을 수 없습니다. 다시 로그인한 뒤 시도하세요.' }, { status: 404 });
  }
  if (me.passwordHash !== hash(currentPassword)) {
    return NextResponse.json({ success: false, error: '현재 비밀번호가 맞지 않습니다' }, { status: 400 });
  }

  if (renaming) {
    if (isMasterUser(user)) {
      return NextResponse.json({ success: false, error: '관리자(마스터) 아이디는 바꿀 수 없습니다. 비밀번호만 바꿀 수 있습니다.' }, { status: 400 });
    }
    if (isMasterUser(newUsername)) {
      return NextResponse.json({ success: false, error: '쓸 수 없는 아이디입니다' }, { status: 400 });
    }
    if (await AdminUser.exists({ username: newUsername })) {
      return NextResponse.json({ success: false, error: '이미 쓰고 있는 아이디입니다' }, { status: 409 });
    }
  }

  const set: any = {};
  if (renaming) set.username = newUsername;
  if (newPassword) set.passwordHash = hash(newPassword);
  await AdminUser.updateOne({ _id: me._id }, { $set: set });

  let movedAccounts = 0;
  if (renaming) {
    // 이 아이디에 묶인 것들을 새 아이디로
    movedAccounts = (await MailAccount.updateMany({ owner: user }, { $set: { owner: newUsername } })).modifiedCount;
    await EmailSchedule.updateMany({ createdBy: user }, { $set: { createdBy: newUsername } });
    try {
      const { InfoRequest } = await import('@/models/InfoRequest');
      await (InfoRequest as any).updateMany({ createdBy: user }, { $set: { createdBy: newUsername } });
    } catch { /* 정보 요청 기능이 없는 배포면 건너뛴다 */ }
  }

  const res = NextResponse.json({
    success: true,
    username: renaming ? newUsername : user,
    renamed: renaming,
    passwordChanged: !!newPassword,
    movedAccounts,
  });
  // 새 아이디·비밀번호로 다시 로그인하게 세션을 끊는다
  res.cookies.delete('admin_session');
  return res;
}
