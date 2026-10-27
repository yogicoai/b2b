/**
 * AI 에이전트 키 — 발급·재발급·끄기·확인 (2026-10-27).
 *
 * 왜 로그인과 따로인가:
 * 에이전트(Claude·Codex·아침 자동 실행)에게 로그인 비밀번호를 주면 그 비밀번호로 발송·삭제·
 * 아이디 관리까지 다 된다. 키는 읽기와 초안 저장만 되는 별도 출입증이다.
 *
 * 키로 들어오는 주소(/api/agent/v1/* · /api/mcp)만 proxy.ts 가 쿠키 없이 통과시키고,
 * 키 확인은 라우트 안에서 여기 authenticate() 로 한다. 그 주소들에는 읽기·초안 저장밖에
 * 없으므로 키로는 발송·삭제·설정 API 에 닿을 수 없다 — 권한을 막는 것이 아니라 길이 없다.
 *
 * 키 원문은 발급·재발급 순간에만 돌려주고 DB 에는 해시만 남긴다. DB 가 새도 키를 되살릴 수 없다.
 */
import { randomBytes, createHash } from 'crypto';
import { AgentKey } from '@/models/AgentKey';

export const AGENT_TOOLS = ['claude', 'codex', 'auto', 'other'] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];
export const AGENT_TOOL_LABELS: Record<AgentTool, string> = {
  claude: 'Claude',
  codex: 'Codex',
  auto: '아침 자동 실행',
  other: '기타',
};
export const toolLabel = (v?: string | null) => AGENT_TOOL_LABELS[v as AgentTool] || v || '기타';

/** 키 권한 — 읽기 + 초안 저장. 발송·삭제·설정 권한은 만들지 않는다 */
export const AGENT_SCOPES = ['read', 'draft'];

const PREFIX = 'ybk_';

const hashKey = (raw: string) => createHash('sha256').update(String(raw)).digest('hex');
// 32바이트 = 256비트. base64url 이라 헤더·셸에 그대로 붙여도 깨지지 않는다
const newRawKey = () => `${PREFIX}${randomBytes(32).toString('base64url')}`;
/** 화면에 보일 앞부분 — 어느 키인지 알아볼 만큼만 */
const hintOf = (raw: string) => `${raw.slice(0, PREFIX.length + 6)}…`;

export interface PublicAgentKey {
  id: string;
  owner: string;
  name: string;
  tool: string;
  toolLabel: string;
  scopes: string[];
  hint: string;
  enabled: boolean;
  createdAt: Date | null;
  rotatedAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedVia: string | null;
  useCount: number;
}

/** 화면·API 로 내보낼 모양 — 해시는 절대 내보내지 않는다 */
export function publicKey(k: any): PublicAgentKey {
  return {
    id: String(k._id),
    owner: k.owner,
    name: k.name,
    tool: k.tool,
    toolLabel: toolLabel(k.tool),
    scopes: k.scopes?.length ? k.scopes : AGENT_SCOPES,
    hint: k.hint,
    enabled: k.enabled !== false,
    createdAt: k.createdAt || null,
    rotatedAt: k.rotatedAt || null,
    lastUsedAt: k.lastUsedAt || null,
    lastUsedVia: k.lastUsedVia || null,
    useCount: k.useCount || 0,
  };
}

/** 키 목록 — owner 를 넘기면 그 아이디 것만, 안 넘기면 전부(마스터 화면) */
export async function listKeys(owner?: string): Promise<PublicAgentKey[]> {
  const rows = await AgentKey.find(owner ? { owner } : {}, { hash: 0 }).sort({ createdAt: 1 }).lean();
  return rows.map(publicKey);
}

function cleanName(name: unknown): string {
  const s = String(name || '').trim().slice(0, 40);
  if (!s) throw Object.assign(new Error('키 이름을 적어 주세요. 예) Claude — 노트북'), { status: 400 });
  return s;
}

/** 새 키 발급. 원문(key)은 이 반환값에서만 볼 수 있다 */
export async function createKey(owner: string, { name, tool }: { name?: unknown; tool?: unknown }) {
  const t: AgentTool = (AGENT_TOOLS as readonly string[]).includes(String(tool)) ? (String(tool) as AgentTool) : 'other';
  const raw = newRawKey();
  const doc: any = await AgentKey.create({
    owner,
    name: cleanName(name),
    tool: t,
    scopes: AGENT_SCOPES,
    hash: hashKey(raw),
    hint: hintOf(raw),
    enabled: true,
  });
  return { key: raw, info: publicKey(doc.toObject()) };
}

/** 이 사람이 손댈 수 있는 키인가 — 자기 키, 또는 마스터 */
function editableFilter(id: string, user: string, isMaster: boolean) {
  if (!/^[0-9a-f]{24}$/i.test(String(id))) return null;
  return isMaster ? { _id: id } : { _id: id, owner: user };
}

