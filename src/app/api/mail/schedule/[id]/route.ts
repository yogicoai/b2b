import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
import { processScheduleItem } from '@/lib/schedule-runner';
import { newRunId, claimById, settleClaim } from '@/lib/schedule-claim';

export const runtime = 'nodejs';
export const maxDuration = 120;   // 한 건 최악 소요(SMTP ~60초 + 보낸메일함 사본 20초)보다 길게

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

async function currentUser(): Promise<string | null> {
  const c = await cookies();
  const token = c.get('admin_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return (payload as any).user as string;
  } catch { return null; }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  await dbConnect();
  const doc = await EmailSchedule.findOne({ _id: id, createdBy: user });
  if (!doc) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  if (doc.status !== 'pending') return NextResponse.json({ success: false, error: `이미 ${doc.status} 상태` }, { status: 400 });
  doc.status = 'canceled';
  await doc.save();
  return NextResponse.json({ success: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action !== 'send-now') return NextResponse.json({ success: false, error: 'unknown action' }, { status: 400 });
  await dbConnect();

  // 크론과 **같은 선점 규칙**을 쓴다 (lib/schedule-claim.ts).
  // 예전엔 findOne 으로 pending 인지만 보고 바로 보냈다. 그 사이 크론이 같은 건을
  // 선점하면 둘 다 가드를 통과해(아직 발송 기록이 없으니) 같은 업체에 두 통이 나갔다.
  // 크론이 밀려 있을 때 [즉시 발송] 을 누르기 쉬워서 오히려 잘 겹치는 자리다.
  const runId = newRunId('send-now');
  const doc = await claimById(id, runId, { createdBy: user });
  if (!doc) {
    const cur: any = await EmailSchedule.findOne({ _id: id, createdBy: user }, { status: 1 }).lean();
    if (!cur) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    const msg = cur.status === 'processing' ? '지금 자동 발송이 이 건을 보내는 중입니다' : `이미 ${cur.status} 상태`;
    return NextResponse.json({ success: false, error: msg }, { status: 409 });
  }
  let result: any;
  try {
    result = await processScheduleItem(doc);
  } catch (e: any) {
    result = { ok: false, error: e?.message || 'unknown' };
  }
  // processing 에 남았으면 정리 — 보내기 시작한 뒤라면 되돌리지 않고 '불명' 으로 둔다
  await settleClaim(doc._id, runId);
  return NextResponse.json({ success: true, result });
}
