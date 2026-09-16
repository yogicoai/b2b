#!/usr/bin/env node
/**
 * 업체 상세(주소·업종) 채우기 — 네이버 지역검색으로.
 *
 * 구 시스템에서 옮겨온 리드는 상호·이메일·홈페이지만 있고 주소·업종이 비어 있다.
 * 검토 화면이 "이 회사가 어떤 곳인가"를 설명하려면 그것들이 있어야 한다 —
 * 지금은 회사명과 이메일만 덩그러니 나온다.
 *
 * ⚠️ 전화번호는 이 경로로 못 채운다. 네이버 지역검색이 telephone 을 빈 문자열로
 *    돌려준다(2026-09 실측 — 항목은 있는데 값이 늘 ''). 코드는 값이 오면 쓰도록
 *    두었으니, 나중에 다시 제공되면 저절로 채워진다.
 *
 * 네이버 지역검색은 무료다(일 25,000건). AI 는 부르지 않는다 — 이미 판정과 근거가
 * 다 들어 있고, 다시 돌리면 토큰이 나가는 데다 사람이 그 판정을 보고 승인한
 * 이력과 어긋나게 된다.
 *
 * 사용:
 *   node scripts/backfill-place-info.mjs --dry      # 뭘 채울지 보기만
 *   node scripts/backfill-place-info.mjs            # 실제로 채움
 *   node scripts/backfill-place-info.mjs --limit 50
 *
 * 여러 번 돌려도 안전하다. 이미 채워진 칸은 건드리지 않는다.
 */
import fs from 'node:fs';
import { MongoClient } from 'mongodb';

const DRY = process.argv.includes('--dry');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > 0 ? parseInt(process.argv[i + 1], 10) || 0 : 0;
})();

