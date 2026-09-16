/**
 * 일일 브리핑 — 하루치 "할 일"을 한 장으로 요약한다.
 *
 * 담는 범위는 **직전 24시간**이다. 달력 하루로 잡으면 아침에 도는 크론이
 * 그날 00~09시만 보게 되는데, 실측하면 메일의 89%가 09시 이후에 온다
 * (유럽·이스라엘 업무시간이 한국 오후). — emailData 실측 근거
 *
 * 브리핑은 할 일 목록이므로 광고·자동발송·자사 발신은 담지 않는다.
 *
 * (emailData/src/lib/briefing.js 이식 · 리드 파이프라인 항목 추가)
 */
import { InboundMail } from '@/models/InboundMail';
import { Lead } from '@/models/Lead';
import { countSince, COUNT_PERIOD_LABEL } from './period';

export interface BriefingItem {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  group: string;
  company: string;
  leadId: string;
  topic: string;
  summary: string;
  suggestedAction: string;
  urgency: string;
  deadline: any;
  needsReply: boolean;
  analyzedByAi: boolean;
  date: any;
}

export interface Briefing {
  since: Date;
  until: Date;
  newMails: number;
  needsReply: BriefingItem[];
  deadlinesSoon: BriefingItem[];
  newReplies: Array<{ leadId: string; company: string; subject: string; at: any }>;
  stages: Record<string, number>;
  totals: { needsReply: number; overdue: number; unanalyzed: number };
  periodLabel: string;
}

// as const 로 리터럴 고정 — string[] 로 추론되면 classification union 타입과 맞지 않는다
const NOISE = ['ad', 'system', 'newsletter'] as const;

function shape(m: any, companyMap: Map<string, string>): BriefingItem {
  return {
    id: String(m._id),
    subject: m.subject || '',
    from: m.from?.address || '',
    fromName: m.from?.name || '',
    group: m.group || '',
    leadId: m.leadId || '',
    company: m.leadId ? companyMap.get(m.leadId) || '' : '',
    topic: m.analysis?.topic || '',
    summary: m.analysis?.summary || '',
    suggestedAction: m.analysis?.suggestedAction || '',
    urgency: m.analysis?.urgency || 'low',
    deadline: m.analysis?.deadline || null,
    needsReply: Boolean(m.analysis?.needsReply),
    analyzedByAi: m.analysis?.method === 'ai',
    date: m.date,
  };
}

/**
 * extraMatch — 모든 InboundMail 조회에 덧붙이는 조건 (아이디별 메일 분리, lib/mail/scope.ts).
 *   화면 : mailFilter(scope) — 로그인한 사람이 볼 수 있는 계정의 메일만
 *   크론 : 마스터 계정들의 메일만 (대표 메일로 가는 브리핑에 다른 아이디의 메일이 섞이지 않게)
 * 조건을 복사해 다른 곳에서 따로 세면 한쪽만 고쳐져 숫자가 어긋난다 — 범위는 여기로 넘겨서 한 곳에서 센다.
 * 넘기지 않으면 예전처럼 전체 메일로 센다.
 */
