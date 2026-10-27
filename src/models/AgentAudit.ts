import mongoose, { Schema, Document } from 'mongoose';

/**
 * 에이전트 사용 기록 — 어떤 키로 언제 무엇을 했는지 (2026-10-27).
 *
 * 읽기도 남긴다. 거래처와 오간 메일이라 "누가 무엇을 읽어 갔는지" 가
 * 초안을 넣은 것만큼 중요하다. 180일이 지나면 저절로 지워진다(TTL 인덱스).
 */
export interface IAgentAudit extends Document {
  at: Date;
  keyId?: string | null;
  keyName?: string | null;
  owner?: string | null;         // 키를 발급한 아이디
  tool?: string | null;
  via?: 'rest' | 'mcp' | null;
  action: string;                // list_reply_needed · get_mail · save_draft · auth_failed …
  target?: string | null;        // 메일·스레드 id
  ok: boolean;
  status: number;
  error?: string | null;
  detail?: Record<string, any> | null;
  ip?: string | null;
  ua?: string | null;
}

const AgentAuditSchema = new Schema<IAgentAudit>({
  at: { type: Date, default: Date.now },
  keyId: { type: String, default: null },
  keyName: { type: String, default: null },
  owner: { type: String, default: null },
  tool: { type: String, default: null },
  via: { type: String, default: null },
  action: { type: String, required: true },
  target: { type: String, default: null },
  ok: { type: Boolean, default: true },
  status: { type: Number, default: 200 },
  error: { type: String, default: null },
  detail: { type: Schema.Types.Mixed, default: null },
  ip: { type: String, default: null },
  ua: { type: String, default: null },
});

AgentAuditSchema.index({ owner: 1, at: -1 });
AgentAuditSchema.index({ keyId: 1, at: -1 });
// 180일 보관 — 무엇을 했는지 되짚기에는 충분하고, 무료 용량(512MB)을 잠식하지 않는다
AgentAuditSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 86400 });

export const AgentAudit =
  (mongoose.models.AgentAudit as mongoose.Model<IAgentAudit>) ||
  mongoose.model<IAgentAudit>('AgentAudit', AgentAuditSchema);
