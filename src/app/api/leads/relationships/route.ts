import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import { replyWindowFilter, replySince } from '@/lib/mail/period';
import { getMailScope, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/relationships?stage=partner|negotiating|replied
 *
 * 거래가 살아 있는 회사들을 카드로 보여주기 위한 요약.
 *
 * 왜 목록 API 를 그냥 쓰지 않는가:
 * 파트너십 화면에서 알고 싶은 것은 "이 회사와 어디까지 갔나" 다.
 * 그건 Lead 문서 안에 없다 — 주고받은 통수는 InboundMail 과 emailHistory 에
 * 흩어져 있고, 마지막으로 말이 오간 날도 둘 중 늦은 쪽이다.
 * 카드마다 따로 조회하면 5곳이면 15번을 부르게 되므로 여기서 한 번에 엮는다.
 */

/**
 * 이 회사가 지금 우리 쪽 답을 기다리고 있나.
 *
 * 기간을 거는 이유는 메일함 배지와 같다 — 2주가 지난 건은 답할 일이 아니거나
 * 이미 다른 경로로 정리된 것이다. 카드에 "답장 3" 이 몇 달째 붙어 있으면
 * 그 숫자를 아무도 안 보게 된다. 화면마다 기준이 다르면 더 나쁘므로
 * lib/mail/period.ts 의 같은 값을 쓴다.
 */
const NEEDS_REPLY = {
  'analysis.needsReply': true,
  status: { $in: ['new', 'reviewing'] },
  trashedAt: null,
  ...replyWindowFilter(),
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage') || 'partner';
    const q = (searchParams.get('q') || '').trim();

    await dbConnect();

    // 로그인 확인용. **숫자를 거르는 데는 쓰지 않는다** —
    // 리드에 붙은 메일은 계정을 가리지 않는다 (lib/mail/scope.ts 상단 '예외' 참고).
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const filter: any = { stage, deleted: { $ne: true } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ Company: rx }, { Region: rx }, { Email: rx }, { BuyerContact: rx }];
    }

    const leads: any[] = await Lead.find(filter, {
      leadId: 1, Company: 1, Region: 1, Email: 1, Phone: 1, WebsiteContact: 1,
      BuyerContact: 1, Title: 1, Type: 1, TypeKo: 1, Category: 1,
      BrandsChannels: 1, notes: 1, stage: 1, stageChangedAt: 1,
      lastContact: 1, nextFollowUp: 1, owner: 1,
      emailHistory: 1, addedManually: 1, createdAt: 1,
    }).lean();

    if (!leads.length) {
      return NextResponse.json({ success: true, items: [], stage });
    }

    const ids = leads.map((l) => l.leadId);

    // 받은 메일 — 회사별 통수 · 마지막 수신 · 답해야 할 건수를 한 번에
    const inAgg: any[] = await InboundMail.aggregate([
      // 계정을 가리지 않는다. 리드에 붙은 메일은 회사 기록이다.
      //
      // 여기에 mailFilter(scope) 가 걸려 있어서, 서울아산병원 11통이 전부 hjs
      // 계정에 있다는 이유로 이사님·마스터 화면에는 "주고받은 메일 0통 ·
      // 연락 기록 없음" 이 떴다. 정작 회사를 눌러 열면 대화 11건이 나왔다 —
      // 같은 화면이 숫자와 내용에서 서로 다른 말을 했다.
      { $match: { leadId: { $in: ids }, trashedAt: null } },
      {
        $group: {
          _id: '$leadId',
          inCount: { $sum: 1 },
          lastIn: { $max: '$date' },
          firstIn: { $min: '$date' },
          needsReply: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ['$analysis.needsReply', true] },
                  { $in: ['$status', ['new', 'reviewing']] },
                  // 위 NEEDS_REPLY 와 같은 기간 — 오래된 건은 세지 않는다
                  { $gte: ['$date', replySince()] },
                ] },
                1, 0,
              ],
            },
          },
        },
      },
    ]);
    const inBy = new Map(inAgg.map((r) => [r._id, r]));

    // 아직 답하지 않았고 기한이 남은 것 중 가장 이른 것
    const dlAgg: any[] = await InboundMail.aggregate([
      {
        $match: {
          leadId: { $in: ids },
          ...NEEDS_REPLY,
          'analysis.deadline': { $ne: null, $gte: new Date() },
          // 기한도 계정을 가리지 않는다 — 위 inAgg 와 같은 기준이어야
          // "통수는 11인데 기한 뱃지는 안 뜬다" 가 안 생긴다.
        },
      },
      { $group: { _id: '$leadId', nearest: { $min: '$analysis.deadline' } } },
    ]);
    const dlBy = new Map(dlAgg.map((r) => [r._id, r.nearest]));

    const items = leads.map((l) => {
      const inb = inBy.get(l.leadId) || {};
      const sent = (l.emailHistory || []).filter((h: any) => h?.status === 'sent');
      const lastOut = sent.length ? sent[sent.length - 1].sentAt : null;

      // 마지막으로 말이 오간 날 — 보낸 것과 받은 것 중 늦은 쪽
      const times = [inb.lastIn, lastOut].filter(Boolean).map((d: any) => new Date(d).getTime());
      const lastTouch = times.length ? new Date(Math.max(...times)) : null;

      // 처음 연결된 날 — 받은 것 중 가장 이른 것, 없으면 등록일
      const firstTimes = [inb.firstIn, sent.length ? sent[0].sentAt : null]
        .filter(Boolean).map((d: any) => new Date(d).getTime());
      const firstTouch = firstTimes.length ? new Date(Math.min(...firstTimes)) : (l.createdAt || null);

      return {
        leadId: l.leadId,
        // 단계 이동 API(/api/leads/[id]/stage)는 Mongo _id 로 찾는다.
        // leadId 를 넘기면 findById 가 못 찾아 404 가 난다.
        _id: String(l._id),
        Company: l.Company || '',
        Region: l.Region || '',
        Email: l.Email || '',
        Phone: l.Phone || '',
        WebsiteContact: l.WebsiteContact || '',
        BuyerContact: l.BuyerContact || '',
        Title: l.Title || '',
        Type: l.TypeKo || l.Type || '',
        Category: l.Category || '',
        BrandsChannels: l.BrandsChannels || '',
        notes: l.notes || '',
        owner: l.owner || '',
        stage: l.stage,
        stageChangedAt: l.stageChangedAt || '',
        addedManually: !!l.addedManually,
        // 진행 상황
        inCount: inb.inCount || 0,
        outCount: sent.length,
        total: (inb.inCount || 0) + sent.length,
        needsReply: inb.needsReply || 0,
        lastTouch,
        firstTouch,
        nearestDeadline: dlBy.get(l.leadId) || null,
      };
    });

    // 답할 것이 있는 곳을 먼저, 그다음 최근에 말이 오간 순
    items.sort((a, b) =>
      (b.needsReply - a.needsReply)
      || (new Date(b.lastTouch || 0).getTime() - new Date(a.lastTouch || 0).getTime()));

    return NextResponse.json({
      success: true,
      stage,
      items,
      summary: {
        count: items.length,
        needsReply: items.filter((i) => i.needsReply > 0).length,
        totalMails: items.reduce((a, i) => a + i.total, 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
