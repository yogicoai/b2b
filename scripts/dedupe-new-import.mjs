/**
 * 새로 올린 파일(배치) 안의 업체를 **이미 있던 업체와 대조해 중복을 걸러낸다** (1차 정리).
 *
 * 무엇을 같은 업체로 보는가 (앞선 dedup 스크립트들과 같은 기준, 느슨한 순서):
 *   1) 메일 주소가 같다            — 가장 확실
 *   2) 홈페이지 도메인이 같다      — 같은 회사의 다른 담당자
 *   3) 회사명 + 지역가 같다        — 이름만 같고 지역가 다르면 다른 업체로 본다
 * 같은 파일 안에서 두 번 들어온 것도 함께 걸러낸다(먼저 들어온 것을 남긴다).
 *
 * 도메인만 같다고 바로 지우지 않는다 — 회사 이름이 전혀 다르면 **보류**로 빼서 사람이 보게 한다.
 * 인스타·페이스북 주소를 홈페이지로 적은 업체가 많아, 주소창 도메인만 보면 서로 상관없는
 * 업체 수백 곳이 한 회사가 되어 버린다(실제로 instagram.com 하나에 206곳이 묶였다).
 *
 * 둘 중 **어느 쪽을 남기는가**: 영업이 더 진행된 쪽. 이미 있던 곳이 [검증 실패]·[보관] 이고
 * 새로 올린 곳에 메일 주소가 있으면, 새 것을 남기고 묵은 것을 지운다.
 *
 * 지우지 않고 deleted 표시만 한다 — 되돌릴 수 있게 대상 목록을 backups/ 에 남긴다.
 * 이미 연락한 곳(발송 이력이 있는 곳)은 건드리지 않는다.
 *
 * 미리보기: node scripts/dedupe-new-import.mjs --batch=<배치명>
 * 적용:     node scripts/dedupe-new-import.mjs --batch=<배치명> --apply
 * 배치명을 모르면 그냥 실행하면 최근 배치 목록을 보여준다.
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const batch = (process.argv.find((a) => a.startsWith('--batch=')) || '').split('=')[1];

await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.db.collection('leads');

if (!batch) {
  const rows = await L.aggregate([
    { $match: { deleted: { $ne: true } } },
    { $group: { _id: { $ifNull: ['$importBatch', '(없음)'] }, n: { $sum: 1 }, last: { $max: '$createdAt' } } },
    { $sort: { last: -1 } }, { $limit: 10 },
  ]).toArray();
  console.log('최근 올린 파일(배치):');
  rows.forEach((r) => console.log(`  ${String(r._id).padEnd(34)} ${String(r.n).padStart(5)}곳 · ${new Date(r.last).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`));
  console.log('\n--batch=<배치명> 으로 다시 실행하세요.');
  await mongoose.disconnect();
  process.exit(0);
}

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const REAL_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const emailKey = (l) => (REAL_EMAIL.test(String(l.Email || '').trim()) ? norm(l.Email) : '');
/**
 * 홈페이지가 SNS 계정인 업체가 많다 — 이때 host 만 보면 instagram.com 하나에
 * 서로 상관없는 업체 200곳이 전부 "같은 회사" 가 되어 버린다(실제로 그랬다).
 * SNS 는 **계정 이름까지** 봐야 같은 회사다: instagram.com/skinaholics.mk
 */
const SOCIAL = new Set([
  'instagram.com', 'facebook.com', 'fb.com', 'm.facebook.com', 'linkedin.com',
  'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'pinterest.com',
  'threads.net', 'vk.com', 'weibo.com', 'xiaohongshu.com', 'wa.me', 't.me',
  'shopee.com', 'lazada.com', 'etsy.com', 'amazon.com', 'linktr.ee',
]);
/** 회사 홈페이지가 아니라 검색·디렉터리·배달·무역통계 주소 — 이걸로는 같은 회사인지 알 수 없다 */
const NOT_A_HOMEPAGE = new Set([
  'google.com', 'google.co.kr', 'maps.google.com', 'goo.gl', 'bing.com',
  'yelp.com', 'tripadvisor.com', 'evendo.com', 'mytour.vn', 'cosmeticindex.com',
  'crunchbase.com', 'bloomberg.com', 'zaubacorp.com', 'opencorporates.com',
  'volza.com', 'wolt.com', 'goldenpages.uz', 'glassdoor.com', 'indeed.com',
  'panjiva.com', 'importgenius.com', 'europages.co.uk', 'alibaba.com', 'made-in-china.com',
]);
/** 회사 홈페이지가 아니라 보도자료·채용 페이지 — 그룹 전체가 같은 주소를 쓴다 */
const NOT_A_HOMEPAGE_PREFIX = ['newsroom.', 'press.', 'pr.', 'investor.', 'investors.', 'careers.', 'jobs.'];
const domainKey = (l) => {
  const v = String(l.WebsiteContact || '').trim();
  if (!v) return '';
  let u;
  try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { return ''; }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  const base = host.split('.').slice(-2).join('.');
  if (NOT_A_HOMEPAGE.has(host) || NOT_A_HOMEPAGE.has(base)) return '';
  if (NOT_A_HOMEPAGE_PREFIX.some((p) => host.startsWith(p))) return '';
  if (SOCIAL.has(host) || SOCIAL.has(base)) {
    // linkedin 은 /company/<이름>·/in/<이름> 이라 한 칸만 잘라 쓰면 전부 "linkedin.com/in" 이 된다
    const segs = u.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
    const take = host.includes('linkedin.') ? segs.slice(0, 2) : segs.slice(0, 1);
    const handle = take.filter((s) => s && s !== 'company' && s !== 'in' && s !== 'pages').join('/');
    return handle ? `${host}/${take.join('/')}` : '';
  }
  return host;
};
const nameKey = (l) => (norm(l.Company) && norm(l.Region) ? `${norm(l.Company)}::${norm(l.Region)}` : '');

