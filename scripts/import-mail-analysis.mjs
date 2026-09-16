/**
 * Claude Code 세션에서 만든 분석 결과를 InboundMail 에 기록한다.
 * /api/mail/analyze 가 쓰는 것과 같은 필드·같은 모양으로 넣어야 화면이 동일하게 뜬다.
 *
 * 사용: node scripts/import-mail-analysis.mjs scripts/mail-analysis/result-01.json [--apply]
 */
import mongoose from 'mongoose';
import fs from 'fs';

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('결과 JSON 경로가 필요합니다'); process.exit(1); }

const env = fs.readFileSync('.env.local', 'utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));

const VALID_CLASS = ['b2b', 'inquiry', 'partner', 'newsletter', 'ad', 'system', 'unknown'];
const VALID_URGENCY = ['high', 'mid', 'low'];
const VALID_DTYPE = ['reply_by', 'quote_due', 'meeting', 'payment', 'contract', 'event', 'other'];

// analyze-mail.ts 와 같은 규칙: YYYY-MM-DD 만 받고 KST 정오로 고정
const parseDeadline = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const problems = [];
for (const r of rows) {
  if (!r.id) problems.push('id 없음');
  if (r.classification && !VALID_CLASS.includes(r.classification)) problems.push(`${r.id}: classification=${r.classification}`);
  if (r.urgency && !VALID_URGENCY.includes(r.urgency)) problems.push(`${r.id}: urgency=${r.urgency}`);
  if (r.deadline && !parseDeadline(r.deadline)) problems.push(`${r.id}: deadline=${r.deadline}`);
}
if (problems.length) { console.error('입력 오류:\n  ' + problems.join('\n  ')); process.exit(1); }

console.log(`${rows.length}건 · 회신필요 ${rows.filter((r) => r.needsReply).length} · 기한 ${rows.filter((r) => parseDeadline(r.deadline)).length}`);
if (!APPLY) { console.log('[미적용] --apply 를 붙이면 기록합니다'); process.exit(0); }

await mongoose.connect(uri);
const db = mongoose.connection.db;
const now = new Date();
const MODEL = 'claude-opus-5 (Claude Code 세션 직접 분석 · API 과금 없음)';

const ops = rows.map((r) => ({
  updateOne: {
    filter: { _id: new mongoose.Types.ObjectId(r.id) },
    update: { $set: {
      ...(r.classification ? { classification: r.classification, classifiedBy: 'ai' } : {}),
      ...(r.lang ? { lang: r.lang } : {}),
      translation: {
        subject: r.translationSubject || '',
        body: r.translationBody || '',
        translatedAt: now,
      },
      analysis: {
        method: 'ai',
        needsReply: Boolean(r.needsReply),
        replyReason: r.replyReason || '',
        deadline: parseDeadline(r.deadline),
        deadlineText: r.deadlineText || '',
        deadlineType: VALID_DTYPE.includes(r.deadlineType) ? r.deadlineType : null,
        urgency: r.urgency || 'low',
        topic: r.topic || '',
        summary: r.summary || '',
        keyPoints: Array.isArray(r.keyPoints) ? r.keyPoints : [],
        intent: r.intent || '',
        suggestedAction: r.suggestedAction || '',
        analyzedAt: now,
        model: MODEL,
        usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, model: MODEL, costKrw: 0 },
      },
    } },
  },
}));

const res = await db.collection('inboundmails').bulkWrite(ops);
console.log(`기록 완료 — matched ${res.matchedCount} · modified ${res.modifiedCount}`);

// 리드 쪽 지표도 같이 갱신 (파이프라인 '답장 받음' 화면에서 쓰는 값)
const ids = rows.map((r) => new mongoose.Types.ObjectId(r.id));
const mails = await db.collection('inboundmails').find({ _id: { $in: ids }, leadId: { $nin: ['', null] } }).toArray();
let leadUpdates = 0;
for (const m of mails) {
  const set = { needsReply: Boolean(m.analysis?.needsReply) };
  if (m.analysis?.deadline) set.replyDeadline = new Date(m.analysis.deadline).toISOString();
  const r = await db.collection('leads').updateOne({ leadId: m.leadId }, { $set: set });
  leadUpdates += r.modifiedCount;
}
console.log(`리드 지표 갱신 ${leadUpdates}건`);
await mongoose.disconnect();
