/**
 * 원격 MCP 서버 (Streamable HTTP, 상태 없음) — Claude·Codex 가 붙는 곳 (2026-10-27).
 *
 * POST /api/mcp 하나로 JSON-RPC 를 받아 JSON 으로 바로 답한다. 세션도 SSE 스트림도 두지 않는다.
 * 서버리스(Vercel)에서는 요청마다 다른 인스턴스가 받을 수 있어 세션을 메모리에 두면 끊긴다.
 * 도구가 전부 '한 번 묻고 한 번 답하는' 조회·저장이라 스트림이 필요 없다.
 *
 * 도구는 REST 와 같은 함수(api.ts)를 부른다. 발송·삭제·설정 도구는 없다.
 */
import dbConnect from '@/lib/mongodb';
import { authenticate, type PublicAgentKey } from './keys';
import { logAudit } from './audit';
import {
  AgentError,
  listReplyNeeded, getTodayBriefing, listSentMails, getMailById, getThreadMails,
  listAgentDrafts, saveDraft,
} from './api';
import { baseUrlOf } from './http';

const SERVER_INFO = { name: 'yogibo-b2b-mail', title: '요기보 B2B 관리메일', version: '1.0.0' };
const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = [
  '요기보 B2B 관리메일(국내 B2B 영업 CRM)입니다. 이 키로는 메일 읽기와 답장 초안 저장만 할 수 있습니다.',
  '발송·삭제·상태 변경·설정 변경 도구는 없습니다. 볼 수 있는 메일은 키를 발급한 아이디의 메일함뿐입니다.',
  "save_draft 로 넣은 초안은 [발송 관리 → 승인 대기]에 들어가고, 사람이 회신 상자에서 확인하고 [보내기]를 눌러야 나갑니다.",
  '답장은 원래 보낸 사람에게만 갑니다(to 를 바꿀 수 없음). 다른 사람에게도 보내려면 cc 에 넣으세요. 서명은 보낼 때 계정 서명이 자동으로 붙으니 본문에 넣지 마세요.',
  '답장을 쓰기 전에 get_thread 로 앞선 대화를, list_sent_mails 로 평소 말투를 확인하세요.',
  'hasPendingDraft 가 true 인 메일은 이미 초안이 들어가 있습니다. 같은 키로 다시 저장하면 그 초안이 고쳐집니다(새로 쌓이지 않음).',
].join('\n');

const MAIL_ID = { type: 'string', description: '메일 ID (24자리, 목록의 id 값)' };

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, any>;
  annotations: Record<string, boolean>;
  action: string;
  target?: (a: Record<string, any>) => string | null;
  run: (a: Record<string, any>, ctx: { key: PublicAgentKey; baseUrl: string }) => Promise<Record<string, any>>;
}

const RO = { readOnlyHint: true, openWorldHint: false };

