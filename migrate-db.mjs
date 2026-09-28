/** yogiboB2b 이전 — 원본은 읽기만 한다. 대상이 비어 있지 않으면 멈춘다. */
import fs from 'node:fs';
import { MongoClient } from 'mongodb';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));

const src = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const dst = new MongoClient(env.MONGODB_URI_NEW, { serverSelectionTimeoutMS: 15000 });
await src.connect(); await dst.connect();
const S = src.db(), D = dst.db();
console.log(`원본 ${S.databaseName} → 대상 ${D.databaseName}\n`);

const cols = (await S.listCollections().toArray()).filter((c) => c.type !== 'view').map((c) => c.name).sort();
const existing = (await D.listCollections().toArray()).map((c) => c.name);
const dirty = existing.filter((n) => !n.startsWith('__'));
if (dirty.length) { console.log('❌ 대상이 비어 있지 않다: ' + dirty.join(', ')); process.exit(1); }

const report = [];
for (const name of cols) {
  const total = await S.collection(name).countDocuments();
  let moved = 0;
  if (total) {
    const cur = S.collection(name).find({}, { raw: false });
    let batch = [];
    for await (const doc of cur) {
      batch.push(doc);
      if (batch.length >= 500) { await D.collection(name).insertMany(batch, { ordered: false }); moved += batch.length; batch = []; }
    }
    if (batch.length) { await D.collection(name).insertMany(batch, { ordered: false }); moved += batch.length; }
  } else {
    await D.createCollection(name);   // 빈 컬렉션도 인덱스는 만들어 둔다
  }
  // 인덱스 재생성 (_id_ 는 자동)
  const idx = (await S.collection(name).indexes()).filter((i) => i.name !== '_id_');
  for (const i of idx) {
    const { key, name: n, v, ns, background, ...opts } = i;
    await D.collection(name).createIndex(key, { name: n, ...opts });
  }
  report.push({ name, total, moved, idx: idx.length });
  console.log(`  ${name.padEnd(22)} ${String(moved).padStart(6)}건 / 원본 ${total}건 · 인덱스 ${idx.length}개`);
}
fs.writeFileSync('migrate-report.json', JSON.stringify(report, null, 1));
console.log(`\n컬렉션 ${cols.length}개 완료`);
await src.close(); await dst.close();
