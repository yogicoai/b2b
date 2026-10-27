/**
 * 에이전트 REST 라우트 공통 — DB 연결 → 키 확인 → 실행 → 사용 기록.
 * 라우트 파일은 "무슨 동작인지" 와 "어떤 함수를 부르는지" 만 적으면 된다.
 */
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { authenticate } from './keys';
import { logAudit } from './audit';
import { AgentError, type AgentCtx } from './api';

/**
 * 응답에 싣는 화면 주소의 앞부분.
 * APP_BASE_URL 이 localhost 로 남아 있으면 요청 주소를 쓴다 — 링크가 사람 PC 에서 안 열린다.
 */
export function baseUrlOf(req: Request): string {
  const env = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  if (env && !/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env)) return env;
  return new URL(req.url).origin;
}

/** 사용 기록에 남길 대상 — 메일·스레드 ID 정도만 */
function targetOf(input: Record<string, any> = {}): string | null {
  return input.mailId || input.mail_id || input.id || input.threadId || null;
}

/** Next 라우트의 두 번째 인자 — 정적 경로는 params 가 빈 객체다 */
type RouteCtx = { params: Promise<any> };

async function inputOf(req: Request, ctx?: RouteCtx): Promise<Record<string, any>> {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const params = ctx?.params ? (await ctx.params) || {} : {};
  let body: Record<string, any> = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      throw new AgentError('본문이 JSON 이 아닙니다. Content-Type: application/json 으로 보내 주세요.', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AgentError('본문은 JSON 객체여야 합니다.', 400);
  }
  // 주소의 key= 는 입력으로 받지 않는다 (REST 는 헤더로만 키를 받는다)
  delete (sp as any).key;
  return { ...sp, ...body, ...params };
}

type Handler = (input: Record<string, any>, ctx: AgentCtx) => Promise<Record<string, any>>;

/**
 * @param action  사용 기록에 남을 동작 이름 (audit.ts ACTION_LABELS)
 */
export function agentRoute(action: string, fn: Handler) {
  return async function handler(req: Request, routeCtx: RouteCtx) {
    await dbConnect();
    const auth = await authenticate(req, 'rest');
    if (auth.error !== undefined) {
      // 키를 아예 안 넣은 요청(주소를 훑는 봇 등)은 남기지 않는다 — 기록이 소음으로 덮인다
      if (auth.hint || auth.key) {
        await logAudit({
          key: auth.key, via: 'rest', action: 'auth_failed', ok: false, status: auth.status,
          error: auth.error, req, detail: { path: new URL(req.url).pathname, hint: auth.hint || null },
        });
      }
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    let input: Record<string, any> = {};
    try {
      input = await inputOf(req, routeCtx);
      const data = await fn(input, { key: auth.key, baseUrl: baseUrlOf(req) });
      await logAudit({ key: auth.key, via: 'rest', action, target: targetOf(input), ok: true, status: 200, req });
      return NextResponse.json({ success: true, ...data });
    } catch (e: any) {
      const status = e instanceof AgentError ? e.status : 500;
      const error = String(e?.message || e);
      await logAudit({ key: auth.key, via: 'rest', action, target: targetOf(input), ok: false, status, error, req });
      return NextResponse.json({ success: false, error }, { status });
    }
  };
}