/**
 * 도메인이 같아도 **회사 이름이 전혀 안 겹치면** 같은 회사라고 단정하지 않는다.
 * (한 사이트에 여러 업체가 올라가 있거나, 주소를 잘못 적어 넣은 경우가 실제로 있었다)
 */
const GENERIC = new Set(['korea', 'korean', 'k', 'kbeauty', 'beauty', 'cosmetic', 'cosmetics', 'skincare', 'skin',
  'store', 'shop', 'group', 'co', 'ltd', 'llc', 'inc', 'sa', 'srl', 'sarl', 'gmbh', 'bv', 'ag', 'as', 'aps', 'oy', 'ab',
  'company', 'trading', 'trade', 'import', 'export', 'the', 'and', 'de', 'd', 'sdn', 'bhd', 'pte', 'pty', 'sl', 'spa',
  'sro', 'zoo', 'kft', 'doo', 'lda', 'limited', 'international', 'global', 'distribution', 'wholesale', 'retail', 'beaute']);
const tokens = (s) => norm(s).replace(/[^a-z0-9가-힣\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !GENERIC.has(t));
const near = (a, b) => {
  if (a === b) return true;
  if (a.length > 4 && b.length > 4 && (a.includes(b) || b.includes(a))) return true;
  if (Math.abs(a.length - b.length) > 2 || Math.min(a.length, b.length) < 5) return false;
  let d = 0;                                             // 철자 한두 개 차이(Glowavana ↔ Glowvana)는 같은 이름으로 본다
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 2) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + Math.abs(a.length - b.length) <= 2;
};
const nameLooksSame = (a, b) => {
  const ta = tokens(a); const tb = tokens(b);
  if (!ta.length || !tb.length) return true;             // 이름이 사실상 없으면 도메인 판정을 믿는다
  return ta.some((x) => tb.some((y) => near(x, y)));
};

/** 영업이 더 진행된 쪽을 남긴다 — 묵은 [보관]·[검증 실패] 보다 새 정보가 낫다 */
const STAGE_SCORE = { partner: 100, negotiating: 90, replied: 80, contacted: 70, queued: 60, verified: 50, verifying: 40, imported: 30, 'ai-searched': 20, failed: 10, archived: 5 };
const progress = (l) => (STAGE_SCORE[l.stage] || 25) + ((l.emailHistory || []).length ? 1000 : 0) + (REAL_EMAIL.test(String(l.Email || '').trim()) ? 3 : 0);

const PROJ = { leadId: 1, Company: 1, Region: 1, Email: 1, WebsiteContact: 1, stage: 1, createdAt: 1, importBatch: 1, emailHistory: 1 };
const incoming = await L.find({ importBatch: batch, deleted: { $ne: true } }, { projection: PROJ }).sort({ createdAt: 1 }).toArray();
if (!incoming.length) { console.log(`배치 "${batch}" 에 업체가 없습니다.`); await mongoose.disconnect(); process.exit(1); }
const existing = await L.find({ importBatch: { $ne: batch }, deleted: { $ne: true } }, { projection: PROJ }).toArray();
console.log(`새로 올린 ${incoming.length}곳 · 이미 있던 ${existing.length}곳과 대조합니다`);

const byEmail = new Map(); const byDomain = new Map(); const byName = new Map();
for (const l of existing) {
  const e = emailKey(l); if (e && !byEmail.has(e)) byEmail.set(e, l);
  const d = domainKey(l); if (d && !byDomain.has(d)) byDomain.set(d, l);
  const n = nameKey(l); if (n && !byName.has(n)) byName.set(n, l);
}

