/** 기존 클러스터에 뭐가 얼마나 있는지 — 읽기만 한다 */
import fs from 'node:fs';
import { MongoClient } from 'mongodb';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const c = new MongoClient(env.MONGODB_URI); await c.connect();
const { databases, totalSize } = await c.db().admin().listDatabases();
const mb = (b) => (b / 1048576).toFixed(1) + 'MB';
console.log(`클러스터 전체 ${mb(totalSize)} · DB ${databases.length}개\n`);
for (const d of databases.sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)) {
  const mark = d.name === 'yogiboB2b' ? '  ← 우리 것(이전 완료)' : ['admin', 'local', 'config'].includes(d.name) ? '  (시스템)' : '';
  console.log(`${mb(d.sizeOnDisk).padStart(9)}  ${d.name}${mark}`);
}
console.log('\n=== test DB 안 ===');
const t = c.db('test');
const cols = await t.listCollections().toArray();
if (!cols.length) console.log('  비어 있음');
for (const col of cols) {
  const n = await t.collection(col.name).countDocuments();
  const one = await t.collection(col.name).findOne({}, { sort: { _id: 1 } });
  const last = await t.collection(col.name).findOne({}, { sort: { _id: -1 } });
  const when = (d) => { try { return d?._id?.getTimestamp?.().toISOString().slice(0, 10) || '?'; } catch { return '?'; } };
  console.log(`  ${col.name.padEnd(22)} ${String(n).padStart(6)}건 · ${when(one)} ~ ${when(last)}`);
}
await c.close();
