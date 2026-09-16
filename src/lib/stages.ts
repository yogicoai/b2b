/**
 * 리드 단계(stage) 목록 — 한 곳에서만 관리한다.
 *
 * 왜 파일을 따로 두는가:
 * 같은 목록이 최소 네 군데에 복사돼 있었다. Lead 모델 enum, 단계 변경 API 의
 * VALID_STAGES, recommended-buyers 의 validStages, 그리고 화면 쪽 라벨 맵.
 * 'queued'(발송 리스트)를 새로 넣으면서 모델에만 추가했더니, 단계 변경 API 가
 * 400 을 내며 "stage 는 다음 중 하나여야 함" 으로 이동 자체를 막았다.
 * 화면에는 드롭다운이 멀쩡히 떠 있는데 누르면 실패하는, 찾기 어려운 종류의 버그다.
 *
 * 새 단계를 추가할 때는 여기만 고치면 된다.
 */

export const STAGES = [
  'imported',
  'ai-searched',
  'verifying',
  'verified',
  'queued',      // 발송 리스트 — 사람이 "이제 보내도 된다"고 골라 옮긴 곳
  'contacted',   // 발송 완료 — 실제로 메일이 나간 곳
  'replied',
  'negotiating',
  'partner',
  'archived',
  'failed',
] as const;

export type Stage = (typeof STAGES)[number];

/** 화면에 쓰는 한국어 이름 */
export const STAGE_LABEL_KO: Record<Stage, string> = {
  imported: '가져오기',
  'ai-searched': 'AI 서칭',
  verifying: '검증 대기',
  verified: '검증 완료',
  queued: '발송 리스트',
  contacted: '발송 완료',
  replied: '답장 받음',
  negotiating: '대화 진행 중',
  partner: '파트너십 확정',
  archived: '보관함',
  failed: '검증 실패',
};

/** 이미 대화가 시작된 단계 — 광고 메일을 더 보내면 안 되는 곳 */
export const CONVERSATION_STAGES: Stage[] = ['replied', 'negotiating', 'partner'];

/** 메일이 한 번이라도 나갔거나 그 이후인 단계 */
export const POST_SEND_STAGES: Stage[] = ['contacted', 'replied', 'negotiating', 'partner'];

export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGES as readonly string[]).includes(v);
}
