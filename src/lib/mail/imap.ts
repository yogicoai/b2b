/**
 * IMAP 수신 — imapflow 래퍼.
 *
 * vercelData 는 **이카운트 기업메일 전용**이라 원본(emailData)의 Gmail/네이버
 * 프리셋과 다계정 지원을 걷어내고 단일 계정 경로만 남겼다.
 *
 * (emailData/src/lib/mail/imap.js 이식)
 */
import { ImapFlow } from 'imapflow';
import { ECOUNT_IMAP_HINT } from '@/models/MailSettings';

export interface ImapConfig {
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser?: string;
  imapPass?: string;
  imapFolder?: string;
  /** 이미 열린 연결 — 폴더 여러 개를 연달아 볼 때 재사용 */
  __client?: ImapFlow;
}

export interface FetchedMessage {
  uid: number;
  source: Buffer;
  flags: string[];
  internalDate?: Date;
}

/** imapflow 는 internalDate 를 Date 또는 문자열로 준다 — Date 로 통일 */
function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function requireConfig(s: ImapConfig): void {
  const missing: string[] = [];
  if (!s.imapHost) missing.push('수신 서버 주소');
  if (!s.imapUser) missing.push('계정');
  if (!s.imapPass) missing.push('비밀번호');
  if (!missing.length) return;

  // 어디서 값을 구해야 하는지까지 알려준다 — "입력하세요" 만으로는 다음 행동이 안 나온다
  throw new Error(
    `메일 수신 설정이 아직 없습니다 (${missing.join(', ')} 미입력).\n` +
    '설정 화면에서 입력한 뒤 [연결 테스트]로 확인하세요.\n' +
    ECOUNT_IMAP_HINT,
  );
}

function buildClient(s: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: s.imapHost!,
    port: Number(s.imapPort) || 993,
    secure: s.imapSecure !== false,
    auth: { user: s.imapUser!, pass: s.imapPass! },
    logger: false,
    // 자체서명 인증서를 쓰는 사내 메일 서버 대응
    tls: { rejectUnauthorized: false },
    socketTimeout: 60_000,
    greetingTimeout: 20_000,
  });
}

/**
 * imapflow 의 오류를 사람이 읽을 수 있는 말로 바꾼다.
 *
 * 인증에 실패하면 그냥 'Command failed' 만 올라온다. 그 말로는 비밀번호가
 * 틀린 건지, IMAP 이 꺼진 건지, 서버 주소가 틀린 건지 알 수 없어서
 * 사용자가 다음에 무엇을 해야 할지 판단할 수 없다.
 */
function friendlyImapError(e: any, settings: ImapConfig): Error {
  const host = String(settings?.imapHost || '');
  const raw = String(e?.responseText || e?.message || e);

  if (e?.authenticationFailed || /authentication failed/i.test(raw)) {
    return new Error(`아이디 또는 비밀번호가 맞지 않습니다. ${ECOUNT_IMAP_HINT}`);
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return new Error(`수신 서버 주소를 찾을 수 없습니다 (${host}). 주소를 다시 확인하세요.`);
  }
  if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(raw)) {
    return new Error(`수신 서버에 연결하지 못했습니다 (${host}). 주소·포트를 확인하세요.`);
  }
  return e instanceof Error ? e : new Error(raw);
}

/**
 * 연결 후 콜백 실행, 성공/실패와 무관하게 logout 보장.
 *
 * `settings.__client` 로 이미 열린 연결을 넘기면 그것을 그대로 쓰고 닫지 않는다.
 * 폴더마다 새로 접속하면 26개 폴더를 도는 동안 메일 서버가 연달아 붙는 것을
 * 막아 뒤쪽 폴더가 통째로 실패한다(실측: 한 번에 12개 폴더가 'Command failed').
 */
