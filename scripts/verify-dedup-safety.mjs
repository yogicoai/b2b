// 중복 정리로 중요 리드(파트너·발송이력 보유)가 유실되지 않았는지 검증
import 'dotenv/config';
import mongoose from 'mongoose';
const URI = process.env.MONGODB_URI;
await mongoose.connect(URI);
const Lead = mongoose.connection.db.collection('leads');

console.log('\n=== 중복 정리 안전성 검증 ===\n');

// 1) dedup 으로 archived 된 것 중 원래 partner 였던 것
const archivedPartners = await Lead.find({
  dedupArchivedAt: { $exists: true },
  dedupOriginalStage: 'partner',
}).project({ Company: 1, Region: 1, leadId: 1, dedupKeeperLeadId: 1 }).toArray();

console.log(`[1] dedup 으로 archived 된 옛 partner: ${archivedPartners.length}건`);
for (const a of archivedPartners) {
  // keeper 가 아직 살아있는지 (그리고 어떤 stage 인지) 확인
  const keeper = await Lead.findOne({ leadId: a.dedupKeeperLeadId }, { projection: { Company: 1, stage: 1, leadId: 1 } });
  const ok = keeper && keeper.stage !== 'archived';
  console.log(`  ${ok ? '✅' : '⚠️ '} ${a.Company} (${a.Region})`);
  console.log(`       archived: ${a.leadId}`);
  console.log(`       keeper:   ${keeper ? `${keeper.leadId} [${keeper.stage}]` : '❌ keeper 없음!'}`);
}

// 2) 발송 이력이 있는데 archived 된 것 (진짜 위험 케이스)
const archivedWithHistory = await Lead.find({
  dedupArchivedAt: { $exists: true },
  'emailHistory.0': { $exists: true },
}).project({ Company: 1, Region: 1, leadId: 1, dedupOriginalStage: 1, dedupKeeperLeadId: 1, emailHistory: 1 }).toArray();

console.log(`\n[2] 발송 이력 있는데 archived 된 리드: ${archivedWithHistory.length}건`);
for (const a of archivedWithHistory.slice(0, 20)) {
  const sent = (a.emailHistory || []).filter(h => h.status === 'sent').length;
  const keeper = await Lead.findOne({ leadId: a.dedupKeeperLeadId }, { projection: { stage: 1, leadId: 1, emailHistory: 1 } });
  const keeperSent = (keeper?.emailHistory || []).filter(h => h.status === 'sent').length;
  console.log(`  ${a.Company} — archived(발송 ${sent}회) → keeper ${keeper?.leadId} [${keeper?.stage}] (발송 ${keeperSent}회)`);
}
if (archivedWithHistory.length > 20) console.log(`  ... 외 ${archivedWithHistory.length - 20}건`);

// 3) keeper 가 사라진 고아 케이스 (있으면 안 됨)
const allDeduped = await Lead.find({ dedupArchivedAt: { $exists: true } }).project({ dedupKeeperLeadId: 1 }).toArray();
const keeperIds = [...new Set(allDeduped.map(d => d.dedupKeeperLeadId).filter(Boolean))];
const aliveKeepers = await Lead.find({ leadId: { $in: keeperIds } }).project({ leadId: 1 }).toArray();
const aliveSet = new Set(aliveKeepers.map(k => k.leadId));
const orphans = keeperIds.filter(id => !aliveSet.has(id));
console.log(`\n[3] keeper 고아 검사: keeper ${keeperIds.length}개 중 실종 ${orphans.length}개`);
if (orphans.length) console.log('  ⚠️ 실종된 keeper:', orphans.slice(0, 10));

// 4) 현재 살아있는 유니크 회사 수
const aliveUnique = await Lead.aggregate([
  { $match: { stage: { $nin: ['archived', 'failed'] } } },
  { $group: { _id: { c: { $toLower: '$Company' }, co: { $toLower: '$Region' } } } },
  { $count: 'n' },
]).toArray();
console.log(`\n[4] 활성 stage 의 유니크 회사: ${aliveUnique[0]?.n || 0}개`);

// 5) 롤백 방법 안내
const totalDeduped = allDeduped.length;
console.log(`\n[5] 복구 정보`);
console.log(`  dedup 으로 archived 된 총 ${totalDeduped}건은 dedupOriginalStage 필드에 원래 stage 가 남아있음`);
console.log(`  롤백 쿼리 예시: db.leads.updateMany({dedupArchivedAt:{$exists:true}}, [{$set:{stage:'$dedupOriginalStage'}}])`);

await mongoose.disconnect();
