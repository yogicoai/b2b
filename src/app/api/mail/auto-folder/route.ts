import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';
import {
  learnSenderGroups, suggestGroupBySender, autoAssignGroup, getOwnDomains, humanFiledSenders,
  GROUP_INTERNAL, GROUP_NOISE, GROUP_MISC, MIN_MAILS_FOR_OWN_FOLDER,
} from '@/lib/mail/groups';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/mail/auto-folder — 받은 메일을 업체별 폴더로 자동 분류한다.
 *
 * 분류 순서 (앞에서 잡히면 뒤는 안 본다):
 *   0. 리드에 있는 업체                        → 그 상호 (제일 정확)
 *   1. 사람이 예전에 그 발신자를 넣어 둔 폴더  (학습)
 *   2. 우리가 보낸 것                          → '· 사내'
 *   3. 광고·자동발송·개인메일 도메인            → '· 광고·자동발송'
 *   4. 발신 도메인                              → 회사 폴더 (5통 이상 오간 곳만)
 *   5. 그 외                                    → '· 기타'
 *
 * 5통 기준이 핵심이다. 예전에 도메인마다 폴더를 팠더니 1통짜리 폴더가 무더기로
 * 생겨서 진짜 거래처를 찾기가 더 어려워졌다. 한 번 오간 곳은 폴더가 아니라
 * '· 기타' 로 모은다.
 *
 * 사람이 직접 옮긴 것(groupBy:'manual')은 건드리지 않는다.
 *
 * Body: {
 *   dryRun?: boolean,     // true 면 어디로 갈지만 보여주고 저장하지 않는다 (기본 true)
 *   months?: number,      // 최근 몇 개월 (기본 2)
 *   redo?: boolean,       // true 면 이미 자동 분류된 것도 다시 계산
 * }
 */
