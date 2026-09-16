'use client';

import Script from 'next/script';

export default function Home() {
  return (
    <>
      {/* 상단 progress bar (전역 전환 표시) */}
      <div id="topProgressBar" aria-hidden="true"></div>

      {/* 전체 차단 오버레이 (중요한 작업 진행 중) */}
      <div id="globalBlocker" role="status" aria-live="polite">
        <div className="blocker-card">
          <div className="blocker-spinner"></div>
          <div className="blocker-text" id="globalBlockerText">불러오는 중...</div>
        </div>
      </div>

      <div className="app-shell">
        <aside className="sidebar" id="appSidebar">
          {/* 사이드바 접기/펴기 토글 */}
          <button id="sidebarToggleBtn" className="sidebar-toggle" type="button"
            title="사이드바 접기/펴기 (Ctrl+B)" aria-label="사이드바 접기/펴기">
            <span className="sidebar-toggle-icon">‹</span>
          </button>
          <button id="homeBtn" className="brand" type="button" aria-label="홈으로 (가져오기 화면)" title="홈: 가져오기 페이지로">
            <div className="brand-mark">
              <img src="/assets/logo.png" alt="요기보" className="brand-logo"
                onError={(e) => { (e.target as HTMLImageElement).src = '/assets/logo.png'; }} />
            </div>
            <div className="brand-text">
              <h1>요기보 B2B</h1>
              <p>B2B 관리메일</p>
            </div>
          </button>
          <nav className="nav" aria-label="Pipeline">
            {/* ══════════ 그룹 B · 메일함 (맨 위) ══════════
                매일 가장 먼저 여는 곳이라 맨 위에 둔다 (대표님 요청 2026-09-15 · "메일함 상단 고정").
                파이프라인이 '회사' 중심이라면 여기는 '메일' 중심.
                리드에 매칭되지 않은 메일까지 전부 여기서 본다
                (외부 B2B 메일 관리 도구를 대체하는 자리). */}
            <div className="nav-section-label">
              📬 메일함
              <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 4, textTransform: 'none' }}>
                · 최근 2개월
              </span>
            </div>
            {/* 메일 쓰기가 맨 위다. 메일함에서 하는 일이 읽기만은 아니고,
                답장이 아닌 새 메일을 쓸 자리가 따로 있어야 한다. */}
            <button className="nav-item" data-view="tool-compose" type="button" title="메일 쓰기 — 아는 상대에게 한 통 씁니다. 받는 사람은 초성으로 찾을 수 있습니다 (예: ㅅㅇㅇㅅ)">
              <span className="nav-icon">✏️</span><span className="nav-label">메일 쓰기</span>
            </button>
            <button className="nav-item active" data-view="tool-inbox" type="button" title="받은 메일함 — 이카운트 메일함에서 수집한 수신 메일. 거래처 폴더별로 나눠 볼 수 있고, 광고·자동발송은 자동으로 접힙니다. 숫자는 최근 2개월 기준">
              <span className="nav-icon">📥</span><span className="nav-label">받은 메일함</span>
              <span className="nav-badge" data-nav-badge="inboxUnread"></span>
            </button>
            <button className="nav-item" data-view="tool-inbox-needsreply" type="button" title="회신 필요 — 상대가 질문·요청을 보냈고 아직 우리가 답하지 않은 메일 (최근 2개월)">
              <span className="nav-icon">⚠️</span><span className="nav-label">회신 필요</span>
              <span className="nav-badge" data-nav-badge="inboxNeedsReply"></span>
            </button>
            <button className="nav-item" data-view="tool-deadlines" type="button" title="기한 관리 — 회신 기한이 잡힌 메일. 기한은 본문에서 자동 추출됩니다 (최근 2개월)">
              <span className="nav-icon">⏰</span><span className="nav-label">기한 관리</span>
              <span className="nav-badge" data-nav-badge="inboxDeadlines"></span>
            </button>
            {/* 브리핑은 되살렸다 — 매일 아침 메일로 나가는 것과 같은 내용이라,
                메일을 못 본 날 화면에서 바로 확인할 수 있어야 한다. */}
            <button className="nav-item" data-view="tool-briefing" type="button" title="오늘의 브리핑 — 회신 필요·기한 임박·새 답장을 한 장으로. 매일 아침 같은 내용이 메일로도 갑니다">
              <span className="nav-icon">📋</span><span className="nav-label">오늘의 브리핑</span>
            </button>
            {/* 휴지통은 숨김 — 화면 수를 줄이기 위해서다.
                renderTrashPage 는 그대로 있고, 넣은 메일도 지워지지 않는다.
            <button className="nav-item" data-view="tool-trash" type="button" title="휴지통 — 치워둔 메일. DB에서 지우지 않으므로 언제든 되돌릴 수 있습니다">
              <span className="nav-icon">🗑</span><span className="nav-label">휴지통</span>
              <span className="nav-badge" data-nav-badge="inboxTrash"></span>
            </button>
            */}

            <div className="nav-divider"></div>

            {/* ══════════ 그룹 A · 리드 파이프라인 (메일함 아래) ══════════
                회사가 어디까지 왔는지를 위에서 아래로 한 줄기로 읽히게 배치.
                예전에는 '발송함' 뒤를 다른 그룹으로 잘라놨는데, 같은 깔때기의
                뒷부분이라 끊을 이유가 없었다. */}
            <div className="nav-section-label">📊 리드 파이프라인</div>
            {/* 크롤링이 이 파이프라인의 입구다. 따로 그룹을 두면 "발굴"과 "파이프라인"이
                다른 일처럼 보이는데, 실제로는 여기서 캔 것이 바로 아래 칸으로 떨어진다. */}
            <button className="nav-item" data-view="tool-crawl" type="button" title="크롤링 실행 — 카테고리·지역·키워드를 골라 네이버에서 업체를 찾고 홈페이지에서 이메일을 뽑아옵니다">
              <span className="nav-icon">🔎</span><span className="nav-label">크롤링 실행</span>
            </button>
            {/* 가져오기(CSV 업로드)는 숨김 — 리드는 AI 서칭으로 들어오고,
                클라이언트가 엑셀을 직접 올릴 일이 없다. 되살리려면 주석만 풀면 된다.
            <button className="nav-item" data-view="pipeline-import" type="button" title="가져오기 — CSV/엑셀 업로드로 리드 데이터를 신규 등록">
              <span className="nav-icon">📥</span><span className="nav-label">가져오기 (Import)</span>
            </button>
            */}
            {/* 국내판은 이 두 단계를 되살려 둔다.
                해외판에서는 발굴을 개발자가 워크플로우로 돌려 결과를 바로 [검증 완료]에
                넣었기 때문에 둘 다 늘 0건이라 숨겼었다. 국내판은 크롤링이 화면 안에서
                돌고 수집 결과가 매일 쌓이므로, 수집물을 사람이 한 번 훑는 자리가 꼭 있어야 한다. */}
            {/* [수집함] 은 뺐다. 크롤링 결과가 바로 [검증 대기] 로 들어간다.
                중간에 사람이 훑는 칸을 두어도 상호와 주소만 보고 규모를 판단할 수 없어서,
                결국 손대지 않은 채 쌓이기만 한다. 그 판단은 AI 검증이 한다. */}
            {/* [검증 대기] 도 뺐다. 크롤링 한 번이 발굴·메일추출·AI검증을 다 끝내고
                [검증 완료] 또는 [검증 실패] 로 바로 떨어뜨린다. 기다리는 칸이 필요 없다. */}
            {/* 첫 화면 = 검증 완료. 클라이언트가 매일 여는 곳이 여기다. */}
            <button className="nav-item" data-view="pipeline-verified" type="button" title="AI 검증 완료 — AI 판정을 통과해 메일을 보낼 수 있는 곳. 여기서 보낼 곳을 골라 발송 리스트로 옮깁니다">
              <span className="nav-icon">✅</span><span className="nav-label">AI 검증 완료</span>
              <span className="nav-badge" data-nav-badge="verified"></span>
            </button>
            <button className="nav-item" data-view="pipeline-contacted" type="button" title="발송 관리 — 보낼 메일 · 예약된 메일 · 나간 메일을 단계별로 봅니다">
              <span className="nav-icon">📨</span><span className="nav-label">발송 관리</span>
              <span className="nav-badge" data-nav-badge="contacted"></span>
            </button>
            <button className="nav-item" data-view="pipeline-replied" type="button" title="답장 받음 — 상대방이 답장을 보내온 리드. 회사명 옆 💬 버튼으로 주고받은 메일 확인">
              <span className="nav-icon">💬</span><span className="nav-label">답장 받음</span>
              <span className="nav-badge" data-nav-badge="replied"></span>
            </button>
            <button className="nav-item" data-view="pipeline-negotiating" type="button" title="대화 진행 중 — 조건/일정/가격 등 실제 협상 오가는 상태">
              <span className="nav-icon">🤝</span><span className="nav-label">대화 진행 중</span>
              <span className="nav-badge" data-nav-badge="negotiating"></span>
            </button>
            <button className="nav-item" data-view="pipeline-partner" type="button" title="파트너십 확정 — 계약/합의 완료된 실 파트너 업체">
              <span className="nav-icon">⭐</span><span className="nav-label">파트너십 확정</span>
              <span className="nav-badge" data-nav-badge="partner"></span>
            </button>

            <div className="nav-divider"></div>

            {/* [📥 직접 올린 업체] 그룹은 국내판에서 뺐다.
                해외판은 바이어 명단을 엑셀로 받아 올리는 것이 주 경로라 이 그룹이
                필요했지만, 국내는 업체가 전부 [🧲 키워드 발굴] 을 통해 들어온다.
                손으로 올리는 경로가 나란히 있으면 "이 업체는 어디로 들어온 건가"가
                두 갈래가 되고, 그때마다 분류·검증 상태를 따로 챙겨야 한다.

                화면과 API(tool-legacy · tool-legacy-import · api/leads/legacy ·
                api/leads/import)는 지우지 않았다. 엑셀로 받은 명단을 한 번 올릴 일이
                생기면 이 블록만 되살리면 된다. */}

            {/* ══════════ 그룹 D · 설정 · 도구 ══════════ */}
            <div className="nav-section-label">⚙ 설정 · 도구</div>
            {/* [🔌 메일 수신 설정]·[📅 예약 발송 관리] 는 뺐다.
                수신 설정은 계정을 한 번 붙이고 나면 다시 들어갈 일이 없고,
                예약 발송은 위 [📨 발송 관리] 안에 [예약 발송] 탭으로 이미 있다.
                같은 것을 두 군데서 보게 하면 어느 쪽이 진짜인지 헷갈린다.
                (화면과 API 는 그대로 살아 있어 data-view 만 되살리면 돌아온다) */}
            {/* 계정이 먼저다.
                보내는 주소·서명이 정해져야 양식이 의미를 갖고, 대표 계정을 바꾸면
                받은 메일함이 통째로 그 계정 기준으로 바뀐다. 순서가 곧 설정 순서다. */}
            <button className="nav-item" data-view="tool-mail-accounts" type="button" title="메일 계정 관리 — 보내는 주소와 서명을 등록합니다. 대표 계정을 바꾸면 받은 메일함도 그 계정 기준으로 바뀝니다">
              <span className="nav-icon">📬</span><span className="nav-label">메일 계정 관리</span>
            </button>
            {/* [🏷 거래처 폴더 이름] 은 숨김. 자동 분류가 붙인 이름(도메인 조각)을
                한글 상호로 바꾸는 화면인데, 폴더 구성이 아직 자리를 잡는 중이라
                지금 이름을 고정하면 다음 분류에서 또 어긋난다.
                화면과 API(/api/mail/groups/rename)는 그대로 살아 있다 —
                아래 한 줄만 풀면 돌아온다.

            <button className="nav-item" data-view="tool-folder-names" type="button" title="거래처 폴더 이름 — 자동으로 붙은 폴더 이름(도메인 조각)을 읽기 편한 상호로 바꿉니다">
              <span className="nav-icon">🏷</span><span className="nav-label">거래처 폴더 이름</span>
            </button>
            */}
            <button className="nav-item" data-view="tool-b2b-email" type="button" title="메일 양식 — 발송할 메일 제목/본문 작성 (회사명 자동 대체)">
              <span className="nav-icon">📝</span><span className="nav-label">메일 양식</span>
            </button>
            {/* [추천 리스트] 는 국내판에서 완전히 뺐다 (코드·API·시드 데이터까지).
                해외판의 K-beauty 바이어 고정 시드 명단이라 국내에 쓸 데가 없다.
                같은 자리를 [🧲 키워드 발굴] 그룹이 대신한다. */}
            {/* 로그인 아이디·비밀번호 — 사람마다 아이디가 따로 있다 (david 대표님 · hoon 전무님 …) */}
            <button className="nav-item" data-view="tool-crm-account" type="button" title="내 계정 관리 — 로그인 아이디 확인 · 비밀번호 변경">
              <span className="nav-icon">👤</span><span className="nav-label">내 계정 관리</span>
            </button>
            {/* 아이디 관리는 마스터만 쓴다. 서브 계정이 서로의 비밀번호를 바꿀 수 있으면
                계정을 나눈 의미가 없다. 로그인한 아이디가 마스터가 아니면 app.js 가
                이 줄을 숨긴다(하단 data-master-only). 서버도 403 으로 한 번 더 막는다. */}
            <button className="nav-item" data-view="tool-user-admin" data-master-only="1" type="button" title="아이디 관리 — 쓰는 사람을 늘리고 비밀번호를 정해 줍니다 (관리자 전용)">
              <span className="nav-icon">👥</span><span className="nav-label">아이디 관리</span>
            </button>
            <button className="nav-item" data-view="tool-user-guide" type="button" title="사용 설명서 — 처음 쓰시는 분을 위한 단계별 가이드">
              <span className="nav-icon">📖</span><span className="nav-label">사용 설명서</span>
            </button>
          </nav>
        </aside>

        {/* 서랍이 열렸을 때 뒤를 덮는 막 — 누르면 닫힌다.
            넓은 화면에서는 CSS 로 숨겨져 있다. */}
        <div id="navBackdrop" className="nav-backdrop" aria-hidden="true"></div>

        <main className="main">
          <header className="topbar">
            {/* 좁은 화면에서는 사이드바가 서랍으로 숨는다 — 그때 여는 버튼.
                900px 이상에서는 CSS 로 숨겨져 보이지 않는다. */}
            <div className="topbar-head">
              <button id="navDrawerBtn" className="nav-drawer-btn" type="button"
                      aria-label="메뉴 열기" aria-expanded="false" aria-controls="appSidebar">☰</button>
              <div className="topbar-title">
                <h2 id="viewTitle" className="">✅ AI 검증 완료</h2>
                <p id="viewSubtitle"></p>
              </div>
            </div>
            <div className="top-actions">
              {/* [+ 리드 추가]·[🔍 검증]·[⬆ Import] 는 숨겼다.
                  리드 발굴과 검증은 개발자 쪽에서 워크플로우로 돌려 결과만 넣어
                  주기로 했다. 클라이언트가 쓸 일이 없는데 화면 맨 위에 계속 떠
                  있으면 "이걸 눌러야 하나" 하는 고민만 만든다.
                  기능은 그대로 살아 있어 주석만 풀면 돌아온다.
              <button id="addLeadBtn" className="button" type="button">+ 리드 추가</button>
              <button id="importCsvBtn" className="button secondary" type="button">⬆ Import</button>
              <button id="verifyLeadsBtn" className="button secondary" type="button">🔍 검증</button>
              */}
              {/* [⬇ 엑셀로 내려받기] 는 뺐다. 업체 목록을 파일로 꺼내 쓸 일이 없다 —
                  고르고 보내는 일이 전부 이 안에서 끝난다.
                  (exportCsv() 는 그대로 살아 있어 이 버튼만 되살리면 돌아온다) */}
              <button id="themeToggleBtn" className="theme-toggle" type="button" title="다크/라이트 모드">🌙</button>
              <button id="settingsBtn" className="button secondary" type="button" style={{ display: 'none' }}>설정</button>
              <form action="/api/auth/logout" method="POST" style={{ display: 'inline' }}>
                <button type="submit" className="button ghost">로그아웃</button>
              </form>
              <button id="markContactedBtn" style={{ display: 'none' }} type="button"></button>
              <button id="undoContactedBtn" style={{ display: 'none' }} type="button"></button>
            </div>
          </header>

          <section id="toolbarSection" className="toolbar" aria-label="Lead filters">
            <label className="search-box">
              <span>검색</span>
              <input id="searchInput" type="search" placeholder="회사명 · 지역 · 이메일 · 브랜드" />
            </label>
            <label>
              <span>지역</span>
              <select id="regionFilter"></select>
            </label>
            {/* Status · Priority · 검증 필터는 숨겼다.
                지금 화면은 전부 서버에서 단계별로 페이지를 받아오는데 이 셋은
                서버 쿼리에 들어가지 않아서, 골라도 목록이 그대로였다.
                "눌러도 아무 일이 없는 칸"이 셋이나 있으면 나머지 필터까지
                못 믿게 된다. 값과 코드는 남아 있어 주석만 풀면 돌아온다.
            <label><span>Status</span><select id="statusFilter"></select></label>
            <label><span>Priority</span><select id="priorityFilter"></select></label>
            <label><span>검증</span><select id="verifyFilter">
              <option value="All">All</option>
              <option value="passed">✅ 통과 (4/4)</option>
              <option value="suspicious">⚠ 의심 (2~3점)</option>
              <option value="invalid">❌ 무효 (0~1점)</option>
              <option value="unverified">⏳ 미검증</option>
            </select></label>
            */}
          </section>

          <section id="statsGrid" className="stats-grid" aria-label="Summary"></section>
          <section id="content" className="content"></section>
        </main>
      </div>

      {/* ── Add Lead Modal ── */}
      <div id="addLeadModal" className="modal-backdrop" style={{ display: 'none' }}>
        <div className="modal-card">
          <div className="modal-header">
            <h3>새 바이어 추가</h3>
            <button id="modalCloseBtn" className="modal-close" type="button">&#x2715;</button>
          </div>
          <form id="addLeadForm" className="modal-form">
            <div className="modal-grid">
              <label><span>회사명 (Company) *</span><input id="ml-Company" type="text" placeholder="예: ABC Trading LLC" required /></label>
              <label><span>지역 (Region) *</span><input id="ml-Region" type="text" placeholder="예: UAE" required /></label>
              <label><span>우선순위 (Priority)</span>
                <select id="ml-Priority">
                  <option value="">선택</option>
                  <option value="A-">A- (최우선)</option>
                  <option value="B">B (우선)</option>
                  <option value="C">C (보통)</option>
                </select>
              </label>
              <label><span>유형 (Type)</span><input id="ml-Type" type="text" placeholder="예: Distributor, Retailer" /></label>
              <label><span>바이어 담당자</span><input id="ml-BuyerContact" type="text" placeholder="담당자 이름" /></label>
              <label><span>이메일</span><input id="ml-Email" type="email" placeholder="contact@company.com" /></label>
              <label><span>전화번호</span><input id="ml-Phone" type="text" placeholder="+971 54 000 0000" /></label>
              <label><span>웹사이트</span><input id="ml-WebsiteContact" type="text" placeholder="https://www.example.com" /></label>
              <label className="modal-full"><span>브랜드/채널</span><textarea id="ml-BrandsChannels" placeholder="취급 브랜드나 판매 채널 정보"></textarea></label>
              <label className="modal-full"><span>메모</span><textarea id="ml-notes" placeholder="첫 연락 계획, 특이사항 등"></textarea></label>
            </div>
            <div className="modal-footer">
              <button type="button" id="modalCancelBtn" className="button ghost">취소</button>
              <button type="submit" id="modalSubmitBtn" className="button">저장하기</button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Edit Lead Modal ── */}
      <div id="editLeadModal" className="modal-backdrop" style={{ display: 'none' }}>
        <div className="modal-card modal-card-wide">
          <div className="modal-header">
            <div>
              <span id="el-badge" className="badge" style={{ marginBottom: '6px', display: 'inline-block' }}></span>
              <h3 id="el-title" style={{ margin: 0 }}>바이어 상세</h3>
              <p id="el-meta" style={{ margin: '4px 0 0', fontSize: '13px', color: '#68726c' }}></p>
            </div>
            {/* 팝업을 닫지 않고 여기서 판정하고 다음 회사로 넘어간다.
                418곳을 하나씩 열고 닫으면 검토 자체를 포기하게 된다.
                (Favorite 은 뺐다 — 즐겨찾기를 모아 보는 화면이 없었다) */}
            <div id="el-review" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div id="el-navBox" style={{ display: 'none', alignItems: 'center', gap: '5px' }}>
                <button id="el-prev" className="el-nav-btn" type="button" title="이전 업체 (← 키)">‹ 이전</button>
                <span id="el-navPos" style={{ fontSize: '12px', fontWeight: 700, color: '#68726c', minWidth: '74px', textAlign: 'center' }}></span>
                <button id="el-next" className="el-nav-btn" type="button" title="다음 업체 (→ 키)">다음 ›</button>
              </div>
              <div id="el-judgeBox" style={{ display: 'none', gap: '6px' }}>
                <button id="el-toQueue" className="el-judge el-judge-go" type="button"
                  title="이 업체에 메일을 보냅니다 — 발송 리스트로 옮깁니다. 지금 나가지는 않습니다">✉ 메일 보낼곳으로 선정</button>
                <button id="el-toFailed" className="el-judge el-judge-no" type="button"
                  title="이 업체는 대상이 아닙니다 — 검증 실패로 옮깁니다">🚫 검증실패 업체로 선정</button>
              </div>
              <button id="editModalCloseBtn" className="modal-close" type="button">&#x2715;</button>
            </div>
          </div>

          <div className="modal-form">
            {/* Action buttons */}
            <div className="el-actions" id="el-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
              <a id="el-website" href="#" target="_blank" rel="noreferrer" className="button ghost" style={{ display: 'none' }}>🌐 웹사이트</a>
              <a id="el-linkedin" href="#" target="_blank" rel="noreferrer" className="button ghost" style={{ display: 'none' }}>LinkedIn</a>
              <a id="el-phone-btn" href="#" className="button ghost" style={{ display: 'none' }}>📞 전화</a>
              {/* [✉ 메일 보내기]·[삭제] 는 뺐다.
                  메일 보내기는 이 CRM 의 발송이 아니라 PC 메일 프로그램을 여는
                  mailto 링크였다. 위쪽 [✉ 메일 보낼곳으로 선정] 과 뜻이 겹쳐
                  "여기서 보내는 건가" 하는 오해를 만든다.
                  삭제는 되돌릴 수 없는데 상세를 보다가 바로 옆에 있어 위험했다.
                  아닌 곳은 [🚫 검증실패 업체로 선정] 으로 빼면 된다 (되돌릴 수 있다).
              <a id="el-email-btn" href="#" className="button ghost" style={{ display: 'none' }}>✉ 메일 보내기</a>
              <button id="el-deleteBtn" className="button ghost" style={{ color: '#9f3333', borderColor: '#9f3333' }} type="button">삭제</button>
              */}
            </div>

            {/*
              === 이 폼이 왜 이 모양인가 ===
              원래는 22칸이 한 화면에 전부 펼쳐져 있었다. 검증 완료 411건을 실측해 보니
              그중 10칸(바이어 이름·직함·LinkedIn·주소·접근방법·담당자·최근연락일·다음후속일 등)이
              채워진 비율 0% 였다. 대표님 엑셀 컬럼을 그대로 화면에 옮긴 결과인데,
              엑셀은 옆으로 넓어도 부담이 없지만 화면은 세로로 쌓이면서
              "내가 뭘 안 채운 거지" 하는 압박이 된다.

              그 0% 칸들이 쓸모없는 건 아니고 **지금 단계에 안 맞는** 것이다.
              바이어 이름·직함·최근 연락일은 대화가 시작된 뒤에 채우는 칸인데,
              아직 메일도 안 보낸 검증 완료 회사에까지 똑같이 떠 있었다.
              그래서 지우지 않고 <details> 로 접었다 — 필요한 사람은 한 번 눌러 펼치면 된다.

              라벨은 한글, id 는 영문 그대로다. id 가 곧 DB 필드명이자 엑셀 헤더라
              (openEditModal 의 fields 배열이 'el-' + 필드명으로 찾는다) 바꾸면
              엑셀 가져오기/내보내기가 깨진다. 화면에 보이는 말만 한글로 바꾼 것이다.
            */}
            <div className="modal-grid">
              <label><span>회사명</span><input id="el-Company" type="text" /></label>
              <label><span>지역</span><input id="el-Region" type="text" /></label>
              <label><span>이메일</span><input id="el-Email" type="text" /></label>
              <label><span>웹사이트</span><input id="el-WebsiteContact" type="text" /></label>
              <label><span>업종</span><input id="el-Type" type="text" /></label>
              <label><span>전화번호</span><input id="el-Phone" type="text" /></label>
              <label className="modal-full"><span>메모</span><textarea id="el-notes" placeholder="통화 내용, 샘플 발송, 가격 조건 등"></textarea></label>
            </div>

            <details className="el-more" style={{ marginTop: '14px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#4e5968', padding: '8px 0' }}>
                영업 관리 <span style={{ fontWeight: 400, opacity: 0.7 }}>· 진행 상태 · 담당자 · 일정</span>
              </summary>
              <div className="modal-grid modal-grid-3col" style={{ marginTop: '10px' }}>
                <label><span>진행 상태</span>
                  <select id="el-status">
                    {['New', 'Qualified', 'Contacted', 'Sample Sent', 'Negotiating', 'Won', 'Lost'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label><span>담당자</span><input id="el-owner" type="text" placeholder="담당자" /></label>
                <label><span>최근 연락일</span><input id="el-lastContact" type="date" /></label>
                <label><span>다음 후속일</span><input id="el-nextFollowUp" type="date" /></label>
              </div>
            </details>

            <details className="el-more">
              <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#4e5968', padding: '8px 0' }}>
                담당자 정보 <span style={{ fontWeight: 400, opacity: 0.7 }}>· 대화가 시작된 뒤에 채우는 칸</span>
              </summary>
              <div className="modal-grid" style={{ marginTop: '10px' }}>
                <label><span>바이어 이름</span><input id="el-BuyerContact" type="text" /></label>
                <label><span>직함</span><input id="el-Title" type="text" /></label>
                <label><span>LinkedIn 회사페이지</span><input id="el-LinkedInCompany" type="text" /></label>
                <label><span>우선순위</span><input id="el-Priority" type="text" /></label>
                <label className="modal-full"><span>취급 브랜드 / 판매 채널</span><textarea id="el-BrandsChannels"></textarea></label>
                <label className="modal-full"><span>접근 방법</span><textarea id="el-Approach" placeholder="첫 연락을 어떻게 열지"></textarea></label>
              </div>
            </details>

            {/* 이 회사가 왜 후보로 올라왔는지 — "정보가 맞는지" 판단하는 자리 */}
            <details className="el-more" open>
              <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#4e5968', padding: '8px 0' }}>
                🔍 이 회사를 고른 근거 <span style={{ fontWeight: 400, opacity: 0.7 }}>· 맞는지 확인하는 곳</span>
              </summary>
              {/* AI 판정 사유 —— 읽기 전용.
                  DB 에 한국어로 저장돼 있는데 화면에 안 나오고 있었다.
                  '왜 이 단계로 갔나'(특히 검증 실패)를 설명하는 유일한 근거라
                  근거 칸보다 위에 둔다. openEditModal 에서 채운다. */}
              <div id="el-aiReasonBox" style={{ display: 'none', marginTop: '10px' }}></div>

              <div className="modal-grid" style={{ marginTop: '10px' }}>
                <label className="modal-full"><span>근거</span><textarea id="el-Evidence" placeholder="K-뷰티 취급 정황 · 사업 형태 등"></textarea></label>
                <label className="modal-full"><span>출처</span><textarea id="el-Sources" placeholder="이 정보를 어디서 찾았는지"></textarea></label>
              </div>
              <div id="el-verification" style={{ marginTop: '10px' }}></div>
            </details>

            <div className="modal-footer" style={{ marginTop: '20px' }}>
              <button type="button" id="editModalCloseBtn2" className="button">저장 및 닫기</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Import CSV Modal ── */}
      <div id="importCsvModal" className="modal-backdrop" style={{ display: 'none' }}>
        <div className="modal-card" style={{ maxWidth: '720px', width: '95vw' }}>
          <div className="modal-header">
            <h3>CSV 가져오기 (Import CSV)</h3>
            <button id="importModalCloseBtn" className="modal-close" type="button">&#x2715;</button>
          </div>
          <div className="modal-form">

            {/* Step 1: File select */}
            <div id="importStep1">
              <p style={{ marginBottom: '8px', color: 'var(--muted)', fontSize: '14px' }}>
                CSV 파일을 선택하면 미리보기와 함께 가져올 수 있습니다.<br />
                <strong>필수 컬럼:</strong> Company, Region &nbsp;|&nbsp;
                <strong>선택 컬럼:</strong> Priority, Type, BuyerContact, Email, Phone, WebsiteContact, BrandsChannels, Notes, Status
              </p>
              <div style={{
                marginBottom: '14px', padding: '10px 14px',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #93c5fd', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
              }}>
                <div style={{ fontSize: '13px', color: '#1e3a8a' }}>
                  <b>📋 처음이신가요?</b> 예제 양식을 다운받아 채워서 업로드하세요.<br/>
                  <span style={{ fontSize: '11px', color: '#3730a3' }}>모든 컬럼 예시 · 3개 샘플 리드 포함 · UTF-8</span>
                </div>
                <button type="button" id="downloadSampleCsvBtn" style={{
                  padding: '8px 14px', fontSize: '12px', fontWeight: 700,
                  background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>⬇ 예제 양식 다운로드</button>
              </div>

              <div
                id="importDropZone"
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: '10px',
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color .2s, background .2s',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>📂</div>
                <p style={{ margin: 0, fontWeight: 600 }}>CSV 파일을 여기에 드래그하거나 클릭하여 선택</p>
                <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '13px' }}>UTF-8 인코딩 권장 · 최대 5MB</p>
                <input id="importFileInput" type="file" accept=".csv,text/csv" style={{ display: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                <label style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap' }}>중복 처리:</label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input type="radio" name="duplicateAction" value="skip" defaultChecked />
                  <span>건너뛰기 (Skip)</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input type="radio" name="duplicateAction" value="overwrite" />
                  <span>덮어쓰기 (Overwrite)</span>
                </label>
              </div>

              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
                * 중복 기준: Company + Region 동일
              </p>
            </div>

            {/* Step 2: Preview */}
            <div id="importStep2" style={{ display: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p id="importPreviewInfo" style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}></p>
                <button id="importResetBtn" className="button ghost" type="button" style={{ fontSize: '13px', padding: '4px 12px' }}>다시 선택</button>
              </div>
              <div className="table-wrap" style={{ maxHeight: '280px', minHeight: 'auto', marginBottom: '16px' }}>
                <table id="importPreviewTable">
                  <thead id="importPreviewHead"></thead>
                  <tbody id="importPreviewBody"></tbody>
                </table>
              </div>
            </div>

            {/* Progress */}
            <div id="importProgress" style={{ display: 'none', marginBottom: '12px' }}>
              <div style={{ background: 'var(--border)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                <div id="importProgressBar" style={{ height: '100%', background: 'var(--accent)', width: '0%', transition: 'width .3s' }}></div>
              </div>
              <p id="importProgressText" style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--muted)' }}>처리 중...</p>
            </div>

            {/* Result */}
            <div id="importResult" style={{ display: 'none', padding: '12px 16px', borderRadius: '8px', background: '#f0faf5', border: '1px solid #b8e0cd', marginBottom: '12px' }}>
              <p id="importResultText" style={{ margin: 0, fontSize: '14px' }}></p>
            </div>

          </div>
          <div className="modal-footer">
            <button type="button" id="importCancelBtn" className="button ghost">취소</button>
            <button type="button" id="importSubmitBtn" className="button" disabled>가져오기</button>
          </div>
        </div>
      </div>

      {/* ── Verify Modal ── */}
      <div id="verifyModal" className="modal-backdrop" style={{ display: 'none' }}>
        <div className="modal-card" style={{ maxWidth: '560px' }}>
          <div className="modal-header">
            <h3>🔍 리드 자동 검증</h3>
            <button id="verifyCloseBtn" className="modal-close" type="button">&#x2715;</button>
          </div>
          <div className="modal-form">
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--muted)' }}>
              이메일(MX) · 웹사이트(HTTP) · 전화(지역코드) · LinkedIn(형식) · <strong style={{ color: '#0369a1' }}>K-beauty 사업관련성</strong> 5가지를 확인합니다.
            </p>

            {/* 검증 방법 안내 (펼치기/접기) */}
            <details style={{
              marginBottom: '14px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              background: '#f0f9ff',
              padding: '10px 14px',
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#0369a1', listStyle: 'revert' }}>
                ℹ️ 검증 방법 자세히 보기
              </summary>
              <div style={{ marginTop: '12px', fontSize: '12.5px', lineHeight: 1.7, color: '#374151' }}>
                <p style={{ margin: '0 0 10px' }}>
                  <strong>1. 이메일 검증</strong><br />
                  · 문법 검사 (예: <code>abc@xxx,com</code>같은 콤마 오타 잡음)<br />
                  · 도메인이 <strong>메일을 받을 수 있는지 DNS 조회</strong> (MX 레코드)<br />
                  · 일회용 메일(mailinator 등) 블랙리스트 차단
                </p>
                <p style={{ margin: '0 0 10px' }}>
                  <strong>2. 웹사이트 검증</strong><br />
                  · 실제 사이트에 <strong>HEAD 요청</strong>을 보내 6초 안에 200~399 응답이 오는지 확인<br />
                  · 도메인 만료, DNS 실패, 404, 5xx 모두 실패로 분류
                </p>
                <p style={{ margin: '0 0 10px' }}>
                  <strong>3. 전화번호 검증</strong><br />
                  · 입력된 번호의 <strong>지역코드가 Region 컬럼과 일치하는지</strong> 비교<br />
                  · 예: Region=UAE 인데 번호가 +82(한국) → 불일치
                </p>
                <p style={{ margin: '0 0 10px' }}>
                  <strong>4. LinkedIn URL 검증</strong><br />
                  · <code>linkedin.com/in/...</code> 또는 <code>/company/...</code> 표준 형식인지 검사
                </p>
                <p style={{ margin: '0 0 10px' }}>
                  <strong>5. K-beauty 사업관련성 검증</strong><br />
                  · 회사 웹사이트 본문(최대 600KB) 다운로드 후 텍스트 추출<br />
                  · 영어/한국어 <strong>뷰티·화장품 키워드 사전</strong>으로 매칭<br />
                  &nbsp;&nbsp;&nbsp;(beauty, cosmetics, skincare, K-beauty, 뷰티, 화장품, 코스메틱 등)<br />
                  · 디스트리뷰터·도매 시그널 가중치 + 무관 산업(부동산·금융 등) 감점<br />
                  · 3점: K-beauty 직결 / 2점: 일반 뷰티 다수 / 1점: 약함 / 0점: 무관
                </p>
                <p style={{ margin: '0 0 6px', padding: '8px 10px', background: '#fff', borderRadius: '6px', borderLeft: '3px solid #f59e0b' }}>
                  <strong style={{ color: '#92400e' }}>종합 점수:</strong> 4개 정합성 항목 + 사업관련성(2점 이상 시 1점) = 최대 5점<br />
                  <span style={{ color: '#166534' }}>5점</span> 통과 / <span style={{ color: '#92400e' }}>3~4점</span> 의심 / <span style={{ color: '#991b1b' }}>0~2점</span> 무효
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: '#6b7280' }}>
                  ※ 외부 유료 API 없이 자체 서버에서 무료로 동작. 검증 1회당 비용 $0.<br />
                  ※ 점수가 낮다고 "그 업체가 가짜"라는 뜻은 아님 — 입력 데이터에 빈칸/오타가 있거나 정보가 불완전하다는 신호로 사용.
                </p>
              </div>
            </details>

            <div id="verifySummary" style={{
              background: '#f8fafc', padding: '12px 14px', borderRadius: '8px',
              marginBottom: '14px', fontSize: '13px', lineHeight: 1.6,
            }}>
              <div>전체 리드: <strong id="verifyTotalCount">-</strong></div>
              <div>미검증: <strong id="verifyPendingCount">-</strong></div>
              <div>검증완료: <strong id="verifyDoneCount">-</strong></div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="radio" name="verifyScope" value="pending" defaultChecked />
                <span>미검증 항목만</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="radio" name="verifyScope" value="all" />
                <span>전체 다시 검증</span>
              </label>
            </div>

            <div id="verifyProgress" style={{ display: 'none', marginBottom: '14px' }}>
              <div style={{ background: '#e5e7eb', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                <div id="verifyProgressBar" style={{ background: 'linear-gradient(90deg, #4f8cff, #7c4dff)', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
              </div>
              <div id="verifyProgressText" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--muted)' }}>0/0 처리 중...</div>
            </div>

            <div id="verifyResult" style={{ display: 'none', background: '#e8f5e9', border: '1px solid #a5d6a7', padding: '12px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', lineHeight: 1.6 }}>
              <div id="verifyResultText"></div>
            </div>

            {/* AI 정밀 검증 (Claude API) — 룰 기반 검증 위에 얹는 2차 검증 */}
            <div style={{
              marginTop: '14px',
              padding: '12px 14px',
              border: '1px solid #c7d2fe',
              borderRadius: '8px',
              background: '#eef2ff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>🧠</span>
                <strong style={{ fontSize: '13px', color: '#3730a3' }}>AI 정밀 검증 (Claude API)</strong>
                <span style={{ fontSize: '10px', color: '#6366f1', background: '#fff', padding: '2px 6px', borderRadius: '99px', border: '1px solid #c7d2fe' }}>Haiku 4.5</span>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#4338ca', lineHeight: 1.5 }}>
                룰 기반 검증이 끝난 <strong>의심 (3~4점)</strong> 케이스를 LLM이 한 번 더 판단합니다.
                회사명/사이트 메타/우리 메모를 종합해 <code>target-fit</code> / <code>maybe</code> / <code>not-fit</code>로 분류 + 한국어 근거 제공.
              </p>
              <div id="verifyAISummary" style={{
                fontSize: '12px', color: '#1e1b4b', background: '#fff', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px',
              }}>
                <div>의심 미검증 대상: <strong id="verifyAITargetCount">-</strong>건</div>
                <div>예상 비용: <strong id="verifyAICostEstimate">-</strong> (건당 약 $0.0005)</div>
              </div>
              <div id="verifyAIProgress" style={{ display: 'none', marginBottom: '8px' }}>
                <div style={{ background: '#e5e7eb', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                  <div id="verifyAIProgressBar" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
                </div>
                <div id="verifyAIProgressText" style={{ marginTop: '6px', fontSize: '12px', color: '#6366f1' }}>0/0 처리 중...</div>
              </div>
              <div id="verifyAIResult" style={{ display: 'none', fontSize: '12px', color: '#1e1b4b', padding: '8px 10px', background: '#fff', border: '1px solid #c7d2fe', borderRadius: '6px', marginBottom: '8px' }}></div>
              <button id="verifyAIStartBtn" className="button" type="button" style={{
                padding: '7px 14px', fontSize: '12px', fontWeight: 700,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
                width: '100%',
              }}>🧠 AI 정밀 검증 시작</button>
            </div>

            <div className="modal-footer">
              <button id="verifyCancelBtn" className="button ghost" type="button">닫기</button>
              <button id="verifyStartBtn" className="button" type="button">검증 시작</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      <div id="settingsModal" className="modal-backdrop" style={{ display: 'none' }}>
        <div className="modal-card">
          <div className="modal-header">
            <h3>설정 (Settings)</h3>
            <button id="settingsCloseBtn" className="modal-close" type="button">&#x2715;</button>
          </div>
          <div className="modal-form">

            {/* Password Change Section */}
            <div className="field-block" style={{ borderTop: 'none', paddingTop: 0 }}>
              <h4>비밀번호 변경 (Change Password)</h4>
              <p style={{ marginBottom: '12px', color: 'var(--muted)' }}>현재 로그인된 계정의 비밀번호를 변경합니다.</p>
              <div className="inline-save">
                <input id="newPasswordInput" type="password" placeholder="새 비밀번호 입력" minLength={4} />
                <button id="changePasswordBtn" className="button secondary" type="button">변경하기</button>
              </div>
            </div>

            {/* Sub-ID Management Section (Master Only) */}
            <div id="subIdSection" className="field-block" style={{ display: 'none', marginTop: '24px' }}>
              <h4>서브 계정 관리 (Sub-ID Management)</h4>
              <p style={{ marginBottom: '12px', color: 'var(--muted)' }}>마스터 계정 전용 기능입니다. 서브 계정을 생성하거나 삭제할 수 있습니다.</p>

              <div className="inline-save" style={{ marginBottom: '16px' }}>
                <input id="subUsernameInput" type="text" placeholder="새 아이디" />
                <input id="subPasswordInput" type="password" placeholder="비밀번호" />
                <button id="createSubIdBtn" className="button secondary" type="button">생성</button>
              </div>

              <div className="table-wrap" style={{ minHeight: 'auto', maxHeight: '240px' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 'auto' }}>아이디 (Username)</th>
                      <th style={{ width: '120px', textAlign: 'center' }}>생성일</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody id="subIdTableBody">
                    {/* Rows injected via JS */}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Import History Modal ── */}
      <div id="importHistoryModal" className="modal-backdrop" style={{ display: 'none' }}>
        <div className="modal-card" style={{ maxWidth: '680px', width: '95vw' }}>
          <div className="modal-header">
            <h3>Import History (가져오기 기록)</h3>
            <button id="importHistoryCloseBtn" className="modal-close" type="button">&#x2715;</button>
          </div>
          <div className="modal-form">
            <p style={{ marginBottom: '16px', color: 'var(--muted)', fontSize: '14px' }}>
              각 Import 배치를 확인하고 필요하면 <strong>배치 전체 삭제</strong>로 롤백할 수 있습니다.
            </p>
            <div className="table-wrap" style={{ minHeight: 'auto', maxHeight: '400px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th style={{ width: '140px', textAlign: 'center' }}>가져온 날짜</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>건수</th>
                    <th style={{ width: '110px', textAlign: 'center' }}>롤백</th>
                  </tr>
                </thead>
                <tbody id="importHistoryTableBody">
                  {/* Rows injected via JS */}
                </tbody>
              </table>
            </div>
            <div id="importHistoryEmpty" style={{ display: 'none', textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
              <p>아직 CSV Import 기록이 없습니다.</p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" id="importHistoryCloseBtn2" className="button ghost">닫기</button>
          </div>
        </div>
      </div>

      {/* 파일이 바뀌면 주소도 바뀌게 한다 — 안 그러면 브라우저가 옛 app.js 를
          계속 쓰고, 고친 화면이 "안 뜬다"로 보인다. 배포마다 값을 갱신한다. */}
      {/* 국내판 전용 화면(크롤링·키워드·카테고리)은 파일을 나눠 둔다.
          app.js 가 이미 16,700줄이라, 여기까지 밀어 넣으면 해외판에서 물려받은
          코드와 국내판에서 새로 쓴 코드를 나중에 구분할 수 없게 된다.
          둘 다 평범한 스크립트라 kr-screens.js 의 함수는 전역에 올라가고
          app.js 의 render() 가 그대로 부른다. */}
      <Script src="/kr-screens.js?v=1" strategy="afterInteractive" />
      <Script src="/app.js?v=373a20f6" strategy="afterInteractive" />
    </>
  );
}
