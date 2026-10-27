/**
 * AI 에이전트용 기능 — REST(/api/agent/v1/*)와 MCP(/api/mcp)가 **같은 함수**를 쓴다 (2026-10-27).
 *
 * 그래서 Claude·Codex 가 MCP 로 보는 것과 아침 자동 실행이 REST 로 받는 것이 글자 하나 다르지 않다.
 * 기능을 고칠 때는 여기만 고치면 된다.
 *
 * ── 범위 ──
 * 모든 조회는 **키를 발급한 아이디의 메일 범위**(lib/mail/scope.ts mailFilter)로 좁힌다.
 * 키가 있다고 남의 메일함이 열리면 안 된다. 회신 상자와 같은 이유로 리드 예외(남의 계정에 온
 * 리드 답장도 보이는 것)는 여기서 쓰지 않는다 — 그 메일에는 어차피 답장을 넣을 수 없다.
 *
 * ── 하지 않는 것 ──
 * 발송·삭제·상태 변경·설정 함수는 일부러 이 파일에서 부르지 않는다. 초안 저장이 유일한 쓰기다.
 */
import { simpleParser } from 'mailparser';
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { AgentDraft } from '@/models/AgentDraft';
import { getMailScopeFor, mailFilter, canUseAccount, type MailScope } from '@/lib/mail/scope';
import { resolveAccount, toImapConfig } from '@/lib/mail/accounts';
import { listSentSince } from '@/lib/mail/imap';
import { loadMailBody } from '@/lib/mail/body';
import { stripQuoted, stripQuotedForDisplay } from '@/lib/mail/quoted';
import { buildBriefing, renderBriefingHtml } from '@/lib/mail/briefing';
import { getMailSettings } from '@/lib/mail-settings';
import { STAGE_LABEL_KO, isStage } from '@/lib/stages';
import type { PublicAgentKey } from './keys';
import { saveAgentDraft, listAgentDrafts as listDraftsInScope } from './drafts';

/** 상태 코드를 함께 싣는 오류 — REST 는 그대로 HTTP 상태로, MCP 는 isError 로 돌려준다 */
export class AgentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface AgentCtx {
  key: PublicAgentKey;
  baseUrl: string;
}

const PREVIEW_CHARS = 2000;
const THREAD_BODY_CHARS = 4000;
const MAIL_BODY_CHARS = 20000;

// as const — string[] 로 추론되면 classification union 타입과 맞지 않는다 (briefing.ts 와 같은 이유)
const NOISE = ['ad', 'system', 'newsletter'] as const;

const CLASS_LABELS: Record<string, string> = {
  b2b: 'B2B 거래', inquiry: '문의·견적', partner: '제휴·협업', newsletter: '뉴스레터',
  ad: '광고', system: '자동발송', unknown: '미분류',
};
const STATUS_LABELS: Record<string, string> = {
  new: '신규', reviewing: '확인중', replied: '답변완료', archived: '검토 완료', ignored: '무시',
};
const URGENCY_LABELS: Record<string, string> = { high: '높음', mid: '보통', low: '낮음' };

/**
 * 스레드 ID — 내부 스레드 키(정규화 제목 + 거래처)는 공백·한글이 섞여 주소에 넣기 불편하다.
 * 그대로 base64url 로 감싸 't_' 를 붙인다. 되풀면 원래 키가 나온다.
 */
