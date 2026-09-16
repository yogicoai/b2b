/**
 * 이미 쌓인 받은 메일의 **원문을 줄인다** — DB 용량이 꽉 차 쓰기(메일 발송·단계 이동)가 막혔을 때 (2026-09-14).
 *
 * 화면이 쓰는 값(bodyStripped·요약·분석)은 그대로 두고, 저장만 차지하던 원문을 줄인다.
 *   - 광고·자동발송·뉴스레터 : 원문 HTML 삭제 · 원문 텍스트 2만 자까지
 *   - 그 밖의 메일          : 원문 HTML 30만 자 · 텍스트 10만 자까지 (앞 대화가 통째로 붙어 6MB 짜리도 있었다)
 * 앞으로 들어오는 메일은 lib/mail/ingest.ts trimRawForStorage 가 같은 기준으로 처음부터 줄여서 넣는다.
 *
 * 미리보기: node scripts/trim-mail-raw.mjs        적용: node scripts/trim-mail-raw.mjs --apply
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const NOISE = ['ad', 'system', 'newsletter'];
const HTML_MAX = 300_000;
const TEXT_MAX = 100_000;
const NOISE_TEXT_MAX = 20_000;

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const M = db.collection('inboundmails');
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';

const sizes = async () => {
  const [r] = await M.aggregate([
    { $group: {
      _id: null,
      html: { $sum: { $strLenBytes: { $ifNull: ['$raw.html', ''] } } },
      text: { $sum: { $strLenBytes: { $ifNull: ['$raw.text', ''] } } },
    } },
  ]).toArray();
  const st = await db.command({ collStats: 'inboundmails' });
  return { html: r?.html || 0, text: r?.text || 0, storage: st.storageSize, data: st.size };
};

const before = await sizes();
console.log(`지금: 원문 HTML ${mb(before.html)} · 원문 텍스트 ${mb(before.text)} · 컬렉션 데이터 ${mb(before.data)} (디스크 ${mb(before.storage)})`);

const noiseN = await M.countDocuments({ classification: { $in: NOISE }, 'raw.html': { $nin: ['', null] } });
const bigHtml = await M.countDocuments({ classification: { $nin: NOISE }, $expr: { $gt: [{ $strLenCP: { $ifNull: ['$raw.html', ''] } }, HTML_MAX] } });
const bigText = await M.countDocuments({ $expr: { $gt: [{ $strLenCP: { $ifNull: ['$raw.text', ''] } }, TEXT_MAX] } });
console.log(`줄일 대상: 광고·자동발송 ${noiseN}통 · 큰 HTML ${bigHtml}통 · 큰 텍스트 ${bigText}통`);

if (!APPLY) {
  console.log('\n(미리보기 — 적용하려면 --apply)');
  await mongoose.disconnect();
  process.exit(0);
}

// 1) 광고·자동발송·뉴스레터 — 원문 HTML 삭제 · 텍스트 자르기
const r1 = await M.updateMany(
  { classification: { $in: NOISE }, $or: [{ 'raw.html': { $nin: ['', null] } }, { $expr: { $gt: [{ $strLenCP: { $ifNull: ['$raw.text', ''] } }, NOISE_TEXT_MAX] } }] },
  [{ $set: {
    'raw.html': '',
    'raw.text': { $substrCP: [{ $ifNull: ['$raw.text', ''] }, 0, NOISE_TEXT_MAX] },
    rawTruncated: true,
  } }],
);
console.log(`광고·자동발송 원문 정리 ${r1.modifiedCount}통`);

// 2) 그 밖의 메일 — 너무 큰 원문만 잘라낸다
const r2 = await M.updateMany(
  { classification: { $nin: NOISE }, $expr: { $gt: [{ $strLenCP: { $ifNull: ['$raw.html', ''] } }, HTML_MAX] } },
  [{ $set: { 'raw.html': { $substrCP: ['$raw.html', 0, HTML_MAX] }, rawTruncated: true } }],
);
const r3 = await M.updateMany(
  { $expr: { $gt: [{ $strLenCP: { $ifNull: ['$raw.text', ''] } }, TEXT_MAX] } },
  [{ $set: { 'raw.text': { $substrCP: ['$raw.text', 0, TEXT_MAX] }, rawTruncated: true } }],
);
console.log(`큰 원문 자르기 — HTML ${r2.modifiedCount}통 · 텍스트 ${r3.modifiedCount}통`);

const after = await sizes();
console.log(`\n뒤: 원문 HTML ${mb(after.html)} · 텍스트 ${mb(after.text)} · 컬렉션 데이터 ${mb(after.data)} (디스크 ${mb(after.storage)})`);
console.log(`줄어든 데이터 ${mb(before.data - after.data)}`);
console.log('※ 무료 등급은 지운 자리가 파일에 남아 디스크 표시가 바로 줄지 않습니다. 새 메일이 그 자리를 다시 씁니다.');
await mongoose.disconnect();
