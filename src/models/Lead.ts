import mongoose, { Schema, Document } from 'mongoose';
import { STAGES } from '@/lib/stages';

export interface ILead extends Document {
  leadId: string;
  Region: string;
  Company: string;
  Priority: string;
  Type: string;
  Evidence: string;
  BrandsChannels: string;
  LinkedInCompany: string;
  BuyerContact: string;
  ContactLinkedIn: string;
  RoleMemo: string;
  WebsiteContact: string;
  Email: string;
  Phone: string;
  Address: string;
  Approach: string;
  Sources: string;
  Checked: string;
  Confidence: string;
  Title: string;
  
  // ── 국내 B2B 전용 필드 ────────────────────────────────
  // 해외판은 리드를 '국가'로 갈랐지만 국내는 나라가 하나뿐이다. 대신 "어디에 놓을
  // 빈백인가"(category)가 1차 축이 되고, Region 은 시·도로 의미가 바뀌었다.

  /** 타깃 카테고리 — public|company|medical|resort|sports (lib/domain/categories.ts) */
  category?: string;
  /** 이 업체를 찾아낸 검색 키워드 — 어떤 키워드가 쓸 만한지 되짚는 데 쓴다 */
  keyword?: string;
  /** 네이버 지역검색이 붙여 준 업종 문자열 (예: "숙박>리조트") */
  naverCategory?: string;
  // 전화번호는 따로 두지 않는다 — 해외판에서 물려받은 Phone 필드를 그대로 쓴다.
  // 같은 값을 두 칸에 두면 검증(lib/verify.ts)이 읽는 칸과 화면이 보여주는 칸이
  // 갈라져서, 화면에는 번호가 있는데 검증은 "번호 없음"으로 뜨는 일이 생긴다.
  /** 도로명 주소 — Region 은 여기서 뽑는다 (lib/domain/regions.ts) */
  address?: string;
  /** 수집 경로 — naver_local | naver_web | manual | import */
  crawlSource?: string;
  crawledFromUrl?: string;
  /** 수신거부한 곳 — 발송 대상 산정에서 무조건 빠진다 */
  unsubscribed?: boolean;
  unsubscribedAt?: string;

  // Custom CRM fields
  status: string;
  owner?: string;
  lastContact?: string;
  nextFollowUp?: string;
  notes?: string;
  favorite?: boolean;

  // Import tracking
  importBatch?: string;   // e.g. "import-20260511-092006"
  importedAt?: string;    // ISO date string
  registeredAt?: string;  // 신규 등록 timestamp (중복 아닌 진짜 신규만)
  updatedInfoAt?: string; // 회사 정보 마지막 업데이트 시각

  // 워크플로 stage — 파이프라인 핵심 상태 (좌 → 우 순서로 진행)
  //   imported    : 엑셀 업로드만 됨 (검증 안 함)
  //   ai-searched : AI 웹 서칭으로 발굴된 후보 (사용자 검토 대기 — 검증대기로 승격 or 제외)
  //   verifying   : 검증 진행 중
  //   verified    : 검증 통과 = 컨택 대상 대기열
  //   contacted   : 첫 B2B 메일 발송 완료 (응답 대기)
  //   replied     : 상대방 답장 옴 (팔로우업 필요)
  //   negotiating : 미팅/샘플/조건 협상 중
  //   partner     : 계약 성사 = 최종 완료 (자동 메일 발송 대상에서 자동 제외)
  //   archived    : 무효/폐기
  //   failed      : 검증 실패 (컨택 수단 없음 등)
  stage?: 'imported' | 'ai-searched' | 'verifying' | 'verified' | 'queued' | 'contacted' | 'replied' | 'negotiating' | 'partner' | 'archived' | 'failed';
  stageChangedAt?: string;
  /**
   * 사람이 화면에서 직접 등록한 회사인가.
   *
   * [대화 진행 중]·[파트너십 확정]에는 이미 다른 경로로 연락이 닿아 있던 곳을
   * 손으로 넣게 된다. 그런 곳은 검증·발송 단계를 거치지 않았으므로,
   * "왜 이 회사는 근거도 점수도 없지" 를 나중에 설명할 수 있어야 한다.
   */
  addedManually?: boolean;
  becamePartnerAt?: string;    // 파트너 성사 시각 (최종 완료 timestamp)
  readyForOutreach?: boolean;  // 발송 승인 게이트 — verified 후 대표가 승인해야 자동 발송 대상

