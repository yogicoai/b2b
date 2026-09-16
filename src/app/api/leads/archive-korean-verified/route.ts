import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/archive-korean-verified
 * 검증완료(verified) 안에 남아있는 한국 기업 리드를 검증실패로 이동.
 *
 * 사용자 방침: "한국업체들의 경우 다 제외임" (K-beauty B2B 외주 발송 대상 아님)
 */
export async function POST() {
  await dbConnect();
  const now = new Date().toISOString();
  const result = await Lead.updateMany(
    {
      stage: 'verified',
      $or: [
        { Region: /korea/i },
        { Region: /한국/ },
        { Region: /대한민국/ },
      ],
      // 명시적으로 북한 제외
      $nor: [{ Region: /north\s*korea/i }],
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
