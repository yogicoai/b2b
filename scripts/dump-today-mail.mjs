/**
 * 오늘 온 메일의 본문을 꺼낸다 — 내가 직접 읽고 분석/번역해서 다시 넣기 위해.
 *
 * Claude API 를 호출하지 않는다. 세션 안에서 내가 읽고 판단해 DB 에 쓴다
 * (유료 호출 없이 결과만 채우는 방식 — 이 프로젝트에서 계속 해온 방식이다).
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local' });

const KST = 9 * 3600000;
const seoulDayStart = (at = new Date()) => {
  const s = new Date(at.getTime() + KST);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - KST);
};
const seoul = (d) => new Date(new Date(d).getTime() + KST).toISOString().slice(0, 16).replace('T', ' ');

await mongoose.connect(process.env.MONGODB_URI);
const Mail = mongoose.connection.collection('inboundmails');

const rows = await Mail.find({
  trashedAt: null, direction: 'in', date: { $gte: seoulDayStart() },
}).sort({ date: -1 }).toArray();

console.log(`오늘 온 메일 ${rows.length}통\n${'='.repeat(78)}`);
for (const m of rows) {
  console.log(`\n### _id: ${m._id}`);
  console.log(`날짜   : ${seoul(m.date)} (서울)`);
  console.log(`발신   : ${m.from?.name || ''} <${m.from?.address || ''}>`);
  console.log(`제목   : ${m.subject || ''}`);
  console.log(`폴더   : ${m.group || '(미분류)'}`);
  console.log(`분류   : ${m.classification || '(없음)'}   상태: ${m.status || ''}`);
  console.log(`리드   : ${m.leadId || '(미연결)'}`);
  console.log(`기존분석: ${m.analysis?.method || '없음'} / 번역: ${m.translation?.body ? '있음' : '없음'}`);
  const body = String(m.body || m.bodyStripped || '').replace(/\r/g, '').trim();
  console.log(`--- 본문 (${body.length}자) ---`);
  console.log(body.slice(0, 2600));
  if (body.length > 2600) console.log(`\n…(${body.length - 2600}자 더 있음)`);
  console.log('-'.repeat(78));
}

await mongoose.disconnect();
