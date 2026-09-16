import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { MailAccount } from '@/models/MailAccount';
import { toImapConfig } from '@/lib/mail/accounts';
import { getMailSettings } from '@/lib/mail-settings';
import type { ImapConfig } from '@/lib/mail/imap';
import { openAttachmentStream } from '@/lib/mail/imap';
import { getMailScope, mailFilter, ownerFilter, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';
import { isMasterUser } from '@/lib/masters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 메일 서버 접속 + 큰 파일 전송까지. Hobby 최대가 300초다.
export const maxDuration = 300;

/**
 * GET /api/mail/[id]/attachment?att=<첨부 _id>&i=<순번> — 받은 메일의 첨부파일 내려받기.
 *
 * ── 왜 이렇게 만드나 ──
 * 수집할 때 첨부파일 **내용은 저장하지 않는다** (lib/mail/parse.ts). 메일 한 통에
 * 수십 MB 가 붙는 일이 흔해 DB 가 금방 찬다. 대신 계정·폴더·UID·파트 번호를
 * 남겨 두었다가, 누를 때 메일 서버에서 그 파일만 받아와 흘려보낸다.
 * (받아오는 함수는 예전부터 있었는데 부르는 곳이 없어서, 화면에는
 *  파일 이름만 뜨고 받을 방법이 없었다.)
 *
 * ── 조심할 것 ──
 * ① 계정을 **정확히** 찾는다. 기본 계정으로 대신 열면 같은 UID 의 **다른 메일**
 *    첨부가 내려간다 — 조용히 틀린 파일을 주는 것이 가장 나쁘다.
 * ② 브라우저에서 바로 열기(inline)는 이미지·PDF 만 허락한다. HTML·SVG 첨부를
 *    우리 주소에서 열면 그 안의 스크립트가 로그인된 화면 권한으로 돈다.
 *    피싱 메일 첨부가 실제로 들어오므로 나머지는 무조건 내려받기로만 준다.
 * ③ 로그인 확인은 proxy.ts 가 /api 전체에 걸고 있다.
 *    다만 "누구 메일인가" 는 여기서 본다 — 남의 계정 메일이면 메일 서버에 접속하기 전에 막는다.
 */
const INLINE_SAFE = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
]);

