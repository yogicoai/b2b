/**
 * 실제 거래처와 주고받은 메일이 '광고'로 잘못 찍힌 것을 찾아 되돌린다.
 *
 * 왜 지금 하나:
 * 수집 규칙을 바꿔서, 프로그램이 추측한 폴더에 있는 광고는 광고 폴더로 옮긴다.
 * 그러면 **잘못 광고로 찍힌 실제 상담 메일**도 같이 빨려 들어간다.
 * 규칙을 켜기 전에 오분류를 먼저 걷어내야 한다.
 *
 * ── 무엇을 오분류로 보나 ──
 * 같은 발신자에게서 **업무 메일로 확정된 것**도 온 적이 있다면, 그 주소는
 * 광고 발송처가 아니라 거래 상대다. 그런 사람이 보낸 메일이 광고로 찍혔으면
 * 규칙/AI 가 틀렸을 가능성이 높다.
 *
 * ⚠️ "업무 메일로 확정된 것" 을 제대로 골라야 한다.
 *    처음에는 `classification ∉ {ad,newsletter,system}` 으로 잡았는데,
 *    그러면 **아직 분류하지 않은 메일(unknown · classifiedBy 없음, 128통)**
 *    까지 업무 메일로 세어 버린다. 실제로 그 기준으로는 쿠팡 자동알림
 *    (no_reply@coupang.com) 과 우리 에이전트가 우리에게 보내는 내부 리포트
 *    (yogico.ai@gmail.com) 가 "거래 상대" 로 잡혔다 — 형제 메일이 전부
 *    unknown 이었기 때문이다.
 *    그래서 **판정을 거쳐 업무로 확정된 것만** 센다: b2b · partner · inquiry.
 *
 * 또 하나: 자동발송 주소(no_reply, noreply, donotreply …)와 우리 자신이
 * 보낸 주소는 애초에 후보에서 뺀다. 사람이 답장할 수 있는 주소가 아니다.
 *
 * --apply 없이 돌리면 무엇이 바뀌는지만 보여준다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');

/** 사람이 주고받은 업무 메일로 **확정된** 분류값 */
const REAL_BUSINESS = ['b2b', 'partner', 'inquiry'];
/** 광고로 찍혀 있어 되돌림 대상이 될 수 있는 분류값 (system 은 제외 — 읽음확인·부재중은 실제로 자동발송이 맞다) */
const SUSPECT = ['ad', 'newsletter'];
/** 사람이 쓰는 주소가 아닌 것 */
const ROBOT = /(^|[._-])(no[._-]?reply|donotreply|do[._-]?not[._-]?reply|mailer[-_]?daemon|postmaster|notifications?|alerts?|bounce)@|@(mails?|email|mailer|notifications?)\./i;

const selfAddrs = new Set(
  (await M.distinct('from.address', { direction: 'out' })).filter(Boolean).map((a) => String(a).toLowerCase()),
);

const cand = await M.find({ trashedAt: null, direction: 'in', classification: { $in: SUSPECT } })
  .project({ subject: 1, from: 1, group: 1, groupBy: 1, classification: 1, classifiedBy: 1 }).toArray();

const hits = [];
const skipped = [];
for (const r of cand) {
  const addr = String(r.from?.address || '').toLowerCase();
  if (!addr) continue;

  if (ROBOT.test(addr)) { skipped.push({ ...r, why: '자동발송 주소' }); continue; }
  if (selfAddrs.has(addr)) { skipped.push({ ...r, why: '우리가 보내는 주소' }); continue; }

  // 같은 사람에게서 **업무로 확정된** 메일이 있는가
  const real = await M.countDocuments({
    trashedAt: null, direction: 'in', 'from.address': r.from.address,
    classification: { $in: REAL_BUSINESS },
  });
  if (real > 0) hits.push({ ...r, realFromSameSender: real });
  else skipped.push({ ...r, why: '같은 주소에 업무로 확정된 메일 없음' });
}

console.log(`광고/뉴스레터로 찍힌 메일 ${cand.length}통 검사\n`);
console.log(`되돌릴 것 ${hits.length}통:`);
for (const h of hits) {
  console.log(`  [${h.classification}/${h.classifiedBy || '-'}] ${String(h.from.address).padEnd(32)} 업무확정 ${h.realFromSameSender}통`);
  console.log(`      폴더: ${h.group || '미분류'} (${h.groupBy || '-'})`);
  console.log(`      제목: ${String(h.subject || '').slice(0, 66)}`);
}

