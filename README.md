# yogiboB2b — 요기보 국내 B2B CRM

빈백 브랜드 **요기보**의 국내 B2B 영업 파이프라인.
키워드로 업체를 캐내고 → AI 로 규모를 가리고 → 사람이 승인하고 → 메일을 보내고 → **답장까지 한 화면에서** 관리한다.

해외 바이어용 CRM(`Desktop/vercelData`)을 베이스로 국내 도메인으로 갈아끼운 것이다.
메일함·인증·발송·예약 같은 뼈대는 그쪽에서 그대로 물려받았고, 국내에서만 필요한
것(키워드 크롤링·카테고리·정보통신망법)을 새로 붙였다.

```
npm install
npm run dev        # http://localhost:5610
```

초기 로그인은 `.env.local` 의 `ADMIN_ID` / `ADMIN_PASSWORD` (기본 admin / admin).
계정이 없으면 `npx ts-node -P tsconfig.scripts.json scripts/seed-admin.ts`.

---

## 파이프라인

```
[🔎 크롤링]  카테고리 고르고 시작 — 아래 셋이 한 번에 돈다
   ① 네이버 지역검색 (전국 17개 시·도 × 키워드)
   ② 홈페이지에서 메일 주소 추출        ← 전체 시간의 90%
   ③ 메일을 확보한 곳만 AI 규모 검증
        ↓
  → [검증 완료]   verified   보낼 수 있는 곳 (점수순)
  → [검증 실패]   failed     메일 없음 · AI 부적합
  → [발송 리스트] queued     사람이 "보내도 된다"고 고른 곳
  → [발송 완료]   contacted
  → [답장 받음]   replied → [대화 중] negotiating → [파트너 확정] partner
```

중간에 사람이 훑는 칸([수집함]·[검증 대기])은 두지 않았다. 상호와 주소만 보고는
규모를 가릴 수 없고, 그 판단은 어차피 AI 가 한다. 손으로 못 거르는 것을 거르는
칸을 만들면 그냥 쌓이기만 한다.

단계 목록은 [`src/lib/stages.ts`](src/lib/stages.ts) 한 곳에서만 관리한다.

## 타깃 5개 카테고리

[`src/lib/domain/categories.ts`](src/lib/domain/categories.ts)

| key | 라벨 | 소구점 |
|---|---|---|
| `public` | 학교·공공기관·복지시설 | 도서관·라운지·상담실·복지 라운지 |
| `company` | 기업 | 오피스 휴게실·리프레시존 |
| `medical` | 병·의원 | 대기실·소아 진료실·요양 라운지 |
| `resort` | 리조트·호텔 | 로비·키즈존·풀사이드·객실 |
| `sports` | 스포츠시설·단체 | 선수 라운지·회복공간·관람 라운지 |

**타깃 원칙은 업종이 아니라 규모다.** 한 번에 여러 개가 들어가는 곳(체인 호텔·대학병원·
대기업 사옥·지자체·프로구단)이 대상이고, 1인 펜션·동네 의원 같은 곳은 AI 검증이 걸러낸다.
이 판단을 하는 프롬프트가 [`src/lib/verify-ai.ts`](src/lib/verify-ai.ts) 에 있다.

## 크롤링

화면의 **[🔎 크롤링]** 에서 전부 돈다. 카테고리를 **여러 개** 고르면 하나씩 차례로 돈다
(한꺼번에 돌리면 진행률이 "몇 중 몇"으로 안 나와 남은 시간을 짐작할 수 없다).

- 지역은 늘 전국이다. 고르게 하지 않는다
- 키워드를 비우면 그 카테고리에 등록된 것이 전부 쓰인다
- 누르기 전에 **검색 횟수·발견 예상·AI 비용·소요 시간**을 보여주고 확인받는다
- 15분이 넘는 작업이라 백그라운드로 돈다. 화면을 옮겼다 와도 이어진다
- 도는 동안 찾은 업체가 실시간으로 쌓인다

터미널로도 돌릴 수 있다: `npm run crawl:all -- resort`
중단해도 안전하다. 이미 넣은 곳은 다음 실행에서 중복으로 걸러진다.

> **크롤링은 Vercel 에서 못 돈다.** 홈페이지 렌더에 Playwright 브라우저가 필요한데
> 서버리스에는 바이너리가 없고 실행시간 제한에도 걸린다. 수집은 로컬(또는 전용 워커)에서
> 돌리고, 배포된 앱은 그 결과를 보고 다루기만 한다.

수집이 한 바퀴 돌면 같은 키워드로는 새 업체가 더 안 나온다 — 이미 찾은 곳은 걸러지기
때문이다. 신규를 쌓으려면 `keywords` 컬렉션에 키워드를 추가한다
([🏷 키워드 관리] 화면은 살아 있고 메뉴에서만 숨겨 뒀다).

메일 주소를 못 찾은 곳은 버리지 않고 **검증 실패**에 사유와 함께 남긴다. 전화번호는
있으니 나중에 따로 연락할 수 있고, 다시 크롤링해도 같은 곳을 또 뒤지지 않는다.

## 정보통신망법 (제50조)

