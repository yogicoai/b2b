/**
 * 거래처 그룹 — 메일함의 '내 메일함' 하위 폴더가 곧 거래처 분류다.
 *
 *   INBOX.Dangaard Beauty            → "Dangaard Beauty"
 *   INBOX.Distribution Group Turkey  → "Distribution Group Turkey"
 *
 * 대표가 손으로 분류해 둔 이 폴더들이 **학습 데이터**가 된다.
 * "이 발신자의 메일은 이 폴더에 넣었다" 를 배우면, 새로 온 메일은
 * AI 없이(=무료로) 정확히 같은 폴더로 분류할 수 있다.
 *
 * (emailData/src/lib/mail/groups.js 이식)
 */
import { InboundMail } from '@/models/InboundMail';
import { MailAccount } from '@/models/MailAccount';
import { countSince } from './period';

/** IMAP 폴더 경로 → 화면에 보여줄 그룹명 */
export function groupNameFromFolder(folder = ''): string {
  return String(folder).replace(/^INBOX[./]/i, '').trim() || folder;
}

/** 회사를 특정할 수 없는 개인 메일 도메인 — 도메인 기반 추론에서 제외 */
export const FREE_MAIL = new Set([
  'gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'nate.com',
  'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'me.com',
  'qq.com', '163.com', '126.com', 'yandex.com', 'proton.me', 'protonmail.com',
]);

/** 수집 대상이지만 거래처 그룹이 아닌 폴더 (미분류 원본함) */
const NON_GROUP = /^(INBOX|Sent|Drafts|Junk|Trash)$/i;
export const isGroupFolder = (folder: string): boolean =>
  Boolean(folder) && !NON_GROUP.test(folder);

export interface LearnedGroups {
  addrMap: Map<string, { group: string; n: number; last: any }>;
  domainMap: Map<string, { group: string; n: number; last: any }>;
  ownDomains: Set<string>;
  size: number;
}

/**
 * 자사 도메인 — 도메인 기반 추론에서 제외한다.
 *
 * 사업개발 폴더의 대부분이 자사 주소라 "yogico.kr = 사업개발"로 학습되고,
 * 그 결과 사내 보고 메일까지 사업개발로 끌려온다(emailData 실측).
 * 우리 도메인은 거래처를 특정하지 못하므로 개인 메일 도메인과 같이 취급한다.
 * 담당자 개인은 주소 정확 일치로 계속 잡히므로 영향이 없다.
 */
async function ownDomains(): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const accounts: any[] = await MailAccount.find({}, { smtpUser: 1, fromAddress: 1 }).lean();
    for (const a of accounts) {
      for (const u of [a.smtpUser, a.fromAddress]) {
        const d = String(u || '').toLowerCase().split('@')[1];
        if (d) out.add(d);
      }
    }
  } catch { /* 계정을 못 읽어도 학습은 된다 */ }
  return out;
}

/** MailAccount._id 로 캐스팅 가능한 값인가 — 'main'(옛 메일) 같은 값으로 find 하면 CastError */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * 이미 수집된 메일에서 "발신자 → 그룹" 이력을 만든다.
 * 주소가 정확히 일치하는 쪽을 우선하고, 없으면 도메인으로 본다.
 *
 * accountIds — 볼 수 있는 계정 id (lib/mail/scope.ts MailScope.accountIds).
 * 넘기면 그 계정 메일에서만 배운다(아이디별 메일 분리). 남의 메일에서 배우면
 * 그 사람의 폴더 이름·거래처 발신자가 내 메일함 추천으로 새어 나온다.
 * 안 넘기면 예전처럼 전체에서 배운다 — 사람이 없는 실행(수집 크론) 전용.
 */
