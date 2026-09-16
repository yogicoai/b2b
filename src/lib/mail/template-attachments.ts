/**
 * 메일 양식에 붙이는 첨부파일 — 파일을 이 앱에 올리지 않고 **주소(URL)** 로 둔다.
 *
 * 왜 주소인가:
 * Vercel 서버에는 파일을 오래 둘 자리가 없고, 요청 본문도 4.5MB 에서 끊긴다.
 * 요기코는 이미 cafe24 오픈호스팅에 이미지·자료를 올려 쓰고 있으니
 * 양식에는 그 주소만 적어 두고, **보내는 순간** 서버가 받아서 메일에 붙인다.
 *
 * 보내기 전에 한 번 받아 보고 하나라도 실패하면 **메일을 보내지 않는다.**
 * 첨부가 빠진 채로 나간 메일은 되돌릴 수 없고, "첨부 드립니다" 라고 쓴 메일에
 * 파일이 없으면 받는 쪽에서 신뢰가 먼저 깎인다.
 */

export interface TemplateAttachment {
  name: string;
  url: string;
}

export interface LoadedAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export const MAX_TEMPLATE_ATTACHMENTS = 5;
/** 첨부 합계 상한 — 받는 쪽 메일 서버 대부분이 20~25MB 에서 거절한다. base64 로 1.37배 불어나므로 여유를 둔다 */
export const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

function fileNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last);
  } catch {
    return '';
  }
}

/** 화면에서 넘어온 값을 저장할 모양으로 다듬는다. 잘못된 줄은 조용히 버리지 않고 오류로 알린다. */
export function normalizeTemplateAttachments(input: unknown): { ok: true; list: TemplateAttachment[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, list: [] };
  if (!Array.isArray(input)) return { ok: false, error: '첨부파일 목록 형식이 잘못됐습니다.' };
  const list: TemplateAttachment[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const url = String((raw as any)?.url || '').trim();
    if (!url) continue;
    let u: URL;
    try { u = new URL(url); } catch { return { ok: false, error: `첨부파일 주소가 올바르지 않습니다: ${url.slice(0, 80)}` }; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return { ok: false, error: `첨부파일 주소는 http:// 또는 https:// 로 시작해야 합니다: ${url.slice(0, 80)}` };
    }
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    const name = String((raw as any)?.name || '').trim().replace(/[\r\n"\\/]/g, '_').slice(0, 120) || fileNameFromUrl(u.href) || 'attachment';
    list.push({ name, url: u.href });
  }
  if (list.length > MAX_TEMPLATE_ATTACHMENTS) {
    return { ok: false, error: `첨부파일은 ${MAX_TEMPLATE_ATTACHMENTS}개까지 붙일 수 있습니다.` };
  }
  return { ok: true, list };
}

/** 서버가 자기 안쪽(내부망)을 받아오게 만드는 주소는 막는다 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0.0.0.0' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * 양식의 첨부 주소를 전부 받아 온다. 하나라도 못 받으면 ok:false — 호출하는 쪽은 메일을 보내지 않는다.
 * 같은 양식으로 여러 곳에 보낼 때는 한 번만 불러 결과를 재사용한다.
 */
export async function loadTemplateAttachments(list: TemplateAttachment[] | undefined | null): Promise<{ ok: true; files: LoadedAttachment[] } | { ok: false; error: string }> {
  const items = Array.isArray(list) ? list.filter((a) => a && a.url) : [];
  if (!items.length) return { ok: true, files: [] };

  const files: LoadedAttachment[] = [];
  let total = 0;
  for (const a of items) {
    const label = a.name || fileNameFromUrl(a.url) || a.url;
    let u: URL;
    try { u = new URL(a.url); } catch { return { ok: false, error: `첨부 "${label}" 주소가 올바르지 않습니다.` }; }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || isPrivateHost(u.hostname)) {
      return { ok: false, error: `첨부 "${label}" 주소는 쓸 수 없는 주소입니다.` };
    }
    let res: Response;
    try {
      res = await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (e: any) {
      const why = e?.name === 'TimeoutError' ? `${FETCH_TIMEOUT_MS / 1000}초 안에 응답이 없습니다` : (e?.message || '연결 실패');
      return { ok: false, error: `첨부 "${label}" 를 받지 못해 보내지 않았습니다 (${why}).` };
    }
    if (!res.ok) {
      return { ok: false, error: `첨부 "${label}" 를 받지 못해 보내지 않았습니다 (주소 응답 ${res.status}). 주소가 맞는지 확인하세요.` };
    }
    const contentType = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    // 파일 주소 대신 웹페이지 주소를 넣으면 HTML 문서가 첨부된다 — 흔한 실수라 여기서 막는다
    if (contentType === 'text/html') {
      return { ok: false, error: `첨부 "${label}" 주소가 파일이 아니라 웹페이지입니다. 파일 자체의 주소(…/파일이름.pdf 같은)를 넣어주세요.` };
    }
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && total + declared > MAX_ATTACHMENT_TOTAL_BYTES) {
      return { ok: false, error: `첨부파일 합계가 ${MAX_ATTACHMENT_TOTAL_BYTES / 1024 / 1024}MB 를 넘어 보내지 않았습니다.` };
    }
    const content = Buffer.from(await res.arrayBuffer());
    total += content.length;
    if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
      return { ok: false, error: `첨부파일 합계가 ${MAX_ATTACHMENT_TOTAL_BYTES / 1024 / 1024}MB 를 넘어 보내지 않았습니다.` };
    }
    if (!content.length) return { ok: false, error: `첨부 "${label}" 가 빈 파일입니다.` };

    // 이름에 확장자가 없으면 주소의 확장자를 붙인다 — 받는 쪽에서 파일이 안 열리는 걸 막는다
    let filename = a.name || fileNameFromUrl(u.href) || 'attachment';
    if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
      const ext = (fileNameFromUrl(u.href).match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
      filename += ext;
    }
    files.push({ filename, content, contentType });
  }
  return { ok: true, files };
}
