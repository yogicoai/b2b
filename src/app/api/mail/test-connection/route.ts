import { NextResponse } from 'next/server';
import { resolveAccount, toImapConfig } from '@/lib/mail/accounts';
import { testConnection } from '@/lib/mail/imap';
import { getSessionUser, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/mail/test-connection
 *
 * 이카운트 IMAP 에 실제로 붙어서 폴더 목록을 읽어온다.
 * 설정 화면의 [연결 테스트] 버튼이 호출하며, 성공하면 폴더 목록을 그대로
 * 돌려주어 사용자가 수집 대상 폴더를 고를 수 있게 한다.
 */
export async function POST(req: Request) {
  // 연결 테스트도 자기 계정만 — 남의 계정 id 로 그 사람 메일함 폴더 목록을 볼 수 없게
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* 본문 없이도 동작 */ }

  try {
    // 등록된 발송 계정을 그대로 수신 계정으로 쓴다 (이카운트는 자격증명이 같다).
    // accountId 를 주면 그 계정, 없으면 기본 계정. 어느 쪽이든 로그인한 사람 몫 안에서만 찾는다.
    await dbConnect();
    const requested = String(body?.accountId || '').trim();
    const account = await resolveAccount(requested || undefined, user);
    if (!account && requested && requested !== 'default' && requested !== 'all') {
      // 남의 계정인지 없는 계정인지 구분해 주지 않는다 (404)
      return NextResponse.json(NOT_YOURS, { status: 404 });
    }
    if (!account) {
      return NextResponse.json({
        success: false,
        error: '등록된 메일 계정이 없습니다. [메일 계정] 화면에서 먼저 등록하세요.',
      }, { status: 400 });
    }

    const result = await testConnection(toImapConfig(account));

    // 이미 수집 대상으로 지정된 폴더 (계정에 저장돼 있다)
    const selected: string[] = account.imapFolders || [];

    return NextResponse.json({
      success: true,
      account: { accountId: String(account._id), label: account.accountName, address: account.smtpUser },
      folders: result.folders,
      folderCount: result.folders.length,
      selectedFolders: selected,
      mailbox: result.mailbox,
      targetExists: result.targetExists,
    });
  } catch (e: any) {
    // imap.ts 가 이미 사람이 읽을 수 있는 말로 바꿔서 던진다
    return NextResponse.json(
      { success: false, error: e?.message || '연결 실패' },
      { status: 500 },
    );
  }
}
