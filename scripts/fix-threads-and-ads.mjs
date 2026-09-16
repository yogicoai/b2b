/**
 * ① 광고·자동발송 메일을 전용 폴더로 모은다
 * ② 같은 대화가 폴더 때문에 쪼개진 것을 하나로 합친다
 *
 * ── ① 왜 광고 폴더인가 ──
 * 광고·자동발송은 거래처 폴더 어디에도 안 들어가 [미분류]에 계속 쌓인다.
 * 그러면 "미분류에 진짜 볼 것이 있나" 를 볼 때마다 광고를 헤집게 된다.
 * 지우지 않고 한 폴더로 모아 두면, 미분류에는 **판단이 필요한 것만** 남는다.
 *
 * ── ② 왜 대화가 쪼개졌나 ──
 * 스레드 키 = 정규화한 제목 + 거래처 폴더 다.
 * 접두어(Re:RE: …)는 19겹까지 잘 벗겨진다 — 그건 문제가 아니었다.
 *
 * 문제는 폴더가 **나중에** 붙는다는 것이다. 같은 대화라도
 *   · 처음 수집될 땐 폴더가 없어 '(미분류)' 로 키가 잡히고
 *   · 나중에 폴더가 붙으면 '사업개발' 로 다른 키가 잡힌다
 * 그래서 한 대화가 목록에 두세 줄로 나뉘어 "이 건이 어디까지 왔나" 를 못 본다.
 * (lib/mail/thread.ts 주석이 경고하던 바로 그 상황이다)
 *
 * 고치는 방법: 같은 정규화 제목이면 **가장 많이 쓰인 폴더 하나로 몰아** 키를 다시 계산한다.
 *
 * --apply 없이 돌리면 무엇이 바뀌는지만 보여준다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const AD_FOLDER = '광고·자동발송';
const NOISE = ['ad', 'system', 'newsletter'];

const RP = /^\s*(re|ans|aw|sv|vs|vb|fw|fwd|rv|tr|답장|회신|전달|전송|참조)\s*(\[\d+\])?\s*[:：]\s*/i;
const norm = (s = '') => {
  let x = String(s).trim();
  for (let i = 0; i < 30; i++) { const n = x.replace(RP, ''); if (n === x) break; x = n.trim(); }
  return x.replace(/\s+/g, ' ').replace(/[「」『』]/g, '').trim().toLowerCase();
};
/**
 * ⚠️ src/lib/mail/thread.ts 의 threadKey() 와 **글자 하나까지 같아야** 한다.
 *
 * 전에 여기서 `g:폴더|s:제목` 이라는 제 나름의 형식을 썼다가 54통을 망쳤다.
 * 앱은 `scope::제목` 으로 만들기 때문에, 이 스크립트가 손댄 메일은
 * 새 메일이 와도 같은 대화로 안 묶였다 (2건은 실제로 쪼개져 있었다).
 * 스레드 키는 형식 자체가 계약이다 — 비슷하게 만들면 안 되고 같아야 한다.
 *
 * scope 는 폴더이고, 폴더가 없으면 **보낸 사람의 도메인**이다. 이 폴백까지 같아야 한다.
 */
const keyOf = (subject, group, messageId, fromAddress) => {
  const s = norm(subject);
  if (!s) return `id:${messageId || 'unknown'}`;
  const scope = group || String(fromAddress || '').split('@')[1] || '';
  return `${scope}::${s}`;
};

await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');

