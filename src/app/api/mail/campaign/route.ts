import { NextResponse } from 'next/server';
import { resolveOutreachAccount } from '@/lib/mail/accounts';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
import { EmailTemplate } from '@/models/EmailTemplate';
import { Lead } from '@/models/Lead';
import { MAX_SEND_COUNT_PER_LEAD } from '@/lib/send-limits';
import { loadTemplateAttachments } from '@/lib/mail/template-attachments';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/mail/campaign — 발송 리스트를 실제 발송 예약으로 펼친다.
 *
 * 왜 한 번에 안 보내는가:
 * 100곳을 한 요청에서 연속 발송하면 SMTP 가 받아주는 속도로 쏟아진다.
 * 수신 서버는 그걸 대량 발송으로 보고, yogico.kr 도메인 평판이 깎인다.
 * 같은 도메인으로 실거래 메일도 나가기 때문에 그쪽까지 스팸함으로 간다.
 * 그래서 몇 개씩 · 몇 분 간격으로 끊어서 예약으로 깔아 둔다.
 *
 * 자동 재발송은 여기서 미리 만들지 않는다. 답장이 오면 보낼 필요가 없어지고,
 * 미리 깔아 둔 예약을 나중에 지우는 것보다 "보낸 뒤에 답이 없으면 그때 만드는"
 * 편이 어긋날 여지가 없다 (lib/mail/follow-up.ts).
 *
 * Body: {
 *   leadIds: string[], templateId: string, mailAccountId?: string,
 *   startAt?: string(ISO),      // 없으면 지금부터
 *   batchSize?: number,         // 한 묶음에 몇 곳 (기본 30 · 최대 50)
 *   intervalMinutes?: number,   // 묶음 사이 간격 (기본 30 · 최소 5)
 *   followUp?: boolean,         // 답 없으면 자동 재발송
 *   followUpDays?: number,      // 며칠 뒤 (기본 7)
 * }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];
  const templateId: string = String(body.templateId || '');
  /**
   * 예약도 리드마다 그 리드 카테고리의 양식으로 깐다.
   *
   * 예약은 나중에 혼자 돌기 때문에 여기서 양식을 정해 두지 않으면 고칠 기회가 없다.
   * 한 양식으로 224곳을 깔아 두면, 며칠 뒤 호텔 문구가 요양병원으로 나간다.
   */
  const byCategory: boolean = body.byCategory === true;

  if (!leadIds.length) return NextResponse.json({ success: false, error: 'leadIds 필수' }, { status: 400 });
  if (!byCategory && !templateId) {
    return NextResponse.json({ success: false, error: 'templateId 필수' }, { status: 400 });
  }

  // 상한을 200 → 50 으로 내렸다. 구 시스템에서 시간당 260통을 보내다 이카운트가
  // 발신 주소를 끊었다(2026-09-16). 화면에서 실수로 크게 잡아도 그 근처까지 못 가게 막는다.
  const batchSize = Math.max(1, Math.min(50, Number(body.batchSize) || 30));
  const intervalMinutes = Math.max(5, Math.min(1440, Number(body.intervalMinutes) || 30));
  const followUp = body.followUp === true;
  const followUpDays = Math.max(1, Math.min(60, Number(body.followUpDays) || 7));

  let startAt = body.startAt ? new Date(body.startAt) : new Date();
  if (isNaN(startAt.getTime())) startAt = new Date();
  // 과거 시각으로 깔면 크론이 한 번에 전부 집어간다 — 나눠 보내는 의미가 없어진다
  if (startAt.getTime() < Date.now()) startAt = new Date();

  try {
    await dbConnect();

    // 쓰일 양식을 모아 둔다. 카테고리별이면 카테고리마다 하나씩, 아니면 고른 것 하나.
    const tplByCategory = new Map<string, any>();
    let tpl: any = null;
    if (byCategory) {
      const rows = await EmailTemplate.find({ isActive: true, purpose: 'intro' }).lean() as any[];
      for (const t of rows) tplByCategory.set(t.category || '', t);
      if (!tplByCategory.size) {
        return NextResponse.json(
          { success: false, error: '쓸 수 있는 양식이 없습니다 — [📝 메일 양식]에서 만들어 주세요.' },
          { status: 400 },
        );
      }
    } else {
      tpl = await EmailTemplate.findById(templateId).lean();
      if (!tpl) return NextResponse.json({ success: false, error: '메일 양식을 찾을 수 없습니다' }, { status: 400 });
    }

    // 첨부 주소가 깨져 있으면 예약을 깔기 전에 알린다 — 발송 시각에 줄줄이 실패로 떨어지는 것보다 낫다.
    // 쓰일 양식 전부를 확인한다. 하나라도 깨져 있으면 아무것도 깔지 않는다.
    for (const t of byCategory ? [...tplByCategory.values()] : [tpl]) {
      const att = await loadTemplateAttachments((t as any).attachments);
      if (!att.ok) {
        return NextResponse.json(
          { success: false, error: `[${(t as any).name || '양식'}] ${att.error}` },
          { status: 400 },
        );
      }
    }

    const leads: any[] = await Lead.find(
      { leadId: { $in: leadIds }, deleted: { $ne: true } },
      { leadId: 1, Email: 1, Company: 1, stage: 1, emailHistory: 1, category: 1 },
    ).lean();

    // 이미 예약이 걸린 곳은 건너뛴다 — 같은 곳에 두 번 깔리면 이틀 연속 나간다
    const already = await EmailSchedule.find(
      { leadId: { $in: leadIds }, status: 'pending' }, { leadId: 1 },
    ).lean();
    const pendingSet = new Set(already.map((a: any) => a.leadId));

    const targets: any[] = [];
    const skipped: Array<{ leadId: string; reason: string }> = [];
    for (const l of leads) {
      const email = String(l.Email || '').trim();
      if (!email || /^Not found/i.test(email) || !email.includes('@')) {
        skipped.push({ leadId: l.leadId, reason: '메일 주소 없음' }); continue;
      }
      if (pendingSet.has(l.leadId)) {
        skipped.push({ leadId: l.leadId, reason: '이미 예약됨' }); continue;
      }
      const sentCount = (l.emailHistory || []).filter((h: any) => h?.status === 'sent').length;
      if (sentCount >= MAX_SEND_COUNT_PER_LEAD) {
        skipped.push({ leadId: l.leadId, reason: `발송 한도 ${MAX_SEND_COUNT_PER_LEAD}회 소진` }); continue;
      }
      targets.push({ ...l, email, attemptNo: sentCount + 1 });
    }

    if (!targets.length) {
      return NextResponse.json({
        success: false, error: '보낼 수 있는 곳이 없습니다', skipped,
      }, { status: 400 });
    }

    // 양식이 없는 카테고리가 섞여 있으면 **한 건도 깔지 않는다**.
    // 일부만 예약되면 나머지는 며칠 뒤 조용히 빠진 채로 끝난다.
    if (byCategory) {
      const missing = new Set<string>();
      for (const t of targets) {
        const key = t.category || '';
        if (!tplByCategory.has(key) && !tplByCategory.has('')) missing.add(key || '(미분류)');
      }
      if (missing.size) {
        return NextResponse.json({
          success: false,
          error: `양식이 없는 카테고리가 있습니다: ${[...missing].join(', ')} — [📝 메일 양식]에서 만들어 주세요.`,
        }, { status: 400 });
      }
    }

    // 고른 계정(없으면 대표 계정)으로 예약을 깐다. 그 계정이 없으면 예약을 만들지 않는다.
    // user 를 넘겨 자기 계정만 — 예약 실행은 id 만 믿으므로 남의 계정 id 는 여기서 막는다.
    const { account: outreach, error: accError } = await resolveOutreachAccount(body.mailAccountId, user);
    if (!outreach) {
      return NextResponse.json({ success: false, error: accError }, { status: 400 });
    }

    const batchId = `camp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const docs = targets.map((t, i) => {
      const slot = Math.floor(i / batchSize);          // 몇 번째 묶음인가
      const when = new Date(startAt.getTime() + slot * intervalMinutes * 60_000);
      // 예약 문서에는 **그때 쓸 양식**을 못 박아 둔다. 실행 시점에 다시 고르게 하면
      // 그 사이 양식이 바뀌었을 때 무엇이 나갈지 알 수 없다.
      const leadTpl = byCategory
        ? (tplByCategory.get(t.category || '') || tplByCategory.get(''))
        : tpl;
      return {
        leadId: t.leadId,
        templateId: String(leadTpl?._id || templateId),
        mailAccountId: String(outreach._id),
        to: t.email,
        scheduledFor: when,
        status: 'pending' as const,
        attempts: 0,
        attemptNo: t.attemptNo,
        followUp,
        followUpDays,
        batchId,
        createdBy: user,
      };
    });

    await EmailSchedule.insertMany(docs);

    const slots = Math.ceil(targets.length / batchSize);
    const lastAt = new Date(startAt.getTime() + (slots - 1) * intervalMinutes * 60_000);

    return NextResponse.json({
      success: true,
      batchId,
      scheduled: docs.length,
      skipped,
      batches: slots,
      batchSize,
      intervalMinutes,
      startAt: startAt.toISOString(),
      lastAt: lastAt.toISOString(),
      followUp,
      followUpDays,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '예약 생성 실패' }, { status: 500 });
  }
}
