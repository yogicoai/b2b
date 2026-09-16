#!/usr/bin/env node
/**
 * 중복 정리로 archived 된 리드가 답장 매칭 때문에 되살아난 것을 바로잡는다.
 *
 * 증상 (2026-09-09 실측):
 *   [replied ] My K Retail & Distribution  답장23  ← archived 사본이 부활
 *   [partner ] My K Retail & Distribution  답장0   ← 진짜 리드인데 메일을 못 받음
 *
 * 원인은 matchLead 가 같은 이메일의 후보 중 아무거나 골랐기 때문.
 * 코드는 고쳤고(keeper 를 따라간다), 이 스크립트는 이미 어긋난 데이터를 옮긴다.
 *
 * 처리:
 *   1) 부활한 리드에 붙은 InboundMail 을 keeper 로 재연결
 *   2) 부활한 리드를 archived 로 되돌림
 *   3) keeper 의 답장 지표(inboundCount·lastInboundAt) 재계산
 *
 * 사용법:
 *   node -r dotenv/config scripts/fix-resurrected-leads.mjs dotenv_config_path=.env.local [--apply]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI 없음'); process.exit(1); }
const APPLY = process.argv.includes('--apply');

await mongoose.connect(URI);
const Lead = mongoose.connection.db.collection('leads');
const Mail = mongoose.connection.db.collection('inboundmails');

console.log(`\n=== 부활한 중복 리드 정리 (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

// 중복 정리 흔적이 있는데 archived 가 아닌 것 = 매칭이 되살린 것
const resurrected = await Lead.find({
  dedupArchivedAt: { $exists: true, $ne: '' },
  stage: { $ne: 'archived' },
}).project({
  leadId: 1, Company: 1, Region: 1, stage: 1, Email: 1,
  inboundCount: 1, dedupOriginalStage: 1, dedupKeeperLeadId: 1,
}).toArray();

console.log(`부활한 리드: ${resurrected.length}건`);
if (!resurrected.length) {
  console.log('정리할 것이 없습니다.\n');
  await mongoose.disconnect();
  process.exit(0);
}

const plan = [];
for (const r of resurrected) {
  const keeper = await Lead.findOne(
    { leadId: r.dedupKeeperLeadId },
    { projection: { leadId: 1, Company: 1, stage: 1, inboundCount: 1 } },
  );
  const mailCount = await Mail.countDocuments({ leadId: r.leadId });
  plan.push({ lead: r, keeper, mailCount });

  console.log(`\n  ${r.Company} (${r.Region})`);
  console.log(`    부활본  ${r.leadId}  [${r.stage}]  메일 ${mailCount}통`);
  console.log(`    → keeper ${keeper ? `${keeper.leadId} [${keeper.stage}]` : '❌ 없음'}`);
  console.log(`    조치: 메일 ${mailCount}통을 keeper 로 재연결 · 부활본은 archived 로 복귀`);
}

if (!APPLY) {
  console.log('\n(dry-run) --apply 로 실제 정리\n');
  await mongoose.disconnect();
  process.exit(0);
}

let movedMails = 0;
let fixedLeads = 0;

for (const { lead, keeper, mailCount } of plan) {
  if (!keeper) {
    console.log(`\n⚠️ ${lead.Company}: keeper 를 찾지 못해 건너뜀`);
    continue;
  }

  // 1) 메일을 keeper 로 재연결
  if (mailCount) {
    await Mail.updateMany({ leadId: lead.leadId }, { $set: { leadId: keeper.leadId } });
    movedMails += mailCount;
  }

  // 2) 부활본을 archived 로 되돌리고 답장 지표 초기화
  await Lead.updateOne(
    { leadId: lead.leadId },
    {
      $set: {
        stage: 'archived',
        stageChangedAt: new Date().toISOString(),
        inboundCount: 0,
        lastInboundAt: '',
        needsReply: false,
        threadKeys: [],
      },
    },
  );
  fixedLeads++;

  // 3) keeper 의 답장 지표 재계산 (실제 개수를 센다)
  const realCount = await Mail.countDocuments({
    leadId: keeper.leadId, direction: 'in', trashedAt: null,
  });
  const latest = await Mail.find({ leadId: keeper.leadId, direction: 'in' })
    .sort({ date: -1 }).limit(1).toArray();
  const keys = await Mail.distinct('threadKey', { leadId: keeper.leadId });

  await Lead.updateOne(
    { leadId: keeper.leadId },
    {
      $set: {
        inboundCount: realCount,
        lastInboundAt: latest[0]?.date ? new Date(latest[0].date).toISOString() : '',
        threadKeys: keys.filter(Boolean),
      },
    },
  );
  console.log(`\n  ✅ ${keeper.Company}: 메일 ${mailCount}통 이관 · keeper 답장 ${realCount}통으로 갱신`);
}

console.log(`\n✅ 리드 ${fixedLeads}건 복귀 · 메일 ${movedMails}통 재연결\n`);
await mongoose.disconnect();
