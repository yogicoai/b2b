import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { EmailTemplate } from '@/models/EmailTemplate';
import { TEMPLATE_VARS, TEMPLATE_VAR_GROUPS } from '@/lib/template-vars';
import { normalizeTemplateAttachments } from '@/lib/mail/template-attachments';

export const runtime = 'nodejs';

/**
 * GET  /api/email-templates          → 전체 목록 + 사용 가능한 변수 정보
 * POST /api/email-templates          → 새 템플릿 생성
 */
export async function GET() {
  try {
    await dbConnect();
    const templates = await EmailTemplate.find({}).sort({ updatedAt: -1 }).lean();
    return NextResponse.json({
      success: true,
      templates,
      // UI 에디터가 변수 chip 렌더링에 사용
      variables: TEMPLATE_VARS.map((v) => ({
        key: v.key,
        label: v.label,
        example: v.example,
        description: v.description,
        group: v.group,
      })),
      variableGroups: TEMPLATE_VAR_GROUPS,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.name || !body?.subject || !body?.body) {
      return NextResponse.json(
        { success: false, error: 'name/subject/body 필수' },
        { status: 400 },
      );
    }
    const atts = normalizeTemplateAttachments(body.attachments);
    if (!atts.ok) return NextResponse.json({ success: false, error: atts.error }, { status: 400 });
    await dbConnect();
    const t = await EmailTemplate.create({
      name: String(body.name).trim(),
      language: body.language === 'ko' ? 'ko' : 'en',
      subject: String(body.subject),
      body: String(body.body),
      bodyIsHtml: body.bodyIsHtml === true,
      purpose: body.purpose || 'intro',
      isActive: body.isActive !== false,
      appendAccountSignature: body.appendAccountSignature !== false,
      attachments: atts.list,
      createdBy: body.createdBy || '',
    });
    return NextResponse.json({ success: true, template: t });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
