import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';

/**
 * GET /api/leads/crawl-target-count
 * 검증완료 stage 안에서 실제 크롤링 대상/시도 완료 카운트.
 * hero UI 카드에서 대략치 대신 정확한 서버 카운트를 쓰기 위함.
 */
export async function GET() {
  await dbConnect();

  const emailMissing = {
    $or: [
      { Email: { $exists: false } },
      { Email: null },
      { Email: '' },
    ],
  };
  const hasWebsite = { WebsiteContact: { $exists: true, $nin: [null, ''] } };
  const notKorean = {
    $nor: [
      { Region: /korea/i },
      { Region: /한국/ },
      { Region: /대한민국/ },
    ],
  };

  const [pending, triedNoResult, uncontactable] = await Promise.all([
    Lead.countDocuments({
      stage: 'verified',
      ...emailMissing,
      ...hasWebsite,
      ...notKorean,
      $or: [
        { crawledAt: { $exists: false } },
        { crawledAt: null },
        { crawledAt: '' },
      ],
    }),
    Lead.countDocuments({
      stage: 'verified',
      ...emailMissing,
      ...hasWebsite,
      ...notKorean,
      crawledAt: { $exists: true, $nin: [null, ''] },
    }),
    Lead.countDocuments({
      stage: 'verified',
      ...emailMissing,
      $and: [
        {
          $or: [
            { WebsiteContact: { $exists: false } },
            { WebsiteContact: null },
            { WebsiteContact: '' },
          ],
        },
      ],
    }),
  ]);

  return NextResponse.json({ success: true, pending, triedNoResult, uncontactable });
}
