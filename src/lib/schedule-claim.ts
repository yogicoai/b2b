/**
 * 예약 발송의 **동시 실행 규칙** — 한 곳에서 정한다.
 *
 * 예약을 보내는 길은 셋이다: 크론 라우트(/api/cron/process-schedules),
 * 화면의 [즉시 발송](/api/mail/schedule/[id]), 그리고 예전의 로컬 스크립트.
 * 한 길만 선점 규칙을 지키면 나머지 길로 같은 업체에 두 번 나간다 —
 * 실제로 그렇게 규칙이 한 곳에만 있어서 두 경로가 빠져 있었다.
 * 새로 발송 경로를 만들면 반드시 여기 함수만 쓸 것.
 *
 * ── 상태 흐름 ──
 *   pending ──선점──▶ processing ──보냄──▶ sent
 *                         │
 *                         ├─ 안 보냄(가드·야간·드라이런) ─▶ pending
 *                         └─ 보내기 시작했는데 기록이 없음 ─▶ failed('발송 여부 불명')
 *
 * 마지막 줄이 핵심이다. sendStartedAt 이 찍힌 건은 **절대 자동으로 pending 에
 * 되돌리지 않는다.** SMTP 가 이미 성공했을 수 있고, 그렇다면 되돌리는 순간
 * 같은 업체에 두 번째 메일이 나간다. 사람이 보낸메일함을 보고 판단하게 넘긴다.
 */
import { EmailSchedule } from '@/models/EmailSchedule';
import { CronLock } from '@/models/CronLock';

const LOCK_ID = 'process-schedules';

/** 선점 후 이만큼 지나도 processing 이면 그 실행은 죽은 것이다 (실행은 길어야 300초) */
export const STALE_MS = 10 * 60 * 1000;
/** 임대 시간 — Vercel maxDuration(300초)보다 조금 길게 */
const LEASE_MS = 320 * 1000;

const UNKNOWN = '발송 여부 불명 — 보내기 시작한 뒤 기록 전에 끊겼습니다. 보낸메일함에서 이 주소로 나갔는지 확인하고, 안 나갔으면 다시 예약하세요.';

export function newRunId(prefix = 'run'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 보낼 차례가 된 예약 하나를 원자적으로 선점한다. 없으면 null.
 * exclude — 이번 실행에서 이미 한 번 잡았던 것 (가드에 걸려 pending 으로 돌아간 것을
 *           같은 실행이 곧바로 다시 잡아 무한히 돌지 않게)
 */
export async function claimNext(runId: string, exclude: any[] = []) {
  return EmailSchedule.findOneAndUpdate(
    { status: 'pending', scheduledFor: { $lte: new Date() }, _id: { $nin: exclude } },
    { $set: { status: 'processing', claimedAt: new Date(), claimedBy: runId, sendStartedAt: null } },
    { sort: { scheduledFor: 1 }, new: true },
  );
}

/** 특정 예약 하나를 선점한다 ([즉시 발송]). 이미 누가 쥐었거나 pending 이 아니면 null */
export async function claimById(id: string, runId: string, extra: Record<string, any> = {}) {
  return EmailSchedule.findOneAndUpdate(
    { _id: id, status: 'pending', ...extra },
    { $set: { status: 'processing', claimedAt: new Date(), claimedBy: runId, sendStartedAt: null } },
    { new: true },
  );
}

/**
 * 처리가 끝났는데 아직 processing 으로 남은 건을 정리한다.
 * processScheduleItem 은 보통 sent·failed·pending·canceled 중 하나로 정하고 끝난다.
 * 그러지 못하고 빠져나온 경우(예외, 발송 잠금 조기 반환)에만 여기서 걸린다.
 */
export async function settleClaim(id: any, runId: string): Promise<'released' | 'unknown' | 'none'> {
  // 보내기 시작 전이면 안전하게 되돌린다
  const back = await EmailSchedule.updateOne(
    { _id: id, status: 'processing', claimedBy: runId, sendStartedAt: null },
    { $set: { status: 'pending', claimedAt: null, claimedBy: '' } },
  );
  if (back.modifiedCount) return 'released';
  // 보내기 시작한 뒤라면 되돌리지 않는다 — 사람에게 넘긴다
  const unk = await EmailSchedule.updateOne(
    { _id: id, status: 'processing', claimedBy: runId, sendStartedAt: { $ne: null } },
    { $set: { status: 'failed', lastError: UNKNOWN } },
  );
  return unk.modifiedCount ? 'unknown' : 'none';
}

/** 죽은 실행이 쥔 채 남긴 것 — 보내기 전이면 되돌리고, 보내기 시작했으면 '불명' 으로 닫는다 */
export async function releaseStale(): Promise<{ released: number; unknown: number }> {
  const cutoff = new Date(Date.now() - STALE_MS);
  // claimedAt 이 없는 processing(스키마 바뀌기 전 기록 등)은 updatedAt 으로 판단한다
  const stale: Record<string, any> = {
    status: 'processing',
    $or: [{ claimedAt: { $lt: cutoff } }, { claimedAt: null, updatedAt: { $lt: cutoff } }],
  };
  const r1 = await EmailSchedule.updateMany(
    { ...stale, sendStartedAt: null },
    { $set: { status: 'pending', claimedAt: null, claimedBy: '' } },
  );
  const r2 = await EmailSchedule.updateMany(
    { ...stale, sendStartedAt: { $ne: null } },
    { $set: { status: 'failed', lastError: UNKNOWN } },
  );
  return { released: r1.modifiedCount, unknown: r2.modifiedCount };
}

/** 임대를 잡는다. 다른 실행이 쥐고 있으면 false */
export async function acquireLease(runId: string): Promise<boolean> {
  const now = new Date();
  try {
    const r = await CronLock.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] },
      { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS), owner: runId } },
      { upsert: true, new: true },
    );
    return !!r && r.owner === runId;
  } catch (e: any) {
    // 조건이 안 맞으면(누가 쥐고 있음) upsert 가 같은 _id 로 insert 하려다 11000 이 난다
    if (e?.code === 11000) return false;
    throw e;
  }
}

export async function releaseLease(runId: string): Promise<void> {
  await CronLock.updateOne({ _id: LOCK_ID, owner: runId }, { $set: { leaseUntil: null, owner: '' } });
}

/** 실행 기록 — 크론이 깨운 것만 건강 판정(lastCronRunAt)에 쓴다 */
export async function recordRun(by: 'cron' | 'button', result: Record<string, any>): Promise<void> {
  const now = new Date();
  const set: Record<string, any> = { lastRunAt: now, lastRunBy: by, lastResult: result };
  if (by === 'cron') set.lastCronRunAt = now;
  await CronLock.updateOne({ _id: LOCK_ID }, { $set: set }, { upsert: true });
}

export async function readHeartbeat() {
  const d: any = await CronLock.findById(LOCK_ID).lean();
  return {
    lastCronRunAt: d?.lastCronRunAt || null,
    lastRunAt: d?.lastRunAt || null,
    lastRunBy: d?.lastRunBy || '',
    lastResult: d?.lastResult || null,
  };
}