async function withClient<T>(settings: ImapConfig, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  if (settings?.__client) return fn(settings.__client);

  requireConfig(settings);
  const client = buildClient(settings);
  try {
    await client.connect();
  } catch (e) {
    throw friendlyImapError(e, settings);
  }
  try {
    return await fn(client);
  } finally {
    try { await client.logout(); } catch { /* 종료 실패는 무시 */ }
  }
}

/**
 * 연결을 한 번 열어 콜백에 넘긴다 — 여러 폴더를 연달아 볼 때 쓴다.
 * 콜백에는 `settings` 에 열린 연결을 붙인 사본이 들어간다.
 */
export async function withOpenAccount<T>(
  settings: ImapConfig,
  fn: (s: ImapConfig) => Promise<T>,
): Promise<T> {
  requireConfig(settings);
  const client = buildClient(settings);
  try {
    await client.connect();
  } catch (e) {
    throw friendlyImapError(e, settings);
  }
  try {
    return await fn({ ...settings, __client: client });
  } finally {
    try { await client.logout(); } catch { /* 종료 실패는 무시 */ }
  }
}

/** 메일함에 실제로 존재하는 폴더 목록만 가볍게 읽는다 (LIST 한 번) */
export async function listMailboxes(settings: ImapConfig): Promise<string[]> {
  return withClient(settings, async (client) => {
    const boxes = await client.list();
    return boxes
      .filter((b: any) => !b.flags?.has?.('\\Noselect'))
      .map((b: any) => b.path);
  });
}

/**
 * 연결 테스트 — 폴더 목록과 대상 폴더의 메일 수를 반환.
 * 설정 화면의 "연결 테스트" 버튼이 호출한다.
 */
export async function testConnection(settings: ImapConfig) {
  return withClient(settings, async (client) => {
    const boxes = await client.list();
    const folders = boxes.map((b: any) => b.path);

    const target = settings.imapFolder || 'INBOX';
    let mailbox: { path: string; exists: number; uidNext: number } | null = null;
    if (folders.includes(target)) {
      const lock = await client.getMailboxLock(target);
      try {
        mailbox = {
          path: target,
          exists: (client.mailbox as any).exists,
          uidNext: (client.mailbox as any).uidNext,
        };
      } finally {
        lock.release();
      }
    }
    return { folders, mailbox, targetExists: folders.includes(target) };
  });
}

/**
 * 새 메일 수집 — sinceUid 초과분만.
 *
 * IMAP 의 `N:*` 범위는 조건에 맞는 메일이 없어도 마지막 1통을 돌려주는 특성이 있어
 * 클라이언트에서 uid > sinceUid 를 한 번 더 검사한다.
 *
 * ⚠️ sinceUid 가 0(최초 수집)이면 UID 1 부터, 즉 몇 년 전 메일부터 긁어온다.
 *    수만 통이 쌓인 메일함에서는 이게 치명적이라 최근분부터 받도록 우회한다.
 */
export async function fetchNew(
  settings: ImapConfig,
  { folder: folderArg, sinceUid = 0, limit = 50 }: { folder?: string; sinceUid?: number; limit?: number } = {},
): Promise<{ messages: FetchedMessage[]; uidNext: number; folder: string }> {
  const folder = folderArg || settings.imapFolder || 'INBOX';

  // 최초 수집은 "가장 오래된 것부터" 가 아니라 "최근 것부터" 여야 한다
  if (!sinceUid) return fetchRecent(settings, { folder, limit });

  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const uidNext = (client.mailbox as any).uidNext;
      const messages: FetchedMessage[] = [];

      if ((client.mailbox as any).exists === 0) return { messages, uidNext, folder };

      const range = `${Number(sinceUid) + 1}:*`;
      for await (const msg of client.fetch(
        range,
        { uid: true, flags: true, source: true, internalDate: true },
        { uid: true },
      )) {
        if (msg.uid <= sinceUid) continue; // `N:*` 잔여분 제거
        messages.push({
          uid: msg.uid,
          source: msg.source as Buffer,
          flags: Array.from(msg.flags || []),
          internalDate: toDate(msg.internalDate),
        });
        if (messages.length >= limit) break;
      }

      // 오래된 것부터 처리해야 중단되어도 lastUid 가 안전하게 전진한다
      messages.sort((a, b) => a.uid - b.uid);
      return { messages, uidNext, folder };
    } finally {
      lock.release();
    }
  });
}

