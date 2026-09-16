import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';

/**
 * GET /api/leads/stage-counts
 * 사이드바 배지 + 서브필터 chip 카운트 + 폴더 뷰용 배치 breakdown.
 * 서버 사이드 aggregation → 클라이언트가 전체 리드를 fetch 하지 않고도 카운트 표시 가능.
 *
 * 반환:
 *   {
 *     success,
 *     stages: { imported, verifying, verified, queued, contacted, replied, negotiating, partner, archived, failed },
 *     verifyingSub: { unverified, maybe, all },
 *     verifiedSub: { approved, pending, noEmail, all },
 *     batches: [ { batchId, dateLabel, breakdown: {...} } ]   // 검증대기 폴더용
 *   }
 */
export async function GET() {
  try {
    await dbConnect();

    // 1) stage 별 카운트 + failed 특수 처리
    const stageAgg = await Lead.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $group: { _id: { stage: '$stage', aiVerdict: '$verification.aiVerdict' }, n: { $sum: 1 } } },
    ]);

    // ⚠️ 여기 빠진 stage 는 아래 루프에서 조용히 버려져 사이드바 배지가 0 으로 뜬다.
    //    (실제로 ai-searched 325건이 이 누락 때문에 0 으로 표시됐다)
    //    Lead 모델 enum 에 stage 를 추가하면 여기도 반드시 함께 추가할 것.
    const stages: any = {
      imported: 0, 'ai-searched': 0, verifying: 0, verified: 0,
      queued: 0, contacted: 0, replied: 0, negotiating: 0,
      partner: 0, archived: 0, failed: 0,
    };
    for (const row of stageAgg) {
      const s = row._id.stage || 'imported';
      const v = row._id.aiVerdict;
      if (s === 'archived' && v === 'not-fit') {
        stages.failed += row.n;
      } else if (stages[s] !== undefined) {
        stages[s] += row.n;
      }
    }

    // 2) 검증대기 서브필터 카운트
    const verifyingSub = { unverified: 0, maybe: 0, all: stages.verifying };
    const [vUnverified, vMaybe] = await Promise.all([
      Lead.countDocuments({
        stage: 'verifying', deleted: { $ne: true },
        $or: [
          { 'verification.aiVerifiedAt': { $exists: false } },
          { 'verification.aiVerifiedAt': '' },
        ],
      }),
      Lead.countDocuments({
        stage: 'verifying', deleted: { $ne: true },
        'verification.aiVerdict': 'maybe',
      }),
    ]);
    verifyingSub.unverified = vUnverified;
    verifyingSub.maybe = vMaybe;

    // 3) 검증완료 서브필터 카운트
    //
    // approved(readyForOutreach) 는 더 이상 "보낼 대상"을 뜻하지 않는다.
    // 예전 스크립트가 검증 완료 전 건에 true 를 켜둬서 항상 전체와 같은 수가
    // 나오고, 화면에는 "승인됨 409" 로 떠서 실제 발송 리스트(queued, 1건)와
    // 어긋났다. 지금 기준은 "발송 리스트로 옮겼는가" = stage 'queued' 다.
    // approved 는 옛 화면 호환으로만 남긴다.
    const verifiedSub = { approved: 0, pending: 0, noEmail: 0, all: stages.verified, queued: stages.queued, reviewNeeded: 0, hidden: 0 };
    const [vApproved, vNoEmail, vReviewNeeded] = await Promise.all([
      Lead.countDocuments({ stage: 'verified', readyForOutreach: true, deleted: { $ne: true } }),
      // '보낼 수 있는 메일 주소가 없다' 의 기준은 검토 화면(review/route.ts REAL_EMAIL)과 같아야 한다.
      // 예전에는 빈칸·'Not found' 만 셌다(68). 실제로는 'Contact form on site'·'DM via Instagram' 처럼
      // 주소가 아닌 글자가 든 곳이 더 많아 224곳이었고, 그래서 첫 화면은 541, 검토 화면은 317 로 갈렸다.
      Lead.countDocuments({
        stage: 'verified', deleted: { $ne: true },
        Email: { $not: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ },
      }),
      // [2차 검토 필요] — 사이드바 배지·검토 카드·검토 화면 진행바가 모두 이 수를 쓴다 (review/route.ts 와 같은 조건).
      // 중복으로 감춘 곳(dupHiddenAt)·주소가 그 회사 것이 아닌 곳(badEmailAt)은 뺀다 —
      // 넣으면 같은 회사를 두 번 검토하고 두 번 보내게 된다. (예전: 371 로 떠서 실제 목록과 8곳 어긋남)
      // [발송 관리]로 옮긴 곳은 stage 가 queued 로 바뀌므로 여기서 이미 빠진다.
      Lead.countDocuments({
        stage: 'verified', deleted: { $ne: true },
        Email: { $regex: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ },
        dupHiddenAt: { $exists: false },
        badEmailAt: { $exists: false },
      }),
    ]);
    verifiedSub.approved = vApproved;
    verifiedSub.noEmail = vNoEmail;
    verifiedSub.reviewNeeded = vReviewNeeded;
    // 메일 주소는 있지만 중복·엉뚱한 주소라 검토에서 뺀 곳
    verifiedSub.hidden = Math.max(0, stages.verified - vNoEmail - vReviewNeeded);
    verifiedSub.pending = stages.verified - vApproved - vNoEmail;
    if (verifiedSub.pending < 0) verifiedSub.pending = 0;

    // 4) 검증대기 폴더용 배치 breakdown
    // 전체 배치 목록 + 각 배치의 stage별 카운트
    const batchAgg = await Lead.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $group: {
          _id: { batch: { $ifNull: ['$importBatch', '(수동/미배치)'] }, stage: '$stage', aiVerdict: '$verification.aiVerdict' },
          n: { $sum: 1 },
      }},
    ]);

    const batchMap = new Map();
    for (const row of batchAgg) {
      const b = row._id.batch;
      if (!batchMap.has(b)) {
        const m = String(b).match(/(\d{4})(\d{2})(\d{2})/);
        const dateLabel = m ? `${m[1]}-${m[2]}-${m[3]}` : (b === '(수동/미배치)' ? '수동 추가' : '미상');
        batchMap.set(b, {
          batchId: b, dateLabel,
          breakdown: { total: 0, 'ai-searched': 0, verifying: 0, verified: 0, failed: 0,
                       archivedOther: 0, contacted: 0, replied: 0, negotiating: 0,
                       partner: 0, imported: 0 },
        });
      }
      const g = batchMap.get(b);
      g.breakdown.total += row.n;
      const s = row._id.stage || 'imported';
      const v = row._id.aiVerdict;
      if (s === 'archived') {
        if (v === 'not-fit') g.breakdown.failed += row.n;
        else g.breakdown.archivedOther += row.n;
      } else if (g.breakdown[s] !== undefined) {
        g.breakdown[s] += row.n;
      }
    }
    // 최신 배치 먼저
    const batches = Array.from(batchMap.values()).sort((a, b) => b.batchId.localeCompare(a.batchId));

    return NextResponse.json({
      success: true,
      stages,
      verifyingSub,
      verifiedSub,
      batches,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
