#!/usr/bin/env node
/**
 * 전화번호 채우기 — 업체 홈페이지에서 뽑는다.
 *
 * 네이버 지역검색이 telephone 을 더 이상 안 준다(값이 늘 빈 문자열). 그래서
 * 남은 길은 홈페이지뿐이다. 대부분의 국내 업체 사이트는 푸터에 대표번호를 적어 둔다.
 *
 * 전화번호가 왜 필요한가:
 * 메일 주소를 못 찾았거나 답이 없는 곳에 남는 유일한 연락 수단이다. 검토 화면에서
 * "이 회사가 어떤 곳인가"를 설명하는 재료이기도 하다.
 *
 * ⚠️ 틀린 번호는 없는 것보다 나쁘다. 그래서 국내 번호 형식에 맞고, 페이지에서
 *    '대표·문의·TEL' 같은 말 가까이 있는 것만 고른다. 애매하면 비워 둔다.
 *
 * 사용:
 *   node scripts/backfill-phone.mjs --dry --limit 10
 *   node scripts/backfill-phone.mjs
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
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = readEnv('.env.local');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 국내 지역번호 · 이동통신 · 대표번호(15xx·16xx·18xx) */
const AREA = ['02','031','032','033','041','042','043','044','051','052','053','054','055',
  '061','062','063','064','070'];

/**
 * 국내 번호 형식인가. 여기서 거르지 않으면 사업자등록번호·주소 우편번호·
 * 게시글 번호 같은 숫자가 전화번호로 들어간다.
 */
function isKoreanPhone(raw) {
  const d = String(raw).replace(/[^\d]/g, '');
  if (/^1[568]\d{6}$/.test(d)) return true;            // 1588-1234
  if (d.length < 9 || d.length > 11) return false;
  const area = AREA.find((a) => d.startsWith(a));
  if (!area) return false;
  if (area === '02') return d.length === 9 || d.length === 10;
  return d.length === 10 || d.length === 11;
}

/** 보기 좋게 하이픈 정리 */
function pretty(raw) {
  const d = String(raw).replace(/[^\d]/g, '');
  if (/^1[568]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.startsWith('02')) {
    return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  const a = AREA.find((x) => x !== '02' && d.startsWith(x)) || d.slice(0, 3);
  const rest = d.slice(a.length);
  return rest.length === 7 ? `${a}-${rest.slice(0, 3)}-${rest.slice(3)}` : `${a}-${rest.slice(0, 4)}-${rest.slice(4)}`;
}

const PHONE_RE = /(?:\+?82[-\s]?)?(0\d{1,2}|1[568]\d{2})[-.\s)]{0,3}\d{3,4}[-.\s]{0,3}\d{4}/g;
/** 이 말 가까이 있는 번호가 대표번호일 가능성이 높다 */
const NEAR = /(대표|문의|전화|연락|예약|고객|tel|phone|call)/i;

async function fetchText(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!/html|text/i.test(ct)) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

function pickPhone(html) {
  if (!html) return '';
  // 태그를 지우되 자리는 남긴다 — 붙여버리면 "TEL" 과 번호가 한 덩어리가 돼
  // 주변 단어 판단이 망가진다.
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

  const near = [];
  const any = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const hit = m[0];
    if (!isKoreanPhone(hit)) continue;
    const around = text.slice(Math.max(0, m.index - 30), m.index + hit.length + 10);
    (NEAR.test(around) ? near : any).push(pretty(hit));
  }
  // '대표/문의' 근처 번호를 우선한다. 없으면 페이지에서 제일 먼저 나온 것.
  return near[0] || any[0] || '';
}

async function main() {
  const client = await new MongoClient(env.MONGODB_URI).connect();
  const col = client.db().collection('leads');

  let leads = await col.find({
    stage: { $in: ['verified', 'queued'] },
    Phone: { $in: ['', null] },
    WebsiteContact: { $nin: ['', null] },
  }).toArray();
  if (LIMIT) leads = leads.slice(0, LIMIT);

  console.log(`대상 ${leads.length}건${DRY ? '  (DRY RUN)' : ''}\n`);
  const tally = { got: 0, none: 0 };

  for (const [i, l] of leads.entries()) {
    const label = String(l.Company || '').slice(0, 20).padEnd(22);
    let url = String(l.WebsiteContact || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

    let phone = pickPhone(await fetchText(url));

    // 메인에 없으면 연락처 페이지를 한 번 더 본다
    if (!phone) {
      for (const sub of ['/contact', '/about', '/company']) {
        try {
          phone = pickPhone(await fetchText(new URL(sub, url).toString(), 6000));
        } catch { /* 주소 조합 실패는 무시 */ }
        if (phone) break;
      }
    }

    if (phone) {
      tally.got++;
      console.log(`${String(i + 1).padStart(3)}. ${label} ☎ ${phone}`);
      if (!DRY) await col.updateOne({ _id: l._id }, { $set: { Phone: phone } });
    } else {
      tally.none++;
      console.log(`${String(i + 1).padStart(3)}. ${label} —`);
    }
  }

  console.log(`\n── 결과 ──\n  찾음 ${tally.got} · 못 찾음 ${tally.none}`);
  await client.close();
}

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
