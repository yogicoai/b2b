# Vercel 배포 — 환경변수 설정 가이드

## 필수 환경변수 4개

Vercel 프로젝트 → Settings → Environment Variables 에 등록:

| 키 | 값 | 용도 |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://<아이디>:<비밀번호>@<클러스터>/<DB이름>` | DB 연결 |
| `JWT_SECRET` | `<긴 무작위 문자열 — 비밀번호 관리자에만 보관>` | 로그인 세션 |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (.env.local 값 그대로) | 🧠 AI 정밀 검증 (Claude API) |
| `ADMIN_ID` / `ADMIN_PASSWORD` | (옵션) 초기 마스터 계정 | 첫 로그인용 |

등록 후 반드시 **Redeploy** — env 변경은 새 빌드부터 반영됨.

---

## 동작 모드

| 환경 | AI 검증 호출 시 |
|---|---|
| **로컬 dev** (`npm run dev`) | `.env.local`의 `ANTHROPIC_API_KEY` 사용 |
| **Vercel production** | Vercel 환경변수의 `ANTHROPIC_API_KEY` 사용 |
| **키 없음** | API가 `500` + "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다" 응답 → 클라이언트가 사용자에게 노출 |

→ 사용자가 **🧠 AI 정밀 검증** 버튼 클릭 → 서버에서 자체적으로 Claude API 호출 → 결과를 DB에 저장 → UI에 표시.
오프라인 작업(이전에 curl로 돌리던 것)이 더 이상 필요 없음.

---

## 비용 관리

- **모델**: `claude-haiku-4-5` (가성비 최우선)
- **건당 비용**: 약 **$0.0005** (입력 600토큰 + 출력 100토큰 기준)
- **800건 전수 검증**: 약 **$0.40**

UI에서 검증 시작 전 confirm 다이얼로그로 예상 비용 표시 →
사용자가 인지하고 진행. 무단 호출 방지.

### 검증 대상 자동 필터
**의심(3~4점)인 + 아직 AI 검증 안 된 리드만** API 호출. 명확한 통과/무효는 토큰 낭비 안 함.

### 만약 비용을 더 줄이고 싶다면
- 그래도 Haiku 4.5는 분류 작업에 충분히 정확함 (Sonnet 대비 5분의 1 가격)
- 만약 더 절약: `lib/verify-ai.ts`의 `max_tokens: 400` → `300`으로 낮춰도 OK

---

## 보안

- `ANTHROPIC_API_KEY`는 **서버 전용** (`process.env.ANTHROPIC_API_KEY`)
- 클라이언트 코드(public/app.js)에는 절대 노출 안 됨
- API 호출은 `/api/leads/verify-ai` 라우트 안에서만 실행
- 미들웨어(JWT)로 로그인 안 한 사용자는 호출 불가
