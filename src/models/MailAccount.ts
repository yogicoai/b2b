import mongoose, { Schema, Document } from 'mongoose';

/**
 * 클라이언트가 자신의 SMTP 계정을 등록하고 다계정으로 발송 관리.
 * SMTP 비밀번호는 서버에서 AES-256-GCM 으로 암호화 후 저장 (평문 절대 X).
 * 복호화는 오직 서버 내부 sendMail 시점에서만.
 */
export interface IMailAccount extends Document {
  owner: string;              // AdminUser.username
  accountName: string;        // 사용자 별칭 (예: "PR팀", "영업")

  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassEnc: string;        // AES-256-GCM: "iv:tag:ciphertext" (hex)

  fromName: string;
  fromAddress: string;

  // 발송자 서명 자동 부착에 사용
  senderTitle?: string;       // 예: "Head of Global Partnerships" (옵션)
  senderPhone?: string;       // 예: "+82 10 6747 9443"
  senderCompany?: string;     // 예: "Yogi Corporation Inc."
  senderAddress?: string;     // 예: "201, 125, Bongeunsa-ro, Gangnam-gu, Seoul, Korea"
  senderWebsite?: string;     // 예: "www.yogico.kr"

  isDefault: boolean;
  /** 테스트 발송 전용 계정 — 대량 발송이 대표 주소로 나가지 않게 분리 */
  isTestSender?: boolean;         // 기본 발송 계정
  isActive: boolean;

  /**
   * 이 계정에서 수집할 IMAP 폴더 목록.
   *
   * 이카운트는 SMTP/IMAP 자격증명이 같아서, 등록된 발송 계정이 곧 수신 계정이 된다.
   * 대표 메일함처럼 거래처별로 폴더를 나눠 둔 경우 여기에 폴더명을 넣어야 한다 —
   * **비워두면 INBOX 만 수집되어 거래처 폴더로 들어온 메일을 통째로 놓친다.**
   * 폴더명은 그대로 거래처(group) 이름이 된다.
   */
  imapFolders?: string[];

  lastVerifiedAt?: string;    // 마지막 성공적으로 SMTP 연결한 시각
  lastVerifyError?: string;   // 마지막 verify 실패 사유
  backfilledAt?: Date | null; // [📥 2달 가져오기]를 끝낸 시각 — 없으면 새 아이디 첫 로그인 때 자동으로 돈다
  backfillCursor?: any;       // 2달 가져오기 중간 위치 (창을 닫아도 이어 간다)

  createdAt: Date;
  updatedAt: Date;
}

const MailAccountSchema = new Schema<IMailAccount>({
  owner: { type: String, required: true, index: true },
  accountName: { type: String, required: true },

  smtpHost: { type: String, required: true },
  smtpPort: { type: Number, default: 465 },
  smtpSecure: { type: Boolean, default: true },
  smtpUser: { type: String, required: true },
  smtpPassEnc: { type: String, required: true },

  fromName: { type: String, default: '' },
  fromAddress: { type: String, required: true },

  senderTitle: { type: String, default: '' },
  senderPhone: { type: String, default: '' },
  senderCompany: { type: String, default: '' },
  senderAddress: { type: String, default: '' },
  senderWebsite: { type: String, default: '' },

  isDefault: { type: Boolean, default: false },

  // 테스트 발송 전용 계정.
  //
  // isDefault 는 수신함 기본 계정이자 답장 발신 계정이라 대표 주소여야 한다
  // (메일이 전부 거기 쌓여 있다). 그런데 대량 발송 테스트를 대표 주소로 하면
  // 실수 한 번에 실거래 메일까지 스팸함으로 들어간다.
  // 그래서 "먼저 보내는 메일"의 기본 발신만 따로 지정한다.
  isTestSender: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  imapFolders: { type: [String], default: [] },

  lastVerifiedAt: { type: String, default: '' },
  lastVerifyError: { type: String, default: '' },

  // [📥 전체 메일함 2달 가져오기] — 새 아이디로 처음 로그인하면 자동으로 돈다(한 번만).
  // 끝나면 backfilledAt 을 찍고, 중간에 창을 닫으면 backfillCursor 에서 이어 간다 (lib/mail/ingest.ts runBackfill)
  backfilledAt: { type: Date, default: null },
  backfillCursor: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true });

// 소유자별로 accountName + smtpUser 조합은 unique (같은 계정 중복 등록 방지)
MailAccountSchema.index({ owner: 1, smtpUser: 1 }, { unique: true });

export const MailAccount =
  (mongoose.models.MailAccount as mongoose.Model<IMailAccount>) ||
  mongoose.model<IMailAccount>('MailAccount', MailAccountSchema);
