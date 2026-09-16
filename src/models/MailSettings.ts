import mongoose, { Schema, Document } from 'mongoose';

/**
 * 수신(IMAP) 설정 — 싱글톤 (_id 고정 'main').
 *
 * emailData 의 settings 컬렉션을 이식하되, **이카운트 웹메일 전용**으로 단순화했다.
 * (원본은 Gmail·네이버 등 범용 IMAP 프리셋을 제공했으나 vercelData 는 회사 기업메일만 사용)
 *
 * 보안:
 *  - imapPassEnc 는 AES-256-GCM 암호화 저장 (crypto.ts · MailAccount 와 동일 규약)
 *  - 화면에는 절대 내려보내지 않고 "저장됨" 여부(boolean)만 노출
 *  - 빈 값으로 저장하면 기존 비밀번호 유지 (다른 설정만 고치다 실수로 지워지는 것 방지)
 */

/** 이카운트 웹메일 고정 서버 정보 — 화면에서 바꿀 필요 없음 */
export const ECOUNT_IMAP_HOST = 'wmbox4.ecount.com';
export const ECOUNT_IMAP_PORT = 993;
export const ECOUNT_SMTP_HOST = 'wsmtp.ecount.com';
export const ECOUNT_SMTP_PORT = 465;

/**
 * 이카운트 IMAP 이 안 될 때 안내 문구.
 * 인증 실패는 'Command failed' 만 올라와서 원인 파악이 안 되므로 힌트를 붙인다.
 */
export const ECOUNT_IMAP_HINT =
  '이카운트 웹메일 → 개인기능설정 → 외부연동설정에서 "메일 클라이언트 사용"을 켜야 합니다.';

// _id 를 문자열('main')로 쓰므로 Document 의 id 타입을 string 으로 지정한다
// (기본값은 ObjectId 라 그대로 두면 타입이 충돌한다)
export interface IMailSettings extends Document<string> {
  _id: string;                    // 항상 'main'

  // ── 수신 (IMAP · 이카운트 고정) ────────────────────────
  imapHost: string;               // 기본 wmbox4.ecount.com
  imapPort: number;               // 기본 993
  imapSecure: boolean;
  imapUser: string;               // 예: david@yogico.kr
  imapPassEnc: string;            // AES-256-GCM "iv:tag:ciphertext"

  imapFolder: string;             // 새 메일이 들어오는 폴더 (기본 INBOX)
  imapFolders: string[];          // 함께 수집할 거래처 폴더 (INBOX.Yogibo Japan 등)
                                  // 비어 있으면 INBOX 만 수집 → 거래처 폴더 메일을 놓친다
  retiredGroups: string[];        // 웹메일에서 사라진 폴더명 (목록에서 제외 · 메일은 보존)

  // ── 규칙 필터 (무료) ───────────────────────────────────
  blockedDomains: string[];       // 광고로 확정할 발신 도메인
  blockedKeywords: string[];      // 광고로 확정할 제목 키워드
  systemSenders: string[];        // 사내 자동화 알림 주소 → ad 아닌 system 으로 라벨

  // ── 수집 ──────────────────────────────────────────────
  fetchLimit: number;             // 1회 수집 최대 통수 (기본 50)

  // ── AI (유료 · 비용 상한) ──────────────────────────────
  claudeModel: string;            // 기본 claude-haiku-4-5 (통당 약 ₩9)
  autoAnalyze: boolean;           // 수집 직후 AI 분석까지 자동 실행할지
                                  // 기본 false — 켜면 수집할 때마다 상한 없이 과금됨
  dailyAnalyzeLimit: number;      // 하루 AI 요약 최대 통수 (기본 20 · 비용 상한)

  // ── 일일 브리핑 ────────────────────────────────────────
  briefingEmail: string;          // 비우면 메일 발송 없이 화면에서만
  briefingDays: number;           // 브리핑에 담을 기간(일). 월요일에 주말치까지 보려면 3

  // ── 답장 매칭 (vercelData 고유) ────────────────────────
  autoMatchLead: boolean;         // 수신 메일을 Lead 에 자동 매칭할지 (기본 true)
  autoMoveToReplied: boolean;     // 매칭 성공 시 Lead.stage 를 'replied' 로 자동 이동 (기본 true)

  lastIngestAt?: Date;
  lastIngestError?: string;

  createdAt: Date;
  updatedAt: Date;
}

const MailSettingsSchema = new Schema<IMailSettings>({
  _id: { type: String, default: 'main' },

  imapHost: { type: String, default: ECOUNT_IMAP_HOST },
  imapPort: { type: Number, default: ECOUNT_IMAP_PORT },
  imapSecure: { type: Boolean, default: true },
  imapUser: { type: String, default: '' },
  imapPassEnc: { type: String, default: '' },

  imapFolder: { type: String, default: 'INBOX' },
  imapFolders: { type: [String], default: [] },
  retiredGroups: { type: [String], default: [] },

  blockedDomains: { type: [String], default: [] },
  blockedKeywords: {
    type: [String],
    default: ['(광고)', '[광고]', '무료체험', 'unsubscribe'],
  },
  systemSenders: { type: [String], default: [] },

  fetchLimit: { type: Number, default: 50 },

  claudeModel: { type: String, default: 'claude-haiku-4-5' },
  autoAnalyze: { type: Boolean, default: false },
  dailyAnalyzeLimit: { type: Number, default: 20 },

  briefingEmail: { type: String, default: '' },
  briefingDays: { type: Number, default: 1 },

  autoMatchLead: { type: Boolean, default: true },
  autoMoveToReplied: { type: Boolean, default: true },

  lastIngestAt: { type: Date, default: null },
  lastIngestError: { type: String, default: '' },
}, { timestamps: true, _id: false });

export const MailSettings =
  (mongoose.models.MailSettings as mongoose.Model<IMailSettings>) ||
  mongoose.model<IMailSettings>('MailSettings', MailSettingsSchema);

/** 화면 전달용 — 비밀번호는 설정 여부만 */
export function sanitizeMailSettings(doc: any): any {
  if (!doc) return null;
  const { imapPassEnc, __v, ...rest } = doc.toObject ? doc.toObject() : doc;
  return { ...rest, imapPassSet: Boolean(imapPassEnc) };
}
