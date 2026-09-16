/**
 * 토큰·비용 사전 추정 — **API 를 호출하지 않는다**.
 * 화면에서 "이 메일 분석하면 얼마" 를 미리 보여주기 위한 로컬 계산이므로 과금이 발생하지 않는다.
 * 정확한 값이 아니라 어림값이며, 실제 사용량은 분석 후 analysis.usage 에 기록된다.
 *
 * (emailData/src/lib/ai/estimate.js 이식)
 */
import { bodyForPrompt } from './analyze-mail';

/**
 * 1M 토큰당 USD (Anthropic 공개 단가).
 * cacheMin = 프롬프트 캐시가 걸리는 최소 프리픽스 토큰 수 — 모델마다 다르고,
 * 이보다 짧은 프롬프트는 조용히 캐시되지 않으므로 비용 추정에 반영해야 한다.
 */
export const PRICING: Record<string, { in: number; out: number; label: string; cacheMin: number }> = {
  'claude-opus-5':    { in: 5, out: 25, label: 'Opus 5',    cacheMin: 512 },
  'claude-sonnet-5':  { in: 3, out: 15, label: 'Sonnet 5',  cacheMin: 1024 },
  'claude-haiku-4-5': { in: 1, out: 5,  label: 'Haiku 4.5', cacheMin: 4096 },
};

/** 기본 모델과 같아야 한다 — 화면 금액과 실제 청구가 어긋나지 않도록 (client.ts DEFAULT_MODEL) */
const DEFAULT = 'claude-haiku-4-5';
const FALLBACK = PRICING[DEFAULT];

export const USD_KRW = Number(process.env.USD_KRW) || 1400;

/** 시스템 프롬프트 등 고정 입력분 (analyze-mail.ts 의 지시문 분량) */
const SYSTEM_TOKENS = 1500;

/**
 * 문자 수 → 토큰 어림값.
 * 한글/CJK 는 문자당 토큰이 많고(≈1자 1토큰), 라틴 문자는 ≈4자 1토큰.
 */
export function estimateTokens(text = ''): number {
  const s = String(text);
  if (!s) return 0;
  const cjk = (s.match(/[가-힣ぁ-ヿ一-鿿]/g) || []).length;
  const rest = s.length - cjk;
  return Math.ceil(cjk * 1.05 + rest / 3.6);
}

export interface CostEstimate {
  model: string;
  modelLabel: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  krw: number;
  cached: boolean;
  cacheable: boolean;
}

/**
 * 메일 1통 분석 비용 추정.
 * 출력은 번역본(원문과 비슷한 분량) + 요약이므로 입력 본문에 비례해 잡는다.
 *
 * @param cached 시스템 프롬프트 캐시 히트 가정 여부(두 번째 메일부터 true)
 */
export function estimateMailCost(mail: any, model = DEFAULT, cached = true): CostEstimate {
  const price = PRICING[model] || FALLBACK;

  // 실제로 API 에 보내는 본문과 같은 기준으로 잡아야 화면 금액과 청구가 어긋나지 않는다.
  // analyze-mail.ts 는 인용부를 걷어낸 본문을 보낸다(평균 90% 감소).
  const bodyText = bodyForPrompt(mail?.raw?.text || mail?.bodyStripped || '');
  const body = bodyText.slice(0, 24000);
  const bodyTokens = estimateTokens(body);
  const metaTokens = estimateTokens(
    `${mail?.subject || ''}${mail?.from?.address || ''}${(mail?.to || []).map((t: any) => t.address).join('')}`,
  ) + 60;

  const inputFresh = bodyTokens + metaTokens;

  // 시스템 프롬프트가 이 모델의 캐시 최소 크기에 못 미치면 캐시가 아예 걸리지 않는다
  const cacheable = SYSTEM_TOKENS >= price.cacheMin;
  const systemMultiplier = !cacheable ? 1 : cached ? 0.1 : 1.25;

  // 번역본(본문의 약 1.05배) + 요약·기한 등 구조화 필드
  const outputTokens = Math.ceil(bodyTokens * 1.05) + 320;

  const usd =
    (inputFresh / 1e6) * price.in +
    (SYSTEM_TOKENS / 1e6) * price.in * systemMultiplier +
    (outputTokens / 1e6) * price.out;

  return {
    model,
    modelLabel: price.label,
    inputTokens: inputFresh + SYSTEM_TOKENS,
    outputTokens,
    usd,
    krw: Math.round(usd * USD_KRW),
    cached: cacheable && cached,
    cacheable,
  };
}

/** 여러 통 합산 — 첫 통만 캐시 미스로 계산 */
export function estimateBatchCost(mails: any[] = [], model = DEFAULT) {
  let usd = 0, inputTokens = 0, outputTokens = 0;
  mails.forEach((m, i) => {
    const e = estimateMailCost(m, model, i > 0);
    usd += e.usd; inputTokens += e.inputTokens; outputTokens += e.outputTokens;
  });
  return {
    count: mails.length,
    model,
    modelLabel: (PRICING[model] || FALLBACK).label,
    inputTokens, outputTokens,
    usd,
    krw: Math.round(usd * USD_KRW),
  };
}

/** 실제 사용량(analysis.usage) → 실비 */
export function actualCost(usage: any, model = DEFAULT) {
  if (!usage) return null;
  const price = PRICING[model] || FALLBACK;
  const usd =
    ((usage.inputTokens || usage.input || 0) / 1e6) * price.in +
    ((usage.cacheRead || 0) / 1e6) * price.in * 0.1 +
    ((usage.cacheWrite || 0) / 1e6) * price.in * 1.25 +
    ((usage.outputTokens || usage.output || 0) / 1e6) * price.out;
  return { usd, krw: Math.round(usd * USD_KRW) };
}

export const krw = (n: number) => `₩${Number(n || 0).toLocaleString('ko-KR')}`;
