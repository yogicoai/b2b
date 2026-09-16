import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';

/**
 * POST /api/leads/bulk-approve
 * 여러 리드의 발송 승인(readyForOutreach) 상태를 일괄 변경.
 *
 * Body:
 *   scope?: 'ids' | 'verified-with-email' | 'verified-all'
 *     - 'ids': leadIds 배열 지정 (수동 다중 선택)
 *     - 'verified-with-email': stage=verified + Email 있음 전체
 *     - 'verified-all': stage=verified 전체
 *   leadIds?: string[]                (scope='ids' 일 때)
 *   approve: boolean                  (true=승인, false=승인 취소)
 *   excludeKorea?: boolean            (default true — 한국 기업 제외)
 *   requireEmail?: boolean            (default true — Email 필드에 실제 값 있어야만 승인)
 *
 * 응답:
 *   { success, matched, updated, skipped: { noEmail, korean, wrongStage } }
 */
export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}

  const scope: string = body.scope || 'ids';
  const approve: boolean = !!body.approve;
  const excludeKorea: boolean = body.excludeKorea !== false;
  const requireEmail: boolean = body.requireEmail !== false;
  const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];

  try {
    await dbConnect();
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `DB: ${e?.message}` }, { status: 500 });
  }

  // 필터 구성
  const filter: any = { stage: 'verified' };
  if (scope === 'ids') {
    if (!leadIds.length) {
      return NextResponse.json({ success: false, error: 'leadIds 필요' }, { status: 400 });
    }
    filter.leadId = { $in: leadIds };
  }

  if (excludeKorea) {
    filter.Region = { $not: /korea|^kr$|대한민국|한국/i };
  }

  if (approve && requireEmail) {
    // 승인 시에만 이메일 필수 (승인 취소는 이메일 유무 무관)
    filter.$and = (filter.$and || []).concat([
      { Email: { $exists: true, $ne: '' } },
      { Email: { $not: /^Not found/i } },
    ]);
  }

  // 후보 카운트 (스킵된 이유 추적용)
  let skipReasons: any = { noEmail: 0, korean: 0, wrongStage: 0 };
  if (scope === 'ids' && approve) {
    // 왜 일부 leadIds 가 매치 안됐는지 세분화
    const all = await Lead.find({ leadId: { $in: leadIds } })
      .select('leadId stage Region Email').lean();
    for (const l of all as any[]) {
      if ((l.stage || 'imported') !== 'verified') { skipReasons.wrongStage++; continue; }
      if (excludeKorea && /korea|한국|대한민국/i.test(l.Region || '') && !/north/i.test(l.Region || '')) {
        skipReasons.korean++; continue;
      }
      if (requireEmail && (!l.Email || !l.Email.trim() || /^Not found/i.test(l.Email))) {
        skipReasons.noEmail++; continue;
      }
    }
  }

  const now = new Date().toISOString();
  const update = {
    $set: {
      readyForOutreach: approve,
      updatedInfoAt: now,
    },
  };

  const res = await Lead.updateMany(filter, update);

  return NextResponse.json({
    success: true,
    scope,
    approve,
    matched: res.matchedCount || 0,
    updated: res.modifiedCount || 0,
    skipReasons,
  });
}
