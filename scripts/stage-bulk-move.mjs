#!/usr/bin/env node
/**
 * stage 일괄 이동 — 되돌릴 수 있게 원래 stage 를 남긴다.
 *
 * 사용법:
 *   node -r dotenv/config scripts/stage-bulk-move.mjs dotenv_config_path=.env.local \
 *     --from=verified --to=archived --reason="품질 재검토" [--apply]
 *
 *   되돌리기:
 *     --restore --tag=<bulkMoveTag>
 *
 * 안전장치:
 *   - 발송 이력이 있는 리드는 절대 옮기지 않는다 (이미 컨택한 곳을 숨기면 안 됨)
 *   - 원래 stage 를 bulkMoveFrom 에 남겨 언제든 복구 가능
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI 없음'); process.exit(1); }

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);
const APPLY = args.apply === true || args.apply === 'true';

await mongoose.connect(URI);
const Lead = mongoose.connection.db.collection('leads');

// ── 복구 모드 ──
if (args.restore) {
  const tag = args.tag;
  if (!tag) { console.error('--tag=<bulkMoveTag> 필요'); process.exit(1); }
  const targets = await Lead.find({ bulkMoveTag: tag }).project({ leadId: 1, bulkMoveFrom: 1, stage: 1 }).toArray();
  console.log(`복구 대상: ${targets.length}건 (tag=${tag})`);
  if (!APPLY) { console.log('(dry-run) --apply 로 실제 복구'); process.exit(0); }
  const ops = targets.map((t) => ({
    updateOne: {
      filter: { leadId: t.leadId },
      update: {
        $set: { stage: t.bulkMoveFrom, stageChangedAt: new Date().toISOString() },
        $unset: { bulkMoveTag: '', bulkMoveFrom: '', bulkMoveAt: '', bulkMoveReason: '' },
      },
    },
  }));
  for (let i = 0; i < ops.length; i += 500) {
    await Lead.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  }
  console.log(`✅ ${targets.length}건 복구 완료`);
  await mongoose.disconnect();
  process.exit(0);
}

// ── 이동 모드 ──
const FROM = args.from;
const TO = args.to;
const REASON = args.reason || '';
if (!FROM || !TO) { console.error('--from / --to 필요'); process.exit(1); }

const now = new Date().toISOString();
const tag = `move-${FROM}-to-${TO}-${now.replace(/[:.]/g, '-').slice(0, 16)}`;

// 발송 이력이 있는 리드는 제외 — 이미 컨택한 곳을 숨기거나 되돌리면 안 된다
const filter = { stage: FROM, 'emailHistory.0': { $exists: false } };
const protectedCount = await Lead.countDocuments({ stage: FROM, 'emailHistory.0': { $exists: true } });
const targets = await Lead.find(filter).project({ leadId: 1, Company: 1, Region: 1 }).toArray();

console.log(`\n=== stage 이동: ${FROM} → ${TO} (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);
console.log(`  대상: ${targets.length}건`);
console.log(`  제외(발송이력 보유): ${protectedCount}건`);
console.log(`  사유: ${REASON || '(없음)'}`);
console.log(`  복구 태그: ${tag}`);
console.log('\n  샘플:');
targets.slice(0, 5).forEach((t) => console.log(`    [${t.Region}] ${t.Company}`));

fs.mkdirSync('./scripts/backups', { recursive: true });
const backup = `./scripts/backups/${tag}.json`;
fs.writeFileSync(backup, JSON.stringify({ tag, from: FROM, to: TO, reason: REASON, at: now, leadIds: targets.map((t) => t.leadId) }, null, 2), 'utf-8');
console.log(`\n  백업: ${backup}`);

if (!APPLY) {
  console.log('\n(dry-run) --apply 로 실제 이동');
  console.log(`복구 명령: node -r dotenv/config scripts/stage-bulk-move.mjs dotenv_config_path=.env.local --restore --tag=${tag} --apply\n`);
  await mongoose.disconnect();
  process.exit(0);
}

const ops = targets.map((t) => ({
  updateOne: {
    filter: { leadId: t.leadId },
    update: {
      $set: {
        stage: TO,
        stageChangedAt: now,
        bulkMoveTag: tag,
        bulkMoveFrom: FROM,
        bulkMoveAt: now,
        bulkMoveReason: REASON,
        ...(TO === 'archived' ? { readyForOutreach: false } : {}),
      },
    },
  },
}));

let done = 0;
for (let i = 0; i < ops.length; i += 500) {
  await Lead.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  done += Math.min(500, ops.length - i);
  console.log(`  진행 ${done}/${ops.length}`);
}

console.log(`\n✅ ${done}건 ${FROM} → ${TO} 이동 완료`);
console.log(`복구: node -r dotenv/config scripts/stage-bulk-move.mjs dotenv_config_path=.env.local --restore --tag=${tag} --apply\n`);
await mongoose.disconnect();
