#!/usr/bin/env node
/**
 * 이미 가진 값에서 **계산해서 채울 수 있는 것**을 채운다. 바깥을 부르지 않는다.
 *
 *   1. 지역(Region)     ← 주소에서 시·도를 뽑는다
 *   2. 추천점수(recoScore) ← 카테고리·메일주소·규모신호로 계산
 *
 * 왜 필요한가:
 * 구 시스템에는 '지역'이라는 칸이 없었다. 그래서 옮겨온 939건 전부 Region 이 비어
 * 있고, 목록의 지역 필터가 아무것도 걸러내지 못한다. 주소는 902건이 있으니
 * 거기서 뽑으면 된다 — 새로 물어볼 데가 없다.
 *
 * 추천점수도 같다. "어디부터 보낼까"를 정하는 값인데 한 번도 계산된 적이 없어
 * 전부 0 이다. 223곳을 3시간 넘게 나눠 보내야 하므로 좋은 곳이 먼저 나가야 한다.
 *
 * 사용:
 *   node scripts/backfill-derived.mjs --dry
 *   node scripts/backfill-derived.mjs
 */
import fs from 'node:fs';
import { MongoClient } from 'mongodb';

const DRY = process.argv.includes('--dry');

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = readEnv('.env.local');

/* ── 주소 → 시·도 ────────────────────────────────────────────
   src/lib/domain/regions.ts 의 regionFromAddress 와 같은 규칙이다.
   스크립트가 TS 를 직접 못 불러서 옮겨 적었다 — 규칙을 고치면 양쪽을 같이 고칠 것. */
const REGION_TABLE = [
  [/^서울/, '서울'], [/^경기/, '경기'], [/^인천/, '인천'],
  [/^강원/, '강원'],
  [/^대전/, '대전'], [/^세종/, '세종'],
  [/^충청북|^충북/, '충북'], [/^충청남|^충남/, '충남'],
  [/^광주/, '광주'], [/^전라북|^전북/, '전북'], [/^전라남|^전남/, '전남'],
  [/^대구/, '대구'], [/^경상북|^경북/, '경북'],
  [/^부산/, '부산'], [/^울산/, '울산'], [/^경상남|^경남/, '경남'],
  [/^제주/, '제주'],
];
function regionFromAddress(address) {
  const head = String(address || '').trim().split(/\s+/)[0] || '';
  if (!head) return '';
  for (const [rx, name] of REGION_TABLE) if (rx.test(head)) return name;
  return '';
}

/* ── 발송 우선순위 점수 ──────────────────────────────────────
   src/lib/reco-score.ts 와 같은 규칙. 배점을 고치면 양쪽을 같이 고칠 것. */
const CATEGORY_SCORE = {
  resort:  [30, '리조트·호텔 — 로비·키즈존·객실까지 한 번에 물량이 큼'],
  public:  [26, '공공·교육 — 조달 납품이고 시설 단위로 움직임'],
  company: [22, '기업 — 사옥·연수원 단위. 복지 예산이 잡혀 있음'],
  medical: [16, '병·의원 — 대기실 중심이라 물량은 중간'],
  sports:  [14, '스포츠시설 — 라운지·회복공간 중심'],
};
const PREFIX_SCORE = [
  [/^(gu|purchas|buying|buyer|procure|vendor|supplier|partner|b2b|bd|business|chongmu|ga)/i,
    25, '구매·총무 담당 주소 — 제안이 바로 닿음'],
  [/^(sales|marketing|plan|project|facility|manage)/i, 18, '영업·기획·시설 담당 주소'],
  [/^(office|kontakt|contact|hello|mail|inquiry|enquir)/i, 10, '대표 문의 주소'],
  [/^(info|admin)/i, 8, '일반 대표 주소'],
  [/^(support|help|customer|service|care|shop|eshop|order|webshop|reservation|reserve)/i,
    3, '고객지원·예약 주소 — 제안 메일이 묻히기 쉬움'],
];
const SCALE_SIGNALS = [
  '시청','군청','구청','도청','교육청','교육지원청','시설공단','공사','공단',
  '국립','시립','도립','군립','공립','대학교','대학','캠퍼스','평생학습',
  '복지관','문화재단','진흥원','연구원','연구소','도서관',
  '의료원','대학병원','종합병원','병원재단','요양병원','재활병원','보건소',
  '주식회사','㈜','그룹','본사','사옥','연수원','지주','홀딩스',
  '리조트','호텔','워터파크','컨벤션','관광단지','체인','지점','점포',
  '구단','협회','연맹','국민체육','체육회','경기장','아레나','스타디움',
  'resort','hotel','group','corp','inc','univ','hospital','medical',
  'foundation','institute','center','centre',
];

