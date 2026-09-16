/**
 * [AI 검증 완료]에 있는 업체가 [올린 업체 목록]에도 있으면, 올린 쪽에서 감춘다.
 *
 * 왜 필요한가:
 * 같은 회사가 두 곳에 뜨면 두 번 판단하게 된다. 더 나쁜 것은 한쪽에서
 * "보낼 곳"으로 고르고 다른 쪽에서 "검증 실패"로 골라 서로 엇갈리는 경우다.
 * 어느 쪽이 맞는지는 화면만 봐서는 알 수 없다.
 *
 * 어느 쪽을 남기나:
 * 검증 완료 쪽을 남긴다. 그쪽이 더 뒤 단계이고, 발송 리스트로 옮기는 흐름이
 * 그 화면에 붙어 있다. 올린 쪽은 지우지 않고 legacyHiddenAt 만 붙여
 * 목록에서 빠지게 한다 — 잘못 묶였으면 그 필드만 지우면 되돌아온다.
 *
 * 무엇을 같은 회사로 보나:
 *  1순위 이메일 (소문자) — 주소가 같으면 같은 창구다. 가장 확실하다.
 *  2순위 회사명+지역 — 이름만으로 묶으면 Kosmetrics(브라질·칠레·멕시코),
 *        Ksisters(5개국)처럼 나라별 지사가 통째로 사라진다. 실제로 그럴 뻔했다.
 *
 * --apply 없이 돌리면 무엇이 묶이는지만 보여주고 끝난다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.collection('leads');

const ALIVE = { deleted: { $ne: true } };
const LEGACY_STAGES = ['imported', 'verifying', 'archived', 'ai-searched'];

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// 회사명 비교용 — 법인 형태와 괄호 주석은 떼고 본다
const normCo = (s) => norm(s)
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b(co|ltd|inc|llc|corp|gmbh|s\.?r\.?[lo]|sarl|sa|bv|ab|oy|as|aps|pte|pty|kft|doo|d\.o\.o|limited|company)\b\.?/g, ' ')
  .replace(/[^a-z0-9가-힣 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ── 남기는 쪽: 검증 완료 ──
const keepers = await L.find({ stage: 'verified', ...ALIVE })
  .project({ leadId: 1, Company: 1, Region: 1, Email: 1 }).toArray();

const byEmail = new Map();
const byCoRegion = new Map();
for (const k of keepers) {
  const e = norm(k.Email);
  if (e && e.includes('@')) byEmail.set(e, k);
  const c = normCo(k.Company);
  if (c) byCoRegion.set(`${c}::${norm(k.Region)}`, k);
}
console.log(`검증 완료 ${keepers.length}곳 — 이메일 ${byEmail.size} · 회사+지역 ${byCoRegion.size} 기준\n`);

// ── 감출 후보: 올린 데이터 ──
const legacy = await L.find({
  importBatch: { $not: /^ai-search-/ },
  stage: { $in: LEGACY_STAGES },
  ...ALIVE,
  legacyHiddenAt: { $exists: false },
}).project({ leadId: 1, Company: 1, Region: 1, Email: 1, stage: 1 }).toArray();

const hits = [];
for (const l of legacy) {
  const e = norm(l.Email);
  let match = null, by = '';
  if (e && e.includes('@') && byEmail.has(e)) { match = byEmail.get(e); by = 'email'; }
  else {
    const c = normCo(l.Company);
    const key = `${c}::${norm(l.Region)}`;
    if (c && byCoRegion.has(key)) { match = byCoRegion.get(key); by = 'company+region'; }
  }
  if (match) hits.push({ l, match, by });
}

console.log(`올린 데이터 ${legacy.length}곳 중 겹치는 것 ${hits.length}곳`);
const byKind = hits.reduce((a, h) => ((a[h.by] = (a[h.by] || 0) + 1), a), {});
console.log(`  이메일 일치 ${byKind.email || 0} · 회사+지역 일치 ${byKind['company+region'] || 0}\n`);

for (const h of hits.slice(0, 25)) {
  console.log(`  [${h.by === 'email' ? '메일' : '이름'}] ${String(h.l.Company).slice(0, 34).padEnd(36)} ${String(h.l.Region || '').slice(0, 14).padEnd(15)} ${h.l.Email || ''}`);
  if (h.by !== 'email') console.log(`         ↳ 검증완료: ${String(h.match.Company).slice(0, 34)} / ${h.match.Email || ''}`);
}
if (hits.length > 25) console.log(`  … 외 ${hits.length - 25}곳`);

if (!APPLY) {
  console.log('\n(미리보기입니다. 실제로 감추려면 --apply 를 붙여 다시 실행하세요)');
  await mongoose.disconnect();
  process.exit(0);
}

if (!hits.length) {
  console.log('\n감출 것이 없습니다.');
  await mongoose.disconnect();
  process.exit(0);
}

const now = new Date().toISOString();
const ops = hits.map((h) => ({
  updateOne: {
    filter: { leadId: h.l.leadId },
    update: {
      $set: {
        legacyHiddenAt: now,
        legacyHiddenReason: `검증 완료에 같은 업체 있음 (${h.by}) · ${h.match.leadId}`,
      },
    },
  },
}));
const r = await L.bulkWrite(ops, { ordered: false });
console.log(`\n${r.modifiedCount}곳을 올린 목록에서 감췄습니다 (지우지 않았습니다).`);
console.log('되돌리려면 legacyHiddenAt 필드를 지우면 됩니다.');

await mongoose.disconnect();
