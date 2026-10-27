/**
 * 에이전트 사용 기록 남기기·읽기 (models/AgentAudit.ts).
 */
import { AgentAudit } from '@/models/AgentAudit';
import type { PublicAgentKey } from './keys';

/** 화면에 보일 동작 이름 */
export const ACTION_LABELS: Record<string, string> = {
  whoami: '연결 확인',
  list_reply_needed: '답장 필요 목록',
  get_briefing: '오늘의 브리핑',
  list_sent_mails: '보낸 메일',
  get_mail: '메일 1건',
  get_thread: '스레드',
  list_drafts: '초안 목록',
  save_draft: '초안 저장',
  auth_failed: '키 확인 실패',
};

interface AuditInput {
  key?: PublicAgentKey | null;
  via: 'rest' | 'mcp';
  action: string;
  target?: string | null;
  ok?: boolean;
  status?: number;
  error?: string | null;
  req?: Request;
  detail?: Record<string, any> | null;
}

/**
 * 기록 한 줄. 실패해도 본 요청을 막지 않는다 — 기록이 안 남는 것보다
 * 기록 때문에 아침 자동 실행이 멈추는 쪽이 더 나쁘다.
 */
export async function logAudit({ key, via, action, target, ok = true, status, error, req, detail }: AuditInput): Promise<void> {
  try {
    await AgentAudit.create({
      at: new Date(),
      keyId: key?.id || null,
      keyName: key?.name || null,
      owner: key?.owner || null,
      tool: key?.tool || null,
      via,
      action,
      target: target ? String(target).slice(0, 120) : null,
      ok: Boolean(ok),
      status: status || (ok ? 200 : 400),
      error: error ? String(error).slice(0, 300) : null,
      detail: detail || null,
      ip: req ? (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null : null,
      ua: req ? (req.headers.get('user-agent') || '').slice(0, 160) || null : null,
    });
  } catch { /* 기록 실패는 무시 */ }
}

/**
 * 기록 목록 — owner 를 넘기면 그 아이디 키의 기록만(마스터는 넘기지 않아 전부).
 * 키 확인 실패(맞지 않는 키)는 어느 아이디 것인지 알 수 없어 마스터 화면에만 나온다.
 */
export async function listAudit({ owner, keyId, limit = 100 }: { owner?: string; keyId?: string; limit?: number } = {}) {
  const q: Record<string, any> = {};
  if (owner) q.owner = owner;
  if (keyId) q.keyId = String(keyId);
  const rows: any[] = await AgentAudit.find(q).sort({ at: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
  return rows.map((r) => ({
    id: String(r._id),
    at: r.at,
    keyId: r.keyId || null,
    keyName: r.keyName || null,
    owner: r.owner || null,
    tool: r.tool || null,
    via: r.via || null,
    action: r.action,
    actionLabel: ACTION_LABELS[r.action] || r.action,
    target: r.target || null,
    ok: Boolean(r.ok),
    status: r.status,
    error: r.error || null,
    ip: r.ip || null,
  }));
}
