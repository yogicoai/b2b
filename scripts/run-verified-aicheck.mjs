/**
 * [AI 검증 완료]에 있는데 정작 AI 판정을 받은 적 없는 업체를 전부 검증한다.
 *
 * 왜:
 * 화면 이름은 [AI 검증 완료]인데 653곳 중 244곳만 실제 판정이 있었다.
 * 나머지는 예전 스크립트가 stage 만 올려놓은 것이라 AI 가 본 적이 없다.
 * "AI가 검증한 거죠?" 라는 물음에 답할 수 있어야 이름이 이름값을 한다.
 *
 * 결과에 따라 자동으로 나뉜다.
 *   target-fit → 그대로 [AI 검증 완료]
 *   not-fit    → [보관함] (지우는 게 아니라 옮기는 것 · 되돌릴 수 있다)
 *   maybe        → 그대로 두고 사람이 [직접 검토]에서 판단
 *
 * 20건씩 끊어 돈다. 중간에 멈춰도 판정한 것은 남고, 다시 돌리면 이어서 간다.
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const BASE = process.env.AICHECK_BASE || 'http://localhost:3000';
const ID = process.env.ADMIN_ID || 'admin';
const PW = process.env.ADMIN_PASSWORD || '';

// 로그인해서 세션 쿠키를 얻는다 (/api/leads 는 로그인 보호 구간)
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: ID, password: PW }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
if (!cookie) { console.error('로그인 실패 — 세션 쿠키를 못 받았습니다'); process.exit(1); }

const started = Date.now();
let done = 0;
const moved = { verified: 0, archived: 0, kept: 0 };
const archivedList = [];

for (let round = 0; round < 60; round++) {
  const res = await fetch(`${BASE}/api/leads/verify-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      scope: 'verified-unchecked',
      limit: 20,
      excludeKorea: true,
      autoMoveStage: true,
    }),
  });
  const d = await res.json();
  if (!d.success) { console.error('실패:', d.error); break; }
  if (!d.processed) { console.log('남은 대상 없음 — 끝'); break; }

  done += d.processed;
  if (d.stageMoves) {
    moved.verified += d.stageMoves.verified || 0;
    moved.archived += d.stageMoves.archived || 0;
    moved.kept += d.stageMoves.kept || 0;
  }
  // 보관함으로 간 곳은 이름을 남긴다 — 잘못 걸러졌는지 사람이 볼 수 있게
  for (const r of d.results || []) {
    if (r.verdict === 'not-fit') {
      archivedList.push(`${r.company} — ${String(r.reasoning || '').slice(0, 90)}`);
    }
  }

  const el = Math.round((Date.now() - started) / 1000);
  console.log(`[${String(el).padStart(4)}초] ${String(done).padStart(4)}건 처리 · 남은 ${d.remaining} ` +
    `· 통과 ${moved.verified} 보관 ${moved.archived} 애매 ${moved.kept}`);

  if (!d.hasMore) break;
  await new Promise((r) => setTimeout(r, 400));   // API 부하 완화
}

console.log(`\n── 끝 (${Math.round((Date.now() - started) / 1000)}초) ──`);
console.log(`  처리       ${done}건`);
console.log(`  통과       ${moved.verified}곳 → [AI 검증 완료] 유지`);
console.log(`  보관함으로 ${moved.archived}곳 → AI가 K-뷰티 무관으로 판정`);
console.log(`  애매       ${moved.kept}곳 → [직접 검토]에서 사람이 판단`);
console.log(`  예상 비용  약 $${(done * 0.0005).toFixed(2)} (₩${Math.round(done * 0.0005 * 1400).toLocaleString()})`);

if (archivedList.length) {
  console.log(`\n보관함으로 옮겨진 곳 (앞 20곳 — 잘못 걸러졌으면 되돌릴 수 있습니다):`);
  for (const a of archivedList.slice(0, 20)) console.log(`  · ${a}`);
  if (archivedList.length > 20) console.log(`  … 외 ${archivedList.length - 20}곳`);
}