export async function buildBriefing(days = 1, extraMatch?: Record<string, any>): Promise<Briefing> {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86400000);

  // $and 로 감싼다 — 펼쳐 넣으면 넘어온 조건의 키가 아래 조회의 date·status 같은 조건과 겹쳐 덮일 수 있다
  const scoped = extraMatch && Object.keys(extraMatch).length ? { $and: [extraMatch] } : null;
  const base = { ...(scoped || {}), direction: 'in' as const, trashedAt: null, classification: { $nin: NOISE } };
  // 합계는 화면 숫자와 같은 기준(최근 2개월)으로 센다.
  // 전체를 세면 1년치가 잡혀 143 같은 수가 뜨고, 오늘 할 일이 그 안에 묻힌다.
  const periodSince = countSince();

  const [fresh, needsReplyAll, deadlineSoon, newMails] = await Promise.all([
    // 직전 24시간에 들어온 것 중 회신이 필요한 것
    InboundMail.find({ ...base, date: { $gte: since }, 'analysis.needsReply': true, status: 'new' })
      .sort({ 'analysis.urgency': 1, date: -1 }).limit(20).lean(),
    InboundMail.countDocuments({ ...base, date: { $gte: periodSince }, 'analysis.needsReply': true, status: { $in: ['new', 'reviewing'] } }),
    // 기한이 7일 이내로 다가온 것 (기간과 무관하게 — 놓치면 손해다)
    InboundMail.find({
      ...base,
      'analysis.deadline': { $ne: null, $lte: new Date(until.getTime() + 7 * 86400000) },
      status: { $nin: ['replied', 'archived', 'ignored'] },
    }).sort({ 'analysis.deadline': 1 }).limit(20).lean(),
    InboundMail.countDocuments({ ...base, date: { $gte: since } }),
  ]);

  // 회사명 붙이기
  const leadIds = [...new Set([...fresh, ...deadlineSoon].map((m: any) => m.leadId).filter(Boolean))];
  const companyMap = new Map<string, string>();
  if (leadIds.length) {
    const leads: any[] = await Lead.find({ leadId: { $in: leadIds } }, { leadId: 1, Company: 1 }).lean();
    leads.forEach((l) => companyMap.set(l.leadId, l.Company));
  }

  // 직전 24시간에 'replied' 로 올라온 리드 = 새로 답장이 온 곳
  let recentReplies: any[];
  if (!scoped) {
    recentReplies = await Lead.find(
      { stage: 'replied', lastInboundAt: { $gte: since.toISOString() } },
      { leadId: 1, Company: 1, lastInboundAt: 1 },
    ).sort({ lastInboundAt: -1 }).limit(20).lean();
  } else {
    // Lead.lastInboundAt 은 어느 계정으로 받은 답장이든 적힌다 — 그대로 쓰면 남의 메일함에 온 답장이
    // "새로 답장이 온 곳" 으로 드러난다. 범위 안 메일이 그 기간에 실제로 온 리드만, 그 메일 시각으로 보여준다.
    // (받은 메일 · 휴지통 제외 — 리드 목록의 답장 지표(scopeMailStats)와 같은 기준)
    const mine: any[] = await InboundMail.aggregate([
      { $match: { ...scoped, direction: 'in', trashedAt: null, date: { $gte: since }, leadId: { $nin: [null, ''] } } },
      { $group: { _id: '$leadId', at: { $max: '$date' } } },
    ]);
    const lastAt = new Map(mine.map((r) => [String(r._id), r.at]));
    const rows: any[] = lastAt.size
      ? await Lead.find(
          // 기간 조건은 위 메일 시각이 대신한다 (저장된 lastInboundAt 은 남의 메일로 덮였을 수 있다)
          { stage: 'replied', leadId: { $in: Array.from(lastAt.keys()) } },
          { leadId: 1, Company: 1 },
        ).lean()
      : [];
    recentReplies = rows
      .map((l) => ({ ...l, lastInboundAt: new Date(lastAt.get(l.leadId)).toISOString() }))
      .sort((a, b) => (a.lastInboundAt < b.lastInboundAt ? 1 : -1))
      .slice(0, 20);
  }

  const stageAgg: any[] = await Lead.aggregate([
    { $group: { _id: '$stage', n: { $sum: 1 } } },
  ]);
  const stages: Record<string, number> = {};
  stageAgg.forEach((s) => { stages[s._id || 'unknown'] = s.n; });

  const overdue = await InboundMail.countDocuments({
    ...base,
    date: { $gte: periodSince },
    'analysis.deadline': { $ne: null, $lt: until },
    status: { $nin: ['replied', 'archived', 'ignored'] },
  });
  const unanalyzed = await InboundMail.countDocuments({
    ...base, date: { $gte: periodSince }, 'analysis.method': { $ne: 'ai' },
  });

  return {
    since, until,
    newMails,
    needsReply: fresh.map((m: any) => shape(m, companyMap)),
    deadlinesSoon: deadlineSoon.map((m: any) => shape(m, companyMap)),
    newReplies: recentReplies.map((l: any) => ({
      leadId: l.leadId, company: l.Company, subject: '', at: l.lastInboundAt,
    })),
    stages,
    totals: { needsReply: needsReplyAll, overdue, unanalyzed },
    periodLabel: COUNT_PERIOD_LABEL,
  };
}

