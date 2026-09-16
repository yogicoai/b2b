import { NextResponse } from 'next/server';
import { client, resolveModel } from '@/lib/ai/client';
import { getMailSettings } from '@/lib/mail-settings';
import { actualCost } from '@/lib/ai/estimate';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/ai/translate — 화면에 보이는 영문 한 덩어리를 한국어로.
 *
 * 화면 곳곳에 영문이 그대로 남아 있다(메일 제목·본문, 리드 근거 문장 등).
 * 전체를 미리 번역해 두면 안 볼 것까지 돈을 내게 되므로,
 * **누른 것만 그때 번역**한다. 한 번에 한 덩어리라 비용이 예측된다.
 *
 * Body: { text: string }  또는  { texts: string[] }
 * 응답: { success, translated: string | string[], krw }
 */

const SYSTEM = `당신은 K-뷰티 B2B 무역 실무 번역가입니다.
받은 텍스트를 자연스러운 한국어로 옮기세요.

규칙:
- 뜻을 바꾸지 말고, 없는 내용을 덧붙이지 마세요.
- 회사명·브랜드명·제품명·사람 이름은 원문 그대로 두세요 (예: COSRX, Beauty of Joseon, Notino).
- 무역 용어는 실무에서 쓰는 대로 옮기세요 (MOQ→최소주문수량, FOB→FOB, distributor→유통사, retailer→리테일러).
- 이메일 주소·URL·숫자·금액·날짜는 그대로 두세요.
- 줄바꿈과 문단 구분을 유지하세요.
- 이미 한국어인 부분은 그대로 두세요.
- 번역문만 출력하세요. 설명·머리말·따옴표를 붙이지 마세요.`;

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 본문' }, { status: 400 });
  }

  const many = Array.isArray(body?.texts);
  const items: string[] = many
    ? body.texts.map((t: any) => String(t || ''))
    : [String(body?.text || '')];

  if (!items.length || items.every((t) => !t.trim())) {
    return NextResponse.json({ success: false, error: '번역할 내용이 없습니다' }, { status: 400 });
  }
  // 화면 한 덩어리를 번역하는 용도다. 통째로 긴 문서가 들어오면 비용이 튄다.
  const tooLong = items.find((t) => t.length > 12000);
  if (tooLong) {
    return NextResponse.json({ success: false, error: '한 번에 번역하기엔 너무 깁니다 (12,000자 초과)' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'ANTHROPIC_API_KEY 미설정 — .env.local 에 넣어야 번역이 동작합니다.' },
      { status: 400 },
    );
  }

  try {
    const settings = await getMailSettings();
    const model = resolveModel(settings);

    // 여러 개를 한 번에 보낼 때는 구분자로 이어 붙인다.
    // 건별로 호출하면 같은 시스템 프롬프트 값을 개수만큼 중복해서 내게 된다.
    const SEP = '\n<<<---TRANSLATE-SPLIT--->>>\n';
    const joined = items.join(SEP);

    const res: any = await client().messages.create({
      model,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: many
          ? `다음은 ${items.length}개의 텍스트이며 구분자 "<<<---TRANSLATE-SPLIT--->>>" 로 나뉘어 있습니다.\n같은 구분자로 나눠서 같은 개수로 번역문만 출력하세요.\n\n${joined}`
          : joined,
      }],
    });

    const block = (res.content || []).find((b: any) => b.type === 'text');
    const out = String(block?.text || '').trim();
    if (!out) throw new Error('번역 결과가 비어 있습니다.');

    const cost = actualCost(
      {
        input_tokens: res.usage?.input_tokens,
        output_tokens: res.usage?.output_tokens,
        cache_read_input_tokens: res.usage?.cache_read_input_tokens,
        cache_creation_input_tokens: res.usage?.cache_creation_input_tokens,
      },
      model,
    );

    if (!many) {
      return NextResponse.json({ success: true, translated: out, krw: cost?.krw || 0, model });
    }

    // 개수가 어긋나면 어느 항목이 어느 번역인지 알 수 없다 → 붙이지 않고 실패시킨다
    const parts = out.split('<<<---TRANSLATE-SPLIT--->>>').map((p) => p.trim());
    if (parts.length !== items.length) {
      return NextResponse.json(
        { success: false, error: `번역 결과 개수가 맞지 않습니다 (요청 ${items.length} · 응답 ${parts.length})` },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, translated: parts, krw: cost?.krw || 0, model });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '번역 실패' }, { status: 500 });
  }
}
