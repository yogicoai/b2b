import mongoose, { Schema, Document } from 'mongoose';

/**
 * AI 에이전트가 넣어 둔 답장 초안 — [📨 발송 관리 → 🤖 승인 대기] (2026-10-27).
 *
 * 에이전트는 여기에 '승인 대기' 로 넣기만 한다. 실제 발송은 사람이 회신 상자에서
 * 내용을 확인하고 [보내기] 를 누를 때뿐이고, 그 버튼은 지금까지 쓰던 회신 경로
 * (/api/mail/reply) 그대로다. 발송 경로가 하나여야 계정·서명·스레드 규칙이 AI 초안에도 똑같이 걸린다.
 *
 * InboundMail.drafts[] 가 아니라 따로 둔 이유: 여러 메일에 흩어진 승인 대기를 한 탭에 모아
 * 건수를 세야 하는데, 메일마다 배열 안을 뒤지면 느리고 상태(승인 대기·발송·버림)를 다루기 어렵다.
 */
export interface IAgentDraft extends Document {
  inboundMailId: string;         // 답장할 받은 메일 (InboundMail._id)
  accountId: string;             // 그 메일을 받은 계정 — 누가 볼 수 있는지 가른다 (lib/mail/scope.ts)
  leadId?: string;
  threadKey?: string;
  owner: string;                 // 키를 발급한 아이디
  // 목록 화면이 메일을 다시 읽지 않아도 되게 원 메일 요약을 함께 둔다
  mail: {
    subject?: string;
    from?: { name?: string; address?: string };
    date?: Date | null;
    company?: string;
    group?: string;
  };
  to: string;                    // 원래 보낸 사람 (회신 규칙 — lib/mail/compose-reply.ts)
  cc?: string;                   // 쉼표로 이은 주소
  subject: string;
  body: string;                  // 평문
  notes?: string;                // 보내기 전에 사람이 확인할 것 — 발송되지 않는다
  agent: {
    keyId: string;
    keyName: string;
    tool: string;
    toolLabel: string;
    client?: string;             // 에이전트가 스스로 밝힌 도구·모델 이름 (선택)
  };
  status: 'pending' | 'sent' | 'discarded';
  revision: number;              // 같은 키가 같은 메일에 다시 넣어 고친 횟수 + 1
  sentAt?: Date | null;
  sentTo?: string;
  sentMessageId?: string;
  editedBeforeSend?: boolean | null;   // 사람이 고쳐서 보냈는지
  discardedAt?: Date | null;
  discardedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentDraftSchema = new Schema<IAgentDraft>({
  inboundMailId: { type: String, required: true },
  accountId: { type: String, default: '' },
  leadId: { type: String, default: '' },
  threadKey: { type: String, default: '' },
  owner: { type: String, required: true },
  mail: {
    subject: { type: String, default: '' },
    from: {
      name: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    date: { type: Date, default: null },
    company: { type: String, default: '' },
    group: { type: String, default: '' },
  },
  to: { type: String, default: '' },
  cc: { type: String, default: '' },
  subject: { type: String, default: '' },
  body: { type: String, default: '' },
  notes: { type: String, default: '' },
  agent: {
    keyId: { type: String, default: '' },
    keyName: { type: String, default: '' },
    tool: { type: String, default: '' },
    toolLabel: { type: String, default: '' },
    client: { type: String, default: '' },
  },
  status: { type: String, enum: ['pending', 'sent', 'discarded'], default: 'pending' },
  revision: { type: Number, default: 1 },
  sentAt: { type: Date, default: null },
  sentTo: { type: String, default: '' },
  sentMessageId: { type: String, default: '' },
  editedBeforeSend: { type: Boolean, default: null },
  discardedAt: { type: Date, default: null },
  discardedBy: { type: String, default: '' },
}, { timestamps: true });

AgentDraftSchema.index({ status: 1, createdAt: -1 });
AgentDraftSchema.index({ inboundMailId: 1, status: 1 });
AgentDraftSchema.index({ owner: 1, status: 1 });

export const AgentDraft =
  (mongoose.models.AgentDraft as mongoose.Model<IAgentDraft>) ||
  mongoose.model<IAgentDraft>('AgentDraft', AgentDraftSchema);
