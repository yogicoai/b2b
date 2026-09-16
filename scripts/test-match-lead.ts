/**
 * Phase 3 검증 — 답장 → 리드 매칭 E2E 테스트 (실 DB 사용).
 *
 * 실행: npm run test:match-lead
 *
 * 임시 리드를 만들어 4가지 매칭 경로와 오탐 방지 가드를 확인한 뒤 반드시 정리한다.
 * 콜드메일 대량 발송 환경에서 자동응답이 '답장 옴'으로 잡히면 리드 목록이
 * 통째로 오염되므로, 그 가드가 실제로 도는지가 이 테스트의 핵심이다.
 */
import mongoose from 'mongoose';
import { Lead } from '../src/models/Lead';
import { matchLead, shouldMoveToReplied } from '../src/lib/mail/match-lead';

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI 없음'); process.exit(1); }

let pass = 0;
let fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n     기대: ${JSON.stringify(expected)}\n     실제: ${JSON.stringify(actual)}`); }
}

// 테스트 전용 식별자 — 정리할 때 이 접두어로 지운다
const P = 'phase3-test-';
const SENT_MSGID = '<cold-mail-abc123@yogico.kr>';

async function setup() {
  await Lead.create([
    {
      leadId: `${P}alpha`,
      Company: 'Alpha K-Beauty Shop',
      Region: 'Spain',
      Email: 'buyer@alpha-kbeauty-test.es',
      WebsiteContact: 'https://alpha-kbeauty-test.es',
      stage: 'contacted',
      emailHistory: [{
        subject: 'K-beauty partnership inquiry',
        to: 'buyer@alpha-kbeauty-test.es',
        sentAt: new Date().toISOString(),
        status: 'sent',
        messageId: SENT_MSGID,
      }],
    },
    {
      leadId: `${P}partner`,
      Company: 'Partner Corp',
      Region: 'Italy',
      Email: 'ceo@partner-test.it',
      stage: 'partner',   // 이미 최종 단계 — 되돌아가면 안 된다
      emailHistory: [{
        subject: 'deal',
        to: 'ceo@partner-test.it',
        sentAt: new Date().toISOString(),
        status: 'sent',
        messageId: '<partner-msg@yogico.kr>',
      }],
    },
    // 같은 도메인에 리드 2개 — 도메인 매칭이 특정 불가로 판단해야 한다
    { leadId: `${P}dup1`, Company: 'Dup One', Region: 'France', Email: 'a@dup-test.fr', stage: 'contacted' },
    { leadId: `${P}dup2`, Company: 'Dup Two', Region: 'France', Email: 'b@dup-test.fr', stage: 'contacted' },
    // 도메인 유일 — 담당자가 바뀐 경우를 잡아야 한다
    { leadId: `${P}solo`, Company: 'Solo Ltd', Region: 'Poland', Email: 'old@solo-test.pl', stage: 'contacted' },

    // ── 중복 정리 잔재 (2026-09-09 실측 버그 회귀 케이스) ──
    // 같은 이메일로 partner 1건 + 중복정리로 archived 된 사본 2건이 공존한다.
    // 매칭이 archived 사본을 고르면 그게 'replied' 로 되살아나고,
    // 정작 partner 는 답장을 못 받는다. 반드시 keeper(partner) 를 골라야 한다.
    {
      leadId: `${P}keeper`, Company: 'Dup Keeper Corp', Region: 'Turkey',
      Email: 'contact@dupkeeper-test.com', WebsiteContact: 'https://dupkeeper-test.com',
      stage: 'partner',
    },
    {
      leadId: `${P}loser1`, Company: 'Dup Keeper Corp', Region: 'Turkey',
      Email: 'contact@dupkeeper-test.com', WebsiteContact: 'https://dupkeeper-test.com',
      stage: 'archived', dedupArchivedAt: new Date().toISOString(),
      dedupOriginalStage: 'partner', dedupKeeperLeadId: `${P}keeper`,
    },
    {
      leadId: `${P}loser2`, Company: 'Dup Keeper Corp', Region: 'Turkey',
      Email: 'contact@dupkeeper-test.com', WebsiteContact: 'https://dupkeeper-test.com',
      stage: 'archived', dedupArchivedAt: new Date().toISOString(),
      dedupOriginalStage: 'partner', dedupKeeperLeadId: `${P}keeper`,
    },
  ]);
}

async function cleanup() {
  await Lead.deleteMany({ leadId: new RegExp(`^${P}`) });
}

async function main() {
  await mongoose.connect(URI!);
  await cleanup();   // 이전 실행 잔여물 제거
  await setup();

  console.log('\n════ 매칭 경로 ════');
  {
    const r = await matchLead({ inReplyTo: SENT_MSGID, from: { address: 'someone-else@random.com' } });
    check('1) In-Reply-To 로 정확 매칭 (발신 주소가 달라도)', [r?.leadId, r?.matchedBy], [`${P}alpha`, 'in-reply-to']);
  }
  {
    // 꺾쇠 없는 형태로 와도 매칭돼야 한다 (서버마다 다르다)
    const r = await matchLead({ inReplyTo: 'cold-mail-abc123@yogico.kr', from: { address: 'x@y.com' } });
    check('1-b) 꺾쇠 없는 Message-ID 도 정규화되어 매칭', r?.leadId, `${P}alpha`);
  }
  {
    const r = await matchLead({
      references: ['<unrelated@other.com>', SENT_MSGID],
      from: { address: 'x@y.com' },
    });
    check('2) References 체인으로 매칭', [r?.leadId, r?.matchedBy], [`${P}alpha`, 'references']);
  }
  {
    const r = await matchLead({ from: { address: 'buyer@alpha-kbeauty-test.es' } });
    check('3) 발신 주소 = Lead.Email 매칭', [r?.leadId, r?.matchedBy], [`${P}alpha`, 'email-address']);
  }
  {
    const r = await matchLead({ from: { address: 'BUYER@Alpha-KBeauty-Test.ES' } });
    check('3-b) 대소문자 무시', r?.leadId, `${P}alpha`);
  }
  {
    // 담당자가 바뀌어 다른 주소로 답장 — 도메인이 유일하면 잡는다
    const r = await matchLead({ from: { address: 'newperson@solo-test.pl' } });
    check('4) 도메인 매칭 (리드가 유일할 때)', [r?.leadId, r?.matchedBy], [`${P}solo`, 'domain']);
  }

  console.log('\n════ 오탐 방지 ════');
  {
    const r = await matchLead({ from: { address: 'someone@dup-test.fr' } });
    check('같은 도메인에 리드 2개 → 매칭 안 함 (엉뚱한 리드 오염 방지)', r, null);
  }
  {
    const r = await matchLead({ from: { address: 'random@gmail.com' } });
    check('개인 메일 도메인은 도메인 매칭 제외', r, null);
  }
  {
    const r = await matchLead({ from: { address: 'nobody@totally-unknown-xyz.com' } });
    check('전혀 모르는 곳 → null (정상 케이스)', r, null);
  }

  console.log('\n════ 중복 정리 잔재 (실측 회귀) ════');
  {
    const r = await matchLead({ from: { address: 'contact@dupkeeper-test.com' } });
    check('archived 사본이 아니라 keeper(partner) 를 고름', [r?.leadId, r?.stage], [`${P}keeper`, 'partner']);
    check('keeper 가 partner 이므로 승격하지 않음',
      shouldMoveToReplied(r?.stage, 'b2b', 'in'), false);
  }
  {
    // 도메인 매칭에서도 사본 때문에 "여러 개" 로 보여 놓치면 안 된다
    const r = await matchLead({ from: { address: 'newperson@dupkeeper-test.com' } });
    check('도메인 매칭도 사본을 합쳐 keeper 를 고름', r?.leadId, `${P}keeper`);
  }

  console.log('\n════ stage 승격 가드 ════');
  check('정상 답장 → 승격', shouldMoveToReplied('contacted', 'b2b', 'in'), true);
  check('부재중 자동응답(system) → 승격 안 함', shouldMoveToReplied('contacted', 'system', 'in'), false);
  check('광고(ad) → 승격 안 함', shouldMoveToReplied('contacted', 'ad', 'in'), false);
  check('뉴스레터 → 승격 안 함', shouldMoveToReplied('contacted', 'newsletter', 'in'), false);
  check('우리가 보낸 메일(out) → 승격 안 함', shouldMoveToReplied('contacted', 'b2b', 'out'), false);
  check('이미 partner → 되돌리지 않음', shouldMoveToReplied('partner', 'b2b', 'in'), false);
  check('이미 negotiating → 되돌리지 않음', shouldMoveToReplied('negotiating', 'b2b', 'in'), false);
  check('이미 replied → 중복 승격 안 함', shouldMoveToReplied('replied', 'b2b', 'in'), false);
  check('verified 에서도 승격 가능 (발송 전 답장)', shouldMoveToReplied('verified', 'b2b', 'in'), true);

  await cleanup();
  const left = await Lead.countDocuments({ leadId: new RegExp(`^${P}`) });
  check('정리 완료 — 테스트 리드 잔여 0건', left, 0);

  console.log(`\n════ 결과: ${pass} 통과 / ${fail} 실패 ════\n`);
  await mongoose.disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('테스트 오류:', e);
  try { await cleanup(); await mongoose.disconnect(); } catch {}
  process.exit(1);
});
