/**
 * 수신 메일 → 리드 매칭.
 *
 * 콜드메일을 보낸 뒤 상대가 답장하면, 그 답장이 **어느 리드의 답장인지** 확정해야
 * 리드 stage 를 'replied' 로 옮기고 담당자가 대응할 수 있다.
 *
 * 매칭 경로는 정확한 것부터 4단계로 내려간다:
 *   1) In-Reply-To   → 우리가 보낸 메일의 Message-ID 와 정확히 일치 (가장 확실)
 *   2) References[]  → 스레드 체인 어딘가에 우리 Message-ID 가 있음
 *   3) 발신 주소     → Lead.Email 과 일치
 *   4) 발신 도메인   → Lead.WebsiteContact 또는 Lead.Email 의 도메인과 일치
 *                      (담당자가 바뀌어 다른 주소로 답장한 경우)
 *
 * ⚠️ 4번은 약한 신호다. 같은 도메인에 리드가 여러 개면 매칭하지 않는다 —
 *    엉뚱한 리드가 'replied' 로 올라가면 담당자가 없는 답장을 찾아 헤매게 된다.
 */
import { Lead } from '@/models/Lead';

export type MatchMethod = 'in-reply-to' | 'references' | 'email-address' | 'domain';

export interface MatchInput {
  inReplyTo?: string;
  references?: string[];
  from?: { address?: string };
}

export interface MatchOutput {
  leadId: string;
  matchedBy: MatchMethod;
  company?: string;
  stage?: string;
}

/** Message-ID 정규화 — 꺾쇠 유무·공백·대소문자가 서버마다 다르다 */
function normalizeMessageId(id: string): string {
  return String(id || '').trim().replace(/^<|>$/g, '').toLowerCase();
}

/** 개인 메일 도메인 — 여기로는 회사를 특정할 수 없어 도메인 매칭에서 제외 */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'naver.com', 'daum.net', 'hanmail.net',
  'yahoo.com', 'yahoo.co.jp', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'nate.com', 'kakao.com', 'protonmail.com',
  'yandex.com', 'mail.ru', 'gmx.de', 'web.de', 'qq.com', '163.com',
]);

/**
 * 자동발송 주소 — 사람이 답장한 것이 아니다.
 *
 * 도메인 매칭(4단계)이 실제로 사고를 냈다. 조선호텔앤리조트 리드에
 * `billing@shinsegae.com` 이 보낸 **임대매장 통신요금 청구서**가 "답장" 으로 붙었고,
 * 메디그린한방병원에는 `smartstoreadmin_noreply@` · `gfa_cc_taxinvoice@` ·
 * `ads_noreply@navercorp.com` 네 통이 붙었다. 한방병원이 스마트스토어 주문현황을
 * 보낼 리가 없다.
 *
 * shinsegae.com 은 신세계 그룹 전체, navercorp.com 은 네이버 전체다. 도메인만 보면
 * 무관한 발신자 수천 개가 리드 하나로 쏟아진다. 기존 방어("같은 도메인 리드가 2개
 * 이상이면 매칭 안 함")는 **우리 쪽 리드 수**만 보기 때문에 이걸 못 막았다.
 *
 * 계정 이름을 보면 사람인지 기계인지는 대체로 갈린다. 여기서 거른다.
 * eun8537@amc.seoul.kr(서울아산병원 담당 간호사) 같은 실제 담당자는 통과해야 하므로
 * info@·support@ 처럼 사람이 쓰기도 하는 이름은 넣지 않는다.
 */
export const BULK_WORDS = [
  'no-?_?reply', 'donot-?reply', 'do-?not-?reply', 'noreply',
  'mailer-?daemon', 'postmaster', 'bounce', 'return-?path',
  'billing', 'invoices?', 'tax-?invoice', 'taxinvoice', 'payments?',
  'alimtalk', 'notifications?', 'notice', 'alerts?',
  'newsletter', 'marketing', 'promo', 'ads?', 'advert(ising)?',
  'auto(mated)?', 'system', 'daemon', 'robot', 'bot',
  'webmaster', 'administrator', 'admin',
  'tracking', 'delivery', 'shipment',
];

