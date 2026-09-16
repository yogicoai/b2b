import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import { getOwnDomains } from '@/lib/mail/groups';

export const runtime = 'nodejs';

/**
 * GET /api/mail/contacts?q=ㅅㅇㅇㅅ — 메일 쓸 때 받는 사람 자동완성.
 *
 * 세 곳에서 모은다.
 *   1. 받은 메일의 발신자   — 우리와 메일을 주고받은 사람 (사내 동료 포함)
 *   2. 보낸 메일의 받는 사람 — 우리가 먼저 보낸 곳. 답이 없어도 주소는 안다
 *   3. 리드의 대표 메일     — 아직 연락 안 한 곳
 *
 * 이카운트 주소록을 직접 읽어 오지는 못한다 — 이 앱은 이카운트에 IMAP/SMTP 로만
 * 붙고 주소록 API 는 쓰지 않는다. 대신 주고받은 메일에서 뽑으면 실제로 연락하는
 * 사람은 거의 다 들어온다. 사내 주소(yogico.kr·yogibo.inc)도 포함한다 —
 * 동료에게 메일 쓸 일이 당연히 있는데 처음엔 그걸 빼고 있었다.
 *
 * **초성으로 찾을 수 있다.** "ㅅㅇㅇㅅ" 로 서울아산병원이 나온다.
 * 업체명이 길고 한자·영문이 섞여 있어서 앞글자를 정확히 치기가 번거롭기 때문이다.
 * 초성 판정은 DB 질의로 못 하므로(인덱스가 안 걸린다) 후보를 뽑아 와서 거른다 —
 * 대상이 천 단위라 그래도 충분히 빠르다.
 */

const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** "서울아산병원" → "ㅅㅇㅇㅅㅂㅇ" (한글이 아닌 글자는 그대로 둔다) */
function chosungOf(str: string): string {
  let out = '';
  for (const ch of String(str || '')) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code <= 11171 ? CHO[Math.floor(code / 588)] : ch;
  }
  return out.toLowerCase();
}

/** 입력이 초성만으로 되어 있나 (ㄱ~ㅎ) */
const isChosungQuery = (q: string) => /^[ㄱ-ㅎ]+$/.test(q.replace(/\s/g, ''));

interface Contact {
  name: string;
  email: string;
  /** 어디서 온 연락처인지 — 화면에 작게 표시한다 */
  from: 'internal' | 'mail' | 'sent' | 'lead';
  company?: string;
  /** 정렬용 — 최근에 주고받았거나 점수가 높은 것이 위로 */
  rank: number;
}

