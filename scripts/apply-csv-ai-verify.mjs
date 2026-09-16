/**
 * 새로 올린 CSV 업체의 **AI 검증 결과와 한글 번역을 DB 에 넣는다** (2026-09-15).
 *
 * 검증은 우리 쪽에서 돌렸다 — 유료 토큰을 쓰지 않는다. 업체마다 실제 사이트·등기·보도자료를 찾아
 * K뷰티를 사올 곳인지(바이어), 애매한지, 아닌지를 가리고 그 근거를 한국어로 적었다.
 *
 * 무엇이 들어가나:
 *   verification.aiVerdict / aiConfidence / aiReasoning / aiSignals / aiVerifiedAt
 *   TypeKo    — 업종을 한국어 한 줄로
 *   EvidenceKo — 판단 근거를 한국어로 (화면에서 바로 읽을 수 있게)
 *
 * 단계 이동 (--move 를 줄 때만):
 *   바이어 + 메일 주소 있음 → 검증 완료(verified)
 *   바이어 + 메일 주소 없음 → 검증 중(verifying) — 주소를 더 찾아야 한다
 *   애매                    → 검증 중(verifying)
 *   아님                    → 보관(archived)
 * 이미 연락이 오간 곳(발송 이력·[대화 진행 중] 이후 단계)은 건드리지 않는다.
 *
 * 미리보기: node scripts/apply-csv-ai-verify.mjs --in=<결과파일>
 * 적용:     node scripts/apply-csv-ai-verify.mjs --in=<결과파일> --apply --move
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const arg = (k, d = '') => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const APPLY = process.argv.includes('--apply');
const MOVE = process.argv.includes('--move');
const inPath = arg('in');
if (!inPath) { console.error('--in=<워크플로 결과 json> 이 필요합니다'); process.exit(1); }

const parsed = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const merged = parsed?.result?.merged || parsed?.merged || [];
if (!merged.length) { console.error('결과 파일에서 업체 목록을 찾지 못했습니다'); process.exit(1); }
console.log(`AI 검증 결과 ${merged.length}곳을 읽었습니다${APPLY ? '' : ' · 미리보기'}`);

await mongoose.connect(process.env.MONGODB_URI);
const L = mongoose.connection.db.collection('leads');

const REAL_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
// 이미 연락이 오간 곳은 단계를 되돌리지 않는다
const LOCKED = new Set(['contacted', 'replied', 'negotiating', 'partner', 'queued']);
const now = new Date().toISOString();

const ids = merged.map((m) => m.id);
const rows = await L.find({ leadId: { $in: ids } },
  { projection: { leadId: 1, Company: 1, Email: 1, stage: 1, deleted: 1, emailHistory: 1 } }).toArray();
const byId = new Map(rows.map((r) => [r.leadId, r]));

const ops = [];
const stat = { 없음: 0, 중복제거됨: 0, 손안댐: 0 };
const moves = {};
const counts = {};
for (const m of merged) {
  const lead = byId.get(m.id);
  if (!lead) { stat.없음++; continue; }
  counts[m.verdict] = (counts[m.verdict] || 0) + 1;
  if (lead.deleted) { stat.중복제거됨++; continue; }      // 중복으로 정리된 곳엔 넣지 않는다

  const set = {
    'verification.aiVerdict': m.verdict,
    'verification.aiConfidence': m.confidence || 'medium',
    'verification.aiReasoning': String(m.reasoningKo || '').slice(0, 1200),
    'verification.aiSignals': (m.signals || []).slice(0, 8).map((s) => String(s).slice(0, 120)),
    'verification.aiVerifiedAt': now,
  };
  if (m.typeKo) set.TypeKo = String(m.typeKo).slice(0, 200);
  if (m.evidenceKo) set.EvidenceKo = String(m.evidenceKo).slice(0, 2000);

  if (MOVE) {
    const locked = LOCKED.has(lead.stage) || (lead.emailHistory || []).length;
    if (locked) stat.손안댐++;
    else {
      const hasMail = REAL_EMAIL.test(String(lead.Email || '').trim());
      const target = m.verdict === 'not-fit' ? 'archived'
        : m.verdict === 'maybe' ? 'verifying'
          : hasMail ? 'verified' : 'verifying';
      if (target !== lead.stage) {
        set.stage = target;
        set.stageChangedAt = now;
        const k = `${lead.stage || '(없음)'} → ${target}`;
        moves[k] = (moves[k] || 0) + 1;
      }
    }
  }
  ops.push({ updateOne: { filter: { leadId: m.id }, update: { $set: set } } });
}

console.log(`판정: ${JSON.stringify(counts)}`);
console.log(`DB 반영 대상 ${ops.length}곳 · 목록에 없음 ${stat.없음} · 중복정리됨 ${stat.중복제거됨} · 단계 손 안 댐 ${stat.손안댐}`);
if (MOVE) console.log(`단계 이동: ${JSON.stringify(moves, null, 1)}`);

if (!APPLY) { console.log('\n(적용하려면 --apply, 단계까지 옮기려면 --move 도 함께)'); await mongoose.disconnect(); process.exit(0); }

let done = 0;
for (let i = 0; i < ops.length; i += 200) {
  const r = await L.bulkWrite(ops.slice(i, i + 200));
  done += r.modifiedCount;
  process.stdout.write(`\r  저장 ${Math.min(i + 200, ops.length)}/${ops.length}`);
}
console.log(`\n저장 완료 — ${done}곳`);
console.log(`검증 완료 단계 업체 수: ${await L.countDocuments({ stage: 'verified', deleted: { $ne: true } })}곳`);
await mongoose.disconnect();
