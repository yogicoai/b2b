import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { EmailTemplate } from '@/models/EmailTemplate';
import { normalizeTemplateAttachments } from '@/lib/mail/template-attachments';

export const runtime = 'nodejs';

/**
 * GET    /api/email-templates/:id  → 단일 조회
 * PUT    /api/email-templates/:id  → 부분 업데이트
 * DELETE /api/email-templates/:id
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const t = await EmailTemplate.findById(id).lean();
    if (!t) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    return NextResponse.json({ success: true, template: t });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const update: any = {};
    const allowed = ['name', 'language', 'subject', 'body', 'bodyIsHtml', 'purpose', 'isActive', 'appendAccountSignature'];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
    }
    if (Object.prototype.hasOwnProperty.call(body, 'attachments')) {
      const atts = normalizeTemplateAttachments(body.attachments);
      if (!atts.ok) return NextResponse.json({ success: false, error: atts.error }, { status: 400 });
      update.attachments = atts.list;
    }
    await dbConnect();
    const t = await EmailTemplate.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!t) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    return NextResponse.json({ success: true, template: t });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const t = await EmailTemplate.findByIdAndDelete(id);
    if (!t) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
