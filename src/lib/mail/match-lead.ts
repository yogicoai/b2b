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
): boolean {
  if (direction === 'out') return false;
  if (['ad', 'system', 'newsletter'].includes(classification || '')) return false;

  // 이미 답장 이후 단계면 유지 (되돌리지 않는다)
  if (['replied', 'negotiating', 'partner'].includes(currentStage || '')) return false;

  return true;
}