/** 최근 N통만 가져온다 — 최초 수집이나 테스트용. */
export async function fetchRecent(
  settings: ImapConfig,
  { folder: folderArg, limit = 20 }: { folder?: string; limit?: number } = {},
): Promise<{ messages: FetchedMessage[]; uidNext: number; folder: string }> {
  const folder = folderArg || settings.imapFolder || 'INBOX';

  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const total = (client.mailbox as any).exists;
      const uidNext = (client.mailbox as any).uidNext;
      if (!total) return { messages: [], uidNext, folder };

      // 시퀀스 번호 기준 마지막 limit 통
      const start = Math.max(1, total - limit + 1);
      const messages: FetchedMessage[] = [];
      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        flags: true,
        source: true,
        internalDate: true,
      })) {
        messages.push({
          uid: msg.uid,
          source: msg.source as Buffer,
          flags: Array.from(msg.flags || []),
          internalDate: toDate(msg.internalDate),
        });
      }
      messages.sort((a, b) => a.uid - b.uid);
      return { messages, uidNext, folder };
    } finally {
      lock.release();
    }
  });
}

/**
 * 기간 안의 메일을 **한 묶음씩** 가져온다 — [📥 전체 메일함 2달 가져오기] 용.
 *
 * 새로 등록한 메일함은 수집 위치(lastUid)가 없어서 평소 수집으로는 최근 몇십 통만 들어온다.
 * 메일함에 0 · 0 · 0 으로 뜨던 이유다. 날짜(SINCE)로 찾아 오래된 것부터 limit 통씩 돌려주고,
 * 다음 호출은 afterUid 뒤부터 이어 받는다 (서버 실행 시간 제한 안에서 끊어 가며 끝까지).
 */
export async function fetchSinceBatch(
  settings: ImapConfig,
  { folder, since, afterUid = 0, limit = 40 }: { folder: string; since: Date; afterUid?: number; limit?: number },
): Promise<{ messages: FetchedMessage[]; total: number; remaining: number; lastUid: number; uidNext: number }> {
  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const uidNext = (client.mailbox as any).uidNext || 0;
      if ((client.mailbox as any).exists === 0) return { messages: [], total: 0, remaining: 0, lastUid: afterUid, uidNext };
      const found = ((await client.search({ since }, { uid: true })) || []) as number[];
      const all = [...found].sort((a, b) => a - b);
      const pending = all.filter((u) => u > afterUid);
      const pick = pending.slice(0, limit);
      const messages: FetchedMessage[] = [];
      if (pick.length) {
        for await (const msg of client.fetch(pick.join(','), { uid: true, flags: true, source: true, internalDate: true }, { uid: true })) {
          messages.push({
            uid: msg.uid,
            source: msg.source as Buffer,
            flags: Array.from(msg.flags || []),
            internalDate: toDate(msg.internalDate),
          });
        }
      }
      messages.sort((a, b) => a.uid - b.uid);
      return {
        messages,
        total: all.length,
        remaining: Math.max(0, pending.length - pick.length),
        lastUid: pick.length ? pick[pick.length - 1] : afterUid,
        uidNext,
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * 첨부파일 1개를 메일 서버에서 그대로 받아온다.
 *
 * 파일 내용을 DB 에 쌓지 않고 필요할 때만 가져오는 방식이라
 * 저장 용량이 늘지 않고, 원본이 지워지지 않는 한 항상 최신이다.
 */
export async function fetchAttachment(
  settings: ImapConfig,
  { folder, uid, partId }: { folder: string; uid: number; partId: string },
): Promise<{ buffer: Buffer; meta: any }> {
  if (!folder || !uid || !partId) {
    throw new Error('첨부파일 위치 정보가 없습니다. 메일을 다시 수집하면 받아올 수 있습니다.');
  }

  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const dl = await client.download(String(uid), partId, { uid: true });
      if (!dl?.content) throw new Error('메일 서버에서 첨부파일을 찾지 못했습니다.');

      const chunks: Buffer[] = [];
      let total = 0;
      const MAX = 40 * 1024 * 1024; // 40MB 초과분은 받지 않는다(메모리 보호)
      for await (const chunk of dl.content) {
        total += chunk.length;
        if (total > MAX) {
          throw new Error('첨부파일이 너무 큽니다(40MB 초과). 원본 메일함에서 내려받으세요.');
        }
        chunks.push(chunk as Buffer);
      }
      return { buffer: Buffer.concat(chunks), meta: dl.meta || {} };
    } finally {
      lock.release();
    }
  });
}