const TOOLS: ToolDef[] = [
  {
    name: 'list_reply_needed',
    title: '답장 필요 목록',
    description: '답장이 필요한데 아직 처리하지 않은 받은 메일(최신순). 각 메일의 id·threadId·보낸 사람·회사·제목·받은 시각·본문 앞 2,000자(인용 제외)·첨부 이름·분류·중요도(긴급도·기한)·이미 초안이 있는지(hasPendingDraft).',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 365, description: '며칠 전까지 볼지 (기본 30)' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: '최대 건수 (기본 50)' },
      },
      additionalProperties: false,
    },
    annotations: RO,
    action: 'list_reply_needed',
    run: (a, ctx) => listReplyNeeded({ days: a.days, limit: a.limit }, ctx),
  },
  {
    name: 'get_briefing',
    title: '오늘의 브리핑',
    description: '매일 아침 메일로 나가는 "오늘의 브리핑" 과 같은 계산(직전 N일). 회신 필요·기한 임박·새 답장 목록과 합계, 그리고 메일 본문 html.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 14, description: '며칠치 (기본: 설정의 브리핑 기간)' },
      },
      additionalProperties: false,
    },
    annotations: RO,
    action: 'get_briefing',
    run: (a, ctx) => getTodayBriefing({ days: a.days }, ctx),
  },
  {
    name: 'list_sent_mails',
    title: '보낸 메일',
    description: '우리가 보낸 메일(최신순, 한 쪽 최대 50통) — 받는 사람·제목·본문(인용 제외, 4,000자까지). 이카운트 보낸메일함에서 바로 읽습니다. 답장 말투를 맞추는 데만 쓰세요.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 365, description: '며칠 전까지 (기본 60)' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: '한 쪽 건수 (기본 30)' },
        page: { type: 'integer', minimum: 1, description: '쪽 번호 (기본 1). totalPages 까지' },
        account_id: { type: 'string', description: '메일 계정 id (비우면 대표 계정)' },
      },
      additionalProperties: false,
    },
    annotations: RO,
    action: 'list_sent_mails',
    run: (a, ctx) => listSentMails({ days: a.days, limit: a.limit, page: a.page, accountId: a.account_id }, ctx),
  },
  {
    name: 'get_mail',
    title: '메일 1건',
    description: '메일 1건 전체 — 본문(메일 서버에서 받은 전문, 20,000자까지)·새로 쓴 부분(bodyNew)·한글 번역(있으면)·첨부·분석·리드 단계·이 메일에 들어가 있는 승인 대기 초안.',
    inputSchema: { type: 'object', properties: { mail_id: MAIL_ID }, required: ['mail_id'], additionalProperties: false },
    annotations: RO,
    action: 'get_mail',
    target: (a) => a.mail_id || null,
    run: (a, ctx) => getMailById({ id: a.mail_id }, ctx),
  },
  {
    name: 'get_thread',
    title: '스레드 전체',
    description: '같은 대화의 메일 전부(오래된 것부터, 최근 50통). thread_id(t_…) 또는 그 대화에 속한 mail_id 중 하나를 주세요. 받은 것(in)과 보낸 것(out), 리드에 붙은 대화면 우리가 먼저 보낸 영업 메일 요약(ourEmails)도 나옵니다.',
    inputSchema: {
      type: 'object',
      properties: { thread_id: { type: 'string', description: '스레드 ID (t_ 로 시작)' }, mail_id: MAIL_ID },
      additionalProperties: false,
    },
    annotations: RO,
    action: 'get_thread',
    target: (a) => a.thread_id || a.mail_id || null,
    run: (a, ctx) => getThreadMails({ threadId: a.thread_id, mailId: a.mail_id }, ctx),
  },
  {
    name: 'list_drafts',
    title: '넣어 둔 초안',
    description: '[발송 관리 → 승인 대기]에 들어간 초안 목록. 기본은 승인 대기(pending). mine=true 면 이 키로 넣은 것만.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'sent', 'discarded', 'all'], description: '기본 pending' },
        mail_id: MAIL_ID,
        mine: { type: 'boolean', description: '이 키로 넣은 것만' },
      },
      additionalProperties: false,
    },
    annotations: RO,
    action: 'list_drafts',
    run: (a, ctx) => listAgentDrafts({ status: a.status, mailId: a.mail_id, mine: a.mine }, ctx),
  },
  {
    name: 'save_draft',
    title: '답장 초안 저장',
    description: '답장 초안을 [발송 관리 → 승인 대기]에 저장합니다. 발송하지 않습니다 — 사람이 확인하고 [보내기]를 눌러야 나갑니다. 받는 사람은 원래 보낸 사람으로 정해지고(to 를 넣으면 같은지 확인만), 다른 사람은 cc 로. subject 를 비우면 "Re: 원제목". 서명은 보낼 때 자동으로 붙습니다. 같은 키로 같은 메일에 다시 저장하면 기존 승인 대기 초안을 고칩니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mail_id: { ...MAIL_ID, description: '답장할 받은 메일 ID' },
        to: { type: 'string', description: '받는 사람 — 원래 보낸 사람과 같아야 함 (비워도 됨)' },
        cc: { type: 'string', description: '참조 (여러 명은 쉼표)' },
        subject: { type: 'string', description: '제목. 비우면 "Re: 원제목"' },
        body: { type: 'string', description: '본문 (평문). 서명은 넣지 마세요 — 보낼 때 자동으로 붙습니다' },
        notes: { type: 'string', description: '보내기 전에 사람이 확인할 것 (예: 단가 확인 필요). 발송되지 않음' },
        client: { type: 'string', description: '초안을 만든 도구·모델 이름 (선택, 예: claude-code)' },
      },
      required: ['mail_id', 'body'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    action: 'save_draft',
    target: (a) => a.mail_id || null,
    run: (a, ctx) => saveDraft({
      mailId: a.mail_id, to: a.to, cc: a.cc, subject: a.subject, body: a.body, notes: a.notes, client: a.client,
    }, ctx),
  },
];

