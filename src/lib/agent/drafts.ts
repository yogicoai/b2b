/**
 * 승인 대기 초안 — AI 에이전트가 넣고, 사람이 회신 상자에서 확인하고 보낸다 (models/AgentDraft.ts).
 *
 * 여기에는 **보내는 함수가 없다.** 발송은 회신 상자의 [보내기](/api/mail/reply) 하나로만 나가고,
 * 그쪽이 agentDraftId 를 넘기면 markAgentDraftSent() 로 '발송 완료' 를 찍을 뿐이다.
 */
import { AgentDraft } from '@/models/AgentDraft';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import type { MailScope } from '@/lib/mail/scope';
import { parseAddressList } from '@/lib/mail/addresses';
import type { PublicAgentKey } from './keys';

export const DRAFT_STATUS_LABELS: Record<string, string> = {
  pending: '승인 대기',
  sent: '발송 완료',
  discarded: '버림',
};

const LIMITS = { subject: 500, body: 50_000, notes: 2_000, cc: 20, client: 60 };

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

/** 주소 목록 정리 — 회신 상자와 같은 함수 (lib/mail/addresses.ts) */
export const normalizeAddresses = (v: unknown, opts: { max?: number; field?: string } = {}) =>
  parseAddressList(v, { max: opts.max ?? LIMITS.cc, field: opts.field });

/**
 * 이 메일에 회신하면 받는 사람 — lib/mail/compose-reply.ts 와 같은 규칙.
 * 받은 메일이면 보낸 사람, 우리가 보낸 메일에서 이어 쓰면 그 메일의 받는 사람(상대).
 */
export function replyRecipientOf(mail: any): string {
  const addr = mail?.direction === 'out'
    ? ((mail.to || []).find((t: any) => t?.address && !/@yogico\.kr$/i.test(t.address)) || (mail.to || [])[0])?.address
    : mail?.from?.address;
  return String(addr || '').trim().toLowerCase();
}

