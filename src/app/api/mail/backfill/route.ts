import { NextResponse } from 'next/server';
import { runBackfill } from '@/lib/mail/ingest';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { KEEP_DAYS } from '@/lib/mail/retention';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/mail/backfill — [📥 전체 메일함 2달 가져오기]
 * Body: { accountId, days?: 60, cursor? }  — days 는 2달(KEEP_DAYS)을 넘길 수 없다 (runBackfill 이 자른다)
 *
 * 한 번에 다 못 가져오므로(서버 실행 시간 제한) 50초쯤 가져오고 cursor 를 돌려준다.
 * 화면은 done 이 올 때까지 cursor 를 넘겨 다시 부른다.
 * 자기가 등록한 계정만 가져올 수 있다 (resolveAccount 가 로그인한 사람 범위로 찾는다).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const accountId = String(body?.accountId || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(accountId)) {
    return NextResponse.json({ success: false, error: '가져올 메일 계정을 고르세요' }, { status: 400 });
  }
  try {
    const r = await runBackfill({
      accountId,
      user,
      days: Number(body?.days) || KEEP_DAYS,
      cursor: body?.cursor || null,
      budgetMs: 50_000,
    });
    if (!r.accountLabel) {
      return NextResponse.json({ success: false, error: r.errors[0] || '메일 계정을 찾을 수 없습니다' }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '가져오기 실패' }, { status: 500 });
  }
}
