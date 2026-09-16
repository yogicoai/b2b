import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * POST /api/leads/relationships/add — 이미 연락이 닿아 있던 회사를 직접 등록한다.
 *
 * 왜 필요한가:
 * 이 앱을 쓰기 전부터 메일로 주고받던 거래처가 있다. 그런 곳은 검증도
 * 발송도 거치지 않았으니 파이프라인 어디에도 없는데, 정작 지금 가장 중요한
 * 회사들이다. 손으로 [대화 진행 중]·[파트너십 확정]에 넣을 수 있어야 한다.
 *
 * Body: { Company, Email, stage, Region?, BuyerContact?, Title?, Phone?,
 *         WebsiteContact?, Type?, notes? }
 *
 * 등록하면서 **이미 받아둔 메일을 그 회사에 붙인다**.
 * 메일함에는 같은 주소에서 온 편지가 이미 쌓여 있는데 leadId 가 비어 있어
 * 연결되지 않은 상태다. 등록하자마자 대화 이력이 보여야 의미가 있다.
 */

const ALLOWED_STAGES = ['negotiating', 'partner', 'replied'];

/** "이름 <주소>" 도 받아준다 */
function cleanEmail(v: unknown): string {
  const s = String(v ?? '').trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(s);

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  const Company = String(body?.Company ?? '').trim();
  const Email = cleanEmail(body?.Email);
  const stage = String(body?.stage ?? '').trim();

  if (!Company) {
    return NextResponse.json({ success: false, error: '회사명을 적어주세요' }, { status: 400 });
  }
  if (!Email || !isEmail(Email)) {
    return NextResponse.json(
      { success: false, error: '메일 주소를 정확히 적어주세요 (예: name@company.com)' },
      { status: 400 },
    );
  }
  if (!ALLOWED_STAGES.includes(stage)) {
    return NextResponse.json(
      { success: false, error: "stage 는 'negotiating' | 'partner' | 'replied' 중 하나여야 합니다" },
      { status: 400 },
    );
  }

  try {
    await dbConnect();

    // 회사 등록 자체는 공용이지만 아래에서 메일을 붙이므로 누가 등록하는지 먼저 확인한다.
    // (회사를 만든 뒤에 401 이 나면 메일 연결 없이 회사만 남는다)
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // 이미 있는 회사면 새로 만들지 않는다.
    // 같은 곳이 두 줄로 생기면 대화 이력이 갈라져 어느 쪽이 진짜인지 알 수 없다.
    const dup = await Lead.findOne(
      { Email: new RegExp(`^${Email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), deleted: { $ne: true } },
      { leadId: 1, Company: 1, stage: 1 },
    ).lean<any>();

    if (dup) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        existing: { leadId: dup.leadId, Company: dup.Company, stage: dup.stage },
        error: `이미 등록된 주소입니다 — [${dup.Company}] (${dup.stage} 단계). ` +
               `그 회사를 이 단계로 옮기시려면 해당 화면에서 단계를 바꿔주세요.`,
      }, { status: 409 });
    }

    const now = new Date().toISOString();
    const leadId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await Lead.create({
      leadId,
      Company,
      Email,
      Region: String(body?.Region ?? '').trim(),
      BuyerContact: String(body?.BuyerContact ?? '').trim(),
      Title: String(body?.Title ?? '').trim(),
      Phone: String(body?.Phone ?? '').trim(),
      WebsiteContact: String(body?.WebsiteContact ?? '').trim(),
      Type: String(body?.Type ?? '').trim(),
      notes: String(body?.notes ?? '').trim(),
      stage,
      stageChangedAt: now,
      addedManually: true,
      readyForOutreach: false,   // 콜드메일 대상이 아니다 — 이미 연락이 닿은 곳이다
      importBatch: 'manual-relationship',
      importedAt: now,
    });

    // 이미 받아둔 같은 주소의 메일을 이 회사에 붙인다 (아직 안 붙은 것만)
    // 등록한 사람의 메일함에 있는 것만 붙인다 — 남의 메일을 건드리면 linkedMails 숫자로
    // 다른 아이디가 이 주소와 주고받았는지가 드러난다.
    const linked = await InboundMail.updateMany(
      {
        'from.address': new RegExp(`^${Email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        $or: [{ leadId: '' }, { leadId: { $exists: false } }, { leadId: null }],
        ...mailFilter(scope),
      },
      // 'manual' — InboundMail 이 선언해 둔 값 중 하나. 새 값을 쓰면
      // 타입 선언과 어긋나 나중에 필터가 안 걸린다.
      { $set: { leadId, leadMatchedBy: 'manual' } },
    );

    return NextResponse.json({
      success: true,
      leadId,
      Company,
      stage,
      linkedMails: linked.modifiedCount,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '등록 실패' }, { status: 500 });
  }
}