function readEnv(file) {
  const out = {};
  // CRLF 로 저장돼 있으면 '\n' 으로만 자를 때 줄 끝에 '\r' 이 남는다.
  // 정규식의 . 은 '\r' 을 안 먹어서 매치가 통째로 실패하고 키가 하나도 안 잡힌다
  // — 그러면 URI 가 undefined 로 넘어가 엉뚱한 곳에서 터진다.
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = readEnv('.env.local');
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();

/** 비교용 정규화 — 괄호 안 지점명·공백·기호를 털어낸다 */
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s·・,.\-_'"]/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 네이버 지역검색 한 번.
 *
 * 쉬지 않고 부르면 429 가 쏟아진다 — 하루 쿼터(25,000)와 별개로 **초당 제한**이
 * 있다. 처음 돌렸을 때 223건 중 178건이 429 로 떨어졌다.
 * 호출 사이에 간격을 두고, 그래도 걸리면 조금씩 더 기다리며 다시 시도한다.
 */
const CALL_GAP_MS = 250;
let lastCallAt = 0;

async function naverLocal(query, attempt = 0) {
  const wait = lastCallAt + CALL_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  const url = new URL('https://openapi.naver.com/v1/search/local.json');
  url.searchParams.set('query', query);
  url.searchParams.set('display', '5');
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
      Accept: 'application/json',
    },
  });

  if (res.status === 429 && attempt < 4) {
    await sleep(1000 * (attempt + 1));   // 1초 → 2초 → 3초 → 4초
    return naverLocal(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`네이버 ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

/**
 * 검색 결과 중 이 업체가 맞는 것을 고른다.
 *
 * 이름이 비슷하다고 아무거나 집으면 남의 회사 전화번호가 들어간다. 그건 틀린 값이
 * 없는 것보다 나쁘다 — 화면에는 멀쩡해 보이는데 실제로는 다른 곳 번호다.
 * 그래서 한쪽이 다른 쪽을 통째로 포함할 때만 같은 곳으로 본다.
 */
function pickMatch(items, company, website) {
  const want = norm(company);
  if (!want) return null;

  // 1. 홈페이지 호스트가 같으면 확실하다
  const host = (u) => {
    try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
  };
  const myHost = host(website);
  if (myHost) {
    const byHost = items.find((it) => host(it.link) === myHost);
    if (byHost) return { item: byHost, by: 'host' };
  }

  // 2. 상호가 한쪽을 통째로 포함
  for (const it of items) {
    const got = norm(stripTags(it.title));
    if (!got) continue;
    if (got === want) return { item: it, by: 'exact' };
    if (got.includes(want) || want.includes(got)) {
      // 너무 짧은 이름끼리 겹치는 것은 우연일 수 있다 (예: "요기" ⊂ "요기보")
      if (Math.min(got.length, want.length) >= 4) return { item: it, by: 'contains' };
    }
  }
  return null;
}

async function main() {
  const client = await new MongoClient(env.MONGODB_URI).connect();
  const col = client.db().collection('leads');

  // 검증을 통과한 곳만 채운다. 보낼 곳이 아닌 업체까지 채우는 것은 쿼터 낭비다.
  const filter = {
    stage: { $in: ['verified', 'queued'] },
    $or: [
      { Phone: { $in: ['', null] } },
      { address: { $in: ['', null] } },
      { naverCategory: { $in: ['', null] } },
    ],
  };

  let leads = await col.find(filter).toArray();
  if (LIMIT) leads = leads.slice(0, LIMIT);

  console.log(`대상 ${leads.length}건${DRY ? '  (DRY RUN)' : ''}\n`);

  const tally = { matched: 0, noMatch: 0, phone: 0, address: 0, category: 0, errors: 0 };

  for (const [i, l] of leads.entries()) {
    const label = String(l.Company || '').slice(0, 22).padEnd(24);

    // 괄호 안은 대개 운영사·지점 설명이라 검색을 방해한다.
    // "켄싱턴호텔 여의도(이랜드파크)" 는 그대로 넣으면 안 잡히고, 괄호를 떼면 잡힌다.
    const bare = String(l.Company || '').replace(/\([^)]*\)/g, '').trim();

    let items = [];
    try {
      // 지역을 붙이면 동명 업체 중 맞는 곳이 잡힐 확률이 올라간다
      items = await naverLocal(l.Region ? `${l.Region} ${l.Company}` : l.Company);
      if (!items.length && l.Region) items = await naverLocal(l.Company);
      if (!items.length && bare && bare !== l.Company) items = await naverLocal(bare);
    } catch (e) {
      tally.errors++;
      console.log(`${String(i + 1).padStart(3)}. ${label} ⚠️  ${e.message}`);
      continue;
    }

    const hit = pickMatch(items, l.Company, l.WebsiteContact)
      || (bare !== l.Company ? pickMatch(items, bare, l.WebsiteContact) : null);
    if (!hit) {
      tally.noMatch++;
      console.log(`${String(i + 1).padStart(3)}. ${label} —  못 찾음`);
      continue;
    }

    const it = hit.item;
    const set = {};
    // 이미 있는 칸은 건드리지 않는다
    if (!l.Phone && it.telephone) { set.Phone = it.telephone; tally.phone++; }
    const addr = stripTags(it.roadAddress || it.address);
    if (!l.address && addr) { set.address = addr; tally.address++; }
    const cat = stripTags(it.category);
    if (!l.naverCategory && cat) { set.naverCategory = cat; tally.category++; }

    if (!Object.keys(set).length) {
      console.log(`${String(i + 1).padStart(3)}. ${label} ·  채울 것 없음`);
      continue;
    }

    tally.matched++;
    const bits = [
      set.Phone ? `☎ ${set.Phone}` : '',
      set.naverCategory ? `[${set.naverCategory}]` : '',
      set.address ? set.address.slice(0, 28) : '',
    ].filter(Boolean).join('  ');
    console.log(`${String(i + 1).padStart(3)}. ${label} ✓(${hit.by}) ${bits}`);

    if (!DRY) await col.updateOne({ _id: l._id }, { $set: set });
  }

  console.log('\n── 결과 ──');
  console.log(`  채움      ${tally.matched}`);
  console.log(`  못 찾음    ${tally.noMatch}`);
  console.log(`  오류      ${tally.errors}`);
  console.log(`  전화 ${tally.phone} · 주소 ${tally.address} · 업종 ${tally.category}`);

  await client.close();
}

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
