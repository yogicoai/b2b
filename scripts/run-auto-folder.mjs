#!/usr/bin/env node
/**
 * 두 계정의 거래처 폴더 자동 배치를 돌린다.
 *
 * 분석이 새로 붙으면 classification 이 바뀌고, 그러면 갈 폴더도 바뀐다
 * (광고로 판정된 것은 '· 광고·자동발송' 으로). 분석 뒤에 이걸 한 번 돌려야
 * 화면과 분석 결과가 맞는다.
 *
 * 사용: node scripts/run-auto-folder.mjs           # 미리보기
 *       node scripts/run-auto-folder.mjs --apply   # 실제 이동
 */
import fs from 'node:fs';

const BASE = 'http://localhost:5610';
const USERS = [
  { id: 'hjs', pw: 'yogibo' },
  { id: 'jay', pw: 'yogibo' },
];
const APPLY = process.argv.includes('--apply');

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
readEnv('.env.local');

async function login(id, pw) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: id, password: pw }),
  });
  const m = (res.headers.get('set-cookie') || '').match(/admin_session=([^;]+)/);
  if (!m) throw new Error(`${id} 로그인 실패`);
  return `admin_session=${m[1]}`;
}

async function main() {
  for (const u of USERS) {
    console.log(`\n═══ ${u.id} ═══ ${APPLY ? '(실제 이동)' : '(미리보기)'}`);
    const cookie = await login(u.id, u.pw);
    const res = await fetch(`${BASE}/api/mail/auto-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      // redo — 이미 자동 배치된 것도 다시 계산한다. 분석이 바뀌었으니 자리도 다시 봐야 한다.
      body: JSON.stringify({ dryRun: !APPLY, months: 2, redo: true }),
    });
    const d = await res.json();
    if (!d.success) { console.log('  ⚠️', d.error || '실패'); continue; }
    console.log(`  대상 ${d.total}통 · 옮길 것 ${d.moved ?? d.folders.reduce((s, f) => s + f.n, 0)}통`);
    for (const f of d.folders.slice(0, 30)) {
      console.log(`   ${String(f.n).padStart(4)}  ${f.group}   (${f.by})`);
    }
    if (d.folders.length > 30) console.log(`   … 외 ${d.folders.length - 30}개 폴더`);
  }
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
