/** 복사 이후 기존 DB에 생기거나 바뀐 것만 새 DB로 가져온다. 새 DB에만 있는 것은 건드리지 않는다. */
import fs from 'node:fs';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const o = new MongoClient(env.MONGODB_URI_OLD); const n = new MongoClient(env.MONGODB_URI);
await o.connect(); await n.connect();
const O = o.db(), N = n.db();
const cols = (await O.listCollections().toArray()).filter((c) => c.type !== 'view').map((c) => c.name).sort();
let ins = 0, upd = 0, onlyNew = 0;
for (const name of cols) {
  const load = async (db) => {
    const m = new Map();
    for await (const d of db.collection(name).find({})) m.set(String(d._id), EJSON.stringify(d, { relaxed: false }));
    return m;
  };
  const [a, b] = await Promise.all([load(O), load(N)]);
  const toIns = [], toUpd = [];
  for (const [id, s] of a) { if (!b.has(id)) toIns.push(id); else if (b.get(id) !== s) toUpd.push(id); }
  const extra = [...b.keys()].filter((id) => !a.has(id));
  if (toIns.length) {
    const docs = await O.collection(name).find({ _id: { $in: toIns.map((id) => EJSON.parse(a.get(id))._id) } }).toArray();
    await N.collection(name).insertMany(docs, { ordered: false }); ins += docs.length;
  }
  for (const id of toUpd) {
    const d = EJSON.parse(a.get(id));
    await N.collection(name).replaceOne({ _id: d._id }, d); upd++;
  }
  onlyNew += extra.length;
  if (toIns.length || toUpd.length || extra.length)
    console.log(`  ${name.padEnd(20)} 새로 넣음 ${toIns.length} · 덮어씀 ${toUpd.length} · 새 DB에만 ${extra.length}`);
}
console.log(`\n합계: 새로 넣음 ${ins} · 덮어씀 ${upd} · 새 DB에만 있는 것 ${onlyNew}(전환 후 생긴 것, 그대로 둠)`);
await o.close(); await n.close();
