/** GET /api/agent/v1/briefing?days=1 — 오늘의 브리핑 (아침 메일과 같은 계산) */
import { agentRoute } from '@/lib/agent/http';
import { getTodayBriefing } from '@/lib/agent/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute('get_briefing', (input, ctx) => getTodayBriefing(input, ctx));