export async function GET(req: Request) {
  const scope = await getMailScope();
  if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  await dbConnect();

  const ownDomains = await getOwnDomains();
  const byEmail = new Map<string, Contact>();

  // ── 1. 받은 메일의 발신자 ──────────────────────────────
  // 최근 것부터. 오래된 것까지 다 훑으면 느려지고, 실제로 쓰는 것은 최근 상대다.
  const mails = await InboundMail.find(
    { ...mailFilter(scope), direction: { $ne: 'out' } },
    { from: 1, date: 1 },
  ).sort({ date: -1 }).limit(2000).lean() as Array<Record<string, any>>;

  /**
   * 같은 주소가 메일마다 다른 이름으로 온다. 헤더에 이름이 아예 없는 메일도 많다.
   * 최신 한 통만 보고 정하면 jay@yogico.kr 이 "jay"(주소 앞부분)로 굳어서,
   * 이재홍을 찾는 사람이 "ㅇㅈㅎ" 로도 "이재홍" 으로도 못 찾는다.
   * 그래서 이름이 더 나은 것이 나오면 갈아 끼운다.
   */
  const better = (next: string, cur: string, email: string) => {
    const fallback = email.split('@')[0];
    if (!next) return false;
    if (!cur || cur === fallback) return true;     // 없거나 주소 앞부분이면 무조건 낫다
    // 한글 이름이 있으면 그쪽을 쓴다 — 찾을 때 한글로 친다
    return /[가-힣]/.test(next) && !/[가-힣]/.test(cur);
  };

  const put = (
    email: string,
    rawName: string,
    kind: Contact['from'],
    rank: number,
  ) => {
    const name = String(rawName || '').replace(/^['"]|['"]$/g, '').trim();
    const cur = byEmail.get(email);
    if (cur) {
      if (better(name, cur.name, email)) cur.name = name;
      return;
    }
    byEmail.set(email, { name: name || email.split('@')[0], email, from: kind, rank });
  };

  for (const m of mails) {
    const email = String(m?.from?.address || '').toLowerCase().trim();
    if (!email || !email.includes('@')) continue;
    const internal = ownDomains.has(email.split('@')[1]);
    // 사내 동료를 제일 위로. 메일을 새로 쓸 때 제일 자주 찾는 상대다.
    put(email, m?.from?.name, internal ? 'internal' : 'mail', internal ? 2000 : 1000);
  }

  // ── 1-2. 보낸 메일의 받는 사람 ─────────────────────────
  // 우리가 먼저 보냈지만 답이 없는 곳은 받은 메일함에 안 나온다.
  // 그래도 주소는 아는 상대이므로 후보에 넣는다.
  const sent = await InboundMail.find(
    { ...mailFilter(scope), direction: 'out' },
    { to: 1, cc: 1, date: 1 },
  ).sort({ date: -1 }).limit(800).lean() as Array<Record<string, any>>;

  for (const m of sent) {
    for (const a of [...(m.to || []), ...(m.cc || [])]) {
      const email = String(a?.address || '').toLowerCase().trim();
      if (!email.includes('@')) continue;
      const internal = ownDomains.has(email.split('@')[1]);
      put(email, a?.name, internal ? 'internal' : 'sent', internal ? 1900 : 900);
    }
  }

  // ── 2. 리드의 대표 메일 ────────────────────────────────
  //
  // 검색어를 칠 때만 넣는다. 리드는 천 건이 넘고 대부분 아직 연락한 적 없는
  // 곳이라, 창을 열자마자 다 뿌리면 정작 자주 쓰는 상대가 그 아래로 밀린다.
  // 이름을 치기 시작하면 그때 후보에 들어온다.
  const leads = q ? await Lead.find(
    { Email: { $nin: ['', null] }, deleted: { $ne: true } },
    { Company: 1, Email: 1, recoScore: 1, stage: 1 },
  ).limit(3000).lean() as Array<Record<string, any>> : [];

  for (const l of leads) {
    const email = String(l.Email || '').toLowerCase().trim();
    if (!email.includes('@')) continue;
    const hit = byEmail.get(email);
    if (hit) {
      // 메일함에도 있고 리드에도 있으면 업체명을 붙여 준다
      if (!hit.company && l.Company) hit.company = l.Company;
      continue;
    }
    byEmail.set(email, {
      name: String(l.Company || '').trim() || email.split('@')[0],
      email,
      from: 'lead',
      company: l.Company,
      rank: Number(l.recoScore) || 0,
    });
  }

  let list = [...byEmail.values()];

  if (q) {
    const needle = q.toLowerCase().replace(/\s/g, '');
    const cho = isChosungQuery(q);
    list = list.filter((c) => {
      const hay = `${c.name} ${c.company || ''} ${c.email}`.toLowerCase();
      // 초성만 친 경우에는 초성끼리 비교한다. 그냥 포함 검사로는
      // "ㅅㅇ" 이 아무것도 못 찾는다 — 원문에는 초성 글자가 없기 때문이다.
      if (cho) return chosungOf(`${c.name} ${c.company || ''}`).includes(needle);
      return hay.replace(/\s/g, '').includes(needle);
    });
  }

  list.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, 'ko'));

  return NextResponse.json({
    success: true,
    total: list.length,
    contacts: list.slice(0, 30).map(({ rank, ...c }) => c),
  });
}