export async function learnSenderGroups(accountIds?: string[] | null): Promise<LearnedGroups> {
  const own = await ownDomains();

  const match: any = { group: { $nin: [null, ''] }, 'from.address': { $nin: [null, ''] } };
  if (accountIds) match.accountId = { $in: accountIds };

  const rows: any[] = await InboundMail.aggregate([
    { $match: match },
    {
      $group: {
        _id: { addr: '$from.address', group: '$group' },
        n: { $sum: 1 },
        last: { $max: '$date' },
      },
    },
  ]);

  const byAddress = new Map<string, any[]>();
  const byDomain = new Map<string, any[]>();

  for (const r of rows) {
    const { addr, group } = r._id;
    if (!addr || !group) continue;
    const domain = String(addr).split('@')[1] || '';

    const push = (map: Map<string, any[]>, key: string) => {
      if (!key) return;
      const list = map.get(key) || [];
      list.push({ group, n: r.n, last: r.last });
      map.set(key, list);
    };
    push(byAddress, addr);
    // 개인 메일 도메인은 아예 이력에 담지 않는다.
    // 거래처 담당자가 gmail 을 쓰는 경우가 있어(이스라엘 거래처 등),
    // 담으면 "gmail 에서 온 모든 메일" 이 그 거래처로 몰리는 사고가 난다.
    // 그 담당자 개인은 주소 정확 일치(byAddress)로 계속 잡힌다.
    if (!FREE_MAIL.has(domain) && !own.has(domain)) push(byDomain, domain);
  }

  // 후보가 여럿이면 건수 → 최근순으로 하나만 남긴다
  const pick = (list: any[]) =>
    list.sort((a, b) => b.n - a.n || new Date(b.last).getTime() - new Date(a.last).getTime())[0];

  const addrMap = new Map([...byAddress].map(([k, v]) => [k, pick(v)]));
  const domainMap = new Map([...byDomain].map(([k, v]) => [k, pick(v)]));

  return { addrMap, domainMap, ownDomains: own, size: addrMap.size };
}

/**
 * 발신자 이력으로 그룹을 추천한다 — API 호출 없음(무료).
 */
export function suggestGroupBySender(
  mail: { from?: { address?: string } },
  learned: LearnedGroups | null,
): { group: string; by: 'address' | 'domain'; count: number } | null {
  const addr = (mail?.from?.address || '').toLowerCase();
  if (!addr || !learned) return null;

  const exact = learned.addrMap.get(addr);
  if (exact) return { group: exact.group, by: 'address', count: exact.n };

  const domain = addr.split('@')[1] || '';
  if (!domain || FREE_MAIL.has(domain)) return null;
  if (learned.ownDomains?.has(domain)) return null;

  const byDomain = learned.domainMap.get(domain);
  if (byDomain) return { group: byDomain.group, by: 'domain', count: byDomain.n };

  return null;
}

/* ────────────────────────────────────────────────────────────
   그룹명 텍스트 매칭 — 발신자 이력이 없을 때의 2차 단서.
   실제 메일 제목에 거래처명이 그대로 들어오는 경우가 많다.
     "RE: 터키 Distribution Group 샘플"  → Distribution Group Turkey
     "[오스템파마] 유럽향 라벨링 이슈"     → Osstem Pharma Vussen
   ──────────────────────────────────────────────────────────── */

/** 어느 거래처에나 나올 수 있어 단독으로는 근거가 못 되는 낱말 */
const GENERIC = new Set([
  'group', 'trade', 'vendors', 'vendor', 'beauty', 'pharma', 'inc', 'ltd', 'co',
  'corp', 'company', 'global', 'international', 'trading', 'distribution',
  'usa', 'israel', 'japan', 'romania', 'turkey', 'korea', 'europe', 'cosmetics',
  '사업개발', '영업', '해외', '거래처',
]);

/** 한국어 표기가 다른 거래처를 위한 별칭 */
const ALIASES: Record<string, string[]> = {
  'Osstem Pharma Vussen': ['오스템', '오스템파마', 'vussen'],
  'Distribution Group Turkey': ['터키'],
  'My K Romania': ['my-k', 'myk', '루마니아'],
  'Blue Marble Israel': ['blue marble'],
  'Beauty Lyrics USA': ['beauty lyrics'],
  'Dangaard Beauty': ['dangaard'],
  'Schestowitz Israel': ['schestowitz'],
  'Orchesta Israel': ['orchesta'],
  'Trade Vendors': ['trade vendors'],
};

