/**
 * 검증대기(verifying) 584건을 배치 하나로 합치고, 보낼 수 있는 것만 발송대기(verified)로 올린다.
 *
 * 왜 전부 올리지 않는가:
 *   발송대기는 "승인하면 바로 나가는" 자리다. 이메일이 없거나 한 주소를 여러 회사가
 *   공유하는 건을 여기 두면, 클라이언트가 전체 승인을 눌렀을 때 같은 주소로 같은 메일이
 *   여러 통 나간다. 그건 스팸 신고와 발송 도메인 평판 손상으로 이어진다.
 *
 * 되돌리기: preMerge.stage / preMerge.batch 에 이전 값을 남긴다.
 *   db.leads.updateMany({'preMerge.at':{$ne:null}}, [{$set:{stage:'$preMerge.stage', importBatch:'$preMerge.batch'}}])
 */
import mongoose from 'mongoose';
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const NEW_BATCH = 'ai-search-20260908';

const env = fs.readFileSync('.env.local', 'utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
await mongoose.connect(uri);
const L = mongoose.connection.db.collection('leads');

const leads = await L.find({ stage: 'verifying' }).toArray();
console.log(`검증대기 총 ${leads.length}건\n`);

const norm = (e) => String(e || '').trim().toLowerCase();
const BAD = /(your|sample|dummy|placeholder|email@email|example\.com|test\.com)/i;
const looksEmail = (e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e);

// 주소별로 묶어 공유 여부를 본다
const byEmail = new Map();
for (const l of leads) {
  const e = norm(l.Email);
  if (!e) continue;
  if (!byEmail.has(e)) byEmail.set(e, []);
  byEmail.get(e).push(l);
}

// 정보가 더 많은 쪽을 대표로 남긴다
const richness = (l) => ['Company','Region','WebsiteContact','LinkedInCompany','Phone','BuyerContact','Evidence']
  .reduce((n, k) => n + (String(l[k] || '').trim() ? 1 : 0), 0);

const toVerified = [], toArchived = [];
const reason = new Map();

for (const l of leads) {
  const e = norm(l.Email);
  if (!e || !looksEmail(e)) { toArchived.push(l); reason.set(l.leadId, '이메일 없음/형식 오류'); continue; }
  if (BAD.test(e))          { toArchived.push(l); reason.set(l.leadId, '플레이스홀더 주소'); continue; }
  const peers = byEmail.get(e);
  if (peers.length > 1) {
    const keeper = [...peers].sort((a, b) => richness(b) - richness(a) || String(a.leadId).localeCompare(String(b.leadId)))[0];
    if (String(keeper._id) === String(l._id)) { toVerified.push(l); }
    else { toArchived.push(l); reason.set(l.leadId, `주소 중복 (${e}) — 대표: ${keeper.Company}`); }
    continue;
  }
  toVerified.push(l);
}

console.log(`→ 발송대기(verified) : ${toVerified.length}건`);
console.log(`→ 보관함(archived)   : ${toArchived.length}건`);
const byReason = {};
for (const l of toArchived) { const r = reason.get(l.leadId) || '?'; const k = r.startsWith('주소 중복') ? '주소 중복' : r; byReason[k] = (byReason[k] || 0) + 1; }
for (const [k, v] of Object.entries(byReason)) console.log(`     · ${k.padEnd(20)} ${v}`);
console.log(`\n배치 통합: 4개 → '${NEW_BATCH}' 1개`);

if (!APPLY) { console.log('\n[미적용] 실제로 바꾸려면 --apply'); await mongoose.disconnect(); process.exit(0); }

const now = new Date();
const stamp = (l, stage) => ({
  updateOne: {
    filter: { _id: l._id },
    update: { $set: {
      stage, stageChangedAt: now.toISOString(), importBatch: NEW_BATCH,
      preMerge: { stage: l.stage, batch: l.importBatch || '', at: now, reason: reason.get(l.leadId) || '' },
    } },
  },
});

const ops = [...toVerified.map((l) => stamp(l, 'verified')), ...toArchived.map((l) => stamp(l, 'archived'))];
for (let i = 0; i < ops.length; i += 500) {
  const r = await L.bulkWrite(ops.slice(i, i + 500));
  console.log(`  적용 ${Math.min(i + 500, ops.length)}/${ops.length} (수정 ${r.modifiedCount})`);
}
console.log('\n완료');
await mongoose.disconnect();
