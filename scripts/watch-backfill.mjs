/**
 * 2달치 가져오기가 어디까지 왔는지 지켜본다 (화면을 계속 들여다보지 않아도 되게).
 *
 * 폴더가 바뀌거나 끝났을 때만 한 줄 찍는다. 다 끝나면 스스로 종료한다.
 * 사용: node scripts/watch-backfill.mjs --mailbox=david@yogico.kr [--every=60]
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k, d = '') => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const MAILBOX = arg('mailbox', 'david@yogico.kr');
const EVERY = (Number(arg('every', '60')) || 60) * 1000;
const STALL_ROUNDS = Number(arg('stall', '10'));   // 이만큼 변화가 없으면 멈춘 것으로 본다

await mongoose.connect(process.env.MONGODB_URI);
const A = mongoose.connection.db.collection('mailaccounts');
const I = mongoose.connection.db.collection('inboundmails');
const escaped = MAILBOX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const say = (s) => { process.stdout.write(s + '\n'); };
const state = new Map();
let stalled = 0;

for (;;) {
  const accts = await A.find({ smtpUser: new RegExp(`^${escaped}$`, 'i') },
    { projection: { owner: 1, accountName: 1, backfillCursor: 1, backfilledAt: 1 } }).toArray();
  let changed = false;
  let allDone = true;

  for (const a of accts) {
    const id = String(a._id);
    const c = a.backfillCursor;
    const folders = c?.folders || [];
    const idx = c?.folderIndex || 0;
    const prog = c?.progress || {};
    const cur = folders[idx] || '';
    const r = prog[cur] || {};
    const key = `${a.backfilledAt ? 'done' : idx}|${cur}|${r.done || 0}`;
    const prev = state.get(id);
    const mails = await I.countDocuments({ accountId: id });

    if (a.backfilledAt) {
      if (prev !== 'done') {
        say(`✅ 완료 [${a.owner}] ${MAILBOX} — 폴더 ${folders.length}개 · DB 보유 ${mails}통`);
        changed = true;
      }
      state.set(id, 'done');
      continue;
    }
    allDone = false;
    // 폴더가 바뀐 순간에만 알린다 — 매 분 찍으면 알림이 너무 많다
    const prevFolder = String(prev || '').split('|')[1];
    if (prevFolder !== cur) {
      say(`… [${a.owner}] ${MAILBOX} · 폴더 ${idx + 1}/${folders.length} "${cur}" 시작 · 지금까지 DB ${mails}통`);
      changed = true;
    }
    if (prev !== key) changed = true;
    state.set(id, key);
  }

  if (allDone && accts.length) { say('끝 — 2달치 가져오기가 모두 끝났습니다.'); break; }
  stalled = changed ? 0 : stalled + 1;
  if (stalled >= STALL_ROUNDS) {
    say(`⚠️ ${Math.round((STALL_ROUNDS * EVERY) / 60000)}분째 진행이 없습니다 — 브라우저 화면이 닫혔거나 멈춘 것 같습니다.`);
    break;
  }
  await new Promise((r) => setTimeout(r, EVERY));
}
await mongoose.disconnect();
