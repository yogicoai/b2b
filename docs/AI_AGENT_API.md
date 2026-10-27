# AI 에이전트 연결 (Claude · Codex · 아침 자동 실행)

B2B 관리메일(b2b-ochre-seven)에 AI 에이전트를 붙이는 방법을 정리한 문서입니다.
에이전트는 **메일을 읽고 답장 초안을 넣는 것까지만** 할 수 있습니다.
실제 발송은 사람이 화면에서 확인하고 [보내기]를 눌러야 합니다.

- **MCP 주소 (Claude·Codex 연결용):** `https://b2b-ochre-seven.vercel.app/api/mcp`
  - Streamable HTTP를 쓰고 상태를 두지 않습니다. POST만 받습니다.
- **REST 기본 주소 (아침 자동 실행용):** `https://b2b-ochre-seven.vercel.app/api/agent/v1`
- MCP와 REST는 같은 키를 쓰고, 같은 함수를 부릅니다. 그래서 같은 질문에는 같은 답이 나옵니다.

---

## 1. 키 만들기

1. B2B 관리메일에 로그인합니다.
2. 왼쪽 메뉴에서 **⚙ 설정·도구 → 🤖 AI 에이전트 연결**로 들어갑니다.
3. 키 이름을 적고(예: `Claude — 노트북`) 도구를 고른 뒤 [새 키 만들기]를 누릅니다.
   - 도구는 Claude · Codex · 아침 자동 실행 · 기타 중에서 고릅니다.
4. 키(`ybk_…`)는 **이때 한 번만** 보입니다. 바로 복사해 둡니다.
   - 화면에 도구별 연결 명령도 함께 나옵니다.

키를 다룰 때 알아 둘 점:

- **키는 만든 아이디에 묶입니다.** 키로 볼 수 있는 메일은 그 아이디로 로그인했을 때 보이는 메일함과 같습니다.
- **도구마다 키를 따로 만듭니다** (Claude용, Codex용, 아침 자동 실행용).
  - 사용 기록에서 누가 무엇을 했는지 구분됩니다.
  - 하나만 끄거나 재발급할 수 있습니다.
- **끄기 · 켜기:** 키는 그대로 두고 잠시 막습니다.
- **재발급:** 새 키가 나오고, 예전 키는 그 즉시 막힙니다. 키가 새어 나갔을 때 씁니다.
- **삭제:** 키를 없앱니다. 사용 기록과 이미 넣어 둔 초안은 남습니다.
- **사용 기록:** 같은 화면 아래에 있고 180일 보관합니다.
  - 어떤 키가 언제, 무엇을(읽기 포함), 어느 메일에 했는지가 남습니다.
- DB에는 키의 해시만 저장합니다. 키를 잃어버리면 재발급해야 합니다.

## 2. 인증

모든 요청에 키를 넣습니다. 둘 중 하나를 쓰면 됩니다.

```
x-assistant-key: ybk_xxxxxxxx…
Authorization: Bearer ybk_xxxxxxxx…
```

| 상황 | 응답 |
|---|---|
| 키가 없거나 틀림 | `401` |
| 꺼 둔 키 | `403` |
| 남의 메일, 또는 없는 메일 | `404` (둘을 구분하지 않습니다) |

키로는 아래 주소에만 들어올 수 있습니다.

- `/api/agent/v1/*`
- `/api/mcp`

그 밖의 API(발송·삭제·설정·키 관리 등)는 키를 넣어도 로그인 화면으로 돌려보냅니다.
권한을 따로 막아 둔 것이 아니라, 키로 들어오는 경로에 그런 기능이 아예 없습니다.

## 3. 연결 방법

**Claude Code**

```bash
claude mcp add --transport http yogibo-b2b https://b2b-ochre-seven.vercel.app/api/mcp \
  --header "x-assistant-key: ybk_…"
```

**Codex** — `~/.codex/config.toml` 에 아래를 넣고, 키는 환경변수 `YOGIBO_B2B_KEY` 에 넣어 둡니다.

```toml
[mcp_servers.yogibo-b2b]
url = "https://b2b-ochre-seven.vercel.app/api/mcp"
bearer_token_env_var = "YOGIBO_B2B_KEY"
```

