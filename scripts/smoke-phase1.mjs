// Phase 1 스모크 테스트 — 새 모델 3종이 실제 DB 에서 동작하는지 확인
// 사용법: node -r dotenv/config scripts/smoke-phase1.mjs dotenv_config_path=.env.local
import 'dotenv/config';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI 없음'); process.exit(1); }
await mongoose.connect(URI);
const db = mongoose.connection.db;

console.log('\n=== Phase 1 스모크 테스트 ===\n');

// 1) 컬렉션 존재 여부 (아직 없으면 첫 쓰기 때 생성됨 — 정상)
const cols = (await db.listCollections().toArray()).map(c => c.name);
console.log('현재 컬렉션:', cols.join(', '));

// 2) leads 컬렉션에 새 필드가 들어갈 수 있는지 (스키마 확장 확인)
const leads = db.collection('leads');
const sampleLead = await leads.findOne({ stage: 'contacted' }, { projection: { leadId: 1, Company: 1, emailHistory: 1, threadKeys: 1, inboundCount: 1 } });
console.log('\n[Lead 확장 필드 확인]');
if (sampleLead) {
  console.log(`  샘플: ${sampleLead.Company} (${sampleLead.leadId})`);
  console.log(`  emailHistory: ${Array.isArray(sampleLead.emailHistory) ? sampleLead.emailHistory.length + '건' : '없음'}`);
  const withMsgId = (sampleLead.emailHistory || []).filter(h => h.messageId).length;
  console.log(`  messageId 기록된 발송: ${withMsgId}건 (Phase 3 매칭 키 — 아직 0이 정상)`);
  console.log(`  threadKeys: ${sampleLead.threadKeys?.length ?? '미설정(정상)'}`);
  console.log(`  inboundCount: ${sampleLead.inboundCount ?? '미설정(정상)'}`);
} else {
  console.log('  contacted 리드 없음 — 스킵');
}

// 3) 새 컬렉션에 임시 문서 삽입 → 인덱스 생성 확인 → 삭제
console.log('\n[InboundMail 인덱스 확인]');
const inbound = db.collection('inboundmails');
const testId = `smoke-test-${Date.now()}@yogico.kr`;
await inbound.insertOne({
  messageId: testId,
  accountId: 'main',
  folder: 'INBOX',
  direction: 'in',
  subject: 'smoke test',
  from: { name: 'test', address: 'test@example.com' },
  date: new Date(),
  receivedAt: new Date(),
  classification: 'unknown',
  status: 'new',
  threadKey: 'smoke::test',
});
const idxIn = await inbound.indexes();
console.log(`  인덱스 ${idxIn.length}개:`, idxIn.map(i => i.name).join(', '));
await inbound.deleteOne({ messageId: testId });
console.log('  테스트 문서 삭제 완료');

// 4) MailSettings 싱글톤
console.log('\n[MailSettings 싱글톤]');
const settings = db.collection('mailsettings');
const existing = await settings.findOne({ _id: 'main' });
if (existing) {
  console.log(`  이미 존재 — imapHost=${existing.imapHost} · imapUser=${existing.imapUser || '(미설정)'} · 비번=${existing.imapPassEnc ? '저장됨' : '미설정'}`);
  console.log(`  수집 폴더: ${(existing.imapFolders || []).length}개 · autoAnalyze=${existing.autoAnalyze} · dailyLimit=${existing.dailyAnalyzeLimit}`);
} else {
  console.log('  아직 없음 — 첫 설정 저장 시 생성됨 (정상)');
}

// 5) MailSyncState
console.log('\n[MailSyncState]');
const sync = db.collection('mailsyncstates');
const syncCount = await sync.countDocuments({});
console.log(`  기록 ${syncCount}건 (수집 시작 전이면 0이 정상)`);

// 6) 전체 stage 분포 재확인
console.log('\n[현재 stage 분포]');
const byStage = await leads.aggregate([{ $group: { _id: '$stage', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
byStage.forEach(s => console.log(`  ${(s._id || 'none').padEnd(14)} ${s.n}`));

console.log('\n✅ Phase 1 스모크 테스트 통과\n');
await mongoose.disconnect();
