/** GET /api/agent/v1/mails/{id} — 메일 1건 전체 (본문은 메일 서버에서 받아 온 전문) */
import { agentRoute } from '@/lib/agent/http';
import { getMailById } from '@/lib/agent/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = agentRoute('get_mail', (input, ctx) => getMailById({ id: input.id }, ctx));