/**
 * 메일 한 통의 **원문(RFC822) 전체**를 UID 로 받아온다.
 *
 * 받은 메일의 본문을 DB 에 쌓지 않기로 하면서 생긴 함수다 (lib/mail/ingest.ts trimRawForStorage).
 * 답장마다 앞 대화가 인용으로 딸려와 한 통이 6MB 까지 갔고, 저장이 꽉 차 **메일 발송까지
 * 막혔다**(2026-09-14). 이제 저장은 미리보기까지만 하고, 본문이 필요한 순간에 여기서 받아온다.
 * 첨부파일(fetchAttachment)을 예전부터 그렇게 다뤄 왔다 — 방식이 같다.
 *
 * 못 찾으면 **예외가 아니라 null** 이다. 웹메일에서 원본이 지워졌거나 폴더가 바뀌었다고
 * 메일 상세 화면이 통째로 안 열리면 안 된다 (부르는 쪽: lib/mail/body.ts).
 */
export async function fetchMessageSource(
  settings: ImapConfig,
  { folder, uid }: { folder: string; uid: number },
): Promise<Buffer | null> {
  if (!folder || !uid) return null;

  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg: any = await client.fetchOne(String(uid), { source: true }, { uid: true });
      return (msg?.source as Buffer) || null;
    } finally {
      lock.release();
    }
  });
}

/**
 * 첨부파일 1개를 **흘려보내는 방식**으로 받아온다 (다운로드 화면용).
 *
 * 위의 fetchAttachment 는 파일 전체를 메모리에 모았다가 한 번에 돌려준다.
 * 그 방식은 Vercel 에서 막힌다 — 함수 응답이 4.5MB 를 넘으면 413 으로 끊기는데,
 * 받은 메일 첨부에는 18MB 영상·25MB 압축파일이 실제로 있다.
 * Vercel 문서상 **스트리밍 응답은 이 제한을 받지 않는다**. 그래서 메일 서버에서
 * 받는 조각을 그대로 브라우저로 넘긴다. 메모리도 파일 크기만큼 쓰지 않는다.
 *
 * 연결은 스트림이 끝나거나(end) 실패하거나(error) 브라우저가 끊을 때(cancel)
 * 정리한다. 중간에 정리하면 전송이 잘리므로 반환 전에 닫지 않는다.
 */
