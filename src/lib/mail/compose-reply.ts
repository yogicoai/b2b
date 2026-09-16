import { InboundMail } from '@/models/InboundMail';
import { MailAccount } from '@/models/MailAccount';
import { canUseAccount, NOT_YOURS, type MailScope } from './scope';
import { resolveOutreachAccount } from './accounts';
import { buildSignatureBlock } from '@/lib/template-vars';

/**
 * 답장 한 통을 **조립한다** — 보내기(POST /api/mail/reply)와 미리보기(POST /api/mail/reply/preview)가 같이 쓴다.
 *
 * ── 왜 한 곳에 두나 ──
 * 받는 사람·제목(Re: 중복 방지)·보내는 계정·서명·본문 서식을 두 군데서 따로 만들면, 한쪽만 고쳐졌을 때
 * "미리보기엔 이렇게 보였는데 실제로는 다르게 나갔다" 가 된다. 미리보기가 믿을 수 있으려면
 * 실제로 보내는 코드와 **글자 하나까지 같은 과정**을 거쳐야 한다.
 *
 * 여기서는 메일을 보내지 않고, DB 에도 쓰지 않는다. 비밀번호도 풀지 않는다(미리보기에는 필요 없다).
 */

export interface ReplyInput {
  inboundMailId?: string;
  body?: string;
  subject?: string;
  mailAccountId?: string;
  appendSignature?: boolean;
  bodyIsHtml?: boolean;
}

export interface ComposedReply {
  mail: any;
  account: any;
  to: string;
  subject: string;
  from: { name: string; address: string };
  html: string;
  text: string;
  /** 본문 원문 (이력 기록용) */
  bodySource: string;
  headers: Record<string, string>;
  threaded: boolean;
  signatureAppended: boolean;
}

export type ComposeResult =
  | { ok: true; reply: ComposedReply }
  | { ok: false; status: number; payload: { success: false; error: string } };

const fail = (status: number, error: string): ComposeResult => ({ ok: false, status, payload: { success: false, error } });

/**
 * 답장을 **어느 계정으로** 보낼지 고른다.
 * 1) 화면이 고른 계정(내 것만)  2) 이 메일을 받은 계정 — 상대 메일함에서 같은 주소로 대화가 이어진다
 * 3) 내 기본 계정.  남의 계정으로는 보내지 않는다.
 */
export async function pickReplyAccount(scope: MailScope, mail: any, mailAccountId?: string): Promise<{ account: any; error?: string }> {
  if (mailAccountId) {
    const account = (await resolveOutreachAccount(String(mailAccountId), scope.user)).account;
    return account ? { account } : { account: null, error: '고른 보내는 계정을 쓸 수 없습니다' };
  }
  let account: any = null;
  if (/^[0-9a-f]{24}$/i.test(String(mail?.accountId || ''))) {
    account = await MailAccount.findOne({ _id: mail.accountId, isActive: { $ne: false } }).lean();
  }
  if (!account) account = (await resolveOutreachAccount(undefined, scope.user)).account;
  return account ? { account } : { account: null, error: '발송할 메일 계정이 없습니다. 설정에서 등록하세요.' };
}

export async function composeReply(scope: MailScope, input: ReplyInput): Promise<ComposeResult> {
  const inboundMailId = String(input?.inboundMailId || '').trim();
  const source = String(input?.body || '').trim();
  if (!inboundMailId) return fail(400, 'inboundMailId 필요');
  if (!source) return fail(400, '본문이 비어 있습니다');

  const mail: any = await InboundMail.findById(inboundMailId).lean();
  if (!mail) return fail(404, '원본 메일을 찾을 수 없습니다');
  // 내 메일함에 온 메일에만 답할 수 있다 (아이디별 메일 분리 — lib/mail/scope.ts)
  // 남의 메일은 없는 메일과 똑같이 404 — 응답이 다르면 그런 메일이 있다는 게 드러난다
  if (!canUseAccount(scope, mail.accountId)) return { ok: false, status: 404, payload: NOT_YOURS as any };

  // 받은 메일에 답하면 보낸 사람에게, **우리가 보낸 메일**에서 이어서 보내면 그 메일의 받는 사람(상대)에게 간다.
  // 보낸 메일의 from 은 우리 주소라, 그대로 쓰면 우리 자신에게 답장이 간다.
  const to = mail.direction === 'out'
    ? ((mail.to || []).find((t: any) => t?.address && !/@yogico\.kr$/i.test(t.address)) || (mail.to || [])[0])?.address
    : mail.from?.address;
  if (!to) return fail(400, '받을 주소를 찾을 수 없습니다');

  const picked = await pickReplyAccount(scope, mail, input?.mailAccountId);
  const account: any = picked.account;
  if (!account) return fail(400, picked.error || '발송할 메일 계정이 없습니다');

  // ── 제목: 이미 Re: 가 붙어 있으면 겹쳐 붙이지 않는다 ──
  const originalSubject = String(mail.subject || '').trim();
  const subject = String(input?.subject || '').trim()
    || (/^re\s*:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`);

  // ── 서명 ──
  // 계정 문서를 그대로 넘긴다 — SenderProfile 이 MailAccount 필드명을 쓴다
  // (fromName · senderTitle · senderPhone · senderCompany · senderAddress · senderWebsite)
  const appendSignature = input?.appendSignature !== false;
  const sigHtml = appendSignature ? buildSignatureBlock(account, { html: true }) : '';
  const sigText = appendSignature ? buildSignatureBlock(account, { html: false }) : '';

  // 회신 상자가 서식 편집기(contenteditable)면 본문이 이미 HTML 이다.
  // 그때도 escapeHtml 을 태우면 상대에게 <b>…</b> 가 글자 그대로 보인다.
  // 반대로 평문을 그냥 넣으면 줄바꿈이 사라지므로 pre-wrap 으로 감싼다.
  const bodyIsHtml = input?.bodyIsHtml === true;
  const inner = bodyIsHtml ? source : `<div style="white-space:pre-wrap">${escapeHtml(source)}</div>`;
  const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${inner}</div>${sigHtml}`;
  // 평문 대체본 — HTML 을 못 읽는 클라이언트용. 태그를 걷어내고 줄바꿈만 남긴다.
  const plain = bodyIsHtml
    ? source.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '').trim()
    : source;

  // ── 스레드 헤더 ──
  // References 는 기존 체인 + 원문 Message-ID 순서. 상대 메일 클라이언트가 이걸 보고 같은 대화로 묶는다.
  const originalMsgId = String(mail.messageId || '').trim();
  const refs = [...(mail.references || []), originalMsgId].filter(Boolean);
  const headers: Record<string, string> = {};
  if (originalMsgId) {
    headers['In-Reply-To'] = originalMsgId;
    headers['References'] = refs.join(' ');
  }

  return {
    ok: true,
    reply: {
      mail,
      account,
      to,
      subject,
      from: { name: account.fromName || '', address: account.fromAddress || account.smtpUser },
      html,
      text: sigText ? `${plain}\n\n${sigText}` : plain,
      bodySource: source,
      headers,
      threaded: Boolean(originalMsgId),
      signatureAppended: Boolean(sigHtml),
    },
  };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
