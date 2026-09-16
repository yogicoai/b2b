/**
 * 오늘(2026-09-11) 온 메일 5통의 1차 분석 + 한글 번역을 DB 에 넣는다.
 *
 * Claude API 를 호출하지 않는다. 세션 안에서 본문을 직접 읽고 판단한 결과를
 * 그대로 채워 넣는다 — 이 프로젝트에서 계속 해온 방식이다(유료 호출 없이
 * 결과만 DB 에 넣는다). 그래서 analysis.method 는 'ai' 로 두되
 * model 에는 세션에서 했다는 것을 남겨, 나중에 누가 어떻게 넣었는지 알 수 있게 한다.
 *
 * 손으로 고친 분류는 재분석이 덮지 않는다는 규칙이 있으므로
 * classificationBy='manual' 로 표시한다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local' });

const NOW = new Date('2026-09-11T01:00:00Z');   // 분석 시각 (서울 10:00)
const MODEL = 'claude-opus-5 (세션 내 직접 분석 · API 미호출)';

const MAILS = [
  // ────────────────────────────────────────────────────────────────
  {
    id: '6aa334458f83165dc75d21de',
    subject: 'RE: Vegan Super - Projected Opening Order and Launch Plan',
    classification: 'b2b',
    group: 'Beauty Lyrics USA',
    analysis: {
      needsReply: true,
      replyReason: '상대가 (1) 수정된 주문 확인서 재발송 (2) 품절 4개 품목의 재입고 시점 — 두 가지를 명시적으로 요청했고, 인보이스 발행 전에 답이 있어야 한다고 못박았다.',
      urgency: 'high',
      topic: 'VEGANSUPER 미국 런칭 — 초도 주문 수량/금액 불일치 및 품절 품목 재입고 문의',
      summary:
        'Beauty Lyrics(미국)가 VEGANSUPER 초도 주문 스프레드시트를 검토한 결과, 확정수량이 0으로 바뀐 4개 품목이 여전히 금액·중량·물류비 계산에 들어가 있다고 지적. ' +
        '제품가만 약 USD $1,485.71 줄어야 하며, 인보이스 발행 전에 수정된 주문 확인서를 달라고 요청. ' +
        '또한 해당 4개 립 품목이 미국 런칭의 핵심이라, 재입고 시점에 따라 선적 일정을 맞추는 것까지 논의하고 싶다는 입장.',
      keyPoints: [
        '확정수량 0으로 바뀐 품목: Wave Tint B01 BALLINA(150→0), B06 SICHEL(150→0), Wave Lip Balm G01 SWAN(100→0), G02 YUKON(100→0)',
        '스프레드시트의 제품가·중량·통관비가 아직 원래 주문수량 기준 — 품절분 금액이 그대로 남아 있음',
        '제품가만 약 USD $1,485.71 감액 필요 (운임·관세·통관비는 별도 재계산)',
        '인보이스 발행 전에 수정된 주문 확인서(revised order confirmation)를 먼저 요청',
        '4개 품목이 립 카테고리 중심 런칭의 핵심 — 빠진 채로 시작하기보다 재입고에 맞춰 선적 조정을 선호',
        'TIME INTERNATIONAL 이 수출자·인보이스 발행 주체라는 점은 이해·수용함',
        'MoCRA 제조시설 등록 최종 확인서도 계속 기다리는 중 (미국 규제 준비 마무리에 필요)',
      ],
      intent: '인보이스를 받기 전에 수정된 주문 확인서와 4개 품절 품목의 재입고 일정을 받고 싶어 한다.',
      suggestedAction:
        '① 확정수량 기준으로 스프레드시트(제품가·중량·운임·관세) 재계산해 수정 주문 확인서 회신 ' +
        '② BALLINA·SICHEL·SWAN·YUKON 재입고 예정일 확인해 함께 전달 ' +
        '③ 재입고가 가깝다면 선적 일정 조정안을 같이 제시 ④ MoCRA 시설 등록 확인서 진행 상황 공유',
    },
    translation: {
      subject: 'RE: Vegan Super — 초도 주문 예상 물량 및 런칭 계획',
      body: [
        'Donghee 님께,',
        '',
        '업데이트와 TIME INTERNATIONAL 관련 내용을 정리해 주셔서 감사합니다. 이번 주문 건은 TIME INTERNATIONAL 이 수출자이자 인보이스 발행 주체가 되고, 대금도 그에 따라 지급된다는 점 이해했습니다.',
        '',
        '수정된 주문 스프레드시트를 검토했고, 최종 인보이스가 준비되기 전에 몇 가지 확인하고 싶은 항목이 있습니다.',
        '',
        '아래 품목들이 확정수량(Confirmed Qty) 칸에서 0으로 줄어든 것으로 보입니다.',
        '',
        '  · Wave Tint B01 BALLINA — 주문 150 / 확정 0',
        '  · Wave Tint B06 SICHEL — 주문 150 / 확정 0',
        '  · Wave Lip Balm G01 SWAN — 주문 100 / 확정 0',
        '  · Wave Lip Balm G02 YUKON — 주문 100 / 확정 0',
        '',
        '그런데 제품가(Product Cost)와 선적 중량, 그에 딸린 착지비용(landed cost) 계산은 여전히 수정된 확정수량이 아니라 원래 주문수량을 기준으로 잡혀 있는 것 같습니다. 그 결과 공급이 안 되는 물량의 금액이 아직 스프레드시트에 그대로 포함되어 있습니다.',
        '',
        '저희 계산으로는 운임·관세·통관 등 부대비용을 조정하기 전에, 제품가만으로도 약 USD $1,485.71 이 줄어야 합니다. 인보이스를 발행하시기 전에 스프레드시트를 다시 확인하시고 수정된 주문 확인서를 보내주실 수 있을까요?',
        '',
        '더 중요한 것은, BALLINA · SICHEL · SWAN · YUKON 의 재입고 예정 시점을 알려주실 수 있는지입니다.',
        '',
        '아시다시피 저희는 VEGANSUPER 를 미국 시장에 소개하면서 립 카테고리에 무게를 싣기로 전략적으로 결정했습니다. 이 4개 색상이 초도 구성에서 중요한 부분을 차지하기 때문에, 공급 가능 여부가 저희에게 특히 중요합니다.',
        '미국 시장에서의 첫날은 최대한 완벽에 가까워야 합니다. 런칭 시점에 웹사이트에 올라간 제품이나 색상이라면, 소비자가 그것을 발견하고 마음에 들어 하고 실제로 구매할 수 있어야 합니다.',
        '',
        '그런 이유로, 이 4개 색상이 합리적인 기간 안에 공급 가능해질 것으로 예상된다면, 핵심 색상이 빠진 채로 미국 런칭을 시작하기보다는 그 시점에 맞춰 선적을 조율하는 쪽을 논의하고 싶습니다.',
        '',
        '함께 최선의 결정을 내릴 수 있도록 예상 재입고 시점을 알려주시기 바랍니다.',
        '',
        '아울러 현재 MoCRA 제조시설 등록과 관련해 제조사 측에 확인해 주신 점도 감사합니다. 미국 규제 준비를 마무리하는 데 중요한 사항이라, 최종 확인서를 받기를 기다리고 있습니다.',
        '',
        '마무리가 가까워지고 있고, 저희도 이번 런칭을 진심으로 기대하고 있습니다. 다만 구성과 재고가 제대로 맞춰진 상태에서 시작하고 싶을 뿐입니다.',
      ].join('\n'),
    },
  },

  // ────────────────────────────────────────────────────────────────
  {
    id: '6aa334468f83165dc75d21df',
    subject: '(광고)(마감임박)[이노비즈협회]『2026 이노비즈데이』 유공자 포상 후보자 모집',
    classification: 'ad',
    analysis: {
      needsReply: false,
      replyReason: '회신을 요구하는 메일이 아니라 협회 홈페이지 온라인 접수 안내다. 다만 접수 마감이 오늘이다.',
      urgency: 'mid',
      topic: '이노비즈협회 — 2026 이노비즈데이 유공자 포상 후보자 모집 (오늘 마감)',
      summary:
        '이노비즈협회가 『2026 이노비즈데이』 유공자 포상 후보자를 모집한다는 단체 발송 공지. ' +
        '포상 분야는 기술혁신(대표/임직원), 기술혁신(지원기관), 일자리창출, 혁신조달 4개. ' +
        '접수는 협회 홈페이지 온라인으로 하며 마감이 오늘 09/11(금) 23:00 이다.',
      keyPoints: [
        '접수 마감 — 2026년 9월 11일(금) 23:00, 협회 홈페이지 온라인 접수',
        '포상 분야 4개 — 기술혁신(대표·임직원) / 기술혁신(지원기관 임직원) / 일자리창출(대표·임직원) / 혁신조달(단체)',
        '혁신조달 분야는 공공조달 5년 이상 실적 + 조달청 지정 혁신조달기업만 신청 가능',
        '문의 — 이노비즈협회 이헌준 부장 031-628-9620 / yhjoon@innobiz.or.kr',
        '첨부 2건 — 발송공문 PDF, 포상 계획안 HWP',
      ],
      intent: '포상 후보자로 신청할 회사를 모집한다.',
      suggestedAction: '신청 의사가 있으면 오늘 23:00 전에 협회 홈페이지에서 접수. 없으면 별도 조치 불필요.',
      deadline: new Date('2026-09-11T14:00:00Z'),   // 서울 09/11 23:00
      deadlineText: "'26.08.18(화) ~ 09.11(금) 23:00까지, 온라인 접수",
      deadlineType: 'event',
    },
  },

  // ────────────────────────────────────────────────────────────────
  {
    id: '6aa334478f83165dc75d21e0',
    subject: 'Re: Update on the Business Brand Management Consulting feature for Yogico',
    classification: 'ad',
    analysis: {
      needsReply: false,
      replyReason: '거래 문의가 아니라 유료 매체 기사(feature) 게재를 권유하는 영업 메일의 재촉(follow-up)이다. 답하지 않으면 대개 몇 번 더 오다 멈춘다.',
      urgency: 'low',
      topic: 'Business Management Review APAC — 기업 소개 기사 게재 권유 (재촉 메일)',
      summary:
        '앞서 보낸 제안 메일을 받았는지 확인하며 회신을 재촉하는 메일. ' +
        '내용 자체는 한 문단뿐이고, 본론은 이전 메일 체인을 참고하라는 것이다. ' +
        '발신 도메인(mails.businessmanagementreviewapac.com)과 문구로 보아 ' +
        '요기코를 다루는 유료 기사·인터뷰 게재를 권유하는 매체 영업으로 판단된다.',
      keyPoints: [
        '이전 제안 메일에 대한 회신 재촉 — 새로운 정보는 없음',
        '발신 도메인이 발송 전용 하위도메인(mails.*)으로 대량 발송 형태',
        '거래·구매 의사가 담긴 문의가 아니라 매체 게재 영업',
      ],
      intent: '이전에 보낸 기사 게재 제안에 답을 받고 싶어 한다.',
      suggestedAction: '대응 불필요. 광고로 분류해 두면 다음 재촉 메일도 자동으로 걸러진다.',
    },
    translation: {
      subject: 'Re: 요기코 관련 Business Brand Management 컨설팅 기사 건 안내',
      body: [
        '대진 님께,',
        '',
        '잘 지내고 계시길 바랍니다.',
        '',
        '이전에 보내드린 메일을 받아보셨는지 여쭙고자 연락드립니다. 아래 메일 내용을 참고하셔서 의견을 알려주시면 감사하겠습니다.',
        '',
        '회신 기다리겠습니다.',
        '',
        '감사합니다.',
        'Keira 드림',
      ].join('\n'),
    },
  },

  // ────────────────────────────────────────────────────────────────
  {
    id: '6aa334458f83165dc75d21dd',
    subject: "Daejin, you're on to something big",
    classification: 'ad',
    analysis: {
      needsReply: false,
      replyReason: '링크드인이 자사 광고 상품(Thought Leader Ads)을 권유하는 마케팅 메일이다.',
      urgency: 'low',
      topic: 'LinkedIn — Thought Leader Ads 광고 상품 권유',
      summary:
        '링크드인이 최근 올린 게시물을 광고(Thought Leader Ads)로 확장해 보라고 권유하는 마케팅 메일. ' +
        '단일 이미지 광고보다 참여율이 1.6배 높다는 수치와 사례를 담았다. 사람이 보낸 메일이 아니다.',
      keyPoints: [
        'LinkedIn 자사 광고 상품(Thought Leader Ads) 홍보',
        '단일 이미지 광고 대비 참여율 1.6배 주장',
        '수신자 맞춤 마케팅 발송 — 거래와 무관',
      ],
      intent: '링크드인 광고 상품을 구매하게 하려는 것.',
      suggestedAction: '대응 불필요.',
    },
  },

  // ────────────────────────────────────────────────────────────────
  {
    id: '6aa334448f83165dc75d21dc',
    subject: 'casino leads , forex leads , crypto leads , dating leads for sale',
    classification: 'ad',
    trash: true,
    analysis: {
      needsReply: false,
      replyReason:
        '카지노·외환·코인·데이팅 개인정보 데이터베이스를 파는 스팸이다. ' +
        '회신하지 말고 텔레그램으로 연락하라고 적혀 있고, 대금은 암호화폐만 받는다. ' +
        '절대 응답해서는 안 되는 종류의 메일이다.',
      urgency: 'low',
      topic: '불법 개인정보 DB 판매 스팸',
      summary:
        '이름·이메일·전화번호·주소가 담긴 개인정보 데이터베이스를 10만 건 $400 부터 700만 건 $7,000 까지 판매한다는 스팸. ' +
        '연락은 텔레그램으로만, 결제는 비트코인 등 암호화폐만 받는다고 적혀 있다. ' +
        '본문 끝에 스팸 필터를 흐리려는 무작위 문자열이 붙어 있다.',
      keyPoints: [
        '불법 수집으로 보이는 개인정보 DB 판매 — 응답 자체가 위험',
        '연락 수단이 텔레그램뿐이고 결제는 암호화폐만 — 추적을 피하려는 전형적 형태',
        '"이 메일에 답장하지 말라"고 명시 — 발신 주소는 위조일 가능성이 높다',
        '본문 말미에 무작위 문자열(스팸 필터 회피용) 포함',
      ],
      intent: '개인정보 데이터베이스를 팔려는 것.',
      suggestedAction: '회신·클릭하지 말 것. 휴지통으로 옮겨 둔다.',
    },
  },
];

// ──────────────────────────────────────────────────────────────────
await mongoose.connect(process.env.MONGODB_URI);
const Mail = mongoose.connection.collection('inboundmails');

let ok = 0;
for (const m of MAILS) {
  const _id = new mongoose.Types.ObjectId(m.id);
  const cur = await Mail.findOne({ _id }, { projection: { subject: 1 } });
  if (!cur) { console.log(`X  못 찾음 ${m.id}`); continue; }

  // 점표기(analysis.summary)로 쓰지 않는다.
  // 이 컬렉션에는 translation 이 null 로 들어 있는 문서가 있어서
  // "Cannot create field 'body' in element {translation: null}" 로 막힌다.
  // 통째로 넣으면 null 이든 없든 상관없이 만들어진다.
  const set = {
    classification: m.classification,
    classificationBy: 'manual',     // 재분석이 덮지 않게
    analysis: {
      method: 'ai',
      needsReply: m.analysis.needsReply,
      replyReason: m.analysis.replyReason,
      urgency: m.analysis.urgency,
      topic: m.analysis.topic,
      summary: m.analysis.summary,
      keyPoints: m.analysis.keyPoints,
      intent: m.analysis.intent,
      suggestedAction: m.analysis.suggestedAction,
      analyzedAt: NOW,
      model: MODEL,
      deadline: m.analysis.deadline || null,
      deadlineText: m.analysis.deadlineText || '',
      deadlineType: m.analysis.deadlineType || null,
      // 유료 호출을 안 했으므로 토큰·비용은 0
      usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, model: MODEL, costKrw: 0 },
    },
  };
  if (m.group) { set.group = m.group; set.groupBy = 'manual'; }
  if (m.translation) {
    set.translation = {
      subject: m.translation.subject,
      body: m.translation.body,
      translatedAt: NOW,
    };
  }
  if (m.trash) { set.trashedAt = NOW; set.trashedReason = '개인정보 DB 판매 스팸'; }

  const r = await Mail.updateOne({ _id }, { $set: set });
  ok += r.modifiedCount;
  console.log(
    `OK ${m.classification.padEnd(4)} ${m.analysis.needsReply ? '회신필요' : '        '} ` +
    `${m.translation ? '번역O' : '번역-'} ${m.trash ? '휴지통' : '      '}  ${String(cur.subject).slice(0, 46)}`,
  );
}
console.log(`\n${ok}통 저장 완료`);

await mongoose.disconnect();
