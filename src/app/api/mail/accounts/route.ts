import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { listMailAccounts, summarize } from '@/lib/mail/accounts';
import { InboundMail } from '@/models/InboundMail';
import { mailboxIds, getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * GET /api/mail/accounts — 메일함에서 고를 수 있는 계정 목록.
 *
 * 등록된 발송 계정(MailAccount)이 곧 수신 계정이다 —
 * 이카운트는 SMTP/IMAP 자격증명이 같아서 따로 등록할 필요가 없다.
 * 각 계정에 몇 통이 수집돼 있는지도 함께 준다(화면에서 바로 보이게).
 */
export async function GET() {
  try {
    await dbConnect();
    // 내 아이디가 등록한 계정만 고를 수 있다(마스터는 마스터 아이디들 계정).
    // 로그인 확인 없이 전체를 내주면 남의 계정 주소·메일 수가 그대로 보인다.
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    const accounts = await listMailAccounts(scope.user);

    // 통수도 볼 수 있는 계정 메일만 센다
    const counts = await InboundMail.aggregate([
      { $match: { ...mailFilter(scope), trashedAt: null, direction: 'in' } },
      { $group: { _id: '$accountId', n: { $sum: 1 } } },
    ]);
    const countMap = new Map<string, number>(counts.map((c: any) => [String(c._id), c.n]));

    return NextResponse.json({
      success: true,
      accounts: accounts.map((a: any) => ({
        ...summarize(a),
        // 같은 메일함인 계정 id 에 모인 메일까지 합쳐 센다
        mailCount: mailboxIds(scope, String(a._id)).reduce((n, id) => n + (countMap.get(id) || 0), 0),
      })),
      // 계정 개념이 생기기 전 'main' 으로 저장된 메일 — 화면에서 안내가 필요하다
      // (마스터 몫이라 일반 아이디는 범위에 'main' 이 없어 항상 0)
      legacyCount: countMap.get('main') || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
