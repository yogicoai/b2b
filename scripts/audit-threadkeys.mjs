/**
 * DB 의 threadKey 가 앱이 만드는 형식과 같은지 본다.
 *
 * 왜:
 * 앱은 src/lib/mail/thread.ts 의 threadKey() 로 키를 만든다 — `scope::제목`.
 * 그런데 내가 짠 정리 스크립트(fix-threads-and-ads.mjs · move-ads-to-folder.mjs)는
 * `g:폴더|s:제목` 이라는 **다른 형식**으로 썼다. 두 형식은 절대 같아질 수 없다.
 *
 * 그 스크립트를 --apply 로 돌린 적이 있으므로, 손댄 메일은
 *   · 다음에 같은 대화의 메일이 들어와도 앱이 만든 키와 안 맞아
 *   · 한 대화가 영영 둘로 쪼개진 채 남는다.
 *
 * 여기서는 고치지 않고 **얼마나 어긋났는지만** 센다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');

const rows = await M.find({ trashedAt: null })
  .project({ threadKey: 1, subject: 1, group: 1, groupBy: 1, from: 1, messageId: 1 }).toArray();

let appStyle = 0, scriptStyle = 0, idStyle = 0, none = 0, other = 0;
const bad = [];
for (const r of rows) {
  const k = r.threadKey;
  if (!k) { none++; continue; }
  if (k.startsWith('id:')) { idStyle++; continue; }
  if (k.startsWith('g:') && k.includes('|s:')) { scriptStyle++; bad.push(r); continue; }
  if (k.includes('::')) { appStyle++; continue; }
  other++;
}

console.log('── threadKey 형식 분포 ──');
console.log(`  앱 형식  scope::제목      ${appStyle}통`);
console.log(`  ⚠ 스크립트 형식 g:…|s:…  ${scriptStyle}통   ← 앱이 절대 다시 못 만드는 키`);
console.log(`  id: 형식 (제목 없음)      ${idStyle}통`);
console.log(`  키 없음                   ${none}통`);
console.log(`  기타                      ${other}통`);
console.log(`  합계                      ${rows.length}통`);

if (!scriptStyle) {
  console.log('\n✅ 어긋난 키 없음 — 스크립트가 실제로 적용되지 않았거나 이미 덮였습니다.');
  await mongoose.disconnect();
  process.exit(0);
}

// 어긋난 키가 실제로 대화를 쪼갰는지 — 같은 정규 제목인데 키가 둘 이상인 경우
const RP = /^\s*(re|ans|aw|sv|vs|vb|fw|fwd|rv|tr|답장|회신|전달|전송|참조)\s*(\[\d+\])?\s*[:：]\s*/i;
const norm = (s = '') => {
  let x = String(s).trim();
  for (let i = 0; i < 30; i++) { const n = x.replace(RP, ''); if (n === x) break; x = n.trim(); }
  return x.replace(/\s+/g, ' ').replace(/[「」『』]/g, '').trim().toLowerCase();
};
/** thread.ts 와 **같은** 규칙으로 다시 만들어 본 키 */
const appKey = (r) => {
  const subj = norm(r.subject || '');
  if (!subj) return `id:${r.messageId || 'unknown'}`;
  const scope = r.group || String(r.from?.address || '').split('@')[1] || '';
  return `${scope}::${subj}`;
};

console.log(`\n── 어긋난 ${bad.length}통이 어느 대화에 속하는가 ──`);
const split = new Map();
for (const r of bad) {
  const want = appKey(r);
  if (!split.has(want)) split.set(want, []);
  split.get(want).push(r);
}
let alsoHasAppStyle = 0;
for (const [want, list] of split) {
  const sibling = await M.countDocuments({ trashedAt: null, threadKey: want });
  if (sibling > 0) alsoHasAppStyle++;
  console.log(`  ${list.length}통  "${String(list[0].subject || '').slice(0, 46)}"`);
  console.log(`        폴더 ${list[0].group || '미분류'} · 앱이 만들 키로는 ${sibling}통이 이미 따로 있음${sibling > 0 ? '  ⚠ 쪼개짐' : ''}`);
}
console.log(`\n  → 실제로 대화가 쪼개진 건: ${alsoHasAppStyle}건`);
console.log(`  → 아직 안 쪼개졌지만 다음 메일이 오면 쪼개질 건: ${split.size - alsoHasAppStyle}건`);

await mongoose.disconnect();
