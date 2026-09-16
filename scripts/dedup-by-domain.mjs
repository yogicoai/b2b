#!/usr/bin/env node
/**
 * 도메인 기준 중복 정리 — 같은 회사가 이름만 다르게 여러 번 들어온 것을 접는다.
 *
 * 앞서 돌린 dedup-archive.mjs 는 "회사명+지역" 기준이라
 * 아래 같은 케이스를 못 걸렀다 (실측):
 *   MiiN Cosmetics — Irena / — Maria / — Olga  → 같은 회사, 담당자만 다름
 *   Qudo Beauty / QudoBeauty / Qudo Beauty SRL  → 같은 회사, 표기만 다름
 *   SweetCare Kiribati / Malawi / Vanuatu …     → 같은 사이트를 지역별로 쪼갬
 *
 * ⚠️ 반드시 지켜야 할 것 두 가지
 *   1) 플랫폼 URL(facebook·linkedin 등)은 제외한다.
 *      경로가 날아가 도메인만 남은 것이라, 묶으면 서로 다른 47개 회사가 한 덩어리가 된다.
 *   2) 접히는 쪽의 담당자·이메일은 keeper 의 notes 에 남긴다.
 *      "같은 회사의 다른 담당자" 인 경우가 많아 그냥 지우면 연락처를 잃는다.
 *
 * 삭제하지 않고 stage='archived' 로만 옮긴다 (dedupOriginalStage 로 롤백 가능).
 *
 * 사용법:
 *   node -r dotenv/config scripts/dedup-by-domain.mjs dotenv_config_path=.env.local [--apply]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI 없음'); process.exit(1); }
const APPLY = process.argv.includes('--apply');

/** 여러 회사가 공유하는 플랫폼 — 도메인만으로 같은 회사라고 볼 수 없다 */
const PLATFORM = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
  'youtube.com', 'tiktok.com', 'wa.me', 'whatsapp.com', 't.me', 'telegram.me',
  'shopee.com', 'lazada.com', 'amazon.com', 'ebay.com', 'etsy.com', 'alibaba.com',
  'naver.com', 'blog.naver.com', 'blogspot.com', 'wordpress.com', 'wixsite.com',
  'myshopify.com', 'shopify.com', 'linktr.ee', 'google.com', 'sites.google.com',
  'daum.net', 'tistory.com', 'cafe24.com', 'gmail.com',
];
const isPlatform = (d) => PLATFORM.some((p) => d === p || d.endsWith(`.${p}`));

function domainOf(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      .hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0].split('?')[0];
  }
}

/** keeper 선정 점수 — 실제 영업 이력이 있는 쪽을 최우선으로 남긴다 */
function score(d) {
  let s = 0;
  const stage = d.stage || '';
  if (stage === 'partner') s += 100000;
  else if (stage === 'negotiating') s += 90000;
  else if (stage === 'replied') s += 80000;
  else if (stage === 'contacted') s += 70000;
  else if (stage === 'verified') s += 40000;
  else if (stage === 'ai-searched') s += 30000;
  else if (stage === 'verifying') s += 20000;

  const sent = (d.emailHistory || []).filter((h) => h && h.status === 'sent').length;
  s += sent * 15000;                       // 발송 이력이 있으면 절대 버리지 않는다
  if (d.inboundCount) s += d.inboundCount * 12000;

  const email = String(d.Email || '').trim();
  if (email.includes('@') && !/^not found/i.test(email)) s += 2000;
  if (d.Phone) s += 300;
  if (d.BuyerContact) s += 300;
  if (d.BrandsChannels) s += 200;
  if (d.Evidence) s += 100;
  // 회사명이 짧을수록 대표명일 가능성이 높다 ("MiiN Cosmetics" > "MiiN Cosmetics — Irena Wieczorek (B2B)")
  s += Math.max(0, 60 - String(d.Company || '').length);
  return s;
}

await mongoose.connect(URI);
const Lead = mongoose.connection.db.collection('leads');

