import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { resolveAccount, toImapConfig } from '@/lib/mail/accounts';
import { openAttachmentStream, sentFolderPath } from '@/lib/mail/imap';
import { getSessionUser, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/mail/sent/[uid]/attachment?part=2&name=파일.pdf&type=application/pdf&accountId=
 *
 * 보낸 메일의 첨부파일 내려받기. 받은 메일 첨부(/api/mail/[id]/attachment)와 같은 방식 —
 * 파일을 서버 메모리에 모으지 않고 흘려보낸다(Vercel 4.5MB 응답 제한을 받지 않는다).
 *
 * 폴더는 요청에서 받지 않고 서버가 보낸메일함을 직접 찾는다 — 다른 폴더를 열게 할 이유가 없다.
 * 무조건 '내려받기'로만 준다 (HTML·SVG 첨부를 이 주소에서 열면 그 안의 스크립트가 돈다).
 */
function contentDisposition(filename: string): string {
  const safe = String(filename || 'attachment').replace(/[\r\n"\\]/g, '_');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_') || 'attachment';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  // 첨부도 자기 계정 보낸메일함에서만 (lib/mail/scope.ts)
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  try {
    const { uid: uidStr } = await params;
    const uid = Number(uidStr);
    const url = new URL(req.url);
    const part = url.searchParams.get('part') || '';
    const name = url.searchParams.get('name') || 'attachment';
    const type = (url.searchParams.get('type') || 'application/octet-stream').slice(0, 100);
    if (!Number.isInteger(uid) || uid <= 0 || !/^[\d.]+$/.test(part)) {
      return NextResponse.json({ success: false, error: '잘못된 첨부 요청' }, { status: 400 });
    }

    await dbConnect();
    const accountId = url.searchParams.get('accountId') || 'default';
    const account: any = await resolveAccount(accountId, user);
    // 남의 계정 id 면 404 — 그 사람 첨부를 내려받지 못하게
    if (!account && accountId !== 'default' && accountId !== 'all') return NextResponse.json(NOT_YOURS, { status: 404 });
    if (!account) return NextResponse.json({ success: false, error: '등록된 메일 계정이 없습니다.' }, { status: 400 });
    const settings = toImapConfig(account);
    const folder = await sentFolderPath(settings);
    if (!folder) return NextResponse.json({ success: false, error: '보낸메일함을 찾지 못했습니다.' }, { status: 404 });

    const { stream } = await openAttachmentStream({ ...settings, imapFolder: folder }, { folder, uid, partId: part });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream',
        'Content-Disposition': contentDisposition(name),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `첨부파일을 받지 못했습니다: ${e?.message || e}` }, { status: 500 });
  }
}
