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
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  /**
   * 한 번에 여러 카테고리를 걸었을 때 그것들을 묶는 열쇠.
   *
   * 카테고리마다 작업을 따로 만들고 **하나씩 차례로** 돌린다. 한꺼번에 돌리면
   * 네이버 API 와 브라우저를 동시에 여러 개 쓰게 되고, 진행률이 "몇 중 몇"으로
   * 안 나와서 남은 시간을 짐작할 수 없다.
   */
  queueId: string;
  /** 이 묶음에서 몇 번째인가 (화면에 "리조트·호텔 2/5" 로 보여준다) */
  queueIndex: number;
  queueTotal: number;

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
  status: { type: String, enum: ['queued', 'running', 'done', 'failed', 'canceled'], default: 'running', index: true },
  queueId: { type: String, default: '', index: true },
  queueIndex: { type: Number, default: 0 },
  queueTotal: { type: Number, default: 1 },

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

/**
 * 아이디 하나가 하루에 돌릴 수 있는 크롤링 횟수.
 *
 * 크롤링 한 번은 40분에서 세 시간이 걸리고 AI 비용도 든다. 여러 사람이 각자
 * 돌리면 네이버 쿼터와 토큰이 하루치로 금방 빠지고, 같은 업체를 서로 다시
 * 뒤지게 된다. 하루 몇 번이면 충분한 일이라 횟수로 막는다.
 *
 * '한 번'은 **버튼 한 번**이다. 카테고리를 다섯 개 골라 걸어도 1회로 센다
 * (작업 문서는 다섯 개 생기지만 queueId 는 하나다).
 */
export const DAILY_CRAWL_LIMIT = 3;

/** 오늘(KST) 시작 시각 — 자정에 횟수가 돌아온다 */
function kstTodayStart(now: Date = new Date()): Date {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

export interface CrawlQuota {
  limit: number;
  used: number;
  left: number;
  /** 언제 다시 채워지는가 (화면에 "내일 0시에 돌아옵니다" 로 쓴다) */
  resetsAt: Date;
}

/** 이 아이디가 오늘 몇 번 돌렸는지 */
export async function crawlQuotaFor(user: string): Promise<CrawlQuota> {
  const since = kstTodayStart();
  const rows = await CrawlJob.aggregate([
    { $match: { createdBy: user, startedAt: { $gte: since } } },
    // 버튼 한 번 = queueId 하나. 카테고리 수만큼 세면 5개 고른 사람이
    // 한 번 눌렀는데 하루치를 다 쓴 것이 된다.
    { $group: { _id: { $ifNull: ['$queueId', '$jobId'] } } },
    { $count: 'n' },
  ]);
  const used = rows[0]?.n || 0;
  return {
    limit: DAILY_CRAWL_LIMIT,
    used,
    left: Math.max(0, DAILY_CRAWL_LIMIT - used),
    resetsAt: new Date(since.getTime() + 24 * 60 * 60 * 1000),
  };
}
