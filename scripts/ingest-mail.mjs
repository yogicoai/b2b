#!/usr/bin/env node
/**
 * 이카운트 메일 수집 CLI — dev 서버의 /api/mail/ingest 를 호출한다.
 *
 * 사용법:
 *   node scripts/ingest-mail.mjs                    # 새 메일만 (증분)
 *   node scripts/ingest-mail.mjs --recent=20        # 최근 20통 강제 (최초 세팅용)
 *   node scripts/ingest-mail.mjs --limit=100        # 폴더당 최대 100통
 *   node scripts/ingest-mail.mjs --folders=INBOX    # 특정 폴더만
 *   node scripts/ingest-mail.mjs --test             # 연결 테스트만 (수집 안 함)
 *
 * ⚠️ dev 서버가 떠 있어야 한다 (npm run dev).
 * ⚠️ 실패 건수를 반드시 확인할 것 — 조회·신규 건수만 보면 전량 실패해도 정상처럼 읽힌다.
 */

const BASE = process.env.CRAWLER_BASE || 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);

async function loginCookie() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_ID, password: ADMIN_PW }),
  });
  if (!res.ok) throw new Error(`로그인 실패: ${res.status} (dev 서버가 떠 있나요?)`);
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/admin_session=([^;]+)/);
  if (!m) throw new Error('admin_session 쿠키를 받지 못했습니다');
  return `admin_session=${m[1]}`;
}

async function main() {
  console.log(`\n=== 이카운트 메일 수집 (${BASE}) ===\n`);

  const cookie = await loginCookie();
  console.log('로그인 OK');

  // ── 연결 테스트 ──
  if (args.test) {
    const res = await fetch(`${BASE}/api/mail/test-connection`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!data.success) {
      console.error(`\n❌ 연결 실패: ${data.error}\n`);
      process.exit(1);
    }
    console.log(`\n✅ 연결 성공 — 폴더 ${data.folderCount}개\n`);
    data.folders.forEach((f) => console.log(`  ${f}`));
    if (data.mailbox) {
      console.log(`\n대상 폴더 ${data.mailbox.path}: ${data.mailbox.exists}통 (uidNext=${data.mailbox.uidNext})`);
    }
    console.log('\n수집 폴더로 지정하려면 설정에서 imapFolders 에 추가하세요.\n');
    return;
  }

  // ── 수집 ──
  const body = {};
  if (args.limit) body.limit = Number(args.limit);
  if (args.recent) body.recent = Number(args.recent);
  if (args.folders) body.folders = String(args.folders).split(',').map((s) => s.trim()).filter(Boolean);

  console.log(`수집 시작... ${JSON.stringify(body)}`);
  const started = Date.now();

  const res = await fetch(`${BASE}/api/mail/ingest`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    console.error(`\n❌ JSON 응답이 아님 (${res.status}) — 세션 만료 또는 서버 오류`);
    console.error(text.slice(0, 300));
    process.exit(1);
  }

  const data = await res.json();

  if (data.error) {
    console.error(`\n❌ ${data.error}\n`);
    process.exit(1);
  }

  const s = data.summary || {};
  console.log(`\n=== 결과 (${Math.round((Date.now() - started) / 1000)}초) ===`);
  console.log(`  조회:       ${s.fetched ?? 0}통`);
  console.log(`  신규 저장:  ${s.inserted ?? 0}통`);
  console.log(`  중복 스킵:  ${s.duplicate ?? 0}통`);
  console.log(`  규칙 필터:  ${s.ruleFiltered ?? 0}통 (광고·자동발송 확정)`);
  console.log(`  리드 매칭:  ${s.matched ?? 0}통 → 답장옴 이동 ${s.movedToReplied ?? 0}건`);
  console.log(`  AI 대기:    ${s.pendingAnalysis ?? 0}통 (Phase 5 에서 처리)`);

  if (data.replies?.length) {
    console.log(`\n📬 새 답장 (${data.replies.length}건):`);
    for (const r of data.replies) {
      const moved = r.movedToReplied ? ' → 답장옴으로 이동' : '';
      console.log(`  [${r.matchedBy}] ${r.company || r.leadId}${moved}`);
      console.log(`      ${r.from} — ${String(r.subject).slice(0, 60)}`);
    }
  }

  if (data.folders?.length) {
    console.log(`\n폴더별:`);
    for (const f of data.folders) {
      const g = f.group ? ` [${f.group}]` : '';
      const err = f.errorCount ? ` ⚠️ 실패 ${f.errorCount}` : '';
      const m = f.matched ? ` · 매칭 ${f.matched}` : '';
      console.log(`  ${f.folder}${g} — 조회 ${f.fetched} · 신규 ${f.inserted} · 중복 ${f.duplicate}${m}${err}`);
    }
  }

  // 실패는 반드시 크게 노출한다
  if (data.errors?.length) {
    console.log(`\n⚠️  오류 ${data.errors.length}건:`);
    data.errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }

  console.log(`\n✅ 완료\n`);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
});
