/**
 * 1차 규칙 필터 — AI 호출 전에 광고·자동발송을 무료로 걸러낸다.
 *
 * 판정 방식은 점수제다.
 *   - 강한 신호 1개(법정 광고표기, 마케팅 발송업체 등) → 즉시 광고 확정
 *   - 약한 신호는 누적해서 임계치를 넘으면 광고로 본다
 * 단일 규칙으로 자르면 오탐이 크고, AI 로 넘기면 비용이 들기 때문이다.
 *
 * 주의: 여기서 걸러진 메일도 삭제하지 않는다. 라벨만 붙여 보관하고
 * 메일함에서 필터를 풀면 조회·수동 재분류할 수 있다(오판 복구 경로).
 *
 * (emailData/src/lib/mail/classify.js 이식)
 */

export type Classification =
  | 'b2b' | 'inquiry' | 'partner' | 'newsletter' | 'ad' | 'system' | 'unknown';

export interface RuleResult {
  classification: Classification;
  classifiedBy: 'rule';
  reason: string;
  confident: boolean;
  score: number;
}

export interface ClassifySettings {
  blockedDomains?: string[];
  blockedKeywords?: string[];
  systemSenders?: string[];
}

export interface ClassifyInput {
  subject?: string;
  raw?: { text?: string };
  from?: { address?: string; name?: string };
  to?: Array<{ address?: string }>;
  headers?: Record<string, any>;
}

/* ── 자동발송 주소 ── */
const SYSTEM_SENDER =
  /(^|[._-])(noreply|no-reply|donotreply|do-not-reply|notification|notify|alert|mailer-daemon|postmaster|bounce|bounces|automated)/i;

/**
 * 제목만으로 자동발송이 확실한 것들.
 *
 * 발신 주소가 멀쩡한 사람 주소여도 내용이 기계 발송인 경우가 있다.
 * 부재중 자동응답이 대표적인데, 사람 주소에서 오고 스레드에 섞여 있어
 * 발신자 규칙으로는 절대 안 걸린다. 그대로 두면 매일 상한 20통 중
 * 몇 자리를 이런 것들이 차지한다.
 *
 * ⚠️ vercelData 에서는 특히 중요하다 — 콜드메일을 대량 발송하므로
 *    부재중 자동응답이 "답장 옴"으로 잘못 잡히면 리드 stage 가 오염된다.
 */
const AUTO_SUBJECT: RegExp[] = [
  /^\s*(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|absence)/i,
  /^\s*(자동\s?응답|자동\s?회신|부재중\s?알림)/,
  /(결제하신\s?내역|카드\s?승인|영수증\s?발행|payment\s?receipt)/i,
  /(cloud\s?mps|scan\s?to\s?(email|me)|스캔\s?완료)/i,
  /(운송장\s?번호|배송\s?조회|tracking\s?number\s?is|shipment\s?notification)/i,
  /^\s*(undeliverable|delivery\s?(status|has\s?failed)|메일\s?발송\s?실패)/i,
  // 읽음 확인 — 상대 메일 클라이언트가 자동으로 보낸다. 사람 주소에서 오고
  // 제목이 원문 제목 그대로라 스레드에 섞여 들어온다. 내용은 "읽었습니다" 한 줄뿐이다.
  /^\s*(read:|읽음:|열람\s?확인)/i,
  /^\s*(수신\s?확인|delivered:)/i,
  // 인증번호·로그인 알림 — 어느 서비스에서 오든 기계 발송이고 읽는 순간 용도가 끝난다.
  /(인증\s?번호|인증\s?코드|verification\s?code|one[- ]?time\s?(password|code)|\bOTP\b)/i,
  /(로그인\s?(요청|알림|시도)|새로운\s?기기로\s?로그인|new\s?(sign[- ]?in|login|device))/i,
  // 시스템 상태 알림 — 사람이 답할 대상이 아니다
  /(시스템\s?(이상|장애|점검)|서버\s?점검|인증\s?(끊김|만료)|커넥터\s?인증)/,
];

/**
 * 사내 자동화가 보내는 알림 주소 — **주소 정확 일치** 목록.
 * 제목이 매번 달라 키워드로 못 잡고, gmail 주소라 도메인 차단도 못 쓴다.
 * 광고가 아니라 자동발송이므로 'system' 으로 라벨한다.
 */
function isSystemSender(address: string, settings: ClassifySettings): boolean {
  const list = settings.systemSenders || [];
  return list.some((s) => s && address === String(s).toLowerCase().trim());
}

