/**
 * 되돌릴 후보 4통의 실제 내용을 통째로 꺼내 본다.
 *
 * 제목만 보고 "광고가 아니다" 라고 판단하면 틀린다. 본문 앞부분과
 * 같은 발신자에게서 온 다른 메일까지 봐야 그 주소가 사람인지 자동발송인지
 * 갈린다. DB 를 고치기 전에 눈으로 확인할 근거를 만든다.
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const M = mongoose.connection.collection('inboundmails');

const SUSPECT = ['ad', 'newsletter'];
const cand = await M.find({ trashedAt: null, direction: 'in', classification: { $in: SUSPECT } })
  .project({ subject: 1, from: 1, group: 1, groupBy: 1, classification: 1, classifiedBy: 1,
             raw: 1, bodyStripped: 1, receivedAt: 1, date: 1, analysis: 1, threadKey: 1 }).toArray();

const hits = [];
for (const r of cand) {
  const addr = r.from?.address;
  if (!addr) continue;
  const real = await M.countDocuments({
    trashedAt: null, direction: 'in', 'from.address': addr,
    classification: { $nin: ['ad', 'newsletter', 'system'] },
  });
  if (real > 0) hits.push({ ...r, realFromSameSender: real });
}

console.log(`되돌릴 후보 ${hits.length}통\n${'='.repeat(78)}`);
for (const [i, h] of hits.entries()) {
  const body = String(h.bodyStripped || h.raw || '').replace(/\s+/g, ' ').trim();
  console.log(`\n[${i + 1}] ${h.subject}`);
  console.log(`    보낸이   : ${h.from?.name || ''} <${h.from?.address}>`);
  console.log(`    분류     : ${h.classification} (${h.classifiedBy || '-'})`);
  console.log(`    폴더     : ${h.group || '미분류'} (${h.groupBy || '-'})`);
  console.log(`    받은날   : ${String(h.receivedAt || h.date || '').slice(0, 16)}`);
  console.log(`    같은주소 비광고 메일: ${h.realFromSameSender}통`);
  console.log(`    AI요약   : ${String(h.analysis?.summary || '(없음)').slice(0, 150)}`);
  console.log(`    회신필요 : ${h.analysis?.needsReply === true ? '예' : h.analysis?.needsReply === false ? '아니오' : '(판정없음)'}`);
  console.log(`    본문     : ${body.slice(0, 420)}`);

  // 같은 주소에서 온 '비광고' 메일이 실제로 뭔지 — 진짜 사람인지 가른다
  const sib = await M.find({
    trashedAt: null, direction: 'in', 'from.address': h.from.address,
    classification: { $nin: ['ad', 'newsletter', 'system'] },
  }).project({ subject: 1, classification: 1 }).limit(5).toArray();
  console.log(`    같은 주소의 다른 메일:`);
  for (const s of sib) console.log(`        [${String(s.classification || '-').padEnd(8)}] ${String(s.subject || '').slice(0, 62)}`);
}
console.log(`\n${'='.repeat(78)}`);
await mongoose.disconnect();