export async function openAttachmentStream(
  settings: ImapConfig,
  { folder, uid, partId }: { folder: string; uid: number; partId: string },
): Promise<{ stream: ReadableStream<Uint8Array>; meta: any }> {
  if (!folder || !uid || !partId) {
    throw new Error('첨부파일 위치 정보가 없습니다. 메일을 다시 수집하면 받아올 수 있습니다.');
  }
  requireConfig(settings);
  const client = buildClient(settings);
  try {
    await client.connect();
  } catch (e) {
    throw friendlyImapError(e, settings);
  }

  let lock: { release: () => void } | null = null;
  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    try { lock?.release(); } catch { /* 이미 풀림 */ }
    try { await client.logout(); } catch { /* 종료 실패는 무시 */ }
  };

  try {
    lock = await client.getMailboxLock(folder);
    const dl: any = await client.download(String(uid), partId, { uid: true });
    if (!dl?.content) throw new Error('메일 서버에서 첨부파일을 찾지 못했습니다. 원본 메일이 지워졌을 수 있습니다.');

    const node = dl.content as NodeJS.ReadableStream & { destroy?: () => void };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        node.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        node.on('end', () => { controller.close(); void cleanup(); });
        node.on('error', (err: unknown) => { controller.error(err); void cleanup(); });
      },
      cancel() {
        try { node.destroy?.(); } catch { /* 이미 닫힘 */ }
        void cleanup();
      },
    });
    return { stream, meta: dl.meta || {} };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

/**
 * 보낸메일함·휴지통처럼 **역할이 정해진 폴더**의 실제 이름을 찾는다.
 * 이름은 메일함마다 다르므로 IMAP 이 알려주는 specialUse 를 먼저 쓴다.
 */
export const SPECIAL: Record<'sent' | 'trash', { use: string; name: RegExp }> = {
  sent: {
    use: '\\Sent',
    name: /^(Sent|Sent Items|Sent Messages|보낸메일함|보낸편지함)$/i,
  },
  trash: {
    use: '\\Trash',
    name: /^(Trash|휴지통|Deleted Items)$/i,
  },
};

export async function findSpecialFolder(
  settings: ImapConfig,
  role: 'sent' | 'trash',
): Promise<string | null> {
  const spec = SPECIAL[role];
  if (!spec) throw new Error(`알 수 없는 폴더 역할: ${role}`);
  return withClient(settings, async (client) => {
    const boxes = await client.list();
    const hit = boxes.find((b: any) => b.specialUse === spec.use)
      || boxes.find((b: any) => spec.name.test(b.path));
    return hit?.path || null;
  });
}

/**
 * 메일을 메일함의 휴지통으로 옮긴다.
 *
 * **영구 삭제는 하지 않는다.** 이 앱은 광고·자동발송을 자동으로 분류하는데,
 * 그 판정이 틀릴 수 있다. 영구 삭제를 붙이면 오판이 곧 자료 소실이 된다.
 */
export async function moveToTrash(
  settings: ImapConfig,
  { folder, uid }: { folder: string; uid: number },
): Promise<{ trash: string }> {
  if (!folder || !uid) throw new Error('메일 위치 정보가 없습니다. 다시 수집한 뒤 시도하세요.');

  return withClient(settings, async (client) => {
    const boxes = await client.list();
    const trash = boxes.find((b: any) => b.specialUse === '\\Trash')
      || boxes.find((b: any) => SPECIAL.trash.name.test(b.path));

    if (!trash) {
      throw new Error('메일함에서 휴지통 폴더를 찾지 못했습니다. 웹메일에서 직접 삭제해 주세요.');
    }
    if (trash.path === folder) {
      throw new Error('이미 휴지통에 있는 메일입니다.');
    }

    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove(String(uid), trash.path, { uid: true });
      return { trash: trash.path };
    } finally {
      lock.release();
    }
  });
}

export interface EnvelopeInfo {
  uid: number;
  messageId: string;
  inReplyTo: string;
  references: string[];
  subject: string;
  date: Date | null;
  to: string[];
  cc: string[];
}

/**
 * 폴더의 최근 N통에서 **본문 없이 봉투 정보만** 읽는다.
 *
 * 회신 여부·삭제 여부를 맞춰 보는 데는 Message-ID 와 In-Reply-To 만 있으면 된다.
 * 본문(source)까지 받으면 보낸메일함 2,000통이 수백 MB가 되므로 절대 받지 않는다.
 *
 * vercelData 에서는 **우리가 보낸 콜드메일의 Message-ID 를 회수**하는 데 쓴다.
 * (nodemailer 가 돌려준 messageId 를 못 받았거나 과거 발송분을 소급 매칭할 때)
 */