**Claude 웹·데스크톱 앱 (설정 → 커넥터 → 커스텀 커넥터 추가)**

커스텀 커넥터에는 헤더를 넣는 칸이 없습니다(인증은 OAuth만 지원).
그래서 이 경우에만 주소 뒤에 키를 붙여 넣습니다.

```
https://b2b-ochre-seven.vercel.app/api/mcp?key=ybk_…
```

- 이 주소는 키와 같으니 남에게 보내지 마세요.
- 주소에 넣은 키는 서버 접속 기록에 남을 수 있습니다. 헤더를 쓸 수 있는 곳에서는 헤더를 쓰세요.
- 주소에 붙인 키는 MCP에서만 받습니다. REST는 헤더로만 받습니다.

**REST (아침 자동 실행 등)**

```bash
curl -H "x-assistant-key: ybk_…" https://b2b-ochre-seven.vercel.app/api/agent/v1/reply-needed
```

**연결 확인** — `GET /api/agent/v1` 을 부르면 다음을 돌려줍니다.

- 이 키의 이름 · 주인 아이디 · 권한
- 쓸 수 있는 메일 계정
- 주소 목록

## 4. 기능별 주소

| 기능 | MCP 도구 | REST |
|---|---|---|
| 답장 필요 목록 | `list_reply_needed` | `GET /reply-needed?days=30&limit=50` |
| 오늘의 브리핑 | `get_briefing` | `GET /briefing?days=1` |
| 보낸 메일 (말투 학습용) | `list_sent_mails` | `GET /sent?days=60&limit=30&page=1` |
| 메일 1건 | `get_mail` | `GET /mails/{mailId}` |
| 스레드 전체 | `get_thread` | `GET /threads/{threadId 또는 mailId}` |
| 넣어 둔 초안 | `list_drafts` | `GET /drafts?status=pending&mine=true` |
| **답장 초안 저장** | `save_draft` | `POST /drafts` |

- REST 주소는 모두 `https://b2b-ochre-seven.vercel.app/api/agent/v1` 뒤에 붙습니다.
- REST 응답에는 `success` 가 늘 붙습니다. 실패하면 `{ "success": false, "error": "…" }` 가 옵니다.
- MCP 도구는 같은 JSON을 `content[0].text` 에 담아 돌려줍니다.
  - 도구 안에서 난 오류는 `isError: true` 와 함께 같은 자리에 문장으로 옵니다.
- MCP 도구의 인자는 `mail_id` · `thread_id` · `account_id` 처럼 밑줄로 씁니다.
- REST의 쿼리·본문은 `mailId` 처럼 붙여 씁니다.

---

## 5. 응답 예시 (기능마다 1개)

예시의 회사·주소·내용은 지어낸 것입니다.

### 5-1. 답장 필요 목록 — `GET /reply-needed?days=30&limit=1`

답장이 필요한데 아직 처리하지 않은 받은 메일을 최신순으로 줍니다.

- 기준은 받은 메일함의 [회신 필요]와 같습니다.
  - `analysis.needsReply` 인 메일
  - 상태가 신규 · 확인중인 메일
  - 광고 · 자동발송 · 뉴스레터는 뺍니다
- `bodyPreview` 는 인용된 앞 대화를 걷어낸, 이번에 새로 쓴 부분의 앞 2,000자입니다.
- `hasPendingDraft: true` 면 이미 승인 대기 초안이 들어가 있습니다.

