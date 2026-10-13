import fs from 'node:fs';
import { MongoClient } from 'mongodb';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const c = new MongoClient(env.MONGODB_URI); await c.connect(); const db = c.db();
const us = await db.collection('unsubscribes').find({}).project({ email: 1, source: 1, reason: 1 }).toArray();
const set = new Map(us.map((u) => [String(u.email).toLowerCase(), u]));
console.log(`수신거부 명단 ${us.length}건 · 경로별: ` +
  Object.entries(us.reduce((a, u) => (a[u.source || '-'] = (a[u.source || '-'] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(' · '));
const leads = await db.collection('leads').find({}, { projection: { leadId: 1, Company: 1, Email: 1, stage: 1, unsubscribed: 1, readyForOutreach: 1, emailHistory: 1 } }).toArray();
const hit = leads.filter((l) => set.has(String(l.Email || '').toLowerCase()));
console.log(`\n그 주소를 쓰는 리드 ${hit.length}곳`);
let flagged = 0; const unflagged = [];
for (const l of hit) { if (l.unsubscribed === true) flagged++; else unflagged.push(l); }
console.log(`  리드에 수신거부 표시 있음 ${flagged}곳 / 없음 ${unflagged.length}곳`);
unflagged.forEach((l) => console.log(`     · ${l.Company} (${l.Email}) 단계=${l.stage} 발송 ${(l.emailHistory || []).filter((h) => h.status === 'sent').length}회`));
// 명단에 있는데 리드가 아예 없는 주소
const noLead = [...set.keys()].filter((e) => !leads.some((l) => String(l.Email || '').toLowerCase() === e));
console.log(`\n리드가 없는 거부 주소 ${noLead.length}건: ${noLead.slice(0, 6).join(', ')}${noLead.length > 6 ? ' …' : ''}`);
await c.close();
