import nodemailer from 'nodemailer';
import { applyCompliance, isNightBlocked, isPublicBaseUrl } from './email/compliance';

/**
 * B2B 아웃바운드 이메일 전송기.
 * emailData 프로젝트의 이카운트 SMTP 설정을 그대로 재사용.
 *
 * 필요 env (Vercel Settings → Environment Variables):
 *   SMTP_HOST=wsmtp.ecount.com
 *   SMTP_PORT=465
 *   SMTP_SECURE=true
 *   SMTP_USER=david@yogico.kr
 *   SMTP_PASS=****
 *   MAIL_FROM_NAME=요기보
 *   MAIL_FROM_ADDRESS=david@yogico.kr        (SMTP_USER와 같아도 OK)
 *   MAIL_DRY_RUN=0                            (1이면 실제 발송 안 함 = 개발/테스트용)
 */

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP 환경변수 누락 — SMTP_HOST, SMTP_USER, SMTP_PASS 설정 필요. ' +
      '.env.local 또는 Vercel Settings → Environment Variables 확인.',
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cachedTransporter;
}

export interface SendMailInput {
  to: string;                 // 수신자
  subject: string;
  html?: string;              // HTML 본문 (bodyIsHtml=true일 때)
  text?: string;              // 텍스트 본문
  replyTo?: string;
  headers?: Record<string, string>;
  // 첨부파일 — 이미 받아 온 내용 (lib/mail/template-attachments.ts loadTemplateAttachments)
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  /**
   * 보낸 메일 **사본을 이 계정의 보낸메일함에 남긴다** (MailAccount 문서를 그대로 넘긴다).
   * SMTP 로 보내는 것만으로는 보낸메일함에 안 남아서, 웹메일에서도 [📤 보낸 메일함]에서도
   * 우리가 보낸 메일을 볼 수 없었다 (2026-09-15).
   */
  sentCopyAccount?: any;
  // ── 특정 MailAccount 로 발송 시 아래 3개 전달 (없으면 env 기본) ──
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;               // 이미 복호화된 평문 (호출자가 복호화 책임)
  };
  fromOverride?: { name: string; address: string };

  /**
   * 이 메일이 **광고성 정보**인가 (= 우리가 먼저 보내는 콜드메일).
   *
   * true 면 발송 직전에 정보통신망법 제50조 항목이 강제로 입혀진다 —
   * 제목 (광고) 표기, 본문 하단 발신자 정보·수신거부 링크, 야간 발송 차단.
   * 호출자가 이미 붙여 놨으면 중복으로 붙지 않는다.
   *
   * 답장(mail/reply)처럼 상대가 먼저 보낸 메일에 답하는 경우는 광고가 아니므로
   * 넘기지 않는다. 헷갈리면 기준은 하나다 — "상대가 요청한 적 없는데 우리가 먼저 보내나".
   */
  ad?: boolean;
  /** 야간 차단 무시 (긴급 시에만. 광고성 메일이면 과태료 소지가 있다) */
  ignoreNightBlock?: boolean;
  /**
   * 이 한 통만 실제 발송 없이 로그만 남긴다 (env MAIL_DRY_RUN 과 무관하게).
   *
   * 호출자가 자기 쪽에서 "보낸 셈 치고" 빠져나가면 안 된다. 그러면 제목에
   * (광고) 를 붙이고 수신거부를 다는 단계를 건너뛰게 되어, 미리보기로 본 제목과
   * 실제로 나갈 제목이 달라진다. 실제로 그랬다 — 미리보기에는 (광고) 가 없었다.
   */
  dryRun?: boolean;
}

export interface SendMailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  dryRun?: boolean;
  /** 이카운트 보낸메일함에 사본을 남겼는지 (sentCopyAccount 를 넘겼을 때) */
  savedToSent?: boolean;
  sentCopyError?: string;
}

