import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/mail/ingest';
import { listMailAccounts } from '@/lib/mail/accounts';
import { getSessionUser, UNAUTHORIZED } from '@/lib/mail/scope';
import dbConnect from '@/lib/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 300;   // 폴더 여러 개를 돌면 오래 걸린다

/**
 * POST /api/mail/ingest
 * Body: {
 *   limit?: number,      // 폴더당 최대 통수 (기본 설정값 50)
 *   recent?: number,     // 지정 시 lastUid 무시하고 최근 N통 (최초 세팅용)
 *   folders?: string[],  // 지정 시 이 폴더들만
 * }
 *
 * IMAP 으로 새 메일을 수집한다. 비용은 0원 — 규칙 필터와 로컬 분석만 돌고
 * AI 분석(유료)은 Phase 5 에서 별도 엔드포인트로 붙는다.
 */
export async function POST(req: Request) {
  // [메일 가져오기]는 누른 사람의 계정만 돈다 — 남의 메일함에 붙지 않게
  const user = await getSessionUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // 본문 없이 호출해도 기본값으로 동작한다
  }

  try {
    // 수신 계정 = 등록된 발송 계정(MailAccount). 이카운트는 SMTP/IMAP 자격증명이 같다.
    // user 를 넘겨 자기 계정만 센다 — 남의 계정이 있다고 "등록됨" 으로 보이면 안 된다.
    await dbConnect();
    const accounts = await listMailAccounts(user);
    if (!accounts.length) {
      return NextResponse.json({
        success: false,
        error: '등록된 메일 계정이 없습니다. [메일 계정] 화면에서 먼저 등록하세요.',
      }, { status: 400 });
    }

    const result = await runIngest({
      limit: body?.limit,
      recent: body?.recent,
      folders: Array.isArray(body?.folders) ? body.folders : undefined,
      // 'all' 이면 자기 활성 계정 전부, 미지정이면 자기 기본 계정.
      // 남의 계정 id 를 넣으면 runIngest 가 계정 없음으로 끝낸다 (user 범위로 찾으므로).
      accountId: body?.accountId,
      user,
    });

    return NextResponse.json({
      success: result.errors.length === 0,
      summary: {
        fetched: result.fetched,
        inserted: result.inserted,
        duplicate: result.duplicate,
        ruleFiltered: result.ruleFiltered,
        grouped: result.grouped,
        matched: result.matched,
        movedToReplied: result.movedToReplied,
        pendingAnalysis: result.pendingAnalysis,
        durationMs: result.durationMs,
      },
      // 이카운트 웹메일에서 직접 답한 건을 찾아낸 결과
      reconciled: result.reconciled || null,
      // 어느 리드의 답장이 새로 들어왔는지 — 화면에서 바로 띄울 수 있게
      replies: result.replies,
      folders: result.folders.map((f) => ({
        accountLabel: f.accountLabel,
        folder: f.folder,
        group: f.group,
        fetched: f.fetched,
        inserted: f.inserted,
        duplicate: f.duplicate,
        ruleFiltered: f.ruleFiltered,
        matched: f.matched,
        movedToReplied: f.movedToReplied,
        errorCount: f.errors.length,
      })),
      // ⚠️ 실패 건수는 반드시 노출한다. 조회·신규 건수만 보면
      //    전량 실패해도 정상처럼 읽힌다 (emailData 인계문서 경고).
      errors: result.errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || '수집 실패' },
      { status: 500 },
    );
  }
}
