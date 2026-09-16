import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { InboundMail } from '@/models/InboundMail';
import { getMailScope, mailFilter, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * POST /api/mail/groups/rename — 거래처 폴더 이름 바꾸기.
 *
 * 자동 배치는 도메인에서 이름을 만든다. 그래서 회사 이름이 아니라 도메인 조각이
 * 폴더명이 되는 경우가 많다 — Besko(㈜베스코해운항공), Alvarocintas(뉴스레터),
 * Osstempharma(오스템파마). 읽는 사람에게는 한글 상호가 맞다.
 *
 * 왜 필요한가: 폴더명을 못 고치면 쓰는 사람이 매번 "Besko 가 어디였더라"를
 * 떠올려야 한다. 그 부담이 쌓이면 폴더를 안 보게 된다.
 *
 * 이름을 바꾸면 그 폴더의 메일 전부를 새 이름으로 옮기고 groupBy 를 'manual' 로
 * 표시한다. 자동 배치가 다음에 돌 때 사람이 정한 이름을 덮지 않게 하려는 것이다.
 *
 * Body: { from: '옛 이름', to: '새 이름' }
 */
export async function POST(req: Request) {
  const scope = await getMailScope();
  if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* 아래 검증에서 걸린다 */ }

  const from = String(body.from || '').trim();
  const to = String(body.to || '').trim();

  if (!from) {
    return NextResponse.json({ success: false, error: '바꿀 폴더를 골라 주세요.' }, { status: 400 });
  }
  if (!to) {
    return NextResponse.json({ success: false, error: '새 이름을 넣어 주세요.' }, { status: 400 });
  }
  if (to.length > 40) {
    return NextResponse.json({ success: false, error: '이름은 40자까지입니다.' }, { status: 400 });
  }
  // 모아두기 칸은 이름을 못 바꾼다. 코드가 이 이름들로 동작을 가른다
  // (정렬에서 뒤로 보내기, 자동 배치의 목적지). 이름이 바뀌면 그 판단이 전부 어긋난다.
  if (from.startsWith('·') || to.startsWith('·')) {
    return NextResponse.json({
      success: false,
      error: '· 로 시작하는 칸(사내·기타·광고)은 이름을 바꿀 수 없습니다.',
    }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ success: false, error: '같은 이름입니다.' }, { status: 400 });
  }

  await dbConnect();

  const r = await InboundMail.updateMany(
    { ...mailFilter(scope), group: from },
    // groupBy:'manual' — 사람이 정한 이름이라는 표시. 자동 배치가 덮지 않는다.
    { $set: { group: to, groupBy: 'manual', groupMovedAt: new Date() } },
  );

  if (!r.matchedCount) {
    return NextResponse.json({ success: false, error: '그 폴더에 메일이 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, from, to, moved: r.modifiedCount });
}