/**
 * SMTP 연결/인증 만 확인 (실제 발송 없음, DRY_RUN 무시).
 * transporter.verify() 는 EHLO+AUTH 까지 수행하므로 비번 오류/포트 방화벽 즉시 검출.
 */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string; host?: string; port?: number; user?: string }> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return { ok: false, error: 'SMTP_HOST/SMTP_USER/SMTP_PASS 미설정' };
  }
  try {
    const t = getTransporter();
    await t.verify();
    return { ok: true, host, port, user };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'unknown SMTP error', host, port, user };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   🚫 전역 발송 차단 — 지금은 이 앱에서 메일이 한 통도 나가지 않는다.

   여기(가장 아래 계층)에 둔 이유:
   sendMail 을 부르는 곳이 6군데다 — 벌크 발송, 예약 발송(schedule-runner),
   답장(mail/reply), 브리핑, 크론, 테스트. 위쪽 한 곳만 막으면 예약이나
   크론으로 조용히 나갈 수 있다. 여기서 막으면 전부 걸린다.

   env(MAIL_DRY_RUN)만 쓰지 않은 이유:
   Next.js 는 .env.local 을 서버가 뜰 때 한 번만 읽는다. 파일만 고치면
   이미 떠 있는 서버에는 반영되지 않아 "껐다고 생각했는데 나가는" 일이
   생긴다. 코드 상수는 저장 즉시 hot reload 로 먹는다.

   ── 지금 상태: false (여기서는 막지 않는다) ──
   대량 발송은 lib/outbound-lock.ts 의 OUTBOUND_LOCKED 가 막고 있다.
   여기까지 켜면 받은 메일 답장(mail/reply)까지 막혀서, 진행 중인 거래처에
   답을 못 하게 된다. 막아야 할 것은 "먼저 보내는 콜드메일 400통"이지
   "상대가 보낸 메일에 답하는 것"이 아니다.

   ⚠️ 대량 발송을 다시 열 때(OUTBOUND_LOCKED=false) 반드시 먼저 할 것:
      하루 발송 상한과 발송 간격 넣기. 현재 발송 루프에는 둘 다 없어
      400통이 한 번에 나간다. yogico.kr 로 실거래 메일도 나가므로
      스팸 판정을 받으면 그 메일들까지 상대 스팸함으로 간다.

   전부 막아야 할 일이 생기면 아래를 true 로 (저장 즉시 먹는다).
   ═══════════════════════════════════════════════════════════════════ */
