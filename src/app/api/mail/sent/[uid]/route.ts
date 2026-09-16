import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { resolveAccount, toImapConfig } from '@/lib/mail/accounts';
import { fetchSentSource } from '@/lib/mail/imap';
import { parseMessage } from '@/lib/mail/parse';
import { tidyMailText } from '@/lib/mail/text';
import { getSessionUser, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/mail/sent/[uid]?accountId= — 보낸 메일 한 통의 내용.
 *
 * 이카운트 보낸메일함에서 원문을 받아 그 자리에서 풀어 준다.
 * HTML 은 그대로 내려주고, 화면이 renderMailBodyHtml 로 안전하게 걸러 그린다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  // 보낸 메일 원문도 자기 계정 것만 (lib/mail/scope.ts)
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  try {
    const { uid: uidStr } = await params;
    const uid = Number(uidStr);
    if (!Number.isInteger(uid) || uid <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 메일 번호' }, { status: 400 });
    }
    const accountId = new URL(req.url).searchParams.get('accountId') || 'default';

    await dbConnect();
    const account: any = await resolveAccount(accountId, user);
    // 남의 계정 id 면 404 — uid 로 남의 보낸메일함을 훑지 못하게
    if (!account && accountId !== 'default' && accountId !== 'all') return NextResponse.json(NOT_YOURS, { status: 404 });
    if (!account) return NextResponse.json({ success: false, error: '등록된 메일 계정이 없습니다.' }, { status: 400 });

    const { folder, source, internalDate } = await fetchSentSource(toImapConfig(account), { uid });
    const p = await parseMessage(source, { uid, folder, internalDate });

    return NextResponse.json({
      success: true,
      mail: {
        uid,
        folder,
        accountId: String(account._id),
        subject: p.subject,
        from: p.from,
        to: p.to,
        cc: p.cc,
        date: p.date,
        text: tidyMailText(p.raw?.text || ''),
        html: p.raw?.html || '',
        attachments: (p.attachments || []).filter((a) => !a.inline && a.partId),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '메일을 읽지 못했습니다.' }, { status: 500 });
  }
}
