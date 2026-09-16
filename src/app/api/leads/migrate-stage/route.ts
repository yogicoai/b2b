import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/leads/migrate-stage
 * 리드에 stage 값 부여/재매핑.
 *
 * 매핑 규칙 (v2 — 사용자 멘탈모델 반영):
 *   favorite === true                                → 'partner'  (대표가 파트너 확정)
 *   aiVerdict === 'target-fit'                     → 'verified' (AI 정밀검증 통과)
 *   aiVerdict === 'not-fit'                        → 'archived' (AI 판정 무관)
 *   businessLevel === 'unrelated'                    → 'archived' (룰 판정 무관)
 *   룰기반 통과 + AI 아직 안 봄                       → 'verifying' (검증 대기 = AI 재검토 pool)
 *   aiVerdict === 'maybe'                            → 'verifying'
 *   verifiedAt 있으나 어느 조건에도 안 맞음           → 'verifying'
 *   verifiedAt 없음 (미검증)                          → 'imported'
 *
 * 이미 stage 값 있으면 덮어쓰지 않음 (idempotent). ?force=true 로 강제 재매핑 가능.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';
  const dryRun = url.searchParams.get('dryRun') === 'true';

  try {
    await dbConnect();
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `DB 연결 실패: ${e?.message || 'unknown'}` },
      { status: 500 },
    );
  }

  try {
    const filter: any = force
      ? {}
      : { $or: [{ stage: { $exists: false } }, { stage: '' }, { stage: null }] };

    const total = await Lead.countDocuments(filter);
    const targets = await Lead.find(filter)
      .select('leadId Company favorite verification stageChangedAt becamePartnerAt')
      .lean();

    const now = new Date().toISOString();
    const tally = {
      partner: 0,
      verified: 0,
      archived: 0,
      imported: 0,
    };

    const ops: any[] = [];
    for (const l of targets as any[]) {
      let newStage: string = 'imported';
      const v = l.verification || {};

      if (l.favorite === true) {
        // 대표가 즐겨찾기 → 파트너 성사
        newStage = 'partner';
      } else if (v.aiVerdict === 'target-fit') {
        // AI 정밀 검증에서 진성 바이어 판정
        newStage = 'verified';
      } else if (v.aiVerdict === 'not-fit') {
        // AI 가 명확히 무관 산업 판정
        newStage = 'archived';
      } else if (v.businessLevel === 'unrelated') {
        // 룰기반이 명확히 뷰티 무관 → archived
        newStage = 'archived';
      } else if (
        v.verifiedAt &&
        v.businessLevel === 'relevant' &&
        v.websiteAlive === true &&
        (v.emailValid === true || v.phoneMatch === true || v.linkedinValid === true)
      ) {
        // 룰기반은 통과했으나 AI 아직 안 봄 → 검증 대기 (재검토 필요)
        newStage = 'verifying';
      } else if (v.aiVerdict === 'maybe') {
        // AI가 모호 판정 → 검증 대기
        newStage = 'verifying';
      } else if (v.verifiedAt) {
        // 검증은 됐으나 어느 조건에도 안 맞음 → 대기열
        newStage = 'verifying';
      } else {
        // 아직 검증 안 됨
        newStage = 'imported';
      }

      tally[newStage as keyof typeof tally] = (tally[newStage as keyof typeof tally] || 0) + 1;

      if (!dryRun) {
        const update: any = {
          stage: newStage,
          stageChangedAt: now,
        };
        if (newStage === 'partner') {
          update.becamePartnerAt = l.becamePartnerAt || now;
        }
        // registeredAt이 없으면 importedAt으로 대체, 없으면 now
        update.registeredAt = l.registeredAt || l.importedAt || now;
        update.updatedInfoAt = l.updatedInfoAt || now;

        ops.push({
          updateOne: {
            filter: { leadId: l.leadId },
            update: { $set: update },
          },
        });
      }
    }

    if (!dryRun && ops.length > 0) {
      await Lead.bulkWrite(ops, { ordered: false });
    }

    return NextResponse.json({
      success: true,
      total,
      dryRun,
      tally,
      updated: dryRun ? 0 : ops.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'unknown error' },
      { status: 500 },
    );
  }
}
