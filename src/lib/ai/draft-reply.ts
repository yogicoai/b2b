/**
 * 답장 초안 생성.
 * 담당자가 "무슨 말을 할지"(intent)를 한국어로 입력하면, 그 내용을 상대 언어로 작성한다.
 * 초안은 항상 사람이 검토·수정한 뒤 발송한다 — 자동 발송하지 않는다.
 *
 * (emailData/src/lib/ai/draft.js 이식 · K-뷰티 수출 맥락으로 교체)
 */
import { client, resolveModel, extractJson, truncateBody } from './client';

const SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
    bodyKo: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['subject', 'body', 'bodyKo', 'notes'],
  additionalProperties: false,
};

const SYSTEM = `당신은 한국 화장품 수출 기업(요기코)의 해외영업 담당자를 대신해 비즈니스 이메일 답장 초안을 씁니다.
요기코는 K-뷰티 제품을 해외 유통사·리테일러·브랜드에 공급합니다.

## 원칙
- 상대가 보낸 메일의 언어로 씁니다. 상대가 영어면 영어, 한국어면 한국어입니다.
- 담당자가 준 "전달할 내용"을 반드시 모두 담습니다. 내용을 임의로 추가하거나 빼지 마세요.
- 가격·MOQ·납기·재고·할인율 등 **담당자가 명시하지 않은 수치나 약속을 절대 지어내지 마세요.**
  정보가 부족하면 그 부분은 상대에게 확인을 요청하는 문장으로 처리하고, notes 에 무엇이 빠졌는지 적습니다.
- 상대 메일의 질문에 빠짐없이 대응합니다.
- 간결한 실무 비즈니스 톤. 과한 수식이나 사과를 넣지 않습니다.
- 서명은 넣지 마세요(발송 시스템이 붙입니다).

## 출력
- subject: 답장 제목. 원문 제목에 "Re: " 가 없으면 붙입니다.
- body: 실제 발송할 본문 (상대 언어).
- bodyKo: body 를 한국어로 옮긴 것. 담당자가 내용을 검토하는 용도이며, 영문 답장일 때 특히 중요합니다.
  원문이 한국어라 body 가 이미 한국어면 body 와 같은 내용을 넣습니다.
- notes: 담당자가 발송 전에 확인·보완해야 할 사항. 없으면 "확인 필요 사항 없음".`;

export interface DraftResult {
  subject: string;
  body: string;
  bodyKo: string;
  notes: string;
  lang: string;
  model: string;
  createdAt: Date;
  usage?: Record<string, number>;
}

/**
 * @param mail   대상 수신 메일
 * @param intent 담당자가 한국어로 적은 "전달할 내용"
 */
export async function draftReply(mail: any, intent: string, settings: any = {}): Promise<DraftResult> {
  if (!intent || !String(intent).trim()) {
    throw new Error('답장에 담을 내용을 입력하세요.');
  }
  const model = resolveModel(settings);
  const anthropic = client();

  const user = `아래 메일에 대한 답장 초안을 작성하세요.

[상대] ${mail.from?.name || ''} <${mail.from?.address || ''}>
[원문 제목] ${mail.subject || ''}
[원문 언어] ${mail.lang || 'unknown'}
[상대의 요구] ${mail.analysis?.intent || '(분석 없음)'}
${mail.leadCompany ? `[상대 회사] ${mail.leadCompany}` : ''}

===== 상대가 보낸 메일 =====
${truncateBody(mail.bodyStripped || mail.raw?.text || '', 12000)}
===== 끝 =====

===== 담당자가 전달하려는 내용 (한국어) =====
${String(intent).trim()}
===== 끝 =====`;

  const res: any = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: user }],
  } as any);

  const r = extractJson(res);
  return {
    subject: r.subject,
    body: r.body,
    bodyKo: r.bodyKo,
    notes: r.notes,
    lang: mail.lang || 'en',
    model,
    createdAt: new Date(),
    usage: {
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
      cacheRead: res.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: res.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}
