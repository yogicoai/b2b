import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { runIngest } from '@/lib/mail/ingest';
import { MailSyncState } from '@/models/MailSyncState';
import { listMailAccounts } from '@/lib/mail/accounts';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * POST /api/mail/sync-on-login — 화면을 열 때 받은 메일을 한 번 당겨온다.
 *
 * 왜 필요한가:
 * 수신 수집은 크론이 도는데, Vercel Hobby 는 크론이 **하루 1회**다.
 * 그래서 아침 07:30 이후에 온 답장은 다음 날까지 화면에 안 나타났다.
 * 실제로 테스트 답장이 들어왔는데 리드가 계속 [발송 완료]에 머물러 있었고,
 * 손으로 [📥 메일 가져오기]를 눌러야만 [답장 받음]으로 넘어갔다.
 * 쓰는 사람이 그 버튼의 존재와 필요성을 알고 있어야 하는 구조는 좋지 않다.
 *
 * 그래서 로그인해서 화면을 열 때 한 번 당겨온다. 아침에 앱을 열면
 * 밤사이 온 답장이 이미 들어와 있게 된다.
 *
 * ── 너무 자주 돌지 않게 ──
 * 화면을 새로고침할 때마다 IMAP 에 붙으면 메일 서버에 부담이고 느리다.
 * 마지막 수집으로부터 COOLDOWN_MIN 분이 안 지났으면 아무것도 하지 않는다.
 * 그 판단은 새 저장소를 만들지 않고 MailSyncState 의 lastSyncAt 으로 한다 —
 * 어차피 수집이 갱신하는 값이라 따로 관리할 것이 없다.
 */

/** 이 시간 안에 이미 수집했으면 건너뛴다 (분) */
const COOLDOWN_MIN = Number(process.env.LOGIN_SYNC_COOLDOWN_MIN) || 10;

/** 로그인 수집은 가볍게 — 밀린 것은 크론이나 [메일 가져오기]가 마저 가져온다 */
const LOGIN_FETCH_LIMIT = 30;

export async function POST(req: Request) {
  // 로그인한 사람의 계정만 당겨온다 (lib/mail/scope.ts)
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  try {
    await dbConnect();

    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch { /* 본문 없이도 동작 */ }

    // 자기 계정이 없으면 할 일이 없다 (설정 전 상태).
    // 남의 계정 수로 판단하면 계정 없는 사람도 수집을 돌리게 된다.
    const myAccounts = await listMailAccounts(user);
    if (!myAccounts.length) {
      return NextResponse.json({ success: true, skipped: 'no-account', ran: false });
    }

    // 쿨다운도 자기 계정 기준 — 다른 사람이 방금 수집했다고 내 메일함을 건너뛰면 안 된다
    const myAccountIds = myAccounts.map((a: any) => String(a._id));
    const latest = await MailSyncState.findOne({ accountId: { $in: myAccountIds }, lastSyncAt: { $ne: null } })
      .sort({ lastSyncAt: -1 })
      .select('lastSyncAt')
      .lean<any>();

    const lastAt = latest?.lastSyncAt ? new Date(latest.lastSyncAt) : null;
    const minsAgo = lastAt ? (Date.now() - lastAt.getTime()) / 60000 : Infinity;

    if (!force && minsAgo < COOLDOWN_MIN) {
      return NextResponse.json({
        success: true,
        ran: false,
        skipped: 'cooldown',
        lastSyncAt: lastAt,
        minutesAgo: Math.round(minsAgo),
        cooldownMin: COOLDOWN_MIN,
      });
    }

    // 'all' 이어도 user 범위 안의 계정 전부다 — 로그인한 사람 몫만 돈다
    const r = await runIngest({ accountId: 'all', limit: LOGIN_FETCH_LIMIT, user });

    return NextResponse.json({
      success: true,
      ran: true,
      fetched: r.fetched,
      inserted: r.inserted,
      matched: r.matched,
      movedToReplied: r.movedToReplied,
      errors: r.errors,
      durationMs: r.durationMs,
    });
  } catch (e: any) {
    // 실패해도 화면은 그대로 떠야 한다 — 수집은 거들 뿐이다
    return NextResponse.json(
      { success: false, ran: false, error: e?.message || '수집 실패' },
      { status: 500 },
    );
  }
}