export function defaultReplySubject(mail: any): string {
  const s = String(mail?.subject || '').trim();
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/** 화면·에이전트 공통 모양 */
export function publicDraft(d: any, { withBody = true } = {}) {
  if (!d) return null;
  return {
    id: String(d._id),
    inboundMailId: d.inboundMailId,
    leadId: d.leadId || null,
    status: d.status,
    statusLabel: DRAFT_STATUS_LABELS[d.status] || d.status,
    to: d.to,
    cc: d.cc || '',
    subject: d.subject,
    ...(withBody ? { body: d.body } : { bodyPreview: String(d.body || '').slice(0, 200) }),
    notes: d.notes || '',
    agent: {
      keyId: d.agent?.keyId || null,
      keyName: d.agent?.keyName || '',
      tool: d.agent?.tool || '',
      toolLabel: d.agent?.toolLabel || 'AI',
      client: d.agent?.client || null,
    },
    owner: d.owner,
    revision: d.revision || 1,
    mail: {
      subject: d.mail?.subject || '',
      from: { name: d.mail?.from?.name || '', address: d.mail?.from?.address || '' },
      date: d.mail?.date || null,
      company: d.mail?.company || '',
      group: d.mail?.group || '',
    },
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    sentAt: d.sentAt || null,
    sentTo: d.sentTo || null,
    editedBeforeSend: d.editedBeforeSend ?? null,
    discardedAt: d.discardedAt || null,
  };
}

/**
 * 누가 어떤 초안을 볼 수 있는가 — 초안에는 원 메일의 제목·상대 주소가 들어 있으므로
 * 메일과 같은 규칙을 따른다: 그 메일을 받은 계정을 볼 수 있거나, 자기 키로 넣은 것.
 */
export function draftVisibleFilter(scope: MailScope): Record<string, any> {
  return { $or: [{ owner: scope.user }, { accountId: { $in: scope.accountIds } }] };
}

/**
 * 에이전트 초안 저장 → '승인 대기'.
 *
 * 같은 키가 같은 메일에 승인 대기 초안을 이미 넣어 두었으면 **새로 쌓지 않고 고친다.**
 * 아침 자동 실행이 매일 같은 미답 메일에 초안을 하나씩 더 얹으면 승인 대기가
 * 같은 건으로 가득 차서 무엇을 봐야 할지 알 수 없게 된다.
 */
export async function saveAgentDraft(
  { mail, key, to, cc, subject, body, notes, client }:
  { mail: any; key: PublicAgentKey; to?: unknown; cc?: unknown; subject?: unknown; body?: unknown; notes?: unknown; client?: unknown },
) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) throw httpError('본문(body)이 비어 있습니다.');
  if (text.length > LIMITS.body) throw httpError(`본문은 ${LIMITS.body.toLocaleString()}자까지입니다.`);

  // 받는 사람은 이 앱의 회신 규칙(원래 보낸 사람)으로 정해진다. 다른 사람에게도 보내려면 참조로.
  const recipient = replyRecipientOf(mail);
  if (!recipient) throw httpError('이 메일은 회신할 주소를 찾을 수 없습니다.');
  if (to !== undefined && to !== null && String(to).trim()) {
    const wanted = normalizeAddresses(to, { max: 1, field: '받는 사람(to)' });
    if (wanted !== recipient) {
      throw httpError(`답장은 원래 보낸 사람(${recipient})에게만 갑니다. 다른 사람은 참조(cc)로 넣어 주세요.`);
    }
  }
  const ccStr = cc ? normalizeAddresses(cc, { field: '참조(cc)' }) : '';

  const subj = String(subject ?? '').trim() || defaultReplySubject(mail);
  if (subj.length > LIMITS.subject) throw httpError(`제목은 ${LIMITS.subject}자까지입니다.`);
  const notesStr = String(notes ?? '').trim().slice(0, LIMITS.notes);
  const clientStr = String(client ?? '').trim().slice(0, LIMITS.client);

  const existing: any = await AgentDraft.findOneAndUpdate(
    { inboundMailId: String(mail._id), status: 'pending', 'agent.keyId': key.id },
    {
      $set: { to: recipient, cc: ccStr, subject: subj, body: text, notes: notesStr, 'agent.client': clientStr },
      $inc: { revision: 1 },
    },
    { new: true },
  ).lean();
  if (existing) return { draft: publicDraft(existing), replaced: true };

  let company = '';
  if (mail.leadId) {
    const lead: any = await Lead.findOne({ leadId: mail.leadId }, { Company: 1 }).lean();
    company = lead?.Company || '';
  }

  const doc: any = await AgentDraft.create({
    inboundMailId: String(mail._id),
    accountId: String(mail.accountId || ''),
    leadId: mail.leadId || '',
    threadKey: mail.threadKey || '',
    owner: key.owner,
    mail: {
      subject: mail.subject || '',
      from: { name: mail.from?.name || '', address: mail.from?.address || '' },
      date: mail.date || null,
      company,
      group: mail.group || '',
    },
    to: recipient,
    cc: ccStr,
    subject: subj,
    body: text,
    notes: notesStr,
    agent: { keyId: key.id, keyName: key.name, tool: key.tool, toolLabel: key.toolLabel, client: clientStr },
    status: 'pending',
    revision: 1,
  });
  return { draft: publicDraft(doc.toObject()), replaced: false };
}

/**
 * 목록. 원 메일의 지금 상태(답변완료·휴지통)를 함께 붙인다 —
 * 웹메일에서 이미 답한 건의 AI 초안을 또 보내는 일을 막으려면 그게 보여야 한다.
 */
