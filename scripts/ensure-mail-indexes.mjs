// Phase 1 인덱스 사전 생성 — 첫 수집 때 인덱스 빌드로 느려지지 않도록 미리 만든다.
// 모델 정의(src/models/*.ts)와 동일한 인덱스를 raw driver 로 생성.
// 사용법: node -r dotenv/config scripts/ensure-mail-indexes.mjs dotenv_config_path=.env.local
import 'dotenv/config';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI 없음'); process.exit(1); }
await mongoose.connect(URI);
const db = mongoose.connection.db;

async function ensure(colName, specs) {
  const col = db.collection(colName);
  console.log(`\n[${colName}]`);
  for (const [keys, opts] of specs) {
    try {
      const name = await col.createIndex(keys, opts || {});
      console.log(`  ✅ ${name}`);
    } catch (e) {
      console.log(`  ⚠️  ${JSON.stringify(keys)} — ${e.message}`);
    }
  }
}

// InboundMail — src/models/InboundMail.ts 와 동기화
await ensure('inboundmails', [
  [{ messageId: 1 }, { unique: true, sparse: true }],
  [{ date: -1 }],
  [{ receivedAt: -1 }],
  [{ threadKey: 1, date: -1 }],
  [{ status: 1, date: -1 }],
  [{ classification: 1, date: -1 }],
  [{ 'analysis.needsReply': 1, 'analysis.deadline': 1 }],
  [{ 'analysis.deadline': 1 }],
  [{ 'from.address': 1 }],
  [{ group: 1, date: -1 }],
  [{ folder: 1 }],
  [{ accountId: 1, date: -1 }],
  [{ trashedAt: 1 }],
  [{ leadId: 1, date: -1 }],
  [{ direction: 1, date: -1 }],
]);

// MailSyncState
await ensure('mailsyncstates', [
  [{ accountId: 1, folder: 1 }, { unique: true }],
]);

// Lead 신규 인덱스 — src/models/Lead.ts 에 추가한 것들
await ensure('leads', [
  [{ 'emailHistory.messageId': 1 }],
  [{ Email: 1 }],
  [{ threadKeys: 1 }],
  [{ needsReply: 1, replyDeadline: 1 }],
  [{ stage: 1, lastInboundAt: -1 }],
]);

console.log('\n✅ 인덱스 생성 완료\n');
await mongoose.disconnect();