```json
{
  "success": true,
  "days": 30,
  "count": 1,
  "items": [
    {
      "id": "6adfd9d2d4e66da63966f47d",
      "threadId": "t_7ZW0642V7Zi47YWUOjrsnbTrsLHrsLEg64-E7J6FIOusuOydmA",
      "from": { "name": "김담당", "address": "buyer@hotel-example.co.kr" },
      "company": "OO호텔",
      "leadId": "L-20260915-0012",
      "leadStage": "replied",
      "to": [{ "name": "", "address": "jay@yogico.kr" }],
      "cc": [],
      "subject": "Re: 요기보 빈백 도입 문의",
      "subjectKo": null,
      "receivedAt": "2026-10-26T23:05:12.000Z",
      "lang": "ko",
      "bodyPreview": "안녕하세요. 로비에 들일 빈백 20개 견적 부탁드립니다. 색상은 …",
      "bodyTruncated": false,
      "attachments": [{ "filename": "로비_도면.pdf", "size": 245113, "contentType": "application/pdf" }],
      "classification": "inquiry",
      "classificationLabel": "문의·견적",
      "importance": {
        "needsReply": true, "urgency": "high", "urgencyLabel": "높음",
        "deadline": "2026-10-30T09:00:00.000Z", "deadlineText": "이번 주 목요일까지", "deadlineType": "quote_due"
      },
      "analysis": {
        "method": "ai", "topic": "로비용 빈백 20개 견적 요청", "summary": "…",
        "keyPoints": ["20개", "목요일까지 견적"], "intent": "견적 받기",
        "suggestedAction": "단가·납기 회신", "replyReason": "견적 요청"
      },
      "status": "new",
      "statusLabel": "신규",
      "hasPendingDraft": false,
      "url": "https://b2b-ochre-seven.vercel.app/?mail=6adfd9d2d4e66da63966f47d"
    }
  ]
}
```

`url` 은 사람이 열어 볼 화면 주소입니다. 로그인한 상태에서 누르면 그 메일이 바로 열립니다.

### 5-2. 오늘의 브리핑 — `GET /briefing?days=1`

매일 아침(07:30 KST) 메일로 나가는 "오늘의 브리핑"과 같은 계산입니다.

- 직전 `days`일을 봅니다. 기본값은 설정의 브리핑 기간입니다.
- 범위는 키 주인의 메일함입니다.
- `html` 이 메일 본문 그대로이고, 나머지는 그 바탕이 된 목록입니다.

```json
{
  "success": true,
  "since": "2026-10-26T06:00:00.000Z",
  "until": "2026-10-27T06:00:00.000Z",
  "days": 1,
  "subject": "[Yogico] 오늘의 브리핑 10. 27. · 회신필요 12건 · 새 답장 2건",
  "newMails": 31,
  "totals": { "needsReply": 12, "overdue": 3, "unanalyzed": 8 },
  "periodLabel": "최근 2개월",
  "needsReply": [
    {
      "id": "6adfd9d2d4e66da63966f47d", "subject": "Re: 요기보 빈백 도입 문의",
      "from": "buyer@hotel-example.co.kr", "fromName": "김담당", "group": "hotel-example",
      "leadId": "L-20260915-0012", "company": "OO호텔",
      "topic": "로비용 빈백 20개 견적 요청", "summary": "…", "suggestedAction": "단가·납기 회신",
      "urgency": "high", "deadline": "2026-10-30T09:00:00.000Z", "needsReply": true,
      "analyzedByAi": true, "date": "2026-10-26T23:05:12.000Z",
      "url": "https://b2b-ochre-seven.vercel.app/?mail=6adfd9d2d4e66da63966f47d"
    }
  ],
  "deadlinesSoon": [],
  "newReplies": [{ "leadId": "L-20260915-0012", "company": "OO호텔", "subject": "", "at": "2026-10-26T23:05:12.000Z" }],
  "stages": { "contacted": 612, "replied": 9, "negotiating": 3, "partner": 1 },
  "html": "<div style=\"font-family:…\">…오늘의 브리핑…</div>"
}
```

### 5-3. 보낸 메일 (말투 학습용) — `GET /sent?days=60&limit=30&page=1`

이카운트 보낸메일함에서 그 자리에서 읽습니다. 보낸 메일은 DB에 저장하지 않는 구조이기 때문입니다.

- 한 번에 최대 50통씩 줍니다. `page` 를 늘려 `totalPages` 까지 넘깁니다.
- `body` 는 인용된 상대 메일을 걷어낸, 우리가 쓴 부분 4,000자까지입니다.
- `accountId` 를 비우면 대표 계정을 씁니다. 계정 목록은 `GET /api/agent/v1` 에 있습니다.
- 말투를 맞추는 데만 쓰세요.

