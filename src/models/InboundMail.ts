import mongoose, { Schema, Document } from 'mongoose';

/**
 * 수신 메일 1통 — 이카운트 웹메일 IMAP 으로 수집한 원본.
 *
 * emailData 프로젝트의 `mails` 컬렉션을 vercelData(mongoose) 규약으로 이식한 것.
 * 콜드메일 발송(Lead.emailHistory)의 **답장**을 여기에 쌓고, leadId 로 리드에 연결한다.
 *
 * 설계 근거 (emailData/CLAUDE.md):
 *  - messageId 유니크 → 재수집해도 사람이 붙인 상태·메모를 덮지 않음
 *  - raw 는 목록 조회에서 프로젝션으로 제외 (문서 평균 71KB · 200통이면 14MB)
 *  - 첨부 파일 내용은 저장하지 않고 IMAP 파트번호만 (다운로드 시 스트리밍)
 *  - threadKey 로 "Re: Re: RE:" 반복을 대화 1줄로 접음
 */
export interface IInboundMail extends Document {
  // ── 식별 ──────────────────────────────────────────────
  messageId: string;              // RFC Message-ID (유니크 · 재수집 중복 방지)
  accountId: string;              // 수집한 IMAP 계정 id (기본 'main')
  folder: string;                 // 수집 폴더 (INBOX · INBOX.거래처명 …)
  uid: number;                    // IMAP UID (폴더 내 순번 · 증분 수집 기준)

  // ── 스레드 / 리드 연결 ─────────────────────────────────
  threadKey: string;              // 정규화 제목 + 거래처 스코프 (thread.ts)
  inReplyTo?: string;             // In-Reply-To 헤더 → 우리가 보낸 메일 매칭용
  references?: string[];          // References 헤더 체인
  leadId?: string;                // 매칭된 Lead.leadId (Phase 3 에서 자동 세팅)
  leadMatchedBy?: 'in-reply-to' | 'references' | 'email-address' | 'manual' | null;
  group?: string;                 // 거래처명 (폴더/발신자/도메인/제목 학습 결과)
  groupBy?: string;               // 판정 근거: folder | sender:address | sender:domain | name:<매칭어> | manual
  groupMovedAt?: Date;            // 사람이 직접 폴더를 옮긴 시각 (자동 재분류가 덮지 않게 하는 표시)

  // ── 방향 ──────────────────────────────────────────────
  // 'in'  = 상대가 우리에게 보낸 것 (답장 대상)
  // 'out' = 우리가 보낸 것 (Sent 폴더 수집분 · 기록일 뿐 할 일 아님)
  direction: 'in' | 'out';

  // ── 원문 ──────────────────────────────────────────────
  subject: string;
  from: { name?: string; address: string };
  to?: Array<{ name?: string; address: string }>;
  cc?: Array<{ name?: string; address: string }>;
  date: Date;                     // 메일이 발송된 시각 (정렬 기준 — receivedAt 아님)
  receivedAt: Date;               // 우리가 수집한 시각
  lang?: string;                  // 감지 언어 (ko/en/he/ja …)
  raw?: { text?: string; html?: string };
  bodyStripped?: string;          // 인용부 제거한 본문 (quoted.ts · 분석 입력)
  rawTruncated?: boolean;         // 원문이 커서 잘라 저장했는지 (ingest.ts trimRawForStorage)

  // ── 첨부 (메타만 · 파일 내용은 저장 안 함) ──────────────
  attachments?: Array<{
    filename: string;
    contentType?: string;
    size?: number;
    partId?: string;              // IMAP 파트번호 — 다운로드 시 이걸로 스트리밍
  }>;

  // ── 분류 ──────────────────────────────────────────────
  // b2b(우리 제품을 사려는) · inquiry(문의견적) · partner(제휴)
  // newsletter · ad(우리에게 팔려는) · system(자동발송) · unknown
  classification: 'b2b' | 'inquiry' | 'partner' | 'newsletter' | 'ad' | 'system' | 'unknown';
  classifiedBy?: 'rule' | 'ai' | 'manual' | null;   // manual 이면 재분석이 덮지 않음

