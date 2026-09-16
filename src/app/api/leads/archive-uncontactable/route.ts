import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/archive-uncontactable
 * 이메일도 없고 웹사이트도 없는 리드 → 컨택 불가 → 검증실패(failed) 로 이동.
 *
 * 사용자 요청: "애초 웹사이트 자체도 없는 애들의 경우에는 검증실패로 돌려버려도 되지 않을려나 · 메일주소 자체를 못 따오잖아"
 *
 * GET  → 대상 수만 리턴 (dry-run 미리보기)
 * POST → 실제로 이동
 */
const uncontactableQuery = {
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
        { WebsiteContact: { $exists: false } },
        { WebsiteContact: null },
        { WebsiteContact: '' },
      ],
    },
  ],
};

export async function GET() {
  await dbConnect();
  const count = await Lead.countDocuments(uncontactableQuery);
  return NextResponse.json({ success: true, targetCount: count });
}

export async function POST() {
  await dbConnect();
  const now = new Date().toISOString();
  const result = await Lead.updateMany(
    uncontactableQuery,
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