const publicTools = () => TOOLS.map(({ run, action, target, ...t }) => t);

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

interface CallCtx { key: PublicAgentKey; baseUrl: string; req: Request }

async function callTool(params: any, ctx: CallCtx): Promise<{ result?: unknown; error?: [number, string] }> {
  const name = params?.name;
  const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: [-32602, `알 수 없는 도구입니다: ${name}`] };

  const target = tool.target ? tool.target(args) : null;
  try {
    const data = await tool.run(args, { key: ctx.key, baseUrl: ctx.baseUrl });
    await logAudit({ key: ctx.key, via: 'mcp', action: tool.action, target, ok: true, status: 200, req: ctx.req });
    return { result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: false } };
  } catch (e: any) {
    const status = e instanceof AgentError ? e.status : 500;
    const message = String(e?.message || e);
    await logAudit({ key: ctx.key, via: 'mcp', action: tool.action, target, ok: false, status, error: message, req: ctx.req });
    // 도구 실행 오류는 프로토콜 오류가 아니라 결과로 돌려준다 — 모델이 읽고 고쳐 다시 부를 수 있게
    return { result: { content: [{ type: 'text', text: `오류(${status}): ${message}` }], isError: true } };
  }
}

async function handleMessage(msg: any, ctx: CallCtx): Promise<unknown | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
    return rpcError(msg?.id, -32600, 'JSON-RPC 2.0 요청이 아닙니다.');
  }
  // 알림(id 없음)과 클라이언트가 보낸 응답에는 답하지 않는다
  if (msg.id === undefined || msg.id === null || !msg.method) return null;

  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: publicTools() });
    case 'tools/call': {
      const r = await callTool(params, ctx);
      return r.error ? rpcError(id, r.error[0], r.error[1]) : rpcResult(id, r.result);
    }
    // 내놓는 것이 없지만, 그래도 묻는 클라이언트가 있어 빈 목록으로 답한다
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `지원하지 않는 메서드입니다: ${method}`);
  }
}

/** POST /api/mcp */
export async function handleMcpPost(req: Request): Promise<Response> {
  await dbConnect();
  // Claude 웹·데스크톱 커스텀 커넥터는 헤더를 못 붙여 주소의 ?key= 로도 받는다 (keys.ts 참고)
  const auth = await authenticate(req, 'mcp', { allowQuery: true });
  if (auth.error !== undefined) {
    if (auth.hint || auth.key) {
      await logAudit({
        key: auth.key, via: 'mcp', action: 'auth_failed', ok: false, status: auth.status,
        error: auth.error, req, detail: { hint: auth.hint || null },
      });
    }
    return json(rpcError(null, -32001, auth.error), auth.status);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, '본문이 JSON 이 아닙니다.'), 400);
  }

  const ctx: CallCtx = { key: auth.key, baseUrl: baseUrlOf(req), req };

  // 묶음 요청(옛 규격)도 받아 준다
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleMessage(m, ctx)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }

  const out = await handleMessage(body, ctx);
  return out ? json(out) : new Response(null, { status: 202 });
}

/** GET·DELETE — 스트림·세션을 두지 않으므로 POST 만 받는다 */
export function methodNotAllowed(): Response {
  return new Response(JSON.stringify(rpcError(null, -32000, 'POST 로만 요청할 수 있습니다 (Streamable HTTP, 상태 없음).')), {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' },
  });
}
