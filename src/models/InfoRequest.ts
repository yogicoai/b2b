import mongoose, { Schema, Document } from 'mongoose';

/**
 * 업체 정보 요청 — "이 업체들에 대해 이런 것까지 알고 싶다" 를 받아 두는 곳.
 *
 * 왜 필요한가:
 * 지금 화면에는 회사명·지역·이메일·홈페이지와 AI 판단 근거가 들어 있다.
 * 그런데 실제로 영업을 하는 사람이 보고 싶은 것은 그것만이 아니다 —
 * "메일을 누구 앞으로 보내야 하나", "이미 한국 화장품을 수입하고 있나",
 * "매장이 몇 개인가" 같은 것들이다. 그건 쓰는 사람만 안다.
 *
 * 말로 전달하면 흘러가 버리므로, 화면에서 직접 적어 남기게 한다.
 * 적힌 항목을 보고 업체별로 찾아서 채워 넣는 것이 다음 작업이 된다.
 *
 * 일부러 단순하게 만들었다 — 적는 칸 하나와 상태 하나뿐이다.
 * 항목을 미리 정해두면 거기 없는 요청은 안 적게 되는데, 정작 중요한 것은
 * 우리가 미리 못 떠올린 쪽에 있다.
 */
export interface IInfoRequest extends Document {
  body: string;                    // 요청 내용 (자유 서술)
  scope: string;                   // 어느 화면에서 적었나 — verified | legacy | ...
  status: 'open' | 'doing' | 'done';
  createdBy: string;               // 적은 사람 (로그인 아이디)
  note: string;                    // 처리하면서 남기는 메모
  createdAt: Date;
  updatedAt: Date;
}

const InfoRequestSchema = new Schema<IInfoRequest>(
  {
    body: { type: String, required: true, trim: true },
    scope: { type: String, default: 'verified' },
    status: { type: String, enum: ['open', 'doing', 'done'], default: 'open' },
    createdBy: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

// 최근 것부터 보여주므로 생성일 역순 인덱스
InfoRequestSchema.index({ createdAt: -1 });

export const InfoRequest =
  (mongoose.models.InfoRequest as mongoose.Model<IInfoRequest>) ||
  mongoose.model<IInfoRequest>('InfoRequest', InfoRequestSchema);
