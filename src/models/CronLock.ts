import mongoose, { Schema } from 'mongoose';

/**
 * 발송기 임대(lease) + 심장 박동(heartbeat).
 *
 * 문서는 하나다 (_id: 'process-schedules').
 *
 * ── 임대 ──
 * 예약 발송은 외부 크론(10분마다) · Vercel 크론(하루 1회) · 화면 버튼 셋이 깨운다.
 * 예약 한 건 단위로 선점해도 **실행 자체**가 겹치면 발신 속도와 하루 상한이
 * 겹친 수만큼 배가 된다(회당 10통 × 2 = 이카운트가 막았던 속도에 근접).
 * 그래서 한 번에 한 실행만 보내게 한다. 임대를 못 잡은 실행은 바로 돌아간다.
 *
 * ── 심장 박동 ──
 * 외부 크론이 조용히 멈추면(설정 실수·서비스 장애·요금제) 예약이 쌓이기만 한다.
 * 크론이 부를 때마다 lastCronRunAt 을 찍고, 화면이 그게 오래됐으면 경고한다.
 */
export interface ICronLock {
  _id: string;
  leaseUntil: Date | null;
  owner: string;
  lastRunAt?: Date | null;       // 누가 깨웠든 마지막 실행
  lastRunBy?: string;            // 'cron' | 'button'
  lastCronRunAt?: Date | null;   // **크론이** 깨운 마지막 시각 — 건강 판정 기준
  lastResult?: Record<string, any>;
}

const CronLockSchema = new Schema<ICronLock>({
  _id: { type: String, required: true },
  leaseUntil: { type: Date, default: null },
  owner: { type: String, default: '' },
  lastRunAt: { type: Date, default: null },
  lastRunBy: { type: String, default: '' },
  lastCronRunAt: { type: Date, default: null },
  lastResult: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true, _id: false });

export const CronLock =
  (mongoose.models.CronLock as mongoose.Model<ICronLock>) ||
  mongoose.model<ICronLock>('CronLock', CronLockSchema);
