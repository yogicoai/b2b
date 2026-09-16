import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { STAGES } from '@/lib/stages';

export const runtime = 'nodejs';

// 목록은 lib/stages.ts 한 곳에서만 관리한다.
// 예전에는 여기에 복사본이 있었고, 새 단계를 모델에만 추가했더니 이 API 가
// 400 으로 이동을 막아 "발송 리스트로 옮기기"가 조용히 실패했다.
const VALID_STAGES = STAGES;

/**
 * POST /api/leads/[id]/stage
 * Body: { stage: string, readyForOutreach?: boolean }
 *
 * stage 를 변경하고 다음 자동 부수효과 처리:
 *  - stageChangedAt = 현재 시각
 *  - partner 로 이동 시 becamePartnerAt 자동 세팅 (한 번만 — 재이동 시 유지)
 *  - archived 로 이동 시 readyForOutreach 자동 false (스팸 방지)
 *  - partner 로 이동 시 readyForOutreach 자동 false (자동 발송 대상 제외)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const newStage = body?.stage;
    if (!newStage || !VALID_STAGES.includes(newStage)) {
      return NextResponse.json(
        { success: false, error: `stage 는 다음 중 하나여야 함: ${VALID_STAGES.join(', ')}` },
        { status: 400 },
      );
    }

    await dbConnect();

    // 현재 lead 조회 — becamePartnerAt 이 이미 있으면 유지
    const existing = await Lead.findById(id).select('stage becamePartnerAt').lean() as any;
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update: any = {
      stage: newStage,
      stageChangedAt: now,
      updatedInfoAt: now,
    };

    // readyForOutreach 명시적 세팅
    if (typeof body.readyForOutreach === 'boolean') {
      update.readyForOutreach = body.readyForOutreach;
    }

    // 자동 부수효과
    if (newStage === 'partner') {
      update.readyForOutreach = false;
      if (!existing.becamePartnerAt) {
        update.becamePartnerAt = now;
      }
    } else if (newStage === 'archived') {
      update.readyForOutreach = false;
    }

    // 응답에 메일에서 온 값(스레드 키·답장 수·회신 필요)은 싣지 않는다 — 다른 아이디의 메일 흔적이다 (아이디별 메일 분리)
    const lead = await Lead.findByIdAndUpdate(id, { $set: update }, { new: true })
      .select('-threadKeys -inboundCount -lastInboundAt -needsReply -replyDeadline');
    return NextResponse.json({ success: true, data: lead });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
