import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/archive-crawl-failed
 * 크롤링 다 돌린 후 잔여물 정리 — 이메일을 못 딴 리드는 검증실패(failed) 로.
 *
 * 대상 = stage=verified + Email 없음 + (WebsiteContact 없음 OR crawledAt 존재)
 *   → "컨택 불가" (사이트가 없거나, 있어도 이메일 미공개)
 *
 * 사용자 요청: "이후에 크롤링 안되는 애들은 검증실패로 다 옮기자"
 */
export async function POST() {
  await dbConnect();
  const now = new Date().toISOString();
  const result = await Lead.updateMany(
    {
      stage: 'verified',
      $and: [
        {
          $or: [
            { Email: { $exists: false } },
            { Email: null },
            { Email: '' },
          ],
        },
        {
          $or: [
            // 사이트 자체가 없음 → 크롤 불가
            { WebsiteContact: { $exists: false } },
            { WebsiteContact: null },
            { WebsiteContact: '' },
            // 사이트는 있으나 이미 크롤 시도했고 결과 없음
            { crawledAt: { $exists: true, $nin: [null, ''] } },
          ],
        },
      ],
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
