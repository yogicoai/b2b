/**
 * 기존 데이터(보관함) 안의 진짜 중복만 지운다.
 *
 * 왜 회사명만으로 지우면 안 되는가:
 * 같은 이름이 여러 건 있어도 실제로는 다른 업체인 경우가 있다.
 *   · "Kosmetrics"        → 브라질 / 칠레 / 멕시코 / 에콰도르 (지역별 지사)
 *   · "Ksisters"          → 이탈리아 / 포르투갈 / 오스트리아 / 싱가포르 / 헝가리
 *   · "ORION XO"          → contact@orionxoxo.lk / contact@orionbeauty.lk (다른 연락처)
 * 이름만 보고 지우면 이런 곳이 통째로 사라진다.
 *
 * 그래서 (회사명 + 이메일 + 지역) 가 모두 같을 때만 같은 건으로 본다.
 * 같은 파일을 여러 번 올려서 생긴 완전 사본이 그 대상이다.
 *
 * 남기는 기준: 가장 먼저 들어온 것(createdAt 오름차순 첫 건).
 * 지우는 방식: 실제 삭제가 아니라 deleted=true (되돌릴 수 있게).
 *
 * 사용:
 *   node scripts/dedup-legacy-safe.mjs           ← 미리보기만
 *   node scripts/dedup-legacy-safe.mjs --apply   ← 실제 적용
 */
import fs from 'fs';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const env = fs.readFileSync('.env.local', 'utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');

const c = new MongoClient(uri);
await c.connect();
const L = c.db().collection('leads');

// 기존 데이터 = 보관함이면서 'AI가 무관 판정' 이 아닌 것
const LEGACY = {
  deleted: { $ne: true },
  stage: 'archived',
  'verification.aiVerdict': { $ne: 'not-fit' },
};

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

const docs = await L.find(LEGACY, {
  projection: { Company: 1, Email: 1, Region: 1, WebsiteContact: 1, createdAt: 1, importBatch: 1 },
}).sort({ createdAt: 1 }).toArray();

console.log('기존 데이터 총', docs.length, '건');

const groups = new Map();
for (const d of docs) {
  const company = norm(d.Company);
  if (!company) continue;                       // 이름 없는 건은 건드리지 않는다
  const key = [company, norm(d.Email), norm(d.Region)].join('||');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(d);
}

const toDelete = [];
let dupGroups = 0;
for (const [, arr] of groups) {
  if (arr.length < 2) continue;
  dupGroups++;
  // createdAt 오름차순이라 첫 건이 가장 오래된 것 — 그것만 남긴다
  for (const d of arr.slice(1)) toDelete.push(d);
}

console.log('완전 사본 그룹:', dupGroups, '· 지울 여분:', toDelete.length);
console.log('정리 후 남는 건:', docs.length - toDelete.length);

console.log('\n=== 지워질 건 예시 (상위 10) ===');
const byName = new Map();
for (const d of toDelete) {
  const k = d.Company;
  byName.set(k, (byName.get(k) || 0) + 1);
}
[...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  .forEach(([n, cnt]) => console.log(`   ${String(cnt).padStart(3)}건 여분  ·  ${n}`));

if (!APPLY) {
  console.log('\n미리보기입니다. 실제로 적용하려면 --apply 를 붙이세요.');
  await c.close();
  process.exit(0);
}

const ids = toDelete.map((d) => d._id);
let done = 0;
for (let i = 0; i < ids.length; i += 500) {
  const r = await L.updateMany(
    { _id: { $in: ids.slice(i, i + 500) } },
    { $set: { deleted: true, deletedReason: '기존 데이터 중복 정리 (회사명·이메일·지역 동일)', deletedAt: new Date().toISOString() } },
  );
  done += r.modifiedCount;
}
console.log('\n정리 완료 —', done, '건을 삭제 처리했습니다 (deleted=true · 되돌릴 수 있음)');
console.log('남은 기존 데이터:', await L.countDocuments(LEGACY));
await c.close();
