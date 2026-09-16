import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 검증 실패 — 화면(/api/leads?stage=__failed)이 보여주는 것과 같은 범위여야 한다.
 *
 * 두 갈래로 쌓여 있다.
 *   · stage 'failed'                    — 대부분 보낼 메일 주소가 없어 걸러진 것
 *   · archived + aiVerdict 'not-fit'  — AI 가 K-뷰티 무관으로 본 것
 * 전에는 뒤쪽만 세서, 화면에 841건이 떠 있는데 "51건 정리" 라고 물었다.
 */
const FAILED = {
  deleted: { $ne: true },
  $or: [
    { stage: 'failed' },
    { stage: 'archived', 'verification.aiVerdict': 'not-fit' },
  ],
};

/**
 * GET /api/leads/purge-failed — 지울 건수를 서버에서 센다.
 *
 * 예전에는 브라우저 캐시(baseLeads)로 세서, 화면에 안 올라온 건은 숫자에서
 * 빠졌다. "3건 삭제" 라고 보고 눌렀는데 실제로는 수백 건이 지워질 수 있었다.
 */
export async function GET() {
  try {
    await dbConnect();
    return NextResponse.json({ success: true, count: await Lead.countDocuments(FAILED) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/leads/purge-failed — 검증 실패를 한 번에 치운다.
 *
 * 실제로 지우지 않고 deleted=true 만 붙인다.
 *
 * 왜 완전 삭제를 하지 않는가:
 * AI 판정은 틀릴 수 있다. 실제로 이 프로젝트에서 dermaofficial·venuseurope 처럼
 * 진짜 바이어가 걸러진 적이 있었다. 한 번 지우면 그때 되살릴 방법이 없다.
 * 화면에서는 어차피 안 보이므로(모든 목록이 deleted 를 제외한다) 사용자 입장의
 * 결과는 같고, 잘못됐을 때만 되돌릴 수 있다.
 *
 * Body: { confirmCount: number }  — 화면이 보여준 수와 서버 수가 같을 때만 진행.
 *   목록을 보는 사이 건수가 바뀌었으면 멈춘다.
 */
export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}

  try {
    await dbConnect();
    const count = await Lead.countDocuments(FAILED);

    if (typeof body?.confirmCount !== 'number') {
      return NextResponse.json(
        { success: false, error: 'confirmCount 필요' }, { status: 400 },
      );
    }
    if (body.confirmCount !== count) {
      return NextResponse.json({
        success: false,
        error: `건수가 달라졌습니다 (화면 ${body.confirmCount}건 · 지금 ${count}건). 새로고침 후 다시 시도해 주세요.`,
        count,
      }, { status: 409 });
    }
    if (!count) {
      return NextResponse.json({ success: true, deleted: 0, count: 0 });
    }

    const now = new Date().toISOString();
    const r = await Lead.updateMany(FAILED, {
      $set: {
        deleted: true,
        deletedReason: '검증 실패 일괄 정리',
        deletedAt: now,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: r.modifiedCount,
      // 되살리는 방법을 응답에도 남긴다
      restoreHint: 'deletedReason="검증 실패 일괄 정리" 인 리드의 deleted 를 지우면 복구됩니다',
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '삭제 실패' }, { status: 500 });
  }
}