/**
 * ⚠️ **글자 경계를 반드시 건다.**
 * 부분 일치로 두면 'ads?' 가 adam·adrian·advisor·address 안의 'ad' 를 잡아
 * 실제 담당자 주소를 자동발송으로 몰아버린다. 앞뒤가 영문자가 아닐 때만 인정한다.
 * 그래서 smartstoreadmin_noreply 는 'noreply' 조각으로 잡히고(admin 으로는 안 잡힌다),
 * eun8537(서울아산병원 담당 간호사)·athena 는 통과한다.
 */
const BULK_LOCALPART = new RegExp(`(^|[^a-z])(${BULK_WORDS.join('|')})([^a-z]|$)`, 'i');

/**
 * 단어를 띄어쓰기 없이 붙여 쓴 것 — hometaxadmin · webadmin · trackingupdates.
 * 경계 규칙만으로는 안 잡힌다. 다만 여기 넣는 단어는 **끝에 붙었을 때 사람 이름일
 * 수 없는 것**만 골랐다. 'ad' 처럼 짧은 조각을 넣으면 adam·adrian 이 다시 걸린다.
 */
const BULK_SUFFIX = /(admin|no-?_?reply|daemon|notifications?|updates?|mailer|noti)$/i;

/** 발신 주소가 자동발송 계정인가 — 계정 이름(@ 앞)으로 판단한다 */
export function isBulkSender(address: string): boolean {
  const local = String(address || '').toLowerCase().split('@')[0] || '';
  if (!local) return false;
  return BULK_LOCALPART.test(local) || BULK_SUFFIX.test(local);
}

