import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import { EmailSchedule } from '@/models/EmailSchedule';
import { processScheduleItem } from '@/lib/schedule-runner';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const doc = await EmailSchedule.findOne({ _id: id, createdBy: user });
  if (!doc) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  if (doc.status !== 'pending') return NextResponse.json({ success: false, error: `이미 ${doc.status} 상태` }, { status: 400 });
  const result = await processScheduleItem(doc);
  return NextResponse.json({ success: true, result });
}
