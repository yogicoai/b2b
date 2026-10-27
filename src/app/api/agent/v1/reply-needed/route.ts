/** GET /api/agent/v1/reply-needed?days=30&limit=50 — 답장 필요 목록 */
import { agentRoute } from '@/lib/agent/http';
import { listReplyNeeded } from '@/lib/agent/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute('list_reply_needed', (input, ctx) => listReplyNeeded(input, ctx));