export const threadIdOf = (key?: string | null) => (key ? `t_${Buffer.from(String(key), 'utf8').toString('base64url')}` : null);
function threadKeyOf(threadId: string): string | null {
  try {
    const k = Buffer.from(String(threadId).slice(2), 'base64url').toString('utf8');
    return k || null;
  } catch {
    return null;
  }
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function requireId(id: unknown, what = '메일 ID'): string {
  const s = String(id ?? '').trim();
  if (!/^[0-9a-f]{24}$/i.test(s)) throw new AgentError(`${what} 형식이 아닙니다 (24자리 영숫자): ${s.slice(0, 40)}`, 400);
  return s;
}

const iso = (d: any) => (d ? new Date(d).toISOString() : null);
const addrs = (list: any[] | undefined) => (list || []).map((a) => ({ name: a?.name || '', address: a?.address || '' }));
const files = (list: any[] | undefined) => (list || []).map((a) => ({
  filename: a.filename, size: a.size || 0, contentType: a.contentType || null,
}));

function cutText(text: unknown, n: number) {
  const t = String(text || '').trim();
  return { text: t.length > n ? t.slice(0, n) : t, truncated: t.length > n };
}

/** 사람이 열어 볼 주소 — 화면(public/agent-screens.js)이 ?mail= · ?agentDraft= 를 읽어 바로 연다 */
const mailUrl = (baseUrl: string, id: string) => (baseUrl ? `${baseUrl}/?mail=${id}` : null);
const draftUrl = (baseUrl: string, id: string) => (baseUrl ? `${baseUrl}/?agentDraft=${id}` : null);

function importanceOf(a: any = {}) {
  return {
    needsReply: Boolean(a?.needsReply),
    urgency: a?.urgency || null,
    urgencyLabel: a?.urgency ? URGENCY_LABELS[a.urgency] || a.urgency : null,
    deadline: iso(a?.deadline),
    deadlineText: a?.deadlineText || null,
    deadlineType: a?.deadlineType || null,
  };
}

function analysisOf(a: any) {
  if (!a || !a.method) return null;
  return {
    method: a.method,          // 'ai' = AI 분석, 'local' = 규칙 1차 분석(요약 없음)
    topic: a.topic || null,
    summary: a.summary || null,
    keyPoints: a.keyPoints || [],
    intent: a.intent || null,
    suggestedAction: a.suggestedAction || null,
    replyReason: a.replyReason || null,
  };
}

async function companyMap(leadIds: string[]) {
  const ids = Array.from(new Set(leadIds.filter(Boolean)));
  const map = new Map<string, { company: string; stage: string }>();
  if (!ids.length) return map;
  const rows: any[] = await Lead.find({ leadId: { $in: ids } }, { leadId: 1, Company: 1, stage: 1 }).lean();
  for (const l of rows) map.set(l.leadId, { company: l.Company || '', stage: l.stage || '' });
  return map;
}

const scopeOf = (ctx: AgentCtx): Promise<MailScope> => getMailScopeFor(ctx.key.owner);

/* ────────────────────────────── 읽기 ────────────────────────────── */

/**
 * 답장 필요 목록 — 답장이 필요한데 아직 처리하지 않은 받은 메일(최신순).
 * 받은 메일함의 [회신 필요]와 같은 기준이다 (analysis.needsReply · 신규/확인중 · 광고·자동발송 제외).
 * 본문은 인용된 앞 대화를 걷어낸 '이번에 새로 쓴 부분' 앞 2,000자다.
 */
export async function listReplyNeeded({ days, limit }: { days?: unknown; limit?: unknown }, ctx: AgentCtx) {
  const d = clampInt(days, 30, 1, 365);
  const n = clampInt(limit, 50, 1, 200);
  const scope = await scopeOf(ctx);
  const rows: any[] = await InboundMail.find(
    {
      ...mailFilter(scope),
      direction: 'in',
      trashedAt: null,
      classification: { $nin: NOISE },
      'analysis.needsReply': true,
      status: { $in: ['new', 'reviewing'] },
      date: { $gte: new Date(Date.now() - d * 86400000) },
    },
    {
      subject: 1, from: 1, to: 1, cc: 1, date: 1, lang: 1, status: 1, classification: 1,
      group: 1, leadId: 1, threadKey: 1, accountId: 1, attachments: 1, bodyStripped: 1, 'raw.text': 1,
      'translation.subject': 1, analysis: 1,
    },
  ).sort({ date: -1 }).limit(n).lean();

  const leads = await companyMap(rows.map((m) => m.leadId));
  const pending: any[] = rows.length
    ? await AgentDraft.find({ status: 'pending', inboundMailId: { $in: rows.map((m) => String(m._id)) } }, { inboundMailId: 1 }).lean()
    : [];
  const hasDraft = new Set(pending.map((p) => p.inboundMailId));

  const items = rows.map((m) => {
    const id = String(m._id);
    const body = cutText(m.bodyStripped || stripQuoted(m.raw?.text || ''), PREVIEW_CHARS);
    const lead = m.leadId ? leads.get(m.leadId) : null;
    return {
      id,
      threadId: threadIdOf(m.threadKey),
      from: { name: m.from?.name || '', address: m.from?.address || '' },
      company: lead?.company || m.group || null,
      leadId: m.leadId || null,
      leadStage: lead?.stage || null,
      to: addrs(m.to),
      cc: addrs(m.cc),
      subject: m.subject || '',
      subjectKo: m.translation?.subject || null,
      receivedAt: iso(m.date),
      lang: m.lang || null,
      bodyPreview: body.text,
      bodyTruncated: body.truncated,
      attachments: files(m.attachments),
      classification: m.classification,
      classificationLabel: CLASS_LABELS[m.classification] || m.classification,
      importance: importanceOf(m.analysis),
      analysis: analysisOf(m.analysis),
      status: m.status,
      statusLabel: STATUS_LABELS[m.status] || m.status,
      hasPendingDraft: hasDraft.has(id),
      url: mailUrl(ctx.baseUrl, id),
    };
  });
  return { days: d, count: items.length, items };
}

/**
 * 오늘의 브리핑 — 매일 아침 메일로 나가는 것과 같은 계산(lib/mail/briefing.ts).
 * 범위만 키 주인의 메일로 좁힌다. html 이 메일 본문 그대로다.
 */
export async function getTodayBriefing({ days }: { days?: unknown }, ctx: AgentCtx) {
  const settings: any = await getMailSettings();
  const n = clampInt(days, Number(settings?.briefingDays) || 1, 1, 14);
  const scope = await scopeOf(ctx);
  const b = await buildBriefing(n, mailFilter(scope));
  const dateLabel = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' });
  const withUrl = (x: any) => ({ ...x, url: mailUrl(ctx.baseUrl, x.id) });
  return {
    since: iso(b.since),
    until: iso(b.until),
    days: n,
    subject: `[Yogico] 오늘의 브리핑 ${dateLabel} · 회신필요 ${b.totals.needsReply}건`
      + (b.newReplies.length ? ` · 새 답장 ${b.newReplies.length}건` : ''),
    newMails: b.newMails,
    totals: b.totals,
    periodLabel: b.periodLabel,
    needsReply: b.needsReply.map(withUrl),
    deadlinesSoon: b.deadlinesSoon.map(withUrl),
    newReplies: b.newReplies,
    stages: b.stages,
    html: renderBriefingHtml(b, ctx.baseUrl),
  };
}

/**
 * 보낸 메일 — 말투 학습용. 이카운트 보낸메일함에서 그 자리에서 읽는다(DB 에 쌓지 않는 구조라서).
 * 본문은 인용된 상대 메일을 걷어낸 '우리가 쓴 부분' 4,000자까지.
 */
export async function listSentMails(
  { days, limit, page, accountId }: { days?: unknown; limit?: unknown; page?: unknown; accountId?: unknown },
  ctx: AgentCtx,
) {
  const d = clampInt(days, 60, 1, 365);
  const n = clampInt(limit, 30, 1, 50);
  const p = clampInt(page, 1, 1, 1000);
  const account: any = await resolveAccount(String(accountId || 'default'), ctx.key.owner);
  if (!account) {
    throw new AgentError(accountId
      ? '그 메일 계정을 쓸 수 없습니다 (키 주인이 등록한 계정만).'
      : '키 주인 아이디로 등록한 메일 계정이 없습니다. [📬 메일 계정 관리]에서 먼저 등록하세요.', 400);
  }

  let r;
  try {
    r = await listSentSince(toImapConfig(account), { since: new Date(Date.now() - d * 86400000), page: p, pageSize: n });
  } catch (e: any) {
    throw new AgentError(`보낸메일함을 읽지 못했습니다: ${e?.message || e}`, 502);
  }
  if (!r.folder) throw new AgentError(`${account.smtpUser} 메일함에서 보낸메일함을 찾지 못했습니다.`, 404);

  const items = [];
  for (const it of r.items) {
    let text = '';
    try {
      const parsed: any = await simpleParser(it.source);
      text = String(parsed.text || '').trim()
        || String(parsed.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    } catch { /* 읽지 못한 한 통은 본문 없이 둔다 */ }
    // 화면용 기준 — 분석용(stripQuoted 기본값)은 "네, 확인했습니다" 같은 짧은 답장에서 인용문을 통째로 남긴다
    const body = cutText(stripQuotedForDisplay(text) || text, THREAD_BODY_CHARS);
    items.push({
      uid: it.uid,
      sentAt: iso(it.date),
      to: it.to,
      cc: it.cc,
      subject: it.subject,
      body: body.text,
      bodyTruncated: body.truncated || it.sourceTruncated,
    });
  }

  return {
    account: { accountId: String(account._id), address: account.smtpUser },
    days: d,
    page: p,
    pageSize: n,
    total: r.total,
    totalPages: Math.max(1, Math.ceil(r.total / n)),
    count: items.length,
    items,
  };
}

/** 메일 1건 전체 — 본문은 메일 서버에서 받아 온 전문(20,000자까지) */
export async function getMailById({ id }: { id?: unknown }, ctx: AgentCtx) {
  const mailId = requireId(id);
  const scope = await scopeOf(ctx);
  // 범위 조건을 조회에 바로 건다 — 없는 메일과 남의 메일이 똑같이 404 가 되게 (있는지 떠보기 방지)
  const m: any = await InboundMail.findOne({ _id: mailId, ...mailFilter(scope) }, { 'raw.html': 0, 'analysis.usage': 0 }).lean();
  if (!m || m.trashedAt) throw new AgentError('메일을 찾을 수 없습니다.', 404);

  const loaded = await loadMailBody(m);
  const full = cutText(loaded.text || m.raw?.text || '', MAIL_BODY_CHARS);
  const lead = m.leadId ? (await companyMap([m.leadId])).get(m.leadId) : null;
  const drafts = await listDraftsInScope(scope, { inboundMailId: mailId, status: 'pending', withBody: true });

  return {
    id: mailId,
    threadId: threadIdOf(m.threadKey),
    direction: m.direction === 'out' ? 'out' : 'in',
    messageId: m.messageId,
    from: { name: m.from?.name || '', address: m.from?.address || '' },
    to: addrs(m.to),
    cc: addrs(m.cc),
    company: lead?.company || m.group || null,
    leadId: m.leadId || null,
    leadStage: lead?.stage ? { value: lead.stage, label: isStage(lead.stage) ? STAGE_LABEL_KO[lead.stage] : lead.stage } : null,
    subject: m.subject || '',
    subjectKo: m.translation?.subject || null,
    receivedAt: iso(m.date),
    lang: m.lang || null,
    body: full.text,
    bodyTruncated: full.truncated,
    bodyFromServer: loaded.fromServer,
    bodyNote: loaded.error || null,
    bodyNew: String(loaded.stripped || m.bodyStripped || stripQuoted(full.text)).trim(),
    bodyKo: m.translation?.body || null,
    attachments: files(m.attachments),
    classification: m.classification,
    classificationLabel: CLASS_LABELS[m.classification] || m.classification,
    importance: importanceOf(m.analysis),
    analysis: analysisOf(m.analysis),
    status: m.status,
    statusLabel: STATUS_LABELS[m.status] || m.status,
    repliedAt: iso(m.repliedAt),
    memo: m.memo || '',
    canReply: m.direction === 'in' ? canUseAccount(scope, m.accountId) : false,
    pendingDrafts: drafts.map(({ mailNow, ...x }: any) => x),
    url: mailUrl(ctx.baseUrl, mailId),
  };
}

/**
 * 스레드 전체 — 오래된 것부터(대화 순서대로), 최근 50통까지.
 * threadId(t_…) 또는 그 대화에 속한 메일 ID 아무것이나 받는다.
 * 리드에 붙은 대화면 우리가 먼저 보낸 영업 메일(발송 이력)도 함께 싣는다 — 무엇을 제안했는지 알아야 답을 쓴다.
 */
export async function getThreadMails({ threadId, mailId }: { threadId?: unknown; mailId?: unknown }, ctx: AgentCtx) {
  const ref = String(threadId || mailId || '').trim();
  if (!ref) throw new AgentError('threadId 또는 mailId 가 필요합니다.', 400);
  const scope = await scopeOf(ctx);

  let key: string | null = null;
  let only: any = null;
  if (ref.startsWith('t_')) {
    key = threadKeyOf(ref);
    if (!key) throw new AgentError('스레드 ID 형식이 아닙니다.', 400);
  } else {
    const m: any = await InboundMail.findOne({ _id: requireId(ref), ...mailFilter(scope) }, { 'raw.html': 0 }).lean();
    if (!m || m.trashedAt) throw new AgentError('메일을 찾을 수 없습니다.', 404);
    key = m.threadKey || null;
    if (!key) only = m;
  }

  const rows: any[] = only
    ? [only]
    : await InboundMail.find(
      { threadKey: key, ...mailFilter(scope), trashedAt: null },
      {
        subject: 1, from: 1, to: 1, cc: 1, date: 1, direction: 1, lang: 1, status: 1,
        attachments: 1, bodyStripped: 1, 'raw.text': 1, group: 1, leadId: 1,
      },
    ).sort({ date: -1 }).limit(50).lean();
  if (!rows.length) throw new AgentError('스레드를 찾을 수 없습니다.', 404);
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const leadId = rows.map((r) => r.leadId).filter(Boolean).pop() || null;
  let lead: any = null;
  if (leadId) {
    lead = await Lead.findOne({ leadId }, { leadId: 1, Company: 1, stage: 1, emailHistory: 1 }).lean();
  }

  return {
    threadId: threadIdOf(key),
    company: lead?.Company || rows[rows.length - 1].group || null,
    leadId,
    count: rows.length,
    messages: rows.map((m) => {
      const body = cutText(m.bodyStripped || stripQuotedForDisplay(m.raw?.text || ''), THREAD_BODY_CHARS);
      return {
        id: String(m._id),
        direction: m.direction === 'out' ? 'out' : 'in',
        from: { name: m.from?.name || '', address: m.from?.address || '' },
        to: addrs(m.to),
        cc: addrs(m.cc),
        subject: m.subject || '',
        date: iso(m.date),
        lang: m.lang || null,
        body: body.text,
        bodyTruncated: body.truncated,
        attachments: files(m.attachments),
        status: m.status,
        statusLabel: STATUS_LABELS[m.status] || m.status,
      };
    }),
    // 발송 이력의 본문은 저장할 때 500자로 줄여 둔 요약이다
    ourEmails: (lead?.emailHistory || [])
      .filter((h: any) => h && h.status === 'sent')
      .slice(-10)
      .map((h: any) => ({ subject: h.subject || '', bodySummary: h.body || '', to: h.to || '', sentAt: h.sentAt || null })),
  };
}

/** 넣어 둔 초안 — 기본은 '승인 대기'. 상태: pending | sent | discarded | all */
export async function listAgentDrafts(
  { status, mailId, mine }: { status?: unknown; mailId?: unknown; mine?: unknown },
  ctx: AgentCtx,
) {
  const st = String(status || 'pending');
  if (!['pending', 'sent', 'discarded', 'all'].includes(st)) throw new AgentError('status 는 pending | sent | discarded | all 중 하나입니다.', 400);
  const inboundMailId = mailId ? requireId(mailId) : undefined;
  const scope = await scopeOf(ctx);
  const items = await listDraftsInScope(scope, {
    status: st,
    inboundMailId,
    keyId: mine === true || mine === 'true' || mine === '1' ? ctx.key.id : undefined,
    withBody: true,
    limit: 100,
  });
  return { count: items.length, items: items.map((x: any) => ({ ...x, reviewUrl: draftUrl(ctx.baseUrl, x.id) })) };
}

/* ────────────────────────────── 쓰기 (초안만) ────────────────────────────── */

/**
 * 답장 초안 저장 → [📨 발송 관리 → 🤖 승인 대기]. **발송하지 않는다.**
 * 같은 키로 같은 메일에 다시 넣으면 새로 쌓지 않고 그 초안을 고친다(replaced: true).
 */
export async function saveDraft(input: Record<string, any>, ctx: AgentCtx) {
  const mailId = requireId(input.mailId ?? input.mail_id);
  const scope = await scopeOf(ctx);
  const mail: any = await InboundMail.findOne({ _id: mailId, ...mailFilter(scope) }, { 'raw.html': 0 }).lean();
  if (!mail || mail.trashedAt) throw new AgentError('메일을 찾을 수 없습니다.', 404);
  // 회신 상자와 같은 규칙 — 내 계정으로 받은 메일에만 답할 수 있다 (lib/mail/compose-reply.ts)
  if (!canUseAccount(scope, mail.accountId)) throw new AgentError('이 메일에는 답장을 넣을 수 없습니다 (키 주인의 메일 계정으로 받은 메일이 아닙니다).', 403);

  try {
    const { draft, replaced } = await saveAgentDraft({
      mail,
      key: ctx.key,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.body,
      notes: input.notes,
      client: input.client,
    });
    return {
      saved: true,
      replaced,
      sent: false,
      message: replaced
        ? '같은 메일에 넣어 둔 승인 대기 초안을 새 내용으로 고쳤습니다. 발송은 사람이 화면에서 확인하고 [보내기]를 눌러야 됩니다.'
        : '[발송 관리 → 승인 대기]에 넣었습니다. 발송은 사람이 화면에서 확인하고 [보내기]를 눌러야 됩니다.',
      reviewUrl: draft ? draftUrl(ctx.baseUrl, draft.id) : null,
      draft,
      mailNow: { status: mail.status, statusLabel: STATUS_LABELS[mail.status] || mail.status, repliedAt: iso(mail.repliedAt) },
    };
  } catch (e: any) {
    if (e?.status) throw new AgentError(e.message, e.status);
    throw e;
  }
}