/** 그룹명에서 검색에 쓸 만한 낱말만 뽑는다 */
function tokensFor(group: string): string[] {
  const extra = ALIASES[group] || [];
  const words = String(group)
    .split(/[\s._-]+/)
    .map((w) => w.toLowerCase().trim())
    .filter((w) => w.length >= 3 && !GENERIC.has(w));

  // 두 낱말 조합도 후보로 (예: "blue marble")
  const parts = String(group).toLowerCase().split(/[\s._-]+/);
  const pairs: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const pair = `${parts[i]} ${parts[i + 1]}`;
    if (pair.length >= 7) pairs.push(pair);
  }

  return [...new Set([...extra.map((x) => x.toLowerCase()), ...pairs, ...words])];
}

/**
 * 제목에서 거래처명을 찾는다 — API 호출 없음(무료).
 *
 * ⚠️ **제목만 본다.** 본문까지 뒤지면 인용된 이전 대화나 서명에 등장한 다른
 *    거래처명이 걸려 무관한 메일이 엉뚱한 거래처로 분류된다(emailData 실측).
 *    실무 메일은 제목에 거래처를 적어 두는 경우가 많아 제목만으로 충분하다.
 */
export function suggestGroupByName(
  mail: { subject?: string },
  groups: string[] = [],
): { group: string; by: 'name'; matched: string } | null {
  const hay = String(mail?.subject || '').toLowerCase();
  if (!hay.trim()) return null;

  let best: { group: string; by: 'name'; matched: string } | null = null;
  for (const group of groups) {
    for (const t of tokensFor(group)) {
      if (!hay.includes(t)) continue;
      if (!best || t.length > best.matched.length) best = { group, by: 'name', matched: t };
    }
  }
  return best;
}

/** 화면 숫자의 기준 기간 — 모든 카운트가 같은 기준을 써야 한다 (period.ts) */
const FRESH_SINCE = () => countSince();

async function getFolderOrder(accountId?: string, accountIds?: string[] | null): Promise<{
  merged: Map<string, number>;
  byAccount: Map<string, Map<string, number>>;
}> {
  const query: any = {};
  if (accountIds) {
    // 볼 수 있는 계정의 폴더만 순서에 넣는다 — 남의 계정 폴더 이름이 거래처 목록에 끼면
    // 그 사람 메일함 구성이 그대로 보인다. 범위 밖 accountId 를 고르면 폴더 없음.
    const wanted = accountId && accountId !== 'all' ? [accountId] : accountIds;
    query._id = { $in: wanted.filter((id) => accountIds.includes(id) && OBJECT_ID.test(id)) };
  } else if (accountId && accountId !== 'all') {
    query._id = accountId;
  }

  const accounts: any[] = await MailAccount.find(query, {
    imapFolders: 1,
    isDefault: 1,
    updatedAt: 1,
  }).lean();

  accounts.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
  });

  const merged = new Map<string, number>();
  const byAccount = new Map<string, Map<string, number>>();

  for (const account of accounts) {
    const accountKey = String(account._id);
    const accountOrder = new Map<string, number>();

    for (const folder of account.imapFolders || []) {
      const group = groupNameFromFolder(folder);
      if (!group || group === folder) continue;
      if (!accountOrder.has(group)) accountOrder.set(group, accountOrder.size);
      if (!merged.has(group)) merged.set(group, merged.size);
    }

    byAccount.set(accountKey, accountOrder);
  }

  return { merged, byAccount };
}

