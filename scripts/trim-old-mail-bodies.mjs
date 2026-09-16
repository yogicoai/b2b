/**
 * **오래된 메일의 본문만 비운다** — 저장 공간 관리 (2026-09-15, 대표님 결정).
 *
 * 규칙:
 *   - 최근 메일(기본 14일)   : 본문을 DB 에 그대로 둔다 — 자주 열어보고, 열 때 빨라야 한다.
 *   - 그보다 오래된 메일     : 원문(raw.html·raw.text)을 비우고 제목·발신자·요약·분석만 남긴다.
 *                              열어보면 그때 이카운트 서버에서 원문을 받아 보여준다 (lib/mail/body.ts).
 *   - 광고·자동발송·뉴스레터 : 기간과 상관없이 원문을 비운다 (다시 읽을 일이 없다).
 * 미리보기(bodyStripped)는 4,000자까지 남긴다 — 목록·AI 분석·검색에 쓰인다.
 *
 * 메일 자체는 지우지 않는다. 메일 서버에 원본이 그대로 있으므로 본문은 언제든 다시 받을 수 있다.
 *
 * **다시 받아올 수 있는 것만 비운다** — 등록이 풀린 계정의 메일, 위치(folder·uid)가 없는 메일은
 * 비우면 본문이 영영 사라진다. 그런 것은 손대지 않고 몇 통인지만 알려 준다.
 *
 * 미리보기: node scripts/trim-old-mail-bodies.mjs [--days=14]
 * 적용:     node scripts/trim-old-mail-bodies.mjs [--days=14] --apply
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const APPLY = process.argv.includes('--apply');
const days = Number((process.argv.find((a) => a.startsWith('--days=')) || '--days=14').split('=')[1]);
const PREVIEW = 4000;
const NOISE = ['ad', 'system', 'newsletter'];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const M = db.collection('inboundmails');
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
const cut = new Date(Date.now() - days * 86400000);

const sizes = async () => {
  const [r] = await M.aggregate([{ $group: {
    _id: null,
    html: { $sum: { $strLenBytes: { $ifNull: ['$raw.html', ''] } } },
    text: { $sum: { $strLenBytes: { $ifNull: ['$raw.text', ''] } } },
    stripped: { $sum: { $strLenBytes: { $ifNull: ['$bodyStripped', ''] } } },
  } }]).toArray();
  const st = await db.command({ collStats: 'inboundmails' });
  return { ...r, data: st.size, disk: st.storageSize, n: st.count };
};

const before = await sizes();
console.log(`받은 메일 ${before.n}통 · 원문 HTML ${mb(before.html)} · 텍스트 ${mb(before.text)} · 미리보기 ${mb(before.stripped)} · 데이터 ${mb(before.data)}`);

// 비울 대상: 오래된 것 또는 광고류인데 아직 원문이 남아 있는 것
const hasBody = {
  $and: [
    { $or: [{ date: { $lt: cut } }, { classification: { $in: NOISE } }] },
    { $or: [{ 'raw.html': { $nin: ['', null] } }, { $expr: { $gt: [{ $strLenCP: { $ifNull: ['$raw.text', ''] } }, PREVIEW] } }] },
  ],
};
// 서버에서 다시 받아올 수 있는 것만 — lib/mail/body.ts loadMailBody 가 쓰는 조건과 같다
const accounts = await db.collection('mailaccounts').find({}, { projection: { _id: 1 } }).toArray();
const liveIds = accounts.map((a) => String(a._id));
const refetchable = { accountId: { $in: liveIds }, folder: { $nin: ['', null] }, uid: { $nin: [0, null] } };
const target = { ...hasBody, ...refetchable };

const n = await M.countDocuments(target);
const skipped = await M.countDocuments({ ...hasBody, $nor: [refetchable] });
const recentKept = await M.countDocuments({ date: { $gte: cut }, classification: { $nin: NOISE } });
console.log(`비울 메일 ${n}통 (${days}일 이전 또는 광고류) · DB 에 본문을 그대로 둘 최근 메일 ${recentKept}통`);
if (skipped) console.log(`  건드리지 않음 ${skipped}통 — 계정이 없거나 위치 정보가 없어 다시 받아올 수 없습니다`);

if (!APPLY) { console.log('\n(미리보기 — 적용하려면 --apply)'); await mongoose.disconnect(); process.exit(0); }

const r = await M.updateMany(target, [{ $set: {
  'raw.html': '',
  // 미리보기만 남긴다 — 목록·검색·AI 분석 입력
  'raw.text': { $substrCP: [{ $ifNull: ['$raw.text', ''] }, 0, PREVIEW] },
  bodyStripped: { $substrCP: [{ $ifNull: ['$bodyStripped', { $substrCP: [{ $ifNull: ['$raw.text', ''] }, 0, PREVIEW] }] }, 0, PREVIEW] },
  rawTruncated: true,
} }]);
const after = await sizes();
console.log(`\n비움 ${r.modifiedCount}통 · 원문 HTML ${mb(after.html)} · 텍스트 ${mb(after.text)} · 데이터 ${mb(after.data)}`);
console.log(`줄어든 데이터 ${mb(before.data - after.data)}`);
console.log('원문은 메일 서버에 그대로 있고, 메일을 열면 그때 받아 옵니다.');
await mongoose.disconnect();