```json
{
  "success": true,
  "account": { "accountId": "6aaa5353f99d6a53869d89bc", "address": "jay@yogico.kr" },
  "days": 60,
  "page": 1,
  "pageSize": 30,
  "total": 220,
  "totalPages": 8,
  "count": 30,
  "items": [
    {
      "uid": 4812,
      "sentAt": "2026-10-24T02:11:40.000Z",
      "to": [{ "name": "박팀장", "address": "manager@resort-example.com" }],
      "cc": [],
      "subject": "Re: 객실용 빈백 샘플 일정",
      "body": "박팀장님, 안녕하세요.\n요청하신 샘플은 다음 주 화요일에 보내 드리겠습니다. …",
      "bodyTruncated": false
    }
  ]
}
```

### 5-4. 메일 1건 — `GET /mails/{mailId}`

본문(`body`)은 메일 서버에서 받아 온 전문이고, 20,000자까지 줍니다.

- 서버가 느리거나 원본이 지워졌으면 저장된 미리보기(4,000자)를 줍니다.
  - 이때 `bodyFromServer: false` 가 되고, `bodyNote` 에 이유가 적힙니다.
- `bodyNew` 는 새로 쓴 부분입니다.
- `bodyKo` 는 AI 번역을 해 둔 경우에만 들어 있습니다.
- `pendingDrafts` 는 이 메일에 들어가 있는 승인 대기 초안입니다.

```json
{
  "success": true,
  "id": "6adfd9d2d4e66da63966f47d",
  "threadId": "t_7ZW0642V7Zi47YWUOjrsnbTrsLHrsLEg64-E7J6FIOusuOydmA",
  "direction": "in",
  "messageId": "<CA+abc123@mail.hotel-example.co.kr>",
  "from": { "name": "김담당", "address": "buyer@hotel-example.co.kr" },
  "to": [{ "name": "", "address": "jay@yogico.kr" }],
  "cc": [],
  "company": "OO호텔",
  "leadId": "L-20260915-0012",
  "leadStage": { "value": "replied", "label": "답장 받음" },
  "subject": "Re: 요기보 빈백 도입 문의",
  "subjectKo": null,
  "receivedAt": "2026-10-26T23:05:12.000Z",
  "lang": "ko",
  "body": "안녕하세요. 로비에 들일 빈백 20개 견적 부탁드립니다. …\n\n-----Original Message-----\n…",
  "bodyTruncated": false,
  "bodyFromServer": true,
  "bodyNote": null,
  "bodyNew": "안녕하세요. 로비에 들일 빈백 20개 견적 부탁드립니다. …",
  "bodyKo": null,
  "attachments": [{ "filename": "로비_도면.pdf", "size": 245113, "contentType": "application/pdf" }],
  "classification": "inquiry",
  "classificationLabel": "문의·견적",
  "importance": { "needsReply": true, "urgency": "high", "urgencyLabel": "높음", "deadline": "2026-10-30T09:00:00.000Z", "deadlineText": "이번 주 목요일까지", "deadlineType": "quote_due" },
  "analysis": { "method": "ai", "topic": "로비용 빈백 20개 견적 요청", "summary": "…", "keyPoints": [], "intent": "견적 받기", "suggestedAction": "단가·납기 회신", "replyReason": "견적 요청" },
  "status": "new",
  "statusLabel": "신규",
  "repliedAt": null,
  "memo": "",
  "canReply": true,
  "pendingDrafts": [],
  "url": "https://b2b-ochre-seven.vercel.app/?mail=6adfd9d2d4e66da63966f47d"
}
```

### 5-5. 스레드 전체 — `GET /threads/{threadId}`

같은 대화의 메일을 오래된 것부터, 최근 50통까지 줍니다.

- `threadId`(`t_…`) 대신 그 대화에 속한 메일 ID를 넣어도 됩니다.
- 받은 것(`in`)과 우리가 보낸 것(`out`)이 함께 나옵니다.
- 리드에 붙은 대화면 `ourEmails` 가 함께 옵니다.
  - 우리가 먼저 보낸 영업 메일 요약입니다(발송 이력에 저장된 500자 요약).

