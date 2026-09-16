/**
 * 잘못된 형식으로 쓰인 threadKey 를 앱이 만드는 형식으로 되돌린다.
 *
 * ── 무슨 일이 있었나 ──
 * 앱은 src/lib/mail/thread.ts 의 threadKey() 로 키를 만든다:
 *     `${group || 보낸사람도메인}::${접두어 벗긴 제목(소문자)}`
 * 그런데 내가 짠 정리 스크립트 두 개(fix-threads-and-ads.mjs,
 * move-ads-to-folder.mjs)가 `g:폴더|s:제목` 이라는 **다른 형식**으로 덮어썼다.
 * 두 형식은 절대 같아질 수 없어서, 손댄 메일은 새 메일이 와도 같은 대화로
 * 묶이지 않는다. 실제로 54통이 이 상태이고 2건은 이미 쪼개져 있다.
 *
 * ── 어떻게 고치나 ──
 * 지금 저장된 group 과 제목으로 **앱과 같은 규칙**으로 키를 다시 만든다.
 *
 * ⚠️ 규칙을 손으로 옮겨 적었으므로, 옮긴 것이 맞는지부터 증명한다.
 *    이미 앱이 만들어 둔 정상 키(422통)의 **제목 부분**을 내 함수로 다시 만들어
 *    전부 일치하는지 본다. 한 건이라도 어긋나면 고치지 않고 멈춘다 —
 *    규칙이 틀린 채로 470통을 덮는 것이 지금 상태보다 훨씬 나쁘다.
 *
 * --apply 없이 돌리면 검증과 미리보기만 한다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');

// ── src/lib/mail/thread.ts 를 그대로 옮긴 것 (형식이 곧 계약이다) ──
const REPLY_PREFIX =
  /^\s*(re|ans|aw|sv|vs|vb|fw|fwd|rv|tr|답장|회신|전달|전송|참조)\s*(\[\d+\])?\s*[:：]\s*/i;

function normalizeSubject(subject = '') {
  let s = String(subject).trim();
  for (let i = 0; i < 30; i++) {
    const next = s.replace(REPLY_PREFIX, '');
    if (next === s) break;
    s = next.trim();
  }
  return s
    .replace(/\s+/g, ' ')
    .replace(/[「」『』]/g, '')
    .trim()
    .toLowerCase();
}

function threadKey(mail) {
  const subj = normalizeSubject(mail?.subject || '');
  if (!subj) return `id:${mail?.messageId || 'unknown'}`;
  const scope = mail?.group || (mail?.from?.address || '').split('@')[1] || '';
  return `${scope}::${subj}`;
}

await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');

const rows = await M.find({ trashedAt: null })
  .project({ threadKey: 1, subject: 1, group: 1, from: 1, messageId: 1 }).toArray();

// ── ① 옮겨 적은 규칙이 맞는지 증명한다 ──
//
// 정상 키는 `scope::제목` 이다. scope 는 그 뒤에 폴더가 바뀌었을 수 있어
// 지금 값과 다를 수 있지만, **제목 부분은 제목에서만 나오므로** 달라질 이유가 없다.
// 그래서 제목 부분이 전부 맞는지로 규칙을 검증한다.
const appStyle = rows.filter((r) => r.threadKey && !r.threadKey.startsWith('id:') && r.threadKey.includes('::'));
let checked = 0;
const mismatch = [];
for (const r of appStyle) {
  const storedSubj = r.threadKey.slice(r.threadKey.indexOf('::') + 2);
  const mine = normalizeSubject(r.subject || '');
  checked++;
  if (storedSubj !== mine) mismatch.push({ subject: r.subject, stored: storedSubj, mine });
}

console.log('── ① 규칙 검증 ──');
console.log(`  앱이 만든 정상 키 ${checked}통의 제목 부분을 내 함수로 다시 만들어 비교`);
console.log(`  일치 ${checked - mismatch.length}통 · 불일치 ${mismatch.length}통`);
if (mismatch.length) {
  console.log('\n  ⚠ 규칙이 다릅니다. 고치지 않고 멈춥니다.');
  for (const m of mismatch.slice(0, 8)) {
    console.log(`     제목   : ${String(m.subject).slice(0, 60)}`);
    console.log(`     저장된 : ${m.stored}`);
    console.log(`     내 함수: ${m.mine}\n`);
  }
  await mongoose.disconnect();
  process.exit(1);
}
console.log('  ✅ 규칙이 같습니다 — 진행해도 됩니다.\n');

// ── ② 고칠 대상 ──
const bad = rows.filter((r) => r.threadKey && r.threadKey.startsWith('g:') && r.threadKey.includes('|s:'));
console.log('── ② 고칠 대상 ──');
console.log(`  잘못된 형식 ${bad.length}통\n`);

const plan = bad.map((r) => ({ _id: r._id, subject: r.subject, group: r.group, from: r.from, old: r.threadKey, next: threadKey(r) }));

// 고친 뒤 몇 개의 대화로 묶이는가 — 기존 정상 키와 합쳐지는 것까지 센다
const merged = new Map();
for (const p of plan) {
  if (!merged.has(p.next)) merged.set(p.next, { mine: 0, existing: 0 });
  merged.get(p.next).mine++;
}
for (const [k, v] of merged) {
  v.existing = await M.countDocuments({ trashedAt: null, threadKey: k });
}

for (const [k, v] of merged) {
  const sample = plan.find((p) => p.next === k);
  console.log(`  "${String(sample.subject || '').slice(0, 48)}"`);
  console.log(`     ${v.mine}통 → ${k.slice(0, 64)}`);
  console.log(`     ${v.existing ? `기존 ${v.existing}통과 합쳐짐  ✔ 쪼개진 대화 복구` : '새 대화 (합쳐질 것 없음)'}`);
}

if (!APPLY) {
  console.log('\n(미리보기입니다. 고치려면 --apply)');
  await mongoose.disconnect();
  process.exit(0);
}

// ── ③ 적용 ──
// 되돌릴 수 있게 이전 값을 먼저 남긴다
const fs = await import('node:fs');
const backup = plan.map((p) => ({ _id: String(p._id), old: p.old, next: p.next }));
fs.writeFileSync('scripts/.threadkey-backup.json', JSON.stringify(backup, null, 1), 'utf8');
console.log(`\n이전 값 ${backup.length}건을 scripts/.threadkey-backup.json 에 남겼습니다.`);

const CHUNK = 200;
let fixed = 0;
for (let i = 0; i < plan.length; i += CHUNK) {
  const ops = plan.slice(i, i + CHUNK).map((p) => ({
    updateOne: { filter: { _id: p._id }, update: { $set: { threadKey: p.next } } },
  }));
  fixed += (await M.bulkWrite(ops)).modifiedCount;
}
console.log(`\n고침 ${fixed}통`);

// ── ④ 확인 ──
const after = await M.find({ trashedAt: null }).project({ threadKey: 1 }).toArray();
const stillBad = after.filter((r) => r.threadKey && r.threadKey.startsWith('g:') && r.threadKey.includes('|s:')).length;
const keys = new Set(after.map((r) => r.threadKey));
console.log(`\n── 확인 ──`);
console.log(`  잘못된 형식 남은 것 ${stillBad}통 ${stillBad === 0 ? '✅' : '⚠'}`);
console.log(`  전체 대화 수 ${keys.size}개 (고치기 전 ${new Set(rows.map((r) => r.threadKey)).size}개)`);

await mongoose.disconnect();
