import mongoose, { Schema, Document } from 'mongoose';

/**
 * 폴더별 증분 수집 기준점.
 *
 * IMAP UID 는 **메일함 안에서만** 유일한 번호다. 계정이 둘 이상이면 같은 'INBOX'
 * 라도 서로 다른 메일을 가리키므로 accountId + folder 조합으로 유일해야 한다.
 * 하나로 묶으면 한쪽 lastUid 가 다른 쪽을 건너뛰어 메일이 조용히 누락된다.
 * (emailData/store.js 실측 근거)
 *
 * vercelData 는 이카운트 단일 계정만 쓰지만, 계정이 늘어날 여지를 남겨
 * 원본과 같은 키 구조를 유지한다.
 */
export interface IMailSyncState extends Document {
  accountId: string;              // 기본 'main'
  folder: string;                 // INBOX · INBOX.거래처명 …
  lastUid: number;                // 성공적으로 처리한 최대 UID (중단 시 여기서 이어받음)
  lastSyncAt?: Date;
  lastError?: string;             // 마지막 실패 사유 (연결 실패 진단용)
  createdAt: Date;
  updatedAt: Date;
}

const MailSyncStateSchema = new Schema<IMailSyncState>({
  accountId: { type: String, default: 'main' },
  folder: { type: String, required: true },
  lastUid: { type: Number, default: 0 },
  lastSyncAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
}, { timestamps: true });

MailSyncStateSchema.index({ accountId: 1, folder: 1 }, { unique: true });

export const MailSyncState =
  (mongoose.models.MailSyncState as mongoose.Model<IMailSyncState>) ||
  mongoose.model<IMailSyncState>('MailSyncState', MailSyncStateSchema);
