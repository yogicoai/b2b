import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/backfill-crawl-tried
 * 이전 크롤 배치에서 이메일을 못 찾은 리드들은 crawledAt 이 비어있음 (예전 스크립트가 저장 안 함).
 * 이제 그 필드를 마크해서 UI 에서 "이미 시도됨" 으로 처리.
 *
 * 대상: stage=verified + Email 없음 + WebsiteContact 있음 + crawledAt 없음
 * 처리: crawledAt = 지금 (한번 시도한 것으로 간주)
 *
 * 사용자 요청: "이건 실행되서 추가되었단 거니 완료 처리하고 메일링 추가정도만 해줘도 될듯"
 */
export async function POST() {
  await dbConnect();
  const now = new Date().toISOString();

  const result = await Lead.updateMany(
    {
      stage: 'verified',
      $or: [
        { Email: { $exists: false } },
        { Email: null },
        { Email: '' },
      ],
      WebsiteContact: { $exists: true, $nin: [null, ''] },
      $and: [
        {
          $or: [
            { crawledAt: { $exists: false } },
            { crawledAt: null },
            { crawledAt: '' },
          ],
        },
      ],
    },
    { $set: { crawledAt: now } },
  );

  return NextResponse.json({
    success: true,
    marked: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  });
}
