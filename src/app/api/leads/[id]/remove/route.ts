import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { EmailSchedule } from '@/models/EmailSchedule';

export const runtime = 'nodejs';

/**
 * POST /api/leads/[id]/remove   Body: { reason?: string }
 *
 * 업체를 목록에서 **삭제 처리**한다 — DB 에서 지우지 않고 deleted 표시만 한다.
 * (파트너십 확정 화면의 [🗑 파트너십에서 삭제])
 *
 * 왜 진짜로 지우지 않는가:
 * 파트너 업체에는 주고받은 메일·발송 기록이 묶여 있다. 문서를 지우면 받은 메일함의
 * "이 업체와의 대화" 연결이 끊기고, 잘못 눌렀을 때 되살릴 방법이 없다.
 * deleted 표시면 모든 목록·집계·발송에서 빠지고, deleted 를 지우면 원래 단계로 돌아온다.
 *
 * 걸려 있던 예약 발송도 함께 취소한다 — 삭제한 업체로 메일이 나가면 안 된다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: '잘못된 업체 번호입니다' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || '목록에서 삭제').slice(0, 200);

    await dbConnect();
    const lead: any = await Lead.findById(id).select('leadId stage deleted Company').lean();
    if (!lead) return NextResponse.json({ success: false, error: '업체를 찾을 수 없습니다' }, { status: 404 });
    if (lead.deleted === true) return NextResponse.json({ success: true, alreadyDeleted: true });

    const now = new Date().toISOString();
    // 모델에 없는 칸(deleted·deletedAt…)이라 드라이버로 직접 쓴다 — 모델을 거치면 조용히 빠진다
    await Lead.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      {
        $set: {
          deleted: true,
          deletedAt: now,
          deletedReason: reason,
          deletedFromStage: lead.stage || '',
          readyForOutreach: false,
          updatedInfoAt: now,
        },
      },
    );

    const canceled = lead.leadId
      ? await EmailSchedule.updateMany(
          { leadId: lead.leadId, status: 'pending' },
          { $set: { status: 'canceled', canceledReason: `업체 삭제: ${reason}` } },
        )
      : { modifiedCount: 0 };

    return NextResponse.json({
      success: true,
      canceledSchedules: canceled.modifiedCount || 0,
      restoreHint: `이 업체(_id ${id})의 deleted 를 false 로 바꾸면 ${lead.stage} 단계로 되살아납니다`,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '삭제 실패' }, { status: 500 });
  }
}