/* ── 법정 광고 표기 (정보통신망법: 제목에 (광고) 표기 의무) ── */
const LEGAL_AD_MARK = /(^|\s)[[(（【]\s*(광고|廣告|AD|ad)\s*[)\]）】]/;

/* ── 대량 발송 서비스(ESP) 도메인 — 여기서 오면 개별 메일이 아니다 ── */
const ESP_DOMAINS = [
  'mailchimp.com', 'mcsv.net', 'mcdlv.net', 'rsgsv.net',
  'sendgrid.net', 'sendgrid.com', 'mailgun.org', 'mailgun.net',
  'amazonses.com', 'sendinblue.com', 'brevo.com',
  'stibee.com', 'mailerlite.com', 'constantcontact.com',
  'hubspot.com', 'hubspotemail.net', 'marketo.com', 'mktomail.com',
  'salesforce.com', 'exacttarget.com', 'pardot.com',
  'klaviyomail.com', 'klaviyo.com', 'activehosted.com',
  'campaign-archive.com', 'cmail19.com', 'createsend.com',
];

/* ── 마케팅 발송 시스템이 남기는 헤더 ── */
const CAMPAIGN_HEADERS = [
  'x-campaign', 'x-campaignid', 'x-mailchimp-id', 'x-sg-eid',
  'x-mailer-recptid', 'x-marketing', 'list-id', 'x-csa-complaints',
];

/* ── 본문/제목의 광고 문구 (약한 신호 · 누적) ── */
const AD_PHRASES: RegExp[] = [
  // 한국어
  /수신\s*거부/, /무료\s*수신거부/, /광고성\s*정보/, /마케팅\s*수신/,
  /무료\s*(체험|상담|진단|견적|샘플\s*신청)/, /지금\s*(신청|가입|구매|클릭)/,
  /한정\s*(수량|특가|기간)/, /특별\s*(할인|혜택|가격)/, /이벤트\s*(참여|안내)/,
  /프로모션/, /최대\s*\d+\s*%\s*(할인|절감|상승)/, /매출.{0,6}(\d+배|상승|증대)/,
  /상위\s*노출/, /검색\s*순위/, /바이럴/, /체험단/, /제휴\s*문의\s*환영/,
  /본\s*메일은.{0,20}(발송|전송)/, /더\s*이상\s*받지\s*않으/,
  // 영어
  /unsubscribe/i, /opt[- ]?out/i, /manage\s+(your\s+)?preferences/i,
  /view\s+(this\s+)?(email\s+)?in\s+(your\s+)?browser/i,
  /you\s+(are\s+)?receiv(e|ing)\s+this\s+(email|message)\s+because/i,
  /limited\s+time\s+offer/i, /act\s+now/i, /click\s+here\s+to/i,
  /free\s+(trial|demo|consultation|audit|quote)/i,
  /boost\s+your\s+(sales|revenue|traffic|ranking|seo)/i,
  /grow\s+your\s+business/i, /special\s+(offer|discount|promotion)/i,
  /\b\d{1,3}%\s*off\b/i, /no\s+longer\s+wish\s+to\s+receive/i,
];

/* ── 발신자 이름의 광고 신호 ── */
const AD_SENDER_NAME =
  /(marketing|newsletter|news|promo|sales\s*team|noreply|no\s*reply|마케팅|뉴스레터|홍보|프로모션)/i;

/** 헤더 맵에서 값 꺼내기 (parse.ts 가 담아준 것 + 원본 headers 양쪽 지원) */
function headerValue(mail: ClassifyInput, key: string): string {
  const h: Record<string, any> = mail.headers || {};
  const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return h[key] || h[camel] || '';
}

/**
 * @returns null 이면 규칙으로 판정 불가 → AI 분석 대상
 */
