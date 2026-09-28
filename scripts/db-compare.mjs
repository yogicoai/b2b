/**
 * 두 DB 를 대조한다 — 건수·문서 내용 지문(SHA-256)·인덱스 정의까지.
 *
 * 2026-09-28 DB 이전(기존 클러스터 → cluster0)에 쓴 것이다. 기존 DB 를 지우기
 * 전에 한 번 더 돌려 확인한다. .env.local 의 MONGODB_URI_OLD 와 MONGODB_URI 를 읽는다.
 *
 * 주의: 대조만 한다. 쓰기는 하지 않는다.
 */
/** 이전 전후 대조 — 건수·인덱스·문서 내용까지 본다. 읽기만 한다. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const src = new MongoClient(env.MONGODB_URI_OLD); const dst = new MongoClient(env.MONGODB_URI);
await src.connect(); await dst.connect();
const S = src.db(), D = dst.db();

const names = (a) => a.map((c) => c.name).filter((n) => !n.startsWith('__')).sort();
const sc = names(await S.listCollections().toArray()), dc = names(await D.listCollections().toArray());
let bad = 0;
const miss = sc.filter((n) => !dc.includes(n)), extra = dc.filter((n) => !sc.includes(n));
if (miss.length) { console.log('❌ 대상에 없는 컬렉션: ' + miss.join(', ')); bad++; }
if (extra.length) { console.log('⚠️ 대상에만 있는 컬렉션: ' + extra.join(', ')); }

/** 문서 전체의 지문 — _id 순으로 정렬해 이어붙인 해시. 한 글자만 달라도 어긋난다. */
async function fingerprint(db, name) {
  const h = crypto.createHash('sha256');
  const cur = db.collection(name).find({}).sort({ _id: 1 });
  for await (const d of cur) h.update(EJSON.stringify(d, { relaxed: false }));
  return h.digest('hex').slice(0, 16);
}
const idxOf = async (db, n) => (await db.collection(n).indexes())
  .map((i) => `${i.name}|${JSON.stringify(i.key)}|u=${!!i.unique}|s=${!!i.sparse}|p=${i.partialFilterExpression ? JSON.stringify(i.partialFilterExpression) : '-'}`).sort();

console.log('컬렉션'.padEnd(22) + '원본'.padStart(7) + '새것'.padStart(7) + '  지문    인덱스');
for (const n of sc) {
  const [a, b] = await Promise.all([S.collection(n).countDocuments(), D.collection(n).countDocuments()]);
  const [fa, fb] = await Promise.all([fingerprint(S, n), fingerprint(D, n)]);
  const [ia, ib] = await Promise.all([idxOf(S, n), idxOf(D, n)]);
  const idxSame = JSON.stringify(ia) === JSON.stringify(ib);
  const ok = a === b && fa === fb && idxSame;
  if (!ok) bad++;
  console.log(`${(ok ? '✅ ' : '❌ ') + n.padEnd(20)}${String(a).padStart(7)}${String(b).padStart(7)}  ${fa === fb ? '같음' : '다름'}  ${idxSame ? ia.length + '개 같음' : `다름 (원본 ${ia.length} / 새것 ${ib.length})`}`);
  if (!idxSame) { ia.filter((x) => !ib.includes(x)).forEach((x) => console.log('      새것에 없음: ' + x)); ib.filter((x) => !ia.includes(x)).forEach((x) => console.log('      새것에만: ' + x)); }
}
console.log(bad ? `\n❌ 어긋난 곳 ${bad}군데 — 이전 삭제하면 안 된다` : '\n✅ 전부 일치 — 건수·문서 내용·인덱스까지 같다');
await src.close(); await dst.close();
