/** GET /api/agent/v1/threads/{threadId} — 스레드 전체. threadId 자리에 메일 ID 를 넣어도 된다 */
import { agentRoute } from '@/lib/agent/http';
import { getThreadMails } from '@/lib/agent/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute('get_thread', (input, ctx) => getThreadMails({ threadId: input.threadId }, ctx));
