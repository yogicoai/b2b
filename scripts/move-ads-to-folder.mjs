/**
 * 폴더에 흩어져 있는 광고·자동발송 메일을 [광고·자동발송] 폴더로 모은다.
 *
 * 지난번 스크립트는 폴더가 **비어 있는** 것만 옮겼다. 그래서 거래처 폴더
 * 안으로 들어간 광고는 그대로 남았다. 이번에는 폴더가 있는 것도 옮긴다.
 *
 * 다만 "폴더가 있다" 에는 두 종류가 섞여 있다.
 *   ① 대표가 직접 넣은 것   groupBy = folder | manual
 *      → 이카운트 메일함에서 손수 그 폴더에 넣었거나, 화면에서 옮긴 것이다.
 *        사람이 내린 판단이라 자동으로 뒤집지 않는다.
 *   ② 프로그램이 추측한 것   groupBy = sender:* | name:* | (없음)
 *      → 발신자 이력이나 제목만 보고 찍은 것이라 틀릴 수 있다. 옮긴다.
 *
 * --apply 없이 돌리면 무엇이 바뀌는지만 보여준다.
 * --include-manual 을 붙이면 ① 까지 전부 옮긴다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const INCLUDE_MANUAL = process.argv.includes('--include-manual');
const AD_FOLDER = '광고·자동발송';
const AD_CLASSES = ['ad', 'system', 'newsletter'];

const RP = /^\s*(re|ans|aw|sv|vs|vb|fw|fwd|rv|tr|답장|회신|전달|전송|참조)\s*(\[\d+\])?\s*[:：]\s*/i;
const norm = (s = '') => {
  let x = String(s).trim();
  for (let i = 0; i < 30; i++) { const n = x.replace(RP, ''); if (n === x) break; x = n.trim(); }
  return x.replace(/\s+/g, ' ').replace(/[「」『』]/g, '').trim().toLowerCase();
};
/**
 * WARNING: src/lib/mail/thread.ts 의 threadKey() 와 글자 하나까지 같아야 한다.
 *
 * 전에 여기서 `g:폴더|s:제목` 이라는 제 나름의 형식을 썼다가 54통을 망쳤다.
 * 앱은 `scope::제목` 으로 만들기 때문에, 이 스크립트가 손댄 메일은
 * 새 메일이 와도 같은 대화로 안 묶였다 (2건은 실제로 쪼개져 있었다).
 * 스레드 키는 형식 자체가 계약이다 - 비슷하게가 아니라 같아야 한다.
 *
 * scope 는 폴더이고, 폴더가 없으면 보낸 사람의 도메인이다. 이 폴백까지 같아야 한다.
 */
const keyOf = (subject, group, messageId, fromAddress) => {
  const s = norm(subject);
  if (!s) return `id:${messageId || 'unknown'}`;
  const scope = group || String(fromAddress || '').split('@')[1] || '';
  return `${scope}::${s}`;
};

await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');

const HUMAN = ['folder', 'manual'];
const base = {
  trashedAt: null,
  direction: 'in',
  classification: { $in: AD_CLASSES },
  group: { $ne: AD_FOLDER },
};
const autoOnly = { ...base, groupBy: { $nin: HUMAN } };
// 자동발송으로 분류됐어도 **실제로 처리할 일**이 있는 메일은 옮기지 않는다.
// 예: 로그인 본인인증 변경 요청, 세금계산서 확인 요청. 광고 폴더에 들어가면 묻힌다.
// AI 분석이 급함(high)·보통(mid)으로 본 것은 제외하고, --include-actionable 로만 포함한다.
const INCLUDE_ACTIONABLE = process.argv.includes('--include-actionable');
const notActionable = { 'analysis.urgency': { $nin: ['high', 'mid'] } };
const target0 = INCLUDE_MANUAL ? base : autoOnly;
const target = INCLUDE_ACTIONABLE ? target0 : { ...target0, ...notActionable };

const nAll = await M.countDocuments(base);
const nAuto = await M.countDocuments(autoOnly);
const nHuman = nAll - nAuto;

console.log(`현재 [${AD_FOLDER}] 밖에 있는 광고성 메일: ${nAll}통`);
console.log(`  ├ 프로그램이 추측해 넣은 것 : ${nAuto}통  ← 옮긴다`);
console.log(`  └ 대표가 직접 넣은 것       : ${nHuman}통  ← ${INCLUDE_MANUAL ? '옮긴다 (--include-manual)' : '그대로 둔다'}`);

const byCls = await M.aggregate([{ $match: target }, { $group: { _id: '$classification', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
console.log('\n종류별:');
for (const c of byCls) console.log(`  ${String(c._id).padEnd(12)} ${c.n}통`);

const byGroup = await M.aggregate([
  { $match: { ...target, group: { $nin: [null, '', AD_FOLDER] } } },
  { $group: { _id: { g: '$group', by: '$groupBy' }, n: { $sum: 1 } } },
  { $sort: { n: -1 } }, { $limit: 15 },
]).toArray();
console.log('\n어느 폴더에서 빠지는가:');
if (!byGroup.length) console.log('  (폴더에 들어간 광고 없음 — 전부 미분류에 있던 것)');
for (const g of byGroup) console.log(`  ${String(g._id.g).padEnd(26)} ${String(g.n).padStart(4)}통   (${g._id.by || '추정없음'})`);

const rows = await M.find(target).project({ subject: 1, from: 1, group: 1, classification: 1 }).limit(10).toArray();
console.log('\n옮겨질 메일 예시:');
for (const r of rows) {
  console.log(`  [${String(r.classification).padEnd(10)}] ${String(r.group || '미분류').padEnd(20)} ${String(r.subject || '').slice(0, 44)}`);
}

if (!APPLY) {
  console.log('\n(미리보기입니다. 실제로 옮기려면 --apply 를 붙이세요)');
  await mongoose.disconnect();
  process.exit(0);
}

// 옮긴다 — 폴더가 바뀌면 스레드 키도 다시 만들어야 대화가 안 쪼개진다
const docs = await M.find(target).project({ subject: 1, messageId: 1, from: 1 }).toArray();
let moved = 0;
const CHUNK = 300;
for (let i = 0; i < docs.length; i += CHUNK) {
  const ops = docs.slice(i, i + CHUNK).map((d) => ({
    updateOne: {
      filter: { _id: d._id },
      update: { $set: { group: AD_FOLDER, groupBy: 'auto-ad', threadKey: keyOf(d.subject, AD_FOLDER, d.messageId, d.from?.address) } },
    },
  }));
  if (ops.length) moved += (await M.bulkWrite(ops)).modifiedCount;
}

console.log(`\n── 결과 ──`);
console.log(`  [${AD_FOLDER}] 로 옮김  ${moved}통`);
console.log(`  광고 폴더 전체          ${await M.countDocuments({ trashedAt: null, group: AD_FOLDER })}통`);
const left = await M.countDocuments({ trashedAt: null, direction: 'in', $or: [{ group: { $in: [null, ''] } }, { group: { $exists: false } }] });
console.log(`  미분류에 남은 메일      ${left}통`);
await mongoose.disconnect();