  // 웹사이트에서 크롤링한 이메일 (원본 Email 필드와 별개)
  crawledEmails?: string[];
  crawledAt?: string;

  // B2B 메일 발송 이력
  emailHistory?: Array<{
    subject: string;
    body?: string;        // 본문 요약 (전체는 EmailTemplate 참조)
    templateId?: string;  // 사용된 템플릿 ID
    to: string;           // 수신 이메일
    sentAt: string;       // 실제 발송 시각
    scheduledFor?: string;// 예약된 시각
    status: 'sent' | 'scheduled' | 'failed' | 'canceled';
    error?: string;
    // 발송한 메일의 RFC Message-ID.
    // 상대 답장의 In-Reply-To 헤더가 이 값을 가리키므로, 수신 메일을
    // 어느 리드의 답장인지 확정하는 가장 정확한 열쇠다 (InboundMail 매칭용).
    messageId?: string;
  }>;
  lastEmailSentAt?: string;  // 마지막 발송 시각 (파트너로 이동 시 자동 필드)

  // ── 수신 답장 연결 (emailData 통합) ──────────────────────
  // 실제 수신 메일 본문은 InboundMail 컬렉션에 있고, 여기엔 요약 지표만 둔다.
  // 리스트 화면에서 "답장 N통" 배지를 그리려고 매번 조인하면 느려지기 때문.
  threadKeys?: string[];      // 이 리드와 연결된 대화 스레드 키들
  inboundCount?: number;      // 받은 답장 통수
  lastInboundAt?: string;     // 마지막 답장 수신 시각 (ISO)
  needsReply?: boolean;       // 마지막 답장이 회신을 요구하는 상태인지 (로컬 분석 결과)
  replyDeadline?: string;     // 회신 기한 (본문에서 추출 · 아직 안 지난 것 중 가장 이른 것)

  // Verification (자동 정합성 검증 결과)
  verification?: {
    emailValid?: boolean | null;     // null = 미검사
    emailReason?: string;            // 실패 사유 (syntax/no-mx/disposable)
    websiteAlive?: boolean | null;
    websiteStatus?: number;          // HTTP status 또는 0(unreachable)
    phoneMatch?: boolean | null;     // 지역코드 매칭
    phoneReason?: string;            // unknown-region/too-short/expected +N
    linkedinValid?: boolean | null;
    linkedinReason?: string;         // format
    // 사업 관련성 (K-beauty)
    businessLevel?: 'relevant' | 'unclear' | 'unrelated' | null;
    businessScore?: number;          // 0~3
    businessKeywords?: string[];     // 매칭된 키워드 샘플
    businessReason?: string;         // no-url / fetch-failed / invalid-url
    businessEvidence?: {
      title?: string;                // <title> 추출
      description?: string;          // <meta description> 추출
      h1?: string;                   // 첫 <h1> 추출
      titleHit?: string;             // 타이틀 매칭 키워드
      metaHit?: string;              // 메타 매칭 키워드
    };
    score?: number;                  // 종합 0~5 (4 정합성 + 1 관련성)
    verifiedAt?: string;             // ISO
    // AI 정밀 검증 (Claude API)
    aiVerdict?: 'target-fit' | 'maybe' | 'not-fit' | null;
    aiConfidence?: 'high' | 'medium' | 'low' | null;
    aiReasoning?: string;            // 한국어 1~2문장
    aiSignals?: string[];            // 판단 근거
    aiVerifiedAt?: string;           // ISO
  };
}

