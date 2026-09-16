import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';
import { runAllChecks } from '@/lib/verify';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/verify
 * Body: { leadIds?: string[], onlyUnverified?: boolean, limit?: number }
 *
 * - leadIds: 특정 lead 들만 검증 (선택)
 * - onlyUnverified: true 면 verification.verifiedAt 비어있는 것만
 * - limit: 한 번에 처리할 최대 lead 수 (기본 50)
 *
 * 호출자는 limit 만큼 처리될 때까지 반복 호출 → progress UI 가능.
 * 응답에 hasMore=true 면 다음 배치 호출.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  const leadIds: string[] | undefined = body?.leadIds;
  const onlyUnverified: boolean = body?.onlyUnverified !== false; // default true
  const limit = Math.min(Math.max(parseInt(body?.limit, 10) || 50, 1), 200);

  try {
    await dbConnect();
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `DB 연결 실패: ${e?.message || 'unknown'}` },
      { status: 500 },
    );
  }

  try {
    const filter: any = {};
    if (Array.isArray(leadIds) && leadIds.length) {
      filter.leadId = { $in: leadIds };
    } else if (onlyUnverified) {
      filter.$or = [
        { 'verification.verifiedAt': { $exists: false } },
        { 'verification.verifiedAt': '' },
      ];
    }

    const totalRemaining = await Lead.countDocuments(filter);
    // 정렬: verifiedAt 오래된 순 → 방금 검증된 건 뒤로 밀려나 다음 청크가 새 리드를 가져옴
    // (정렬 없으면 매 호출마다 같은 30건만 반복 처리됨)
    const targets = await Lead.find(filter)
      .select('leadId Email WebsiteContact Phone Region LinkedInCompany ContactLinkedIn verification.verifiedAt')
      .sort({ 'verification.verifiedAt': 1 })
      .limit(limit)
      .lean();

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        remaining: 0,
        hasMore: false,
        results: [],
      });
    }

    // 동시 실행 (네트워크 I/O 위주라 병렬 안전)
    const results = await Promise.all(
      targets.map(async (lead: any) => {
        try {
          const v = await runAllChecks({
            Email: lead.Email,
            WebsiteContact: lead.WebsiteContact,
            Phone: lead.Phone,
            Region: lead.Region,
            LinkedInCompany: lead.LinkedInCompany,
            ContactLinkedIn: lead.ContactLinkedIn,
          });
          return { leadId: lead.leadId, verification: v };
        } catch (err: any) {
          return {
            leadId: lead.leadId,
            verification: null,
            error: err?.message || 'check error',
          };
        }
      }),
    );

    // 결과를 DB에 일괄 업데이트
    const ops = results
      .filter((r) => r.verification)
      .map((r) => ({
        updateOne: {
          filter: { leadId: r.leadId },
          update: { $set: { verification: r.verification } },
        },
      }));

    if (ops.length > 0) {
      await Lead.bulkWrite(ops, { ordered: false });
    }

    const remaining = Math.max(totalRemaining - targets.length, 0);

    return NextResponse.json({
      success: true,
      processed: results.length,
      remaining,
      hasMore: remaining > 0,
      results: results.map((r) => ({
        leadId: r.leadId,
        score: r.verification?.score ?? null,
        emailValid: r.verification?.emailValid ?? null,
        websiteAlive: r.verification?.websiteAlive ?? null,
        phoneMatch: r.verification?.phoneMatch ?? null,
        linkedinValid: r.verification?.linkedinValid ?? null,
        businessLevel: r.verification?.businessLevel ?? null,
        businessScore: r.verification?.businessScore ?? null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'unknown error' },
      { status: 500 },
    );
  }
}
