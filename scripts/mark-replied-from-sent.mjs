/**
 * 이미 답장한 메일을 '회신함'으로 표시한다.
 *
 * 회신 필요·기한 관리에 뜨는 받은 메일 중 절반 가까이는 **이미 답장이 나간 것**이었다.
 * 이카운트 웹메일에서 직접 답하면 앱은 모른다. 다행히 보낸메일함도 함께 수집하고 있어서,
 * 보낸 메일 쪽에 증거가 남아 있다.
 *
 * ── 무엇을 '답장했다'로 보나 (셋 다 맞아야 한다) ──
 *   ① 보낸 메일이 받은 메일보다 **뒤에** 있다
 *   ② 보낸 메일의 받는 사람(to·cc)에 받은 메일을 보낸 주소가 들어 있다
 *   ③ 제목에서 Re:/SV:/FW: 를 뗀 것이 같다
 * 같은 사람과 다른 건으로 주고받은 메일이 섞이지 않게 제목까지 맞춘다.
 *
 * status 만 'replied' 로 바꾸고 repliedOutside:true 를 남긴다 (화면에 '✅ 회신함 (웹메일)').
 * 되돌리기 목록을 파일로 남긴다. --apply 없이 돌리면 미리보기만.
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
const APPLY = process.argv.includes('--apply');

// thread.ts 의 접두어 규칙과 같게
const RP = /^\s*(re|ans|aw|sv|vs|vb|fw|fwd|rv|tr|답장|회신|전달|전송|참조)\s*(\[\d+\])?\s*[:：]\s*/i;
const norm = (s = '') => {
  let x = String(s).trim();
  for (let i = 0; i < 30; i++) { const n = x.replace(RP, ''); if (n === x) break; x = n.trim(); }
  return x.replace(/\s+/g, ' ').replace(/[「」『』]/g, '').trim().toLowerCase();
};

await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');

const pending = await M.find({
  trashedAt: null, direction: 'in', status: { $ne: 'replied' },
  $or: [{ 'analysis.needsReply': true }, { 'analysis.deadline': { $ne: null } }],
}).project({ subject: 1, from: 1, date: 1, 'analysis.needsReply': 1, 'analysis.deadline': 1, accountId: 1 }).toArray();

const hits = [];
for (const m of pending) {
  const addr = String(m.from?.address || '').toLowerCase();
  const subj = norm(m.subject);
  if (!addr || !subj) continue;
  const cands = await M.find({
    direction: 'out', trashedAt: null, date: { $gt: m.date },
    $or: [{ 'to.address': new RegExp(`^${addr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { 'cc.address': new RegExp(`^${addr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }],
  }).project({ subject: 1, date: 1, from: 1 }).sort({ date: 1 }).toArray();
  const reply = cands.find((c) => norm(c.subject) === subj);
  if (reply) hits.push({ m, reply });
}

console.log(`회신 필요/기한 걸린 받은 메일 ${pending.length}통 중 이미 답장한 것 ${hits.length}통\n`);
const kst = (d) => new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
for (const { m, reply } of hits) {
  console.log(`  ${String(m.subject).slice(0, 46).padEnd(46)} ${String(m.from.address).padEnd(30)}`);
  console.log(`     받음 ${kst(m.date)} → 답장 ${kst(reply.date)} (${reply.from?.address})`);
}

if (!APPLY) { console.log('\n(미리보기 — 적용하려면 --apply)'); await mongoose.disconnect(); process.exit(0); }

fs.writeFileSync('scripts/.mark-replied-0914.json', JSON.stringify(hits.map(({ m }) => String(m._id)), null, 1));
let n = 0;
for (const { m, reply } of hits) {
  const r = await M.updateOne({ _id: m._id }, { $set: { status: 'replied', repliedOutside: true, repliedAt: reply.date } });
  n += r.modifiedCount;
}
console.log(`\n'회신함'으로 표시 ${n}통 · 되돌리기 목록 scripts/.mark-replied-0914.json`);
await mongoose.disconnect();
