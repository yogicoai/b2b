/**
 * 예약 발송이 실제로 나가는지 지켜본다.
 *
 * 상태가 바뀔 때만 한 줄 찍는다. pending 이 하나도 안 남으면 끝낸다.
 * (Vercel 크론은 하루 1회라, 화면의 [⏱ 지금 예약분 내보내기] 를 눌러야 움직인다)
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

const KST = 9 * 3600000;
const k = (d) => new Date(new Date(d).getTime() + KST).toISOString().slice(11, 19);

await mongoose.connect(process.env.MONGODB_URI);
const S = mongoose.connection.collection('emailschedules');

const seen = new Map();
let quiet = 0;

for (let i = 0; i < 200; i++) {
  const rows = await S.find({}).sort({ scheduledFor: 1 }).toArray();
  let changed = false;

  for (const s of rows) {
    const id = String(s._id);
    const sig = `${s.status}|${s.attempts || 0}|${s.lastError || ''}`;
    if (seen.get(id) === sig) continue;
    if (seen.has(id)) {                       // 처음 본 건 알리지 않는다(기존 상태)
      changed = true;
      const mark = s.status === 'sent' ? '보냄' : s.status === 'failed' ? '실패' : s.status;
      console.log(
        `[${k(new Date())}] ${mark}  ${s.to}  (예정 ${k(s.scheduledFor)}, 시도 ${s.attempts || 0})` +
        (s.lastError ? `  사유: ${String(s.lastError).slice(0, 120)}` : ''),
      );
    }
    seen.set(id, sig);
  }

  const pending = rows.filter((r) => r.status === 'pending').length;
  if (!pending) {
    console.log(`[${k(new Date())}] 남은 예약 없음 — 지켜보기를 마칩니다`);
    break;
  }
  quiet = changed ? 0 : quiet + 1;
  await new Promise((r) => setTimeout(r, 15000));
}

await mongoose.disconnect();