export async function fetchEnvelopes(
  settings: ImapConfig,
  { folder, limit = 300 }: { folder: string; limit?: number },
): Promise<{ messages: EnvelopeInfo[]; total: number; readAll: boolean }> {
  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const total = (client.mailbox as any).exists;
      if (!total) return { messages: [], total: 0, readAll: true };

      const start = Math.max(1, total - limit + 1);
      const messages: EnvelopeInfo[] = [];
      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        envelope: true,
        // References 는 envelope 에 없어서 헤더로 따로 받는다 (수십 바이트)
        headers: ['references'],
      })) {
        const raw = msg.headers ? msg.headers.toString('utf8') : '';
        const refLine = raw.match(/^references:\s*([\s\S]*?)(?:\r?\n(?![ \t])|$)/im)?.[1] || '';
        const e: any = msg.envelope || {};
        messages.push({
          uid: msg.uid,
          messageId: e.messageId || '',
          inReplyTo: e.inReplyTo || '',
          references: refLine.split(/\s+/).map((x) => x.trim()).filter(Boolean),
          subject: e.subject || '',
          date: e.date || null,
          to: (e.to || []).map((x: any) => String(x.address || '').toLowerCase()).filter(Boolean),
          cc: (e.cc || []).map((x: any) => String(x.address || '').toLowerCase()).filter(Boolean),
        });
      }
      // 폴더 전체를 다 읽었는지 — '되살아난 메일' 판정에 필요하다.
      return { messages, total, readAll: start === 1 };
    } finally {
      lock.release();
    }
  });
}

// ═══ 보낸메일함 — 열어 볼 때만 바로 읽는다 ═══════════════════════
//
// 보낸 메일은 DB 에 수집하지 않는다. 수집하면 받은 메일함 목록·대화 묶기·
// 회신 필요 숫자에 우리 메일이 섞여 들어가 이미 맞춰 둔 화면들이 흔들린다.
// 대신 [📤 보낸 메일함]을 열 때 이카운트 보낸메일함을 그 자리에서 읽는다 —
// 웹메일과 항상 같은 내용이 보이고, 저장 공간도 늘지 않는다.
//
// 폴더 찾기와 읽기를 **연결 한 번**에 한다. 연결을 두 번 열면 화면이 그만큼 느려진다.

export interface SentListItem {
  uid: number;
  subject: string;
  date: Date | null;
  to: { name: string; address: string }[];
  cc: { name: string; address: string }[];
  size: number;
  hasAttachment: boolean;
}

/**
 * 보낸 메일 사본을 폴더에 넣는다 (IMAP APPEND) — lib/mail/sent-copy.ts 에서 쓴다.
 * SMTP 로 보내는 것만으로는 보낸메일함에 남지 않아, 웹메일에서도 이 앱에서도 보낸 기록이 안 보였다.
 */
export async function appendMessage(
  settings: ImapConfig,
  folder: string,
  raw: Buffer | string,
  flags: string[] = ['\\Seen'],
  date: Date = new Date(),
): Promise<void> {
  await withClient(settings, async (client) => {
    await client.append(folder, raw as any, flags, date);
  });
}

export async function findSentPath(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list();
  const spec = SPECIAL.sent;
  const hit = boxes.find((b: any) => b.specialUse === spec.use)
    || boxes.find((b: any) => spec.name.test(b.path));
  return hit?.path || null;
}