  // ── 상태 (사람이 관리) ─────────────────────────────────
  status: 'new' | 'reviewing' | 'replied' | 'archived' | 'ignored';
  memo?: string;
  tags?: string[];
  trashedAt?: Date | null;        // 휴지통 (DB 에서 지우지 않음 · 되짚기 가능)
  // 이 메일에 회신한 시각. 앱에서 보냈든 이카운트 웹메일에서 직접 보냈든 기록된다.
  // 웹메일에서 답한 건은 보낸메일함을 훑어 찾아낸다 (reconcile.ts).
  repliedAt?: Date | null;
  repliedOutside?: boolean;       // 앱 밖(웹메일·휴대폰)에서 답한 건

  // ── 분석 (로컬 무료 / AI 유료) ─────────────────────────
  analysis?: {
    method?: 'local' | 'ai';      // local = 규칙 기반 무료 · ai = Claude 유료
    needsReply?: boolean;
    replyReason?: string;         // 회신이 필요하다고 본 근거
    deadline?: Date | null;       // 회신 기한 (본문에서 추출)
    deadlineText?: string;        // 원문의 기한 표현 그대로 (예: "by end of this month")
    deadlineType?: string | null; // reply_by · quote_due · meeting · payment · contract · event · other
    urgency?: 'high' | 'mid' | 'low';
    topic?: string;
    summary?: string;             // 핵심 정리
    keyPoints?: string[];
    intent?: string;              // 발신자가 우리에게 원하는 것 한 줄
    suggestedAction?: string;     // 담당자가 다음에 할 일 한 줄
    analyzedAt?: Date;
    model?: string;               // 분석에 쓴 모델
    usage?: {                     // AI 호출 시 실제 토큰/비용
      inputTokens?: number;
      outputTokens?: number;
      cacheRead?: number;
      cacheWrite?: number;
      model?: string;
      costKrw?: number;
    };
  };

  // ── 한글 번역 (AI · 유료) ──────────────────────────────
  translation?: {
    subject?: string;
    body?: string;
    translatedAt?: Date;
  };

