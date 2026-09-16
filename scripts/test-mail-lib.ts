/**
 * Phase 2 이식 검증 — 순수 함수들이 원본(emailData)과 같게 동작하는지 확인.
 * 실행: npx ts-node -O "{\"module\":\"commonjs\"}" scripts/test-mail-lib.ts
 *
 * 이 함수들은 emailData 에서 실측으로 다듬어진 것들이라,
 * 이식 과정에서 깨지면 조용히 오분류가 난다. 대표 케이스를 고정해 둔다.
 */
import { stripQuoted, quotedRatio, stripQuotedForDisplay } from '../src/lib/mail/quoted';
import { detectLang } from '../src/lib/mail/parse';
import { normalizeSubject, threadKey, displaySubject } from '../src/lib/mail/thread';
import { ruleClassify, shouldAnalyze } from '../src/lib/mail/classify';
import { localAnalyze } from '../src/lib/mail/local-analyze';

let pass = 0;
let fail = 0;

function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n     기대: ${JSON.stringify(expected)}\n     실제: ${JSON.stringify(actual)}`); }
}

function checkTruthy(name: string, actual: any) {
  if (actual) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — falsy: ${JSON.stringify(actual)}`); }
}

console.log('\n════ quoted.ts — 인용부 제거 ════');
{
  // 새로 쓴 부분이 minKeep(80자) 이상이어야 실제로 잘린다 — 실무 답장의 일반적 길이
  const body = `안녕하세요, 담당자님.

말씀 주신 건 검토했습니다. 500개 초도 물량으로 진행하고 싶고,
FOB 조건과 리드타임을 확인 부탁드립니다. 샘플도 함께 받아볼 수 있을까요?

보낸 사람: David <david@yogico.kr>
보낸 날짜: 2026년 3월 1일
제목: Re: 견적 요청

이전 대화 내용이 여기 통째로 딸려옵니다.
Could you please send the quotation by March 20?`;
  const stripped = stripQuoted(body);
  checkTruthy('한국어 인용 헤더(보낸 사람:) 로 잘림', !stripped.includes('이전 대화 내용'));
  checkTruthy('새로 쓴 부분은 남음', stripped.includes('500개 초도 물량'));
  checkTruthy('quotedRatio > 0', quotedRatio(body) > 0);
}
{
  const en = `Hi David,

Thanks for reaching out. We are interested in your K-beauty line and would like
to receive your wholesale price list along with the MOQ for first order.

On Mon, Mar 3, 2026 at 10:00 AM David wrote:
> previous conversation
> more quoted text here padding padding padding`;
  const stripped = stripQuoted(en);
  checkTruthy('영어 "On ... wrote:" 로 잘림', !stripped.includes('previous conversation'));
  checkTruthy('새로 쓴 부분은 남음 (영어)', stripped.includes('wholesale price list'));
}
{
  // ── 가드 1: minKeep(80자) — 본문 대부분이 인용이면 원문을 그대로 쓴다.
  //    답장이 "네, 확인했습니다" 한 줄뿐이면 잘라내도 남는 게 없어 분석이 불가능해진다.
  //    (마커는 40자 뒤에 두어 가드2 에 걸리지 않게 하고, 남는 부분은 80자 미만으로)
  const newPart = '네, 말씀하신 조건으로 진행하겠습니다. 확인 감사드리며 다음 주에 연락드리겠습니다.';
  checkTruthy('가드1 전제: 새 부분이 40자 초과 80자 미만', newPart.length > 40 && newPart.length < 80);

  const shortReply = `${newPart}

보낸 사람: buyer@shop.es
보낸 날짜: 2026년 3월 1일

${'인용된 이전 대화입니다.'.repeat(40)}`;
  check('가드1: 남는 부분이 80자 미만이면 원문 유지', stripQuoted(shortReply), shortReply);
  checkTruthy('가드1: minKeep 을 낮추면 정상적으로 잘린다',
    !stripQuoted(shortReply, { minKeep: 5 }).includes('인용된 이전 대화'));
}
{
  // ── 가드 2: index > 40 — 맨 앞의 표식은 전달(FW) 메일의 헤더일 수 있으므로 무시한다.
  //    (여기서 자르면 전달 메일은 본문이 통째로 사라진다)
  const fwHeader = `보낸 사람: original@sender.com
보낸 날짜: 2026년 1월 1일

${'전달된 본문 내용입니다.'.repeat(20)}`;
  const markerIdx = fwHeader.search(/^보낸\s?사람:\s/im);
  checkTruthy('가드2 전제: 마커가 40자 이내에 있음', markerIdx >= 0 && markerIdx <= 40);
  check('가드2: 맨 앞 표식은 FW 헤더로 보고 자르지 않음', stripQuoted(fwHeader), fwHeader);
}

