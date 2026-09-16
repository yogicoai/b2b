import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * POST /api/mail/move-group — 메일을 거래처 폴더로 옮긴다 (사람이 직접).
 *
 * 자동 분류는 발신자 이력으로 확실한 것만 잡고, 애매한 것은 미분류로 남긴다.
 * 한때 남는 것을 전부 자동 배치했더니 1통짜리 폴더가 무더기로 생겨
 * 거래처 목록이 잡음으로 뒤덮였다. 판단은 사람이 하는 편이 낫다.
 *
 * Body: { mailIds: string[], group: string }
 *   group 이 빈 문자열이면 미분류로 되돌린다.
 *
 * 옮긴 뒤에는 groupBy='manual' 로 표시한다. 재분류가 돌아도 사람이 정한
 * 분류를 덮지 않게 하기 위해서다.
 *
 * 로그인한 아이디가 볼 수 있는 계정의 메일만 옮긴다 (lib/mail/scope.ts).
 */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  const ids: string[] = Array.isArray(body?.mailIds) ? body.mailIds : [];
  const group = String(body?.group ?? '').trim();
  if (!ids.length) {
    return NextResponse.json({ success: false, error: 'mailIds 필요' }, { status: 400 });
  }

  try {
    await dbConnect();
    const scope = await getMailScope();
    if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    // 범위 조건을 수정 쿼리에 직접 건다 — 남의 메일 id 가 섞여 와도 그 메일은 건드리지 않는다
    const r = await InboundMail.updateMany(
      { _id: { $in: ids }, ...mailFilter(scope) },
      { $set: { group, groupBy: group ? 'manual' : '', groupMovedAt: new Date() } },
    );
    return NextResponse.json({
      success: true,
      moved: r.modifiedCount,
      group: group || '(미분류)',
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '이동 실패' }, { status: 500 });
  }
}
