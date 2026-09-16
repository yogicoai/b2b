import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/clear-verifying
 * 검증대기 stage 에 남아있는 모든 리드를 정리 (관대 노선).
 *
 * 이동 규칙:
 *   verifying + aiVerdict='maybe'    → verified (사람 판단 게이트로 넘김)
 *   verifying + aiVerdict='target-fit' → verified
 *   verifying + aiVerdict='not-fit'    → archived
 *   verifying + aiVerdict null             → verified (Korean 등 정책 제외 리드 · 이미 존재하는 데이터라 통과)
 *
 * "검증대기" 는 이제 새로 import 된 것만 잠시 머무는 stage 가 됨.
 * 사용자 요청: 검증 한번 돌면 다 나가야 함 (검증대기 = 비어있는 상태 유지).
 */
export async function POST() {
  await dbConnect();
  const now = new Date().toISOString();

  const [maybe, buyer, notBuyer, unverified] = await Promise.all([
    Lead.updateMany(
      { stage: 'verifying', 'verification.aiVerdict': 'maybe' },
      { $set: { stage: 'verified', stageChangedAt: now, updatedInfoAt: now } },
    ),
    Lead.updateMany(
      { stage: 'verifying', 'verification.aiVerdict': 'target-fit' },
      { $set: { stage: 'verified', stageChangedAt: now, updatedInfoAt: now } },
    ),
    Lead.updateMany(
      { stage: 'verifying', 'verification.aiVerdict': 'not-fit' },
      { $set: { stage: 'archived', stageChangedAt: now, updatedInfoAt: now, readyForOutreach: false } },
    ),
    Lead.updateMany(
      {
        stage: 'verifying',
        $or: [
          { 'verification.aiVerdict': { $exists: false } },
          { 'verification.aiVerdict': null },
        ],
      },
      { $set: { stage: 'verified', stageChangedAt: now, updatedInfoAt: now } },
    ),
  ]);

  const remaining = await Lead.countDocuments({ stage: 'verifying' });

  return NextResponse.json({
    success: true,
    movedToVerified: (maybe.modifiedCount || 0) + (buyer.modifiedCount || 0) + (unverified.modifiedCount || 0),
    movedToArchived: notBuyer.modifiedCount || 0,
    breakdown: {
      maybeToVerified: maybe.modifiedCount || 0,
      buyerToVerified: buyer.modifiedCount || 0,
      notBuyerToArchived: notBuyer.modifiedCount || 0,
      unverifiedToVerified: unverified.modifiedCount || 0,
    },
    remainingInVerifying: remaining,
  });
}