console.log('\n════ quoted.ts — 화면용 제거 (실제 답장 회귀) ════');
{
  // 2026-09-08 실측: leshwann@naver.com 이 보낸 실제 답장.
  // 새로 쓴 부분이 12자뿐이라 분석용 기준(minIndex 40 · minKeep 80)으로는
  // 인용문이 통째로 남았고, 그 탓에 한국어 답장이 영어로 오판됐다.
  const realReply = `메일을 테스트 진행중
-----Original Message-----
From: "요기코퍼레이션"<fe@yogico.kr>
To: <leshwann@naver.com>;
Cc:
Sent: 2026-09-08 (화) 16:33:08
Subject: K-beauty partnership inquiry

Hi Naver Beauty Test Co. team,
I am reaching out from Yogico regarding a potential K-beauty partnership.
We would love to discuss wholesale terms with you.`;

  check('화면용: 새로 쓴 부분만 남음', stripQuotedForDisplay(realReply), '메일을 테스트 진행중');
  checkTruthy('화면용: 인용문 제거됨', !stripQuotedForDisplay(realReply).includes('Original Message'));
  checkTruthy('분석용(기본값): 짧아서 원문 유지 — 의도된 동작', stripQuoted(realReply) === realReply);
  check('언어 감지: 화면용 본문 기준이면 한국어', detectLang(stripQuotedForDisplay(realReply)), 'ko');
  check('언어 감지: 인용문 포함이면 영어로 오판 (수정 전 동작)', detectLang(realReply), 'en');

  // 답장 제목은 우리가 보낸 영문 제목이 그대로 따라온다.
  // 제목을 언어 판정에 섞으면 짧은 한국어 답장이 영어로 잡힌다.
  const replySubject = 'RE: K-beauty partnership inquiry — Naver Beauty Test Co.';
  const body = stripQuotedForDisplay(realReply);
  check('언어 감지: 제목을 섞으면 오판', detectLang(`${replySubject}\n${body}`), 'en');
  check('언어 감지: 본문만 보면 정확', detectLang(body), 'ko');
}
{
  // 전달(FW) 메일 — 표지가 맨 앞이면 화면용 기준으로도 자르지 않아야 한다
  const fw = `-----Original Message-----
From: someone@partner.com
Sent: 2026-01-01

${'전달된 본문입니다.'.repeat(10)}`;
  checkTruthy('화면용: 표지가 맨 앞(전달메일)이면 자르지 않음', stripQuotedForDisplay(fw) === fw);
}

console.log('\n════ thread.ts — 스레드 묶기 ════');
check('Re: 여러 겹 제거', normalizeSubject('Re: Re: RE: Fw: [Yogico] 계약'), '[yogico] 계약');
check('북유럽 SV: 제거', normalizeSubject('SV: Order confirmation'), 'order confirmation');
check('한국어 회신: 제거', normalizeSubject('회신: 견적 문의'), '견적 문의');
check('displaySubject 는 대소문자 보존', displaySubject('Re: Re: Order Confirmation'), 'Order Confirmation');
{
  const a = threadKey({ subject: 'Re: 견적', group: 'MiiN Cosmetics', from: { address: 'x@miin.com' } });
  const b = threadKey({ subject: 'RE: RE: 견적', group: 'MiiN Cosmetics', from: { address: 'y@miin.com' } });
  check('같은 거래처 + 같은 제목 → 같은 스레드', a, b);

  const c = threadKey({ subject: 'Re: 견적', group: 'Venus Europe', from: { address: 'x@venus.com' } });
  checkTruthy('거래처가 다르면 다른 스레드', a !== c);

  const noSubj = threadKey({ subject: '', messageId: '<abc@x>' });
  check('제목 없으면 묶지 않음', noSubj, 'id:<abc@x>');
}

