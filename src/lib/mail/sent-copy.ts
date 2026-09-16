import nodemailer from 'nodemailer';
import { toImapConfig, listMailAccounts } from './accounts';
import { appendMessage, findSentPath, fetchSinceBatch, withOpenAccount } from './imap';
import { InboundMail } from '@/models/InboundMail';

/**
 * 보낸 메일 **사본을 이카운트 보낸메일함에 남긴다** (2026-09-15).
 *
 * 왜 필요한가:
 * 이 앱은 SMTP 로 보내기만 했다. SMTP 는 보내는 통로일 뿐 보낸메일함에 넣어주지 않는다.
 * 그래서 [📤 보낸 메일함](이카운트 보낸메일함을 그대로 읽는 화면)에도, 대표님이 쓰는 웹메일·아웃룩의
 * 보낸메일함에도 우리가 보낸 메일이 없었다 — "보냈는지 알 수가 없다".
 *
 * 보낸 뒤에만, 실패해도 발송 자체는 성공으로 둔다 (사본이 없다고 메일을 다시 보낼 수는 없다).
 */
export async function saveToSentFolder(account: any, mailOptions: Record<string, any>): Promise<{ ok: boolean; folder?: string; error?: string }> {
  try {
    if (!account) return { ok: false, error: '계정 없음' };

    // 방금 보낸 것과 같은 내용으로 원문(MIME)을 만든다 — 네트워크로 나가지 않는 transport
    const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
    const built: any = await composer.sendMail(mailOptions);
    const raw: Buffer = built.message;
    if (!raw?.length) return { ok: false, error: '원문을 만들지 못했습니다' };

    const settings = toImapConfig(account, 'INBOX');
    return await withOpenAccount(settings, async (scoped) => {
      const folder = await findSentPath((scoped as any).__client);
      if (!folder) return { ok: false, error: '보낸메일함 폴더를 찾지 못했습니다' };
      await appendMessage(scoped, folder, raw, ['\\Seen'], new Date());
      return { ok: true, folder };
    });
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}


/**
 * 보낸메일함에 **빠진 내 메일을 채운다** (2026-09-15, 대표님 요청).
 *
 * 아웃룩을 POP 으로 쓰거나 "보낸 편지함을 서버에 저장" 이 꺼져 있으면, 보낸 메일이 그 컴퓨터에만 남고
 * 이카운트 보낸메일함에는 아무것도 안 남는다 — 실제로 대표님 보낸메일함이 하루치 통째로 비어 있었다.
 *
 * 우리가 아는 범위에서 메운다: 내 주소로 보낸 메일이 받은편지함 사본(자기 참조·같은 회사 수신)으로
 * 들어와 있으면, 그 원본을 그대로 보낸메일함에 넣는다. 메일 내용은 손대지 않는다.
 *
 * 서버 어디에도 사본이 없는 메일(아웃룩 POP 에서 참조 없이 보낸 것)은 만들어낼 수 없다 —
 * 그건 아웃룩을 IMAP 으로 두고 '보낸 편지함 서버 저장'을 켜야 한다.
 */
export interface OutboxSyncResult {
  account: string;
  checked: number;
  appended: number;
  errors: string[];
}

export async function syncOutboxCopies(account: any, opts: { days?: number } = {}): Promise<OutboxSyncResult> {
  const days = Number(opts.days) || 7;
  const me = String(account?.smtpUser || '').toLowerCase();
  const out: OutboxSyncResult = { account: me, checked: 0, appended: 0, errors: [] };
  if (!me) return out;
  const since = new Date(Date.now() - days * 86400000);

  try {
    const mine: any[] = await InboundMail.find({
      direction: 'out',
      date: { $gte: since },
      'from.address': new RegExp(`^${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }, { messageId: 1, folder: 1, uid: 1, date: 1, subject: 1, to: 1 }).sort({ date: 1 }).lean();
    out.checked = mine.length;
    if (!mine.length) return out;

    const settings = toImapConfig(account, 'INBOX');
    await withOpenAccount(settings, async (scoped: any) => {
      const sentPath = await findSentPath(scoped.__client);
      if (!sentPath) { out.errors.push('보낸메일함 폴더 없음'); return; }

      // 보낸메일함에 이미 있는 Message-ID (기간 안)
      const have = new Set<string>();
      let afterUid = 0;
      for (let i = 0; i < 40; i++) {
        const b = await fetchSinceBatch(scoped, { folder: sentPath, since, afterUid, limit: 100 });
        if (!b.messages.length) break;
        for (const m of b.messages) {
          const mid = String(m.source).match(/^message-id:\s*(<[^>]+>)/im)?.[1];
          if (mid) have.add(mid.trim().toLowerCase());
        }
        afterUid = b.lastUid;
        if (!b.remaining) break;
      }

      for (const m of mine) {
        const mid = String(m.messageId || '').trim().toLowerCase();
        if (!mid || have.has(mid)) continue;
        // 나에게만 보낸 메일(브리핑 등)은 넣지 않는다 — 보낸메일함이 시스템 메일로 채워진다
        const others = (m.to || []).map((t: any) => String(t.address || '').toLowerCase()).filter((a: string) => a && a !== me);
        if (!others.length) continue;
        try {
          const lock = await scoped.__client.getMailboxLock(m.folder);
          let source: Buffer | null = null;
          try {
            const one: any = await scoped.__client.fetchOne(String(m.uid), { source: true }, { uid: true });
            source = one?.source || null;
          } finally { lock.release(); }
          if (!source) continue;                      // 원본이 지워졌으면 넘어간다
          await appendMessage(scoped, sentPath, source, ['\\Seen'], new Date(m.date));
          out.appended++;
        } catch (e: any) {
          out.errors.push(`${String(m.subject).slice(0, 24)}: ${String(e?.message || e).slice(0, 60)}`);
        }
      }
    });
  } catch (e: any) {
    out.errors.push(String(e?.message || e));
  }
  return out;
}

/** 등록된 모든 계정에 대해 보낸메일함을 메운다 (매일 도는 작업에서 호출) */
export async function syncAllOutboxCopies(days = 7): Promise<OutboxSyncResult[]> {
  const accounts = await listMailAccounts('system');
  const results: OutboxSyncResult[] = [];
  for (const a of accounts) results.push(await syncOutboxCopies(a, { days }));
  return results;
}