국내 업체에 먼저 보내는 메일은 전부 **광고성 정보**다. 아래 셋이 빠지면 건당 과태료 대상이다.

1. 제목 맨 앞 `(광고)` 표기
2. 본문에 발신자 명칭·주소·연락처
3. 수신거부 수단 — 본문에 명시하고, **실제로 동작할 것**

이것들은 "쓰면 좋은 유틸"이 아니라 발송 경로가 반드시 지나는 관문으로 만들어 뒀다.
[`src/lib/mailer.ts`](src/lib/mailer.ts) 의 `sendMail({ ad: true })` 가
[`src/lib/email/compliance.ts`](src/lib/email/compliance.ts) 를 호출해 제목·본문·발송시각을
한꺼번에 검사한다. 야간(21:00~08:00 KST)은 자동 차단된다.

수신거부 링크(`/api/unsubscribe`)는 **인증 뒤에 두면 안 된다** — 누르는 사람은 우리 직원이
아니라 메일을 받은 바깥 업체다. 그래서 [`src/proxy.ts`](src/proxy.ts) 화이트리스트에 있고,
대신 주소마다 HMAC 서명을 실어 남의 주소를 대신 거부시키지 못하게 한다.

한 번 거부한 주소는 `unsubscribes` 컬렉션에 **이메일 자체로** 남는다. 리드 문서의 플래그로만
두면 그 업체를 내년에 다시 크롤링했을 때 거부 이력이 같이 사라지기 때문이다.

## AI 에이전트 연결 (Claude · Codex · 아침 자동 실행)

에이전트는 **메일을 읽고 답장 초안을 넣는 것까지만** 한다. 발송은 사람이 회신 상자에서 [보내기]를 눌러야 된다.
쓰는 법·주소·응답 예시는 [`docs/AI_AGENT_API.md`](docs/AI_AGENT_API.md).

- 키: [⚙ 설정·도구 → 🤖 AI 에이전트 연결]에서 아이디마다 만든다. 로그인과 따로이고, 키는 만든 아이디의 메일함만 본다
- 들어오는 길: `/api/mcp`(원격 MCP) · `/api/agent/v1/*`(REST). [`src/proxy.ts`](src/proxy.ts) 가 이 두 경로만 쿠키 없이 통과시키고
  키 확인은 라우트 안에서 한다([`src/lib/agent/keys.ts`](src/lib/agent/keys.ts)). 발송·삭제·설정 API 는 이 경로에 없다
- 초안: [📨 발송 관리 → 🤖 승인 대기] 탭. 나가는 길은 원래 회신 경로(`/api/mail/reply`) 하나다
- 새 화면 코드는 [`public/agent-screens.js`](public/agent-screens.js) 에 갈라 뒀다 (kr-screens.js 와 같은 이유)

## 환경변수 (`.env.local`)

```
MONGODB_URI=            # 경로에 DB명(/yogiboB2b)까지 포함할 것 ← 아래 설명
JWT_SECRET=
ANTHROPIC_API_KEY=      # AI 검증·메일 분석·답장 초안
NAVER_CLIENT_ID=        # 네이버 검색 API (developers.naver.com)
NAVER_CLIENT_SECRET=
SMTP_HOST= SMTP_PORT= SMTP_SECURE= SMTP_USER= SMTP_PASS=
MAIL_FROM_NAME= MAIL_FROM_ADDRESS=
MAIL_DRY_RUN=1          # 1 = 실제 발송 안 함 (로그만)
COMPANY_NAME= COMPANY_ADDR= COMPANY_TEL=    # 법규 푸터
UNSUB_SECRET=           # 수신거부 링크 서명
APP_BASE_URL=           # 수신거부 링크가 가리킬 주소
CRON_SECRET=
```

**`MONGODB_URI` 경로에 DB명을 반드시 넣을 것.** `scripts/` 의 유지보수 스크립트 60여 개가
`dbName` 옵션 없이 `mongoose.connect(URI)` 를 그대로 부른다. 경로가 비어 있으면 그것들이
전부 기본 DB(`test`)에 붙어서, 앱은 `yogiboB2b` 를 보는데 스크립트만 딴 DB 를 고치는
상황이 된다. 해외 바이어 CRM 과 같은 Atlas 클러스터를 쓰므로 특히 조심할 것.

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · MongoDB(Mongoose) ·
Playwright(크롤링) · nodemailer + imapflow(메일 송수신) · @anthropic-ai/sdk

UI 는 [`public/app.js`](public/app.js) 한 파일에 든 바닐라 JS SPA 다(16,700줄).
국내판에서 새로 만든 화면은 [`public/kr-screens.js`](public/kr-screens.js) 로 갈라 뒀다 —
물려받은 코드와 새로 쓴 코드를 나중에 구분할 수 있어야 해서다.

## 컬렉션

`leads` · `inboundmails` · `emailtemplates` · `emailschedules` · `mailaccounts` ·
`adminusers` · `keywords` · `unsubscribes` · `crawljobs` ·
`agentkeys`(에이전트 키 · 해시만) · `agentaudits`(사용 기록 · 180일) · `agentdrafts`(승인 대기 초안)
