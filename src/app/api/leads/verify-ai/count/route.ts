import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';

/**
 * GET /api/leads/verify-ai/count?scope=…
 *
 * "AI 검증 시작" 버튼에 몇 건인지 적기 위한 숫자.
 *
 * 왜 별도 API 인가:
 * 예전에는 브라우저가 들고 있는 목록(baseLeads)을 세서 버튼에 적었다.
 * 그런데 그 목록은 화면에 뜬 한 페이지뿐이라, 실제로는 800건인데 버튼에는
 * 50건이라고 적혀 있었다. 돈이 나가는 버튼에 붙는 숫자가 틀리면 안 된다.
 *
 * 비용도 여기서 계산해 내려보낸다. 화면마다 제각각 곱셈을 하면
 * 한 곳만 고쳐도 다른 곳과 어긋난다.
 */

/** AI 판정을 아직 한 번도 안 받은 것 */
const NO_AI = {
  $or: [
    { 'verification.aiVerifiedAt': { $exists: false } },
    { 'verification.aiVerifiedAt': '' },
  ],
};

/** 한국 기업은 대상이 아니다 (우리가 파는 쪽이라 사는 쪽이 아님) */
const NOT_KOREA = { Region: { $not: /korea|^kr$|대한민국|한국/i } };

const ALIVE = { deleted: { $ne: true } };

/** POST /api/leads/verify-ai 의 scope 와 같은 이름을 쓴다 */
const SCOPES: Record<string, any> = {
  'verifying-stage': { stage: 'verifying', ...NO_AI },
  'imported': { stage: 'imported', ...NO_AI },
  // 엑셀로 올린 것 — AI 서칭으로 들어온 건(ai-search-*)은 제외한다.
  // [AI 검증 완료]에 같은 업체가 있어 감춘 것도 뺀다 (POST 쪽과 같은 조건이어야
  // 버튼에 적힌 수와 실제로 도는 수가 맞는다).
  'legacy': {
    importBatch: { $not: /^ai-search-/ },
    legacyHiddenAt: { $exists: false },
    ...NO_AI,
  },
  'all-unverified': { ...NO_AI },
};

/**
 * 건당 비용 (USD).
 *
 * claude-haiku-4-5 로 회사 한 곳을 판정한다. 실측 기준 4,000여 건에 약 $2 가
 * 나왔으므로 건당 $0.0005 로 잡는다. 실제 요금은 회사 설명 길이에 따라
 * 오르내리므로 화면에는 "약" 을 붙여 보여준다.
 */
const USD_PER_LEAD = 0.0005;
const KRW_PER_USD = 1400;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'verifying-stage';
    const batch = (searchParams.get('batch') || '').trim();
    const base = SCOPES[scope]
      ? (scope === 'legacy' && batch ? { ...SCOPES[scope], importBatch: batch } : SCOPES[scope])
      : null;
    if (!base) {
      return NextResponse.json(
        { success: false, error: `알 수 없는 scope: ${scope}` }, { status: 400 },
      );
    }

    await dbConnect();

    const filter = { ...base, ...NOT_KOREA, ...ALIVE };
    const [target, korea, alreadyDone] = await Promise.all([
      Lead.countDocuments(filter),
      // 제외된 한국 기업이 몇 곳인지 — "왜 숫자가 다르지"를 미리 답해둔다
      Lead.countDocuments({ ...base, ...ALIVE, Region: /korea|^kr$|대한민국|한국/i }),
      Lead.countDocuments({
        ...ALIVE,
        ...(base.stage ? { stage: base.stage } : {}),
        ...(base.importBatch ? { importBatch: base.importBatch } : {}),
        'verification.aiVerifiedAt': { $exists: true, $ne: '' },
      }),
    ]);

    const usd = target * USD_PER_LEAD;
    return NextResponse.json({
      success: true,
      scope,
      target,           // 이번에 검증할 건수
      korea,            // 한국이라 빠진 건수
      alreadyDone,      // 이미 검증이 끝난 건수
      cost: {
        usd: Math.round(usd * 100) / 100,
        krw: Math.round(usd * KRW_PER_USD),
        model: 'claude-haiku-4-5',
      },
      // 20건씩 끊어 돌린다 (POST 의 기본 limit)
      chunks: Math.ceil(target / 20),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}
