/**
 * 수집 파이프라인 오케스트레이션.
 *   IMAP fetch → parse → 규칙 필터 → 로컬 분석 → 저장
 *
 * 한 통이 실패해도 전체가 멈추지 않도록 통별로 try/catch 한다.
 * lastUid 는 성공적으로 처리한 최대 UID 까지만 전진시켜, 중단 시 다음 회차에 이어받는다.
 *
 * vercelData 는 이카운트 단일 계정 전용이라 원본(emailData)의 다계정 루프를 걷어냈다.
 * AI 분석(Phase 5)·거래처 학습(Phase 6)·리드 매칭(Phase 3)은 아직 붙지 않았다.
 *
 * (emailData/src/lib/mail/ingest.js 이식)
 */
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { MailSyncState } from '@/models/MailSyncState';
import { MailSettings } from '@/models/MailSettings';
import { getMailSettings, foldersOf } from '@/lib/mail-settings';
import { fetchNew, fetchRecent, fetchSinceBatch, listMailboxes, withOpenAccount, type ImapConfig } from './imap';
import { parseMessage, type ParsedMail } from './parse';
import { threadKey } from './thread';
import { ruleClassify, shouldAnalyze, type RuleResult } from './classify';
import { localAnalyze } from './local-analyze';
import { matchLead, shouldMoveToReplied } from './match-lead';
import { listMailAccounts, resolveAccount, toImapConfig } from './accounts';
import { KEEP_DAYS } from './retention';
import { learnSenderGroups, suggestGroupBySender, suggestGroupByName, listGroups, type LearnedGroups } from './groups';
import { syncSentReplies } from './reconcile';
import { accountIdsForOwner } from './scope';

/**
 * 거래처 학습(발신자→폴더명)을 **그 계정 주인이 볼 수 있는 메일** 안에서만 한다.
 * 전체 메일로 배우면 다른 아이디가 나눠 둔 거래처 폴더명이 내 새 메일에 붙어, 남의 거래처가 드러난다.
 */
async function learnForOwner(owner: string, cache: Map<string, { learned: LearnedGroups | null; knownGroups: string[] }>) {
  const key = owner || '(none)';
  const hit = cache.get(key);
  if (hit) return hit;
  let learned: LearnedGroups | null = null;
  let knownGroups: string[] = [];
  try {
    const ids = owner ? await accountIdsForOwner(owner) : [];
    learned = await learnSenderGroups(ids);
    const g = await listGroups(undefined, ids);
    knownGroups = g.groups.map((x) => x.group).filter(Boolean);
  } catch { /* 학습이 실패해도 수집은 한다 (폴더 기반 분류는 그대로) */ }
  const v = { learned, knownGroups };
  cache.set(key, v);
  return v;
}
import { Lead } from '@/models/Lead';
import { MailAccount } from '@/models/MailAccount';

/** 개인 메일 도메인 — 여기서 온 것은 도메인만으로 자사 발신이라 볼 수 없다 */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'naver.com', 'daum.net', 'hanmail.net',
  'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com',
  'nate.com', 'kakao.com', 'protonmail.com', 'yandex.com',
]);

/**
 * 이 메일을 '우리가 보낸 것'으로 볼지.
 *
 * 회사 도메인(yogico.kr)이면 누가 보냈든 우리 쪽 메일이 맞다.
 * 다만 개인 메일 계정을 등록하면 도메인이 gmail.com 이라, 도메인만 보면
 * 지메일에서 온 거래처 메일이 전부 '내가 보낸 메일'로 잡혀 통째로 사라진다.
 * 개인 메일 도메인은 주소가 정확히 같을 때만 자사 발신으로 본다.
 */
function isOutbound(fromAddress: string | undefined, imapUser: string): boolean {
  const from = String(fromAddress || '').toLowerCase();
  if (!from) return false;

  const me = String(imapUser || '').toLowerCase();
  if (me && from === me) return true;

  const domain = from.split('@')[1] || '';
  if (!domain || FREE_MAIL.has(domain)) return false;

  const myDomain = me.split('@')[1] || '';
  return Boolean(myDomain) && domain === myDomain;
}

/** 거래처 폴더인지 — INBOX 하위 폴더는 대표가 손수 나눠 둔 거래처 분류다 */
function isGroupFolder(folder: string): boolean {
  return /^INBOX[./]/i.test(folder) && !/^INBOX[./](Sent|Trash|Drafts|Junk|Spam)/i.test(folder);
}

/** 'INBOX.Dangaard Beauty' → 'Dangaard Beauty' */
function groupNameFromFolder(folder: string): string {
  return folder.replace(/^INBOX[./]/i, '').trim();
}

