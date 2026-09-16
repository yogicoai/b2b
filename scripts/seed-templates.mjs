import fs from 'fs';
import { MongoClient } from 'mongodb';

// dotenv 기본값은 .env 만 읽는다 — 이 프로젝트 설정은 .env.local 에 있다
const env = fs.readFileSync('.env.local', 'utf8');
const MONGODB_URI = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');

const BODY_INTRO = `<p>Dear [회사명] team,</p>
<p>I'm reaching out from <b>Yogico</b>, a Korean beauty export partner based in Seoul. We work directly with Korean manufacturers and help overseas retailers and distributors bring K-beauty lines into their markets.</p>
<p>Looking at what you already carry, I think a few of our lines would fit well alongside your current range. We can support you with:</p>
<ul>
  <li>Direct factory pricing — no layered middlemen</li>
  <li>CPNP / FDA documentation prepared on our side</li>
  <li>Flexible MOQ for a first trial order</li>
  <li>Mixed pallets so you can test several brands at once</li>
</ul>
<p>If this is relevant, I'd be glad to send our catalogue and current price list. Would you be open to a short call this month?</p>
<p>Looking forward to hearing from you.</p>`;

const BODY_FOLLOWUP = `<p>Dear [회사명] team,</p>
<p>I wrote to you recently about K-beauty supply from Korea and wanted to follow up briefly, in case my earlier note got buried.</p>
<p>To make it easier, here is the short version:</p>
<ul>
  <li>We ship directly from Korean manufacturers to your warehouse</li>
  <li>Documentation (CPNP / FDA) is handled on our side</li>
  <li>First orders can start small — we don't require full-container volume</li>
</ul>
<p>If the timing isn't right, just let me know and I won't follow up again. If it is, I'm happy to send the catalogue and pricing straight away.</p>
<p>Thank you for your time.</p>`;

const SEEDS = [
  {
    name: '첫 소개 — 해외 유통사용',
    purpose: 'intro',
    subject: 'K-beauty supply partnership — [회사명]',
    body: BODY_INTRO,
  },
  {
    name: '2차 팔로우업 — 답장 없을 때',
    purpose: 'followup',
    subject: 'Following up — K-beauty supply for [회사명]',
    body: BODY_FOLLOWUP,
  },
];

const c = new MongoClient(MONGODB_URI);
await c.connect();
const col = c.db().collection('emailtemplates');

for (const t of SEEDS) {
  const exists = await col.findOne({ name: t.name });
  if (exists) {
    console.log('이미 있음 —', t.name);
    continue;
  }
  const now = new Date();
  await col.insertOne({
    ...t,
    language: 'en',
    bodyIsHtml: true,
    isActive: true,
    appendAccountSignature: true,
    adPrefix: false,
    createdBy: 'admin',
    createdAt: now,
    updatedAt: now,
    __v: 0,
  });
  console.log('등록 —', t.name);
}

const all = await col.find({}).sort({ updatedAt: -1 }).toArray();
console.log('\n=== 저장된 양식', all.length, '개 ===');
all.forEach((x) => console.log('  ·', (x.purpose || 'other').padEnd(20), '|', x.name, '|', x.subject));
await c.close();
