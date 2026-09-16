import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { EmailTemplate } from '@/models/EmailTemplate';
import { Lead } from '@/models/Lead';
import { MailAccount } from '@/models/MailAccount';
import { renderTemplate } from '@/lib/mailer';
import { buildVarsFromLead, buildExampleVars, buildSignatureBlock } from '@/lib/template-vars';
import { getSessionUser, ownerFilter } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * POST /api/email-templates/:id/preview
 * Body: { leadId?: string }
 *   leadId 있으면 → 해당 리드 값으로 치환
 *   leadId 없으면 → 예시 값으로 치환 (에디터 미리보기용)
 * 반환: { subject, body, bodyIsHtml, missing: string[] (치환 안 된 변수) }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const t: any = await EmailTemplate.findById(id).lean();
    if (!t) return NextResponse.json({ success: false, error: 'template not found' }, { status: 404 });

    let vars: Record<string, string>;
    let leadInfo: any = null;
    let accountInfo: any = null;
    let accProfile: any = null;
    const body = await req.json().catch(() => ({}));
    const leadId = body?.leadId as string | undefined;
    const mailAccountId = body?.mailAccountId as string | undefined;

    if (mailAccountId && /^[0-9a-f]{24}$/i.test(String(mailAccountId))) {
      // 서명은 로그인한 사람 몫의 계정에서만 가져온다 (lib/mail/scope.ts).
      // 남의 계정 id 면 서명 없이 미리보기 — 남의 이름·직함·연락처가 보이지 않게.
      const user = await getSessionUser();
      accProfile = user
        ? await MailAccount.findOne({ _id: mailAccountId, ...ownerFilter(user) }).lean()
        : null;
      if (accProfile) accountInfo = { id: String(accProfile._id), name: accProfile.accountName, from: accProfile.fromAddress };
    }

    if (leadId) {
      const lead = await Lead.findOne({ leadId }).lean() as any;
      if (!lead) return NextResponse.json({ success: false, error: 'lead not found' }, { status: 404 });
      vars = buildVarsFromLead(lead);
      leadInfo = { leadId: lead.leadId, company: lead.Company, region: lead.Region, email: lead.Email };
    } else {
      vars = buildExampleVars();
    }

    const subject = renderTemplate(t.subject, vars);
    let bodyRendered = renderTemplate(t.body, vars);

    // appendAccountSignature (기본 true) 이고 계정이 선택되어 있으면 서명 자동 부착
    const appendSig = t.appendAccountSignature !== false;
    if (appendSig && accProfile) {
      const sig = buildSignatureBlock(accProfile, { html: !!t.bodyIsHtml });
      if (sig) bodyRendered = bodyRendered + (t.bodyIsHtml ? sig : sig);
    }

    // 치환되지 않은 변수 감지 (미리보기 후에도 {{X}} 남아있으면 리스트)
    const missing: string[] = [];
    const re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(subject + '\n' + bodyRendered)) !== null) {
      if (!missing.includes(m[1])) missing.push(m[1]);
    }

    return NextResponse.json({
      success: true,
      subject,
      body: bodyRendered,
      bodyIsHtml: !!t.bodyIsHtml,
      missing,
      leadInfo,
      accountInfo,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
