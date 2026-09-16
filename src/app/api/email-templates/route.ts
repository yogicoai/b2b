import { NextResponse } from 'next/server';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import { isMasterUser } from '@/lib/masters';
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
    // 양식은 쓴 사람 것이다. 다른 사람이 쓴 문구가 내 목록에 섞여 있으면
    // 발송할 때 남의 양식을 고르게 되고, 고쳐 놓으면 그쪽 발송이 같이 바뀐다.
    // 마스터는 전부 본다 — 누가 무엇으로 보내고 있는지 확인할 사람이 있어야 한다.
    const user = await getSessionUser();
    if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    await dbConnect();
    const scope = isMasterUser(user)
      ? {}
      // createdBy 가 빈 것은 계정을 나누기 전에 만든 양식이다. 아무에게도
      // 안 보이면 쓰던 문구가 통째로 사라지므로 마스터만 보게 둔다.
      : { createdBy: user };

    const templates = await EmailTemplate.find(scope).sort({ updatedAt: -1 }).lean();
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
    const user = await getSessionUser();
    if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

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
      // 만든 사람을 박아 둔다. 요청 본문 값을 믿지 않는다 —
      // 그러면 남의 이름으로 양식을 만들 수 있다.
      createdBy: user,
    });
    return NextResponse.json({ success: true, template: t });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
