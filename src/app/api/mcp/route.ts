/**
 * /api/mcp — Claude·Codex 가 붙는 원격 MCP 서버 (Streamable HTTP, 상태 없음).
 * 로그인 쿠키가 아니라 AI 에이전트 키(x-assistant-key 또는 Authorization: Bearer)로 들어온다.
 * 도구 목록·동작은 src/lib/agent/mcp.ts 에 있다.
 */
import { handleMcpPost, methodNotAllowed } from '@/lib/agent/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return handleMcpPost(req);
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