export function ruleClassify(mail: ClassifyInput, settings: ClassifySettings = {}): RuleResult | null {
  const subject = mail.subject || '';
  const body = (mail.raw?.text || '').slice(0, 8000);
  const text = `${subject}\n${body}`;
  const address = (mail.from?.address || '').toLowerCase();
  const senderName = mail.from?.name || '';
  const domain = address.split('@')[1] || '';

  const hits: string[] = [];
  let score = 0;

  /* ── 1. 자동발송 (광고와 구분해서 라벨) ── */
  if (isSystemSender(address, settings)) {
    return {
      classification: 'system', classifiedBy: 'rule',
      reason: `사내 자동발송 주소(${address})`, confident: true, score: 0,
    };
  }

  // 제목이 자동발송 문구면 발신 주소가 사람 주소여도 자동발송이다.
  const autoSubject = AUTO_SUBJECT.find((r) => r.test(subject));
  if (autoSubject) {
    return {
      classification: 'system', classifiedBy: 'rule',
      reason: `자동발송 제목(${subject.slice(0, 20)})`, confident: true, score: 0,
    };
  }

  if (SYSTEM_SENDER.test(address) || headerValue(mail, 'auto-submitted')) {
    // 자동발송 주소이면서 광고 문구가 있으면 광고로 본다
    const adish = LEGAL_AD_MARK.test(subject) || AD_PHRASES.some((r) => r.test(text));
    if (!adish) {
      return {
        classification: 'system', classifiedBy: 'rule',
        reason: '자동발송 주소', confident: true, score: 0,
      };
    }
    hits.push('자동발송 주소');
    score += 2;
  }

  /* ── 2. 강한 신호 — 하나만 걸려도 광고 확정 ── */

  if (LEGAL_AD_MARK.test(subject)) {
    return {
      classification: 'ad', classifiedBy: 'rule',
      reason: '제목에 법정 광고 표기', confident: true, score: 99,
    };
  }

  const blockedDomains = settings.blockedDomains || [];
  const hitDomain = blockedDomains.find(
    (d) => d && (domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`)),
  );
  if (hitDomain) {
    return {
      classification: 'ad', classifiedBy: 'rule',
      reason: `차단 도메인(${hitDomain})`, confident: true, score: 99,
    };
  }

  const blockedKeywords = settings.blockedKeywords || [];
  const hitKeyword = blockedKeywords.find(
    (k) => k && subject.toLowerCase().includes(String(k).toLowerCase()),
  );
  if (hitKeyword) {
    return {
      classification: 'ad', classifiedBy: 'rule',
      reason: `제목 키워드(${hitKeyword})`, confident: true, score: 99,
    };
  }

  const hitEsp = ESP_DOMAINS.find((d) => domain === d || domain.endsWith(`.${d}`));
  if (hitEsp) {
    return {
      classification: 'ad', classifiedBy: 'rule',
      reason: `대량발송 서비스(${hitEsp})`, confident: true, score: 99,
    };
  }

  /* ── 3. 약한 신호 — 누적 점수 ── */

  // 수신거부 헤더: 대량 발송의 강한 신호지만 거래처 뉴스레터일 수 있다
  const listUnsub = headerValue(mail, 'list-unsubscribe');
  if (listUnsub) { hits.push('수신거부 헤더'); score += 3; }

  if (/^(bulk|list|junk)$/i.test(headerValue(mail, 'precedence'))) {
    hits.push('대량발송 헤더'); score += 2;
  }

  const hitCampaign = CAMPAIGN_HEADERS.find((h) => headerValue(mail, h));
  if (hitCampaign) { hits.push(`캠페인 헤더(${hitCampaign})`); score += 3; }

  const phraseHits = AD_PHRASES.filter((r) => r.test(text)).length;
  if (phraseHits) {
    hits.push(`광고 문구 ${phraseHits}개`);
    score += Math.min(phraseHits, 4);
  }

  if (AD_SENDER_NAME.test(senderName)) { hits.push('발신자명 광고성'); score += 1; }

  // 본문 대비 링크가 지나치게 많다 (전형적인 홍보 메일)
  const links = (body.match(/https?:\/\//g) || []).length;
  if (links >= 8 && body.length < 4000) { hits.push(`링크 ${links}개`); score += 2; }

  // 수신자에 내 주소가 To 에 없다 (BCC 대량 발송)
  const toList = (mail.to || []).map((t) => t.address).filter(Boolean);
  if (toList.length === 0) { hits.push('수신자 미표기(BCC 발송)'); score += 2; }

  /* ── 4. 판정 ── */
  if (score >= 5) {
    return {
      classification: 'ad', classifiedBy: 'rule',
      reason: hits.join(' · '), confident: true, score,
    };
  }
  if (score >= 3) {
    // 애매한 구간 — 뉴스레터로 라벨하되 확정하지 않고 AI 에게 최종 판단을 넘긴다
    return {
      classification: 'newsletter', classifiedBy: 'rule',
      reason: hits.join(' · '), confident: false, score,
    };
  }

  return null; // 규칙으로 판정 불가 → AI 분석 대상
}

/** 규칙 결과로 AI 분석을 건너뛸지 판단 */
export function shouldAnalyze(ruleResult: RuleResult | null): boolean {
  if (!ruleResult) return true;          // 규칙으로 판정 못 함 → AI
  return ruleResult.confident !== true;  // 확정된 광고/시스템만 스킵
}