console.log('\n════ classify.ts — 규칙 필터 ════');
{
  const r = ruleClassify({ subject: '(광고) 특가 세일', from: { address: 'a@b.com' }, raw: { text: '' } });
  check('법정 광고표기 → ad 확정', [r?.classification, r?.confident], ['ad', true]);
}
{
  const r = ruleClassify({ subject: 'Out of Office: Re: Partnership', from: { address: 'buyer@miin.com' }, raw: { text: 'I am away' } });
  check('부재중 자동응답 → system (사람 주소여도)', [r?.classification, r?.confident], ['system', true]);
}
{
  const r = ruleClassify({ subject: '읽음: K-beauty partnership inquiry', from: { address: 'buyer@shop.es' }, raw: { text: '' } });
  check('읽음 확인 → system', r?.classification, 'system');
}
{
  const r = ruleClassify({ subject: 'Newsletter', from: { address: 'news@mailchimp.com' }, raw: { text: '' } });
  check('ESP 도메인 → ad 확정', [r?.classification, r?.confident], ['ad', true]);
}
{
  const r = ruleClassify({ subject: 'Hello', from: { address: 'noreply@shop.com' }, raw: { text: '주문이 접수되었습니다' } });
  check('noreply 주소 → system', r?.classification, 'system');
}
{
  // 진짜 바이어 문의 — 규칙으로 판정 불가 → AI 대상 (null)
  const r = ruleClassify({
    subject: 'Interested in your K-beauty line',
    from: { address: 'buyer@miin-cosmetics.com', name: 'Ana Garcia' },
    to: [{ address: 'david@yogico.kr' }],
    raw: { text: 'Hello, we would like to know your MOQ and FOB price. Could you send a quotation?' },
  });
  check('진성 바이어 문의 → 규칙 판정 불가(null)', r, null);
  check('shouldAnalyze(null) → true', shouldAnalyze(r), true);
}
{
  const r = ruleClassify({ subject: 'Special offer', from: { address: 'x@y.com' }, raw: { text: '' }, headers: { listUnsubscribe: '<mailto:u@y.com>' } });
  checkTruthy('수신거부 헤더는 점수만 (즉시 확정 아님)', r !== null);
}
{
  const r = ruleClassify(
    { subject: '무료체험 안내', from: { address: 'a@b.com' }, raw: { text: '' } },
    { blockedKeywords: ['무료체험'] },
  );
  check('사용자 차단 키워드 → ad 확정', [r?.classification, r?.confident], ['ad', true]);
}

console.log('\n════ local-analyze.ts — 로컬 1차 분석 ════');
{
  const a = localAnalyze({
    subject: 'Quotation request',
    raw: { text: 'Could you please send the quotation by March 20, 2026? We need it urgently.' },
    date: new Date('2026-03-01'),
  });
  checkTruthy('요청 표현 → needsReply', a.needsReply);
  checkTruthy('기한 추출됨', a.deadline !== null);
  check('기한이 3월 20일', a.deadline?.toISOString().slice(0, 10), '2026-03-20');
  checkTruthy('urgency 계산됨', ['high', 'mid', 'low'].includes(a.urgency));
}
{
  const a = localAnalyze({
    subject: '견적 문의',
    raw: { text: '2026년 4월 15일까지 회신 부탁드립니다. 단가와 MOQ 알려주세요.' },
    date: new Date('2026-04-01'),
  });
  checkTruthy('한국어 요청 → needsReply', a.needsReply);
  check('한국어 기한 추출', a.deadline?.toISOString().slice(0, 10), '2026-04-15');
}
{
  const a = localAnalyze({
    subject: '광고',
    raw: { text: 'Could you please buy now? Limited offer!' },
    classification: 'ad',
    date: new Date('2026-03-01'),
  });
  check('광고는 needsReply=false (요청 표현 있어도)', a.needsReply, false);
}
{
  const a = localAnalyze({
    subject: 'Newsletter',
    raw: { text: 'Please let us know your thoughts?' },
    headers: { listUnsubscribe: '<mailto:x@y.com>' },
    date: new Date('2026-03-01'),
  });
  check('대량 발송 헤더면 needsReply=false', a.needsReply, false);
}
{
  // 인용부의 옛 날짜를 이번 기한으로 오인하지 않는지 — 핵심 회귀 케이스
  const a = localAnalyze({
    subject: 'Re: old thread',
    raw: {
      text: `Thanks, noted.

On Mon, Jan 5, 2026 at 10:00 AM buyer wrote:
> Please confirm by January 10, 2026.
> This is the old deadline that must NOT be picked up as this reply's deadline.`,
    },
    date: new Date('2026-03-01'),
  });
  checkTruthy('인용부의 옛 기한을 이번 기한으로 잡지 않음', a.deadline === null || a.deadline.getTime() >= new Date('2026-02-28').getTime());
}
{
  const a = localAnalyze({
    subject: 'FYI',
    raw: { text: 'Just sharing the attached report for your records.' },
    date: new Date('2026-03-01'),
  });
  check('질문·요청 없으면 needsReply=false', a.needsReply, false);
}

console.log(`\n════ 결과: ${pass} 통과 / ${fail} 실패 ════\n`);
process.exit(fail > 0 ? 1 : 0);
