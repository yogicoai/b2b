import mongoose, { Schema, Document } from 'mongoose';

/**
 * AI 에이전트 전용 키 — 로그인 비밀번호와 따로 둔다 (2026-10-27).
 *
 * Claude·Codex·아침 자동 실행이 이 앱을 읽고 답장 초안을 넣을 때 쓴다.
 * 키는 **발급한 아이디(owner)에 묶인다.** 키로 볼 수 있는 메일은 그 아이디가 로그인해서
 * 보는 범위와 똑같다 (lib/mail/scope.ts). 키를 따로 둔다고 남의 메일함이 열리면 안 된다.
 *
 * 키로 할 수 있는 일은 **읽기와 초안 저장뿐**이다. 발송·삭제·설정 변경은 키로 들어오는
 * 경로(/api/agent/v1/* · /api/mcp)에 아예 없고, 나머지 API 는 지금처럼 로그인 쿠키만 받는다.
 *
 * 키 원문은 발급·재발급 순간 한 번만 보여 주고, 여기에는 SHA-256 해시만 둔다.
 */
export interface IAgentKey extends Document {
  owner: string;                 // 발급한 아이디 (AdminUser.username)
  name: string;                  // 사람이 붙인 이름 — 예) "Claude — 노트북"
  tool: 'claude' | 'codex' | 'auto' | 'other';
  scopes: string[];              // ['read', 'draft'] — 이 밖의 권한은 만들지 않는다
  hash: string;                  // 키 원문의 SHA-256 (hex)
  hint: string;                  // 화면에 보일 앞부분 — "ybk_AbC12…"
  enabled: boolean;
  rotatedAt?: Date | null;
  lastUsedAt?: Date | null;
  lastUsedVia?: 'rest' | 'mcp' | null;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const AgentKeySchema = new Schema<IAgentKey>({
  owner: { type: String, required: true, index: true },
  name: { type: String, required: true },
  tool: { type: String, enum: ['claude', 'codex', 'auto', 'other'], default: 'other' },
  scopes: { type: [String], default: ['read', 'draft'] },
  hash: { type: String, required: true, unique: true },
  hint: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  rotatedAt: { type: Date, default: null },
  lastUsedAt: { type: Date, default: null },
  lastUsedVia: { type: String, default: null },
  useCount: { type: Number, default: 0 },
}, { timestamps: true });

export const AgentKey =
  (mongoose.models.AgentKey as mongoose.Model<IAgentKey>) ||
  mongoose.model<IAgentKey>('AgentKey', AgentKeySchema);
