/**
 * 스레드 묶기 — 한 대화가 답장 수만큼 목록에 반복되는 것을 막는다.
 *
 * 실무 메일은 "Re: Re: RE: Fw: ..." 가 20번 붙으며 같은 건이 계속 새 행으로 보인다.
 * 대표는 "이 건이 어디까지 왔나"를 보고 싶은 것이므로, 대화 단위로 한 줄만 보여주고
 * 그 안에 몇 통이 오갔는지를 표시하는 편이 맞다.
 *
 * 묶는 기준은 정규화한 제목이다.
 *   - References/In-Reply-To 헤더가 더 정확하지만, 폴더별로 나눠 수집하다 보면
 *     대화의 시작 메일이 없는 경우가 많아 헤더만으로는 조각이 난다.
 *   - 제목은 실무에서 스레드 내내 유지되므로 이 데이터에서는 제목이 더 안정적이다.
 * 다만 제목만으로는 서로 다른 거래처의 같은 제목이 섞일 수 있어 거래처를 함께 묶는다.
 *
 * ⚠️ 스레드 키는 거래처(group)가 정해진 **뒤에** 계산해야 한다.
 *    순서가 바뀌면 같은 대화가 거래처별로 쪼개진다. (emailData 실측)
 *
 * (emailData/src/lib/mail/thread.js 이식)
 */

/** 답장·전달 접두어 — 한국어/영어/일본어/북유럽 메일 클라이언트에서 붙는 것들 */
const REPLY_PREFIX =
  /^\s*(re|ans|aw|sv|vs|vb|fw|fwd|rv|tr|답장|회신|전달|전송|참조)\s*(\[\d+\])?\s*[:：]\s*/i;

/**
 * 제목에서 답장·전달 접두어를 모두 벗겨 대화의 원래 제목을 얻는다.
 *   "Re: Re: RE: Fw: [Yogico] 계약" → "[yogico] 계약"
 */
export function normalizeSubject(subject = ''): string {
  let s = String(subject).trim();

  // "Re: Re: Fw:" 처럼 여러 겹이라 더 이상 벗겨지지 않을 때까지 반복
  for (let i = 0; i < 30; i++) {
    const next = s.replace(REPLY_PREFIX, '');
    if (next === s) break;
    s = next.trim();
  }

  return s
    .replace(/\s+/g, ' ')
    .replace(/[「」『』]/g, '')
    .trim()
    .toLowerCase();
}

export interface ThreadKeyInput {
  subject?: string;
  messageId?: string;
  group?: string;
  from?: { address?: string };
}

/**
 * 스레드 식별자. 같은 값이면 같은 대화로 본다.
 * 제목이 비어 있으면 묶지 않는다(각자 하나의 스레드).
 */
export function threadKey(mail: ThreadKeyInput): string {
  const subj = normalizeSubject(mail?.subject || '');
  if (!subj) return `id:${mail?.messageId || 'unknown'}`;

  // 거래처가 다르면 제목이 같아도 다른 대화로 본다
  const scope = mail?.group || (mail?.from?.address || '').split('@')[1] || '';
  return `${scope}::${subj}`;
}

/** 화면에 보여줄 제목 (접두어를 벗긴 원래 제목, 대소문자 보존) */
export function displaySubject(subject = ''): string {
  let s = String(subject).trim();
  for (let i = 0; i < 30; i++) {
    const next = s.replace(REPLY_PREFIX, '');
    if (next === s) break;
    s = next.trim();
  }
  return s || subject;
}
