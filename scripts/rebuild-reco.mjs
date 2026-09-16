/**
 * 발송 우선순위 점수를 계산해 Lead.recoScore / recoReasons 에 저장한다.
 * 규칙은 src/lib/reco-score.ts 와 같아야 한다 — 배점을 고치면 여기도 함께 고칠 것.
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { pathToFileURL } from 'url';

const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');

// TS 파일을 그대로 못 불러오므로 tsx 로 실행되면 진짜 구현을 쓰고,
// 아니면 아래 이식본을 쓴다. (두 벌이 어긋나지 않게 배점을 한 곳에 모아둔다)
const CATEGORY_SCORE = {
  'Distributor':        [30, '유통사 — 한 곳 뚫리면 여러 채널로 퍼짐'],
  'Retail Chain':       [25, '리테일 체인 — 매장 수만큼 물량'],
  'Brand/Manufacturer': [20, '브랜드·제조사 — 역방향 제안(그쪽 제품을 아시아로)도 가능'],
  'Retailer':           [15, '매장·편집숍'],
  'Online Store':       [12, '온라인몰'],
  'Clinic':             [8,  '클리닉 — 물량은 작음'],
};
const PREFIX_SCORE = [
  [/^(b2b|wholesale|purchas|buying|buyer|procure|vendor|supplier|partner|bd|business)/i, 25, 'B2B·구매 담당 주소 — 제안이 바로 닿음'],
  [/^(sales|commercial|export|import|trade|marketing)/i, 18, '영업·수출입 담당 주소'],
  [/^(office|kontakt|contact|hello|hola|bonjour|ciao|mail|inquiry|enquir)/i, 10, '대표 문의 주소'],
  [/^(info|admin)/i, 8, '일반 대표 주소'],
  [/^(support|help|customer|service|care|shop|eshop|order|webshop)/i, 3, '고객지원 주소 — 제안 메일이 묻히기 쉬움'],
];
const KR_BRAND = /cosrx|beauty of joseon|anua|medicube|skin1004|torriden|round lab|laneige|innisfree|tirtir|numbuz|axis-?y|biodance|dr\.?\s*althea|purito|isntree|tocobo|mixsoon|k-?beauty|korean/i;
const brandCount = s => String(s||'').split(/[,;·]/).map(x=>x.trim()).filter(x=>x.length>1).length;

function recoScore(lead) {
  const reasons = []; let score = 0;
  const [cp, cw] = CATEGORY_SCORE[lead.Category] || [10, ''];
  score += cp; if (cw) reasons.push(cw);
  const prefix = String(lead.Email||'').split('@')[0] || '';
  for (const [rx, pts, why] of PREFIX_SCORE) { if (rx.test(prefix)) { score += pts; reasons.push(why); break; } }
  const hay = `${lead.BrandsChannels||''} ${lead.Evidence||''}`;
  if (KR_BRAND.test(hay)) { score += 15; reasons.push('한국 브랜드를 이미 취급 — 카테고리 설명이 필요 없음'); }
  else reasons.push('한국 브랜드 미취급 — 신규 개척 대상');
  const bc = brandCount(lead.BrandsChannels);
  if (bc >= 11) { score += 10; reasons.push(`취급 브랜드 ${bc}개 — 편집 역량 있음`); }
  else if (bc >= 6) { score += 7; reasons.push(`취급 브랜드 ${bc}개`); }
  else if (bc >= 3) { score += 4; reasons.push(`취급 브랜드 ${bc}개`); }
  const ev = String(lead.Evidence||'').length;
  if (ev >= 200) score += 8; else if (ev >= 100) score += 4;
  else if (ev < 40) reasons.push('근거가 얇음 — 사이트 확인 권장');
  if (String(lead.Phone||'').trim()) score += 4;
  return { score: Math.min(100, Math.round(score/92*100)), reasons };
}

await mongoose.connect(uri);
const L = mongoose.connection.db.collection('leads');
// 발송 대상이 될 수 있는 것만 — 보관함 5천 건까지 계산할 이유가 없다
const targets = await L.find({ stage: { $in: ['verified','imported','ai-searched','verifying','contacted'] } }).toArray();
console.log('대상', targets.length, '건');
const ops = targets.map(l => {
  const r = recoScore(l);
  return { updateOne: { filter: { _id: l._id }, update: { $set: { recoScore: r.score, recoReasons: r.reasons } } } };
});
for (let i=0;i<ops.length;i+=500) { await L.bulkWrite(ops.slice(i,i+500)); }
console.log('저장 완료');
const top = await L.find({stage:'verified'}).sort({recoScore:-1}).limit(3).project({Company:1,recoScore:1,Email:1}).toArray();
console.log('\n확인 — 발송대기 상위 3:');
for (const t of top) console.log(`  ${String(t.recoScore).padStart(3)}  ${String(t.Company).slice(0,40).padEnd(42)} ${t.Email}`);
await mongoose.disconnect();
