/** GET /api/agent/v1/sent?days=60&limit=30&page=1&accountId= — 보낸 메일 (말투 학습용 · 보낸메일함에서 바로 읽음) */
import { agentRoute } from '@/lib/agent/http';
import { listSentMails } from '@/lib/agent/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = agentRoute('list_sent_mails', (input, ctx) => listSentMails(input, ctx));