/** 헤더에 넣을 파일 이름 — 한글 이름은 filename* 로, 옛 브라우저용 ASCII 이름도 함께 */
function contentDisposition(kind: 'attachment' | 'inline', filename: string): string {
  const safe = String(filename || 'attachment').replace(/[\r\n"\\]/g, '_');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_') || 'attachment';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/**
 * 이 메일을 받은 **바로 그 메일함**의 접속 정보를 찾는다.
 *
 * UID 는 메일함마다 따로 매겨진다. 다른 계정의 메일함을 열면 같은 번호의
 * **엉뚱한 메일**이 나오고, 그 메일의 첨부가 조용히 내려간다.
 *
 * accountId 는 두 가지 모양으로 저장돼 있다.
 *   · MailAccount 의 _id (계정을 여러 개 등록한 뒤 수집된 메일)
 *   · 'main' (그 전, 수신 설정(MailSettings) 하나로 수집하던 시절의 메일)
 * 'main' 메일은 **당시 수신 설정의 주소**가 받은 메일이다. 기본 계정이 아니다 —
 * 실제로 기본 계정은 david@ 인데 'main' 메일 20통은 fe@ 메일함에서 왔다.
 * 그래서 설정에 적힌 주소와 같은 계정을 찾고, 없으면 설정의 접속 정보를 그대로 쓴다.
 *
 * sessionUser — 로그인한 아이디. 계정은 **그 사람 몫(ownerFilter) 안에서만** 찾는다.
 * 주소가 같다고 다른 아이디가 등록한 계정의 비밀번호로 메일함을 열면 안 된다.
 *
 * 같은 주소를 여러 아이디가 등록하면 메일은 먼저 모은 계정 id 에 붙는다 (lib/mail/scope.ts).
 * 그 메일은 내 범위에 들지만 계정 주인은 남이라 위 조회가 비어 첨부를 못 받았다.
 * 그때는 남의 계정에서 **주소·서버만** 읽어, 같은 메일함을 가리키는 **내 계정**의 비밀번호로 연다.
 */
async function resolveMailbox(
  accountId: string | undefined,
  folder: string,
  sessionUser: string,
): Promise<{ settings: ImapConfig } | { error: string }> {
  const id = String(accountId || '');
  const mine = ownerFilter(sessionUser);

  if (/^[a-f0-9]{24}$/i.test(id)) {
    const account = await MailAccount.findOne({ _id: id, ...mine }).lean();
    if (account) return { settings: toImapConfig(account, folder) };

    // 같은 메일함을 다른 아이디가 먼저 등록해 그 계정 id 로 모인 메일.
    // 비밀번호(smtpPassEnc)는 아예 읽지 않는다 — 주소와 서버만 있으면 내 계정을 찾을 수 있다
    const other: any = await MailAccount.findById(id, { smtpUser: 1, smtpHost: 1 }).lean();
    const addr = String(other?.smtpUser || '').trim().toLowerCase();
    const host = String(other?.smtpHost || '').trim().toLowerCase();
    if (!addr) return { error: '이 메일을 받은 메일 계정이 삭제되어 첨부파일을 받을 수 없습니다.' };

    // 주소만 같고 서버가 다르면 다른 메일함이다 — UID 가 달라 엉뚱한 첨부가 나가므로 서버까지 맞춘다
    const own: any[] = await MailAccount.find(mine).lean();
    const same = own
      .filter((a) => String(a.smtpUser || '').trim().toLowerCase() === addr
        && String(a.smtpHost || '').trim().toLowerCase() === host)
      // 꺼 둔 계정보다 쓰고 있는 계정을 먼저 (비밀번호가 최신일 가능성이 높다)
      .sort((a, b) => Number(b.isActive !== false) - Number(a.isActive !== false))[0];
    if (!same) return { error: '이 메일함을 내 메일 계정으로 등록하지 않아 첨부파일을 받을 수 없습니다.' };
    return { settings: toImapConfig(same, folder) };
  }

  // 'main' 또는 비어 있음 — 예전 수신 설정으로 받은 메일
  // 옛 메일은 마스터 몫이다. 일반 아이디가 회사 수신 설정의 비밀번호로 메일함을 열 일은 없다
  if (!isMasterUser(sessionUser)) return { error: '이 메일을 받은 메일함 정보를 찾을 수 없습니다.' };
  const legacy: any = await getMailSettings();
  const user = String(legacy?.imapUser || '').toLowerCase();
  if (!user) return { error: '이 메일을 받은 메일함 정보를 찾을 수 없습니다.' };

  // 계정은 몇 개 되지 않는다 — 대소문자만 무시하고 주소로 맞춘다 (정규식 이스케이프 실수 여지를 없앤다)
  // 'main' 메일은 마스터 몫이므로 마스터 계정들 중에서만 찾는다 (남의 아이디 계정으로 대신 열지 않는다)
  const all: any[] = await MailAccount.find(mine).lean();
  const same = all.find((a) => String(a.smtpUser || '').toLowerCase() === user);
  if (same) return { settings: toImapConfig(same, folder) };

  if (!legacy.imapPass) return { error: `${user} 메일함의 비밀번호가 없어 첨부파일을 받을 수 없습니다.` };
  return {
    settings: {
      imapHost: legacy.imapHost, imapPort: legacy.imapPort, imapSecure: legacy.imapSecure !== false,
      imapUser: legacy.imapUser, imapPass: legacy.imapPass, imapFolder: folder,
    },
  };
}

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const attId = url.searchParams.get('att') || '';
    // ⚠️ i 가 없을 때 Number(null) 은 0 이다. 그대로 쓰면 "없는 첨부" 요청이
    //    첫 번째 첨부로 바뀌어 **엉뚱한 파일이 조용히 내려간다** (검증에서 잡혔다).
    //    i 는 값이 실제로 왔을 때만 숫자로 읽는다.
    const iRaw = url.searchParams.get('i');
    const idx = iRaw !== null && /^\d+$/.test(iRaw) ? Number(iRaw) : -1;
    const wantInline = url.searchParams.get('inline') === '1';

    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // 범위 조건을 조회에 바로 건다 — 없는 메일과 남의 메일이 **똑같은** 404 가 되어야
    // 응답 차이로 "그 id 의 메일이 있다" 는 것을 알아낼 수 없다
    const mail: any = await InboundMail.findOne({ _id: id, ...mailFilter(scope) }, {
      subject: 1, uid: 1, folder: 1, accountId: 1, attachments: 1,
    }).lean();
    if (!mail) return NextResponse.json(NOT_YOURS, { status: 404 });

    // 화면에 보여준 목록과 같은 기준으로 고른다 (본문 삽입 이미지는 목록에서 뺐다)
    const list = (mail.attachments || []).filter((a: any) => !a.inline);
    // att 를 줬으면 **그것만** 찾는다. 못 찾았다고 순번으로 대신하지 않는다.
    const att = attId
      ? list.find((a: any) => String(a._id) === attId) || null
      : (idx >= 0 ? list[idx] || null : null);
    if (!att) return fail(404, '첨부파일을 찾을 수 없습니다.');

    if (!mail.uid || !mail.folder || !att.partId) {
      return fail(409, '이 첨부파일은 위치 정보가 없어 받을 수 없습니다. 이카운트 웹메일에서 내려받으세요.');
    }

    // ① 계정은 정확히 — 추측으로 다른 계정을 열지 않는다
    const resolved = await resolveMailbox(mail.accountId, mail.folder, scope.user);
    if ('error' in resolved) return fail(409, resolved.error);
    const settings = resolved.settings;
    const { stream } = await openAttachmentStream(settings, {
      folder: mail.folder,
      uid: Number(mail.uid),
      partId: String(att.partId),
    });

    const type = String(att.contentType || 'application/octet-stream').toLowerCase();
    // ② 바로 열기는 안전한 형식만
    const inline = wantInline && INLINE_SAFE.has(type);

    const headers: Record<string, string> = {
      'Content-Type': inline ? type : (type || 'application/octet-stream'),
      'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', att.filename),
      'X-Content-Type-Options': 'nosniff',
      // 받은 파일은 개인 업무 자료다 — 중간 캐시에 남기지 않는다
      'Cache-Control': 'private, no-store',
    };
    if (inline) headers['Content-Security-Policy'] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
    // 크기를 알면 브라우저가 진행률을 보여준다. 저장된 값은 디코딩 후 크기라 그대로 쓸 수 있다.
    if (att.size) headers['X-Attachment-Size'] = String(att.size);

    return new Response(stream, { status: 200, headers });
  } catch (e: any) {
    const msg = String(e?.message || e);
    // 메일 서버에서 원본이 지워진 경우 — 사람이 알아들을 말로
    if (/Mailbox doesn't exist|NONEXISTENT|not found|찾지 못했/i.test(msg)) {
      return fail(410, '메일 서버에 원본이 없어 받을 수 없습니다. 이카운트 웹메일에서 메일이 지워졌거나 폴더가 바뀌었을 수 있습니다.');
    }
    return fail(500, `첨부파일을 받지 못했습니다: ${msg}`);
  }
}
