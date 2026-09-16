/**
 * 메일함과 화면을 맞추는 작업 — 이 도구 밖에서 일어난 일을 따라잡는다.
 *
 * 이 앱은 받은 메일만 읽어 온다. 그래서 **이카운트 웹메일이나 휴대폰에서
 * 직접 회신하면** 화면은 계속 '회신 필요' 로 남는다.
 * 실제 업무는 웹메일에서도 이루어지므로, 그쪽에서 벌어진 일을 읽어 와야
 * 화면의 '회신 필요 58건' 이 실제와 맞는다.
 *
 * ⚠️ **틀리게 맞추느니 못 맞추는 편이 낫다.** 답하지 않은 메일에 '답변완료' 가
 *    찍히면 그 건은 브리핑·회신필요·기한에서 통째로 사라져 사람이 영영 놓친다.
 *    못 맞춘 건은 '회신 필요' 로 남을 뿐이라 눈에 보인다.
 *    그래서 아래 판정은 애매하면 전부 포기하는 쪽으로 짜여 있다.
 *
 * **읽기만** 한다. 메일함을 건드리지 않는다.
 * 본문은 받지 않고 봉투(Message-ID·In-Reply-To·제목·받는사람)만 본다.
 *
 * (emailData/src/lib/mail/reconcile.js 이식)
 */
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { findSpecialFolder, fetchEnvelopes, type ImapConfig, type EnvelopeInfo } from './imap';
import { normalizeSubject } from './thread';
import { moveRepliedToNegotiating } from './stage-on-reply';

/** 한 번에 훑을 최대 통수 — 보낸메일함은 최근 것만 봐도 충분하다 */
const SENT_SCAN = 400;

/**
 * 제목으로 맞출 때 거슬러 볼 후보 수.
 * 20통이면 하루 몇 통씩 오가는 거래처는 열흘치밖에 못 봐서, 그보다 오래된
 * 메일에 답한 것을 영영 못 찾는다. 날짜 상한을 함께 걸었으므로 넉넉히 잡는다.
 */
const SUBJECT_CANDIDATES = 60;

/** 사람이 정한 상태는 덮지 않는다 — 보관·무시는 이미 판단이 끝난 것이다 */
const OVERWRITABLE = ['new', 'reviewing'];

/**
 * 메일 시각과 발송 시각이 조금 어긋나는 것은 허용한다 (서버 시계 차이·초 단위 반올림).
 * 이보다 크게 뒤집히면 그 회신은 그 메일에 대한 답이 아니다.
 */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** 전달(FW)은 회신이 아니다 — 사내로 넘긴 것을 '답했다'로 세면 안 된다 */
const FORWARD_PREFIX = /^\s*(fw|fwd|전달|전송)\s*(\[\d+\])?\s*[:：]/i;

export interface ReconcileResult {
  folder: string | null;
  scanned: number;
  matched: number;
  skippedForward: number;
  skippedNoMatch: number;
  leadsCleared: number;
}

/**
 * 이 보낸메일이 그 받은메일에 대한 **회신**이라고 볼 수 있는가.
 *
 * 두 가지를 반드시 만족해야 한다.
 *   1) 받는사람(참조 포함)에 그 메일의 보낸사람이 들어 있을 것.
 *      회신은 물어본 사람에게 간다. 이 검사가 없으면 **사내 전달(FW)** 이
 *      회신으로 집계된다 — 고객은 답을 못 받았는데 화면에서는 처리된 것으로
 *      사라진다 (emailData 실측: 202건 중 23건이 FW 였다).
 *   2) 회신이 그 메일보다 나중에 나갔을 것.
 *      같은 제목의 대화가 몇 주씩 이어지므로, 이 검사가 없으면 7월에 보낸
 *      회신이 8월에 새로 온 메일에 붙는다 (실측: 17건 중 14건).
 */
function isReplyTo(sent: EnvelopeInfo, mail: any): boolean {
  const from = String(mail?.from?.address || '').toLowerCase();
  if (!from) return false;

  const recipients = new Set([...(sent.to || []), ...(sent.cc || [])]);
  if (!recipients.has(from)) return false;

  if (!sent.date || !mail.date) return false;
  return new Date(sent.date).getTime() + CLOCK_SKEW_MS >= new Date(mail.date).getTime();
}

/**
 * 보낸메일함을 읽어 **어느 메일에 회신했는지** 맞춘다.
 *
 * 후보를 찾는 순서 (정확한 것부터)
 *   1) In-Reply-To 가 가리키는 Message-ID   — 메일 클라이언트가 붙인 확실한 근거
 *   2) References 에 들어 있는 Message-ID   — 뒤쪽이 더 최근 메일이다
 *   3) 제목(Re: 제거) + 받는사람 = 그 메일의 보낸사람
 *      웹메일에서 '새 메일' 로 답장하면 헤더가 없어 이것 말고는 방법이 없다.
 *
 * 어느 경로로 찾았든 **isReplyTo() 를 통과해야만** 회신으로 인정한다.
 * 헤더가 가리킨다는 것은 '같은 대화'라는 뜻이지 '그 메일에 답했다'는 뜻이 아니다.
 */
