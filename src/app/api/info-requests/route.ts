import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import { InfoRequest } from '@/models/InfoRequest';

export const runtime = 'nodejs';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

async function currentUser() {
  const c = await cookies();
  const token = c.get('admin_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return (payload as any).user as string;
  } catch { return null; }
}

/**
 * GET /api/info-requests — 적어 둔 요청을 최근 것부터.
 * POST                   — 새 요청 적기
 * PATCH                  — 상태 바꾸기 (처리함 / 되돌리기)
 *
 * 인증은 로그인만 본다. 요청 내용은 회사 업무 메모이고, 마스터끼리 같은
 * 것을 봐야 "적었는데 상대 화면엔 없다" 가 안 생긴다 (발송 계정과 같은 이유).
 */
export async function GET() {
  try {
    if (!(await currentUser())) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다' }, { status: 401 });
    }
    await dbConnect();
    const items = await InfoRequest.find({}).sort({ createdAt: -1 }).limit(50).lean();
    return NextResponse.json({
      success: true,
      items: items.map((r: any) => ({ ...r, _id: String(r._id) })),
      open: items.filter((r: any) => r.status !== 'done').length,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '조회 실패' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다' }, { status: 401 });
    }
    const { body, scope } = await req.json();
    const text = String(body || '').trim();
    if (!text) {
      return NextResponse.json({ success: false, error: '내용을 적어 주세요' }, { status: 400 });
    }
    // 너무 긴 것은 자른다 — 실수로 목록 전체를 붙여넣는 경우가 있다
    if (text.length > 4000) {
      return NextResponse.json({ success: false, error: '4000자까지 적을 수 있습니다' }, { status: 400 });
    }
    await dbConnect();
    const doc = await InfoRequest.create({
      body: text,
      scope: String(scope || 'verified').slice(0, 40),
      createdBy: user,
    });
    return NextResponse.json({ success: true, id: String(doc._id) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '저장 실패' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다' }, { status: 401 });
    }
    const { id, status, note } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id 가 없습니다' }, { status: 400 });

    const set: any = {};
    if (status && ['open', 'doing', 'done'].includes(status)) set.status = status;
    if (typeof note === 'string') set.note = note.slice(0, 2000);
    if (!Object.keys(set).length) {
      return NextResponse.json({ success: false, error: '바꿀 내용이 없습니다' }, { status: 400 });
    }

    await dbConnect();
    const r = await InfoRequest.updateOne({ _id: id }, { $set: set });
    if (!r.matchedCount) {
      return NextResponse.json({ success: false, error: '요청을 찾지 못했습니다' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '변경 실패' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id 가 없습니다' }, { status: 400 });
    await dbConnect();
    const r = await InfoRequest.deleteOne({ _id: id });
    return NextResponse.json({ success: true, deleted: r.deletedCount });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '삭제 실패' }, { status: 500 });
  }
}