function sortByFolderOrder(folderOrder?: Map<string, number>) {
  return (a: GroupRow, b: GroupRow) => {
    const aIndex = folderOrder?.get(a.group);
    const bIndex = folderOrder?.get(b.group);
    const aKnown = typeof aIndex === 'number';
    const bKnown = typeof bIndex === 'number';

    if (aKnown && bKnown) return aIndex - bIndex;
    if (aKnown) return -1;
    if (bKnown) return 1;
    return b.count - a.count || b.total - a.total || a.group.localeCompare(b.group);
  };
}

const SPECIAL_VISIBLE_GROUPS = new Set(['\uAD11\uACE0\u00B7\uC790\uB3D9\uBC1C\uC1A1']);

export interface GroupRow {
  group: string;
  count: number;   // 최근 한 달 통수
  total: number;   // 누적
  fresh: number;   // 최근 한 달 중 아직 손대지 않은 것
  last: any;
}

/**
 * 현재 존재하는 거래처 목록.
 *
 * 화면 숫자는 **최근 한 달** 기준이다. 누적을 쓰면 577 같은 큰 수가 떠서
 * 옆의 미확인 숫자와 기준이 어긋나고, 눌렀을 때 나오는 목록과도 맞지 않는다.
 *
 * accountIds — 볼 수 있는 계정 id (lib/mail/scope.ts). 넘기면 그 계정 메일만 세고
 * 그 계정 폴더만 보여준다. 안 넘기면 전체(수집 크론처럼 사람이 없는 실행 전용).
 */
