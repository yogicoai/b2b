import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/archive-all-no-email
 * 검증완료 stage 안에서 이메일이 없는 모든 리드 → 검증실패(failed).
 *
 * 사용자 방침: 크롤링 강행해도 hit rate 가 사실상 0 → 컨택할 수 있는 가지가 없으니
 * 이메일 없는 애들은 웹사이트 유무 무관 모두 검증실패로 정리.
 * ("일단 저런식으로 까지 했는데 안되는 애들의 경우 웹사이트 주소도 없다면 다 검증실패로 가게 해줘 · 어쩔수 없는 상황 · 컨택할 가지가 없음")
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
        { Email: /^Not found/i },
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