console.log(`\n건드리지 않는 것 ${skipped.length}통:`);
const byWhy = {};
for (const s of skipped) (byWhy[s.why] ||= []).push(s);
for (const [why, list] of Object.entries(byWhy)) {
  console.log(`  · ${why} — ${list.length}통`);
  for (const s of list.slice(0, 4)) console.log(`       ${String(s.from?.address || '?').padEnd(32)} ${String(s.subject || '').slice(0, 50)}`);
  if (list.length > 4) console.log(`       … 외 ${list.length - 4}통`);
}

if (!hits.length) { console.log('\n되돌릴 것 없음'); await mongoose.disconnect(); process.exit(0); }
if (!APPLY) { console.log('\n(미리보기입니다. 되돌리려면 --apply)'); await mongoose.disconnect(); process.exit(0); }

// 되돌린다 — 분류만 바꾼다. 폴더(group)는 손대지 않는다.
//
// 왜 폴더는 그대로 두나: 이 메일들은 이미 거래처 폴더에 잘 들어가 있다.
// 문제는 "광고로 찍혀 있다" 는 것뿐이고, 그래서 새 수집 규칙이 돌 때
// 광고 폴더로 쓸려 갈 위험이 있는 것이다. 분류만 고치면 그 위험이 사라진다.
//
// ⚠️ 'other' 를 쓰면 안 된다. 처음에 그렇게 짰다가 검증에서 잡혔다.
//    classification 은 정해진 값만 쓰는 칸이다 (models/InboundMail.ts 의 enum).
//    'other' 는 거기 없어서
//      · 화면 이름표가 MAIL_CLASS 에 없어 '· 미분류' 로 떨어지는데
//      · 정작 [미분류] 단추는 classification=unknown 으로 걸러서 못 찾는다
//        → "미분류라고 적혀 있는데 미분류에서 안 보이는 메일" 이 된다
//      · 나중에 mongoose 로 저장할 때 enum 검사에 걸릴 수도 있다
//    (이 스크립트는 드라이버로 직접 써서 그 검사를 건너뛴다 — 그래서 더 위험하다)
//
// 대신 b2b 로 되돌린다. 같은 주소에서 온 20통이 이미 b2b 이고,
// 본문도 상대 대표가 직접 쓴 회신이다. 근거 있는 값이다.
const before = hits.map((h) => ({ _id: h._id, classification: h.classification, classifiedBy: h.classifiedBy }));
console.log('\n되돌리기 전 상태 (문제 생기면 이 값으로 복구):');
console.log(JSON.stringify(before, null, 1));

/** models/InboundMail.ts 의 enum 과 반드시 같아야 한다 */
const ALLOWED = ['b2b', 'inquiry', 'partner', 'newsletter', 'ad', 'system', 'unknown'];
const TO = 'b2b';
if (!ALLOWED.includes(TO)) {
  console.log(`\n⚠ '${TO}' 는 쓸 수 없는 분류값입니다. 멈춥니다. (가능: ${ALLOWED.join(', ')})`);
  await mongoose.disconnect();
  process.exit(1);
}

const r = await M.updateMany(
  { _id: { $in: hits.map((h) => h._id) } },
  { $set: { classification: TO, classifiedBy: 'fix-misclassified' } },
);
console.log(`\n되돌림 ${r.modifiedCount}통 → classification: '${TO}'`);

// 확인 — 정말 바뀌었나, 폴더는 그대로인가
for (const h of hits) {
  const now = await M.findOne({ _id: h._id }, { projection: { subject: 1, classification: 1, group: 1 } });
  const folderOk = (now.group || '') === (h.group || '');
  console.log(`  ${now.classification === TO ? 'OK ' : 'X  '} ${String(now.subject).slice(0, 44)}`);
  console.log(`      분류 ${h.classification} → ${now.classification} · 폴더 ${folderOk ? '그대로' : '⚠ 바뀜!'} (${now.group || '미분류'})`);
}
await mongoose.disconnect();