export async function listGroups(
  accountId?: string,
  accountIds?: string[] | null,
): Promise<{ groups: GroupRow[]; byAccount: Record<string, GroupRow[]> }> {
  const match: any = { group: { $nin: [null, ''] } };
  if (accountIds) {
    // 범위 밖 계정을 고르면 빈 목록 — 남의 계정 숫자를 id 만으로 알아낼 수 없게
    match.accountId = accountId && accountId !== 'all'
      ? { $in: accountIds.includes(accountId) ? [accountId] : [] }
      : { $in: accountIds };
  } else if (accountId && accountId !== 'all') {
    match.accountId = accountId;
  }
  const folderOrder = await getFolderOrder(accountId, accountIds);

  const rows: any[] = await InboundMail.aggregate([
    { $match: match },
    {
      $group: {
        _id: { group: '$group', accountId: { $ifNull: ['$accountId', 'main'] } },
        n: { $sum: { $cond: [{ $gte: ['$date', FRESH_SINCE()] }, 1, 0] } },
        total: { $sum: 1 },
        last: { $max: '$date' },
        // 최근 한 달 중 아직 손대지 않은 '받은' 메일 수.
        // 기간을 두지 않으면 1년치가 전부 미확인으로 잡혀 "밀린 일이 산더미"로
        // 읽히고, 매일 늘어나는 몇 건이 그 안에 묻힌다.
        fresh: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'new'] },
                  { $ne: ['$direction', 'out'] },
                  { $gte: ['$date', FRESH_SINCE()] },
                  { $not: [{ $in: ['$classification', ['ad', 'system']] }] },
                ],
              },
              1, 0,
            ],
          },
        },
      },
    },
    { $sort: { n: -1 } },
  ]);

  const isVisibleFolderGroup = (group: string, order?: Map<string, number>) =>
    Boolean(order?.has(group) || SPECIAL_VISIBLE_GROUPS.has(group));

  const merged = new Map<string, GroupRow>();
  for (const r of rows) {
    if (!isVisibleFolderGroup(r._id.group, folderOrder.merged)) continue;
    const g = merged.get(r._id.group)
      || { group: r._id.group, count: 0, total: 0, fresh: 0, last: null };
    g.count += r.n; g.total += r.total; g.fresh += r.fresh;
    if (!g.last || r.last > g.last) g.last = r.last;
    merged.set(r._id.group, g);
  }

  const byAccount = new Map<string, GroupRow[]>();
  for (const r of rows) {
    const accountOrder = folderOrder.byAccount.get(r._id.accountId) || folderOrder.merged;
    if (!isVisibleFolderGroup(r._id.group, accountOrder)) continue;
    const list = byAccount.get(r._id.accountId) || [];
    list.push({ group: r._id.group, count: r.n, total: r.total, fresh: r.fresh, last: r.last });
    byAccount.set(r._id.accountId, list);
  }

  for (const [group] of folderOrder.merged) {
    if (!merged.has(group)) {
      merged.set(group, { group, count: 0, total: 0, fresh: 0, last: null });
    }
  }

  for (const [id, accountOrder] of folderOrder.byAccount) {
    const list = byAccount.get(id) || [];
    const seen = new Set(list.map((row) => row.group));

    for (const [group] of accountOrder) {
      if (!seen.has(group)) {
        list.push({ group, count: 0, total: 0, fresh: 0, last: null });
      }
    }

    byAccount.set(id, list);
  }

  return {
    groups: [...merged.values()].sort(sortByFolderOrder(folderOrder.merged)),
    byAccount: Object.fromEntries([...byAccount].map(([id, list]) => [
      id,
      list.sort(sortByFolderOrder(folderOrder.byAccount.get(id) || folderOrder.merged)),
    ])),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   나머지 자동 배치 — "미분류 0건" 을 만드는 마지막 단계.

   폴더 학습(suggestGroupBySender)과 제목 매칭(suggestGroupByName)은
   **이미 본 적 있는 거래처**만 잡는다. 처음 보는 발신자는 참고할 이력이
   없어 그대로 남는다. 실측으로 미분류 44통 중 38통이 그런 경우였다.

   그 38통을 뜯어보니 성격이 셋으로 갈렸다.
     · 자사 발신 17통 — 내부 시스템 리포트·브리핑 (거래처가 아니다)
     · 광고·자동발송 20통 — 링크드인 알림, 전시회 홍보, 인증번호
     ·  실제 거래처  7통 — Besko, Toun28, Arencia, F&F, 무신사 …

   그래서 이 순서로 배치한다. 위에서 걸리면 아래는 보지 않는다.
   ═══════════════════════════════════════════════════════════════════ */

/** 거래처가 아닌 것들을 모아두는 폴더 이름 (화면에서 구분되게 접두사를 붙인다) */
export const GROUP_INTERNAL = '· 사내';
export const GROUP_NOISE    = '· 광고·자동발송';
export const GROUP_MISC     = '· 기타';

/**
 * 발신 도메인으로 폴더를 새로 만들 최소 통수.
 *
 * 처음엔 도메인마다 폴더를 만들었더니 1통짜리 폴더가 7개 생겼다.
 * 대표가 손으로 나눠둔 폴더는 13~33통인데, 그 목록에 1통짜리가 끼면
 * 진짜 거래처를 찾기가 더 어려워진다.
 * 한 번 주고받고 만 곳은 폴더가 아니라 '· 기타' 로 모은다.
 */
export const MIN_MAILS_FOR_OWN_FOLDER = 5;

/**
 * 도메인에서 회사 폴더명을 만든다.
 *   besko.kr        → Besko
 *   arencia.com     → Arencia
 *   event.gitex.com → Gitex   (서브도메인은 버린다)
 */
export function groupNameFromDomain(domain: string): string {
  const parts = String(domain || '').toLowerCase().split('.').filter(Boolean);
  if (!parts.length) return '';
  // co.kr / com.au 같은 2단계 도메인을 감안해 뒤에서 찾는다.
  // 지역명 SLD 도 같이 넣는다 — amc.seoul.kr 이 "Seoul"(서울아산병원인데!) 로
  // 잡히던 문제가 여기서 나왔다. 실제 회사를 가리키는 조각은 그 왼쪽이다.
  const SECOND = new Set([
    'co', 'com', 'net', 'org', 'or', 'go', 'ac', 'gov', 'edu', 'ne', 'pe', 're', 'sc', 'hs', 'ms', 'es',
    'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
    'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam',
    'gyeongbuk', 'gyeongnam', 'jeju',
  ]);
  let i = parts.length - 2;
  if (i > 0 && SECOND.has(parts[i])) i -= 1;
  const core = parts[Math.max(0, i)] || parts[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}

export interface AutoAssignResult {
  group: string;
  by: 'own-domain' | 'noise' | 'sender-domain';
}

/**
 * 학습으로도 안 잡힌 메일 한 통을 어디에 둘지 정한다.
 * 어디에도 못 넣을 경우에만 null 을 돌려준다.
 */
export function autoAssignGroup(
  mail: { from?: { address?: string; name?: string }; classification?: string },
  ownDomainSet: Set<string>,
  /** 발신 도메인별 누적 통수 — 폴더를 팔 만큼 오간 곳인지 판단한다 */
  domainCounts?: Map<string, number>,
): AutoAssignResult | null {
  const addr = String(mail?.from?.address || '').toLowerCase();
  const domain = addr.split('@')[1] || '';
  if (!domain) return null;

  // 1. 우리가 보낸 것 — 내부 리포트·브리핑. 거래처로 두면 폴더가 오염된다.
  if (ownDomainSet.has(domain)) return { group: GROUP_INTERNAL, by: 'own-domain' };

  // 2. 광고·자동발송 — 사람이 읽고 답할 것이 아니다. 한 곳에 몰아둔다.
  if (['ad', 'system', 'newsletter'].includes(String(mail?.classification || ''))) {
    return { group: GROUP_NOISE, by: 'noise' };
  }

  // 3. 실제 거래처로 보이는 것 — 발신 도메인으로 폴더를 만든다.
  //    개인 메일 도메인(gmail 등)은 회사를 특정하지 못하므로 잡음으로 보낸다.
  if (FREE_MAIL.has(domain)) return { group: GROUP_NOISE, by: 'noise' };

  // 한두 번 오간 곳에까지 폴더를 파면 거래처 목록이 1통짜리로 뒤덮인다.
  // 충분히 오간 곳만 자기 폴더를 갖고, 나머지는 '· 기타' 로 모은다.
  const seen = domainCounts?.get(domain) ?? 0;
  if (seen < MIN_MAILS_FOR_OWN_FOLDER) return { group: GROUP_MISC, by: 'sender-domain' };

  const name = groupNameFromDomain(domain);
  return name ? { group: name, by: 'sender-domain' } : null;
}

/**
 * 등록된 발송 계정에 안 잡히는 자사·계열 도메인.
 *
 * getOwnDomains 는 MailAccount 에 등록된 주소의 도메인만 본다. 그런데 사내 메일이
 * 그 주소로만 오는 게 아니다 — yogibo.inc 로 오간 47통이 "Yogibo" 라는 거래처
 * 폴더로 잡혔다. 계열 도메인은 계정 등록 여부와 무관하므로 여기 적어 둔다.
 *
 * 환경변수 OWN_MAIL_DOMAINS 로 덧붙일 수 있다 (쉼표 구분).
 */
const EXTRA_OWN_DOMAINS = ['yogibo.inc', 'yogico.kr', 'yogibo.co.kr'];

/** 자사 도메인 집합 — 라우트에서 재사용할 수 있게 노출한다 */
export async function getOwnDomains(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const d of EXTRA_OWN_DOMAINS) out.add(d);
  for (const d of String(process.env.OWN_MAIL_DOMAINS || '').split(',')) {
    const t = d.trim().toLowerCase();
    if (t) out.add(t);
  }
  try {
    const accounts: any[] = await MailAccount.find({}, { smtpUser: 1, fromAddress: 1 }).lean();
    for (const a of accounts) {
      for (const u of [a.smtpUser, a.fromAddress]) {
        const d = String(u || '').toLowerCase().split('@')[1];
        if (d) out.add(d);
      }
    }
  } catch { /* 계정을 못 읽어도 나머지 규칙은 돈다 */ }
  return out;
}
