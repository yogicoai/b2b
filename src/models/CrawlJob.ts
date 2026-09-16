/**
 * 크롤링 작업 한 건의 진행 상황.
 *
 * 왜 DB 에 두는가: 한 번 돌면 15분 넘게 걸린다. HTTP 요청 하나가 그걸 기다릴 수
 * 없고(브라우저가 먼저 끊는다), 화면을 옮겼다 돌아와도 "지금 어디까지 갔는지"가
 * 보여야 한다. 그래서 작업을 문서로 만들어 두고 화면이 그 문서를 읽는다.
 *
 * 서버가 중간에 죽으면 status 가 running 인 채로 남는다. 그건 실패로 본다 —
 * 되살릴 방법이 없고, 다시 돌리면 이미 넣은 곳은 중복으로 걸러지므로 안전하다.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface ICrawlJob extends Document {
  jobId: string;
  category: string;
  keywords: string[];
  status: 'running' | 'done' | 'failed' | 'canceled';

  // ── 진행률 ──
  /** 검색 조합 (키워드 × 지역) */
  queriesTotal: number;
  queriesDone: number;
  /** 네이버가 돌려준 업체 수 */
  found: number;
  /** 이미 있던 곳 */
  duplicate: number;
  /** 홈페이지를 들어가 본 곳 */
  homepageDone: number;
  homepageTotal: number;
  /** 이메일을 확보한 곳 */
  withEmail: number;
  /** 이메일이 없어 AI 를 돌리지 않고 거른 곳 */
  noEmail: number;
  /** AI 검증을 돌린 건수 */
  aiDone: number;
  aiTotal: number;
  /** 최종 배분 */
  verified: number;
  failed: number;

  /** 지금 무엇을 하고 있는지 — 화면에 그대로 보여준다 */
  phase: string;
  currentLabel: string;

  /** 실제로 쓴 AI 토큰 (비용을 사실대로 보여주려고 모은다) */
  inputTokens: number;
  outputTokens: number;

  /**
   * 방금 찾은 업체들 — 화면에 실시간으로 흘려보내는 목록.
   *
   * 15분짜리 작업에 숫자만 올라가면 멈춘 것처럼 보인다. 업체 이름이 하나씩
   * 쌓이는 게 보여야 "돌고 있구나" 를 안다. 최근 40건만 들고 있는다 —
   * 전부 쌓으면 문서가 커져서 진행률을 읽을 때마다 무거워진다.
   */
  recentFinds: Array<{
    company: string;
    region: string;
    email: string;
    /** found(수집) · no-email(이메일 없음) · verified(적합) · rejected(부적합) */
    state: string;
    score?: number;
    reason?: string;
    at: Date;
  }>;

  /** 건너뛴 항목 사유 — 이름이 errors 면 mongoose Document 의 검증 에러와 겹친다 */
  problems: string[];
  startedAt: Date;
  finishedAt?: Date;
  createdBy: string;
}

const CrawlJobSchema = new Schema<ICrawlJob>({
  jobId: { type: String, required: true, unique: true, index: true },
  category: { type: String, required: true },
  keywords: { type: [String], default: [] },
  status: { type: String, enum: ['running', 'done', 'failed', 'canceled'], default: 'running', index: true },

  queriesTotal: { type: Number, default: 0 },
  queriesDone: { type: Number, default: 0 },
  found: { type: Number, default: 0 },
  duplicate: { type: Number, default: 0 },
  homepageDone: { type: Number, default: 0 },
  homepageTotal: { type: Number, default: 0 },
  withEmail: { type: Number, default: 0 },
  noEmail: { type: Number, default: 0 },
  aiDone: { type: Number, default: 0 },
  aiTotal: { type: Number, default: 0 },
  verified: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },

  phase: { type: String, default: '준비 중' },
  currentLabel: { type: String, default: '' },

  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },

  recentFinds: {
    type: [{
      _id: false,
      company: String,
      region: String,
      email: String,
      state: String,
      score: Number,
      reason: String,
      at: { type: Date, default: Date.now },
    }],
    default: [],
  },

  problems: { type: [String], default: [] },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date },
  createdBy: { type: String, default: '' },
});

export const CrawlJob =
  (mongoose.models.CrawlJob as mongoose.Model<ICrawlJob>) ||
  mongoose.model<ICrawlJob>('CrawlJob', CrawlJobSchema);

/**
 * Claude Haiku 4.5 단가 (2026-06 기준, $/1M 토큰).
 * 화면에 "얼마 나갔는지"를 사실대로 보여주려고 여기 둔다.
 * 단가가 바뀌면 여기만 고친다.
 */
export const AI_PRICE = { inputPerMTok: 1.0, outputPerMTok: 5.0, usdToKrw: 1400 };

export function aiCostKrw(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * AI_PRICE.inputPerMTok +
    (outputTokens / 1_000_000) * AI_PRICE.outputPerMTok;
  return Math.round(usd * AI_PRICE.usdToKrw);
}
