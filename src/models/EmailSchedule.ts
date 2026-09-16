import mongoose, { Schema, Document } from 'mongoose';

/**
 * B2B 메일 예약 발송 큐.
 * 크론(GitHub Actions 또는 유사)이 주기적으로 due 항목을 처리.
 */
export interface IEmailSchedule extends Document {
  leadId: string;              // 대상 lead
  templateId: string;
  mailAccountId?: string;      // 발송에 쓸 SMTP 계정 (없으면 env 기본)
  to: string;                  // 수신자 이메일
  scheduledFor: Date;          // 발송 예정 시각
  status: 'pending' | 'sent' | 'failed' | 'canceled';
  sentAt?: Date;
  attempts: number;
  lastError?: string;
  // 왜 취소됐는지. 사람이 발송함에서 직접 취소한 것과, 리드를 [검증 실패]로
  // 옮기면서 함께 끊긴 것은 나중에 보면 구별이 안 된다. 그 이유를 남긴다.
  canceledReason?: string;
  batchId?: string;            // 예약 배치 ID (한 번에 여러 대상 예약 시 그룹핑)
  // ── 자동 재발송(팔로우업) ──────────────────────────────
  // 이 예약이 몇 번째 메일인가. 1 = 첫 발송, 2·3 = 답이 없어 다시 보내는 것.
  // 발송 한도(MAX_SEND_COUNT_PER_LEAD=3)와 같은 축이라 여기 둔다.
  attemptNo?: number;
  // 답이 없으면 다음 메일을 자동으로 잡을지. 답장이 오면 리드가 replied 로
  // 올라가고, 팔로우업 생성 단계에서 걸러진다.
  followUp?: boolean;
  followUpDays?: number;       // 몇 일 뒤에 다시 보낼지 (기본 7)
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailScheduleSchema = new Schema<IEmailSchedule>({
  leadId: { type: String, required: true, index: true },
  templateId: { type: String, required: true },
  mailAccountId: { type: String, default: '' },
  to: { type: String, required: true },
  scheduledFor: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'canceled'],
    default: 'pending',
    index: true,
  },
  sentAt: { type: Date },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  canceledReason: { type: String, default: '' },
  batchId: { type: String, default: '' },
  attemptNo: { type: Number, default: 1 },
  followUp: { type: Boolean, default: false },
  followUpDays: { type: Number, default: 7 },
  createdBy: { type: String, default: '' },
}, { timestamps: true });

// Cron 이 due 항목 pull 할 때 최적화
EmailScheduleSchema.index({ status: 1, scheduledFor: 1 });

export const EmailSchedule =
  (mongoose.models.EmailSchedule as mongoose.Model<IEmailSchedule>) ||
  mongoose.model<IEmailSchedule>('EmailSchedule', EmailScheduleSchema);