```json
{
  "success": true,
  "threadId": "t_7ZW0642V7Zi47YWUOjrsnbTrsLHrsLEg64-E7J6FIOusuOydmA",
  "company": "OO호텔",
  "leadId": "L-20260915-0012",
  "count": 2,
  "messages": [
    {
      "id": "6adf11aa0c1d2e3f4a5b6c7d", "direction": "out",
      "from": { "name": "요기보", "address": "jay@yogico.kr" },
      "to": [{ "name": "", "address": "buyer@hotel-example.co.kr" }], "cc": [],
      "subject": "요기보 빈백 도입 문의", "date": "2026-10-20T01:00:00.000Z", "lang": "ko",
      "body": "안녕하세요, 요기보입니다. …", "bodyTruncated": false, "attachments": [],
      "status": "new", "statusLabel": "신규"
    },
    {
      "id": "6adfd9d2d4e66da63966f47d", "direction": "in",
      "from": { "name": "김담당", "address": "buyer@hotel-example.co.kr" },
      "to": [{ "name": "", "address": "jay@yogico.kr" }], "cc": [],
      "subject": "Re: 요기보 빈백 도입 문의", "date": "2026-10-26T23:05:12.000Z", "lang": "ko",
      "body": "안녕하세요. 로비에 들일 빈백 20개 견적 부탁드립니다. …", "bodyTruncated": false,
      "attachments": [{ "filename": "로비_도면.pdf", "size": 245113, "contentType": "application/pdf" }],
      "status": "new", "statusLabel": "신규"
    }
  ],
  "ourEmails": [
    { "subject": "(광고) 요기보 빈백 — 호텔 로비 제안", "bodySummary": "…", "to": "buyer@hotel-example.co.kr", "sentAt": "2026-10-13T00:30:00.000Z" }
  ]
}
```

### 5-6. 넣어 둔 초안 — `GET /drafts?status=pending&mine=true`

- `status` 에는 `pending`(승인 대기, 기본) · `sent` · `discarded` · `all` 을 넣습니다.
- `mine=true` 면 이 키로 넣은 것만 줍니다.
- `mailNow` 는 원 메일의 지금 상태입니다. 웹메일에서 이미 답했는지 여기서 보입니다.

```json
{
  "success": true,
  "count": 1,
  "items": [
    {
      "id": "6ae0418baaf680fa32c5808d",
      "inboundMailId": "6adfd9d2d4e66da63966f47d",
      "leadId": "L-20260915-0012",
      "status": "pending",
      "statusLabel": "승인 대기",
      "to": "buyer@hotel-example.co.kr",
      "cc": "sales@yogico.kr",
      "subject": "Re: 요기보 빈백 도입 문의",
      "body": "김담당님, 안녕하세요.\n문의 주신 빈백 20개 견적을 정리해 드립니다. …",
      "notes": "단가는 대표님 확인 필요",
      "agent": { "keyId": "6ae03f…", "keyName": "Claude — 노트북", "tool": "claude", "toolLabel": "Claude", "client": "claude-code" },
      "owner": "jay",
      "revision": 1,
      "mail": { "subject": "Re: 요기보 빈백 도입 문의", "from": { "name": "김담당", "address": "buyer@hotel-example.co.kr" }, "date": "2026-10-26T23:05:12.000Z", "company": "OO호텔", "group": "hotel-example" },
      "createdAt": "2026-10-27T00:31:02.000Z",
      "updatedAt": "2026-10-27T00:31:02.000Z",
      "sentAt": null,
      "sentTo": null,
      "editedBeforeSend": null,
      "discardedAt": null,
      "mailNow": { "status": "new", "repliedAt": null, "repliedOutside": false, "trashed": false },
      "reviewUrl": "https://b2b-ochre-seven.vercel.app/?agentDraft=6ae0418baaf680fa32c5808d"
    }
  ]
}
```

### 5-7. 답장 초안 저장 — `POST /drafts`

초안은 **[📨 발송 관리 → 🤖 승인 대기]** 에 들어갑니다. **발송하지 않습니다.**

```json
{
  "mailId": "6adfd9d2d4e66da63966f47d",
  "cc": "sales@yogico.kr",
  "subject": "Re: 요기보 빈백 도입 문의",
  "body": "김담당님, 안녕하세요.\n문의 주신 빈백 20개 견적을 정리해 드립니다. …",
  "notes": "단가는 대표님 확인 필요",
  "client": "claude-code"
}
```