export interface FolderStat {
  accountId: string;
  accountLabel: string;
  folder: string;
  group: string | null;
  fetched: number;
  inserted: number;
  duplicate: number;
  ruleFiltered: number;
  grouped: number;        // 발신자·제목 학습으로 거래처가 붙은 수
  matched: number;        // 리드에 연결된 답장 수
  movedToReplied: number; // stage 를 'replied' 로 올린 리드 수
  errors: Array<{ uid: number; error: string }>;
}

export interface MatchedReply {
  messageId: string;
  leadId: string;
  company?: string;
  matchedBy: string;
  subject: string;
  from: string;
  movedToReplied: boolean;
}

export interface IngestResult {
  folders: FolderStat[];
  fetched: number;
  inserted: number;
  duplicate: number;
  ruleFiltered: number;
  grouped: number;           // 발신자·제목 학습으로 거래처가 붙은 수
  matched: number;           // 리드에 연결된 답장 수
  movedToReplied: number;    // stage 가 'replied' 로 올라간 리드 수
  replies: MatchedReply[];   // 화면·브리핑에 바로 쓸 수 있는 매칭 내역
  pendingAnalysis: number;   // AI 분석 대상 (Phase 5 에서 사용)
  insertedMessageIds: string[];
  // 보낸메일함 대조 결과 — 웹메일에서 직접 답한 건을 찾아낸 수
  reconciled?: { scanned: number; matched: number; leadsCleared: number };
  errors: string[];
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

export interface IngestOptions {
  /** 1회 수집 최대 통수 (폴더당). 미지정 시 설정값 */
  limit?: number;
  /** 지정 시 lastUid 를 무시하고 최근 N통을 가져온다 (최초 세팅·테스트용) */
  recent?: number;
  /** 지정 시 이 폴더들만 수집 */
  folders?: string[];
  /**
   * 수집할 메일 계정.
   *   MailAccount._id → 그 계정만
   *   'all'           → 등록된 활성 계정 전부
   *   미지정          → 기본 계정
   */
  accountId?: string;
  /**
   * 누가 돌렸는가 (lib/mail/scope.ts). 로그인한 사람이면 그 사람 계정만 모은다.
   * 비우면 크론 같은 시스템 실행 — 모든 사람의 계정을 모은다.
   */
  user?: string | null;
}

/**
 * 신규 삽입만 한다(이미 있으면 건드리지 않음).
 * 사람이 붙인 상태·메모를 재수집이 덮지 않도록 $setOnInsert 를 쓴다.
 */
/** 광고·자동발송·뉴스레터 — 읽을 일이 없어 전용 폴더(AD_FOLDER)로 치워둔다 */
const AD_CLASSES = ['ad', 'system', 'newsletter'] as const;

/**
 * 저장 전에 **본문을 버린다** — 미리보기만 남긴다.
 *
 * DB 용량이 꽉 차면 메일도 못 보낸다 (2026-09-14 실제로 막혔다). 원인은 본문이었다.
 * 답장은 앞 대화를 통째로 인용해서 한 통이 6MB 까지 갔고, 그런 메일이 쌓이는 속도를
 * '잘라 담기'(html 300KB · text 100KB)로는 못 따라간다. 무료 512MB 짜리 저장소다.
 *
 * 그래서 **본문은 저장하지 않고, 열 때 메일 서버에서 받아온다** (lib/mail/body.ts).
 * 첨부파일을 예전부터 그렇게 다뤘다 — 파트 번호만 저장해 두고 누를 때 IMAP 에서 받아온다.
 * 메일 본문도 accountId + folder + uid 만 있으면 언제든 다시 받을 수 있고, 원본이
 * 지워지지 않는 한 웹메일과 항상 같은 내용이 보인다.
 *
 * 여기 남기는 것은 **미리보기뿐이다**:
 *   - bodyStripped 4,000자 — 목록 미리보기 · 로컬 분석(local-analyze) 입력
 *   - raw.text     4,000자 — 옛 화면·스크립트가 아직 읽는 자리 (호환용)
 *   - raw.html     항상 버린다 — 용량의 대부분이 여기였다. 원문 보기는 열 때 받아온다.
 * 무엇이든 잘렸으면 rawTruncated 로 표시한다 — 화면·스크립트가 "이게 전부가 아니다" 를 알아야 한다.
 */
const PREVIEW_MAX = 4000;
export function trimRawForStorage(doc: Record<string, any>): void {
  const raw = doc.raw || {};
  let cut = false;

  // HTML 원문은 분류에 상관없이 저장하지 않는다 (있었다면 '잘랐다'로 표시)
  if (typeof raw.html === 'string' && raw.html.length > 0) cut = true;
  raw.html = '';

  if (typeof raw.text === 'string' && raw.text.length > PREVIEW_MAX) {
    raw.text = raw.text.slice(0, PREVIEW_MAX);
    cut = true;
  }
  if (typeof doc.bodyStripped === 'string' && doc.bodyStripped.length > PREVIEW_MAX) {
    doc.bodyStripped = doc.bodyStripped.slice(0, PREVIEW_MAX);
    cut = true;
  }

  doc.raw = raw;
  if (cut) doc.rawTruncated = true;
}

async function insertMail(doc: Record<string, any>): Promise<'inserted' | 'duplicate'> {
  try {
    const r = await InboundMail.updateOne(
      { messageId: doc.messageId },
      {
        $setOnInsert: {
          ...doc,
          classification: doc.classification || 'unknown',
          classifiedBy: doc.classifiedBy || null,
          status: 'new',
          memo: '',
          tags: [],
          translation: null,
          drafts: [],
        },
      },
      { upsert: true },
    );
    return (r.upsertedCount ?? 0) > 0 ? 'inserted' : 'duplicate';
  } catch (e: any) {
    // 동시 수집 시 유니크 인덱스 충돌 — 중복으로 취급
    if (e?.code === 11000) return 'duplicate';
    throw e;
  }
}

/**
 * 새로 들어온 수신 메일 1통을 리드에 연결한다.
 *
 * 매칭되면:
 *   - InboundMail.leadId / leadMatchedBy 기록
 *   - Lead 의 답장 지표 갱신 (inboundCount · lastInboundAt · needsReply · replyDeadline · threadKeys)
 *   - 조건을 만족하면 stage 를 'replied' 로 승격
 *
 * 매칭 실패는 정상 케이스다 — 우리가 보낸 적 없는 곳에서 온 메일이 대부분이다.
 */
async function linkToLead(
  doc: Record<string, any>,
  opts: { autoMatch: boolean; autoMove: boolean },
): Promise<MatchedReply | null> {
  if (!opts.autoMatch) return null;
  if (doc.direction === 'out') return null;   // 우리가 보낸 메일은 답장이 아니다

  const hit = await matchLead({
    inReplyTo: doc.inReplyTo,
    references: doc.references,
    from: doc.from,
  });
  if (!hit) return null;

  // 수신 메일에 리드 연결 기록
  await InboundMail.updateOne(
    { messageId: doc.messageId },
    { $set: { leadId: hit.leadId, leadMatchedBy: hit.matchedBy } },
  );

  const move = opts.autoMove
    && shouldMoveToReplied(hit.stage, doc.classification, doc.direction);

  const nowIso = new Date(doc.date || Date.now()).toISOString();

  // 받은 답장 수는 **실제 개수를 센다**. $inc 로 더하면 재수집할 때마다 부풀어
  // 실제 1통인데 3통으로 표시된다(실측). 세는 편이 언제 돌려도 정확하다.
  const inboundCount = await InboundMail.countDocuments({
    leadId: hit.leadId,
    direction: 'in',
    trashedAt: null,
  });

  const set: Record<string, any> = {
    lastInboundAt: nowIso,
    needsReply: Boolean(doc.analysis?.needsReply),
    inboundCount,
  };
  if (doc.analysis?.deadline) {
    set.replyDeadline = new Date(doc.analysis.deadline).toISOString();
  }
  if (move) {
    set.stage = 'replied';
    set.stageChangedAt = new Date().toISOString();
  }

  await Lead.updateOne(
    { leadId: hit.leadId },
    {
      $set: set,
      // 같은 스레드가 여러 번 들어와도 중복 저장하지 않는다
      $addToSet: { threadKeys: doc.threadKey },
    },
  );

  return {
    messageId: doc.messageId,
    leadId: hit.leadId,
    company: hit.company,
    matchedBy: hit.matchedBy,
    subject: doc.subject,
    from: doc.from?.address || '',
    movedToReplied: move,
  };
}

async function getSyncState(folder: string, accountId = 'main') {
  const found = await MailSyncState.findOne({ folder, accountId }).lean();
  return found || { folder, accountId, lastUid: 0, lastSyncAt: null, lastError: '' };
}

async function setSyncState(folder: string, patch: Record<string, any>, accountId = 'main') {
  await MailSyncState.updateOne(
    { folder, accountId },
    { $set: { folder, accountId, ...patch } },
    { upsert: true },
  );
}

/** 폴더 하나를 수집한다. 실패해도 다른 폴더는 계속 돌 수 있도록 예외를 밖으로 던진다. */
async function ingestFolder(
  scoped: ImapConfig,
  folder: string,
  opts: {
    limit: number; recent?: number; imapUser: string; settings: any;
    accountId: string; accountLabel: string;
    learned?: LearnedGroups | null; knownGroups?: string[];
    /** 기간 가져오기 — 이 날짜 이후 메일을 afterUid 뒤부터 limit 통 (runBackfill) */
    backfill?: { since: Date; afterUid: number };
  },
): Promise<{ stat: FolderStat; pendingIds: string[]; replies: MatchedReply[]; window?: { total: number; remaining: number; lastUid: number } }> {
  const accountId = opts.accountId;
  const state = await getSyncState(folder, accountId);
  const group = isGroupFolder(folder) ? groupNameFromFolder(folder) : null;

  const stat: FolderStat = {
    accountId,
    accountLabel: opts.accountLabel,
    folder,
    group,
    fetched: 0, inserted: 0, duplicate: 0, ruleFiltered: 0, grouped: 0,
    matched: 0, movedToReplied: 0,
    errors: [],
  };
  const replies: MatchedReply[] = [];

  const since = opts.backfill
    ? await fetchSinceBatch(scoped, { folder, since: opts.backfill.since, afterUid: opts.backfill.afterUid, limit: opts.limit })
    : null;
  const batch = since
    ? { messages: since.messages }
    : opts.recent
      ? await fetchRecent(scoped, { folder, limit: Number(opts.recent) })
      : await fetchNew(scoped, { folder, sinceUid: state.lastUid || 0, limit: opts.limit });

  stat.fetched = batch.messages.length;
  let maxUid = state.lastUid || 0;
  const pendingIds: string[] = [];

  for (const msg of batch.messages) {
    try {
      const parsed: ParsedMail = await parseMessage(msg.source, {
        uid: msg.uid,
        folder,
        internalDate: msg.internalDate,
      });

      const doc: Record<string, any> = {
        messageId: parsed.messageId,
        accountId,
        folder,
        uid: parsed.uid,
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        date: parsed.date,
        receivedAt: parsed.receivedAt,
        lang: parsed.lang,
        raw: parsed.raw,
        bodyStripped: parsed.bodyStripped,
        attachments: parsed.attachments,
        inReplyTo: parsed.headers.inReplyTo,
        references: parsed.headers.references,
      };

      // 거래처 판정 — 확실한 것부터.
      //   1순위 폴더        대표가 손수 넣어둔 것이므로 확정
      //   2순위 발신자 이력  같은 곳에서 온 메일은 같은 거래처 (무료)
      //   3순위 제목의 거래처명 (무료 · 제목만 본다)
      if (group) {
        doc.group = group;
        doc.groupBy = 'folder';
      } else if (opts.learned) {
        const s = suggestGroupBySender({ from: parsed.from }, opts.learned)
          || suggestGroupByName({ subject: parsed.subject }, opts.knownGroups || []);
        if (s) {
          doc.group = s.group;
          doc.groupBy = (s as any).by === 'name'
            ? `name:${(s as any).matched}`
            : `sender:${(s as any).by}`;
          stat.grouped++;
        }
      }

      // 보낸 메일인지 받은 메일인지 — 우리가 쓴 메일은 '할 일'이 아니다.
      // 브리핑·AI 요약 대상에서 빠지고, 보관·조회는 그대로 된다.
      doc.direction = isOutbound(parsed.from?.address, opts.imapUser) ? 'out' : 'in';

      // ⚠️ 스레드 키는 거래처가 정해진 **뒤에** 만든다.
      //    같은 제목이라도 거래처가 다르면 다른 대화이므로 순서가 중요하다.
      doc.threadKey = threadKey({
        subject: doc.subject,
        messageId: doc.messageId,
        group: doc.group,
        from: doc.from,
      });

      // 규칙 필터 — AI 비용이 드는 분석 전에 광고·자동발송을 걸러낸다
      const rule: RuleResult | null = ruleClassify(
        { subject: parsed.subject, raw: parsed.raw, from: parsed.from, to: parsed.to, headers: parsed.headers },
        opts.settings,
      );
      if (rule) {
        doc.classification = rule.classification;
        doc.classifiedBy = 'rule';
        if (rule.confident) stat.ruleFiltered++;
      }

      // ── 광고·자동발송은 전용 폴더로 ──
      //
      // 이것들은 거래처 폴더 어디에도 안 들어가서 [미분류]에 계속 쌓인다.
      // 그러면 "미분류에 진짜 볼 것이 있나" 를 볼 때마다 광고를 헤집게 된다.
      // 지우지 않고 한 폴더로 모으면 미분류에는 판단이 필요한 것만 남는다.
      //
      // 폴더가 이미 정해진 것도 옮긴다 — 단, **프로그램이 추측한 폴더**일 때만.
      // 발신자 이력(sender:*)·제목(name:*)으로 찍은 폴더는 틀릴 수 있어서,
      // 거래처와 한 번 주고받았다는 이유만으로 그 뒤 광고까지 그 거래처
      // 폴더에 쌓인다. 광고가 거래처 대화 사이에 섞이면 대화를 못 읽는다.
      //
      // 사람이 정한 폴더는 건드리지 않는다:
      //   groupBy 'folder'  대표가 이카운트 메일함에서 직접 넣은 것
      //   groupBy 'manual'  이 화면에서 직접 옮긴 것
      // 사람이 일부러 거기 둔 것을 자동 규칙이 뒤집으면, 옮겨놔도 소용없는
      // 화면이 된다.
      //
      // ⚠️ 분류(ruleClassify) 뒤에 와야 한다. 그 전에는 classification 이 없다.
      const humanFiled = doc.groupBy === 'folder' || doc.groupBy === 'manual';
      if (!humanFiled && AD_CLASSES.includes(doc.classification as any)) {
        doc.group = AD_FOLDER;
        doc.groupBy = 'auto-ad';
        // 폴더가 바뀌었으니 스레드 키도 다시 만든다.
        // 안 그러면 같은 대화가 폴더별로 쪼개진다 (위 threadKey 주석 참고).
        doc.threadKey = threadKey({
          subject: doc.subject,
          messageId: doc.messageId,
          group: doc.group,
          from: doc.from,
        });
      }

      // 로컬 1차 분석 — API 호출 없이(무료) 답변필요·기한 후보를 잡아둔다
      const la = localAnalyze({
        subject: parsed.subject,
        raw: parsed.raw,
        date: parsed.date,
        receivedAt: parsed.receivedAt,
        classification: doc.classification,
        headers: parsed.headers,
      });
      // 우리가 보낸 메일은 '할 일'이 아니다 — 본문에 질문이 있어도 그건 우리가 상대에게 한 질문이다.
      // 예전에는 보낸 메일 64통 중 47통이 '회신 필요'로 찍혀 받은 메일함 맨 위를 차지했다.
      const outbound = doc.direction === 'out';
      doc.analysis = {
        method: la.method,
        needsReply: outbound ? false : la.needsReply,
        deadline: outbound ? null : la.deadline,
        urgency: la.urgency,
        summary: la.replyReason,
        keyPoints: la.points,
        analyzedAt: la.analyzedAt,
      };

      trimRawForStorage(doc);
      const r = await insertMail(doc);
      if (r === 'inserted') {
        stat.inserted++;
        // 광고·자동발송으로 확정되지 않은 것만 AI 분석 대기열에 올린다
        if (shouldAnalyze(rule) && doc.direction === 'in') pendingIds.push(doc.messageId);

        // 리드 매칭 — 신규 삽입분만. 재수집분까지 매칭하면 inboundCount 가 중복 증가한다.
        try {
          const linked = await linkToLead(doc, {
            autoMatch: opts.settings.autoMatchLead !== false,
            autoMove: opts.settings.autoMoveToReplied !== false,
          });
          if (linked) {
            stat.matched++;
            if (linked.movedToReplied) stat.movedToReplied++;
            replies.push(linked);
          }
        } catch (e: any) {
          // 매칭 실패가 수집을 무효로 만들지는 않는다 — 메일은 이미 저장됐다
          stat.errors.push({ uid: msg.uid, error: `리드 매칭 실패: ${String(e?.message || e)}` });
        }
      } else {
        stat.duplicate++;
      }

      maxUid = Math.max(maxUid, msg.uid);
    } catch (e: any) {
      stat.errors.push({ uid: msg.uid, error: String(e?.message || e) });
      // 파싱 실패분에서 멈추면 영원히 재시도하므로 UID 는 전진시킨다
      maxUid = Math.max(maxUid, msg.uid);
    }
  }

  await setSyncState(folder, {
    // 기간 가져오기는 오래된 것부터 올라가므로, 이미 더 앞선 수집 위치가 있으면 뒤로 되돌리지 않는다
    lastUid: Math.max(maxUid, state.lastUid || 0),
    lastSyncAt: new Date(),
    lastError: stat.errors.length ? `${stat.errors.length}통 처리 실패` : '',
  }, accountId);

  return {
    stat, pendingIds, replies,
    window: since ? { total: since.total, remaining: since.remaining, lastUid: since.lastUid } : undefined,
  };
}

export interface BackfillCursor {
  /** 이 계정에서 돌 폴더 (첫 호출 때 정해 둔다) */
  folders: string[];
  folderIndex: number;
  afterUid: number;
  /** 폴더별 기간 안 메일 수 · 처리한 수 — 진행 표시용 */
  progress: Record<string, { total: number; done: number }>;
}

export interface BackfillResult {
  accountId: string;
  accountLabel: string;
  done: boolean;
  cursor: BackfillCursor | null;
  fetched: number;
  inserted: number;
  duplicate: number;
  matched: number;
  errors: string[];
}

/**
 * [📥 전체 메일함 2달 가져오기] — 한 계정의 받은편지함 + 거래처 폴더에서 기간 안의 메일을 모두 가져와
 * 평소 수집과 **똑같이** 분류(규칙 분류·광고 폴더·거래처 폴더·로컬 분석·리드 연결)해서 넣는다.
 *
 * 서버 한 번 실행 시간이 짧아(서버리스) budgetMs 안에서 끊고 cursor 를 돌려준다.
 * 화면이 cursor 를 넘겨 done 이 될 때까지 다시 부른다. 이미 있는 메일은 중복으로 건너뛴다.
 */
export async function runBackfill(opts: {
  accountId: string;
  user?: string | null;
  days?: number;
  cursor?: BackfillCursor | null;
  batchSize?: number;
  budgetMs?: number;
}): Promise<BackfillResult> {
  const started = Date.now();
  await dbConnect();
  const settings = await getMailSettings();
  const account: any = await resolveAccount(opts.accountId, opts.user || 'system');
  const out: BackfillResult = {
    accountId: String(opts.accountId), accountLabel: '', done: false, cursor: null,
    fetched: 0, inserted: 0, duplicate: 0, matched: 0, errors: [],
  };
  if (!account) { out.errors.push('메일 계정을 찾을 수 없습니다'); out.done = true; return out; }
  out.accountId = String(account._id);
  out.accountLabel = account.accountName || account.smtpUser;

  // 화면이 위치를 안 넘겼으면 — 지난번에 멈춘 자리부터, 또는 같은 메일함을 이미 다 가져왔으면 건너뛴다
  if (!opts.cursor) {
    if (account.backfillCursor && Array.isArray(account.backfillCursor.folders) && account.backfillCursor.folders.length) {
      opts = { ...opts, cursor: account.backfillCursor };
    } else {
      const key = `${String(account.smtpUser || '').trim().toLowerCase()}|${String(account.smtpHost || '').trim().toLowerCase()}`;
      const siblings: any[] = await MailAccount.find({ _id: { $ne: account._id }, backfilledAt: { $ne: null } }, { smtpUser: 1, smtpHost: 1 }).lean();
      if (siblings.some((a) => `${String(a.smtpUser || '').trim().toLowerCase()}|${String(a.smtpHost || '').trim().toLowerCase()}` === key)) {
        // 같은 주소를 다른 아이디가 이미 2달치 가져왔다 — 메일은 이미 DB 에 있고 이 계정에서도 보인다 (lib/mail/scope.ts)
        await MailAccount.updateOne({ _id: account._id }, { $set: { backfilledAt: new Date(), backfillCursor: null } });
        out.done = true;
        return out;
      }
    }
  }

  // 가져오는 창은 **2달**로 잠근다 (lib/mail/retention.ts KEEP_DAYS · 대표님 결정 2026-09-15).
  // 더 넓게 달라고 해도 여기서 자른다 — "2달 지난 건 안 불러온다" 가 규칙이고,
  // 규칙이 한 곳에만 적혀 있으면 부르는 쪽이 늘어날 때 조용히 깨진다.
  const days = Math.max(1, Math.min(KEEP_DAYS, Number(opts.days) || KEEP_DAYS));
  const sinceDate = new Date(Date.now() - days * 86400000);
  const batchSize = Math.max(5, Math.min(100, Number(opts.batchSize) || 40));
  const budgetMs = Math.max(10_000, Math.min(240_000, Number(opts.budgetMs) || 50_000));

  const { learned, knownGroups } = await learnForOwner(String(account.owner || ''), new Map());

  let base: ImapConfig;
  try {
    base = toImapConfig(account, 'INBOX');
  } catch (e: any) {
    out.errors.push(String(e?.message || e));
    out.done = true;
    return out;
  }

  try {
    await withOpenAccount(base, async (scoped) => {
      // 폴더 목록은 첫 호출에만 정한다 — 받은편지함 + 사람이 나눠 둔 거래처 폴더 (보낸·휴지통·스팸 제외)
      let cursor: BackfillCursor = opts.cursor && Array.isArray(opts.cursor.folders) && opts.cursor.folders.length
        ? opts.cursor
        : { folders: [], folderIndex: 0, afterUid: 0, progress: {} };
      if (!cursor.folders.length) {
        let boxes: string[] = [];
        try { boxes = await listMailboxes(scoped); } catch { boxes = []; }
        const groupFolders = boxes.filter((b) => isGroupFolder(b));
        cursor.folders = [...new Set(['INBOX', ...(account.imapFolders || []), ...groupFolders])].filter(Boolean);
      }

      while (cursor.folderIndex < cursor.folders.length) {
        if (Date.now() - started > budgetMs) break;
        const folder = cursor.folders[cursor.folderIndex];
        try {
          const r = await ingestFolder(scoped, folder, {
            limit: batchSize,
            imapUser: account.smtpUser,
            settings,
            accountId: String(account._id),
            accountLabel: out.accountLabel,
            learned,
            knownGroups,
            backfill: { since: sinceDate, afterUid: cursor.afterUid },
          });
          out.fetched += r.stat.fetched;
          out.inserted += r.stat.inserted;
          out.duplicate += r.stat.duplicate;
          out.matched += r.stat.matched;
          const w = r.window || { total: 0, remaining: 0, lastUid: cursor.afterUid };
          const prev = cursor.progress[folder] || { total: w.total, done: 0 };
          cursor.progress[folder] = { total: w.total, done: Math.min(w.total, prev.done + r.stat.fetched) };
          if (w.remaining > 0 && r.stat.fetched > 0) {
            cursor.afterUid = w.lastUid;
          } else {
            cursor.folderIndex++;
            cursor.afterUid = 0;
          }
        } catch (e: any) {
          // 폴더 하나가 실패해도 다음 폴더로 넘어간다 (없어진 폴더·권한 문제)
          out.errors.push(`[${folder}] ${String(e?.message || e)}`);
          cursor.folderIndex++;
          cursor.afterUid = 0;
        }
      }

      out.done = cursor.folderIndex >= cursor.folders.length;
      out.cursor = out.done ? null : cursor;
      // 끝났으면 표시(다음 로그인 때 다시 돌지 않게), 아니면 위치를 남겨 창을 닫아도 이어 가게
      await MailAccount.updateOne(
        { _id: account._id },
        { $set: out.done ? { backfilledAt: new Date(), backfillCursor: null } : { backfillCursor: cursor } },
      );

      // 다 가져왔으면 보낸메일함과 대조해 이미 답한 메일의 '회신 필요'를 내린다
      if (out.done) {
        try { await syncSentReplies(scoped, { accountId: String(account._id) }); } catch (e: any) {
          out.errors.push(`[보낸메일함 대조] ${String(e?.message || e)}`);
        }
      }
    });
  } catch (e: any) {
    out.errors.push(String(e?.message || e));
    out.done = true;
  }
  return out;
}

/**
 * 메일 수집 실행 — INBOX 와 거래처 폴더들을 함께 돈다.
 *
 * ⚠️ 계정 연결은 **한 번만** 연다. 폴더마다 새로 붙으면 서버가 연달아 붙는 것을
 *    막아 뒤쪽 폴더가 통째로 실패한다 (실측: 이카운트에서 12개 폴더 'Command failed').
 */
/**
 * 광고·자동발송을 모아두는 폴더.
 *
 * 거래처 폴더가 아니라 "볼 것 없는 것" 을 치워두는 자리다.
 * 지우지 않으므로 언제든 열어볼 수 있고, 대신 [미분류] 에는
 * 사람이 판단해야 할 메일만 남는다.
 */
export const AD_FOLDER = '광고·자동발송';

export async function runIngest(opts: IngestOptions = {}): Promise<IngestResult> {
  const startedAt = new Date();
  await dbConnect();

  const settings = await getMailSettings();
  const limit = Number(opts.limit) || Number(settings.fetchLimit) || 50;
  const folders = opts.folders?.length ? opts.folders : foldersOf(settings);

  const result: IngestResult = {
    folders: [],
    fetched: 0, inserted: 0, duplicate: 0, ruleFiltered: 0, grouped: 0,
    matched: 0, movedToReplied: 0, replies: [],
    pendingAnalysis: 0,
    insertedMessageIds: [],
    errors: [],
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
  };

  // ── 수집 대상 계정 ──
  // 등록된 발송 계정(MailAccount)을 그대로 수신 계정으로 쓴다.
  // 이카운트는 SMTP/IMAP 자격증명이 같아서 비밀번호를 새로 받을 필요가 없다.
  const runAs = opts.user || 'system';
  const allAccounts = await listMailAccounts(runAs);
  let accounts: any[];
  if (opts.accountId === 'all') {
    accounts = allAccounts;
  } else {
    const one = await resolveAccount(opts.accountId, runAs);
    accounts = one ? [one] : [];
  }

  if (!accounts.length) {
    result.errors.push('등록된 메일 계정이 없습니다. [메일 계정] 에서 먼저 등록하세요.');
    result.finishedAt = new Date();
    return result;
  }

  // ── 거래처 학습 (무료) ──
  // 폴더를 돌기 전에 한 번만 만든다. 이미 폴더로 분류된 메일에서
  // "이 발신자는 이 거래처" 를 배워, INBOX 로 들어온 새 메일을 AI 없이 분류한다.
  // 거래처 학습은 계정마다 그 주인 범위로 한다 (learnForOwner)
  const learnCache = new Map<string, { learned: LearnedGroups | null; knownGroups: string[] }>();

  for (const account of accounts) {
    const accountId = String(account._id);
    const accountLabel = account.accountName || account.smtpUser;
    const { learned, knownGroups } = await learnForOwner(String(account.owner || ''), learnCache);

    // 수집 폴더는 **계정마다 다르다**. 대표 메일함은 거래처별로 폴더가 나뉘어 있고,
    // 그 폴더명이 곧 거래처(group) 이름이 된다.
    // 지정하지 않으면 INBOX 만 수집되어 거래처 폴더 메일을 통째로 놓친다.
    const accountFolders = opts.folders?.length
      ? opts.folders
      : [...new Set(['INBOX', ...(account.imapFolders || [])])].filter(Boolean);

    let base: ImapConfig;
    try {
      base = toImapConfig(account, 'INBOX');
    } catch (e: any) {
      result.errors.push(`[${accountLabel}] ${String(e?.message || e)}`);
      continue;
    }

    try {
      // ⚠️ 계정마다 연결을 **한 번만** 연다. 폴더마다 새로 붙으면 서버가 연달아 붙는 것을
      //    막아 뒤쪽 폴더가 통째로 실패한다 (실측: 이카운트에서 12개 폴더 'Command failed').
      await withOpenAccount(base, async (scoped) => {
        for (const folder of accountFolders) {
          try {
            const { stat, pendingIds, replies } = await ingestFolder(scoped, folder, {
              limit,
              recent: opts.recent,
              imapUser: account.smtpUser,
              settings,
              accountId,
              accountLabel,
              learned,
              knownGroups,
            });
            result.folders.push(stat);
            result.fetched += stat.fetched;
            result.inserted += stat.inserted;
            result.duplicate += stat.duplicate;
            result.ruleFiltered += stat.ruleFiltered;
            result.grouped += stat.grouped;
            result.matched += stat.matched;
            result.movedToReplied += stat.movedToReplied;
            result.replies.push(...replies);
            result.insertedMessageIds.push(...pendingIds);
          } catch (e: any) {
            // 폴더 하나가 실패해도 나머지는 계속 돈다 (없어진 폴더·권한 문제 등)
            result.errors.push(`[${accountLabel}/${folder}] ${String(e?.message || e)}`);
          }
        }

        // ── 보낸메일함 대조 ──
        // 이카운트 웹메일이나 휴대폰에서 직접 답한 건을 찾아 '회신 필요' 를 내린다.
        // 이게 없으면 이미 답한 메일이 계속 회신 필요로 남아 숫자가 실제와 어긋난다.
        try {
          const rec = await syncSentReplies(scoped, { accountId });
          result.reconciled = {
            scanned: (result.reconciled?.scanned || 0) + rec.scanned,
            matched: (result.reconciled?.matched || 0) + rec.matched,
            leadsCleared: (result.reconciled?.leadsCleared || 0) + rec.leadsCleared,
          };
        } catch (e: any) {
          // 대조 실패가 수집을 무효로 만들지는 않는다
          result.errors.push(`[${accountLabel}/보낸메일함] ${String(e?.message || e)}`);
        }
      });
    } catch (e: any) {
      // 계정 하나가 실패해도 다른 계정은 계속 수집한다
      result.errors.push(`[${accountLabel}] ${String(e?.message || e)}`);
    }
  }

  result.pendingAnalysis = result.insertedMessageIds.length;
  result.finishedAt = new Date();
  result.durationMs = result.finishedAt.getTime() - startedAt.getTime();

  // 마지막 수집 결과를 설정에 남긴다 — 화면에서 "언제 마지막으로 받았나" 확인용
  try {
    await MailSettings.updateOne(
      { _id: 'main' },
      {
        $set: {
          lastIngestAt: result.finishedAt,
          lastIngestError: result.errors.length ? result.errors.join(' / ').slice(0, 500) : '',
        },
      },
      { upsert: true },
    );
  } catch { /* 기록 실패가 수집을 무효로 만들지는 않는다 */ }

  return result;
}
