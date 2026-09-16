/**
 * 사람별 로그인 아이디를 만든다 (2026-09-14, 대표님 요청).
 *   david — 대표님 · hoon — 전무님 · 초기 비밀번호 yogibo
 * 비밀번호는 로그인(api/auth/login)과 같은 방식(SHA-256)으로 해시해서 넣는다.
 * 이미 있는 아이디는 건드리지 않는다 (비밀번호를 바꿨을 수 있으므로).
 * 각자 로그인해서 [📬 메일 계정 관리]에서 자기 메일을 등록하고, [🔑 아이디 변경하기]에서 비밀번호를 바꾼다.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
await mongoose.connect(process.env.MONGODB_URI);
const U = mongoose.connection.db.collection('adminusers');
const hash = (pw) => crypto.createHash('sha256').update(pw).digest('hex');
for (const username of ['david', 'hoon']) {
  const r = await U.updateOne({ username }, { $setOnInsert: { username, passwordHash: hash('yogibo'), createdAt: new Date() } }, { upsert: true });
  console.log(`${username}: ${r.upsertedCount ? '새로 만듦 (비밀번호 yogibo)' : '이미 있음 — 그대로 둠'}`);
}
console.log('아이디 목록:', (await U.find().project({ username: 1 }).toArray()).map((u) => u.username).join(', '));
await mongoose.disconnect();
