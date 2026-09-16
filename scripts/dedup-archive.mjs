#!/usr/bin/env node
// 중복 리드를 archived 로 이동 (삭제 아님, 복구 가능)
// 매칭: Company+Region 소문자 기준
// 보존 우선순위: contacted > partner > emailHistory > verified+target-fit+email > verified+email > verified > verifying+target-fit > verifying > archived > failed
// 같은 group 안 tier가 같으면 createdAt 이른 게 우선
//
// 사용법:
//   node scripts/dedup-archive.mjs           # dry-run (변경 없음)
//   node scripts/dedup-archive.mjs --apply   # 실제 archived 처리
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI 없음'); process.exit(1); }
const APPLY = process.argv.includes('--apply');

await mongoose.connect(URI);
const Lead = mongoose.connection.db.collection('leads');

// 우선순위 산정 (숫자 클수록 keeper)
function priorityScore(doc) {
  let s = 0;
  const stage = doc.stage || '';
  if (stage === 'contacted') s += 10000;
  else if (stage === 'partner') s += 9000;
  else if (stage === 'verified') s += 5000;
  else if (stage === 'verifying') s += 3000;
  else if (stage === 'archived') s += 1000;
  else if (stage === 'failed') s += 0;

  if (Array.isArray(doc.emailHistory) && doc.emailHistory.length > 0) s += 8000;
  if (doc.verification?.aiVerdict === 'target-fit') s += 2000;

  const email = (doc.Email || '').trim();
  if (email && !/not found|contact form|dm via|no-email/i.test(email) && email.includes('@')) s += 1500;
  if (doc.WebsiteContact) s += 200;
  if (doc.Phone) s += 100;
  if (doc.BuyerContact) s += 100;

  return s;
}

console.log(`\n=== 중복 스캔 시작 (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

const groups = await Lead.aggregate([
  { $addFields: { _ck: { $toLower: { $trim: { input: { $ifNull: ['$Company', ''] } } } }, _cok: { $toLower: { $trim: { input: { $ifNull: ['$Region', ''] } } } } } },
  { $match: { _ck: { $ne: '' } } },
  { $group: {
    _id: { c: '$_ck', co: '$_cok' },
    n: { $sum: 1 },
    docs: { $push: '$$ROOT' },
  } },
  { $match: { n: { $gt: 1 } } },
], { allowDiskUse: true }).toArray();

console.log(`중복 그룹: ${groups.length}개`);

const toArchive = [];
let alreadyArchivedInGroup = 0;
const now = new Date().toISOString();

for (const g of groups) {
  const scored = g.docs.map(d => ({
    doc: d,
    score: priorityScore(d),
    created: d.createdAt || d.importedAt || '',
  }));
  // score 내림차순, 같으면 createdAt 이른 게 keeper (원본에 가까움)
  scored.sort((a, b) => (b.score - a.score) || String(a.created).localeCompare(String(b.created)));
  const keeper = scored[0].doc;
  const losers = scored.slice(1);
  for (const l of losers) {
    if (l.doc.stage === 'archived') alreadyArchivedInGroup++;
    toArchive.push({
      _id: l.doc._id,
      leadId: l.doc.leadId,
      Company: l.doc.Company,
      Region: l.doc.Region,
      oldStage: l.doc.stage || 'none',
      keeperLeadId: keeper.leadId,
    });
  }
}

console.log(`archived 대상: ${toArchive.length}건 (그중 이미 archived: ${alreadyArchivedInGroup}건)`);
const willChange = toArchive.filter(t => t.oldStage !== 'archived');
console.log(`실제 stage 변경 발생 예정: ${willChange.length}건`);

// 백업 파일 작성 (roll-back 용)
const backupDir = './scripts/backups';
fs.mkdirSync(backupDir, { recursive: true });
const stamp = now.replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `dedup-archive-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify(toArchive, null, 2), 'utf-8');
console.log(`백업 저장: ${backupPath}`);

if (!APPLY) {
  console.log('\n(dry-run) --apply 를 붙이면 실제로 archived 처리됩니다.');
  await mongoose.disconnect();
  process.exit(0);
}

// 실제 실행 — 500건씩 청크
const CHUNK = 500;
let done = 0;
for (let i = 0; i < toArchive.length; i += CHUNK) {
  const chunk = toArchive.slice(i, i + CHUNK);
  const ops = chunk.map(t => ({
    updateOne: {
      filter: { _id: t._id },
      update: {
        $set: {
          stage: 'archived',
          stageChangedAt: now,
          dedupArchivedAt: now,
          dedupOriginalStage: t.oldStage,
          dedupKeeperLeadId: t.keeperLeadId,
        },
      },
    },
  }));
  await Lead.bulkWrite(ops, { ordered: false });
  done += chunk.length;
  console.log(`  진행: ${done}/${toArchive.length}`);
}

console.log(`\n✅ 완료: ${done}건 archived 처리`);
await mongoose.disconnect();