| 칸 | 필수 | 설명 |
|---|---|---|
| `mailId` | ✔ | 답장할 받은 메일 ID |
| `body` | ✔ | 본문(평문, 50,000자까지). **서명은 넣지 마세요** — 보낼 때 계정 서명이 자동으로 붙습니다 |
| `to` | | 받는 사람. 이 앱의 회신은 **원래 보낸 사람에게만** 갑니다. 넣으면 같은지만 확인하고, 다르면 `400` |
| `cc` | | 참조. 여러 명은 쉼표로 잇고, 20명까지 넣을 수 있습니다 |
| `subject` | | 비우면 `Re: 원제목` |
| `notes` | | 보내기 전에 사람이 확인할 것. 메일에는 들어가지 않고 화면에만 보입니다 |
| `client` | | 초안을 만든 도구·모델 이름. 화면에 함께 보입니다 |

**같은 키로 같은 메일에 다시 저장하면** 초안을 새로 쌓지 않고 기존 승인 대기 초안을 고칩니다.

- 응답에 `replaced: true` 가 오고 `revision` 이 올라갑니다.
- 아침 자동 실행이 같은 미답 메일에 초안을 매일 한 장씩 더 얹지 않게 하려는 것입니다.

응답 (draft 안의 일부 칸은 5-6과 같아 생략했습니다):

```json
{
  "success": true,
  "saved": true,
  "replaced": false,
  "sent": false,
  "message": "[발송 관리 → 승인 대기]에 넣었습니다. 발송은 사람이 화면에서 확인하고 [보내기]를 눌러야 됩니다.",
  "reviewUrl": "https://b2b-ochre-seven.vercel.app/?agentDraft=6ae0418baaf680fa32c5808d",
  "draft": {
    "id": "6ae0418baaf680fa32c5808d",
    "inboundMailId": "6adfd9d2d4e66da63966f47d",
    "status": "pending",
    "statusLabel": "승인 대기",
    "to": "buyer@hotel-example.co.kr",
    "cc": "sales@yogico.kr",
    "subject": "Re: 요기보 빈백 도입 문의",
    "body": "김담당님, 안녕하세요. …",
    "notes": "단가는 대표님 확인 필요",
    "agent": { "keyId": "6ae03f…", "keyName": "Claude — 노트북", "tool": "claude", "toolLabel": "Claude", "client": "claude-code" },
    "owner": "jay",
    "revision": 1,
    "createdAt": "2026-10-27T00:31:02.000Z",
    "updatedAt": "2026-10-27T00:31:02.000Z"
  },
  "mailNow": { "status": "new", "statusLabel": "신규", "repliedAt": null }
}
```

**MCP 도구 호출 모양**도 같습니다. `save_draft` 라면 아래처럼 보냅니다.

```json
{ "jsonrpc": "2.0", "id": 7, "method": "tools/call",
  "params": { "name": "save_draft", "arguments": { "mail_id": "6adfd9d2d4e66da63966f47d", "body": "…", "cc": "sales@yogico.kr" } } }
```

응답은 `result.content[0].text` 에 위 JSON이 문자열로 들어 있습니다.

---

## 6. 화면에서 일어나는 일 (사람 쪽)

- **[📨 발송 관리]에 [🤖 승인 대기 · AI 초안] 탭이 생겼습니다.**
  - 초안마다 다음이 보입니다.
    - "AI 초안 · Claude" 처럼 어느 도구가 만들었는지
    - 키 이름과 고친 횟수
    - 원 메일 · 받는 사람 · 참조 · 제목 · 본문 앞부분
    - `notes`
  - 웹메일에서 이미 답한 메일이면 경고가 붙습니다.
  - 버튼은 둘입니다.
    - [검토하고 보내기]: 그 메일을 열고, 회신 상자에 본문 · 참조 · 제목을 채웁니다.
    - [버리기]: 초안을 버립니다. [버림] 탭에서 되살릴 수 있습니다.
- **나가는 길은 회신 상자의 [보내기] 하나입니다.**
  - AI 초안도 사람이 직접 쓴 답장과 똑같이 나갑니다.
    - 계정 서명이 붙습니다.
    - 상대 메일함에서 원래 대화로 묶입니다.
    - [👁 미리보기]를 쓸 수 있습니다.
  - 보내면 그 초안은 [발송 완료]로 옮겨집니다.
  - 사람이 고쳐서 보냈는지, 그대로 보냈는지도 함께 남습니다.
