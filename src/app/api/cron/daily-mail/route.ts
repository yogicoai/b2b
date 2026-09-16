import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { runIngest } from '@/lib/mail/ingest';
import { applyMailRetention } from '@/lib/mail/retention';
import { syncAllOutboxCopies } from '@/lib/mail/sent-copy';
import { createDueFollowUps } from '@/lib/mail/follow-up';
import { buildBriefing, renderBriefingHtml } from '@/lib/mail/briefing';
import { getMailSettings } from '@/lib/mail-settings';
import { MailAccount } from '@/models/MailAccount';
import { sendMail } from '@/lib/mailer';
import { decryptSecret } from '@/lib/crypto';
import { masterIds } from '@/lib/masters';
import { accountIdsForOwner } from '@/lib/mail/scope';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 크론 브리핑이 셀 메일 범위 — 마스터 몫만 (아이디별 메일 분리, lib/mail/scope.ts).
 *
 * 브리핑은 설정의 briefingEmail(대표 메일)로 간다. 범위 없이 세면 다른 아이디가 등록한
 * 메일함의 제목·요약까지 대표 메일로 나간다. 크론에는 로그인한 사람이 없으므로 마스터 범위를 직접 만든다:
 *   · 마스터 아이디가 등록한 계정
 *   · 같은 메일함(주소+서버가 같은) 을 다른 아이디가 먼저 등록한 계정 — 메일은 먼저 모은 계정 id 에 붙는다
 *   · 'main' — 계정 개념 전에 모은 옛 메일 (마스터 몫)
 */
async function masterMailMatch(): Promise<Record<string, any>> {
  // 관리자가 화면에서 보는 범위와 **똑같이** — lib/mail/scope.ts accountIdsForOwner.
  // (같은 메일함인 다른 계정은 관리자 계정이 그 메일함에 로그인 검증된 경우에만 넣는다. 손으로 따로 만들면 기준이 어긋난다)
  return { accountId: { $in: await accountIdsForOwner(masterIds()[0]) } };
}

