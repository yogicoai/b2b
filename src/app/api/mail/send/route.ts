import { NextResponse } from 'next/server';
import { resolveOutreachAccount } from '@/lib/mail/accounts';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { EmailTemplate } from '@/models/EmailTemplate';
import { MailAccount } from '@/models/MailAccount';
import { sendMail, renderTemplate } from '@/lib/mailer';
import { buildVarsFromLead, buildSignatureBlock } from '@/lib/template-vars';
import { decryptSecret } from '@/lib/crypto';
import { checkSendGuard } from '@/lib/send-limits';
import { loadTemplateAttachments } from '@/lib/mail/template-attachments';
import { OUTBOUND_LOCKED, OUTBOUND_LOCK_MESSAGE, canSendTo, TEST_RECIPIENTS } from '@/lib/outbound-lock';

export const runtime = 'nodejs';
export const maxDuration = 60;

/* 발송 차단은 src/lib/outbound-lock.ts 한 곳에서만 관리한다.
   예전에는 여기에도 SEND_KILL_SWITCH 라는 별도 스위치가 있었다. 스위치가 둘로
   갈리면 한쪽만 내려놓고 "껐다"고 생각하게 되고, 반대로 한쪽만 올려서
   "왜 안 나가지" 를 찾느라 시간을 쓴다. 실제로 그래서 테스트가 막혔다. */

/**
 * POST /api/mail/send
 * B2B 메일 벌크/개별 발송. 각 리드마다 템플릿 변수 치환 → SMTP 발송 → emailHistory 기록.
 *
 * Body:
 *   leadIds: string[]              (leadId 배열 — 1건 이상)
 *   templateId?: string            (템플릿 ID · body/subject 없을 때 필수)
 *   subject?: string               (템플릿 없이 커스텀 발송)
 *   body?: string                  (템플릿 없이 커스텀 발송)
 *   bodyIsHtml?: boolean           (기본 true — 폰트 적용 위해)
 *   fontFamily?: string            (예: 'Pretendard', 'Arial', ...)
 *   fontSize?: number              (px)
 *   dryRun?: boolean               (true면 서버 DRY_RUN 관계없이 무조건 로그만)
 *   ad?: boolean                   (기본 true — 정보통신망법 광고 표기·수신거부·야간차단 적용)
 *   ignoreNightBlock?: boolean     (야간 차단 무시 · 광고성이면 과태료 소지)
 *
 * 응답:
 *   { success, requested, sent, failed, dryRun, results: [{leadId, ok, messageId?, error?}] }
 */
