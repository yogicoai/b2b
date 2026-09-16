import dbConnect from '@/lib/mongodb';
import { Unsubscribe } from '@/models/Unsubscribe';
import { Lead } from '@/models/Lead';
import { verifyUnsubscribe } from '@/lib/email/compliance';

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
