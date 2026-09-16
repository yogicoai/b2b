/**
 * 기존 데이터 중복 정리.
 *
 * 두 가지를 구분한다 — 섞으면 실제 회사를 잃는다.
 *
 *  (A) 진짜 중복 : 같은 이메일 + 회사명도 사실상 같음
 *                 → 정보가 가장 많은 1건만 남기고 나머지 숨김
 *  (B) 오염된 이메일 : 이메일 하나가 서로 다른 회사 여러 곳에 붙어 있음
 *                 (dev7561@gmail.com 이 이집트·키프로스·부르키나파소 회사에 동시에)
 *                 → 회사는 진짜지만 주소가 틀린 것이다. 지우지 않고
 *                   '발송 불가'로만 표시한다. 주소를 다시 찾으면 살아난다.
 *
 * 어느 쪽도 DB 에서 지우지 않는다. dupHiddenAt / badEmailAt 를 지우면 되돌아온다.
 */
import mongoose from 'mongoose';
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
await mongoose.connect(uri);
const L = mongoose.connection.db.collection('leads');

const RX = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const norm = e => String(e||'').trim().toLowerCase();
const nc = s => String(s||'').toLowerCase()
  .replace(/[—–].*$/,'').replace(/\(.*?\)/g,'')
  .replace(/\b(gmbh|ltd|limited|inc|llc|s\.?r\.?o\.?|s\.?l\.?|b\.?v\.?|a\/s|ab|as|oy|sas|sarl|spa|srl|co|corp|company|group|kft)\b/g,'')
  .replace(/[^a-z0-9가-힣]/g,'').trim();
const rich = l => ['Company','Region','WebsiteContact','Phone','Evidence','Sources','BrandsChannels','Type']
  .reduce((n,k)=>n+(String(l[k]||'').trim()?1:0),0) + String(l.Evidence||'').length/1000;

const all = (await L.find({ importBatch:{$not:/^ai-search-/} }).toArray())
  .filter(l => RX.test(norm(l.Email)) && !l.dupHiddenAt && !l.badEmailAt);
console.log(`대상 ${all.length}건\n`);

const byEmail = new Map();
for (const l of all) { const e = norm(l.Email); (byEmail.get(e) || byEmail.set(e,[]).get(e)).push(l); }

const hide = [];   // (A) 진짜 중복
const bad  = [];   // (B) 오염된 이메일
let keptA = 0, badGroups = 0;

for (const [email, list] of byEmail) {
  if (list.length === 1) continue;
  // 이 주소를 쓰는 '서로 다른 회사'가 몇 곳인가
  const names = new Set(list.map(l => nc(l.Company)).filter(Boolean));
  if (names.size >= 3) {
    // 회사가 3곳 이상이면 주소 쪽이 틀린 것이다 (한 회사의 표기 흔들림이 아니다)
    badGroups++;
    for (const l of list) bad.push({ l, email, n: names.size });
    continue;
  }
  // 같은 회사의 중복 → 정보가 가장 많은 1건만 남긴다
  const sorted = [...list].sort((a,b) => rich(b)-rich(a) || String(a.leadId).localeCompare(String(b.leadId)));
  keptA++;
  for (const l of sorted.slice(1)) hide.push({ l, keeper: sorted[0] });
}

console.log('=== (A) 진짜 중복 — 1건만 남기고 숨김 ===');
console.log(`  ${keptA}개 묶음 · 숨길 ${hide.length}건`);
for (const {l,keeper} of hide.slice(0,5))
  console.log(`   숨김: ${String(l.Company).slice(0,44).padEnd(46)} → 남김: ${String(keeper.Company).slice(0,40)}`);

console.log('\n=== (B) 오염된 이메일 — 회사는 살리고 주소만 발송불가 표시 ===');
console.log(`  ${badGroups}개 주소 · ${bad.length}건이 걸림 (서로 다른 회사들)`);
const byAddr = {};
for (const b of bad) byAddr[b.email] = (byAddr[b.email]||0)+1;
for (const [e,n] of Object.entries(byAddr).sort((a,b)=>b[1]-a[1]).slice(0,6))
  console.log(`   ${e.padEnd(34)} ${n}개 회사에 붙어 있음`);

const left = all.length - hide.length - bad.length;
console.log('\n=== 정리 후 ===');
console.log(`  숨김(진짜 중복)     : ${hide.length}`);
console.log(`  발송불가(주소 오염) : ${bad.length}`);
console.log(`  남는 발송 가능      : ${left}`);

if (!APPLY) { console.log('\n[미적용] --apply 로 반영'); await mongoose.disconnect(); process.exit(0); }

const now = new Date();
const ops = [
  ...hide.map(({l,keeper}) => ({ updateOne: { filter:{_id:l._id}, update:{ $set:{
    dupHiddenAt: now, dupKeeperLeadId: keeper.leadId,
    dupHideReason: `이메일·회사명이 같은 중복 (대표: ${String(keeper.Company).slice(0,60)})`,
  }}}})),
  ...bad.map(({l,email,n}) => ({ updateOne: { filter:{_id:l._id}, update:{ $set:{
    badEmailAt: now,
    badEmailReason: `주소 ${email} 가 서로 다른 회사 ${n}곳에 붙어 있음 — 이 회사의 주소가 아닐 가능성이 높음`,
  }}}})),
];
for (let i=0;i<ops.length;i+=500) {
  const r = await L.bulkWrite(ops.slice(i,i+500));
  console.log(`  적용 ${Math.min(i+500,ops.length)}/${ops.length}`);
}
console.log('완료');
await mongoose.disconnect();