export async function POST(req: Request) {
  // 보내는 계정은 로그인한 아이디 몫 안에서만 고른다 (lib/mail/scope.ts).
  // 아이디 없이 계정을 찾으면 마스터 계정으로 잡혀 남의 주소로 나갈 수 있다.
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  // 잠금 중에도 테스트 주소(TEST_RECIPIENTS)로는 나가야 발송~수신 흐름을
  // 끝까지 확인할 수 있다. 그래서 요청 전체를 여기서 막지 않고, 아래 발송
  // 루프에서 받는 주소별로 거른다. 테스트 주소가 하나도 없으면 전면 차단이다.
  if (OUTBOUND_LOCKED && !TEST_RECIPIENTS.length) {
    return NextResponse.json({
      success: false,
      error: OUTBOUND_LOCK_MESSAGE,
      killSwitch: true,
    }, { status: 423 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];
  if (!leadIds.length) {
    return NextResponse.json({ success: false, error: 'leadIds 필수' }, { status: 400 });
  }

  const templateId: string | undefined = body.templateId;
  const explicitSubject: string | undefined = body.subject;
  const explicitBody: string | undefined = body.body;
  const bodyIsHtml: boolean = body.bodyIsHtml !== false;   // default true
  const fontFamily: string = body.fontFamily || 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif';
  const fontSize: number = Math.min(24, Math.max(10, Number(body.fontSize) || 15));
  const forceDryRun: boolean = body.dryRun === true;
  const mailAccountId: string | undefined = body.mailAccountId;

  if (!templateId && (!explicitSubject || !explicitBody)) {
    return NextResponse.json({ success: false, error: 'templateId 또는 subject+body 필요' }, { status: 400 });
  }

  await dbConnect();

  // 템플릿 로드
  let tpl: any = null;
  if (templateId) {
    tpl = await EmailTemplate.findById(templateId).lean();
    if (!tpl) return NextResponse.json({ success: false, error: 'template not found' }, { status: 404 });
  }

  // ── 발송 계정 로드 (mailAccountId 지정 시) ──
  // 미지정 시 default 계정 또는 env fallback (하위 호환)
  let smtpConfig: any = undefined;
  let fromOverride: any = undefined;
  let usedAccount: any = null;
  // 화면에서 고른 계정으로 보낸다. 안 골랐으면 대표 계정 (lib/mail/accounts.ts resolveOutreachAccount).
  // user 를 넘겨 자기 계정만 — 남의 계정 id 를 넣으면 계정 없음으로 거절된다.
  {
    const { account: acc, error: accError } = await resolveOutreachAccount(mailAccountId, user);
    if (!acc) {
      return NextResponse.json({ success: false, error: accError }, { status: 400 });
    }
    try {
      smtpConfig = {
        host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpSecure,
        user: acc.smtpUser, pass: decryptSecret(acc.smtpPassEnc),
      };
      fromOverride = { name: acc.fromName || acc.smtpUser, address: acc.fromAddress };
      usedAccount = { id: String(acc._id), user: acc.smtpUser, from: acc.fromAddress };
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `계정 복호화 실패: ${e?.message}` }, { status: 500 });
    }
  }

  const subjectSrc = explicitSubject ?? tpl?.subject ?? '';
  const bodySrc = explicitBody ?? tpl?.body ?? '';

  // 대상 리드 로드
  const leads = await Lead.find({ leadId: { $in: leadIds } }).lean() as any[];

  // 선택된 메일 계정 프로필 로드 → 서명 블록 자동 생성용 (본문에 발송자 변수 불필요)
  const accProfile = usedAccount ? await MailAccount.findById(usedAccount.id).lean() as any : null;
  const appendSignature = tpl?.appendAccountSignature !== false;   // 템플릿 없으면 기본 true
  const sigHtml  = accProfile && appendSignature ? buildSignatureBlock(accProfile, { html: true })  : '';
  const sigText  = accProfile && appendSignature ? buildSignatureBlock(accProfile, { html: false }) : '';

  // 양식에 첨부가 있으면 **보내기 전에** 한 번 받아 둔다 (모든 업체에 같은 파일).
  // 하나라도 못 받으면 한 통도 보내지 않는다 — 첨부 빠진 메일이 나가는 것보다 낫다.
  const attLoad = await loadTemplateAttachments(tpl?.attachments);
  if (!attLoad.ok) {
    return NextResponse.json({ success: false, error: attLoad.error }, { status: 400 });
  }
  const attachments = attLoad.files;

  const now = new Date().toISOString();
  const results: any[] = [];
  let sent = 0;
  let failed = 0;
  const historyOps: any[] = [];

  for (const lead of leads) {
    // 이메일 없으면 스킵
    const to = (lead.Email || '').trim();
    if (!to || /^Not found/i.test(to) || !/@/.test(to)) {
      results.push({ leadId: lead.leadId, ok: false, error: 'no valid email' });
      failed++;
      continue;
    }

    // 과도 발송 방지 (리드당 MAX 회 · 최소 간격) · body.force=true 면 우회 (수동 override)
    if (body.force !== true) {
      const guard = checkSendGuard({
        emailHistory: lead.emailHistory,
        lastEmailSentAt: lead.lastEmailSentAt,
      });
      if (!guard.ok) {
        results.push({ leadId: lead.leadId, ok: false, error: guard.reason, sentCount: guard.sentCount });
        failed++;
        continue;
      }
    }

    // 변수 치환 (받는사람/회사명만 · 발송자는 서명으로)
    const vars = buildVarsFromLead(lead);
    const renderedSubject = renderTemplate(subjectSrc, vars);
    const renderedBody = renderTemplate(bodySrc, vars);

    // HTML 모드일 때 폰트 wrapping + 서명 블록 자동 추가
    let htmlPayload: string | undefined;
    let textPayload: string | undefined;
    if (bodyIsHtml) {
      const bodyHtml = renderedBody.includes('<') ? renderedBody : renderedBody.replace(/\n/g, '<br>');
      htmlPayload = `<div style="font-family:${fontFamily};font-size:${fontSize}px;line-height:1.65;color:#111827">${bodyHtml}${sigHtml}</div>`;
      textPayload = renderedBody.replace(/<[^>]+>/g, '') + sigText;
    } else {
      textPayload = renderedBody + sigText;
    }

    // 잠금 중이면 테스트 주소가 아닌 곳은 여기서 떨어뜨린다.
    // 실수로 전 건을 눌러도 실제로 나가는 것은 테스트 주소뿐이다.
    if (!canSendTo(to)) {
      failed++;
      results.push({
        leadId: lead.leadId,
        ok: false,
        error: `발송 잠금 중 — 지금은 ${TEST_RECIPIENTS.join(', ')} 로만 나갑니다`,
        locked: true,
      });
      continue;
    }

    // 발송 (또는 DRY_RUN)
    const dryRunEnv = process.env.MAIL_DRY_RUN === '1';
    const dryRun = forceDryRun || dryRunEnv;

    let result;
    if (dryRun) {
      console.log(`[mail:send:DRY_RUN] to=${to} subject=${renderedSubject.slice(0, 60)}`);
      result = { ok: true, dryRun: true, messageId: `dryrun-${Date.now()}-${lead.leadId}` };
    } else {
      result = await sendMail({
        to,
        subject: renderedSubject,
        html: htmlPayload,
        text: textPayload,
        attachments,
        smtpConfig,
        fromOverride,
        sentCopyAccount: accProfile,   // 보낸메일함에 사본을 남긴다
        // 이 경로는 우리가 먼저 보내는 콜드메일이다 = 광고성 정보.
        // 기본값을 true 로 두는 이유: 빠뜨리면 과태료가 나오는 쪽이고,
        // 잘못 붙는 쪽은 메일이 조금 정중해질 뿐이다. 광고가 아닌 안내 메일을
        // 이 경로로 보내야 하면 요청 본문에 ad:false 를 명시한다.
        ad: body.ad !== false,
        ignoreNightBlock: body.ignoreNightBlock === true,
      });
    }

    if (result.ok) {
      sent++;
      results.push({ leadId: lead.leadId, ok: true, messageId: result.messageId, dryRun });
      // emailHistory 추가 + 성공 시 stage → 'contacted' 자동 이동
      // (DRY_RUN 은 실제 발송 아님 → stage 변경 안 함)
      const setUpdate: any = { lastEmailSentAt: now };
      if (!dryRun && lead.stage !== 'contacted' && lead.stage !== 'replied' && lead.stage !== 'negotiating' && lead.stage !== 'partner') {
        setUpdate.stage = 'contacted';
        setUpdate.stageChangedAt = now;
      }
      historyOps.push({
        updateOne: {
          filter: { leadId: lead.leadId },
          update: {
            $push: {
              emailHistory: {
                subject: renderedSubject,
                body: renderedBody.slice(0, 500),
                templateId: templateId || '',
                to,
                sentAt: now,
                status: 'sent',
                // 상대 답장의 In-Reply-To 헤더가 이 값을 가리킨다.
                // 수신 메일을 어느 리드의 답장인지 확정하는 가장 정확한 열쇠 (match-lead.ts).
                messageId: result.messageId || '',
              },
            },
            $set: setUpdate,
          },
        },
      });
    } else {
      failed++;
      results.push({ leadId: lead.leadId, ok: false, error: result.error });
      historyOps.push({
        updateOne: {
          filter: { leadId: lead.leadId },
          update: {
            $push: {
              emailHistory: {
                subject: renderedSubject,
                templateId: templateId || '',
                to,
                sentAt: now,
                status: 'failed',
                error: result.error || 'unknown',
              },
            },
          },
        },
      });
    }
  }

  if (historyOps.length > 0) {
    await Lead.bulkWrite(historyOps, { ordered: false });
  }

  return NextResponse.json({
    success: true,
    requested: leads.length,
    sent,
    failed,
    dryRun: forceDryRun || process.env.MAIL_DRY_RUN === '1',
    usedAccount,
    results,
  });
}
