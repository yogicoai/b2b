/**
 * 발표 전 테스트 데이터 정리 (2026-09-14).
 *
 * 가져오기 시험 때 넣은 가짜 업체가 아직 살아 있었다. 문제는 가짜 주소가
 * **실제로 있는 도메인**이라는 점이다 — 'Sephora France / partner@sephora.fr' 는
 * [AI 검증 완료]에 들어가 있어 2차 검토에서 고르면 진짜 세포라로 메일이 나간다.
 *
 * 지우지 않고 deleted:true 로만 표시한다 (화면·발송·집계에서 모두 빠진다).
 * 되돌리려면 같은 _id 에 deleted:false 를 넣으면 된다 — 대상 목록을 파일로 남긴다.
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
const APPLY = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.collection('leads');

const filter = {
  deleted: { $ne: true },
  'emailHistory.0': { $exists: false },           // 한 번이라도 보낸 기록이 있으면 건드리지 않는다
  $or: [
    { Company: /^TestCompany (Beta|Gamma|Delta|Epsilon)$/ },
    { Company: /^Virtual Test Company [AB] \d+$/ },
    { importBatch: /^test-imp-/ },
  ],
};
const rows = await L.find(filter).project({ Company: 1, Email: 1, stage: 1 }).toArray();
console.log(`테스트 업체 ${rows.length}곳`);
rows.forEach((r) => console.log(`  ${r.stage.padEnd(9)} ${r.Company.slice(0, 36).padEnd(36)} ${r.Email}`));

const memo = await L.findOne({ deleted: { $ne: true }, Company: 'Dangaard Group', notes: 'asdasd' }, { projection: { Company: 1 } });
console.log(`의미 없는 메모 'asdasd': ${memo ? 'Dangaard Group 1건' : '없음'}`);

if (!APPLY) { console.log('\n(미리보기 — 적용하려면 --apply)'); await mongoose.disconnect(); process.exit(0); }

fs.writeFileSync('scripts/.cleanup-test-leads-0914.json', JSON.stringify({ leads: rows.map((r) => String(r._id)), memo: memo ? String(memo._id) : null }, null, 1));
const now = new Date().toISOString();
const r1 = await L.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { deleted: true, deletedAt: now, deletedReason: '발표 전 테스트 데이터 정리 (2026-09-14)' } });
const r2 = memo ? await L.updateOne({ _id: memo._id }, { $set: { notes: '' } }) : { modifiedCount: 0 };
console.log(`\n삭제 표시 ${r1.modifiedCount}곳 · 메모 비움 ${r2.modifiedCount}건 · 되돌리기 목록 scripts/.cleanup-test-leads-0914.json`);
console.log('남은 테스트 업체:', await L.countDocuments(filter));
await mongoose.disconnect();
