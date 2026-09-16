import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { resolveAccount, toImapConfig } from '@/lib/mail/accounts';
import { listSentPage } from '@/lib/mail/imap';
import { getSessionUser, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/mail/sent?page=1&q=&accountId= — 보낸메일함 목록 (이카운트에서 바로 읽음).
 *
 * 보낸 메일은 DB 에 수집하지 않는다 (lib/mail/imap.ts '보낸메일함' 설명 참고).
 * accountId 는 받은 메일함이 지금 보고 있는 계정이다. 없으면 대표 계정.
 * 로그인 확인은 proxy.ts 가 /api 전체에 건다. 계정은 로그인한 아이디 몫 안에서만 고른다 (lib/mail/scope.ts).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const q = (url.searchParams.get('q') || '').slice(0, 100);
    const accountId = url.searchParams.get('accountId') || 'default';

    await dbConnect();
    const account: any = await resolveAccount(accountId, user);
    // 남의 계정 id 면 404 — 그 계정이 있는지조차 알려주지 않는다
    if (!account && accountId !== 'default' && accountId !== 'all') return NextResponse.json(NOT_YOURS, { status: 404 });
    if (!account) return NextResponse.json({ success: false, error: '등록된 메일 계정이 없습니다.' }, { status: 400 });

    const r = await listSentPage(toImapConfig(account), { page, pageSize: 30, q });
    if (!r.folder) {
      return NextResponse.json(
        { success: false, error: `${account.smtpUser} 메일함에서 보낸메일함을 찾지 못했습니다.` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      account: { accountId: String(account._id), address: account.smtpUser, label: account.accountName || account.smtpUser },
      folder: r.folder,
      total: r.total,
      page: r.page,
      totalPages: Math.max(1, Math.ceil(r.total / r.pageSize)),
      items: r.items,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '보낸메일함을 읽지 못했습니다.' }, { status: 500 });
  }
}