export async function listAgentDrafts(
  scope: MailScope,
  { status = 'pending', inboundMailId, keyId, limit = 200, withBody = false }:
  { status?: string; inboundMailId?: string; keyId?: string; limit?: number; withBody?: boolean } = {},
) {
  const q: Record<string, any> = { ...draftVisibleFilter(scope) };
  if (status && status !== 'all') q.status = { $in: String(status).split(',') };
  if (inboundMailId) q.inboundMailId = String(inboundMailId);
  if (keyId) q['agent.keyId'] = String(keyId);

  const rows: any[] = await AgentDraft.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 200, 500)).lean();
  if (!rows.length) return [];

  const ids = Array.from(new Set(rows.map((r) => r.inboundMailId))).filter((x) => /^[0-9a-f]{24}$/i.test(x));
  const live: any[] = ids.length
    ? await InboundMail.find({ _id: { $in: ids } }, { status: 1, repliedAt: 1, repliedOutside: 1, trashedAt: 1 }).lean()
    : [];
  const byId = new Map(live.map((m) => [String(m._id), m]));

  return rows.map((r) => {
    const m = byId.get(r.inboundMailId);
    return {
      ...publicDraft(r, { withBody }),
      mailNow: m
        ? { status: m.status, repliedAt: m.repliedAt || null, repliedOutside: Boolean(m.repliedOutside), trashed: Boolean(m.trashedAt) }
        : { missing: true },
    };
  });
}

export async function countPendingDrafts(scope: MailScope): Promise<number> {
  return AgentDraft.countDocuments({ ...draftVisibleFilter(scope), status: 'pending' });
}

export async function getAgentDraft(scope: MailScope, id: string) {
  if (!/^[0-9a-f]{24}$/i.test(String(id))) return null;
  return AgentDraft.findOne({ _id: id, ...draftVisibleFilter(scope) }).lean();
}

/** 버리기 · 되살리기 — 사람만 한다(쿠키 API). 에이전트 키로는 이 길이 없다 */
export async function setAgentDraftStatus(scope: MailScope, id: string, status: unknown) {
  if (status !== 'pending' && status !== 'discarded') throw httpError('바꿀 수 없는 상태입니다.');
  if (!/^[0-9a-f]{24}$/i.test(String(id))) throw httpError('초안을 찾을 수 없습니다.', 404);
  const now = new Date();
  const r: any = await AgentDraft.findOneAndUpdate(
    // 이미 보낸 것은 되돌릴 수 없다
    { _id: id, ...draftVisibleFilter(scope), status: { $ne: 'sent' } },
    status === 'discarded'
      ? { $set: { status, discardedAt: now, discardedBy: scope.user } }
      : { $set: { status, discardedAt: null, discardedBy: '' } },
    { new: true },
  ).lean();
  if (!r) throw httpError('초안을 찾을 수 없거나 이미 발송한 초안입니다.', 404);
  return publicDraft(r);
}

/** HTML 을 비교용 평문으로 — 회신 상자는 서식 편집기라 본문이 HTML 로 온다 */
function plainOf(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 발송 완료 표시 — /api/mail/reply 가 **실제로 보낸 뒤에만** 부른다(DRY RUN 은 제외).
 * 사람이 고쳐서 보냈는지도 남긴다. 초안 품질을 되짚을 때 쓴다.
 */
export async function markAgentDraftSent(
  scope: MailScope,
  id: string,
  { inboundMailId, sentAt, to, messageId, subject, body, bodyIsHtml }:
  { inboundMailId: string; sentAt: Date; to: string; messageId?: string; subject: string; body: string; bodyIsHtml?: boolean },
) {
  const d: any = await getAgentDraft(scope, id);
  if (!d || d.status !== 'pending' || d.inboundMailId !== String(inboundMailId)) return null;
  const sentPlain = bodyIsHtml ? plainOf(body) : String(body || '').replace(/\s+/g, ' ').trim();
  const draftPlain = String(d.body || '').replace(/\s+/g, ' ').trim();
  const edited = String(d.subject || '').trim() !== String(subject || '').trim() || draftPlain !== sentPlain;
  await AgentDraft.updateOne(
    { _id: d._id, status: 'pending' },
    { $set: { status: 'sent', sentAt, sentTo: to, sentMessageId: messageId || '', editedBeforeSend: edited } },
  );
  return { edited, agent: d.agent };
}