function recoScore(lead) {
  const reasons = [];
  let score = 0;

  const [catPts, catWhy] = CATEGORY_SCORE[lead.category] || [10, ''];
  score += catPts;
  if (catWhy) reasons.push(catWhy);

  const prefix = String(lead.Email || '').split('@')[0] || '';
  for (const [rx, pts, why] of PREFIX_SCORE) {
    if (rx.test(prefix)) { score += pts; reasons.push(why); break; }
  }

  const hay = `${lead.Company || ''} ${lead.WebsiteContact || ''}`.toLowerCase();
  if (SCALE_SIGNALS.some((k) => hay.includes(k.toLowerCase()))) {
    score += 15;
    reasons.push('상호·도메인에 기관·체인 신호 — 한 번에 여러 개가 들어갈 곳');
  } else {
    reasons.push('규모 신호 없음 — 규모는 회신 뒤 확인');
  }

  if (String(lead.WebsiteContact || '').trim()) { score += 6; reasons.push('홈페이지 있음'); }

  // AI 가 매긴 규모 점수를 가장 크게 반영한다. 사람이 그걸 보고 승인했고,
  // 업체를 직접 들여다본 유일한 판단이기 때문이다.
  const ai = lead.verification && typeof lead.verification.score === 'number'
    ? lead.verification.score : null;
  if (ai !== null) {
    score += Math.round(ai * 0.35);
    reasons.push(`AI 규모 판정 ${ai}점`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

async function main() {
  const client = await new MongoClient(env.MONGODB_URI).connect();
  const col = client.db().collection('leads');

  const leads = await col.find({}, {
    projection: {
      _id: 1, Company: 1, Email: 1, WebsiteContact: 1, Region: 1,
      address: 1, category: 1, 'verification.score': 1, recoScore: 1,
    },
  }).toArray();

  console.log(`전체 ${leads.length}건${DRY ? '  (DRY RUN)' : ''}\n`);

  const ops = [];
  const tally = { region: 0, noRegion: 0, reco: 0 };
  const byRegion = {};

  for (const l of leads) {
    const set = {};

    if (!l.Region) {
      const r = regionFromAddress(l.address);
      if (r) { set.Region = r; tally.region++; byRegion[r] = (byRegion[r] || 0) + 1; }
      else tally.noRegion++;
    }

    if (!l.recoScore) {
      const { score, reasons } = recoScore(l);
      set.recoScore = score;
      set.recoReasons = reasons;
      tally.reco++;
    }

    if (Object.keys(set).length) {
      ops.push({ updateOne: { filter: { _id: l._id }, update: { $set: set } } });
    }
  }

  console.log('── 지역 ──');
  for (const [r, n] of Object.entries(byRegion).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(5)} ${n}`);
  }
  console.log(`\n  채움 ${tally.region} · 주소로도 못 뽑음 ${tally.noRegion}`);
  console.log(`\n── 추천점수 ── ${tally.reco}건 계산`);

  if (!DRY && ops.length) {
    const r = await col.bulkWrite(ops, { ordered: false });
    console.log(`\n반영: ${r.modifiedCount}건`);
  } else if (DRY) {
    console.log('\nDRY RUN — 쓰지 않았습니다.');
  }

  await client.close();
}

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