export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { /* 본문 없이도 동작 */ }

  const scope = await getMailScope();
  if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const dryRun = body.dryRun !== false;   // 기본은 미리보기 — 실수로 340통을 옮기지 않게
  const months = Math.max(1, Math.min(12, Number(body.months) || 2));
  const redo = body.redo === true;

  await dbConnect();

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  // 사람이 손으로 옮긴 것은 절대 덮지 않는다 — 그게 제일 정확한 정보다.
  const filter: Record<string, unknown> = {
    ...mailFilter(scope),
    date: { $gte: since },
    groupBy: { $ne: 'manual' },
  };
  if (!redo) {
    // 아직 어디에도 안 들어간 것만
    filter.$or = [{ group: { $exists: false } }, { group: '' }, { group: null }];
  }

  const mails: any[] = await InboundMail.find(filter, {
    _id: 1, from: 1, subject: 1, classification: 1, group: 1, date: 1, leadId: 1,
  }).sort({ date: -1 }).limit(5000).lean();

  if (!mails.length) {
    return NextResponse.json({ success: true, dryRun, total: 0, moved: 0, folders: [], message: '분류할 메일이 없습니다.' });
  }

  const [learned, ownDomainSet, human] = await Promise.all([
    learnSenderGroups(scope.accountIds),
    getOwnDomains(),
    humanFiledSenders(scope.accountIds),
  ]);

  /**
   * 리드에 이미 있는 업체는 **그 업체명**을 폴더명으로 쓴다.
   *
   * 도메인에서 이름을 뽑으면 자주 틀린다 — amc.seoul.kr 은 서울아산병원인데
   * 도메인만 보면 "Amc" 가 최선이다. 우리가 그 회사를 리드로 들고 있고 메일이
   * 거기 매칭돼 있다면, 정확한 상호를 이미 아는 셈이다. 그걸 쓰는 게 맞다.
   */
  const leadIds = [...new Set(mails.map((m) => m.leadId).filter(Boolean))];
  const companyByLead = new Map<string, string>();
  if (leadIds.length) {
    const leads: any[] = await Lead.find({ leadId: { $in: leadIds } }, { leadId: 1, Company: 1 }).lean();
    for (const l of leads) {
      if (l.Company) companyByLead.set(l.leadId, String(l.Company).trim());
    }
  }

  // 폴더를 팔 만큼 오간 곳인지 판단하려면 도메인별 누적 통수가 먼저 필요하다.
  // 한 통씩 보면서 세면 앞쪽 메일은 항상 0으로 잡혀 '· 기타'로 밀린다.
  const domainCounts = new Map<string, number>();
  for (const m of mails) {
    const d = String(m?.from?.address || '').toLowerCase().split('@')[1];
    if (d) domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
  }

  const byGroup = new Map<string, { n: number; by: string; samples: string[] }>();
  const ops: any[] = [];

  for (const m of mails) {
    // 1. 리드에 있는 업체면 그 상호를 쓴다 (제일 정확)
    // 2. 사람이 예전에 이 발신자를 넣어 둔 폴더가 있으면 그것
    // 3. 없으면 도메인·분류로 자동 배치
    const leadCompany = m.leadId ? companyByLead.get(m.leadId) : '';

    // 광고·자동발송·뉴스레터로 **판정된** 것은, 사람이 직접 자리를 정해 준
    // 발신자가 아닌 한 학습 이력을 따르지 않는다.
    //
    // 학습은 프로그램이 예전에 도메인만 보고 판 폴더까지 배운다. 그래서 한 번
    // 'Flow'·'Hometax' 같은 폴더가 생기면 나중에 그게 협업툴 알림·국세청
    // 자동발송이라는 걸 알게 돼도 계속 그 폴더로 돌아갔다. 지금 아는 것이
    // 예전 추측보다 낫다.
    const addr = String(m?.from?.address || '').toLowerCase();
    const senderDomain = addr.split('@')[1] || '';
    const filedByHuman = human.addrs.has(addr) || (senderDomain ? human.domains.has(senderDomain) : false);
    const isNoise = ['ad', 'system', 'newsletter'].includes(String(m.classification || ''));

    const learnedHit = leadCompany || (isNoise && !filedByHuman)
      ? null
      : suggestGroupBySender(m, learned);
    const decided = leadCompany
      ? { group: leadCompany, by: 'lead' }
      : learnedHit?.group
        ? { group: learnedHit.group, by: 'learned' }
        : autoAssignGroup(m, ownDomainSet, domainCounts);

    if (!decided?.group) continue;
    if (m.group === decided.group) continue;   // 이미 그 자리에 있다

    const row = byGroup.get(decided.group) || { n: 0, by: decided.by, samples: [] };
    row.n++;
    if (row.samples.length < 3) row.samples.push(String(m.subject || '(제목 없음)').slice(0, 50));
    byGroup.set(decided.group, row);

    if (!dryRun) {
      ops.push({
        updateOne: {
          filter: { _id: m._id },
          update: { $set: { group: decided.group, groupBy: 'auto', groupMovedAt: new Date() } },
        },
      });
    }
  }

  if (!dryRun && ops.length) await InboundMail.bulkWrite(ops, { ordered: false });

  // 실제 거래처 폴더가 먼저, 모아두는 칸(· 로 시작)은 뒤로
  const folders = [...byGroup.entries()]
    .map(([group, v]) => ({ group, ...v }))
    .sort((a, b) => {
      const aMisc = a.group.startsWith('·') ? 1 : 0;
      const bMisc = b.group.startsWith('·') ? 1 : 0;
      return aMisc - bMisc || b.n - a.n;
    });

  return NextResponse.json({
    success: true,
    dryRun,
    months,
    total: mails.length,
    moved: folders.reduce((s, f) => s + f.n, 0),
    folderCount: folders.filter((f) => !f.group.startsWith('·')).length,
    folders,
    rule: {
      minMailsForOwnFolder: MIN_MAILS_FOR_OWN_FOLDER,
      buckets: [GROUP_INTERNAL, GROUP_NOISE, GROUP_MISC],
    },
  });
}
