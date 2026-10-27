/**
 * GET  /api/agent/v1/drafts?status=pending&mailId=&mine=true — 넣어 둔 초안
 * POST /api/agent/v1/drafts { mailId, cc?, subject?, body, notes?, client? }
 *      → [발송 관리 → 승인 대기]에 저장. 발송하지 않는다.
 */
import { agentRoute } from '@/lib/agent/http';
import { listAgentDrafts, saveDraft } from '@/lib/agent/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute('list_drafts', (input, ctx) => listAgentDrafts(input, ctx));
export const POST = agentRoute('save_draft', (input, ctx) => saveDraft(input, ctx));
