import { NextResponse } from 'next/server';
import {
  OUTBOUND_LOCKED,
  OUTBOUND_LOCK_MESSAGE,
  DAILY_SEND_CAP,
  SEND_INTERVAL_MS,
  TEST_RECIPIENTS,
} from '@/lib/outbound-lock';

export const runtime = 'nodejs';

/**
 * 이 응답은 절대 캐시하면 안 된다.
 *
 * GET 이 요청 객체를 쓰지 않아서 Next 가 빌드 시점에 굳혀 버릴 수 있다.
 * 그러면 잠금을 풀고 서버를 다시 띄워도 화면에는 "발송 잠금 중" 이 그대로
 * 떠 있게 된다 — 실제로는 나가는데 화면은 안 나간다고 말하는, 가장 나쁜
 * 어긋남이다. 값이 환경변수에서 오므로 매번 새로 계산해야 한다.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/mail/outbound-status — 아웃바운드 발송이 지금 열려 있는지.
 *
 * 잠금은 서버(lib/outbound-lock.ts)에만 있어서 화면은 그걸 알 방법이 없었다.
 * 그래서 발송함에 "보내기" 버튼이 멀쩡히 떠 있고, 눌러야만 실패 알림으로
 * 잠긴 걸 알게 됐다. 눌러보기 전에 화면에서 보이도록 상태를 내려준다.
 */
export function GET() {
  return NextResponse.json({
    success: true,
    locked: OUTBOUND_LOCKED,
    message: OUTBOUND_LOCKED ? OUTBOUND_LOCK_MESSAGE : '',
    dailyCap: DAILY_SEND_CAP,
    intervalMs: SEND_INTERVAL_MS,
    // 잠금 중에도 이 주소로는 실제로 나간다 — 화면에 그대로 적어 준다
    testRecipients: OUTBOUND_LOCKED ? TEST_RECIPIENTS : [],
  });
}
