/**
 * 수신거부 명단.
 *
 * 한 번 거부한 주소로 다시 보내는 것이 정보통신망법 위반 중 제일 흔한 사고다.
 * 리드 문서에 플래그만 두면 리드를 지우거나 다시 수집했을 때 거부 이력이 같이
 * 사라진다. 그래서 리드와 별개인 컬렉션에 이메일 자체로 남긴다 —
 * 같은 업체를 내년에 다시 크롤링해도 이 명단이 먼저 걸러낸다.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IUnsubscribe extends Document {
  email: string;
  reason?: string;
  source?: 'link' | 'manual' | 'bounce';
  createdAt: Date;
}

const UnsubscribeSchema = new Schema<IUnsubscribe>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  reason: { type: String, default: '' },
  source: { type: String, enum: ['link', 'manual', 'bounce'], default: 'link' },
  createdAt: { type: Date, default: Date.now },
});

export const Unsubscribe =
  (mongoose.models.Unsubscribe as mongoose.Model<IUnsubscribe>) ||
  mongoose.model<IUnsubscribe>('Unsubscribe', UnsubscribeSchema);

/** 주어진 주소들 중 수신거부된 것만 소문자 Set 으로 돌려준다. */
export async function findUnsubscribed(emails: string[]): Promise<Set<string>> {
  const list = emails.map((e) => String(e || '').toLowerCase()).filter(Boolean);
  if (!list.length) return new Set();
  const docs = await Unsubscribe.find({ email: { $in: list } }).select('email').lean();
  return new Set(docs.map((d: { email: string }) => d.email));
}
