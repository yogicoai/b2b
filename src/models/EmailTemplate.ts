import mongoose, { Schema, Document } from 'mongoose';

/**
 * B2B 아웃바운드 메일 템플릿.
 * 변수 지원: {{Company}}, {{Region}}, {{BuyerContact}}, {{Title}} 등 → 발송 시 lead 값으로 치환.
 */
export interface IEmailTemplate extends Document {
  name: string;                // 관리용 이름 (예: "1차 소개 - 영문")
  language: 'ko' | 'en';
  subject: string;             // 제목 (변수 치환 가능)
  body: string;                // 본문 (HTML 또는 텍스트, 변수 치환 가능)
  bodyIsHtml: boolean;
  purpose: 'intro' | 'followup' | 're-engage' | 'partner-onboarding' | 'other';
  /**
   * 어느 타깃 카테고리에 쓰는 양식인가 (public|company|medical|resort|sports).
   *
   * 해외판에는 없던 칸이다. 해외 바이어는 전부 같은 제안을 하니 양식을 갈라 둘
   * 이유가 없었다. 국내는 병원 대기실과 호텔 로비에 같은 메일을 보낼 수 없다 —
   * 제안하는 공간도, 소구점도, 예산 주체도 다르다.
   *
   * 빈 값이면 '카테고리 안 가리는 공용 양식'이다. 발송 화면은 리드의 category 와
   * 같은 양식을 먼저 고르고, 없으면 공용 양식으로 떨어진다.
   */
  category?: string;
  isActive: boolean;
  // 발송 시 선택된 메일 계정의 서명 블록 (이름/직함/회사/이메일/전화) 자동 추가
  // 사용자가 본문에 발송자 정보를 손대지 않아도 되게 함
  appendAccountSignature: boolean;
  // 첨부파일 — 파일 대신 주소(cafe24 오픈호스팅 등)를 두고, 보내는 순간 받아서 붙인다
  // (lib/mail/template-attachments.ts)
  attachments: Array<{ name: string; url: string }>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>({
  name: { type: String, required: true },
  language: { type: String, enum: ['ko', 'en'], default: 'en' },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  bodyIsHtml: { type: Boolean, default: false },
  purpose: {
    type: String,
    enum: ['intro', 'followup', 're-engage', 'partner-onboarding', 'other'],
    default: 'intro',
  },
  category: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  appendAccountSignature: { type: Boolean, default: true },
  attachments: {
    type: [{ _id: false, name: { type: String, default: '' }, url: { type: String, required: true } }],
    default: [],
  },
  createdBy: { type: String, default: '' },
}, { timestamps: true });

// 발송 화면이 "이 리드 카테고리에 맞는 살아있는 양식" 을 매번 찾는다
EmailTemplateSchema.index({ category: 1, isActive: 1 });

export const EmailTemplate =
  (mongoose.models.EmailTemplate as mongoose.Model<IEmailTemplate>) ||
  mongoose.model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);
