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
 *   byCategory?: boolean           (true면 리드의 카테고리에 맞는 양식을 각각 골라 발송)
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

  /**
   * 카테고리별로 서로 다른 양식을 쓴다 (국내판 핵심).
   *
   * 해외판은 한 번 고른 양식 하나를 고른 리드 전부에게 보냈다. 상대가 전부 해외
   * 바이어라 제안 내용이 같았기 때문이다. 국내는 병원 대기실과 호텔 로비에 같은
   * 메일을 보낼 수 없다 — 제안하는 공간도 소구점도 다르다. 그래서 리드마다
   * 그 리드의 category 에 맞는 양식을 따로 찾아 쓴다.
   */
  const byCategory: boolean = body.byCategory === true;

  if (!byCategory && !templateId && (!explicitSubject || !explicitBody)) {
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

  // ── 카테고리별 양식 준비 ──────────────────────────────────
  // category 가 빈 양식은 '공용' 으로 본다. 맞는 카테고리 양식이 없을 때만 쓴다.
  const tplByCategory = new Map<string, any>();
  if (byCategory) {
    const rows = await EmailTemplate.find({ isActive: true, purpose: 'intro' }).lean() as any[];
    for (const t of rows) tplByCategory.set(t.category || '', t);

    // 보낼 리드 중 쓸 양식이 없는 카테고리가 있으면 **한 통도 보내지 않는다**.
    // 한쪽만 나가고 나머지는 조용히 실패하면, 누구에게 무엇이 갔는지 알 수 없게 된다.
    const missing = new Set<string>();
    for (const lead of leads) {
      const key = lead.category || '';
      if (!tplByCategory.has(key) && !tplByCategory.has('')) missing.add(key || '(미분류)');
    }
    if (missing.size) {
      return NextResponse.json({
        success: false,
        error: `양식이 없는 카테고리가 있습니다: ${[...missing].join(', ')} — [📝 메일 양식]에서 만들어 주세요.`,
      }, { status: 400 });
    }
  }

  /** 이 리드에 쓸 양식 — 카테고리 전용 → 공용 → 화면에서 고른 것 순 */
  const templateFor = (lead: any) =>
    byCategory ? (tplByCategory.get(lead.category || '') || tplByCategory.get('') || tpl) : tpl;

  // 선택된 메일 계정 프로필 로드 → 서명 블록 자동 생성용 (본문에 발송자 변수 불필요)
  const accProfile = usedAccount ? await MailAccount.findById(usedAccount.id).lean() as any : null;
  const appendSignature = tpl?.appendAccountSignature !== false;   // 템플릿 없으면 기본 true
  const sigHtml  = accProfile && appendSignature ? buildSignatureBlock(accProfile, { html: true })  : '';
  const sigText  = accProfile && appendSignature ? buildSignatureBlock(accProfile, { html: false }) : '';

  // 양식에 첨부가 있으면 **보내기 전에** 받아 둔다.
  // 하나라도 못 받으면 한 통도 보내지 않는다 — 첨부 빠진 메일이 나가는 것보다 낫다.
  // 카테고리별 발송이면 양식마다 첨부가 다르므로, 이번에 쓰일 양식을 전부 받아 둔다.
  const attachmentsByTemplate = new Map<string, any[]>();
  {
    const used = byCategory
      ? [...new Set(leads.map((l) => templateFor(l)).filter(Boolean))]
      : (tpl ? [tpl] : []);
    for (const t of used) {
      const load = await loadTemplateAttachments(t?.attachments);
      if (!load.ok) {
        return NextResponse.json(
          { success: false, error: `[${t?.name || '양식'}] ${load.error}` },
          { status: 400 },
        );
      }
      attachmentsByTemplate.set(String(t?._id || ''), load.files);
    }
    if (!used.length) attachmentsByTemplate.set('', []);
  }

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

    // 이 리드에 쓸 양식 — 카테고리별 발송이면 리드마다 달라진다
    const leadTpl = templateFor(lead);
    const leadSubjectSrc = byCategory ? (leadTpl?.subject ?? subjectSrc) : subjectSrc;
    const leadBodySrc = byCategory ? (leadTpl?.body ?? bodySrc) : bodySrc;
    const attachments = attachmentsByTemplate.get(String(leadTpl?._id || '')) || [];

    // 변수 치환 (받는사람/회사명만 · 발송자는 서명으로)
    const vars = buildVarsFromLead(lead);
    const renderedSubject = renderTemplate(leadSubjectSrc, vars);
    const renderedBody = renderTemplate(leadBodySrc, vars);

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

    // DRY RUN 이어도 sendMail 을 통과시킨다.
    // 여기서 "보낸 셈 치고" 빠져나가면 (광고) 표기·수신거부·야간차단이 적용되기 전의
    // 제목이 로그에 남아서, 미리보기와 실제 발송이 달라진다.
    const result = await sendMail({
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
      dryRun,
    });

    if (result.ok) {
      sent++;
      results.push({ leadId: lead.leadId, ok: true, messageId: result.messageId, dryRun });
      // emailHistory 추가 + 성공 시 stage → 'contacted' 자동 이동
      // (DRY_RUN 은 실제 발송 아님 → stage 변경 안 함)
      // DRY RUN 은 아무 기록도 남기지 않는다.
      //
      // 예전에는 여기서 status:'sent' 이력을 그대로 남겼다. 실제로는 한 통도 안 나갔는데
      // 리드에는 "보냄"이 찍히고, 그 이력을 세는 과도발송 가드(send-limits)가 함께 올라가서
      // 정작 진짜로 보낼 때 "이미 N번 보냈다"며 막혔다. 시험 삼아 한 번 눌러 본 것이
      // 실제 발송을 막는 셈이라, 테스트할수록 시스템이 잠긴다.
      if (dryRun) continue;

      const setUpdate: any = { lastEmailSentAt: now };
      if (lead.stage !== 'contacted' && lead.stage !== 'replied' && lead.stage !== 'negotiating' && lead.stage !== 'partner') {
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
                // 요청에 실린 값이 아니라 **실제로 쓴 양식**을 남긴다 —
                // 카테고리별 발송은 리드마다 양식이 달라서, 요청값을 남기면
                // 나중에 "이 업체에 무슨 문구가 갔나" 를 되짚을 수 없다.
                templateId: String(leadTpl?._id || templateId || ''),
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
      if (dryRun) continue;   // 위와 같은 이유 — 시험 삼아 돌린 것이 이력에 남으면 안 된다
      historyOps.push({
        updateOne: {
          filter: { leadId: lead.leadId },
          update: {
            $push: {
              emailHistory: {
                subject: renderedSubject,
                // 요청에 실린 값이 아니라 **실제로 쓴 양식**을 남긴다 —
                // 카테고리별 발송은 리드마다 양식이 달라서, 요청값을 남기면
                // 나중에 "이 업체에 무슨 문구가 갔나" 를 되짚을 수 없다.
                templateId: String(leadTpl?._id || templateId || ''),
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