  // ── 답장 초안 ─────────────────────────────────────────
  drafts?: Array<{
    subject: string;
    body: string;
    createdAt: Date;
    createdBy?: 'ai' | 'manual';
    sentAt?: Date;                // 실제 발송하면 기록
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const AddrSchema = { name: { type: String, default: '' }, address: { type: String, default: '' } };

const InboundMailSchema = new Schema<IInboundMail>({
  messageId: { type: String, required: true },
  accountId: { type: String, default: 'main' },
  folder: { type: String, default: 'INBOX' },
  uid: { type: Number, default: 0 },

  threadKey: { type: String, default: '' },
  inReplyTo: { type: String, default: '' },
  references: { type: [String], default: [] },
  leadId: { type: String, default: '' },
  leadMatchedBy: { type: Schema.Types.Mixed, default: null },
  group: { type: String, default: '' },
  groupBy: { type: String, default: '' },
  groupMovedAt: { type: Date, default: null },   // 사람이 직접 옮긴 시각

  direction: { type: String, enum: ['in', 'out'], default: 'in' },

  subject: { type: String, default: '' },
  from: { type: AddrSchema, default: () => ({ name: '', address: '' }) },
  to: { type: [AddrSchema], default: [] },
  cc: { type: [AddrSchema], default: [] },
  date: { type: Date, default: null },
  receivedAt: { type: Date, default: Date.now },
  lang: { type: String, default: '' },
  raw: {
    text: { type: String, default: '' },
    html: { type: String, default: '' },
  },
  bodyStripped: { type: String, default: '' },
  // 원문이 너무 커서 잘라 저장했는지 (lib/mail/ingest.ts trimRawForStorage).
  // 광고·자동발송은 원문 HTML 을 아예 저장하지 않는다 — 한 통 6MB 짜리가 쌓여 DB 가 꽉 찼었다.
  rawTruncated: { type: Boolean, default: false },

  attachments: {
    type: [{
      filename: String,
      contentType: String,
      size: Number,
      partId: String,
    }],
    default: [],
  },

  classification: {
    type: String,
    enum: ['b2b', 'inquiry', 'partner', 'newsletter', 'ad', 'system', 'unknown'],
    default: 'unknown',
  },
  classifiedBy: { type: Schema.Types.Mixed, default: null },

  status: {
    type: String,
    enum: ['new', 'reviewing', 'replied', 'archived', 'ignored'],
    default: 'new',
  },
  memo: { type: String, default: '' },
  tags: { type: [String], default: [] },
  trashedAt: { type: Date, default: null },
  repliedAt: { type: Date, default: null },
  repliedOutside: { type: Boolean, default: false },

  // ⚠️ 여기 빠진 필드는 mongoose 가 조용히 버린다.
  //    AI 가 만들어 보낸 intent·suggestedAction 이 통째로 사라졌던 적이 있으니,
  //    analyze-mail.ts 의 출력 필드를 늘리면 여기도 반드시 함께 추가할 것.
  analysis: {
    method: { type: Schema.Types.Mixed, default: null },
    needsReply: { type: Schema.Types.Mixed, default: null },
    replyReason: { type: String, default: '' },
    deadline: { type: Date, default: null },
    deadlineText: { type: String, default: '' },
    deadlineType: { type: Schema.Types.Mixed, default: null },
    urgency: { type: Schema.Types.Mixed, default: null },
    topic: { type: String, default: '' },
    summary: { type: String, default: '' },
    keyPoints: { type: [String], default: [] },
    intent: { type: String, default: '' },
    suggestedAction: { type: String, default: '' },
    analyzedAt: { type: Date, default: null },
    model: { type: String, default: '' },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheRead: { type: Number, default: 0 },
      cacheWrite: { type: Number, default: 0 },
      model: { type: String, default: '' },
      costKrw: { type: Number, default: 0 },
    },
  },

  translation: {
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    translatedAt: { type: Date, default: null },
  },

  drafts: {
    type: [{
      subject: String,
      body: String,
      createdAt: { type: Date, default: Date.now },
      createdBy: String,
      sentAt: Date,
    }],
    default: [],
  },
}, { timestamps: true });

// ── 인덱스 (emailData/db.js 이식 · 실측으로 필요했던 것들) ──────────
InboundMailSchema.index({ messageId: 1 }, { unique: true, sparse: true });
// 목록은 전부 date 로 정렬한다. receivedAt 인덱스만 있으면 메모리 정렬이 되어
// 거래처 한 곳만 열어도 수십 초가 걸린다 (emailData 실측).
InboundMailSchema.index({ date: -1 });
InboundMailSchema.index({ receivedAt: -1 });
InboundMailSchema.index({ threadKey: 1, date: -1 });
InboundMailSchema.index({ status: 1, date: -1 });
InboundMailSchema.index({ classification: 1, date: -1 });
InboundMailSchema.index({ 'analysis.needsReply': 1, 'analysis.deadline': 1 });
InboundMailSchema.index({ 'analysis.deadline': 1 });
InboundMailSchema.index({ 'from.address': 1 });
InboundMailSchema.index({ group: 1, date: -1 });
InboundMailSchema.index({ folder: 1 });
InboundMailSchema.index({ accountId: 1, date: -1 });
InboundMailSchema.index({ trashedAt: 1 });
// vercelData 고유 — 리드별 답장 조회
InboundMailSchema.index({ leadId: 1, date: -1 });
InboundMailSchema.index({ direction: 1, date: -1 });

export const InboundMail =
  (mongoose.models.InboundMail as mongoose.Model<IInboundMail>) ||
  mongoose.model<IInboundMail>('InboundMail', InboundMailSchema);
