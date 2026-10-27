/**
 * GET /api/agent/v1 — 연결 확인. 이 키가 누구 것이고 무엇을 할 수 있는지, 쓸 수 있는 주소 목록.
 */
import { agentRoute } from '@/lib/agent/http';
import { listMailAccounts } from '@/lib/mail/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute('whoami', async (_input, { key, baseUrl }) => {
  // 보낸 메일(list_sent_mails)에서 고를 수 있는 계정 — 키 주인이 등록한 것만
  const accounts: any[] = await listMailAccounts(key.owner);
  return {
    key: { name: key.name, owner: key.owner, tool: key.tool, toolLabel: key.toolLabel, scopes: key.scopes },
    note: '읽기와 초안 저장만 됩니다. 발송·삭제·설정 변경은 이 키로 할 수 없습니다.',
    mailAccounts: accounts.map((a) => ({ accountId: String(a._id), address: a.smtpUser, isDefault: Boolean(a.isDefault) })),
    endpoints: {
      replyNeeded: `GET ${baseUrl}/api/agent/v1/reply-needed?days=30&limit=50`,
      briefing: `GET ${baseUrl}/api/agent/v1/briefing?days=1`,
      sent: `GET ${baseUrl}/api/agent/v1/sent?days=60&limit=30&page=1`,
      mail: `GET ${baseUrl}/api/agent/v1/mails/{mailId}`,
      thread: `GET ${baseUrl}/api/agent/v1/threads/{threadId 또는 mailId}`,
      drafts: `GET ${baseUrl}/api/agent/v1/drafts?status=pending`,
      saveDraft: `POST ${baseUrl}/api/agent/v1/drafts`,
      mcp: `POST ${baseUrl}/api/mcp`,
    },
  };
});
