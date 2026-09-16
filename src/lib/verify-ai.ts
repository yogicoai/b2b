import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude API 기반 국내 B2B 타깃 정밀 검증.
 *
 * 국내판에서 이 단계가 하는 일은 해외판과 다르다. 해외판은 "이 회사가 화장품을
 * 수입하는 바이어인가"를 봤다. 국내판이 걸러야 하는 것은 업종이 아니라 **규모**다.
 * 네이버 지역검색은 "부산 글램핑"에 1인 운영 캠핑장까지 전부 돌려주는데, 그런 곳은
 * 빈백을 두세 개 사고 끝이라 B2B 대량 납품 대상이 아니다. 업종은 맞는데 규모가
 * 안 되는 곳을 걸러내는 것이 여기서 제일 중요한 일이다.
 *
 * 모델: claude-haiku-4-5 (가성비 — 분류 작업에 충분)
 */

const client = new Anthropic();
const MODEL = 'claude-haiku-4-5';

export interface AIVerdict {
  verdict: 'target-fit' | 'maybe' | 'not-fit';
  confidence: 'high' | 'medium' | 'low';
  /**
   * 0~100 점.
   *
   * 판정 세 갈래만으로는 224곳을 어디부터 보낼지 정할 수 없다. 한 번에 다 못 보내고
   * (계정이 잠긴다) 나눠 보내야 하므로, 좋은 곳이 먼저 나가야 실익이 있다.
   * 구 시스템도 같은 이유로 점수를 쓰고 있었다 (한화호텔앤드리조트 95점).
   */
  score: number;
  reasoning: string;          // 한국어 1~2문장
  signals: string[];          // 판단 근거 키워드/단서
  /** 이번 호출이 쓴 토큰 — 화면에 실제 비용을 사실대로 보여주려고 같이 돌려준다 */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LeadContext {
  Company: string;
  Region?: string;
  Type?: string;
  BrandsChannels?: string;
  Evidence?: string;
  RoleMemo?: string;
  notes?: string;
  WebsiteContact?: string;
  // ── 국내 수집분에서 오는 것들 ──
  /** 타깃 카테고리 — 무엇을 제안할 곳인지가 규모 판단의 전제가 된다 */
  category?: string;
  categoryLabel?: string;
  categoryPitch?: string;
  /** 네이버 업종 문자열 (예: "숙박>리조트") — 업종 판단에 가장 정확한 단서 */
  naverCategory?: string;
  phone?: string;
  address?: string;
  // 휴리스틱이 추출한 사이트 메타
  siteTitle?: string;
  siteDescription?: string;
  matchedKeywords?: string[];
}

const SYSTEM_PROMPT = `너는 빈백 브랜드 '요기보(Yogibo)'의 국내 B2B 납품 타깃을 선별하는 검증자다.

업체 정보를 받아 "이 업체가 요기보 빈백을 **여러 개 한 번에** 들일 만한 곳인가"를 판단한다.

가장 중요한 축은 업종이 아니라 **규모**다.
요기보 B2B 는 라운지·대기실·휴게공간을 통째로 꾸미는 납품이다. 업종이 맞아도
개인이 혼자 운영하는 작은 업소는 두세 개 사고 끝이라 타깃이 아니다.

판정:
- target-fit : 규모 있는 곳. 체인·프랜차이즈 본부, 대형 리조트/호텔, 종합병원·대학병원·의료원,
               기업 본사·사옥·연구소, 지자체·교육청·공공기관, 대학, 프로구단·시설공단 등.
               공간이 여러 개이거나 지점이 여럿이면 규모 신호로 본다.
- maybe      : 업종은 맞는데 규모를 판단할 정보가 부족한 곳. 중형 병원, 단일 지점 호텔,
               중소기업 사옥 등. 사람이 한 번 더 보면 되는 자리다.
- not-fit    : 명백히 대량 납품 대상이 아닌 곳. 1인·소형 펜션, 개인 카페, 소규모 글램핑,
               동네 의원, 무인매장, 그리고 업종 자체가 무관한 곳(부동산·법무·쇼핑몰 등).

confidence:
- high   : 규모 신호가 사이트나 상호에 뚜렷하다 (예: "○○의료원", "전국 12개 지점", "그룹 연수원")
- medium : 신호는 있으나 단정하기 어렵다
- low    : 정보가 빈약해 추측에 가깝다

score 는 0~100 으로, **한 번에 몇 개가 들어갈 곳인가**를 그대로 반영한다.
  90~100 전국 체인·대학병원·대기업 본사·지자체 (한 번에 수십~수백 개)
  70~89  단일 대형 시설 · 중견기업 사옥 · 종합병원
  50~69  중형 시설. 규모를 단정하기 어려움
  30~49  소형. 몇 개 사고 끝날 가능성
  0~29   대상 아님
판정(verdict)과 어긋나지 않게 쓴다 — not-fit 인데 80 점 같은 조합은 안 된다.

reasoning 은 한국어 1~2문장으로, **왜 이 규모로 봤는지**를 먼저 쓴다.
signals 는 판단 근거가 된 단어 2~5개 (상호의 법인격·지점 수·시설 종류 등).`;

const TOOL_SCHEMA = {
  name: 'submit_verdict',
  description: '회사가 K-beauty 바이어인지 판단 결과를 제출',
  input_schema: {
    type: 'object' as const,
    properties: {
      verdict: {
        type: 'string',
        enum: ['target-fit', 'maybe', 'not-fit'],
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
      },
      score: {
        type: 'integer',
        description: '0~100. 납품 규모가 클수록 높다. 어디부터 보낼지 정하는 데 쓴다.',
      },
      reasoning: {
        type: 'string',
        description: '한국어 1~2문장으로 핵심 근거 설명',
      },
      signals: {
        type: 'array',
        items: { type: 'string' },
        description: '판단 근거가 된 키워드 또는 단서 2~5개',
      },
    },
    required: ['verdict', 'confidence', 'score', 'reasoning', 'signals'],
    additionalProperties: false,
  },
  strict: true,
};

function buildUserPrompt(lead: LeadContext): string {
  const lines: string[] = [];
  lines.push(`업체명: ${lead.Company}`);
  if (lead.categoryLabel) lines.push(`타깃 카테고리: ${lead.categoryLabel}`);
  if (lead.categoryPitch) lines.push(`이 카테고리에 제안할 내용: ${lead.categoryPitch}`);
  if (lead.naverCategory) lines.push(`업종(네이버 분류): ${lead.naverCategory}`);
  if (lead.Region) lines.push(`지역: ${lead.Region}`);
  if (lead.address) lines.push(`주소: ${lead.address}`);
  if (lead.phone) lines.push(`전화: ${lead.phone}`);
  if (lead.Type) lines.push(`유형(메모): ${lead.Type}`);
  if (lead.WebsiteContact) lines.push(`웹사이트: ${lead.WebsiteContact}`);
  if (lead.siteTitle) lines.push(`사이트 타이틀: ${lead.siteTitle}`);
  if (lead.siteDescription) lines.push(`사이트 설명: ${lead.siteDescription}`);
  if (lead.matchedKeywords?.length) {
    lines.push(`자동 매칭 키워드: ${lead.matchedKeywords.slice(0, 10).join(', ')}`);
  }
  if (lead.BrandsChannels) lines.push(`취급 브랜드/채널: ${lead.BrandsChannels.slice(0, 400)}`);
  if (lead.Evidence) lines.push(`수집 메모: ${lead.Evidence.slice(0, 300)}`);
  if (lead.RoleMemo) lines.push(`담당자 메모: ${lead.RoleMemo.slice(0, 200)}`);
  if (lead.notes) lines.push(`기타 노트: ${lead.notes.slice(0, 200)}`);
  return lines.join('\n');
}

export async function verifyWithAI(lead: LeadContext): Promise<AIVerdict | null> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'submit_verdict' },
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(lead),
        },
      ],
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'submit_verdict') {
        const out = block.input as AIVerdict;
        return {
          verdict: out.verdict,
          confidence: out.confidence,
          score: Math.max(0, Math.min(100, Number(out.score) || 0)),
          usage: {
            inputTokens: response.usage?.input_tokens || 0,
            outputTokens: response.usage?.output_tokens || 0,
          },
          reasoning: out.reasoning,
          signals: out.signals,
        };
      }
    }
    return null;
  } catch (e: any) {
    console.error('[verify-ai] API call failed:', e?.message || e);
    return null;
  }
}
