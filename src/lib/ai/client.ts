/**
 * Anthropic 클라이언트 — 호출 시점에 생성(키 미설정 상태로 빌드가 죽지 않도록).
 *
 * (emailData/src/lib/ai/client.js 이식)
 */
import Anthropic from '@anthropic-ai/sdk';

/**
 * 기본 모델 — Haiku 4.5.
 *
 * 이 앱이 AI 에 맡기는 일은 번역과 정형 요약(고정 스키마 JSON)이라
 * 최상위 모델이 필요한 종류가 아니다. Opus 5 대비 입력 1/5·출력 1/5 단가라
 * 하루 20통 기준 월 비용이 4천원대에서 1천원 아래로 떨어진다.
 * 품질이 아쉬우면 설정에서 Sonnet 5 / Opus 5 로 올릴 수 있다.
 */
export const DEFAULT_MODEL = 'claude-haiku-4-5';

export function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY 미설정 — .env.local 에 설정하세요.');
  }
  return new Anthropic();
}

export function resolveModel(settings?: { claudeModel?: string }): string {
  return settings?.claudeModel || process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

/**
 * 응답에서 JSON 본문을 꺼낸다.
 * - refusal: 안전 분류기가 거절한 경우(HTTP 200) — content 를 읽기 전에 먼저 확인해야 한다
 * - max_tokens: 잘린 JSON 을 파싱하면 조용히 틀린 결과가 나오므로 명시적으로 실패시킨다
 */
export function extractJson(res: any): any {
  if (res.stop_reason === 'refusal') {
    throw new Error(`AI 가 요청을 거절했습니다 (${res.stop_details?.category || '사유 미상'}).`);
  }
  if (res.stop_reason === 'max_tokens') {
    throw new Error('AI 응답이 max_tokens 로 잘렸습니다. 메일이 너무 길거나 max_tokens 를 늘려야 합니다.');
  }
  // thinking 블록이 앞에 올 수 있으므로 text 블록만 고른다
  const block = (res.content || []).find((b: any) => b.type === 'text');
  if (!block?.text) throw new Error('AI 응답이 비어 있습니다.');

  const raw = String(block.text).trim();
  try {
    return JSON.parse(raw);
  } catch { /* 아래에서 한 번 더 시도 */ }

  // 구조화 출력이 걸리면 순수 JSON 이 오지만, 모델이 코드펜스나 인사말을 덧붙이는
  // 경우가 있다. 여기서 실패하면 사용자에게는 그냥 '분석 실패'로 보이므로
  // 가장 바깥 중괄호 구간을 한 번 더 건져낸다.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch { /* 아래에서 실패 처리 */ }
  }

  throw new Error(`AI 응답 파싱 실패 (JSON 아님). 앞부분: ${raw.slice(0, 120)}`);
}

/** 긴 본문을 앞·뒤만 남기고 줄인다 — 인사말과 마무리(기한이 자주 여기 있음)를 보존 */
export function truncateBody(text = '', max = 24000): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.7));
  const tail = text.slice(-Math.floor(max * 0.3));
  return `${head}\n\n…[중략: 원문 ${text.length}자 중 일부 생략]…\n\n${tail}`;
}
