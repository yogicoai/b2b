/**
 * 누가 어떤 메일을 볼 수 있는가 — 한 곳에서 정한다 (2026-09-14, 아이디별 메일 분리).
 *
 * ── 규칙 ──
 * 사람마다 로그인 아이디가 있고(대표님 david · 전무님 hoon …), 각자 [메일 계정 관리]에서
 * 자기 메일을 등록한다. 등록한 계정(MailAccount.owner)이 곧 그 사람의 메일함이다.
 *
 *   - 일반 아이디 : 자기가 등록한 계정의 메일만 본다 / 그 계정으로만 보낸다
 *   - 마스터(admin·yogico, lib/masters.ts) : 마스터 아이디들이 등록한 계정만 본다
 *     마스터끼리는 같은 회사 계정을 함께 쓴다(대표 계정 david@ 등). 다른 사람 아이디의 계정은
 *     마스터 화면에도 띄우지 않는다 — "대표 계정" 표시가 사람마다 하나씩 겹쳐 보여 헷갈렸다.
 *
 * 계정 개념이 생기기 전에 모은 메일(accountId 'main')은 마스터 몫이다.
 *
 * ⚠️ 메일을 읽거나 보내는 API 는 반드시 여기를 거친다. 한 군데라도 빠지면
 *    그 경로로 남의 메일이 보인다.
 */
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { MailAccount } from '@/models/MailAccount';
import { isMasterUser, masterIds } from '@/lib/masters';
import { isAllowedMailHost, mailboxKey } from '@/lib/mail/account-guard';

/** 로그인한 아이디 (쿠키 admin_session). 없거나 위조면 null */
export async function getSessionUser(): Promise<string | null> {
  // 서명 키가 없으면 누구든 쿠키를 만들어 마스터가 될 수 있다 — 아예 로그인 안 한 것으로 본다
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const c = await cookies();
    const token = c.get('admin_session')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const user = String((payload as any).user || '').trim();
    return user || null;
  } catch {
    return null;
  }
}

/** 이 아이디가 "자기 계정" 으로 보는 MailAccount 조건 */
export function ownerFilter(user: string): Record<string, any> {
  return isMasterUser(user) ? { owner: { $in: masterIds() } } : { owner: user };
}

export interface MailScope {
  user: string;
  isMaster: boolean;
  /** 볼 수 있는 계정 id (문자열). 마스터는 'main'(옛 메일) 포함 */
  accountIds: string[];
  /**
   * 계정 id → 같은 메일함인 계정 id 들 (자기 자신 포함).
   * 화면에서 메일함 하나를 고르면 이 묶음 전체의 메일을 보여준다 — 같은 주소의 메일이 다른 아이디의
   * 계정 id 로 먼저 모여 있어도(예: fe@ 856통) 내 계정을 고른 화면에 그대로 보이게.
   */
  mailboxGroups: Record<string, string[]>;
}

/**
 * 이 아이디가 볼 수 있는 계정 id 목록.
 *
 * 메일함은 **주소** 단위다. 같은 주소(fe@ 등)를 다른 아이디가 따로 등록해도 메일은 한 번만 모이고
 * (messageId 로 중복 제거) 먼저 모은 계정 id 에 붙는다. 그래서 "내 계정 id" 만 보면 같은 메일함인데
 * 한 통도 안 보일 수 있다 → 같은 메일함인 다른 계정 id 도 넣는다.
 * 단, **내 계정이 그 메일함에 실제로 로그인해 본(검증된) 것일 때만** 넓힌다 — 주소와 서버가 둘 다 같고,
 * 서버가 이카운트이고, 마지막 검증이 성공이어야 한다 (lib/mail/account-guard.ts).
 */
async function scopeForOwner(user: string): Promise<{ accountIds: string[]; mailboxGroups: Record<string, string[]> }> {
  const mine: any[] = await MailAccount.find(ownerFilter(user), { _id: 1, smtpUser: 1, smtpHost: 1, lastVerifiedAt: 1, lastVerifyError: 1 }).lean();
  const proven = new Set(
    mine
      .filter((a) => a.lastVerifiedAt && !a.lastVerifyError && isAllowedMailHost(a.smtpHost))
      .map((a) => mailboxKey(a)),
  );
  const ids = new Set<string>(mine.map((a) => String(a._id)));
  const byKey = new Map<string, Set<string>>();
  if (proven.size) {
    const all: any[] = await MailAccount.find({}, { _id: 1, smtpUser: 1, smtpHost: 1 }).lean();
    for (const a of all) {
      const k = mailboxKey(a);
      if (!proven.has(k)) continue;
      ids.add(String(a._id));
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k)!.add(String(a._id));
    }
  }
  const mailboxGroups: Record<string, string[]> = {};
  for (const a of mine) {
    const id = String(a._id);
    const group = byKey.get(mailboxKey(a));
    mailboxGroups[id] = group ? Array.from(new Set([id, ...Array.from(group)])) : [id];
  }
  // 같은 메일함의 다른 계정 id 로도 고를 수 있게 (관리자가 먼저 모은 계정 id 등)
  for (const group of Array.from(byKey.values())) {
    const arr = Array.from(group);
    for (const id of arr) if (!mailboxGroups[id]) mailboxGroups[id] = arr;
  }
  if (isMasterUser(user)) ids.add('main');
  return { accountIds: Array.from(ids), mailboxGroups };
}

export async function accountIdsForOwner(user: string): Promise<string[]> {
  return (await scopeForOwner(user)).accountIds;
}

/** 로그인 안 했으면 null — 호출하는 쪽에서 401 */
export async function getMailScope(): Promise<MailScope | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const s = await scopeForOwner(user);
  return { user, isMaster: isMasterUser(user), accountIds: s.accountIds, mailboxGroups: s.mailboxGroups };
}

/** 이 계정 id 와 같은 메일함인 계정 id 들 (범위 안의 것만 · 자기 자신 포함) */
export function mailboxIds(scope: MailScope, accountId: string): string[] {
  const ids = scope.mailboxGroups?.[String(accountId)] || [String(accountId)];
  return ids.filter((id) => scope.accountIds.includes(id));
}

/** InboundMail 조회에 붙이는 조건 — 볼 수 있는 계정의 메일만 */
export function mailFilter(scope: MailScope): Record<string, any> {
  return { accountId: { $in: scope.accountIds } };
}

/** 이 계정 id 를 쓸 수 있는가 */
export function canUseAccount(scope: MailScope, accountId?: string | null): boolean {
  return !!accountId && scope.accountIds.includes(String(accountId));
}

/**
 * 화면이 넘긴 accountId(없음·'all'·특정 id)를 범위 안으로 좁힌다.
 * 남의 계정 id 를 넘기면 denied — 호출하는 쪽에서 403/빈 결과로 처리.
 */
export function accountParamFilter(scope: MailScope, requested?: string | null): { filter: Record<string, any>; denied: boolean } {
  const id = String(requested || '').trim();
  if (!id || id === 'all' || id === 'default') return { filter: mailFilter(scope), denied: false };
  if (!canUseAccount(scope, id)) return { filter: { accountId: { $in: [] } }, denied: true };
  // 메일함 하나를 골라도 같은 주소의 다른 계정 id 에 모인 메일까지 함께 (예전: fe@ 856통 중 3통만 보였다)
  return { filter: { accountId: { $in: mailboxIds(scope, id) } }, denied: false };
}

export const UNAUTHORIZED = { success: false, error: '로그인이 필요합니다' };
export const NOT_YOURS = { success: false, error: '이 메일(계정)에 접근할 수 없습니다' };