export const GLOBAL_SEND_BLOCKED = false;

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (GLOBAL_SEND_BLOCKED) {
    console.log('[mailer:BLOCKED] 발송 차단됨 →', input.to, '·', input.subject);
    return { ok: false, error: '메일 발송이 차단되어 있습니다 (mailer.ts · GLOBAL_SEND_BLOCKED)' };
  }
  // ── 정보통신망법 관문 ─────────────────────────────────────
  // DRY_RUN 보다 먼저 통과시킨다. 그래야 로그에 찍히는 제목이 실제로 나갈 제목과
  // 같아지고, "테스트에서는 (광고)가 없었는데 실전에만 붙는" 어긋남이 안 생긴다.
  if (input.ad) {
    const night = isNightBlocked();
    if (night.blocked && !input.ignoreNightBlock) {
      return {
        ok: false,
        error: `야간 발송 차단 (현재 KST ${night.kstHour}시) — 광고성 정보는 21시~08시 전송이 제한됩니다.`,
      };
    }
    // 진짜로 나가는 메일에 열리지 않는 수신거부 링크를 실을 수는 없다.
    // DRY RUN 은 통과시킨다 — 개발 중에는 localhost 가 정상이다.
    const reallySending = !(input.dryRun === true || process.env.MAIL_DRY_RUN === '1');
    if (reallySending && !isPublicBaseUrl()) {
      return {
        ok: false,
        error: 'APP_BASE_URL 이 localhost 입니다 — 수신거부 링크가 받는 사람 쪽에서 열리지 않습니다. '
             + '배포 주소로 바꾼 뒤 보내세요 (정보통신망법 제50조).',
      };
    }

    const applied = applyCompliance(
      { subject: input.subject, html: input.html || '', to: input.to },
    );
    input = { ...input, subject: applied.subject, html: applied.html };
  }

  const dryRun = input.dryRun === true || process.env.MAIL_DRY_RUN === '1';
  if (dryRun) {
    console.log('[mailer:DRY_RUN]', input.to, '·', input.subject, input.smtpConfig ? `(via ${input.smtpConfig.user})` : '');
    return { ok: true, dryRun: true, messageId: `dryrun-${Date.now()}` };
  }

  // 특정 계정 자격증명이 전달됐으면 그걸로 임시 transporter 생성
  // (캐시하지 않음 — 계정별 독립 · 매 발송마다 새로. 대량 발송이면 향후 계정별 캐시 검토)
  let transporterToUse;
  if (input.smtpConfig) {
    transporterToUse = nodemailer.createTransport({
      host: input.smtpConfig.host,
      port: input.smtpConfig.port,
      secure: input.smtpConfig.secure,
      auth: { user: input.smtpConfig.user, pass: input.smtpConfig.pass },
    });
  }

  const fromName = input.fromOverride?.name || process.env.MAIL_FROM_NAME || 'Yogico';
  const fromAddress =
    input.fromOverride?.address || process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER;
  if (!fromAddress) {
    return { ok: false, error: 'MAIL_FROM_ADDRESS/SMTP_USER 누락' };
  }

  try {
    const transporter = transporterToUse || getTransporter();
    const mailOptions = {
      from: `"${fromName}" <${fromAddress}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      headers: input.headers,
      attachments: input.attachments?.length ? input.attachments : undefined,
    };
    const info = await transporter.sendMail(mailOptions);

    // 보낸메일함에 사본 남기기 — 실패해도 발송은 성공이다 (다시 보낼 수는 없다).
    // 순환 참조를 피하려고 여기서만 늦게 불러온다.
    let savedToSent: boolean | undefined;
    let sentCopyError: string | undefined;
    if (input.sentCopyAccount) {
      try {
        const { saveToSentFolder } = await import('./mail/sent-copy');
        const r = await saveToSentFolder(input.sentCopyAccount, { ...mailOptions, messageId: info.messageId });
        savedToSent = r.ok;
        if (!r.ok) sentCopyError = r.error;
      } catch (e: any) {
        savedToSent = false;
        sentCopyError = String(e?.message || e);
      }
      if (!savedToSent) console.warn('[mailer] 보낸메일함 사본 실패:', sentCopyError);
    }
    return { ok: true, messageId: info.messageId, savedToSent, sentCopyError };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'unknown SMTP error' };
  }
}

/**
 * 템플릿 변수 치환.
 * - `{{Company}}` 스타일 (개발자용 · 기존 호환)
 * - `[회사명]` 한글 마커 (비개발자 친화 · 새 방식)
 * 재귀/조건문 없음 — 단순 문자열 치환.
 */
const KO_ALIAS_TO_KEY: Record<string, string> = {
  '회사명': 'Company',
  '상대회사': 'Company',
  '상대 회사명': 'Company',
  '받는사람': 'BuyerContact',
  '담당자': 'BuyerContact',
  '담당자 이름': 'BuyerContact',
  '담당자 직함': 'Title',
  '담당자 이메일': 'Email',
  '담당자 전화번호': 'Phone',
  '지역': 'Region',
};

export function renderTemplate(source: string, vars: Record<string, string | undefined>): string {
  // 1. {{Key}} 형식
  let out = source.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key) => {
    return vars[key] != null ? String(vars[key]) : `{{${key}}}`;
  });
  // 2. [한글마커] 형식
  out = out.replace(/\[([^\[\]\n]+?)\]/g, (m, label) => {
    const key = KO_ALIAS_TO_KEY[label.trim()];
    if (!key) return m;   // 정의 안 된 마커는 그대로 (일반 대괄호 텍스트 훼손 방지)
    return vars[key] != null ? String(vars[key]) : m;
  });
  return out;
}
