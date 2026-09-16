/**
 * 용량이 꽉 차 **쓰기가 막혔을 때** — 원문이 지나치게 큰 메일부터 지워 자리를 만든다 (2026-09-14).
 *
 * Atlas 무료 등급은 용량을 넘기면 수정(update)도 막히고 **삭제만** 된다. 그래서 원문을 잘라내는 대신
 * 큰 메일을 통째로 지운다. 지운 메일은 [📥 2달 가져오기]로 다시 받을 수 있고, 그때는
 * lib/mail/ingest.ts trimRawForStorage 가 원문을 줄여서 넣으므로 다시 커지지 않는다.
 *
 * 지우기 전에 어떤 메일이었는지 backups/ 에 남긴다 (제목·보낸사람·날짜·messageId).
 *
 * 미리보기: node scripts/free-space-big-mails.mjs [--min=300]   적용: --apply
 */
import mongoose from 'mongoose';
import fs from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const minKb = Number((process.argv.find((a) => a.startsWith('--min=')) || '--min=300').split('=')[1]);
const MIN = minKb * 1024;

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const M = db.collection('inboundmails');
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';

const rows = await M.aggregate([
  { $project: {
    subject: 1, date: 1, classification: 1, accountId: 1, messageId: 1, folder: 1, leadId: 1,
    from: 1, analyzed: { $eq: ['$analysis.method', 'ai'] },
    size: { $add: [{ $strLenBytes: { $ifNull: ['$raw.html', ''] } }, { $strLenBytes: { $ifNull: ['$raw.text', ''] } }] },
  } },
  { $match: { size: { $gte: MIN } } },
  { $sort: { size: -1 } },
]).toArray();

const total = rows.reduce((n, r) => n + r.size, 0);
console.log(`원문 ${minKb}KB 넘는 메일 ${rows.length}통 · 합계 ${mb(total)}`);
rows.slice(0, 10).forEach((r) => console.log(`  ${(r.size / 1024).toFixed(0).padStart(5)}KB  ${String(r.date).slice(0, 10)}  ${r.analyzed ? 'AI분석됨 ' : '        '}${String(r.subject).slice(0, 48)}`));
console.log(`  AI 분석이 된 메일 ${rows.filter((r) => r.analyzed).length}통 — 지우면 그 분석도 사라집니다 (다시 가져오면 메일은 돌아옵니다)`);

if (!APPLY) { console.log('\n(미리보기 — 적용하려면 --apply)'); await mongoose.disconnect(); process.exit(0); }

fs.mkdirSync('backups', { recursive: true });
const path = `backups/deleted-big-mails-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(path, JSON.stringify(rows.map((r) => ({ id: String(r._id), messageId: r.messageId, subject: r.subject, from: r.from?.address, date: r.date, size: r.size, accountId: r.accountId, folder: r.folder, leadId: r.leadId })), null, 1));
const r = await M.deleteMany({ _id: { $in: rows.map((x) => x._id) } });
console.log(`\n지움 ${r.deletedCount}통 · 목록 ${path}`);
const st = await db.command({ collStats: 'inboundmails' });
console.log(`받은 메일 데이터 ${mb(st.size)} (디스크 ${mb(st.storageSize)})`);
await mongoose.disconnect();
