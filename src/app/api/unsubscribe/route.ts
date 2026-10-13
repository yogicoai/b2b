import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Unsubscribe } from '@/models/Unsubscribe';
import { Lead } from '@/models/Lead';
import { verifyUnsubscribe } from '@/lib/email/compliance';
import { getMailScope, UNAUTHORIZED } from '@/lib/mail/scope';

export const runtime = 'nodejs';

/**
 * GET /api/unsubscribe?e=<base64url(email)>&t=<hmac>
 *
 * 메일 본문의 수신거부 링크가 여기로 온다. 인증을 걸지 않는다 —
 * 수신거부는 로그인한 우리 직원이 아니라 메일을 받은 바깥 사람이 누른다.
 * 대신 주소마다 HMAC 서명을 실어서 남의 주소를 손으로 바꿔 넣지 못하게 한다.
 *
 * 한 번 더 누르거나 링크가 이미 처리된 경우에도 같은 화면을 보여준다 —
 * 실패처럼 보이면 사람이 불안해서 다시 누르거나 항의 메일을 보낸다.
 */
function page(title: string, message: string, ok = true): Response {
  const color = ok ? '#3FA6D3' : '#c0392b';
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body{margin:0;background:#fff;color:#222;font-family:Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:440px;width:100%;text-align:center}
  h1{font-size:20px;margin:0 0 12px;color:${color}}
  p{font-size:14px;line-height:1.7;color:#555;margin:0}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = verifyUnsubscribe(url.searchParams.get('e'), url.searchParams.get('t'));

  if (!email) {
    return page('링크가 올바르지 않습니다', '메일에 있는 수신거부 링크를 그대로 눌러 주세요.', false);
  }

  await dbConnect();
  await Unsubscribe.updateOne(
    { email },
    { $setOnInsert: { email, source: 'link', createdAt: new Date() } },
    { upsert: true },
  );

  // 해당 주소를 쓰는 리드는 더 이상 발송 대상이 아니다.
  // stage 를 건드려 이력을 지우지는 않는다 — "보내면 안 되는 곳"이라는 사실만 남긴다.
  await Lead.updateMany(
    { $or: [{ Email: email }, { crawledEmails: email }] },
    { $set: { readyForOutreach: false, unsubscribed: true, unsubscribedAt: new Date().toISOString() } },
  );

  return page('수신거부가 완료되었습니다', '앞으로 요기보의 광고성 메일을 보내드리지 않습니다. 이용해 주셔서 감사합니다.');
}

/**
 * POST /api/unsubscribe   Body: { email: string, reason?: string }
 * DELETE /api/unsubscribe Body: { email: string }
 *
 * 화면에서 사람이 직접 "이 업체엔 보내지 마" 를 누르는 길이다.
 *
 * 왜 stage 를 'archived' 로 옮기지 않고 이 명단에 넣는가:
 * stage 는 리드에 붙고, 리드는 지웠다 다시 크롤링하면 새로 생긴다. 그때
 * 제외가 같이 사라진다. 수신거부는 **주소**에 붙어서 재수집을 넘어 살아남고,
 * 발송 경로 네 군데(팔로우업 생성·[보낼 메일] 화면·크롤러·발송 직전)가
 * 모두 이 명단을 본다. 사람이 고른 제외도 같은 강도로 지켜져야 한다.
 *
 * GET 과 달리 로그인을 요구한다 — 이쪽은 바깥 사람이 아니라 우리 직원이 쓴다.
 * DELETE 를 같이 두는 이유는 실수로 누른 것을 되돌릴 길이 없으면 안 되기 때문이다.
 * 다만 링크로 **본인이 직접 거부한 건(source:'link')은 되돌리지 않는다** —
 * 그건 우리가 취소할 수 있는 성질의 것이 아니다.
 */
async function readBody(req: Request): Promise<{ email: string; reason: string }> {
  let body: any = {};
  try { body = await req.json(); } catch { /* 빈 본문 */ }
  return { email: String(body?.email || '').trim().toLowerCase(), reason: String(body?.reason || '').trim() };
}

export async function POST(req: Request) {
  const scope = await getMailScope();
  if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { email, reason } = await readBody(req);
  if (!email.includes('@')) {
    return NextResponse.json({ success: false, error: '메일 주소가 올바르지 않습니다.' }, { status: 400 });
  }

  await dbConnect();
  await Unsubscribe.updateOne(
    { email },
    { $setOnInsert: { email, source: 'manual', reason: reason || `${scope.user} 가 화면에서 제외`, createdAt: new Date() } },
    { upsert: true },
  );
  const r = await Lead.updateMany(
    { $or: [{ Email: email }, { crawledEmails: email }] },
    { $set: { readyForOutreach: false, unsubscribed: true, unsubscribedAt: new Date().toISOString() } },
  );
  return NextResponse.json({ success: true, email, leadsUpdated: r.modifiedCount });
}

export async function DELETE(req: Request) {
  const scope = await getMailScope();
  if (!scope) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { email } = await readBody(req);
  if (!email.includes('@')) {
    return NextResponse.json({ success: false, error: '메일 주소가 올바르지 않습니다.' }, { status: 400 });
  }
  await dbConnect();
  const doc: any = await Unsubscribe.findOne({ email }).lean();
  if (!doc) return NextResponse.json({ success: false, error: '명단에 없는 주소입니다.' }, { status: 404 });
  if (doc.source === 'link') {
    return NextResponse.json({
      success: false,
      error: '업체가 직접 수신거부 링크를 누른 건이라 해제할 수 없습니다. 업체에서 다시 받기를 원한다고 알려온 경우에만 개발자에게 요청하세요.',
    }, { status: 409 });
  }
  await Unsubscribe.deleteOne({ email });
  const r = await Lead.updateMany(
    { $or: [{ Email: email }, { crawledEmails: email }] },
    { $set: { unsubscribed: false }, $unset: { unsubscribedAt: '' } },
  );
  return NextResponse.json({ success: true, email, leadsUpdated: r.modifiedCount });
}