const LeadSchema: Schema = new Schema({
  leadId: { type: String, required: true, unique: true },
  Region: { type: String, default: '' },
  Company: { type: String, default: '' },
  Priority: { type: String, default: '' },
  Type: { type: String, default: '' },
  // Type 을 정해진 몇 개로 접은 값. Type 자체는 엑셀 컬럼이라 손대지 않는다.
  //
  // 발굴 워크플로우가 Type 에 "Retail Chain (온라인 드럭스토어·E-commerce 리테일러)"
  // 같은 문장을 적어 넣는 바람에 60종류가 생겼고, "유통사만 보여줘"가 불가능해졌다.
  // 클라이언트가 "디스트리뷰터를 꼼꼼히 보고 싶다"고 해서 필터 가능한 축을 따로 둔다.
  // 값: Distributor | Brand/Manufacturer | Retail Chain | Online Store | Retailer | Clinic | Other
  Category: { type: String, default: '' },

  // 영문 원문의 한국어본.
  //
  // 발굴 워크플로우가 근거·업종을 영어로 적어 넣는다. 쓰는 사람이 전부
  // 한국인이라 화면에서는 한국어로 읽는 편이 낫지만, 원문(Evidence/Type)은
  // 엑셀 컬럼이자 출처 대조용이라 덮어쓰지 않고 옆에 따로 둔다.
  // 화면은 한국어본이 있으면 그것을, 없으면 원문을 보여준다.
  EvidenceKo: { type: String, default: '' },
  TypeKo: { type: String, default: '' },

  // 발송 우선순위 (src/lib/reco-score.ts).
  // 매번 계산하면 정렬·페이지네이션을 DB 에 맡길 수 없어 저장해 둔다.
  // 규칙을 고치면 scripts/rebuild-reco.mjs 를 다시 돌려야 값이 맞는다.
  recoScore: { type: Number, default: 0 },
  recoReasons: { type: [String], default: [] },
  Evidence: { type: String, default: '' },
  BrandsChannels: { type: String, default: '' },
  LinkedInCompany: { type: String, default: '' },
  BuyerContact: { type: String, default: '' },
  ContactLinkedIn: { type: String, default: '' },
  RoleMemo: { type: String, default: '' },
  WebsiteContact: { type: String, default: '' },
  Email: { type: String, default: '' },
  Phone: { type: String, default: '' },
  Address: { type: String, default: '' },
  Approach: { type: String, default: '' },
  Sources: { type: String, default: '' },
  Checked: { type: String, default: '' },
  Confidence: { type: String, default: '' },
  Title: { type: String, default: '' },
  
  status: { type: String, default: 'New' },
  owner: { type: String, default: '' },
  lastContact: { type: String, default: '' },
  nextFollowUp: { type: String, default: '' },
  notes: { type: String, default: '' },
  favorite: { type: Boolean, default: false },
  importBatch: { type: String, default: '' },
  importedAt: { type: String, default: '' },
  registeredAt: { type: String, default: '' },
  updatedInfoAt: { type: String, default: '' },

  // 새 파이프라인 stage
  stage: {
    type: String,
    // queued = 발송 리스트. 검증만 끝난 것(verified)과 "이제 보내도 된다"고
    // 사람이 정한 것을 구분하려고 둔다. 이 구분이 없으면 검증 통과한 전 건이
    // 곧바로 발송 대상이 되어, 고르는 단계 자체가 사라진다.
    enum: STAGES,
    default: 'imported',
    index: true,
  },
  stageChangedAt: { type: String, default: '' },
  addedManually: { type: Boolean, default: false },
  becamePartnerAt: { type: String, default: '' },
  readyForOutreach: { type: Boolean, default: false },

  // ── 국내 B2B 전용 필드 ──
  category: { type: String, default: '' },
  keyword: { type: String, default: '' },
  naverCategory: { type: String, default: '' },
  address: { type: String, default: '' },
  crawlSource: { type: String, default: '' },
  crawledFromUrl: { type: String, default: '' },
  unsubscribed: { type: Boolean, default: false },
  unsubscribedAt: { type: String, default: '' },

  // 크롤링한 이메일
  crawledEmails: { type: [String], default: [] },
  crawledAt: { type: String, default: '' },

  // B2B 메일 발송 이력
  emailHistory: {
    type: [{
      subject: String,
      body: String,
      templateId: String,
      to: String,
      sentAt: String,
      scheduledFor: String,
      status: { type: String, enum: ['sent', 'scheduled', 'failed', 'canceled'] },
      error: String,
      messageId: String,   // 답장의 In-Reply-To 가 가리키는 값 (수신 매칭 키)
    }],
    default: [],
  },
  lastEmailSentAt: { type: String, default: '' },

  // ── 중복 정리 흔적 ──────────────────────────────────────
  // 스크립트가 raw driver 로 쓰던 필드지만, 이제 매칭 코드가 읽으므로 스키마에 둔다.
  // (선언하지 않으면 mongoose 를 통한 쓰기에서 조용히 버려진다)
  // dedupKeeperLeadId 는 특히 중요하다 — 답장이 archived 사본이 아니라
  // 진짜 리드(keeper)에 붙게 하는 열쇠다.
  dedupArchivedAt: { type: String, default: '' },
  dedupOriginalStage: { type: String, default: '' },
  dedupKeeperLeadId: { type: String, default: '' },
  dedupReason: { type: String, default: '' },
  // 올린 업체 화면에서 옮긴 흔적 (되돌리기용 — api/leads/legacy POST).
  // 선언이 없어서 mongoose 가 조용히 버리고 있었다: 옮긴 뒤 "원래 어디에 있었는지" 가 남지 않았다.
  restoredFrom: { type: String, default: '' },
  restoredAt: { type: Date, default: null },
  // 일괄 stage 이동 흔적 (되돌리기용)
  bulkMoveTag: { type: String, default: '' },
  bulkMoveFrom: { type: String, default: '' },
  bulkMoveAt: { type: String, default: '' },
  bulkMoveReason: { type: String, default: '' },

  // 수신 답장 요약 지표 (본문은 InboundMail 컬렉션)
  threadKeys: { type: [String], default: [] },
  inboundCount: { type: Number, default: 0 },
  lastInboundAt: { type: String, default: '' },
  needsReply: { type: Boolean, default: false },
  replyDeadline: { type: String, default: '' },

  verification: {
    emailValid: { type: Schema.Types.Mixed, default: null },
    emailReason: { type: String, default: '' },
    websiteAlive: { type: Schema.Types.Mixed, default: null },
    websiteStatus: { type: Number, default: 0 },
    phoneMatch: { type: Schema.Types.Mixed, default: null },
    phoneReason: { type: String, default: '' },
    linkedinValid: { type: Schema.Types.Mixed, default: null },
    linkedinReason: { type: String, default: '' },
    businessLevel: { type: Schema.Types.Mixed, default: null },
    businessScore: { type: Number, default: 0 },
    businessKeywords: { type: [String], default: [] },
    businessReason: { type: String, default: '' },
    businessEvidence: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      h1: { type: String, default: '' },
      titleHit: { type: String, default: '' },
      metaHit: { type: String, default: '' },
    },
    score: { type: Number, default: 0 },
    verifiedAt: { type: String, default: '' },
    aiVerdict: { type: Schema.Types.Mixed, default: null },
    aiConfidence: { type: Schema.Types.Mixed, default: null },
    aiReasoning: { type: String, default: '' },
    aiSignals: { type: [String], default: [] },
    aiVerifiedAt: { type: String, default: '' },
  },
}, { timestamps: true });