export async function syncSentReplies(
  scoped: ImapConfig,
  { accountId = 'main', limit = SENT_SCAN }: { accountId?: string; limit?: number } = {},
): Promise<ReconcileResult> {
  const out: ReconcileResult = {
    folder: null, scanned: 0, matched: 0,
    skippedForward: 0, skippedNoMatch: 0, leadsCleared: 0,
  };

  const folder = await findSpecialFolder(scoped, 'sent');
  if (!folder) return out;
  out.folder = folder;

  const { messages } = await fetchEnvelopes(scoped, { folder, limit });
  out.scanned = messages.length;
  if (!messages.length) return out;

  const scope = { accountId };
  const clearedLeads = new Set<string>();

  for (const sent of messages) {
    // 전달은 회신이 아니다. 제목만으로 먼저 걸러 낸다 (받는사람 검사로도 대부분
    // 걸리지만, 원 발신자를 참조에 남긴 채 사내로 넘기는 경우가 있다).
    if (FORWARD_PREFIX.test(sent.subject || '')) { out.skippedForward++; continue; }

    let target: any = null;

    // 1·2) 헤더가 가리키는 대화. In-Reply-To 를 먼저, References 는 뒤(=최근)부터.
    //      $in 은 배열 순서를 지키지 않으므로 한꺼번에 받아 와 우선순위를 코드에서 매긴다.
    const ids = [sent.inReplyTo, ...[...(sent.references || [])].reverse()].filter(Boolean);
    if (ids.length) {
      const found: any[] = await InboundMail.find(
        { ...scope, messageId: { $in: ids } },
        { status: 1, date: 1, 'from.address': 1, messageId: 1, leadId: 1, repliedAt: 1 },
      ).lean();
      const byId = new Map(found.map((m) => [m.messageId, m]));
      for (const id of ids) {
        const m = byId.get(id);
        if (m && isReplyTo(sent, m)) { target = m; break; }
      }
    }

    // 3) 헤더로 못 찾으면 제목 + 받는사람으로 맞춘다.
    //    **회신보다 먼저 온 메일만** 후보로 본다 — 나중에 온 메일에 붙는 사고를 막는다.
    if (!target && sent.subject && (sent.to || []).length) {
      const base = normalizeSubject(sent.subject);
      if (base && sent.date) {
        const cutoff = new Date(new Date(sent.date).getTime() + CLOCK_SKEW_MS);
        const cands: any[] = await InboundMail.find(
          {
            ...scope,
            direction: { $ne: 'out' },
            'from.address': { $in: sent.to },
            date: { $lte: cutoff },
          },
          { status: 1, subject: 1, date: 1, 'from.address': 1, leadId: 1, repliedAt: 1 },
        ).sort({ date: -1 }).limit(SUBJECT_CANDIDATES).lean();

        // 제목이 같은 것 중 회신 직전에 온 것 — 대화에서 실제로 답한 메일이다
        const hit = cands.find((m) => normalizeSubject(m.subject) === base && isReplyTo(sent, m));
        if (hit) target = hit;
      }
    }

    if (!target) { out.skippedNoMatch++; continue; }

    // 이미 더 최근 회신이 기록돼 있으면 덮지 않는다.
    const prev = target.repliedAt ? new Date(target.repliedAt).getTime() : 0;
    if (prev && prev >= new Date(sent.date as any).getTime()) continue;

    await InboundMail.updateOne(
      { _id: target._id },
      {
        $set: {
          // 사람이 정한 상태(보관·무시)는 덮지 않는다
          status: OVERWRITABLE.includes(target.status) ? 'replied' : target.status,
          repliedAt: sent.date,
          repliedOutside: true,          // 앱 밖(웹메일)에서 답한 건이라는 표시
          'analysis.needsReply': false,  // 답했으므로 회신 필요 해제
        },
      },
    );
    out.matched++;
    if (target.leadId) {
      clearedLeads.add(target.leadId);
      // 웹메일·아웃룩·휴대폰에서 답한 것도 CRM 에서 답한 것과 똑같이 [대화 진행 중] 으로 옮긴다
      await moveRepliedToNegotiating(target.leadId);
    }
  }

  // 리드의 '회신 필요' 도 함께 내린다 — 화면 배지가 실제와 맞아야 한다
  for (const leadId of clearedLeads) {
    const stillNeeds = await InboundMail.countDocuments({
      leadId, direction: 'in', trashedAt: null,
      'analysis.needsReply': true,
      status: { $in: ['new', 'reviewing'] },
    });
    if (!stillNeeds) {
      await Lead.updateOne({ leadId }, { $set: { needsReply: false } });
      out.leadsCleared++;
    }
  }

  return out;
}
