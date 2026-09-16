/**
 * 메일 주소가 없던 [AI 검증 완료] 업체에, 찾아서 **두 번 확인된** 주소를 넣는다 (2026-09-14).
 *
 * 입력: 주소 찾기 워크플로우 결과 파일 — { result: { merged: [{ id, email, confirmed, confirmedEmail, confirmedUrl, companyStatus, ... }] } }
 *
 * 넣는 조건 (하나라도 어긋나면 건너뛰고 이유를 남긴다):
 *   - 확인 담당이 그 페이지에서 직접 봤다(confirmed) · 주소 형식이 맞다
 *   - 업체가 폐업·다른 업체로 바뀌지 않았다 (companyStatus)
 *   - 지금도 [AI 검증 완료] 이고 삭제되지 않았고, 그사이 누가 주소를 넣지 않았다
 *   - 같은 주소를 쓰는 다른 업체가 없다 (중복 업체일 수 있어 사람이 봐야 한다)
 *
 * 바꾸기 전 값은 backups/email-fill-2026-09-14.json 에 남긴다.
 *   미리보기:  node scripts/apply-found-emails.mjs <결과파일>
 *   적용:      node scripts/apply-found-emails.mjs <결과파일> --apply
 *   되돌리기:  node scripts/apply-found-emails.mjs --restore
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const BACKUP = 'backups/email-fill-2026-09-14.json';
const REAL_EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore');

await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.collection('leads');

if (RESTORE) {
  const rows = JSON.parse(fs.readFileSync(BACKUP, 'utf-8')).applied || [];
  let n = 0;
  for (const r of rows) {
    const res = await L.updateOne(
      { _id: new mongoose.Types.ObjectId(r._id), Email: r.newEmail },
      { $set: { Email: r.oldEmail }, $unset: { emailFoundAt: '', emailFoundSource: '', emailPrevValue: '' } },
    );
    n += res.modifiedCount;
  }
  console.log(`되돌림 ${n}/${rows.length}곳`);
  await mongoose.disconnect();
  process.exit(0);
}

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) { console.error('결과 파일 경로가 필요합니다'); process.exit(1); }
const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
const merged = (parsed.result || parsed).merged || [];

const clean = (e) => String(e || '').trim().replace(/^mailto:/i, '').replace(/[?#].*$/, '').replace(/[.,;:)]+$/, '').toLowerCase();

// 사람이 결과 메모를 읽고 뺀 주소 — 게시는 확인됐지만 영업 메일 창구로 맞지 않는 곳
// (대형 체인의 고객센터·앱 지원 메일, 바이어가 아닌 업종, 사이트 주차·오래된 디렉터리 등)
const EXCLUDE = new Map((process.argv.find((a) => a.startsWith('--exclude=')) || '--exclude=')
  .slice('--exclude='.length).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).map((e) => [e, true]));

const skipped = [];
const plan = [];
const seenNew = new Map();
for (const m of merged) {
  const newEmail = clean(m.confirmedEmail || '');
  if (!m.email) continue;                                   // 찾지 못한 곳
  if (!m.confirmed || !newEmail) { skipped.push({ ...m, why: '확인 담당이 페이지에서 확인하지 못함' }); continue; }
  if (EXCLUDE.has(newEmail)) { skipped.push({ ...m, why: '사람 검토로 제외 (영업 창구로 부적합)' }); continue; }
  if (!REAL_EMAIL.test(newEmail)) { skipped.push({ ...m, why: `주소 형식이 아님: ${newEmail}` }); continue; }
  if (['closed-or-changed', 'site-down'].includes(m.companyStatus)) { skipped.push({ ...m, why: `업체 상태 ${m.companyStatus}` }); continue; }
  // 개인정보·언론·채용·법무 창구는 영업 메일을 받는 곳이 아니다 — 보내 봐야 읽히지 않는다
  const local = newEmail.split('@')[0];
  if (/(^|[._-])(dpo|privacy|gdpr|lopd|rgpd|datenschutz|legal|abuse|noreply|no-reply|press|media|pr|careers?|jobs?|hr|recruit\w*|investors?|ir)([._-]|\d|$)/i.test(local) || /dpo$|privacy|gdpr|datenschutz/i.test(local)) {
    skipped.push({ ...m, why: `영업용이 아닌 창구(개인정보·언론·채용 등): ${newEmail}` }); continue;
  }
  if (seenNew.has(newEmail)) { skipped.push({ ...m, why: `이번 결과 안에서 같은 주소가 두 곳 (${seenNew.get(newEmail)})` }); continue; }
  seenNew.set(newEmail, m.company);

  const lead = await L.findOne({ leadId: m.id }, { projection: { Company: 1, Email: 1, stage: 1, deleted: 1, Region: 1 } });
  if (!lead) { skipped.push({ ...m, why: '업체를 찾지 못함' }); continue; }
  if (lead.deleted === true || lead.stage !== 'verified') { skipped.push({ ...m, why: `지금 단계 ${lead.stage}${lead.deleted ? ' · 삭제됨' : ''}` }); continue; }
  if (REAL_EMAIL.test(String(lead.Email || '').trim())) { skipped.push({ ...m, why: `그사이 주소가 들어가 있음 (${lead.Email})` }); continue; }

  const esc = newEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const other = await L.findOne(
    // 보관함·검증 실패에 있는 같은 회사의 중복 사본은 괜찮다 (발송 대상이 아니다).
    // 발송될 수 있는 단계에 같은 주소가 이미 있으면 같은 곳에 두 번 나가므로 건너뛴다.
    { _id: { $ne: lead._id }, deleted: { $ne: true }, stage: { $nin: ['archived', 'failed'] }, Email: { $regex: new RegExp(`^\\s*${esc}\\s*$`, 'i') } },
    { projection: { Company: 1, stage: 1 } },
  );
  if (other) { skipped.push({ ...m, why: `같은 주소를 쓰는 다른 업체: ${other.Company} (${other.stage})` }); continue; }

  plan.push({ _id: String(lead._id), leadId: m.id, company: lead.Company, region: lead.Region, oldEmail: lead.Email ?? '', newEmail, source: m.confirmedUrl || m.sourceUrl || '', sourceType: m.sourceType, emailKind: m.emailKind });
}

const found = merged.filter((m) => m.email).length;
console.log(`결과 ${merged.length}곳 · 찾음 ${found} · 넣을 곳 ${plan.length} · 건너뜀 ${skipped.length}`);
const kinds = {};
plan.forEach((p) => { kinds[p.emailKind] = (kinds[p.emailKind] || 0) + 1; });
console.log('넣을 주소 종류:', kinds);
console.log('\n건너뛴 곳:');
skipped.forEach((s) => console.log(`  - ${s.company} | ${s.confirmedEmail || s.email} | ${s.why}`));
console.log('\n넣을 곳 (앞 12곳):');
plan.slice(0, 12).forEach((p) => console.log(`  + [${p.region}] ${p.company} | "${p.oldEmail}" → ${p.newEmail}`));

if (!APPLY) { console.log('\n(미리보기 — 적용하려면 --apply)'); await mongoose.disconnect(); process.exit(0); }

fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync(BACKUP, JSON.stringify({ at: new Date().toISOString(), applied: plan, skipped: skipped.map((s) => ({ id: s.id, company: s.company, email: s.confirmedEmail || s.email, why: s.why })) }, null, 1));
const now = new Date().toISOString();
const ops = plan.map((p) => ({
  updateOne: {
    filter: { _id: new mongoose.Types.ObjectId(p._id), stage: 'verified', deleted: { $ne: true } },
    update: { $set: { Email: p.newEmail, emailFoundAt: now, emailFoundSource: p.source, emailPrevValue: p.oldEmail, updatedInfoAt: now } },
  },
}));
const r = ops.length ? await L.bulkWrite(ops, { ordered: false }) : { modifiedCount: 0 };
console.log(`\n적용 ${r.modifiedCount}/${plan.length}곳 · 바꾸기 전 값 ${BACKUP}`);
await mongoose.disconnect();
