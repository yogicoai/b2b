/**
 * 원본(RFC822) → 저장용 도큐먼트 정규화.
 * 첨부는 메타데이터만 남기고 본문은 버린다(용량).
 *
 * (emailData/src/lib/mail/parse.js 이식)
 */
import { simpleParser } from 'mailparser';
import { stripQuotedForDisplay } from './quoted';

/** HTML 만 있는 메일을 위한 최소 텍스트 추출 */
function htmlToText(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 문자 분포로 언어 추정 — AI 호출 전에 대략만 잡고, 최종 판정은 분석 단계에서.
 *
 * 그냥 글자 수만 세면 한국어 메일이 영어로 잡힌다. 두 가지 이유가 겹친다.
 *   1) URL·메일주소는 언어와 무관한데 전부 로마자다. 이카운트 웹메일이 붙이는
 *      수신확인 링크 하나가 로마자 200자를 넘기기도 한다.
 *   2) 한글은 한 글자가 영어 한 단어에 해당한다. 낱글자끼리 비교하면
 *      영문 서명 블록만 있어도 본문이 한국어인 메일이 영어로 넘어간다.
 * 그래서 URL·주소를 걷어내고, 로마자는 단어 수에 가깝게 환산해 비교한다.
 */
const LATIN_PER_WORD = 4; // 영어 평균 단어 길이 — 한글 1글자와 견주는 기준

export function detectLang(text = ''): string {
  const s = text
    .slice(0, 4000)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, ' ');

  const ko = (s.match(/[가-힣]/g) || []).length;
  const ja = (s.match(/[぀-ヿ]/g) || []).length;
  const zh = (s.match(/[一-鿿]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length / LATIN_PER_WORD;

  const max = Math.max(ko, ja, zh, en);
  if (max === 0) return 'other';
  if (max === ko) return 'ko';
  if (max === ja) return 'ja';
  if (max === zh) return 'zh';
  return 'en';
}

export interface ParsedAddress { name: string; address: string }

const addr = (a: any): ParsedAddress[] =>
  (a?.value || []).map((v: any) => ({
    name: v.name || '',
    address: (v.address || '').toLowerCase(),
  }));

export interface ParsedMail {
  uid?: number;
  folder?: string;
  messageId: string;
  subject: string;
  from: ParsedAddress;
  fromAll: ParsedAddress[];
  to: ParsedAddress[];
  cc: ParsedAddress[];
  date: Date;
  receivedAt: Date;
  raw: { text: string; html: string };
  headers: {
    listUnsubscribe: string;
    precedence: string;
    autoSubmitted: string;
    inReplyTo: string;
    references: string[];
  };
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    partId: string | null;
    contentId: string | null;
    inline: boolean;
  }>;
  lang: string;
  bodyStripped: string;
}

export async function parseMessage(
  source: Buffer | string,
  { uid, folder, internalDate }: { uid?: number; folder?: string; internalDate?: Date } = {},
): Promise<ParsedMail> {
  const p: any = await simpleParser(source as any, { skipImageLinks: true } as any);

  const text = (p.text || '').trim() || htmlToText(p.html);
  const from = addr(p.from);
  const headerGet = (k: string): string => {
    const v = p.headers?.get(k);
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v.text || String(v.value || '');
  };

  const references: string[] = Array.isArray(p.references)
    ? p.references
    : (p.references ? String(p.references).split(/\s+/).filter(Boolean) : []);

  // 인용된 이전 대화는 빼고 판정한다. 답장에 통째로 딸려온 영문 원문 때문에
  // 한국어 회신이 영어로 잡히는 것을 막는다.
  //
  // 화면 기준(minKeep 1)으로 자른다 — "메일을 테스트 진행중" 같은 짧은 답장도
  // 새로 쓴 부분만 남겨야 화면에서 읽히고, 언어도 제대로 잡힌다.
  // (분석용 기준 80자를 쓰면 짧은 답장은 인용문이 통째로 남아 영어로 오판된다)
  const bodyStripped = stripQuotedForDisplay(text);

  return {
    uid,
    folder,
    messageId: p.messageId || `no-id-${folder}-${uid}`,
    subject: (p.subject || '(제목 없음)').trim(),
    from: from[0] || { name: '', address: '' },
    fromAll: from,
    to: addr(p.to),
    cc: addr(p.cc),
    date: p.date || internalDate || new Date(),
    receivedAt: new Date(),

    raw: {
      text,
      html: p.html || '',
    },

    headers: {
      listUnsubscribe: headerGet('list-unsubscribe'),
      precedence: headerGet('precedence'),
      autoSubmitted: headerGet('auto-submitted'),
      inReplyTo: p.inReplyTo || '',
      references,
    },

    // 파일 내용은 저장하지 않는다(용량). 대신 IMAP 파트 번호를 남겨 두고
    // 사용자가 다운로드를 누를 때 메일 서버에서 그 파트만 받아온다.
    attachments: (p.attachments || []).map((a: any, i: number) => ({
      filename: a.filename || `첨부${i + 1}`,
      contentType: a.contentType || 'application/octet-stream',
      size: a.size || 0,
      partId: a.partId || null,
      contentId: a.contentId || null,
      // 본문에 삽입된 이미지(서명 로고 등)는 목록에서 접어둔다
      inline: a.contentDisposition === 'inline',
    })),

    // 언어는 **상대가 쓴 본문**으로 판정한다.
    // 제목을 섞으면 답장이 오판된다 — "RE: K-beauty partnership inquiry" 처럼
    // 우리가 보낸 영문 제목이 그대로 따라오기 때문에, 한국어 답장이 영어로 잡힌다.
    // 본문이 비어 있을 때만(첨부만 있는 메일 등) 제목으로 넘어간다.
    lang: detectLang(bodyStripped || p.subject || ''),
    bodyStripped,
  };
}
