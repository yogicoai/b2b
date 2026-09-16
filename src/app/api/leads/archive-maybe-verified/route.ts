import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/archive-maybe-verified
 * 검증완료 안에 남은 AI verdict='maybe' 리드 → 검증실패로 이동.
 * (AI가 K-beauty 관련성 애매하다고 판정한 것들, 안전하게 제외)
 */
export async function POST() {
  await dbConnect();
  const now = new Date().toISOString();
  const result = await Lead.updateMany(
    {
      stage: 'verified',
      'verification.aiVerdict': 'maybe',
    },
    {
      $set: {
        stage: 'failed',
        stageChangedAt: now,
        updatedInfoAt: now,
        readyForOutreach: false,
      },
    },
  );
  return NextResponse.json({
    success: true,
    moved: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  });
}
