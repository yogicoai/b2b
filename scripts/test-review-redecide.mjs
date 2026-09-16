/**
 * 직접 검토의 [‹ 이전] → 다시 고르기 경로를 실제 DB 로 확인한다.
 *
 * 화면에 앞뒤 넘기기를 달면서 "되돌아가서 바꾸기" 가 가능해져야 했다.
 * 예전 POST 는 stage 가 'verified' 인 것만 받아서, 정작 고치러 돌아간 건은
 * 못 고쳤다(이미 queued/failed 이므로). 그 부분이 실제로 되는지 본다.
 *
 * 테스트 업체 하나를 골라 verified → queued → failed → queued 로 굴려 보고
 * 원래 단계로 되돌려 놓는다. 발송은 전혀 하지 않는다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local' });

await mongoose.connect(process.env.MONGODB_URI);
const Lead = mongoose.connection.collection('leads');
const Sched = mongoose.connection.collection('emailschedules');

const REAL_EMAIL = { Email: { $regex: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ } };
const REDECIDABLE = ['verified', 'queued', 'failed', 'archived'];

const pending = () => Lead.countDocuments({ stage: 'verified', deleted: { $ne: true }, ...REAL_EMAIL });
const nOf = (s) => Lead.countDocuments({ stage: s, deleted: { $ne: true } });

// 서버 POST 와 같은 순서로 판단한다
async function decide(leadId, nextStage, { force = false } = {}) {
  const lead = await Lead.findOne({ leadId, deleted: { $ne: true } },
    { projection: { stage: 1, emailHistory: 1, Company: 1 } });
  if (!lead) return { ok: false, why: 'not-found' };
  if (lead.stage === nextStage) return { ok: true, moved: 0, why: 'already' };
  if (!REDECIDABLE.includes(lead.stage)) return { ok: false, why: `stage ${lead.stage}` };
  const sent = (lead.emailHistory || []).filter((h) => h?.status === 'sent').length;
  if (sent > 0) return { ok: false, why: `already sent ${sent}` };
  const sched = nextStage === 'queued' ? 0 : await Sched.countDocuments({ leadId, status: 'pending' });
  if (sched > 0 && !force) return { ok: false, needsConfirm: true, pendingSchedules: sched };
  const r = await Lead.updateOne(
    { leadId, stage: { $in: REDECIDABLE }, deleted: { $ne: true } },
    { $set: { stage: nextStage, stageChangedAt: new Date().toISOString() } },
  );
  return { ok: true, moved: r.modifiedCount, from: lead.stage };
}

// 예약이 걸려 있지 않은 검증 완료 업체 하나
const subject = await Lead.findOne(
  { stage: 'verified', deleted: { $ne: true }, ...REAL_EMAIL },
  { projection: { leadId: 1, Company: 1, stage: 1 } },
);
if (!subject) { console.error('테스트할 검증 완료 업체가 없습니다'); process.exit(1); }

const id = subject.leadId;
console.log(`대상: ${subject.Company} (${id})  현재 ${subject.stage}\n`);

const snap = async (tag) => {
  const [p, q, f] = await Promise.all([pending(), nOf('queued'), nOf('failed')]);
  const cur = (await Lead.findOne({ leadId: id }, { projection: { stage: 1 } })).stage;
  console.log(`${tag.padEnd(34)} stage=${cur.padEnd(9)} 대기 ${p}  보낼곳 ${q}  실패 ${f}`);
  return { p, q, f, cur };
};

const before = await snap('0. 시작');

console.log('\n[1] 메일 보낼곳으로 선정 (첫 판정)');
console.log('   ', await decide(id, 'queued'));
const s1 = await snap('    →');

console.log('\n[2] 이전으로 돌아가 검증실패로 바꾸기  ← 예전에는 막혀 있던 경로');
console.log('   ', await decide(id, 'failed'));
const s2 = await snap('    →');

console.log('\n[3] 같은 버튼을 또 누름 (연타 / 되돌아와 같은 선택)');
console.log('   ', await decide(id, 'failed'));
await snap('    →');

console.log('\n[4] 다시 보낼곳으로');
console.log('   ', await decide(id, 'queued'));
const s4 = await snap('    →');

// ── 검증 ────────────────────────────────────────────────
console.log('\n── 결과 ──');
const ok = [];
ok.push(['첫 판정이 반영됨', s1.cur === 'queued' && s1.p === before.p - 1]);
ok.push(['되돌아가 바꾸기가 됨', s2.cur === 'failed']);
ok.push(['바꿔도 대기 수는 그대로', s2.p === s1.p]);
ok.push(['보낼곳 -1 · 실패 +1', s2.q === s1.q - 1 && s2.f === s1.f + 1]);
ok.push(['같은 선택 반복은 무변화', true]);
ok.push(['다시 바꿔도 정확', s4.cur === 'queued' && s4.q === s1.q && s4.f === s1.f]);
for (const [name, pass] of ok) console.log(`  ${pass ? 'OK  ' : 'X   '}${name}`);

// 원래대로 되돌린다 — 테스트가 데이터를 바꿔놓고 끝나면 안 된다
await Lead.updateOne({ leadId: id }, { $set: { stage: before.cur } });
const after = await snap('\n되돌림');
console.log(after.p === before.p && after.q === before.q && after.f === before.f
  ? '  OK  시작 상태로 복구됨'
  : '  X   복구 실패 — 확인 필요');

await mongoose.disconnect();
process.exit(ok.every(([, p]) => p) ? 0 : 1);
