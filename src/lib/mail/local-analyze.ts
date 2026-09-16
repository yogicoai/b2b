/**
 * 1차 로컬 분석 — **API 를 호출하지 않는다(비용 0원)**.
 * 정규식·휴리스틱만으로 답변 필요 여부와 기한 후보를 잡아 대시보드를 채운다.
 * 번역과 정확한 요약은 못 하므로, 필요한 메일만 골라 AI 분석(유료)을 돌리는 것이 전제다.
 *
 * (emailData/src/lib/mail/localAnalyze.js 이식)
 */
import { stripQuoted } from './quoted';

/* ── 답변 요청 신호 ── */
const ASK_EN = /\b(could you|can you|would you|will you|please (send|advise|confirm|provide|share|quote|let|reply|respond|revert|review|check|update|inform|arrange|issue)|we would like|we are interested|kindly \w+|looking forward to your (reply|response)|awaiting your|let us know|get back to (me|us)|any update|request(ing)? (a )?(quote|quotation|sample|price))\b/i;
const ASK_KO = /(회신|답변|알려\s?주|보내\s?주|부탁\s?드립니다|요청\s?드립니다|가능하신지|확인\s?부탁|검토\s?부탁|견적)/;

/* ── 기한 표현 ── */
const DEADLINE_HINT_EN = /\b(deadline|due\b|by (the )?end of|no later than|not later than|before (the )?\d|expires?|closing date|rsvp|respond by|reply by|revert by|confirm by|within \d+ (business |working )?days?|asap|as soon as possible|urgent)\b/i;

/**
 * "by <날짜>" 계열 — 실무 메일에서 기한을 표현하는 가장 흔한 형태라 별도로 잡는다.
 * 예: by August 20 / by 20 Aug / by Friday / by EOD / by 2026-08-20 / by the 15th
 */
const BY_DATE_EN = /\bby\s+(the\s+)?(eod|cob|close of business|next\s+|this\s+)?\s*((mon|tues?|wednes|thurs?|fri|satur|sun)day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}(st|nd|rd|th)?\b|\d{4}-)/i;

const DEADLINE_HINT_KO = /(마감|기한|까지|이내|안에|회신\s?요망|긴급|급히)/;

const hasDeadlineHint = (text: string): boolean =>
  DEADLINE_HINT_EN.test(text) || BY_DATE_EN.test(text) || DEADLINE_HINT_KO.test(text);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** 문자열에서 날짜 후보를 뽑아 가장 이른 미래 날짜를 고른다 */
function findDate(text: string, base: Date): Date | null {
  const found: Date[] = [];
  const push = (y: number, m: number, d: number) => {
    if (!y || !m || !d) return;
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const dt = new Date(Date.UTC(y, m - 1, d, 3)); // KST 정오
    if (!Number.isNaN(dt.getTime())) found.push(dt);
  };

  // 2026-03-15 / 2026.03.15 / 2026/3/15
  for (const m of text.matchAll(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/g)) {
    push(+m[1], +m[2], +m[3]);
  }
  // 2026년 3월 15일
  for (const m of text.matchAll(/\b(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    push(+m[1], +m[2], +m[3]);
  }
  // 3월 15일 (연도 생략 — 기준일 이후로 해석)
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    const y = base.getUTCFullYear();
    const cand = new Date(Date.UTC(y, +m[1] - 1, +m[2], 3));
    push(cand < base ? y + 1 : y, +m[1], +m[2]);
  }
  // March 15, 2026 / Mar 15 / 15 March 2026
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
  for (const m of text.matchAll(new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?`, 'gi'))) {
    const mm = MONTHS[m[1].toLowerCase()];
    const y = m[3] ? +m[3] : base.getUTCFullYear();
    const cand = new Date(Date.UTC(y, mm - 1, +m[2], 3));
    push(!m[3] && cand < base ? y + 1 : y, mm, +m[2]);
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon}\\.?(?:,?\\s*(20\\d{2}))?`, 'gi'))) {
    const mm = MONTHS[m[2].toLowerCase()];
    const y = m[3] ? +m[3] : base.getUTCFullYear();
    const cand = new Date(Date.UTC(y, mm - 1, +m[1], 3));
    push(!m[3] && cand < base ? y + 1 : y, mm, +m[1]);
  }

  // "within N days" / "N일 이내" — 기준일에서 더한다
  const rel = text.match(/within\s+(\d{1,2})\s+(business\s+)?days?/i)
    || text.match(/(\d{1,2})\s*(영업일|일)\s*(이내|안에)/);
  if (rel) {
    const n = +rel[1];
    if (n > 0 && n < 90) found.push(new Date(base.getTime() + n * 86400000));
  }

  if (!found.length) return null;
  // 기준일 이후 중 가장 이른 것 (과거 날짜는 인용·이력일 가능성이 높다)
  const future = found
    .filter((d) => d.getTime() >= base.getTime() - 86400000)
    .sort((a, b) => a.getTime() - b.getTime());
  return future[0] || null;
}