// ── ① 광고 폴더로 모으기 ──
const adFilter = {
  trashedAt: null,
  direction: 'in',
  classification: { $in: NOISE },
  // 사람이 직접 넣어둔 폴더는 건드리지 않는다
  $or: [{ group: { $in: [null, ''] } }, { group: { $exists: false } }],
};
const adCount = await M.countDocuments(adFilter);
const byCls = await M.aggregate([
  { $match: adFilter },
  { $group: { _id: '$classification', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();

console.log(`① 광고 폴더로 모을 메일: ${adCount}통`);
for (const c of byCls) console.log(`     ${String(c._id).padEnd(12)} ${c.n}통`);
console.log(`   → 폴더 "${AD_FOLDER}" 로 이동 (미분류에서 빠집니다)`);

// ── ② 쪼개진 대화 합치기 ──
const rows = await M.find({ trashedAt: null })
  .project({ subject: 1, group: 1, threadKey: 1, messageId: 1, from: 1 }).toArray();

const bySubj = new Map();
for (const r of rows) {
  const n = norm(r.subject);
  if (!n) continue;
  if (!bySubj.has(n)) bySubj.set(n, []);
  bySubj.get(n).push(r);
}

const merges = [];
const skippedNamed = [];   // 서로 다른 거래처 폴더라 손대지 않은 것
for (const [subj, list] of bySubj) {
  const keys = new Set(list.map((r) => r.threadKey || ''));
  if (keys.size < 2) continue;

  const tally = new Map();
  for (const r of list) {
    const g = r.group || '';
    tally.set(g, (tally.get(g) || 0) + 1);
  }

  // 이름 있는 폴더들 (미분류 제외)
  const named = [...tally.entries()].filter(([g]) => g).sort((a, b) => b[1] - a[1]);

  // ⚠️ 서로 다른 **이름 있는 폴더** 두 개 이상이면 건드리지 않는다.
  //
  // 예: 같은 계약서 제목이 [Orchesta Israel] 과 [Schestowitz Israel] 에 나뉘어 있다.
  // 사람이 일부러 거래처별로 나눠둔 것일 수 있고, 한쪽으로 몰면 남의 폴더에서
  // 메일이 사라진다. 자동으로 판단할 일이 아니다.
  if (named.length > 1) {
    skippedNamed.push({ subj, folders: named.map(([g, n]) => `${g}(${n})`) });
    continue;
  }

  // 이름 있는 폴더가 하나라도 있으면 **무조건 그쪽**으로 몬다.
  // 개수로 고르면 미분류가 더 많을 때 애써 분류해둔 메일이 미분류로 끌려간다.
  const win = named.length ? named[0][0] : '';
  const newKey = keyOf(subj, win, list[0].messageId, list[0].from?.address);
  const changed = list.filter((r) => r.threadKey !== newKey);
  if (changed.length) {
    merges.push({ subj, win, total: list.length, changed, folders: [...tally.keys()] });
  }
}

console.log(`\n② 폴더 때문에 쪼개진 대화: ${merges.length}건`);
for (const m of merges.slice(0, 8)) {
  console.log(`     "${m.subj.slice(0, 44)}" (${m.total}통)`);
  console.log(`        ${m.folders.map((f) => f || '(미분류)').join(' / ')}  →  ${m.win || '(미분류)'}`);
}
if (merges.length > 8) console.log(`     … 외 ${merges.length - 8}건`);

console.log(`
   손대지 않은 대화: ${skippedNamed.length}건 (서로 다른 거래처 폴더에 나뉘어 있음)`);
for (const s2 of skippedNamed.slice(0, 5)) console.log(`     "${s2.subj.slice(0,40)}"  ${s2.folders.join(' / ')}`);

if (!APPLY) {
  console.log('\n(미리보기입니다. 실제로 바꾸려면 --apply 를 붙이세요)');
  await mongoose.disconnect();
  process.exit(0);
}

// 적용 ①
let adMoved = 0;
if (adCount) {
  const r = await M.updateMany(adFilter, {
    $set: { group: AD_FOLDER, groupBy: 'auto-ad' },
  });
  adMoved = r.modifiedCount;
}

// 적용 ② — 폴더와 스레드 키를 함께 맞춘다
let fixed = 0;
for (const m of merges) {
  const newKey = keyOf(m.subj, m.win, m.changed[0].messageId, m.changed[0].from?.address);
  const ids = m.changed.map((r) => r._id);
  const r = await M.updateMany(
    { _id: { $in: ids } },
    { $set: { threadKey: newKey, group: m.win || '' } },
  );
  fixed += r.modifiedCount;
}

console.log(`\n── 결과 ──`);
console.log(`  광고 폴더로 이동   ${adMoved}통`);
console.log(`  대화 합치기        ${merges.length}건 · 메일 ${fixed}통`);

// 확인
const left = await M.countDocuments({
  trashedAt: null, direction: 'in',
  $or: [{ group: { $in: [null, ''] } }, { group: { $exists: false } }],
});
const keys = new Set((await M.find({ trashedAt: null }).project({ threadKey: 1 }).toArray())
  .map((r) => r.threadKey));
console.log(`\n  미분류에 남은 메일 ${left}통 (판단이 필요한 것만 남습니다)`);
console.log(`  전체 대화 수       ${keys.size}개`);

await mongoose.disconnect();