console.log(`\n=== 도메인 중복 정리 (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

// archived/failed 는 이미 제외된 리드라 건드리지 않는다
const docs = await Lead.find({ stage: { $nin: ['archived', 'failed'] } }).toArray();
console.log(`활성 리드 ${docs.length}건 검사`);

const groups = new Map();
let platformSkipped = 0;
for (const d of docs) {
  const dom = domainOf(d.WebsiteContact);
  if (!dom) continue;
  if (isPlatform(dom)) { platformSkipped++; continue; }
  if (!groups.has(dom)) groups.set(dom, []);
  groups.get(dom).push(d);
}

const dupGroups = [...groups.entries()].filter(([, v]) => v.length > 1);
console.log(`플랫폼 URL 제외: ${platformSkipped}건 (서로 다른 회사라 묶지 않음)`);
console.log(`중복 그룹: ${dupGroups.length}개`);

const toArchive = [];
const keeperNotes = new Map();   // keeperLeadId → 보존할 연락처 줄들

for (const [dom, list] of dupGroups) {
  const sorted = [...list].sort((a, b) => score(b) - score(a));
  const keeper = sorted[0];
  for (const loser of sorted.slice(1)) {
    toArchive.push({
      _id: loser._id,
      leadId: loser.leadId,
      Company: loser.Company,
      Region: loser.Region,
      oldStage: loser.stage || 'none',
      domain: dom,
      keeperLeadId: keeper.leadId,
      keeperCompany: keeper.Company,
    });

    // 담당자·이메일이 다르면 keeper 에 남긴다 (같은 회사의 다른 담당자인 경우가 많다)
    const bits = [];
    const lc = String(loser.Company || '').trim();
    const le = String(loser.Email || '').trim();
    const lb = String(loser.BuyerContact || '').trim();
    if (lc && lc !== String(keeper.Company || '').trim()) bits.push(lc);
    if (le && le.toLowerCase() !== String(keeper.Email || '').trim().toLowerCase()) bits.push(le);
    if (lb) bits.push(`담당:${lb}`);
    if (bits.length) {
      if (!keeperNotes.has(keeper.leadId)) keeperNotes.set(keeper.leadId, []);
      keeperNotes.get(keeper.leadId).push(`  · ${bits.join(' / ')}`);
    }
  }
}

console.log(`\narchived 대상: ${toArchive.length}건`);
const byStage = {};
toArchive.forEach((t) => { byStage[t.oldStage] = (byStage[t.oldStage] || 0) + 1; });
console.log('원래 stage별:', byStage);
console.log(`연락처 보존 대상 keeper: ${keeperNotes.size}건`);

console.log('\n상위 8개 그룹:');
dupGroups.sort((a, b) => b[1].length - a[1].length).slice(0, 8).forEach(([dom, list]) => {
  const sorted = [...list].sort((a, b) => score(b) - score(a));
  console.log(`  ▸ ${dom} (${list.length}건)`);
  console.log(`     유지: ${String(sorted[0].Company).slice(0, 48)}  [${sorted[0].stage}]`);
  sorted.slice(1).forEach((l) => console.log(`     접힘: ${String(l.Company).slice(0, 48)}  [${l.stage}]`));
});

// 백업
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync('./scripts/backups', { recursive: true });
const backup = path.join('./scripts/backups', `dedup-domain-${stamp}.json`);
fs.writeFileSync(backup, JSON.stringify(toArchive, null, 2), 'utf-8');
console.log(`\n백업: ${backup}`);

if (!APPLY) {
  console.log('\n(dry-run) --apply 로 실제 처리\n');
  await mongoose.disconnect();
  process.exit(0);
}

const now = new Date().toISOString();

// 1) keeper 에 연락처 보존
let noteUpdates = 0;
for (const [leadId, lines] of keeperNotes) {
  const cur = await Lead.findOne({ leadId }, { projection: { notes: 1 } });
  const block = `[중복 통합된 연락처]\n${lines.join('\n')}`;
  const merged = `${cur?.notes ? cur.notes + '\n\n' : ''}${block}`.slice(0, 4000);
  await Lead.updateOne({ leadId }, { $set: { notes: merged } });
  noteUpdates++;
}
console.log(`\nkeeper 연락처 보존: ${noteUpdates}건`);

// 2) 중복분 archived 처리
const CHUNK = 500;
let done = 0;
for (let i = 0; i < toArchive.length; i += CHUNK) {
  const chunk = toArchive.slice(i, i + CHUNK);
  await Lead.bulkWrite(chunk.map((t) => ({
    updateOne: {
      filter: { _id: t._id },
      update: {
        $set: {
          stage: 'archived',
          stageChangedAt: now,
          dedupArchivedAt: now,
          dedupOriginalStage: t.oldStage,
          dedupKeeperLeadId: t.keeperLeadId,
          dedupReason: `domain:${t.domain}`,
        },
      },
    },
  })), { ordered: false });
  done += chunk.length;
  console.log(`  진행 ${done}/${toArchive.length}`);
}

console.log(`\n✅ ${done}건 archived · keeper ${noteUpdates}건에 연락처 보존\n`);
await mongoose.disconnect();
