#!/usr/bin/env node
/**
 * 두 계정의 메일함 2달치를 끝까지 가져온다.
 *
 * /api/mail/backfill 은 서버 실행 시간 제한 때문에 50초쯤 가져오고 cursor 를
 * 돌려준다. 화면은 done 이 올 때까지 다시 부르는데, 그 반복을 여기서 대신 한다.
 *
 * 사용: node scripts/run-backfill-2m.mjs
 */
import fs from 'node:fs';

const BASE = 'http://localhost:5610';
const USERS = [
  { id: 'hjs', pw: 'yogibo' },
  { id: 'jay', pw: 'yogibo' },
];

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = readEnv('.env.local');

async function login(id, pw) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: id, password: pw }),
  });
  const raw = res.headers.get('set-cookie') || '';
  const m = raw.match(/admin_session=([^;]+)/);
  if (!m) throw new Error(`${id} 로그인 실패`);
  return `admin_session=${m[1]}`;
}

async function accountIdFor(owner) {
  const { MongoClient } = await import('mongodb');
  const c = await new MongoClient(env.MONGODB_URI).connect();
  const a = await c.db().collection('mailaccounts').findOne({ owner });
  await c.close();
  return a ? String(a._id) : null;
}

async function backfill(cookie, accountId, label) {
  let cursor = null;
  let round = 0;
  const total = { fetched: 0, inserted: 0, duplicate: 0 };

  // 끝날 때까지 이어 부른다. 한 번에 50초쯤 가져오므로 2달치면 몇 바퀴 돈다.
  for (;;) {
    round++;
    const res = await fetch(`${BASE}/api/mail/backfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ accountId, days: 60, cursor }),
    });
    const d = await res.json();
    if (!d.success) {
      console.log(`  ${label} ⚠️ ${d.error || '실패'}`);
      break;
    }
    total.fetched += d.fetched || 0;
    total.inserted += d.inserted || 0;
    total.duplicate += d.duplicate || 0;
    console.log(
      `  ${label} [${round}] 가져옴 ${d.fetched || 0} · 신규 ${d.inserted || 0} · 중복 ${d.duplicate || 0}` +
      (d.done ? '  ✅ 완료' : '  …계속'),
    );
    if (d.done) break;
    cursor = d.cursor;
    if (round > 40) { console.log(`  ${label} ⚠️ 40바퀴에서 멈춤`); break; }
  }
  return total;
}

async function main() {
  for (const u of USERS) {
    const accountId = await accountIdFor(u.id);
    if (!accountId) { console.log(`${u.id}: 메일 계정 없음`); continue; }
    console.log(`\n═══ ${u.id} ═══`);
    const cookie = await login(u.id, u.pw);
    const t = await backfill(cookie, accountId, u.id);
    console.log(`  합계 — 가져옴 ${t.fetched} · 신규 ${t.inserted} · 중복 ${t.duplicate}`);
  }
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
