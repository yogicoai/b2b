import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { countSince, COUNT_PERIOD_LABEL } from '@/lib/mail/period';
import { getMailScope, accountParamFilter, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * GET /api/mail/deadlines — 회신 기한이 잡힌 메일을 기한순으로.
 *
 * 기한은 로컬 분석(무료)에서도 추출되므로 AI 크레딧 없이 동작한다.
 * AI 분석을 돌린 메일은 deadlineText(원문 표현)까지 함께 보여준다.
 *
 * 이미 답한 메일은 제외한다 — 처리한 건이 계속 D-day 로 뜨면 목록이 무의미해진다.
 *
 * accountId 로 대표 계정 것만 거른다. 이게 없던 동안에는 사이드바 배지(대표 계정
 * 기준)와 이 목록(전 계정)이 서로 다른 숫자를 말했다. 남의 계정 기한까지 섞여 보이면
 * "내가 답해야 하는 건"을 셀 수 없다.
 */
export async function GET(req: Request) {
  try {
    await dbConnect();

    // 기한 목록도 내가 볼 수 있는 계정의 메일만 (lib/mail/scope.ts)
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // 'all'·미지정은 "내 계정 전체". 남의 계정 id 를 넘기면 거절한다.
    const accountId = new URL(req.url).searchParams.get('accountId');
    const { filter: acc, denied } = accountParamFilter(scope, accountId);
    if (denied) return NextResponse.json(NOT_YOURS, { status: 403 });

    const mails: any[] = await InboundMail.find(
      {
        ...acc,
        trashedAt: null,
        direction: 'in',
        'analysis.deadline': { $ne: null },
        // 배지(counts)와 같은 기준 — 뉴스레터도 뺀다 (배지 16 · 화면 17 로 어긋났다)
        classification: { $nin: ['ad', 'system', 'newsletter'] },
        status: { $nin: ['replied', 'archived', 'ignored'] },
        // 화면 숫자와 같은 기준(최근 2개월). 과거 건은 거래처별 보기로 조회한다.
        date: { $gte: countSince() },
      },
      {
        subject: 1, from: 1, date: 1, leadId: 1, classification: 1,
        'analysis.deadline': 1, 'analysis.deadlineText': 1,
        'analysis.deadlineType': 1, 'analysis.urgency': 1, 'analysis.topic': 1,
      },
    ).sort({ 'analysis.deadline': 1 }).limit(300).lean();

    // 리드 회사명 붙이기 — "어느 회사 건인지" 가 기한만큼 중요하다
    const leadIds = [...new Set(mails.map((m) => m.leadId).filter(Boolean))];
    const companyMap = new Map<string, string>();
    if (leadIds.length) {
      const leads: any[] = await Lead.find({ leadId: { $in: leadIds } }, { leadId: 1, Company: 1 }).lean();
      leads.forEach((l) => companyMap.set(l.leadId, l.Company));
    }

    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);

    const shaped = mails.map((m) => ({
      id: String(m._id),
      subject: m.subject,
      from: m.from,
      date: m.date,
      leadId: m.leadId || '',
      company: m.leadId ? companyMap.get(m.leadId) || '' : '',
      deadline: m.analysis?.deadline,
      deadlineText: m.analysis?.deadlineText || '',
      deadlineType: m.analysis?.deadlineType || null,
      urgency: m.analysis?.urgency || null,
      topic: m.analysis?.topic || '',
    }));

    const groups = {
      overdue: shaped.filter((m) => new Date(m.deadline) < now),
      soon: shaped.filter((m) => new Date(m.deadline) >= now && new Date(m.deadline) <= in7),
      later: shaped.filter((m) => new Date(m.deadline) > in7),
    };

    return NextResponse.json({ success: true, total: shaped.length, groups, periodLabel: COUNT_PERIOD_LABEL });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