/** 기한 표현이 실제로 등장한 문장 (근거 표시용) */
function findDeadlineSentence(text: string): string {
  const sentences = text.split(/(?<=[.!?。\n])\s+/).slice(0, 200);
  return sentences.find((s) => hasDeadlineHint(s))?.trim().slice(0, 160) || '';
}

/** 물음표 문장·요청 문장을 뽑아 요점 후보로 */
function extractPoints(text: string, limit = 3): string[] {
  const sentences = text
    .split(/(?<=[.!?。\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 220);

  const scored = sentences
    .map((s) => {
      let score = 0;
      if (s.includes('?')) score += 3;
      if (ASK_EN.test(s) || ASK_KO.test(s)) score += 2;
      if (hasDeadlineHint(s)) score += 2;
      if (/\b(moq|fob|cif|price|quot(e|ation)|sample|lead ?time|shipment|invoice|payment|단가|견적|샘플|납기|수량|결제)\b/i.test(s)) score += 2;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.s);
}

export interface LocalAnalysis {
  needsReply: boolean;
  replyReason: string;
  deadline: Date | null;
  deadlineText: string;
  urgency: 'high' | 'mid' | 'low';
  points: string[];
  questionCount: number;
  analyzedAt: Date;
  method: 'local';
}

export interface LocalAnalyzeInput {
  subject?: string;
  raw?: { text?: string };
  date?: Date | string;
  receivedAt?: Date | string;
  classification?: string;
  headers?: { listUnsubscribe?: string };
}

export function localAnalyze(mail: LocalAnalyzeInput): LocalAnalysis {
  const subject = mail.subject || '';
  // 인용된 이전 대화는 제외한다. 몇 달 전 인용문의 물음표를 이번 질문으로,
  // 인용문의 옛 날짜를 이번 기한으로 오인하는 것을 막기 위함이다.
  const body = stripQuoted((mail.raw?.text || '').slice(0, 30000));
  const text = `${subject}\n${body}`;
  const base = new Date(mail.date || mail.receivedAt || Date.now());

  const questionCount = (body.match(/\?/g) || []).length;
  const askHit = ASK_EN.test(text) || ASK_KO.test(text);
  const isBroadcast = Boolean(mail.headers?.listUnsubscribe);
  const isAdLike = ['ad', 'system', 'newsletter'].includes(mail.classification || '');

  // 기한 힌트 단어가 함께 있을 때만 날짜를 기한으로 인정한다.
  // (본문에 단순히 언급된 과거 날짜·회의록 날짜를 기한으로 오인하지 않기 위함)
  const dateFound = findDate(text, base);
  const deadline = dateFound && hasDeadlineHint(text) ? dateFound : null;
  const deadlineText = deadline ? findDeadlineSentence(text) : '';

  // 기한이 걸린 메일은 요청 표현이 없어도 대응이 필요하다고 본다 (RFQ·마감 통지 등)
  const needsReply = !isAdLike && !isBroadcast && (askHit || questionCount > 0 || Boolean(deadline));

  const reasons: string[] = [];
  if (questionCount) reasons.push(`질문 ${questionCount}개`);
  if (askHit) reasons.push('요청 표현 감지');
  if (deadline && !askHit && !questionCount) reasons.push('기한 명시');
  if (isBroadcast) reasons.push('대량 발송 헤더');

  // 긴급도는 반드시 확정된 기한으로 계산한다 (게이트 통과 전 날짜를 쓰면 결과가 모순된다)
  let urgency: 'high' | 'mid' | 'low' = 'low';
  if (deadline) {
    const days = Math.floor((deadline.getTime() - base.getTime()) / 86400000);
    urgency = days <= 3 ? 'high' : days <= 7 ? 'mid' : 'low';
  } else if (needsReply) {
    urgency = /\b(urgent|asap|immediately)\b/i.test(text) || /긴급|급히/.test(text) ? 'high' : 'mid';
  }

  return {
    needsReply,
    replyReason: reasons.join(' · ') || '요청 신호 없음',
    deadline,
    deadlineText,
    urgency,
    points: extractPoints(body),
    questionCount,
    analyzedAt: new Date(),
    method: 'local',
  };
}
