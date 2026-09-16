import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

function makeBatchId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `import-${y}${mo}${d}-${h}${mi}`;
}

const TRIM_FIELDS = [
  'Region', 'Company', 'Priority', 'Type', 'Evidence', 'BrandsChannels',
  'LinkedInCompany', 'BuyerContact', 'ContactLinkedIn', 'RoleMemo',
  'WebsiteContact', 'Email', 'Phone', 'Address', 'Approach', 'Sources',
  'Checked', 'Confidence', 'Title', 'owner', 'lastContact', 'nextFollowUp',
  'notes',
] as const;

function sanitize(lead: any) {
  const out: Record<string, any> = {};
  for (const k of TRIM_FIELDS) out[k] = (lead?.[k] || '').toString().trim();
  out.status = (lead?.status || 'New').toString().trim();
  out.favorite = lead?.favorite === true || lead?.favorite === 'true';
  return out;
}

// CSV의 leadId 후보를 추출: leadId 우선, 없으면 id 컬럼 사용
function extractIncomingLeadId(lead: any): string {
  const v = (lead?.leadId ?? lead?.id ?? '').toString().trim();
  return v;
}

export async function POST(req: Request) {
  // Body parsing — separate try/catch so a bad payload returns JSON, not HTML
  let body: any;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `요청 본문 파싱 실패: ${e?.message || 'invalid JSON'}` },
      { status: 400 },
    );
  }

  const { leads, duplicateAction } = body || {};
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ success: false, error: 'No leads provided' }, { status: 400 });
  }

  try {
    await dbConnect();
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `DB 연결 실패: ${e?.message || 'unknown'}` },
      { status: 500 },
    );
  }

  const batchId = makeBatchId();
  const importedAt = new Date().toISOString();

  let inserted = 0;
  let skipped = 0;
  let updated = 0;
  const skipReasons: Record<string, number> = {
    'leadId-duplicate': 0,          // 동일 leadId 이미 존재 (Export→Import 왕복 케이스)
    'company-region-duplicate': 0, // Company+Region만 중복 (외부 CSV import 시 fallback)
  };
  const errors: string[] = [];

  try {
    // ────────────────────────────────────────────────────────────────
    // 1) 기존 DB에서 dedup 대상 조회 — leadId 우선, Company+Region fallback
    // ────────────────────────────────────────────────────────────────
    const incomingLeadIds = leads
      .map(extractIncomingLeadId)
      .filter((id: string) => id.length > 0);

    const lookupKeys = leads
      .map((l: any) => ({
        Company: (l?.Company || '').toString().trim(),
        Region: (l?.Region || '').toString().trim(),
      }))
      .filter((k) => k.Company);

    // 두 종류 lookup 동시 실행
    const [existingByLeadId, existingByCC] = await Promise.all([
      incomingLeadIds.length
        ? Lead.find({ leadId: { $in: incomingLeadIds } })
            .select('_id leadId Company Region')
            .lean()
        : Promise.resolve([]),
      lookupKeys.length
        ? Lead.find({ $or: lookupKeys })
            .select('_id leadId Company Region')
            .lean()
        : Promise.resolve([]),
    ]);

    // leadId 기반 맵 (원본 그대로 유지, 정확 매칭)
    const leadIdMap = new Map<string, any>();
    for (const doc of existingByLeadId as any[]) {
      if (doc.leadId) leadIdMap.set(doc.leadId, doc);
    }

    // Company+Region fallback 맵 — 첫 매치만 저장 (같은 조합 여럿이면 어차피 하나만 사용)
    const ccMap = new Map<string, any>();
    for (const doc of existingByCC as any[]) {
      const key = `${doc.Region || ''}::${doc.Company || ''}`;
      if (!ccMap.has(key)) ccMap.set(key, doc);
    }

    // ────────────────────────────────────────────────────────────────
    // 2) 요청 청크 내 leadId 중복 감지 — 같은 leadId가 payload에 2번 이상 있으면
    //    첫 번째만 처리 (같은 요청 안에서 자기 자신과 충돌 방지)
    // ────────────────────────────────────────────────────────────────
    const seenLeadIdInBatch = new Set<string>();

    // ────────────────────────────────────────────────────────────────
    // 3) 각 리드 → op 빌드
    //    dedup 우선순위:
    //      A) 요청에 leadId 있음 + DB에 존재 → 같은 리드로 판정 (overwrite/skip)
    //      B) 요청에 leadId 있음 + DB에 없음 → 새 lead (leadId 그대로 보존 = Export/Import 왕복 안전)
    //      C) 요청에 leadId 없음 + Company+Region 매칭 있음 → fallback dedup (외부 CSV)
    //      D) 요청에 leadId 없음 + 매칭 없음 → 새 lead (신규 leadId 생성)
    // ────────────────────────────────────────────────────────────────
    const ops: any[] = [];
    leads.forEach((lead: any, idx: number) => {
      try {
        const clean = sanitize(lead);
        if (!clean.Company) {
          errors.push(`row ${idx + 1}: Company 누락`);
          return;
        }

        const incomingLeadId = extractIncomingLeadId(lead);
        let existing: any = null;
        let matchedBy: 'leadId' | 'company-region' | null = null;

        if (incomingLeadId && leadIdMap.has(incomingLeadId)) {
          existing = leadIdMap.get(incomingLeadId);
          matchedBy = 'leadId';
        } else if (!incomingLeadId) {
          // leadId 없는 경우에만 Company+Region fallback 사용
          const ccKey = `${clean.Region}::${clean.Company}`;
          if (ccMap.has(ccKey)) {
            existing = ccMap.get(ccKey);
            matchedBy = 'company-region';
          }
        }

        if (existing) {
          if (duplicateAction === 'overwrite') {
            ops.push({
              updateOne: {
                filter: { _id: existing._id },
                update: { $set: { ...clean, importBatch: batchId, importedAt } },
              },
            });
            updated++;
          } else {
            skipped++;
            if (matchedBy === 'leadId') skipReasons['leadId-duplicate']++;
            else if (matchedBy === 'company-region') skipReasons['company-region-duplicate']++;
          }
        } else {
          // 새 lead — CSV의 leadId 보존 (Export/Import 왕복 시 원본 ID 유지)
          //           단, 같은 요청 안에서 중복 방지
          let leadIdToUse = incomingLeadId;
          if (!leadIdToUse || seenLeadIdInBatch.has(leadIdToUse)) {
            leadIdToUse = `lead-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
          }
          seenLeadIdInBatch.add(leadIdToUse);

          ops.push({
            insertOne: {
              document: {
                ...clean,
                leadId: leadIdToUse,
                importBatch: batchId,
                importedAt,
              },
            },
          });
          inserted++;
        }
      } catch (e: any) {
        errors.push(`row ${idx + 1} (${lead?.Company || 'Unknown'}): ${e?.message || 'sanitize error'}`);
      }
    });

    // ────────────────────────────────────────────────────────────────
    // 4) bulkWrite — 단일 왕복
    // ────────────────────────────────────────────────────────────────
    if (ops.length > 0) {
      try {
        await Lead.bulkWrite(ops, { ordered: false });
      } catch (e: any) {
        const writeErrors = e?.writeErrors || [];
        for (const we of writeErrors) {
          errors.push(`bulk error: ${we?.errmsg || we?.message || 'unknown'}`);
        }
        const result = e?.result || e;
        const realInserted = result?.nInserted ?? result?.insertedCount;
        const realUpdated = result?.nModified ?? result?.modifiedCount;
        if (typeof realInserted === 'number') inserted = realInserted;
        if (typeof realUpdated === 'number') updated = realUpdated;
      }
    }

    return NextResponse.json({
      success: true,
      batchId,
      summary: { inserted, updated, skipped, errors: errors.length },
      skipReasons,
      errors: errors.slice(0, 50),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'unknown error' },
      { status: 500 },
    );
  }
}
