import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { getLeadTier } from '@/lib/lead-tier';

export const runtime = 'nodejs';

/**
 * GET /api/leads/tier-counts
 * 검증완료(verified) 리드를 A/B/C 티어로 카운트.
 * A: AI 통과 + 이메일 + 사이트 + 대형 리테일러 도메인
 * B: AI 통과 + 이메일 + 사이트
 * C: AI 통과만 (이메일/사이트 부족)
 */
export async function GET() {
  await dbConnect();
  const leads = await Lead.find(
    { stage: 'verified' },
    { Company: 1, Email: 1, WebsiteContact: 1 },
  ).lean();

  const counts = { A: 0, B: 0, C: 0, total: leads.length };
  for (const l of leads) {
    counts[getLeadTier(l as any)]++;
  }
  return NextResponse.json({ success: true, ...counts });
}
