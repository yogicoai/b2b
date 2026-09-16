import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import {
  listGroups, learnSenderGroups, suggestGroupBySender, suggestGroupByName,
  autoAssignGroup, getOwnDomains,
} from '@/lib/mail/groups';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, accountParamFilter, mailFilter, mailboxIds, UNAUTHORIZED, NOT_YOURS } from '@/lib/mail/scope';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/mail/groups — 거래처 목록.
 *
 * 대표가 메일함에서 폴더로 나눠둔 분류가 그대로 거래처가 된다.
 * 숫자는 **최근 한 달** 기준 — 누적을 쓰면 큰 수가 떠서 "밀린 일이 산더미"로
 * 읽히고, 매일 늘어나는 몇 건이 그 안에 묻힌다.
 */
export async function GET(req: Request) {
  try {
    await dbConnect();

    // 거래처(폴더) 목록·숫자도 내가 볼 수 있는 계정 것만 (lib/mail/scope.ts)
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const requested = new URL(req.url).searchParams.get('accountId') || undefined;
    const acc = accountParamFilter(scope, requested);
    if (acc.denied) return NextResponse.json(NOT_YOURS, { status: 403 });
    // 'default' 는 accountParamFilter 와 같이 '전체' 로 본다 — 계정 id 로 넘기면 MailAccount 조회가 깨진다
    const accountId = requested && requested !== 'default' ? requested : undefined;
    // 특정 메일함을 골랐으면 같은 메일함인 계정 id 들 전체로 (같은 주소를 다른 아이디가 먼저 모은 경우)
    const result = accountId && accountId !== 'all'
      ? await listGroups(undefined, mailboxIds(scope, accountId))
      : await listGroups(accountId, scope.accountIds);

    // 거래처가 안 붙은 메일 수 — 재분류 대상이 얼마나 되는지 보여준다
    const match: any = { ...acc.filter, group: { $in: [null, ''] }, direction: 'in', trashedAt: null };
    const ungrouped = await InboundMail.countDocuments(match);

    return NextResponse.json({ success: true, ...result, ungrouped });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/mail/groups — 거래처 재분류 (무과금).
 *
 * 폴더로 분류된 메일에서 "이 발신자는 이 거래처" 를 배워,
 * 아직 거래처가 안 붙은 메일에 소급 적용한다. AI 를 쓰지 않으므로 비용이 없다.
 *
 * 폴더를 새로 수집한 뒤 돌리면 분류율이 올라간다.
 */
export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { /* 본문 없이도 동작 */ }

  try {
    await dbConnect();

    // 재분류도 내 계정 메일만 건드린다 (lib/mail/scope.ts)
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    const acc = accountParamFilter(scope, body?.accountId);
    if (acc.denied) return NextResponse.json(NOT_YOURS, { status: 403 });

    // 학습·거래처 후보도 내 계정 범위에서만 — 남의 폴더 이름이 내 메일에 붙으면
    // 그 사람의 거래처 구성이 드러난다.
    const learned = await learnSenderGroups(scope.accountIds);
    const { groups } = await listGroups(undefined, scope.accountIds);
    const knownGroups = groups.map((g) => g.group).filter(Boolean);

    // 사람이 직접 옮긴 것(groupBy: 'manual')은 애초에 group 이 채워져 있어
    // 이 조건에 안 걸린다. 혹시 미분류로 되돌린 경우까지 감안해 명시적으로 뺀다.
    const match: any = {
      ...acc.filter,
      group: { $in: [null, ''] },
      groupBy: { $ne: 'manual' },
      direction: 'in',
      trashedAt: null,
    };

    const targets: any[] = await InboundMail.find(match, {
      _id: 1, subject: 1, from: 1, classification: 1,
    }).limit(Number(body?.limit) || 2000).lean();

    // 기본은 **학습으로 확실한 것만** 분류한다.
    //
    // 한때 남는 것을 전부 어딘가에 밀어 넣어 '미분류 0건' 을 만들었는데,
    // 발신 도메인마다 폴더가 생겨 1통짜리 폴더가 7개 나왔다. 거래처 목록이
    // 잡음으로 뒤덮여 진짜 거래처를 찾기가 더 어려워졌다.
    // 애매한 것은 미분류로 남겨 두고 사람이 직접 옮기는 편이 낫다.
    // (정말 필요하면 fallback: true 로 부를 수 있게 남겨 둔다)
    const useFallback = body?.fallback === true;
    const ownDomainSet = useFallback ? await getOwnDomains() : new Set<string>();

    // 발신 도메인별 누적 통수 — 폴더를 팔 만큼 오간 곳인지 판단하는 근거.
    // 이번에 분류할 것만이 아니라 **전체 수신 이력**을 세야 한다
    // (한 통씩 여러 번 온 곳도 합치면 단골일 수 있다).
    // 단 "전체" 는 내가 볼 수 있는 계정 전체 — 남의 메일 통수로 내 폴더가 생기면 안 된다.
    const domainCounts = new Map<string, number>();
    if (useFallback) {
      const rows: any[] = await InboundMail.aggregate([
        { $match: { ...mailFilter(scope), direction: { $ne: 'out' }, 'from.address': { $nin: [null, ''] } } },
        { $group: { _id: { $toLower: { $arrayElemAt: [{ $split: ['$from.address', '@'] }, 1] } }, n: { $sum: 1 } } },
      ]);
      for (const r of rows) if (r._id) domainCounts.set(String(r._id), r.n);
    }

    let bySender = 0;
    let byName = 0;
    let byFallback = 0;
    const ops: any[] = [];

    for (const m of targets) {
      const s = suggestGroupBySender({ from: m.from }, learned);
      const n = s ? null : suggestGroupByName({ subject: m.subject }, knownGroups);
      let hit: any = s || n;
      let by: string;

      if (hit) {
        if (s) { bySender++; by = `sender:${(hit as any).by}`; }
        else   { byName++;   by = `name:${(hit as any).matched}`; }
      } else if (useFallback) {
        // 처음 보는 발신자 — 자사/광고/발신도메인 순으로 배치한다
        const auto = autoAssignGroup(
          { from: m.from, classification: m.classification },
          ownDomainSet,
          domainCounts,
        );
        if (!auto) continue;
        hit = auto;
        byFallback++;
        by = `auto:${auto.by}`;
      } else {
        continue;
      }

      ops.push({
        updateOne: {
          // targets 가 이미 범위 안이지만, 쓰기에도 범위를 한 번 더 건다
          filter: { _id: m._id, ...mailFilter(scope) },
          update: { $set: { group: hit.group, groupBy: by } },
        },
      });
    }

    for (let i = 0; i < ops.length; i += 500) {
      await InboundMail.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    }

    return NextResponse.json({
      success: true,
      scanned: targets.length,
      classified: ops.length,
      bySender,
      byName,
      byFallback,
      learnedSenders: learned.size,
      knownGroups: knownGroups.length,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '재분류 실패' }, { status: 500 });
  }
}