- 받은 메일을 열었을 때 그 메일에 승인 대기 초안이 있으면, 회신 상자 위에 [불러오기] · [버리기] 띠가 뜹니다.
- 승인 대기에서 버리기 · 되살리기는 사람만 할 수 있습니다. 에이전트는 초안 상태를 바꿀 수 없습니다.

## 7. 요청하신 것과 다르게 한 점 · 못 한 점

1. **「발송 관리」의 '승인 대기' 상태는 원래 없었습니다.**
   - [📨 발송 관리]의 기존 탭 세 개(보낼 메일 · 예약 발송 · 발송 완료)는 업체에 영업 메일을 나눠 보내는 곳입니다.
   - 그래서 AI 답장 초안은 섞지 않고 **[🤖 승인 대기 · AI 초안] 탭을 새로** 만들었습니다.
2. **받는 사람(to)은 바꿀 수 없습니다.**
   - 이 앱의 회신은 원래 보낸 사람에게만 갑니다(대화 묶음 유지, 엉뚱한 곳으로 나가는 것 방지).
   - 다른 사람에게도 보내려면 `cc` 로 넣어 주세요.
   - 참조 칸은 이번에 회신 상자에 새로 생겼고, AI 초안을 불러오면 나타납니다.
3. **첨부파일은 초안에 넣을 수 없습니다.**
   - 받은 메일의 첨부는 이름 · 크기 · 형식만 읽을 수 있습니다.
   - 붙여야 하면 `notes` 에 적어 두세요. 사람이 보낼 때 붙입니다.
4. **볼 수 있는 메일은 키를 만든 아이디의 메일함뿐입니다.**
   - 다른 아이디의 메일함은 보이지 않습니다.
   - 리드 화면에서는 남의 계정에 온 리드 답장도 함께 보이지만, 에이전트에게는 그 예외를 열지 않았습니다(어차피 거기에는 답장을 넣을 수 없습니다).
5. **Claude 웹·데스크톱 앱의 커스텀 커넥터는 헤더로 키를 넣을 수 없습니다(OAuth만 지원).**
   - 그래서 주소에 키를 붙이는 방식(`?key=`)을 따로 열어 두었습니다.
   - OAuth 로그인 방식은 이번에 만들지 않았습니다.
   - 주소 방식은 실제 Claude 웹 커넥터에서는 아직 시험하지 못했습니다.
     - 공식 MCP SDK 클라이언트와 직접 호출로는 확인했습니다.
     - Claude Code · Codex처럼 헤더를 쓰는 방식이 확실합니다.
6. **아침 자동 실행은 이 앱이 돌려 주지 않습니다.**
   - 키로 REST를 부르는 쪽(Claude 예약 작업 · Codex 자동화 · 크론 등)에서 실행해 주세요.
   - 자동 실행용 키를 따로 하나 만들어 쓰기를 권합니다.
   - 순서 예: 브리핑 → 답장 필요 목록 → 스레드 확인 → 초안 저장. `hasPendingDraft` 인 메일은 건너뛰거나 고쳐 쓰면 됩니다.
7. **보낸 메일은 한 번에 받지 않고 쪽으로 나눠 받습니다(한 쪽 최대 50통).**
   - 보낸메일함을 그 자리에서 읽기 때문입니다.
   - 60일이면 보통 4~8쪽입니다.
8. **MCP는 상태 없는 Streamable HTTP입니다.**
   - 세션 · SSE 스트림 · 서버 알림이 없어서 `GET` 은 405를 돌려줍니다.
   - 도구가 모두 한 번 묻고 한 번 답하는 것이라, 일반 MCP 클라이언트에는 지장이 없습니다.
9. **초안 본문은 평문입니다.** 굵게 · 색 같은 서식은 사람이 회신 상자에서 넣습니다.
10. **호출 횟수 제한은 두지 않았습니다.** 많이 부르면 메일 서버(이카운트)에 부담이 가는 것은 `sent` · `mails/{id}` 두 가지입니다.