/** bodyStructure 안에 첨부(파일 이름이 있거나 attachment 로 표시된 파트)가 있는가 */
function structureHasAttachment(node: any): boolean {
  if (!node) return false;
  const disp = String(node.disposition || '').toLowerCase();
  const name = node.dispositionParameters?.filename || node.parameters?.name;
  if (disp === 'attachment' || (name && disp !== 'inline')) return true;
  return (node.childNodes || []).some(structureHasAttachment);
}

const addrList = (list: any[]) =>
  (list || []).map((x: any) => ({ name: String(x.name || ''), address: String(x.address || '').toLowerCase() }))
    .filter((x) => x.address);

/**
 * 보낸메일함 한 쪽(최신순)을 읽는다. 본문은 받지 않는다.
 * q 가 있으면 메일 서버에서 제목·받는 사람으로 찾는다.
 */
export async function listSentPage(
  settings: ImapConfig,
  { page = 1, pageSize = 30, q = '' }: { page?: number; pageSize?: number; q?: string } = {},
): Promise<{ folder: string | null; total: number; page: number; pageSize: number; items: SentListItem[] }> {
  return withClient(settings, async (client) => {
    const folder = await findSentPath(client);
    if (!folder) return { folder: null, total: 0, page, pageSize, items: [] };

    const lock = await client.getMailboxLock(folder);
    try {
      const exists = Number((client.mailbox as any)?.exists || 0);
      if (!exists) return { folder, total: 0, page, pageSize, items: [] };

      let range: string;
      let total: number;
      let useUid = false;
      if (q.trim()) {
        // 서버 검색 — 제목 또는 받는 사람. 결과 UID 를 최신순으로 잘라 한 쪽만 읽는다.
        const uids: number[] = ((await client.search({ or: [{ subject: q.trim() }, { to: q.trim() }] }, { uid: true })) || []) as number[];
        uids.sort((a, b) => b - a);
        total = uids.length;
        const slice = uids.slice((page - 1) * pageSize, page * pageSize);
        if (!slice.length) return { folder, total, page, pageSize, items: [] };
        range = slice.join(',');
        useUid = true;
      } else {
        total = exists;
        const end = exists - (page - 1) * pageSize;
        if (end < 1) return { folder, total, page, pageSize, items: [] };
        const start = Math.max(1, end - pageSize + 1);
        range = `${start}:${end}`;
      }

      const items: SentListItem[] = [];
      for await (const msg of client.fetch(range, { uid: true, envelope: true, bodyStructure: true, size: true }, { uid: useUid })) {
        const e: any = msg.envelope || {};
        items.push({
          uid: msg.uid,
          subject: e.subject || '',
          date: e.date || (msg as any).internalDate || null,
          to: addrList(e.to),
          cc: addrList(e.cc),
          size: Number((msg as any).size || 0),
          hasAttachment: structureHasAttachment((msg as any).bodyStructure),
        });
      }
      items.sort((a, b) => b.uid - a.uid);
      return { folder, total, page, pageSize, items };
    } finally {
      lock.release();
    }
  });
}

/** 보낸메일함의 메일 한 통 원문(source)을 받는다 */
export async function fetchSentSource(
  settings: ImapConfig,
  { uid }: { uid: number },
): Promise<{ folder: string; source: Buffer; internalDate?: Date }> {
  return withClient(settings, async (client) => {
    const folder = await findSentPath(client);
    if (!folder) throw new Error('메일함에서 보낸메일함을 찾지 못했습니다.');
    const lock = await client.getMailboxLock(folder);
    try {
      const msg: any = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
      if (!msg?.source) throw new Error('보낸메일함에서 이 메일을 찾지 못했습니다. 웹메일에서 지워졌을 수 있습니다.');
      return { folder, source: msg.source as Buffer, internalDate: toDate(msg.internalDate) };
    } finally {
      lock.release();
    }
  });
}

/** 보낸메일함 폴더 경로만 (첨부 받기에서 폴더를 검증할 때) */
export async function sentFolderPath(settings: ImapConfig): Promise<string | null> {
  return withClient(settings, (client) => findSentPath(client));
}
