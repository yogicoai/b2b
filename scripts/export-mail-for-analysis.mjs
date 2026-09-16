/**
 * AI 분석이 안 된 메일을 JSON 으로 뽑는다.
 * Anthropic API 를 부르지 않고 Claude Code 세션에서 직접 분석하기 위한 입력.
 */
import mongoose from 'mongoose';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
await mongoose.connect(uri);
const db = mongoose.connection.db;

// 기본은 어제까지 받은 것만. 오늘 것은 아직 들어오는 중이라 다음 회차에 돌린다.
// --include-today 를 주면 지금 이 순간까지 받은 것을 전부 뽑는다
// ("오늘 온 것까지 다 해놔 달라" 는 요청일 때).
const INCLUDE_TODAY = process.argv.includes('--include-today');
// --out <폴더> — 회차마다 폴더를 나눠, 이미 넣은 예전 batch 파일을 덮지 않게 한다
const outIdx = process.argv.indexOf('--out');
const OUT_DIR = outIdx > 0 ? process.argv[outIdx + 1] : 'scripts/mail-analysis';

// --include-noise — 광고·자동발송 메일도 뽑는다 ("받은 메일 전부 AI 분석" 요청일 때).
// 기본은 뺀다: 광고는 읽을 필요가 없고, 화면도 광고 폴더로 따로 치운다.
const INCLUDE_NOISE = process.argv.includes('--include-noise');

// --mailbox=david@yogico.kr — 그 메일 주소로 등록된 계정이 수집한 것만 (대표님 것만 돌릴 때).
// 같은 주소가 여러 번 등록돼 있을 수 있으므로(관리자 등록 + 본인 등록) 전부 찾아 묶는다.
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const MAILBOX = arg('mailbox');
// --days=30 — 최근 며칠치만 (오래된 것까지 다 돌릴 필요가 없을 때)
const DAYS = Number(arg('days')) || 0;

let accountFilter = {};
if (MAILBOX) {
  const escaped = MAILBOX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const accts = await db.collection('mailaccounts')
    .find({ smtpUser: new RegExp(`^${escaped}$`, 'i') }, { projection: { _id: 1, owner: 1 } }).toArray();
  if (!accts.length) { console.error(`${MAILBOX} 로 등록된 계정이 없습니다`); process.exit(1); }
  accountFilter = { accountId: { $in: accts.map((a) => String(a._id)) } };
  console.log(`메일함: ${MAILBOX} · 등록 ${accts.length}개 (${accts.map((a) => a.owner).join(', ')})`);
}

const until = new Date();
if (!INCLUDE_TODAY) until.setHours(0, 0, 0, 0);
const dateFilter = DAYS ? { $lt: until, $gte: new Date(Date.now() - DAYS * 86400000) } : { $lt: until };
const mails = await db.collection('inboundmails').find({
  ...(INCLUDE_NOISE ? {} : { classification: { $nin: ['ad', 'system'] } }),
  ...accountFilter,
  direction: { $ne: 'out' },
  trashedAt: null,
  'analysis.method': { $ne: 'ai' },
  date: dateFilter,
}).sort({ date: -1 }).toArray();
console.log('기준: ' + until.toISOString() + (INCLUDE_TODAY ? ' (오늘 포함 · 지금까지)' : ' 이전 수신분')
  + (DAYS ? ` · 최근 ${DAYS}일치만` : ''));

// 리드 회사명을 붙여준다 — 우리가 먼저 콜드메일을 보낸 곳인지가 판단에 크게 작용한다
const leadIds = [...new Set(mails.map((m) => m.leadId).filter(Boolean))];
const leads = await db.collection('leads').find({ leadId: { $in: leadIds } }, { projection: { leadId: 1, Company: 1, Region: 1 } }).toArray();
const leadMap = new Map(leads.map((l) => [l.leadId, l]));

// 2026-09-15부터 받은 메일의 본문은 DB 에 저장하지 않는다 (lib/mail/ingest.ts trimRawForStorage).
// 남는 것은 미리보기 4,000자뿐이고, 전문은 메일 서버에 있다.
// 이 스크립트는 한 번에 수백 통을 뽑으므로 메일 서버에는 붙지 않는다 — 통마다 IMAP 접속이 생긴다.
// 대신 있는 미리보기로 뽑고, **뒷부분이 잘렸다는 사실을 JSON 에 함께 적는다**.
// 분석하는 쪽이 "이게 메일 전부가 아니다" 를 알아야 없는 내용을 단정하지 않는다.
const PREVIEW_MAX = 4000;
const isPreviewOnly = (m) =>
  !m.raw?.html && String(m.raw?.text || '').length <= PREVIEW_MAX && Boolean(m.rawTruncated);

const out = mails.map((m) => {
  const body = (m.bodyStripped || m.raw?.text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const preview = isPreviewOnly(m);
  const lead = m.leadId ? leadMap.get(m.leadId) : null;
  return {
    id: String(m._id),
    subject: m.subject || '',
    from: `${m.from?.name || ''} <${m.from?.address || ''}>`.trim(),
    to: (m.to || []).map((t) => t.address).join(', '),
    date: m.date ? new Date(m.date).toISOString().slice(0, 10) : '',
    folder: m.folder || '',
    group: m.group || '',
    hasAttach: (m.attachments || []).length,
    ruleClass: m.classification,
    lead: lead ? `${lead.Company} (${lead.Region})` : '',
    body: body.slice(0, 2400),
    // 잘린 이유는 둘이다: 여기서 2,400자로 자른 것 · 애초에 미리보기만 저장된 것
    truncated: body.length > 2400 || preview,
    // 본문이 미리보기뿐이라 전문은 메일 서버에 있다 (앱에서 메일을 열면 받아온다)
    bodyIsPreview: preview,
  };
});

fs.mkdirSync(OUT_DIR, { recursive: true });
const CHUNK = 25;
let files = 0;
for (let i = 0; i < out.length; i += CHUNK) {
  const p = `${OUT_DIR}/batch-${String(files + 1).padStart(2, '0')}.json`;
  fs.writeFileSync(p, JSON.stringify(out.slice(i, i + CHUNK), null, 1), 'utf8');
  files++;
}
console.log(`총 ${out.length}통 → ${files}개 파일 (batch-01 ~ batch-${String(files).padStart(2,'0')})`);
console.log(`본문 잘린 것: ${out.filter((o) => o.truncated).length}통 (그중 미리보기만 저장된 것: ${out.filter((o) => o.bodyIsPreview).length}통 — 전문은 메일 서버에 있다)`);
console.log('\n오늘 날짜 기준(기한 계산용):', new Date().toISOString().slice(0, 10));
await mongoose.disconnect();