/**
 * 재발급 — 같은 이름·도구로 키 원문만 바꾼다. 예전 키는 그 즉시 막힌다.
 * 키가 새어 나갔을 때 쓰는 버튼이라 끄기와 달리 되돌릴 수 없다.
 * 원문을 받는 사람은 키 주인이어야 하므로 마스터라도 남의 키는 재발급하지 않는다(끄기·삭제만).
 */
export async function rotateKey(id: string, user: string) {
  const f = editableFilter(id, user, false);
  if (!f) throw Object.assign(new Error('키를 찾을 수 없습니다.'), { status: 404 });
  const raw = newRawKey();
  const r: any = await AgentKey.findOneAndUpdate(
    f,
    { $set: { hash: hashKey(raw), hint: hintOf(raw), rotatedAt: new Date(), enabled: true } },
    { new: true, projection: { hash: 0 } },
  ).lean();
  if (!r) throw Object.assign(new Error('키를 찾을 수 없습니다 (내가 만든 키만 재발급할 수 있습니다).'), { status: 404 });
  return { key: raw, info: publicKey(r) };
}

export async function updateKey(id: string, user: string, isMaster: boolean, { enabled, name }: { enabled?: unknown; name?: unknown }) {
  const f = editableFilter(id, user, isMaster);
  if (!f) throw Object.assign(new Error('키를 찾을 수 없습니다.'), { status: 404 });
  const set: Record<string, any> = {};
  if (enabled !== undefined) set.enabled = Boolean(enabled);
  if (name !== undefined) set.name = cleanName(name);
  if (!Object.keys(set).length) throw Object.assign(new Error('바꿀 항목이 없습니다.'), { status: 400 });
  const r: any = await AgentKey.findOneAndUpdate(f, { $set: set }, { new: true, projection: { hash: 0 } }).lean();
  if (!r) throw Object.assign(new Error('키를 찾을 수 없습니다.'), { status: 404 });
  return publicKey(r);
}

/** 삭제 — 사용 기록과 이미 넣어 둔 초안은 남는다(누가 했는지 이름이 함께 적혀 있다) */
export async function deleteKey(id: string, user: string, isMaster: boolean) {
  const f = editableFilter(id, user, isMaster);
  if (!f) throw Object.assign(new Error('키를 찾을 수 없습니다.'), { status: 404 });
  const r = await AgentKey.deleteOne(f);
  if (!r.deletedCount) throw Object.assign(new Error('키를 찾을 수 없습니다.'), { status: 404 });
}

/**
 * 요청에서 키 원문을 꺼낸다 — x-assistant-key 또는 Authorization: Bearer.
 *
 * allowQuery: 주소의 ?key= 도 받는다. MCP 에만 켠다.
 * Claude 웹·데스크톱의 '커스텀 커넥터' 는 주소만 넣을 수 있고 헤더를 붙일 수 없어서다
 * (그쪽 인증은 OAuth 만 지원한다). 주소에 키가 들어가면 서버 접속 기록에 남을 수 있으므로
 * 헤더를 넣을 수 있는 곳(Claude Code·Codex·REST)에서는 헤더를 쓴다.
 */
export function keyFromRequest(req: Request, { allowQuery = false }: { allowQuery?: boolean } = {}): string {
  const direct = (req.headers.get('x-assistant-key') || '').trim();
  if (direct) return direct;
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get('authorization') || '').trim());
  if (m) return m[1].trim();
  if (allowQuery) return (new URL(req.url).searchParams.get('key') || '').trim();
  return '';
}

export type AuthResult =
  | { key: PublicAgentKey; error?: undefined }
  | { error: string; status: number; key?: PublicAgentKey; hint?: string };

/**
 * 키 확인. 맞으면 키 정보를, 아니면 { error } 를 돌려준다.
 * 꺼 둔 키는 '꺼져 있다' 고 알려 준다 — 그래야 연결한 쪽에서 원인을 바로 안다.
 */
export async function authenticate(req: Request, via: 'rest' | 'mcp', { allowQuery = false } = {}): Promise<AuthResult> {
  const raw = keyFromRequest(req, { allowQuery });
  if (!raw) return { error: '키가 없습니다. x-assistant-key 헤더(또는 Authorization: Bearer)에 키를 넣어 주세요.', status: 401 };
  if (!raw.startsWith(PREFIX)) return { error: '이 앱에서 발급한 키가 아닙니다.', status: 401, hint: raw.slice(0, 6) };

  const k: any = await AgentKey.findOne({ hash: hashKey(raw) }).lean();
  if (!k) return { error: '키가 맞지 않습니다. 재발급했다면 새 키로 바꿔 넣어 주세요.', status: 401, hint: hintOf(raw) };
  if (k.enabled === false) {
    return { error: '꺼 둔 키입니다. [🤖 AI 에이전트 연결] 화면에서 다시 켜야 쓸 수 있습니다.', status: 403, key: publicKey(k) };
  }

  // 마지막 사용 시각 — 기다리지 않는다(응답을 늦출 이유가 없다)
  AgentKey.updateOne(
    { _id: k._id },
    { $set: { lastUsedAt: new Date(), lastUsedVia: via }, $inc: { useCount: 1 } },
  ).catch(() => {});

  return { key: publicKey(k) };
}