/**
 * GET /api/cron/daily-mail — 매일 1회 도는 메일 파이프라인.
 *
 *   1. 수집    등록된 모든 계정 · 지정 폴더               무료
 *   2. 분류    광고·자동발송 규칙 필터                    무료
 *   3. 거래처  폴더 → 발신자 이력 → 제목                  무료
 *   4. 매칭    답장을 리드에 연결 · stage 자동 이동        무료
 *   4.5 재발송 답 없는 곳에 다음 메일 예약 (최대 3회)      무료
 *   5. 브리핑  회신 필요·기한을 대표 메일로               무료
 *
 * AI 분석(유료)은 여기서 돌리지 않는다 — 크론이 매일 자동 과금하면
 * 비용을 통제할 수 없다. 화면에서 금액을 보고 눌러야 나간다.
 *
 * ⚠️ 수집이 실패해도 브리핑은 계속한다 — 메일 서버가 잠깐 죽었다고
 *    이미 받아둔 건의 브리핑까지 걸러지면 안 된다 (emailData 설계).
 *
 * /api/cron 은 proxy.ts 인증 화이트리스트라 CRON_SECRET 으로 직접 막는다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  const report: any = { startedAt: new Date().toISOString(), steps: {} };

  await dbConnect();

  // ── 1~4. 수집 (실패해도 브리핑은 계속) ──
  try {
    const r = await runIngest({ accountId: 'all' });
    report.steps.ingest = {
      fetched: r.fetched, inserted: r.inserted, duplicate: r.duplicate,
      ruleFiltered: r.ruleFiltered, grouped: r.grouped,
      matched: r.matched, movedToReplied: r.movedToReplied,
      errors: r.errors,
    };
  } catch (e: any) {
    report.steps.ingest = { error: String(e?.message || e) };
  }

  // ── 4.1 오래된 메일 본문 비우기 (저장 공간 자동 관리) ──
  // 원문은 이카운트 서버에 그대로 있다. DB 에 또 쌓아 두면 무료 용량(512MB)이 차서
  // 쓰기가 막히고 메일 발송까지 멈춘다 — 실제로 그렇게 됐다 (2026-09-15).
  // 최근 것만 DB 에 두고 오래된 것은 열 때 서버에서 받아 온다 (lib/mail/retention.ts · lib/mail/body.ts).
  try {
    const t = await applyMailRetention();
    report.steps.retention = {
      keepBodyDays: t.keepBodyDays,
      cleared: t.cleared,
      freedMB: Math.round((t.freedBytes / 1048576) * 10) / 10,
      ...(t.error ? { error: t.error } : {}),
    };
  } catch (e: any) {
    report.steps.retention = { error: String(e?.message || e) };
  }

  // ── 4.2 보낸메일함 메우기 ──
  // 아웃룩이 서버에 사본을 안 남기면 보낸메일함이 비어 "보냈는지 알 수 없다" 가 된다.
  // 받은편지함에 사본이 있는 것만이라도 보낸메일함에 넣어 준다 (lib/mail/sent-copy.ts).
  try {
    const synced = await syncAllOutboxCopies(7);
    report.steps.outboxSync = synced
      .filter((s) => s.checked || s.appended || s.errors.length)
      .map((s) => ({ account: s.account, appended: s.appended, checked: s.checked, ...(s.errors.length ? { errors: s.errors.slice(0, 3) } : {}) }));
  } catch (e: any) {
    report.steps.outboxSync = { error: String(e?.message || e) };
  }

  // ── 4.5 자동 재발송 예약 만들기 ──
  //
  // 반드시 수집(4)이 끝난 뒤에 돌린다. 오늘 새로 온 답장이 먼저 반영돼야
  // 이미 답한 곳에 팔로우업이 잡히지 않는다. 순서가 바뀌면 대화가 시작된
  // 상대에게 광고 메일이 한 번 더 나간다.
  try {
    const f = await createDueFollowUps();
    report.steps.followUp = { created: f.created, checked: f.checked };
  } catch (e: any) {
    report.steps.followUp = { error: String(e?.message || e) };
  }

  // ── 5. 브리핑 ──
  try {
    const settings = await getMailSettings();
    const days = Number(settings.briefingDays) || 1;
    // 대표 메일로 가는 브리핑이므로 마스터 몫의 메일만 담는다
    const briefing = await buildBriefing(days, await masterMailMatch());
    const to = String(settings.briefingEmail || '').trim();

    const hasContent = briefing.needsReply.length || briefing.deadlinesSoon.length || briefing.newReplies.length;

    if (!to) {
      report.steps.briefing = { skipped: '받을 주소 미설정', counts: briefing.totals };
    } else if (!hasContent) {
      // 새 소식이 없는 날은 보내지 않는다 — 빈 메일이 매일 오면 열어보지 않게 된다
      report.steps.briefing = { skipped: '새 소식 없음', counts: briefing.totals };
    } else {
      // 보내는 계정도 마스터 계정 중에서 고른다. 전체에서 기본 계정을 찾으면
      // 다른 아이디가 기본으로 지정한 계정(그 사람 비밀번호)으로 대표 브리핑이 나갈 수 있다
      const account: any = await MailAccount.findOne({ owner: { $in: masterIds() }, isDefault: true, isActive: { $ne: false } }).lean()
        || await MailAccount.findOne({ owner: { $in: masterIds() }, isActive: { $ne: false } }).lean();
      if (!account) {
        report.steps.briefing = { error: '발송 계정 없음 (마스터 아이디로 등록한 활성 메일 계정이 없습니다)' };
      } else {
        const dateLabel = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
        // 브리핑은 우리 주소로 가는 내부 메일이라 아웃바운드 잠금 대상이 아니다
        // (막는 것은 '먼저 보내는 콜드메일' 뿐 — src/lib/outbound-lock.ts 참고)
        const result = await sendMail({
          to,
          subject: `[Yogico] 오늘의 브리핑 ${dateLabel} · 회신필요 ${briefing.totals.needsReply}건`
            + (briefing.newReplies.length ? ` · 새 답장 ${briefing.newReplies.length}건` : ''),
          html: renderBriefingHtml(briefing, process.env.APP_BASE_URL || ''),
          smtpConfig: {
            host: account.smtpHost, port: account.smtpPort, secure: account.smtpSecure,
            user: account.smtpUser, pass: decryptSecret(account.smtpPassEnc),
          },
          fromOverride: { name: account.fromName || 'Yogico CRM', address: account.fromAddress || account.smtpUser },
        });
        report.steps.briefing = result.ok
          ? { sent: true, to, dryRun: Boolean(result.dryRun), counts: briefing.totals }
          : { error: result.error };
      }
    }
  } catch (e: any) {
    report.steps.briefing = { error: String(e?.message || e) };
  }

  report.finishedAt = new Date().toISOString();
  return NextResponse.json({ success: true, ...report });
}
