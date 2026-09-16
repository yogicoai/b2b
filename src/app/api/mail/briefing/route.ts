import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { buildBriefing, renderBriefingHtml } from '@/lib/mail/briefing';
import { getMailSettings } from '@/lib/mail-settings';
import { resolveAccount } from '@/lib/mail/accounts';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import { sendMail } from '@/lib/mailer';
import { decryptSecret } from '@/lib/crypto';

export const runtime = 'nodejs';
export const maxDuration = 120;

/*
 * 아이디별 메일 분리 (lib/mail/scope.ts).
 *
 * 화면의 브리핑은 로그인한 사람 것이어야 하므로 buildBriefing 에 mailFilter(scope) 를 넘겨
 * 모든 메일 조회를 자기 계정 범위로 센다. 크론(/api/cron/daily-mail)도 같은 함수에 마스터 범위를 넘긴다.
 * 예전에는 여기에 메일 조회를 복사해 두고 따로 셌는데, 한쪽만 고치면 화면과 메일 숫자가 어긋나서 한 곳으로 모았다.
 * 단계별 리드 수는 모두가 함께 보는 정보라 범위 없이 센다.
 */

/** GET /api/mail/briefing — 화면에서 보는 브리핑 (발송 없음) */
export async function GET(req: Request) {
  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    const days = Math.min(7, Math.max(1, parseInt(new URL(req.url).searchParams.get('days') || '1')));
    const briefing = await buildBriefing(days, mailFilter(scope));
    return NextResponse.json({ success: true, briefing });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/mail/briefing — 브리핑을 메일로 발송.
 *
 * 새 소식이 없는 날은 보내지 않는다 — 빈 메일이 매일 오면 열어보지 않게 된다.
 * Body: { days?: number, to?: string, force?: boolean }
 */
export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { /* 본문 없이도 동작 */ }

  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const settings = await getMailSettings();
    const days = Math.min(7, Math.max(1, Number(body?.days) || Number(settings.briefingDays) || 1));

    // 보내는 계정도 자기 계정 (기본 계정 → 첫 활성 계정)
    const account: any = await resolveAccount(undefined, scope.user);

    // 받는 주소: 설정의 브리핑 주소(briefingEmail)는 마스터(회사) 몫이다.
    // 일반 아이디의 브리핑을 거기로 보내면 그 사람 메일 요약이 대표 메일함으로 간다 —
    // 일반 아이디는 자기 계정 주소로 받는다.
    const fallbackTo = scope.isMaster
      ? settings.briefingEmail
      : (account?.fromAddress || account?.smtpUser);
    const to = String(body?.to || fallbackTo || '').trim();

    if (!to) {
      return NextResponse.json({
        success: false,
        error: '브리핑 받을 주소가 없습니다. 메일 수신 설정에서 지정하세요.',
      }, { status: 400 });
    }

    const briefing = await buildBriefing(days, mailFilter(scope));

    // 보낼 게 없으면 보내지 않는다 (force 로 강제 가능)
    const hasContent = briefing.needsReply.length || briefing.deadlinesSoon.length || briefing.newReplies.length;
    if (!hasContent && body?.force !== true) {
      return NextResponse.json({
        success: true, skipped: true,
        reason: '새 소식이 없어 발송하지 않았습니다.',
        briefing,
      });
    }

    if (!account) {
      return NextResponse.json({ success: false, error: '발송할 메일 계정이 없습니다.' }, { status: 400 });
    }

    const html = renderBriefingHtml(briefing, process.env.APP_BASE_URL || '');
    const dateLabel = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    const subject = `[Yogico] 오늘의 브리핑 ${dateLabel} · 회신필요 ${briefing.totals.needsReply}건`
      + (briefing.newReplies.length ? ` · 새 답장 ${briefing.newReplies.length}건` : '');

    const result = await sendMail({
      to,
      subject,
      html,
      smtpConfig: {
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure,
        user: account.smtpUser,
        pass: decryptSecret(account.smtpPassEnc),
      },
      fromOverride: { name: account.fromName || 'Yogico CRM', address: account.fromAddress || account.smtpUser },
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error || '발송 실패' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      to, subject,
      dryRun: Boolean(result.dryRun),
      counts: {
        needsReply: briefing.needsReply.length,
        deadlines: briefing.deadlinesSoon.length,
        newReplies: briefing.newReplies.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '브리핑 실패' }, { status: 500 });
  }
}
