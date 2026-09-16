import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { getLeadTier } from '@/lib/lead-tier';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/archive-tier-c
 * 검증완료(verified) 중 C 등급 리드 → 검증실패(failed).
 * C = 이메일/사이트 부족 (컨택 확률 낮음).
 *
 * 사용자 방침: "이메일/사이트 부족 경우에는 다 검증실패로 돌려버려도 되긴해
 * 데이터가 저렇게 많은데 저걸 어떻게 다 찾을순 없잖아"
 */
export async function POST() {
  await dbConnect();
  const leads = await Lead.find(
    { stage: 'verified' },
    { Company: 1, Email: 1, WebsiteContact: 1 },
  ).lean();
  const cIds = leads.filter((l) => getLeadTier(l as any) === 'C').map((l) => l._id);
  if (cIds.length === 0) {
    return NextResponse.json({ success: true, moved: 0, matched: 0 });
  }
  const now = new Date().toISOString();
  const result = await Lead.updateMany(
    { _id: { $in: cIds } },
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
    matched: cIds.length,
  });
}