/** 브리핑을 메일 본문(HTML)으로 */
export function renderBriefingHtml(b: Briefing, baseUrl = ''): string {
  const esc = (s: any) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const d = (v: any) => v ? new Date(v).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '';
  const urgencyColor = (u: string) => u === 'high' ? '#b91c1c' : u === 'mid' ? '#c2410c' : '#64748b';

  const item = (m: BriefingItem) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb">
        <div style="font-size:11px;color:${urgencyColor(m.urgency)};font-weight:700">
          ${m.urgency === 'high' ? '🔴 긴급' : m.urgency === 'mid' ? '🟠 보통' : '⚪ 낮음'}
          ${m.deadline ? ` · 기한 ${d(m.deadline)}` : ''}
          ${m.company || m.group ? ` · ${esc(m.company || m.group)}` : ''}
        </div>
        <div style="font-size:14px;font-weight:600;color:#0f172a;margin-top:3px">
          ${esc(m.topic || m.subject)}
        </div>
        ${m.summary ? `<div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.5">${esc(m.summary)}</div>` : ''}
        ${m.suggestedAction ? `<div style="font-size:12px;color:#1e40af;margin-top:4px">→ ${esc(m.suggestedAction)}</div>` : ''}
        <div style="font-size:11px;color:#94a3b8;margin-top:3px">${esc(m.fromName || m.from)}</div>
      </td>
    </tr>`;

  const section = (title: string, items: BriefingItem[]) => items.length ? `
    <h3 style="font-size:14px;color:#0f172a;margin:22px 0 6px">${title} <span style="color:#94a3b8;font-weight:400">${items.length}건</span></h3>
    <table style="width:100%;border-collapse:collapse">${items.map(item).join('')}</table>` : '';

  return `
  <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#0f172a">
    <div style="border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:6px">
      <div style="font-size:18px;font-weight:800">오늘의 브리핑</div>
      <div style="font-size:12px;color:#64748b;margin-top:3px">
        ${d(b.since)} ~ ${d(b.until)} · 새 메일 ${b.newMails}건
      </div>
    </div>

    <div style="display:flex;gap:8px;margin:14px 0;flex-wrap:wrap">
      <div style="flex:1;min-width:110px;background:#fef3c7;padding:10px;border-radius:8px">
        <div style="font-size:20px;font-weight:800;color:#92400e">${b.totals.needsReply}</div>
        <div style="font-size:11px;color:#92400e">회신 필요</div>
      </div>
      <div style="flex:1;min-width:110px;background:#fee2e2;padding:10px;border-radius:8px">
        <div style="font-size:20px;font-weight:800;color:#991b1b">${b.totals.overdue}</div>
        <div style="font-size:11px;color:#991b1b">기한 지남</div>
      </div>
      <div style="flex:1;min-width:110px;background:#dcfce7;padding:10px;border-radius:8px">
        <div style="font-size:20px;font-weight:800;color:#166534">${b.newReplies.length}</div>
        <div style="font-size:11px;color:#166534">새 답장</div>
      </div>
    </div>

    ${b.newReplies.length ? `
      <h3 style="font-size:14px;margin:22px 0 6px">💬 새로 답장이 온 곳</h3>
      <table style="width:100%;border-collapse:collapse">
        ${b.newReplies.map((r) => `<tr><td style="padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:13px">
          <b>${esc(r.company)}</b> <span style="color:#94a3b8;font-size:11px">${d(r.at)}</span></td></tr>`).join('')}
      </table>` : ''}

    ${section('⚠️ 회신이 필요한 메일', b.needsReply)}
    ${section('⏰ 기한이 다가온 건', b.deadlinesSoon)}

    ${b.totals.unanalyzed ? `<div style="margin-top:20px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#475569">
      AI 분석 대기 ${b.totals.unanalyzed}건 — 한글 번역·요약을 보려면 메일함에서 [AI 분석]을 눌러주세요.
    </div>` : ''}

    ${baseUrl ? `<div style="margin-top:20px"><a href="${baseUrl}" style="display:inline-block;padding:9px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">CRM 열기</a></div>` : ''}

    <div style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;padding-top:10px">
      Yogico CRM 자동 브리핑 · 광고·자동발송은 제외됩니다.
    </div>
  </div>`;
}