const dups = [];      // 지울 것 { drop, keeper, by }
const review = [];    // 도메인은 같은데 이름이 전혀 다름 — 사람이 봐야 한다
const keep = [];
for (const l of incoming) {
  if ((l.emailHistory || []).length) { keep.push(l); continue; }   // 이미 연락한 곳은 건드리지 않는다
  const e = emailKey(l); const d = domainKey(l); const n = nameKey(l);
  let hit = null; let by = '';
  if (e && byEmail.has(e)) { hit = byEmail.get(e); by = '메일 주소'; }
  else if (d && byDomain.has(d)) { hit = byDomain.get(d); by = '홈페이지 도메인'; }
  else if (n && byName.has(n)) { hit = byName.get(n); by = '회사명+지역'; }

  // 도메인만 같고 이름이 전혀 다르면 지우지 않는다 — 보류로 빼서 보고한다
  if (hit && by === '홈페이지 도메인' && !nameLooksSame(l.Company, hit.Company)) {
    review.push({ l, hit, key: d });
    hit = null;
  }

  if (hit) {
    // 새로 올린 쪽이 더 나으면(묵은 [보관]·[검증 실패] 상대) 새 것을 남기고 묵은 것을 지운다
    const incomingWins = progress(l) > progress(hit);
    if (incomingWins) {
      dups.push({ drop: hit, keeper: l, by, replaced: true });
      keep.push(l);
      if (e) byEmail.set(e, l);
      if (d) byDomain.set(d, l);
      if (n) byName.set(n, l);
    } else {
      dups.push({ drop: l, keeper: hit, by, replaced: false });
    }
    continue;
  }
  keep.push(l);
  // 같은 파일 안의 중복도 막는다 — 지금 남긴 것을 기준에 추가
  if (e) byEmail.set(e, l);
  if (d) byDomain.set(d, l);
  if (n) byName.set(n, l);
}

const byReason = dups.reduce((m, x) => ({ ...m, [x.by]: (m[x.by] || 0) + 1 }), {});
const replaced = dups.filter((x) => x.replaced).length;
console.log(`\n중복 ${dups.length}곳 · 남길 곳 ${keep.length}곳 · 사유별 ${JSON.stringify(byReason)}`);
if (replaced) console.log(`  (그중 ${replaced}곳은 묵은 쪽을 지우고 새로 올린 정보를 남깁니다)`);
const SHOW = process.argv.includes('--all') ? dups.length : 15;
dups.slice(0, SHOW).forEach((x) => console.log(`  - [${x.by}] 지움: ${String(x.drop.Company).slice(0, 32).padEnd(34)}(${x.drop.stage}) → 남김: ${String(x.keeper.Company).slice(0, 30)} (${x.keeper.stage})`));
if (dups.length > SHOW) console.log(`  … 외 ${dups.length - SHOW}곳 (--all 로 전체 보기)`);

if (review.length) {
  console.log(`\n보류 ${review.length}곳 — 홈페이지 주소는 같은데 회사 이름이 달라 지우지 않았습니다 (직접 확인 필요):`);
  review.slice(0, 20).forEach((x) => console.log(`  - ${String(x.l.Company).slice(0, 32).padEnd(34)} ↔ ${String(x.hit.Company).slice(0, 30).padEnd(32)} ${String(x.key).slice(0, 34)}`));
  if (review.length > 20) console.log(`  … 외 ${review.length - 20}곳`);
}

if (!APPLY) { console.log('\n(미리보기 — 적용하려면 --apply)'); await mongoose.disconnect(); process.exit(0); }

fs.mkdirSync('backups', { recursive: true });
const path = `backups/dedupe-${batch}-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(path, JSON.stringify({
  dropped: dups.map((x) => ({ leadId: x.drop.leadId, company: x.drop.Company, email: x.drop.Email, stage: x.drop.stage, by: x.by, replaced: x.replaced, keeper: x.keeper.leadId, keeperCompany: x.keeper.Company })),
  review: review.map((x) => ({ leadId: x.l.leadId, company: x.l.Company, other: x.hit.Company, otherLeadId: x.hit.leadId, key: x.key })),
}, null, 1));
const now = new Date().toISOString();
const r = await L.bulkWrite(dups.map((x) => ({
  updateOne: {
    filter: { leadId: x.drop.leadId },
    update: { $set: { deleted: true, deletedAt: now, deletedReason: `중복 — 같은 업체가 이미 있음 (${x.by})`, dupKeeperLeadId: x.keeper.leadId, dupMatchedBy: x.by } },
  },
})));
console.log(`\n중복 표시 ${r.modifiedCount}곳 · 되돌리기 목록 ${path}`);
console.log(`남은 새 업체 ${await L.countDocuments({ importBatch: batch, deleted: { $ne: true } })}곳`);
await mongoose.disconnect();