function domainOf(value: string): string {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('@')) return v.split('@')[1] || '';
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, '');
  } catch {
    return v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

/**
 * 수신 메일 하나를 리드에 매칭한다. 못 찾으면 null.
 * DB 조회만 하고 쓰기는 하지 않는다 (호출부가 결정).
 */
export async function matchLead(mail: MatchInput): Promise<MatchOutput | null> {
  // ── 1) In-Reply-To — 우리가 보낸 메일의 Message-ID 직접 참조 ──
  const irt = normalizeMessageId(mail.inReplyTo || '');
  if (irt) {
    const hit = await findLeadBySentMessageId(irt);
    if (hit) return { ...hit, matchedBy: 'in-reply-to' };
  }

  // ── 2) References 체인 — 스레드 어딘가에 우리 메일이 있음 ──
  //    최신(뒤쪽)부터 훑는다. 앞쪽은 더 오래된 대화라 현재 건과 멀다.
  const refs = (mail.references || []).map(normalizeMessageId).filter(Boolean);
  for (const ref of refs.reverse()) {
    if (ref === irt) continue;   // 1번에서 이미 확인함
    const hit = await findLeadBySentMessageId(ref);
    if (hit) return { ...hit, matchedBy: 'references' };
  }

  // ── 3) 발신 주소 = Lead.Email ──
  const from = String(mail.from?.address || '').trim().toLowerCase();
  if (!from) return null;

  // ⚠️ 같은 이메일을 가진 리드가 여러 개일 수 있다 (중복 정리로 archived 된 잔재 등).
  //    아무거나 고르면 archived 사본이 걸려 'replied' 로 되살아나고,
  //    정작 진짜 리드(partner 등)는 답장을 못 받는다 — 실측으로 발생했다.
  //    그래서 후보를 모두 가져와 가장 앞선 단계의 것을 고른다.
  const emailCandidates: any[] = await Lead.find(
    { Email: new RegExp(`^${escapeRegex(from)}$`, 'i'), deleted: { $ne: true } },
    { leadId: 1, Company: 1, stage: 1, dedupKeeperLeadId: 1 },
  ).lean();
  const bestByEmail = await pickBest(emailCandidates);
  if (bestByEmail) {
    return {
      leadId: bestByEmail.leadId,
      company: bestByEmail.Company,
      stage: bestByEmail.stage,
      matchedBy: 'email-address',
    };
  }

  // ── 4) 발신 도메인 (약한 신호) ──
  //    담당자가 바뀌어 다른 주소로 답장한 경우를 잡는다.
  //    같은 도메인 리드가 2개 이상이면 특정 불가 → 매칭하지 않는다.
  const dom = domainOf(from);
  if (!dom || FREE_MAIL.has(dom)) return null;

  // 자동발송 주소는 도메인이 같아도 답장이 아니다. 3단계(주소 정확 일치)까지
  // 내려오지 못한 메일이 여기서 회사 하나에 통째로 붙는 사고를 막는다.
  if (isBulkSender(from)) return null;

  const domRx = new RegExp(`(^|@|\\.)${escapeRegex(dom)}$|(^|@|//|\\.)${escapeRegex(dom)}(/|$)`, 'i');
  const byDomain: any[] = await Lead.find(
    {
      deleted: { $ne: true },
      $or: [{ Email: domRx }, { WebsiteContact: domRx }],
    },
    { leadId: 1, Company: 1, stage: 1, dedupKeeperLeadId: 1 },
  ).limit(6).lean();

  // 중복 정리 잔재를 keeper 로 합친 뒤 남은 회사가 하나일 때만 매칭한다.
  // (합치기 전에 세면 같은 회사의 사본들 때문에 "여러 개" 로 보여 매칭을 놓친다)
  const merged = await mergeToKeepers(byDomain);
  if (merged.length === 1) {
    return {
      leadId: merged[0].leadId,
      company: merged[0].Company,
      stage: merged[0].stage,
      matchedBy: 'domain',
    };
  }

  return null;
}

/**
 * 후보 여럿 중 하나를 고른다.
 *
 * 규칙:
 *   1) 중복 정리로 archived 된 것은 keeper 를 따라간다 — 메일이 진짜 리드에 붙어야 한다
 *   2) 그래도 여럿이면 가장 앞선 단계(partner > negotiating > … > archived)를 고른다
 */
const STAGE_RANK: Record<string, number> = {
  partner: 100, negotiating: 90, replied: 80, contacted: 70,
  verified: 60, verifying: 50, 'ai-searched': 40, imported: 30,
  archived: 10, failed: 5,
};

/** 중복 정리 잔재를 keeper 로 치환하고 leadId 기준 중복을 없앤다 */
async function mergeToKeepers(candidates: any[]): Promise<any[]> {
  const resolved: any[] = [];
  for (const c of candidates) {
    if (c.stage === 'archived' && c.dedupKeeperLeadId) {
      const keeper: any = await Lead.findOne(
        { leadId: c.dedupKeeperLeadId, deleted: { $ne: true } },
        { leadId: 1, Company: 1, stage: 1 },
      ).lean();
      if (keeper) { resolved.push(keeper); continue; }
    }
    resolved.push(c);
  }
  const seen = new Set<string>();
  return resolved.filter((c) => {
    if (seen.has(c.leadId)) return false;
    seen.add(c.leadId);
    return true;
  });
}

async function pickBest(candidates: any[]): Promise<any | null> {
  if (!candidates.length) return null;
  const uniq = await mergeToKeepers(candidates);
  uniq.sort((a, b) => (STAGE_RANK[b.stage] || 0) - (STAGE_RANK[a.stage] || 0));
  return uniq[0] || null;
}

/** 우리가 보낸 메일의 Message-ID 로 리드를 역추적 */
async function findLeadBySentMessageId(
  msgId: string,
): Promise<{ leadId: string; company?: string; stage?: string } | null> {
  if (!msgId) return null;

  // 저장된 값에 꺾쇠가 붙어 있을 수도, 없을 수도 있다 — 둘 다 본다
  const candidates = [msgId, `<${msgId}>`];
  const doc: any = await Lead.findOne(
    { 'emailHistory.messageId': { $in: candidates }, deleted: { $ne: true } },
    { leadId: 1, Company: 1, stage: 1 },
  ).lean();

  if (doc) return { leadId: doc.leadId, company: doc.Company, stage: doc.stage };
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 답장 수신 시 리드를 'replied' 로 올려도 되는지.
 *
 * 올리면 **안 되는** 경우:
 *  - 이미 더 진행된 단계 (negotiating · partner) — 뒤로 되돌리는 셈
 *  - 광고·자동발송으로 분류된 메일 — 부재중 자동응답이 대표적이다.
 *    콜드메일을 대량 발송하면 자동응답이 쏟아지는데, 이걸 '답장 옴'으로
 *    올리면 담당자가 열어볼 리드 목록이 통째로 오염된다.
 *  - 우리가 보낸 메일 (direction='out')
 */
export function shouldMoveToReplied(
  currentStage: string | undefined,
  classification: string | undefined,
  direction: string | undefined,
  /** 이 리드에 우리가 보낸 이력 — 없으면 답장일 수 없다 */
  contact?: { lastSentAt?: string | Date | null; receivedAt?: string | Date | null },
): boolean {
  if (direction === 'out') return false;
  if (['ad', 'system', 'newsletter'].includes(classification || '')) return false;

  // 이미 답장 이후 단계면 유지 (되돌리지 않는다)
  if (['replied', 'negotiating', 'partner'].includes(currentStage || '')) return false;

  // ── 보낸 적이 없으면 답장이 아니다 ────────────────────────────
  // 메디그린한방병원이 발송이력 0건인데 '답장받음' 에 올라가 있었다. 우리가 보낸
  // 적 없는 곳에서 온 메일은 문의든 광고든 **답장**은 아니다. 담당자가
  // [답장받음] 을 여는 이유는 "내가 보낸 것에 반응이 왔다" 를 보려는 것이다.
  //
  // 이 조건은 **승급**에만 건다. 메일을 리드에 붙이는 것(leadId)은 그대로 둔다 —
  // 서울아산병원은 먼저 전화로 연락이 와서 발송이력이 0건인데, 그 11통은
  // [대화 진행 중] 에서 계속 보여야 한다.
  const sent = contact?.lastSentAt ? new Date(contact.lastSentAt) : null;
  if (!sent || Number.isNaN(sent.getTime())) return false;

  // 우리가 보내기 **전에** 온 메일은 그 발송에 대한 답장일 수 없다.
  // 하루는 접어 준다 — 발송 시각 기록과 메일 헤더 시각이 서버마다 어긋난다.
  const got = contact?.receivedAt ? new Date(contact.receivedAt) : null;
  if (got && !Number.isNaN(got.getTime())) {
    if (got.getTime() < sent.getTime() - 24 * 60 * 60 * 1000) return false;
  }

  return true;
}

/** emailHistory 에서 실제로 발송된 마지막 시각 */
export function lastSentAtOf(emailHistory?: Array<Record<string, any>> | null): string | null {
  let best = 0;
  for (const h of emailHistory || []) {
    if (h?.status !== 'sent' || !h?.sentAt) continue;
    const t = new Date(h.sentAt).getTime();
    if (!Number.isNaN(t) && t > best) best = t;
  }
  return best ? new Date(best).toISOString() : null;
}

/**
 * 리드가 '답장받음' 에 있을 자격이 있는지 다시 계산하고, 없으면 되돌린다.
 *
 * 왜 필요한가: 승급 판단은 **수집 시점**에 돈다. 그런데 그때는 분류가 아직
 * 'unknown' 인 경우가 많다(규칙 분류가 못 가른 것). 나중에 AI 가 그 메일을
 * 광고·자동발송으로 판정해도 이미 올라간 stage 는 그대로 남는다.
 * 조선호텔앤리조트가 정확히 이 경우였다 — 승급 당시 classifiedBy 가 null 이었고,
 * 나중에 system 으로 판정됐지만 '답장받음' 에 그대로 남아 있었다.
 *
 * 되돌릴 곳은 발송 이력이 있으면 'contacted', 없으면 'verified' 다.
 * 사람이 손으로 올린 negotiating·partner 는 건드리지 않는다.
 */
export async function recheckRepliedStage(leadId: string): Promise<'kept' | 'reverted' | 'skipped'> {
  const { InboundMail } = await import('@/models/InboundMail');

  const lead: any = await Lead.findOne(
    { leadId, deleted: { $ne: true } },
    { leadId: 1, stage: 1, emailHistory: 1 },
  ).lean();
  if (!lead || lead.stage !== 'replied') return 'skipped';

  const sentAt = lastSentAtOf(lead.emailHistory);

  // 답장으로 인정할 만한 수신 메일이 하나라도 남아 있나
  const real = await InboundMail.countDocuments({
    leadId,
    direction: 'in',
    trashedAt: null,
    classification: { $nin: ['ad', 'system', 'newsletter'] },
    ...(sentAt ? { date: { $gte: new Date(new Date(sentAt).getTime() - 24 * 60 * 60 * 1000) } } : {}),
  });

  if (sentAt && real > 0) return 'kept';

  await Lead.updateOne(
    { leadId },
    { $set: { stage: sentAt ? 'contacted' : 'verified', stageChangedAt: new Date().toISOString() } },
  );
  return 'reverted';
}