// ── 복합 인덱스 (핫 쿼리 최적화) ─────────────────────────
// 파이프라인 카운트 · 서브필터 · 티어 계산 등에서 반복 사용됨
LeadSchema.index({ stage: 1, readyForOutreach: 1 });
LeadSchema.index({ stage: 1, crawledAt: 1 });
LeadSchema.index({ stage: 1, 'verification.aiVerdict': 1 });
LeadSchema.index({ stage: 1, Region: 1 });
// 화면이 거의 항상 "카테고리 × 단계"로 묻는다 — 카테고리 현황, 카테고리별 검토 목록.
LeadSchema.index({ category: 1, stage: 1 });
// (Email 인덱스는 이 파일 위쪽에 이미 선언돼 있다 — 중복 선언하면 mongoose 가 경고한다)
LeadSchema.index({ stage: 1, createdAt: -1 });   // 페이지네이션 정렬
// leadId 는 필드 정의에서 이미 unique: true 라 여기서 다시 선언하지 않는다
// (중복 선언 시 mongoose 가 "Duplicate schema index" 경고를 낸다)
LeadSchema.index({ importBatch: 1 });

// ── 수신 답장 매칭 (emailData 통합) ──────────────────────
// 답장의 In-Reply-To → 우리가 보낸 messageId 역추적 (가장 정확한 매칭 경로)
LeadSchema.index({ 'emailHistory.messageId': 1 });
// In-Reply-To 로 못 찾았을 때 발신 주소 fallback 매칭
LeadSchema.index({ Email: 1 });
// 스레드 키로 리드 역참조
LeadSchema.index({ threadKeys: 1 });
// "회신 필요 + 기한 임박" 대시보드 조회
LeadSchema.index({ needsReply: 1, replyDeadline: 1 });
LeadSchema.index({ stage: 1, lastInboundAt: -1 });

export const Lead = mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema);
