import { OUTBOUND_LOCKED, OUTBOUND_LOCK_MESSAGE, canSendTo, TEST_RECIPIENTS } from './outbound-lock';
import { EmailTemplate } from '@/models/EmailTemplate';
import { Lead } from '@/models/Lead';
import { sendMail, renderTemplate } from './mailer';
import { buildVarsFromLead, buildSignatureBlock } from './template-vars';
import { decryptSecret } from './crypto';
import { checkSendGuard } from './send-limits';
import { resolveOutreachAccount } from './mail/accounts';
import { loadTemplateAttachments } from './mail/template-attachments';

/**
 * 단일 예약 항목을 실제로 발송 · Lead.emailHistory 기록 · stage 전이 (verified→contacted)
 * cron 워커와 "즉시 발송" 액션에서 재사용.
 */
export async function processScheduleItem(doc: any) {
  const now = new Date();

  const tpl: any = await EmailTemplate.findById(doc.templateId).lean();
  if (!tpl) {
    doc.status = 'failed'; doc.lastError = 'template not found'; doc.attempts += 1;
    await doc.save();
    return { ok: false, error: 'template not found' };
  }

  const lead: any = await Lead.findOne({ leadId: doc.leadId }).lean();
  if (!lead) {
    doc.status = 'failed'; doc.lastError = 'lead not found'; doc.attempts += 1;
    await doc.save();
    return { ok: false, error: 'lead not found' };
  }

  // 발송 시점 재확인 — 예약 등록 후 시각까지 사이에 이미 여러 번 발송되었을 수 있음
  const guard = checkSendGuard({ emailHistory: lead.emailHistory, lastEmailSentAt: lead.lastEmailSentAt });
  if (!guard.ok) {
    // 가드는 **실패가 아니라 '아직'** 이다.
    //
    // 48시간 간격에 걸린 건은 시간이 지나면 보낼 수 있다. 그런데 여기서
    // 'failed' 로 바꿔 버리면 다음 크론이 pending 만 집으므로 영영 안 나가고,
    // 화면에서도 실패로 보여 사람이 다시 예약해야 한다.
    // 실제로 이번 점검에서 3건이 이렇게 죽었다(되살렸다).
    //
    // 3회 한도 초과는 시간이 지나도 안 풀리므로 그건 실패로 닫는다.
    const permanent = String(guard.reason || '').includes('횟수 초과');
    doc.status = permanent ? 'failed' : 'pending';
    doc.lastError = `발송 가드: ${guard.reason}`;
    if (permanent) doc.attempts += 1;
    await doc.save();
    return { ok: false, error: doc.lastError, retryable: !permanent };
  }

  let smtpConfig: any = undefined;
  let fromOverride: any = undefined;
  let accProfile: any = null;
  // 보내는 계정 = 예약을 걸 때 고른 계정 (적힌 게 없으면 대표 계정).
  // 그 계정이 지워졌거나 사용 중지면 다른 주소로 대신 보내지 않고 실패로 남긴다
  // (예전처럼 .env 의 SMTP 로 조용히 대신 보내지도 않는다).
  {
    const { account: acc, error: accError } = await resolveOutreachAccount(
      doc.mailAccountId,
      // 만든 사람이 있으면 그 사람 계정 범위로, 없으면(옛 예약) 마스터 계정 범위로
      doc.createdBy && doc.createdBy !== 'system' ? doc.createdBy : undefined,
    );
    if (!acc) {
      doc.status = 'failed';
      doc.lastError = accError || 'no account';
      doc.attempts += 1;
      await doc.save();
      return { ok: false, error: doc.lastError };
    }
    doc.mailAccountId = String(acc._id);
    try {
      smtpConfig = {
        host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpSecure,
        user: acc.smtpUser, pass: decryptSecret(acc.smtpPassEnc),
      };
      fromOverride = { name: acc.fromName || acc.smtpUser, address: acc.fromAddress };
      accProfile = acc;
    } catch (e: any) {
      doc.status = 'failed'; doc.lastError = `계정 복호화 실패: ${e?.message || 'unknown'}`; doc.attempts += 1;
      await doc.save();
      return { ok: false, error: doc.lastError };
    }
  }

  const vars = buildVarsFromLead(lead);
  const renderedSubject = renderTemplate(tpl.subject, vars);
  let renderedBody = renderTemplate(tpl.body, vars);
  const appendSig = tpl.appendAccountSignature !== false;
  const sig = accProfile && appendSig ? buildSignatureBlock(accProfile, { html: !!tpl.bodyIsHtml }) : '';
  if (sig) renderedBody = renderedBody + sig;

  const fontFamily = 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif';
  const fontSize = 15;
  let htmlPayload: string | undefined;
  let textPayload: string | undefined;
  if (tpl.bodyIsHtml) {
    const bodyHtml = renderedBody.includes('<') ? renderedBody : renderedBody.replace(/\n/g, '<br>');
    htmlPayload = `<div style="font-family:${fontFamily};font-size:${fontSize}px;line-height:1.65;color:#111827">${bodyHtml}</div>`;
    textPayload = renderedBody.replace(/<[^>]+>/g, '');
  } else {
    textPayload = renderedBody;
  }

  // ⚠️ 예약 발송은 /api/mail/send 를 거치지 않는다. 그 라우트의 차단 스위치만
  //    믿으면 예약 시각이 됐을 때 그대로 나가버린다 (실제로 그런 구멍이 있었다).
  // 잠금 중에도 테스트 주소로는 나가게 둔다 — 예약 → 발송 → 수신까지
  // 실제로 돌려봐야 하기 때문이다. 그 외 주소는 그대로 막는다.
  if (!canSendTo(doc.to)) {
    console.log(`[schedule:LOCKED] 발송 차단 → to=${doc.to} subject=${renderedSubject.slice(0, 60)}`);
    return {
      ok: false,
      error: OUTBOUND_LOCKED
        ? `발송 잠금 중 — 지금은 ${TEST_RECIPIENTS.join(', ')} 로만 나갑니다`
        : OUTBOUND_LOCK_MESSAGE,
    };
  }

  const dryRun = process.env.MAIL_DRY_RUN === '1';
  let result: any;
  if (dryRun) {
    console.log(`[schedule:DRY_RUN] to=${doc.to} subject=${renderedSubject.slice(0, 60)}`);
    result = { ok: true, dryRun: true, messageId: `dryrun-sched-${Date.now()}` };
  } else {
    // 양식의 첨부를 보내는 순간 받아서 붙인다. 못 받으면 보내지 않고 실패로 남긴다
    // (아래 else 갈래 — 발송함에 사유가 뜨고, 주소를 고친 뒤 다시 보낼 수 있다).
    const att = await loadTemplateAttachments(tpl.attachments);
    result = att.ok
      ? await sendMail({
          to: doc.to,
          subject: renderedSubject,
          html: htmlPayload,
          text: textPayload,
          attachments: att.files,
          smtpConfig,
          fromOverride,
          sentCopyAccount: accProfile,   // 보낸메일함에 사본을 남긴다
          // 예약 발송도 콜드메일이다 — 광고 표기·수신거부·야간차단 적용.
          // 야간 차단은 특히 여기서 의미가 있다. 예약이 새벽에 깨어나 돌면
          // 사람이 보고 있지 않은 채로 규정을 어기게 된다.
          ad: true,
        })
      : { ok: false, error: att.error };
  }

  doc.attempts += 1;
  if (result.ok) {
    // DRY RUN 은 예약을 **소모하지 않는다**.
    //
    // 여기가 dryRun 을 안 보고 무조건 'sent' 로 바꿔서, 미리보기 한 번에 예약이
    // 통째로 사라질 수 있었다. 아래 emailHistory 는 같은 이유로 이미
    // dryRun 을 보고 있었는데(status: dryRun ? 'scheduled' : 'sent') 정작
    // 예약 문서 자신은 빠져 있었다. 실제로 222건이 이 상태로 대기 중이었다.
    //
    // 나가지 않았으면 pending 그대로 둔다 — 다음 실행이 다시 집어간다.
    doc.status = dryRun ? 'pending' : 'sent';
    if (!dryRun) {
      doc.sentAt = now;
      doc.lastError = '';
    }
    // attempts 도 되돌린다. 안 그러면 미리보기를 몇 번 돌렸다는 이유로
    // 재시도 한도에 걸려 진짜 발송이 막힌다.
    if (dryRun) doc.attempts -= 1;
    await doc.save();

    const historyItem: any = {
      subject: renderedSubject,
      body: renderedBody.slice(0, 500),
      templateId: doc.templateId,
      to: doc.to,
      sentAt: now.toISOString(),
      scheduledFor: doc.scheduledFor.toISOString(),
      // DRY_RUN 은 실제로 나가지 않았다. 이걸 'sent' 로 남기면 발송 횟수
      // 3회 한도가 테스트만으로 소진되고, 화면에도 "보낸 곳"으로 뜬다.
      status: dryRun ? 'scheduled' : 'sent',
      // 답장 매칭 열쇠 — 상대 답장의 In-Reply-To 가 이 값을 가리킨다 (match-lead.ts)
      messageId: result.messageId || '',
    };
    const setUpdate: any = { lastEmailSentAt: now.toISOString() };
    if (!dryRun && lead.stage !== 'contacted' && lead.stage !== 'replied' && lead.stage !== 'negotiating' && lead.stage !== 'partner') {
      setUpdate.stage = 'contacted';
      setUpdate.stageChangedAt = now.toISOString();
    }
    await Lead.updateOne(
      { leadId: doc.leadId },
      { $push: { emailHistory: historyItem }, $set: setUpdate },
    );
    return { ok: true, messageId: result.messageId, dryRun: !!result.dryRun };
  } else {
    doc.status = 'failed';
    doc.lastError = result.error || 'unknown';
    await doc.save();
    await Lead.updateOne(
      { leadId: doc.leadId },
      {
        $push: {
          emailHistory: {
            subject: renderedSubject,
            templateId: doc.templateId,
            to: doc.to,
            sentAt: now.toISOString(),
            scheduledFor: doc.scheduledFor.toISOString(),
            status: 'failed',
            error: result.error || 'unknown',
          },
        },
      },
    );
    return { ok: false, error: result.error };
  }
}
