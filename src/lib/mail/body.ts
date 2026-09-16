/**
 * 메일 본문을 **열 때 메일 서버에서 받아온다**.
 *
 * ── 왜 ──
 * 받은 메일의 원문(raw.html · raw.text)을 통째로 저장했더니, 답장마다 앞 대화가 인용으로
 * 딸려와 한 통이 6MB 까지 갔다. 512MB 짜리 저장소가 차면서 **쓰기가 막혀 메일 발송까지
 * 안 됐다**(2026-09-14). 그래서 저장은 미리보기 4,000자까지만 하고(lib/mail/ingest.ts
 * trimRawForStorage), 본문이 실제로 필요한 순간에 IMAP 으로 받아온다.
 * 첨부파일을 예전부터 그렇게 다뤄 왔다 — 파트 번호만 저장해 두고 누를 때 받아온다
 * (api/mail/[id]/attachment). 본문도 accountId + folder + uid 면 다시 받을 수 있다.
 *
 * ── 약속 ──
 * **예외를 던지지 않는다.** 메일 서버가 느리거나 원본이 지워졌다고 상세 화면이 통째로
 * 안 열리면 안 된다. 실패하면 저장된 미리보기에 error 를 붙여 돌려주고, 화면은 그대로 열린다.
 */
import { resolveAccount, toImapConfig } from './accounts';
import { fetchMessageSource } from './imap';
import { parseMessage } from './parse';

export interface MailBody {
  /** 본문 텍스트 전문 (못 받아왔으면 저장된 미리보기) */
  text: string;
  /** 원문 HTML — 저장하지 않으므로 서버에서 받아왔을 때만 채워진다 */
  html: string;
  /** 이번에 메일 서버에서 받아왔는가 (false = 저장된 값) */
  fromServer: boolean;
  /**
   * 인용부를 걷어낸 본문 — 서버에서 받아왔을 때만 채워진다.
   * 저장된 bodyStripped 는 미리보기라, 전문을 받아온 뒤에는 이 값을 써야 화면·분석이 맞는다.
   */
  stripped?: string;
  /** 못 받아온 이유 (사람이 읽는 말). 있어도 text 에는 미리보기가 들어 있다. */
  error?: string;
}

/**
 * 저장된 값만으로 충분한지 가르는 기준 — ingest.ts trimRawForStorage 의 PREVIEW_MAX 와 같은 값.
 * 이보다 긴 text 가 들어 있으면 본문을 통째로 저장하던 시절의 메일이다.
 */
const STORED_PREVIEW_MAX = 4000;

/**
 * 방금 받아온 본문을 잠깐 들고 있는다.
 *
 * 메일을 열면(상세) 본문을 받고, 그 화면에서 번역이나 초안을 누르면 같은 본문이 또 필요하다.
 * 그때마다 메일 서버에 붙으면 화면이 그만큼 느려지고 접속도 두 배가 된다.
 * 오래 들고 있을 이유는 없다 — 서버 한 대의 메모리이고, 원본이 바뀔 수도 있다.
 */
const CACHE_MAX = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; body: MailBody }>();

function cacheGet(key: string): MailBody | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // 최근 쓴 것을 맨 뒤로 — 넘칠 때 가장 오래 안 쓴 것부터 버린다
  cache.delete(key);
  cache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: MailBody): void {
  if (!key) return;
  cache.set(key, { at: Date.now(), body });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * 메일 1통의 본문을 돌려준다.
 *
 * @param mail InboundMail 도큐먼트 (lean 객체). accountId · folder · uid 가 있어야 서버에서 받아온다.
 *
 * 부르는 쪽에서 **먼저 권한을 확인해야 한다** (lib/mail/scope.ts mailFilter).
 * 여기서는 그 메일을 받은 계정으로 메일함을 열 뿐, 누가 볼 수 있는지는 판단하지 않는다.
 */
export async function loadMailBody(mail: any): Promise<MailBody> {
  const stored: MailBody = {
    text: String(mail?.raw?.text || mail?.bodyStripped || ''),
    html: String(mail?.raw?.html || ''),
    fromServer: false,
  };

  // 본문을 통째로 저장하던 시절의 메일 — 이미 다 있으므로 메일 서버에 붙을 이유가 없다
  if (stored.html || stored.text.length > STORED_PREVIEW_MAX) return stored;

  const id = String(mail?._id || mail?.id || '');
  const hit = id ? cacheGet(id) : null;
  if (hit) return hit;

  const folder = String(mail?.folder || '');
  const uid = Number(mail?.uid || 0);
  if (!folder || !uid) {
    // 아주 옛날에 수집된 메일 — 위치가 없으면 찾아올 방법이 없다
    return { ...stored, error: '저장된 메일 위치 정보가 없어 원문을 받아오지 못했습니다. 이카운트 웹메일에서 확인하세요.' };
  }

  try {
    // 계정은 **그 메일을 받은 계정** 그대로. 다른 계정으로 열면 같은 UID 의 엉뚱한 메일이 나온다
    // (첨부 받기에서 실제로 겪은 문제 — api/mail/[id]/attachment 주석 참고).
    const account: any = await resolveAccount(String(mail?.accountId || ''), 'system');
    if (!account) {
      return { ...stored, error: '이 메일을 받은 메일 계정을 찾을 수 없어 원문을 받아오지 못했습니다.' };
    }

    const source = await fetchMessageSource(toImapConfig(account, folder), { folder, uid });
    if (!source) {
      return { ...stored, error: '메일 서버에 원본이 없습니다. 웹메일에서 지워졌거나 폴더가 바뀌었을 수 있습니다.' };
    }

    const parsed = await parseMessage(source, { uid, folder });
    const body: MailBody = {
      text: parsed.raw.text || stored.text,
      html: parsed.raw.html || '',
      fromServer: true,
      stripped: parsed.bodyStripped || '',
    };
    // 받아온 것만 들고 있는다. 실패를 들고 있으면 잠깐 끊긴 것 때문에 5분 동안 계속 실패한다.
    cacheSet(id, body);
    return body;
  } catch (e: any) {
    // 어떤 이유로든(접속 실패·비밀번호 복호화 실패·폴더 없음) 화면은 열려야 한다
    return { ...stored, error: '메일 서버에서 원문을 받아오지 못했습니다: ' + String(e?.message || e) };
  }
}
