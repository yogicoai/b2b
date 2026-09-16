const STORAGE_KEY = "kbeauty-crm-state-v1";
const DETAIL_WIDTH_KEY = "kbeauty-crm-detail-width";

const STATUSES = [
  "New",
  "Qualified",
  "Contacted",
  "Sample Sent",
  "Negotiating",
  "Won",
  "Lost"
];

const CONTINENT_ORDER = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "Other"
];

const REGION_CONTINENTS = {
  // Africa
  Algeria: "Africa",
  Angola: "Africa",
  Botswana: "Africa",
  "Burkina Faso": "Africa",
  Cameroon: "Africa",
  "Cote d'Ivoire": "Africa",
  Egypt: "Africa",
  Ethiopia: "Africa",
  Gambia: "Africa",
  Ghana: "Africa",
  "Ivory Coast": "Africa",
  Kenya: "Africa",
  Libya: "Africa",
  Mauritius: "Africa",
  Morocco: "Africa",
  Namibia: "Africa",
  Nigeria: "Africa",
  Rwanda: "Africa",
  Senegal: "Africa",
  "South Africa": "Africa",
  Tanzania: "Africa",
  Tunisia: "Africa",
  Uganda: "Africa",
  Zambia: "Africa",
  Zimbabwe: "Africa",

  // Asia
  Armenia: "Asia",
  Azerbaijan: "Asia",
  Bahrain: "Asia",
  Bangladesh: "Asia",
  Bhutan: "Asia",
  Brunei: "Asia",
  Cambodia: "Asia",
  China: "Asia",
  Georgia: "Asia",
  "Hong Kong": "Asia",
  India: "Asia",
  Indonesia: "Asia",
  Iran: "Asia",
  Iraq: "Asia",
  Israel: "Asia",
  Japan: "Asia",
  Jordan: "Asia",
  Kazakhstan: "Asia",
  Korea: "Asia",
  Kuwait: "Asia",
  Kyrgyzstan: "Asia",
  Laos: "Asia",
  Lebanon: "Asia",
  Malaysia: "Asia",
  Maldives: "Asia",
  Mongolia: "Asia",
  Myanmar: "Asia",
  Nepal: "Asia",
  Oman: "Asia",
  Pakistan: "Asia",
  Philippines: "Asia",
  Phillippines: "Asia", // 흔한 오타
  Qatar: "Asia",
  "Saudi Arabia": "Asia",
  Singapore: "Asia",
  "South Korea": "Asia",
  "Sri Lanka": "Asia",
  Syria: "Asia",
  Taiwan: "Asia",
  Tajikistan: "Asia",
  Thailand: "Asia",
  Turkey: "Asia",
  Turkmenistan: "Asia",
  UAE: "Asia",
  "United Arab Emirates": "Asia",
  Uzbekistan: "Asia",
  Vietnam: "Asia",
  Yemen: "Asia",

  // Europe
  Albania: "Europe",
  Austria: "Europe",
  Belarus: "Europe",
  Belgium: "Europe",
  "Bosnia and Herzegovina": "Europe",
  Bulgaria: "Europe",
  Croatia: "Europe",
  Cyprus: "Europe",
  Czech: "Europe",
  "Czech Republic": "Europe",
  Czechia: "Europe",
  Denmark: "Europe",
  Estonia: "Europe",
  Finland: "Europe",
  France: "Europe",
  Germany: "Europe",
  Greece: "Europe",
  Hungary: "Europe",
  Iceland: "Europe",
  Ireland: "Europe",
  Italy: "Europe",
  Kosovo: "Europe",
  Latvia: "Europe",
  Lithuania: "Europe",
  Luxembourg: "Europe",
  Malta: "Europe",
  Moldova: "Europe",
  Montenegro: "Europe",
  Netherlands: "Europe",
  "North Macedonia": "Europe",
  Norway: "Europe",
  Poland: "Europe",
  Portugal: "Europe",
  Romania: "Europe",
  Russia: "Europe",
  Serbia: "Europe",
  Slovakia: "Europe",
  Slovenia: "Europe",
  Spain: "Europe",
  Sweden: "Europe",
  Switzerland: "Europe",
  UK: "Europe",
  Ukraine: "Europe",
  "United Kingdom": "Europe",

  // North America
  Aruba: "North America",
  Bahamas: "North America",
  Barbados: "North America",
  Canada: "North America",
  "Costa Rica": "North America",
  Cuba: "North America",
  "Dominican Republic": "North America",
  "El Salvador": "North America",
  Guatemala: "North America",
  Haiti: "North America",
  Honduras: "North America",
  Jamaica: "North America",
  Mexico: "North America",
  Nicaragua: "North America",
  Panama: "North America",
  "Puerto Rico": "North America",
  "Trinidad and Tobago": "North America",
  USA: "North America",
  "United States": "North America",
  "United States of America": "North America",

  // South America
  Argentina: "South America",
  Bolivia: "South America",
  Brazil: "South America",
  Chile: "South America",
  Colombia: "South America",
  Ecuador: "South America",
  Guyana: "South America",
  Paraguay: "South America",
  Peru: "South America",
  Suriname: "South America",
  Uruguay: "South America",
  Venezuela: "South America",

  // Oceania
  Australia: "Oceania",
  Fiji: "Oceania",
  "French Polynesia": "Oceania",
  "New Zealand": "Oceania",
  "Papua New Guinea": "Oceania",
  Samoa: "Oceania",
};

let baseLeads = [];
let currentUser = null;
let isMaster = false;

let edits = {};
let customLeads = [];
let state = {
  // 첫 화면 = 받은 메일함 (대표님 요청 2026-09-15 — 메일함을 맨 위로 올리면서 함께).
  //
  // 아침에 들어와서 가장 먼저 보는 것이 "밤사이 뭐가 왔나" 다. 그래서 메뉴도 맨 위이고,
  // 접속하면 바로 그 화면이 열린다.
  // (예전 첫 화면은 [AI 검증 완료] 였고, 그 전에는 사이드바에 없는 [가져오기] 라
  //  아무 메뉴도 선택돼 보이지 않는 빈 화면으로 시작했다.)
  view: "tool-inbox",
  query: "",
  region: "All",
  status: "All",
  priority: "All",
  verify: "All",
  selectedId: baseLeads[0]?.id || null,
  selectedLeadIds: new Set(),
  sortField: null,
  sortOrder: "asc",
  // 검증대기 페이지 하위 필터 (AI 진행 여부로 나눔)
  //   'unverified'  - AI 미검증 (아직 처리 전) — DEFAULT: "검증 전 상태" 만 보이도록
  //   'maybe'       - AI 검증됨: 모호 판정 (사람 판단 필요)
  //   'failed'      - 검증 실패 (archived stage + not-fit 판정) — cross-stage
  //   'all'         - 전체 (verifying stage 만)
  verifyingSubFilter: 'unverified',
  // 테이블 페이지네이션 (기본 50건 · 사용자가 25/50/100 선택 가능)
  pagination: { pageSize: 50, currentPage: 1 },
  // Import 배치별 폴더 뷰 (검증대기/완료/실패 페이지 공용)
  //   null = 폴더 목록 모드 · string = 특정 배치 안의 리드 리스트
  folderView: { openBatch: null },
  // 검증완료 페이지 서브 필터 (승인 상태로 나눔)
  //   'all'        - 전체 verified
  //   'approved'   - readyForOutreach=true (검증 완료 목록)
  //   'pending'    - readyForOutreach=false (승인 대기)
  //   'no-email'   - Email 필드 비었거나 "Not found" — 승인 불가
  verifiedSubFilter: 'all',
  tierFilter: null,   // 검증완료 A/B/C 등급 필터
  categoryFilter: null,  // 국내판 1차 축 — 목록 위 탭(학교·공공기관 / 기업 / 병·의원 / …)

  // 검증완료 페이지 상단 상위 탭 (성공/실패)
  //   'success' (default) - verified stage 리드
  //   'failed'  - archived + not-fit (구 pipeline-failed)
  verifiedResultTab: 'success',
  // B2B 메일 매니저 전용 서브 상태
  email: {
    templates: [],
    variables: [],
    variableGroups: [],
    currentTemplateId: null,
    mode: 'list',            // 'list' = 게시판 · 'edit' = 편집기
    previewAccountId: null,
    wizardStep: 1,           // 템플릿 생성 마법사 스텝 (1..4)

    editor: null,           // { name, language, subject, body, purpose, bodyIsHtml, isActive }
    previewLeadId: null,
    previewResult: null,    // { subject, body, missing }
    loading: false,
    dirty: false,
  },
};

const els = {
  get navItems() { return [...document.querySelectorAll(".nav-item")]; },
  get viewTitle() { return document.getElementById("viewTitle"); },
  get viewSubtitle() { return document.getElementById("viewSubtitle"); },
  get search() { return document.getElementById("searchInput"); },
  get region() { return document.getElementById("regionFilter"); },
  get status() { return document.getElementById("statusFilter"); },
  get priority() { return document.getElementById("priorityFilter"); },
  get verify() { return document.getElementById("verifyFilter"); },
  get stats() { return document.getElementById("statsGrid"); },
  get content() { return document.getElementById("content"); },
  get detail() { return document.getElementById("detailPanel"); },
  get detailResizer() { return document.getElementById("detailResizer"); },
  get pipeline() { return document.getElementById("pipelineList"); },
  get exportCsv() { return document.getElementById("exportCsvBtn"); },
  get addLead() { return document.getElementById("addLeadBtn"); },
  get markContacted() { return document.getElementById("markContactedBtn"); },
  get undoContacted() { return document.getElementById("undoContactedBtn"); },
  get reset() { return document.getElementById("resetBtn"); },
  get home() { return document.getElementById("homeBtn"); },
  get settingsBtn() { return document.getElementById("settingsBtn"); }
};

// init() 호출은 **파일 맨 아래**로 옮겼다 — 그쪽 설명 참고.

async function init() {
  // 초기 페이지 로드에서 전체 리드(5000+) fetch 하지 않음 — render()가 필요 시 loadLeads 호출
  // 이전 코드는 여기서 무조건 전체를 받아 60초 지연 발생
  initDetailResizer();
  initAddLeadModal();
  initEditModal();
  initSettingsModal();
  initImportCsvModal();
  initImportHistoryModal();
  initThemeToggle();
  initSidebarToggle();
  initNavDrawer();
  initAttachmentDownloads();
  initReviewBar();     // 상세 팝업의 이전/다음·판정 버튼
  // 저장된 페이지 크기 복원 (사용자가 이전에 선택한 값 유지)
  try {
    const savedSize = parseInt(localStorage.getItem('leads-page-size') || '', 10);
    if ([25, 50, 100].includes(savedSize)) state.pagination.pageSize = savedSize;
  } catch {}
  renderFilters();
  bindEvents();
  startNavBadgePolling();
  // 새 아이디 첫 로그인 — 내 메일함 2달치를 자동으로 가져온다 (첫 화면이 뜬 뒤 조금 있다가)
  setTimeout(startAutoBackfill, 2500);
  syncMailOnLogin();   // 밤사이 온 답장을 화면 열 때 한 번 당겨온다 (기다리지 않는다)

  const needsBaseLeads = state.view === 'pipeline-verifying' || state.view === 'pipeline-import';
  if (needsBaseLeads) {
    await loadLeads();
    state.selectedId = baseLeads[0]?.id || null;
  }
  render();
}

/**
 * 화면을 열 때 받은 메일을 한 번 당겨온다.
 *
 * 왜:
 * 수신 수집은 크론이 하는데 Vercel Hobby 는 하루 1회다. 그래서 아침 이후에
 * 온 답장은 다음 날까지 화면에 안 나타났다 — 실제로 테스트 답장이 들어왔는데
 * 리드가 [발송 완료]에 계속 머물러 있었고, [📥 메일 가져오기]를 손으로
 * 눌러야만 [답장 받음]으로 넘어갔다. 그 버튼을 알아야만 최신 상태를 볼 수
 * 있는 구조는 좋지 않다.
 *
 * 기다리지 않는다:
 * IMAP 수집은 수십 초가 걸린다. await 하면 그동안 화면이 멈춘 것처럼 보인다.
 * 그래서 띄워만 놓고, 끝나면 그때 배지와 목록을 갱신한다.
 *
 * 자주 돌지 않는다:
 * 서버가 마지막 수집으로부터 10분이 안 지났으면 아무것도 하지 않고 돌아온다.
 * 새로고침을 연달아 해도 메일 서버에 계속 붙지 않는다.
 */
async function syncMailOnLogin() {
  try {
    const r = await safeJsonFetch('/api/mail/sync-on-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r || !r.success || !r.ran) return;   // 쿨다운이거나 계정 없음 — 조용히 끝낸다

    console.log(`[mail] 로그인 수집 — 새 메일 ${r.inserted}통 · 리드 연결 ${r.matched} · 답장받음 ${r.movedToReplied}`);

    // 새로 들어온 게 있을 때만 화면을 건드린다
    if (!r.inserted && !r.movedToReplied) return;
    _mailCountsCache = null;
    _mailGroupsCache = null;
    await loadMailCounts(true);
    if (r.movedToReplied) { invalidateServerPage(); loadStageCounts(true); }

    // 지금 보고 있는 화면이 메일·리드 목록이면 다시 그린다.
    // 다른 화면을 보는 중이면 건드리지 않는다 — 하던 일이 끊긴다.
    const affected = ['tool-inbox', 'tool-inbox-needsreply', 'tool-deadlines',
                      'pipeline-replied', 'pipeline-negotiating', 'pipeline-partner'];
    if (affected.includes(state.view)) render();

    if (r.movedToReplied) {
      console.log(`[mail] ${r.movedToReplied}곳이 [답장 받음]으로 넘어갔습니다`);
    }
  } catch (e) {
    // 수집이 실패해도 화면은 그대로 써야 한다
    console.warn('[mail] 로그인 수집 실패', e);
  }
}

// ── 좁은 화면 — 사이드바 서랍 ──────────────────────────────
//
// 900px 아래에서 사이드바는 화면 밖에 세워 둔 서랍이 된다 (styles.css).
// 여는 방법이 ☰ 하나뿐이면 갇히기 쉬우므로 닫는 길을 여러 개 둔다 —
// 막 누르기 · Esc · 메뉴 선택. 특히 **메뉴를 고르면 저절로 닫혀야** 한다.
// 안 그러면 고른 화면이 서랍에 가려서, 눌렀는데 아무 일도 안 난 것처럼 보인다.
function initNavDrawer() {
  const btn = document.getElementById('navDrawerBtn');
  const backdrop = document.getElementById('navBackdrop');
  const sidebar = document.getElementById('appSidebar');
  if (!btn || !sidebar) return;

  const isOpen = () => document.body.getAttribute('data-nav-open') === 'true';
  const setOpen = (open) => {
    if (open) document.body.setAttribute('data-nav-open', 'true');
    else document.body.removeAttribute('data-nav-open');
    btn.setAttribute('aria-expanded', String(open));
  };

  btn.addEventListener('click', () => setOpen(!isOpen()));
  backdrop?.addEventListener('click', () => setOpen(false));

  // 메뉴를 고르면 닫는다. 사이드바 전체에 위임해 두면 나중에 메뉴가
  // 늘어나도 따로 손댈 곳이 없다.
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item, .nav-external')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false);
  });

  // 창을 넓히면 서랍 상태를 털어낸다. 열어 둔 채로 넓히면 data-nav-open 이
  // 남아 그림자만 계속 붙어 있다.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && isOpen()) setOpen(false);
  });
}

// ── 사이드바 접기/펴기 ────────────────────────────────────
function initSidebarToggle() {
  const btn = document.getElementById('sidebarToggleBtn');
  const apply = (collapsed) => {
    if (collapsed) {
      document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
    } else {
      document.documentElement.removeAttribute('data-sidebar-collapsed');
    }
  };
  // 초기 상태는 layout.tsx init 스크립트가 처리 → 여기선 저장된 값만 반영 확인
  const stored = localStorage.getItem('sidebar-collapsed') === 'true';
  apply(stored);

  const toggle = () => {
    const cur = document.documentElement.getAttribute('data-sidebar-collapsed') === 'true';
    const next = !cur;
    localStorage.setItem('sidebar-collapsed', String(next));
    apply(next);
  };

  btn?.addEventListener('click', toggle);
  // Ctrl+B / Cmd+B 단축키
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.altKey && !e.shiftKey) {
      // input/textarea 안에서 눌린 경우는 무시 (텍스트 볼드 단축키 방해 방지)
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      toggle();
    }
  });
}

function resetAllFilters() {
  state.query = "";
  state.region = "All";
  state.status = "All";
  state.priority = "All";
  state.verify = "All";
  state.sortField = null;
  state.sortOrder = "asc";
  if (els.search) els.search.value = "";
  if (els.region) els.region.value = "All";
  if (els.status) els.status.value = "All";
  if (els.priority) els.priority.value = "All";
  if (els.verify) els.verify.value = "All";
  // 필터 초기화 시 페이지도 1페이지로
  if (state.pagination) state.pagination.currentPage = 1;
  // 뷰 이동 시 폴더 뷰도 리셋 (없으면 초기화)
  if (!state.folderView) state.folderView = { openBatch: null };
  state.folderView.openBatch = null;
}

// ── Loading helpers ──────────────────────────────────────────────
// 상단 가로 progress bar — async 작업 시작/끝에 호출
var _topBarTimer = null;
function startTopProgress() {
  const bar = document.getElementById('topProgressBar');
  if (!bar) return;
  if (_topBarTimer) { clearInterval(_topBarTimer); _topBarTimer = null; }
  bar.style.width = '0%';
  bar.classList.add('is-active');
  // 즉시 30%, 이후 슬슬 90%까지 차오르는 페이크 진행
  requestAnimationFrame(() => { bar.style.width = '30%'; });
  let pct = 30;
  _topBarTimer = setInterval(() => {
    pct = Math.min(pct + (90 - pct) * 0.15, 90);
    bar.style.width = pct.toFixed(1) + '%';
  }, 200);
}
function finishTopProgress() {
  const bar = document.getElementById('topProgressBar');
  if (!bar) return;
  if (_topBarTimer) { clearInterval(_topBarTimer); _topBarTimer = null; }
  bar.style.width = '100%';
  setTimeout(() => {
    bar.classList.remove('is-active');
    setTimeout(() => { bar.style.width = '0%'; }, 250);
  }, 200);
}

// 콘텐츠 영역 dim + 중앙 스피너 — 뷰 전환용
function setContentLoading(isLoading) {
  const content = document.getElementById('content');
  if (!content) return;
  content.classList.toggle('content-loading', !!isLoading);
}

// 전체화면 블로커 — DB 쓰기 같은 차단성 작업
function showGlobalBlocker(message) {
  const el = document.getElementById('globalBlocker');
  const txt = document.getElementById('globalBlockerText');
  if (txt) txt.textContent = message || '처리 중...';
  if (el) el.classList.add('is-active');
}
function hideGlobalBlocker() {
  const el = document.getElementById('globalBlocker');
  if (el) el.classList.remove('is-active');
}

// 클라이언트 캐시 — 매 nav 클릭마다 5000+ 리드 재fetch 방지
var _leadsLastFetch = 0;
const LEADS_CACHE_TTL_MS = 60 * 1000;   // 60초

// 안전한 JSON fetch 헬퍼 · 세션 만료 등 HTML 응답 시 자동 리다이렉트
async function safeJsonFetch(url, init) {
  const res = await fetch(url, init);
  // 세션 만료 → 로그인 페이지 리다이렉트
  if (res.status === 401 || res.redirected && /\/login/.test(res.url)) {
    if (!window.__sessionExpiredNotified) {
      window.__sessionExpiredNotified = true;
      alert('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
      window.location.href = '/login';
    }
    throw new Error('세션 만료');
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // HTML 이 왔다 → 서버 오류 또는 리다이렉트
    const text = await res.text();
    console.error(`[safeJsonFetch] 비-JSON 응답: ${url}\n${text.slice(0, 200)}`);
    throw new Error(`서버 응답 오류 (${res.status})`);
  }
  return res.json();
}

async function loadLeads(opts) {
  const force = opts?.force === true;
  const now = Date.now();
  // 캐시 유효하면 스킵 (뷰 전환 시 로딩 시간 0)
  if (!force && baseLeads.length > 0 && (now - _leadsLastFetch) < LEADS_CACHE_TTL_MS) {
    return;
  }
  try {
    const res = await fetch('/api/leads');
    const result = await res.json();
    if (result.success) {
      baseLeads = result.data.map(lead => ({ ...lead, id: lead.leadId }));
      _leadsLastFetch = Date.now();
      renderFilters();
    }
  } catch(e) {
    console.error("Failed to load leads:", e);
  }
}

// ── 서버 사이드 페이지네이션 (verified/failed 전용 · 50개씩) ──
// state.serverPage 캐시: 현재 열린 stage/page/sub 조합의 데이터
var _serverPageCache = null;   // { stage, page, sub, leads, total, totalPages, ts }
const SERVER_PAGE_CACHE_TTL_MS = 30 * 1000;   // 30초

// 검증 완료 정렬 — 'reco'(추천순) 기본, 'recent'(최근 등록순)
var _leadSort = 'reco';

async function loadServerPage(stage, page, sub, force, tier) {
  // 검색어는 지금 보고 있는 단계 안에서만 좁힌다 (화면을 옮기지 않는다)
  const q = (state.query || '').trim();
  const region = state.region && state.region !== 'All' ? state.region : '';
  const category = state.categoryFilter || '';
  const cacheKey = `${stage}::${sub || ''}::${tier || ''}::${category}::${page}::${_leadSort}::${q}::${region}`;
  const now = Date.now();
  if (!force && _serverPageCache && _serverPageCache.cacheKey === cacheKey && (now - _serverPageCache.ts) < SERVER_PAGE_CACHE_TTL_MS) {
    return _serverPageCache;
  }
  const params = new URLSearchParams();
  params.set('stage', stage);
  if (sub) params.set('sub', sub);
  if (tier) params.set('tier', tier);
  params.set('page', String(page));
  params.set('limit', '50');
  if (q) params.set('q', q);
  if (region) params.set('region', region);
  if (category) params.set('category', category);
  if (_leadSort === 'reco' || _leadSort === 'region') params.set('sort', _leadSort);
  // 지역 목록은 단계가 바뀔 때만 다시 센다 — 페이지를 넘길 때마다 집계할 이유가 없다.
  // 검증 성공에서는 성공한 곳의 지역, 검증 실패로 넘어가면 실패한 곳의 지역가 뜬다.
  const facetKey = `${stage}::${sub || ''}::${tier || ''}::${category}`;
  const wantCountries = _regionFacet.key !== facetKey;
  if (wantCountries) params.set('countries', '1');

  const res = await fetch(`/api/leads?${params.toString()}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'load page failed');
  if (wantCountries && Array.isArray(data.countries)) {
    _regionFacet = {
      key: facetKey,
      list: data.countries.map((c) => c.region).filter(Boolean).sort(localeSort),
    };
    renderFilters();   // 지역 칸을 지금 목록 기준으로 다시 채운다
  }
  _serverPageCache = {
    cacheKey,
    stage, page, sub, tier,
    leads: (data.data || []).map(l => ({ ...l, id: l.leadId })),
    total: data.total || 0,
    totalPages: data.totalPages || 1,
    ts: now,
  };
  return _serverPageCache;
}

// ── stage-counts 캐시 (5분 TTL · 액션 후 invalidateServerPage() 로 즉시 갱신) ──
var _stageCountsCache = null;
var _stageCountsInFlight = null;   // 동시 요청 dedup
var _stageCountsGen = 0;           // 몇 번째로 출발한 요청인가 — 가장 나중에 출발한 것만 화면에 반영한다
async function loadStageCounts(force) {
  const now = Date.now();
  if (!force && _stageCountsCache && (now - _stageCountsCache.ts) < 5 * 60 * 1000) {
    return _stageCountsCache;
  }
  // 그냥 숫자를 보려는 것(force 아님)이면 이미 오는 중인 요청을 같이 쓴다.
  //
  // ⚠ 무언가를 **바꾼 뒤(force)** 에는 오는 중인 요청을 재사용하면 안 된다 — 그 요청은 바꾸기 **전에** 출발해
  //   옛 숫자를 가져온다. 실제로: 삭제 확인 창이 닫히며 창이 다시 포커스를 받아(startNavBadgePolling 의 focus)
  //   숫자 요청이 삭제 요청과 **동시에** 출발했고, 삭제가 끝난 뒤의 새로고침은 그 옛 요청을 받아 써서
  //   카드를 지워도 사이드바 숫자가 그대로였다 (2026-09-15, check-negotiating-delete.mts 로 잡음).
  if (_stageCountsInFlight && !force) return _stageCountsInFlight;
  const gen = ++_stageCountsGen;
  const req = (async () => {
    try {
      const data = await safeJsonFetch('/api/leads/stage-counts');
      if (data.success) {
        const fresh = { ...data, ts: now };
        // 늦게 도착한 옛 요청이 방금 받은 새 숫자를 덮어쓰지 않게 — 가장 나중에 출발한 요청만 반영한다
        if (gen !== _stageCountsGen) return _stageCountsCache;
        _stageCountsCache = fresh;
        updateNavBadges(fresh);
        return fresh;
      }
    } catch (e) { console.error('stage-counts', e); }
    return null;
  })().finally(() => { if (_stageCountsInFlight === req) _stageCountsInFlight = null; });
  _stageCountsInFlight = req;
  return req;
}

// 사이드바 nav 배지 갱신 (파이프라인 각 stage 실시간 카운트)
function updateNavBadges(counts) {
  if (!counts || !counts.stages) return;
  const s = counts.stages;
  document.querySelectorAll('[data-nav-badge]').forEach(el => {
    const key = el.dataset.navBadge;
    // 메일함 배지는 stage 가 아니라 별도 API 에서 채운다 (loadMailCounts)
    if (key === 'inboxUnread' || key === 'inboxNeedsReply' || key === 'inboxDeadlines' || key === 'inboxTrash') return;
    // 발송 관리 배지는 **아직 보내지 않은 곳(queued)** 만 센다 — 해야 할 일의 수다.
    // 발송 완료(contacted)까지 더하면 보낼 곳이 하나도 없어도 숫자가 남아 "뭘 더 보내야 하나" 가 된다
    // (대표님 지적 2026-09-15: 보낼 메일 1곳인데 배지는 2로 떴다).
    // 집계에 없는 키는 비워 둔다.
    // (s[key] || 0) 으로 떨어뜨리면 모르는 키가 전부 "0" 으로 떠서,
    // 실제로는 수천 건이 있는 화면에 0 이 붙는 일이 생긴다.
    if (key !== 'contacted' && !(key in s)) {
      el.textContent = '';
      delete el.dataset.count;
      return;
    }
    // AI 검증 완료 배지는 [2차 검토 필요] 수 — 검증 성공 전체(메일 없는 곳 포함)를 띄우면
    // 검토 카드의 숫자와 달라 "몇 곳을 봐야 하나" 가 헷갈린다 (대표님 요청 2026-09-14)
    const reviewNeeded = counts.verifiedSub && counts.verifiedSub.reviewNeeded;
    const n = key === 'contacted' ? (s.queued || 0)
      : (key === 'verified' && typeof reviewNeeded === 'number') ? reviewNeeded
      : (s[key] || 0);
    el.textContent = n.toLocaleString();
    el.dataset.count = String(n);
  });
}

// 메일함 배지 (받은 메일함 · 회신 필요) — 광고·자동발송은 빼고 센다
var _mailCountsCache = null;
async function loadMailCounts(force) {
  const now = Date.now();
  if (!force && _mailCountsCache && now - _mailCountsCache.ts < 5 * 60 * 1000) {
    applyMailCountBadges(_mailCountsCache.counts);
    return _mailCountsCache;
  }
  try {
    // 배지도 지금 보고 있는 메일함(=대표 계정) 기준으로 센다.
    // 계정 목록이 먼저 있어야 대표를 알 수 있다 — 캐시가 있으면 바로 돌아온다.
    await loadInboxAccounts();
    const acc = currentMailboxAccountId();
    const data = await safeJsonFetch(`/api/mail/counts?accountId=${encodeURIComponent(acc)}`);
    if (data && data.success) {
      _mailCountsCache = { counts: data.counts, ts: now };
      applyMailCountBadges(data.counts);
      return _mailCountsCache;
    }
  } catch (e) {
    // 메일 수신을 아직 설정하지 않았을 수 있다 — 배지가 없다고 화면이 죽으면 안 된다
    console.warn('mail-counts', e);
  }
  return null;
}

function applyMailCountBadges(c) {
  if (!c) return;
  const set = (key, n) => {
    const el = document.querySelector(`[data-nav-badge="${key}"]`);
    if (!el) return;
    el.textContent = (n || 0).toLocaleString();
    el.dataset.count = String(n || 0);
  };
  set('inboxUnread', c.inbox);
  set('inboxNeedsReply', c.needsReply);
  set('inboxDeadlines', c.deadlines);
  set('inboxTrash', c.trash);
}

// 주기 갱신 (5분마다 · 사용자 액션 후에는 invalidateServerPage 로 즉시 갱신 · 창 focus 복귀 시도 자동 갱신)
var _navBadgeTimer = null;
function startNavBadgePolling() {
  if (_navBadgeTimer) return;
  const refresh = () => { loadStageCounts(true); loadMailCounts(true); };
  refresh();
  _navBadgeTimer = setInterval(refresh, 5 * 60 * 1000);
  // 브라우저 창이 다시 포커스되면 즉시 갱신 (다른 창에서 액션 반영)
  window.addEventListener('focus', refresh);
  // 페이지가 다시 보이는 상태로 돌아오면 갱신
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

// 데이터 변경 후 캐시 무효화
function invalidateServerPage() {
  _serverPageCache = null;
  _stageCountsCache = null;
  _tierCountsCache = null;
  loadStageCounts(true);
}

// ── 다크/라이트 테마 토글 ────────────────────────────────
function initThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const applyIcon = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    btn.textContent = current === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('title', current === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
  };
  applyIcon();
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    applyIcon();
  });
}

function bindEvents() {
  // Click event delegation
  document.addEventListener("click", async (event) => {
    // 0. Stage 원클릭 이동 버튼 (가장 우선 처리 — row 클릭보다 먼저)
    const quickBtn = event.target.closest(".stage-quick-move");
    if (quickBtn) {
      event.stopPropagation();
      const leadId = quickBtn.dataset.quickLead;
      const target = quickBtn.dataset.quickTarget;
      handleStageChange(leadId, target, quickBtn);
      return;
    }

    // 0-b. 메일 대화 보기 (보낸 메일 + 받은 답장 타임라인)
    const convBtn = event.target.closest(".conversation-btn");
    if (convBtn) {
      event.stopPropagation();
      closeMailDetailModal();   // 상세에서 눌렀으면 겹치지 않게 닫는다
      openConversationModal(convBtn.dataset.convLead);
      return;
    }

    // 0-c. 받은 메일함 행 클릭 → 메일 상세
    const mailRow = event.target.closest("tr.inbox-row");
    if (mailRow && !event.target.closest("button, a, input")) {
      event.stopPropagation();
      openMailDetailModal(mailRow.dataset.mailId);
      return;
    }
    if (event.target.id === "mailDetailRoot") {
      closeMailDetailModal();
      return;
    }
    if (event.target.closest("#conversationModalClose") || event.target.id === "conversationModalRoot") {
      closeConversationModal();
      return;
    }
    const quoteToggle = event.target.closest(".conv-quote-toggle");
    if (quoteToggle) {
      event.stopPropagation();
      const box = document.getElementById(quoteToggle.dataset.quoteTarget);
      if (box) {
        const showing = box.hasAttribute('hidden');
        if (showing) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
        quoteToggle.textContent = showing ? '▲ 인용문 접기' : '▼ 인용된 이전 대화 보기';
      }
      return;
    }

    // 1. Navigation items
    const navItem = event.target.closest(".nav-item");
    if (navItem) {
      const targetView = navItem.dataset.view;
      const targetStatus = navItem.dataset.statusFilter;
      state.view = targetView;
      // 모든 뷰 진입 시 필터 초기화 — 이전 뷰에서 남은 region/status/priority 가
      // 다음 뷰의 데이터까지 좁히는 문제 방지
      resetAllFilters();
      // 메일 양식은 사이드바로 들어오면 늘 목록(게시판)부터.
      // mode 가 남아 있으면 전에 편집하던 양식이 그대로 열려서, 목록을 보러
      // 온 사람에게 남의 편집 화면처럼 보인다.
      // (편집기 안에서의 저장·이동은 renderB2BEmailManager 를 직접 부르므로
      //  여기를 거치지 않는다 — 그쪽 흐름은 그대로 유지된다.)
      if (targetView === 'tool-b2b-email') {
        state.email.mode = 'list';
        state.email.dirty = false;
      }
      // 사이드바로 메일 화면에 들어오면 늘 받은 메일 목록부터 — 보낸 메일함을 연 채로
      // [받은 메일함]을 눌렀는데 보낸 메일함이 그대로 보이면 눌러도 안 되는 것처럼 보인다.
      if ((targetView === 'tool-inbox' || targetView === 'tool-inbox-needsreply') && typeof _inboxState !== 'undefined') {
        _inboxState.sent = false;
        closeSentMailModal();
      }
      if (targetStatus) {
        state.status = targetStatus;
        const statusEl = els.status;
        if (statusEl) statusEl.value = targetStatus;
      }

      // 로딩 표시 — 사용자가 클릭한 결과로 무거운 데이터 fetch 가 시작됨을 인지
      startTopProgress();
      setContentLoading(true);
      try {
        // 폴더 뷰 (verifying) 와 imported (원본 데이터 뷰) 만 baseLeads 필요
        // 나머지는 서버 페이지드 → loadLeads 스킵으로 즉시 반응
        const needsBaseLeads = targetView === 'pipeline-verifying' || targetView === 'pipeline-import';
        if (needsBaseLeads) {
          await loadLeads();
          state.selectedId = getFilteredLeads()[0]?.id || state.selectedId;
        }
        await render();
      } finally {
        setContentLoading(false);
        finishTopProgress();
      }
      return;
    }

    // 2. Home Button → 첫 화면(받은 메일함)으로. 전체 리드 fetch 안 함.
    if (event.target.closest("#homeBtn")) {
      // 로고를 누르면 첫 화면으로 — 접속했을 때와 같은 곳이어야 한다(state.view 기본값과 같이 둔다).
      // 예전에는 숨겨진 [가져오기] 로 보내서 사이드바에 아무것도 선택되지 않은 빈 화면이 떴다.
      state.view = "tool-inbox";
      resetAllFilters();
      state.selectedLeadIds = new Set();
      resetPagination();
      _serverPageCache = null;
      render();
      return;
    }

    // 3. Toolbar / Main action buttons
    if (event.target.closest("#exportCsvBtn")) {
      exportCsv();
      return;
    }
    if (event.target.closest("#importCsvBtn")) {
      openImportCsvModal();
      return;
    }
    if (event.target.closest("#verifyLeadsBtn")) {
      openVerifyModal();
      return;
    }
    if (event.target.closest("#verifyCloseBtn") || event.target.closest("#verifyCancelBtn")) {
      const modal = document.getElementById("verifyModal");
      if (modal) modal.style.display = "none"; syncBodyScrollLock();
      return;
    }
    if (event.target.closest("#verifyStartBtn")) {
      const scope = document.querySelector('input[name="verifyScope"]:checked')?.value || 'pending';
      startVerification(scope);
      return;
    }
    if (event.target.closest("#verifyAIStartBtn")) {
      startAIVerification();
      return;
    }
    if (event.target.closest("#addLeadBtn")) {
      addLead();
      return;
    }
    if (event.target.closest("#markContactedBtn")) {
      markSelectedContacted();
      return;
    }
    if (event.target.closest("#undoContactedBtn")) {
      undoSelectedContacted();
      return;
    }
    if (event.target.closest("#resetBtn")) {
      resetEdits();
      return;
    }

    // 4. Modal Close actions
    if (event.target.closest("#modalCloseBtn") || event.target.closest("#modalCancelBtn")) {
      const modal = document.getElementById("addLeadModal");
      if (modal) modal.style.display = "none"; syncBodyScrollLock();
      return;
    }
    if (event.target.closest("#editModalCloseBtn") || event.target.closest("#editModalCloseBtn2")) {
      const modal = document.getElementById("editLeadModal");
      if (modal) modal.style.display = "none"; syncBodyScrollLock();
      return;
    }
    if (event.target.closest("#importModalCloseBtn") || event.target.closest("#importCancelBtn")) {
      const modal = document.getElementById("importCsvModal");
      if (modal) modal.style.display = "none"; syncBodyScrollLock();
      resetImportModal();
      return;
    }
    if (event.target.closest("#settingsCloseBtn")) {
      const modal = document.getElementById("settingsModal");
      if (modal) modal.style.display = "none"; syncBodyScrollLock();
      return;
    }
    if (event.target.closest("#importHistoryCloseBtn") || event.target.closest("#importHistoryCloseBtn2")) {
      const modal = document.getElementById("importHistoryModal");
      if (modal) modal.style.display = "none"; syncBodyScrollLock();
      return;
    }

    // 5. Click outside modal content (backdrop clicks)
    //    리드 추가·수정, CSV 가져오기가 여기에 걸린다. 폼을 채우다 배경을
    //    스치면 그대로 날아가던 곳이라, 눌러 시작한 지점과 입력 여부를 본다.
    if (event.target.classList.contains("modal-backdrop")) {
      if (_modalPressTarget !== event.target) return;   // 안에서 끌어다 밖에서 뗌
      if (!confirmDiscardTyped(event.target)) return;   // 쓰던 내용 있음
      event.target.style.display = "none";
      delete event.target.dataset.userTyped;
      syncBodyScrollLock();
      if (event.target.id === "importCsvModal") resetImportModal();
      return;
    }

    // 6. Lead Table & Card selections
    const row = event.target.closest("tr[data-id]");
    if (row) {
      if (state.view === "emails") {
        if (event.target.closest("input,button,a")) return;
        state.selectedId = row.dataset.id;
        render();
        return;
      }
      
      // Default: click table row opens edit modal
      // 행 안의 조작 요소는 행 클릭(수정 모달)을 열지 않는다.
      // 위임 핸들러가 위쪽에서 먼저 처리하고 return 하지만, 순서가 바뀌어도
      // 오작동하지 않도록 여기서도 막아둔다.
      if (event.target.closest(
        "input[type='checkbox'], button.favorite-button, a, .conversation-btn, .stage-quick-move, .stage-select"
      )) return;
      openEditModal(row.dataset.id);
      return;
    }

    // Region card click
    const regionCard = event.target.closest("[data-region]");
    if (regionCard && state.view === "countries") {
      state.region = regionCard.dataset.region;
      state.view = "leads";
      const regionFilter = els.region;
      if (regionFilter) regionFilter.value = state.region;
      render();
      return;
    }

    // Follow up list item click
    const followupItem = event.target.closest(".followup-item");
    if (followupItem && state.view === "followups") {
      state.selectedId = followupItem.dataset.id;
      state.view = "leads";
      render();
      return;
    }

    // 7. Edit Modal buttons
    if (event.target.closest("#el-favoriteBtn")) {
      if (state.selectedId) toggleFavorite(state.selectedId);
      return;
    }
    if (event.target.closest("#el-deleteBtn")) {
      if (state.selectedId) {
        deleteLead(state.selectedId);
        const modal = document.getElementById("editLeadModal");
        if (modal) modal.style.display = "none"; syncBodyScrollLock();
      }
      return;
    }

    // 8. Settings Button Click
    if (event.target.closest("#settingsBtn")) {
      const modal = document.getElementById("settingsModal");
      if (modal) {
        modal.style.display = "flex";
        delete modal.dataset.userTyped;
        const newPasswordInput = document.getElementById("newPasswordInput");
        if (newPasswordInput) newPasswordInput.value = "";
        if (isMaster) loadSubIds();
      }
      return;
    }

    // Settings Change Password Button
    if (event.target.closest("#changePasswordBtn")) {
      const newPasswordInput = document.getElementById("newPasswordInput");
      const newPassword = newPasswordInput?.value || "";
      if (newPassword.length < 4) {
        alert("비밀번호는 최소 4자리 이상이어야 합니다.");
        return;
      }

      const btn = event.target.closest("#changePasswordBtn");
      btn.disabled = true;
      btn.textContent = "저장 중...";

      try {
        const res = await fetch("/api/users/password", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword })
        });
        const data = await res.json();
        if (data.success) {
          alert("비밀번호가 성공적으로 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용해주세요.");
          if (newPasswordInput) newPasswordInput.value = "";
        } else {
          alert("오류: " + data.error);
        }
      } catch (err) {
        alert("비밀번호 변경 실패");
      }
      btn.disabled = false;
      btn.textContent = "변경하기";
      return;
    }

    // Settings Create Sub ID Button
    if (event.target.closest("#createSubIdBtn")) {
      const unInput = document.getElementById("subUsernameInput");
      const pwInput = document.getElementById("subPasswordInput");
      const username = unInput?.value.trim() || "";
      const password = pwInput?.value || "";

      if (!username || password.length < 4) {
        alert("아이디와 4자리 이상의 비밀번호를 입력해주세요.");
        return;
      }

      const btn = event.target.closest("#createSubIdBtn");
      btn.disabled = true;
      btn.textContent = "생성 중...";

      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
          if (unInput) unInput.value = "";
          if (pwInput) pwInput.value = "";
          loadSubIds();
        } else {
          alert("생성 실패: " + data.error);
        }
      } catch (err) {
        alert("생성 중 오류가 발생했습니다.");
      }
      btn.disabled = false;
      btn.textContent = "생성";
      return;
    }

    // Settings Delete Sub ID
    const deleteUserBtn = event.target.closest("[data-delete-user]");
    if (deleteUserBtn) {
      const username = deleteUserBtn.dataset.deleteUser;
      if (confirm(`정말 '${username}' 계정을 삭제하시겠습니까?`)) {
        try {
          const res = await fetch("/api/users/" + encodeURIComponent(username), { method: "DELETE" });
          const data = await res.json();
          if (data.success) {
            loadSubIds();
          } else {
            alert("삭제 실패: " + data.error);
          }
        } catch (err) {
          alert("삭제 중 오류가 발생했습니다.");
        }
      }
      return;
    }

    // 9. Import CSV Modal Buttons
    if (event.target.closest("#importDropZone")) {
      const fileInput = document.getElementById("importFileInput");
      if (fileInput) fileInput.click();
      return;
    }
    if (event.target.closest("#importSubmitBtn")) {
      if (importParsedLeads.length) {
        const duplicateAction = document.querySelector('input[name="duplicateAction"]:checked')?.value || "skip";
        const dupes = importParsedLeads.filter(l => _isDuplicate(l));
        const newOnes = importParsedLeads.length - dupes.length;
        const actionLabel = duplicateAction === 'overwrite' ? '덮어쓰기' : '건너뜀';
        const ok = confirm(
          `최종 완료 처리 하시겠습니까?\n\n` +
          `· 전체 ${importParsedLeads.length}건\n` +
          `· 신규 ${newOnes}건\n` +
          `· 중복 ${dupes.length}건 (${actionLabel})\n\n` +
          `[확인]을 누르면 서버에 반영됩니다.\n[취소]를 누르면 업로드되지 않습니다.`
        );
        if (!ok) return;
        doImport(importParsedLeads, duplicateAction);
      }
      return;
    }

    // Missing Email Save inline action
    const saveEmailBtn = event.target.closest("[data-save-email]");
    if (saveEmailBtn) {
      const id = saveEmailBtn.dataset.saveEmail;
      const input = document.querySelector(`[data-email-for="${CSS.escape(id)}"]`);
      const email = input?.value.trim();
      if (!email) return;
      updateLead(id, "Email", email);
      state.selectedId = id;
      render();
      return;
    }

    // [이 페이지 전체 선택] 은 여기서 처리하지 않는다.
    //
    // 예전에는 이 위임 핸들러가 getFilteredLeads() — 브라우저에 올라온 리드
    // 전체(수천 건) — 를 선택했다. 그런데 두 표(renderServerPagedTable ·
    // renderLeadTable)가 각자 '지금 페이지 50건'만 고르는 핸들러를 따로 걸어
    // 둬서, 한 번 누르면 둘 다 발화했다. 결과는 "이 페이지 전체 선택"을 눌렀는데
    // Delete Selected 가 3302 로 뛰는 것이었고, 그대로 누르면 전 건이 지워진다.
    // 범위를 아는 것은 표 자신뿐이므로 각 표의 핸들러에만 맡긴다.

    // Delete Selected button
    if (event.target.closest("[data-delete-selected]")) {
      deleteSelectedLeads();
      return;
    }

    // Favorite click (inline)
    const favoriteBtn = event.target.closest("[data-favorite]");
    if (favoriteBtn && !event.target.closest("#editLeadModal")) {
      toggleFavorite(favoriteBtn.dataset.favorite);
      return;
    }
  });

  // Drag & drop event delegation
  document.addEventListener("dragover", (event) => {
    const dropZone = event.target.closest("#importDropZone");
    if (dropZone) {
      event.preventDefault();
      dropZone.style.borderColor = "var(--accent)";
      dropZone.style.background = "rgba(0,180,120,.06)";
    }
  });

  document.addEventListener("dragleave", (event) => {
    const dropZone = event.target.closest("#importDropZone");
    if (dropZone) {
      dropZone.style.borderColor = "";
      dropZone.style.background = "";
    }
  });

  document.addEventListener("drop", (event) => {
    const dropZone = event.target.closest("#importDropZone");
    if (dropZone) {
      event.preventDefault();
      dropZone.style.borderColor = "";
      dropZone.style.background = "";
      const file = event.dataTransfer?.files?.[0];
      if (file) handleCsvFile(file);
    }
  });

  // Change event delegation
  document.addEventListener("change", (event) => {
    if (event.target.id === "regionFilter") {
      state.region = event.target.value;
      _serverPageCache = null;   // 지역가 캐시 키에 들어가므로 새로 받는다
      resetPagination();
      render();
    } else if (event.target.id === "statusFilter") {
      state.status = event.target.value;
      resetPagination();
      render();
    } else if (event.target.id === "priorityFilter") {
      state.priority = event.target.value;
      resetPagination();
      render();
    } else if (event.target.id === "verifyFilter") {
      state.verify = event.target.value;
      resetPagination();
      render();
    } else if (event.target.id === "importFileInput") {
      const file = event.target.files?.[0];
      if (file) handleCsvFile(file);
    }

    // Stage 드롭다운 변경 — 즉시 서버 반영
    if (event.target.classList && event.target.classList.contains("stage-select")) {
      const leadId = event.target.dataset.stageLead;
      const newStage = event.target.value;
      handleStageChange(leadId, newStage, event.target);
    }

    // 발송 승인 체크박스
    if (event.target.classList && event.target.classList.contains("outreach-approval")) {
      const leadId = event.target.dataset.approveLead;
      const on = event.target.checked;
      handleOutreachApproval(leadId, on);
    }

    // Inline checkboxes (row selection)
    if (event.target.closest(".lead-select")) {
      const checkbox = event.target;
      const leadId = checkbox.dataset.selectLead;
      if (checkbox.checked) {
        state.selectedLeadIds.add(leadId);
      } else {
        state.selectedLeadIds.delete(leadId);
      }
      render();
    }

    // Modal Edit Fields Auto-Save
    if (event.target.id && event.target.id.startsWith("el-")) {
      const field = event.target.id.slice(3);
      const fields = ["status", "owner", "lastContact", "nextFollowUp", "notes", "Company", "Region", "Priority", "Type", "BuyerContact", "Title", "Email", "Phone", "WebsiteContact", "LinkedInCompany", "BrandsChannels", "Evidence", "Approach", "Sources"];
      if (fields.includes(field) && state.selectedId) {
        updateLead(state.selectedId, field, event.target.value);
      }
    }
  });

  // Input event delegation (Search field)
  document.addEventListener("input", (event) => {
    if (event.target.id === "searchInput") {
      state.query = event.target.value.trim();
      // 단계 화면(검증 완료 등)에서 검색하면 그 화면 안에서 좁힌다.
      // 예전에는 무조건 'leads'(전체 리드)로 바꿔버려서, 검증 완료 409건을
      // 보다가 검색 한 번에 보관함까지 섞인 6,073건 화면으로 튕겼다.
      const onStagePage = typeof state.view === 'string' && state.view.startsWith('pipeline-');
      if (!onStagePage) state.view = "leads";
      _serverPageCache = null;   // 검색어가 캐시 키에 들어가므로 새로 받는다
      resetPagination();
      if (state.query && !onStagePage) {
        state.region = "All";
        state.status = "All";
        state.priority = "All";
        const regionFilter = els.region; if (regionFilter) regionFilter.value = "All";
        const statusFilter = els.status; if (statusFilter) statusFilter.value = "All";
        const priorityFilter = els.priority; if (priorityFilter) priorityFilter.value = "All";
      }
      state.selectedId = getFilteredLeads()[0]?.id || state.selectedId;
      render();
    }
  });

  // Form submit event delegation
  document.addEventListener("submit", async (event) => {
    if (event.target.id === "addLeadForm") {
      event.preventDefault();
      const btn = document.getElementById("modalSubmitBtn");
      if (btn) { btn.disabled = true; btn.textContent = "저장 중..."; }

      const id = "lead-" + Date.now();
      const getValue = (name) => (document.getElementById("ml-" + name)?.value || "").trim();
      const lead = {
        leadId: id, id: id,
        Company:       getValue("Company") || "New Company",
        Region:       getValue("Region") || "Unknown",
        Priority:      getValue("Priority"),
        Type:          getValue("Type"),
        BuyerContact:  getValue("BuyerContact"),
        Email:         getValue("Email"),
        Phone:         getValue("Phone"),
        WebsiteContact:getValue("WebsiteContact"),
        BrandsChannels:getValue("BrandsChannels"),
        notes:         getValue("notes"),
        Evidence: "", LinkedInCompany: "", Title: "", favorite: false,
        ContactLinkedIn: "", RoleMemo: "", Address: "", Approach: "",
        Sources: "Manual entry",
        Checked: new Date().toISOString().slice(0, 10),
        Confidence: "Manual entry",
        status: "New", owner: "", lastContact: "", nextFollowUp: ""
      };

      baseLeads.unshift(lead);
      state.selectedId = id;
      state.view = "leads";
      state.region = "All";
      state.status  = "All";
      state.priority = "All";
      renderFilters();
      render();
      
      const modal = document.getElementById("addLeadModal");
      if (modal) modal.style.display = "none"; syncBodyScrollLock();

      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead)
        });
        const result = await res.json();
        if (result.success) {
          const idx = baseLeads.findIndex((l) => l.id === id);
          if (idx !== -1) baseLeads[idx]._id = result.data._id;
        }
      } catch (err) {
        console.error("Failed to save lead:", err);
      }

      if (btn) { btn.disabled = false; btn.textContent = "저장하기"; }
    }
  });
}

function initDetailResizer() {
  const savedWidth = Number(localStorage.getItem(DETAIL_WIDTH_KEY));
  if (savedWidth) setDetailWidth(savedWidth);

  document.addEventListener("pointerdown", (event) => {
    const resizer = event.target.closest("#detailResizer");
    if (!resizer) return;
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-detail");

    const onPointerMove = (moveEvent) => {
      const nextWidth = window.innerWidth - moveEvent.clientX;
      setDetailWidth(nextWidth);
    };

    const onPointerUp = () => {
      document.body.classList.remove("is-resizing-detail");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const width = getComputedStyle(document.documentElement).getPropertyValue("--detail-width").trim();
      localStorage.setItem(DETAIL_WIDTH_KEY, String(parseInt(width, 10) || 380));
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  });
}

function setDetailWidth(width) {
  const maxWidth = Math.min(680, Math.max(320, window.innerWidth - 640));
  const nextWidth = Math.max(260, Math.min(width, maxWidth));
  document.documentElement.style.setProperty("--detail-width", `${nextWidth}px`);
}

// 서버에서 받은 지역 목록 (지금 보고 있는 단계 기준).
// 브라우저가 전체 리드를 안 받게 되면서 지역 칸에 'All' 하나만 남았던 것을 메운다.
var _regionFacet = { key: '', list: [] };

function renderFilters() {
  const leads = getLeads();
  // 서버가 준 목록을 우선 쓴다. 없으면 예전처럼 로컬 배열에서 뽑는다
  // (검증 대기·가져오기 화면은 여전히 전체를 들고 있다).
  // ?. 를 쓰는 이유: init() 이 파일 위쪽에서 먼저 돌아서, 아래에 있는
  // var _regionFacet 의 대입이 아직 실행되기 전에 여기로 들어온다.
  // (선언은 끌어올려지지만 값은 undefined 다)
  const facet = _regionFacet?.list || [];
  const countries = facet.length
    ? facet
    : unique(leads.map((lead) => lead.Region)).sort(localeSort);
  const priorities = unique(leads.map((lead) => lead.Priority)).filter(Boolean).sort(localeSort);

  // Status·Priority·검증 필터는 화면에서 숨겼다(서버 쿼리에 안 들어가 무동작이었음).
  // 숨긴 뒤에도 여기서 innerHTML 을 쓰면 null 에 쓰다가 화면 전체가 죽는다 —
  // 실제로 "Cannot set properties of null" 로 렌더가 통째로 멈췄다.
  // 숨김/표시가 바뀌어도 견디도록 전부 있는지 확인하고 쓴다.
  if (els.region) els.region.innerHTML = optionHtml(["All", ...countries], state.region);
  if (els.status) els.status.innerHTML = optionHtml(["All", ...STATUSES], state.status);
  if (els.priority) els.priority.innerHTML = optionHtml(["All", ...priorities], state.priority);
  // verify select 는 정적 옵션이 page.tsx 에 박혀있어 value 만 동기화
  if (els.verify) els.verify.value = state.verify || "All";
}

// 화면 그리기 번호 — 서버 응답을 기다리는 사이 다른 메뉴로 옮기면, 늦게 도착한 앞 화면이
// 새 화면 위에 자기 조각(2차 검토 카드·성공/실패 탭·칩)을 붙여 버렸다
// ([메일 양식] 위에 [AI 검증 완료] 머리가 떠 있던 문제). 기다린 뒤 번호가 바뀌었으면 그리지 않는다.
var _renderSeq = 0;
async function render() {
  const seq = ++_renderSeq;
  try {
    return await _renderInner(seq);
  } catch (e) {
    console.error('[render] failed:', e);
    if (els.content) {
      els.content.innerHTML = `
        <div style="padding:24px;background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;margin:16px">
          <div style="font-size:14px;font-weight:700;color:#991b1b;margin-bottom:8px">⚠️ 렌더링 오류 발생</div>
          <div style="font-size:12px;color:#7f1d1d;font-family:monospace;white-space:pre-wrap;background:white;padding:12px;border-radius:6px">${escapeHtml(String(e?.message || e))}</div>
          <div style="font-size:11px;color:#991b1b;margin-top:8px">브라우저 개발자 도구(F12) → Console 탭에서 상세 오류 확인. 강제 새로고침 (Ctrl+Shift+R) 후 재시도.</div>
        </div>
      `;
    }
  }
}

async function _renderInner(seq) {
  const stale = () => seq !== undefined && seq !== _renderSeq;
  const leads = getFilteredLeads();
  // 매 render 마다 stage 배너/서브필터 chip 초기화 — 각 페이지에서 필요 시 다시 그려짐
  clearStageBanner();
  // 화면을 옮길 때 앞 화면이 붙여둔 조각을 전부 걷어낸다.
  //
  // 이 세 줄은 #content 바깥(형제 노드)에 붙는 것들이라 els.content.innerHTML
  // 로는 안 지워진다. 하나만 빠뜨려도 다른 화면 맨 위에 그대로 남는다 —
  // 실제로 clearVerifiedSubFilterChips 가 빠져 있어서 [메일 양식] 위에
  // "아직 안 옮김 541 · 이메일 없음 68" 이 계속 떠 있었다.
  clearVerifyingSubFilterChips();
  clearVerifiedSubFilterChips();
  clearVerifiedResultTabs();

  // 상단 필터 toolbar 는 **표로 보는 화면**에서만 쓸모가 있다.
  //
  // tool-* 화면은 원래 숨겼는데, 카드로 보는 화면들(발송 관리·파트너십·
  // 대화 진행 중)은 pipeline-* 이라 그대로 떠 있었다. 그 화면들은 자기
  // 검색창을 따로 갖고 있어서 **검색창이 두 개**로 보이고, 위쪽 것은 눌러도
  // 카드가 안 걸러진다 — 고장난 것처럼 보인다.
  const tb = document.getElementById('toolbarSection');
  if (tb) {
    const NO_TOOLBAR = ['pipeline-contacted', 'pipeline-partner', 'pipeline-negotiating'];
    const hide = (state.view && state.view.startsWith('tool-')) || NO_TOOLBAR.includes(state.view);
    tb.style.display = hide ? 'none' : '';

    // 검색·지역는 **표를 거르는 도구**라 표 바로 위에 있어야 한다.
    //
    // 원래는 페이지 맨 위(제목 바로 아래)에 박혀 있었는데, 그 사이에
    // [2차 검토] 카드·칩·성공/실패 탭이 끼어들면서 필터와 그 대상(표)이
    // 한 화면 높이만큼 떨어졌다. 무엇을 거르는 칸인지 보이지 않는다.
    //
    // 그 카드들은 #content 바로 앞에 끼워 넣어지므로, 필터를 #content
    // 바로 앞으로 옮기면 자연히 맨 아래(=표 바로 위)로 내려간다.
    const contentEl = document.getElementById('content');
    if (!hide && contentEl && contentEl.previousElementSibling !== tb) {
      contentEl.parentNode.insertBefore(tb, contentEl);
    }
  }
  els.navItems.forEach((item) => {
    const itemView = item.dataset.view;
    const itemStatus = item.dataset.statusFilter;
    let isActive;
    if (itemStatus) {
      isActive = state.view === "leads" && state.status === itemStatus;
    } else if (itemView === "leads") {
      isActive = state.view === "leads" && state.status === "All";
    } else {
      isActive = state.view === itemView;
    }
    item.classList.toggle("active", isActive);
  });
  renderPipeline();
  renderStats(leads);
  updateActionButtons();

  if (state.view === "countries") {
    els.viewTitle.textContent = "Countries";
    els.viewSubtitle.textContent = "Compare market volume and jump into a region list.";
    renderCountries(leads);
    return;
  }

  if (state.view === "worked") {
    const worked = leads.filter((lead) => lead.status !== "New");
    els.viewTitle.textContent = "Worked";
    els.viewSubtitle.textContent = "Leads you've already engaged with (status moved past New).";
    renderLeadTable(worked, "No worked leads match the current filters.");
    return;
  }

  if (state.view === "favorites") {
    const favorites = leads.filter((lead) => lead.favorite);
    els.viewTitle.textContent = "Favorites";
    els.viewSubtitle.textContent = "Review starred priority buyers.";
    renderLeadTable(favorites, "No favorite buyers match the current filters.");
    return;
  }

  if (state.view === "followups") {
    els.viewTitle.textContent = "Follow-ups";
    els.viewSubtitle.textContent = "Open leads that have next actions scheduled.";
    renderFollowups(leads);
    return;
  }

  if (state.view === "emails") {
    els.viewTitle.textContent = "Missing Emails";
    els.viewSubtitle.textContent = "Open buyer sites, find a contact email, and save it directly.";
    renderMissingEmails(leads);
    return;
  }

  if (state.view === "importHistory") {
    els.viewTitle.textContent = "Import History";
    els.viewSubtitle.textContent = "CSV 가져오기 기록을 확인하고 원하는 배치를 롤백할 수 있습니다.";
    renderImportHistory();
    return;
  }

  if (state.view === "verification") {
    els.viewTitle.textContent = "🔍 검증 분류";
    els.viewSubtitle.textContent = "검증 결과별로 리드를 4그룹으로 묶어 보여줍니다. 각 그룹을 클릭하면 해당 항목만 표 형태로 봅니다.";
    renderVerificationClassification();
    return;
  }

  if (state.view === "recommended" || state.view === "tool-recommended") {
    els.viewTitle.textContent = "💎 K-beauty 추천 리스트";
    els.viewSubtitle.textContent = "글로벌 K-beauty 디스트리뷰터/도매/리테일러 시드 발굴 결과. 카드를 골라서 내 리드로 추가하세요.";
    renderRecommendedBuyers();
    return;
  }

  // ── 검증대기/검증완료 탭에서 자동 리로드 (AI 배치 진행 실시간 반영) ─
  managePipelineAutoRefresh(state.view);

  // ── 발송 관리 ─────────────────────────────────────────────
  // 리드 표가 아니라 "메일이 어디까지 갔는가"를 보는 화면이라 stageMap 을
  // 타지 않는다. 이 검사가 stageMap 뒤에 있었을 때는 stageMap 이 먼저
  // pipeline-contacted 를 잡아 일반 표를 그리고 return 해버려서, 여기까지
  // 아예 오지 못했다 (화면이 비어 보이던 원인).
  if (state.view === 'pipeline-contacted') {
    els.viewTitle.textContent = '📨 발송 관리';
    els.viewSubtitle.textContent = '보낼 메일 · 예약된 메일 · 나간 메일을 단계별로 봅니다.';
    renderOutboxPage();
    return;
  }

  // ── 거래가 살아 있는 회사들 ────────────────────────────────
  //
  // [대화 진행 중]·[파트너십 확정]은 표로 보는 화면이 아니다. 몇 곳 안 되고,
  // 알고 싶은 것도 "이 회사와 어디까지 갔나" 하나라서 회사별 카드로 본다.
  // (stageMap 보다 먼저 가로챈다 — 뒤에 두면 그쪽이 먼저 집어간다)
  if (state.view === 'pipeline-partner' || state.view === 'pipeline-negotiating') {
    const isPartner = state.view === 'pipeline-partner';
    els.viewTitle.textContent = isPartner ? '⭐ 파트너십 확정' : '🤝 대화 진행 중';
    els.viewSubtitle.textContent = isPartner
      ? '계약·합의가 끝난 거래처입니다. 회사를 누르면 그동안 오간 대화가 열립니다.'
      : '조건·일정·가격을 주고받는 중인 곳입니다. 회사를 누르면 대화가 열립니다.';
    renderRelationshipsPage(isPartner ? 'partner' : 'negotiating');
    return;
  }

  // ── 새 파이프라인 뷰 (stage 기반) ─────────────────────────────
  const stageMap = {
    'pipeline-import':      { stage: 'imported',    title: '📥 가져오기 (Import)',  sub: '엑셀에서 새로 업로드된 회사들. 검증 진행 대기.' },
    'pipeline-ai-searched': { stage: 'ai-searched', title: '🤖 AI 서칭 결과',       sub: 'Claude 가 웹에서 자동 발굴한 K-뷰티 B2B 후보. 검토 후 검증대기(추가 검증) / 검증 완료(즉시 활용) / 제외로 이동.' },
    'pipeline-verifying':   { stage: 'verifying',   title: '🔍 검증 대기',          sub: '검증 진행 중이거나 필요한 회사들.' },
    'pipeline-verified':    { stage: 'verified',    title: '✅ AI 검증 완료',          sub: '검증을 통과해 메일을 보낼 수 있는 곳입니다. 아닌 곳은 빼주세요.' },
    'pipeline-failed':      { stage: '__failed',    title: '🚫 검증 실패',          sub: 'AI가 규모·업종이 안 맞는다고 판정. 잘못 걸러진 곳은 수동으로 검증완료로 되돌릴 수 있습니다.' },
    // pipeline-contacted 는 여기 두지 않는다 — 위에서 renderOutboxPage 로 먼저 빠진다.
    'pipeline-replied':     { stage: 'replied',     title: '💬 답장 받음',            sub: '답장이 온 곳입니다. 답장하거나, 아닌 곳은 빼주세요.' },
    'pipeline-negotiating': { stage: 'negotiating', title: '🤝 대화 진행 중',        sub: '조건/일정/가격 등 실제 협상 오가는 상태.' },
    'pipeline-partner':     { stage: 'partner',     title: '⭐ 파트너십 확정',        sub: '계약/합의 완료된 실 파트너. 자동 발송 대상에서 자동 제외.' },
    'pipeline-archived':    { stage: 'archived',    title: '📦 보관함',             sub: '수동 폐기 또는 정리한 리드. 필요 시 복구 가능.' },
  };
  if (stageMap[state.view]) {
    const s = stageMap[state.view];
    els.viewTitle.textContent = s.title;
    els.viewSubtitle.textContent = s.sub;

    // 특수 케이스: pipeline-failed 는 실제 stage 아님 → archived + not-fit 로 대체
    let stageMatch;
    if (s.stage === '__failed') {
      stageMatch = (l) => (l.stage || 'imported') === 'archived' &&
        l?.verification?.aiVerdict === 'not-fit';
    } else {
      stageMatch = (l) => (l.stage || 'imported') === s.stage;
    }

    // ── 서버 페이지네이션 (검증대기 제외 모든 stage) ──
    // 검증대기 는 배치별 폴더 뷰 필요 → baseLeads 사용
    // 나머지는 stage 별 50건씩 서버 슬라이스
    const useServerPage = s.stage !== 'verifying' && s.stage !== 'imported';
    if (useServerPage) {
      // 검증완료 페이지는 성공/실패 상위 탭으로 stage 동적 결정
      let serverStage = s.stage;
      let displayInfo = s;
      if (s.stage === 'verified') {
        const tab = state.verifiedResultTab || 'success';
        if (tab === 'failed') {
          serverStage = '__failed';
          // 제목도 바꾼다 — 실패 목록을 보는데 제목이 '✅ AI 검증 완료' 로 남아 있었다
          els.viewTitle.textContent = '🚫 검증 실패';
          els.viewSubtitle.textContent = 'AI 가 거른 곳과 보낼 메일 주소가 없는 곳입니다. 잘못 빠진 곳은 행의 [→ ✅ AI 검증 완료]로 되돌립니다.';
          displayInfo = { ...s, title: '🚫 검증 실패', sub: 'AI가 규모·업종이 안 맞는다고 판정. 수동으로 되돌릴 수 있습니다.' };
        }
      }
      const sub = serverStage === 'verified' ? (state.verifiedSubFilter || 'all') : null;
      const tier = serverStage === 'verified' ? (state.tierFilter || null) : null;
      const wantPage = state.pagination?.currentPage || 1;
      const counts = _stageCountsCache || await loadStageCounts();
      if (stale()) return;   // 기다리는 사이 다른 화면으로 옮겼다 — 그리지 않는다
      let pageData;
      try {
        pageData = await loadServerPage(serverStage, wantPage, sub === 'all' ? null : sub, false, tier);
      } catch (e) {
        if (stale()) return;
        els.content.innerHTML = emptyState('페이지 로드 실패: ' + (e.message || 'unknown'));
        return;
      }
      if (stale()) return;
      const totalForBanner = pageData.total;
      renderStageBanner(displayInfo, totalForBanner, totalForBanner);
      // 국내판 카테고리 탭 (public/kr-screens.js) — 목록 위에 붙는다.
      // 어느 단계를 보든 "지금 학교 건인가 병원 건인가"를 먼저 갈라야 한다.
      renderCategoryTabs(serverStage);
      // 검증완료 페이지 상단에 성공/실패 탭
      if (s.stage === 'verified' && counts) {
        renderVerifiedResultTabs(counts.stages.verified, counts.stages.failed);
      } else {
        clearVerifiedResultTabs();
      }
      // 검증완료 서브필터 chip (성공 탭일 때만 · 서버 카운트 기반)
      if (s.stage === 'verified' && serverStage === 'verified' && counts) {
        renderVerifiedSubFilterChipsServer(counts.verifiedSub, counts.stages.failed);
        // A/B/C 등급 chip 은 뺐다 — 어차피 전부 확인하고 보낼 것이라
        // 등급을 나누면 "B는 봐야 하나 말아야 하나"만 늘어난다.
        // 되살리려면 아래 한 줄 주석을 풀면 된다 (renderVerifiedTierChips 는 그대로 있다).
        // renderVerifiedTierChips();
      } else {
        clearVerifiedSubFilterChips();
        clearVerifiedTierChips();
      }
      clearVerifyingSubFilterChips();
      const statsElServer = document.getElementById('statsGrid');
      if (statsElServer) statsElServer.innerHTML = '';
      renderServerPagedTable(pageData, displayInfo);
      return;
    }

    // ── Import 배치별 폴더 UI (검증대기 전용) ──
    const useFolderView = s.stage === 'verifying';
    if (useFolderView) {
      const allByStage = getLeads().filter(stageMatch);
      renderStageBanner(s, allByStage.length, allByStage.length);
      // 서브필터 chip 은 폴더 밖에서만
      if (s.stage === 'verifying') {
        renderVerifyingSubFilterChips(allByStage);
      } else {
        clearVerifyingSubFilterChips();
      }
      const statsEl = document.getElementById('statsGrid');
      if (statsEl) statsEl.innerHTML = '';

      // state.folderView 방어 (오래된 세션 등 호환)
      if (!state.folderView) state.folderView = { openBatch: null };
      if (state.folderView.openBatch == null) {
        // 폴더 목록 모드
        const cardRenderer = s.stage === 'verifying' ? batchCardVerifying
                          : s.stage === 'verified'  ? batchCardVerified
                          : batchCardFailed;
        renderBatchFolders(stageMatch, cardRenderer,
          `${s.title}에 해당하는 import 배치가 없습니다.`);
        return;
      } else {
        // 폴더 내부 모드 — 해당 배치 리드만 노출
        const batchMatch = (l) => stageMatch(l) && (l.importBatch || '(수동/미배치)') === state.folderView.openBatch;
        let batchLeads = leads.filter(batchMatch);
        // 검증대기 서브필터도 배치 내부에서 적용
        if (s.stage === 'verifying') {
          const sub = state.verifyingSubFilter || 'unverified';
          if (sub === 'unverified') batchLeads = batchLeads.filter(l => !l?.verification?.aiVerifiedAt);
          else if (sub === 'maybe') batchLeads = batchLeads.filter(l => l?.verification?.aiVerdict === 'maybe');
        }
        // breadcrumb 추가
        const bcHtml = renderFolderBreadcrumb(state.folderView.openBatch, batchLeads.length);
        renderLeadTable(batchLeads, `이 폴더에 해당하는 리드가 없습니다.`);
        // content 앞에 breadcrumb prepend
        els.content.insertAdjacentHTML('afterbegin', bcHtml);
        document.getElementById('folderBackBtn')?.addEventListener('click', () => {
          state.folderView.openBatch = null;
          resetPagination();
          render();
        });
        return;
      }
    }

    // ── 폴더 UI 안 쓰는 stage (contacted/replied/negotiating/partner/imported) ──
    // stage 필터는 텍스트 필터(getFilteredLeads) 뒤에 한번 더 적용
    const allByStage = getLeads().filter(stageMatch);
    let stageLeads = leads.filter(stageMatch);

    // 검증대기 stage 는 AI 진행 여부 하위 필터 적용
    if (s.stage === 'verifying') {
      const sub = state.verifyingSubFilter || 'unverified';
      if (sub === 'unverified') {
        // "검증 전 상태" — AI 아직 안 본 것만
        stageLeads = stageLeads.filter(l => !l?.verification?.aiVerifiedAt);
      } else if (sub === 'maybe') {
        stageLeads = stageLeads.filter(l => l?.verification?.aiVerdict === 'maybe');
      }
      // 'all' 은 stage=verifying 필터 그대로
      // 'failed' 는 사이드바 별도 페이지로 이동됨
    }
    // 검증완료 stage 하위 필터.
    // approved/pending 칩은 없앴지만(readyForOutreach 가 늘 전체와 같아 무의미)
    // 예전 세션에 그 값이 남아 있으면 목록이 통째로 비어 보인다 — all 로 되돌린다.
    if (s.stage === 'verified') {
      if (state.verifiedSubFilter === 'approved' || state.verifiedSubFilter === 'pending') {
        state.verifiedSubFilter = 'all';
      }
      const sub = state.verifiedSubFilter || 'all';
      const hasRealEmail = (l) => l.Email && l.Email.trim() && !/^Not found/i.test(l.Email);
      if (sub === 'approved') {
        stageLeads = stageLeads.filter(l => l.readyForOutreach === true);
      } else if (sub === 'pending') {
        stageLeads = stageLeads.filter(l => l.readyForOutreach !== true && hasRealEmail(l));
      } else if (sub === 'no-email') {
        stageLeads = stageLeads.filter(l => !hasRealEmail(l));
      }
    }

    renderStageBanner(s, allByStage.length, stageLeads.length);
    // 서브필터 chip 렌더 (해당 stage 에서만, 다른 stage 에서는 정리)
    if (s.stage === 'verifying') {
      renderVerifyingSubFilterChips(allByStage);
      clearVerifiedSubFilterChips();
    } else if (s.stage === 'verified') {
      renderVerifiedSubFilterChips(allByStage);
      clearVerifyingSubFilterChips();
    } else {
      clearVerifyingSubFilterChips();
      clearVerifiedSubFilterChips();
    }
    // 통계 stats-grid 는 stage 페이지에서 숨김 (이미 renderStats에서 렌더됐으므로 지움)
    const statsEl = document.getElementById('statsGrid');
    if (statsEl) statsEl.innerHTML = '';
    renderLeadTable(stageLeads, `${s.title}에 해당하는 리드가 없습니다.`);
    return;
  }

  // ── 새 부가 도구 페이지 스켈레톤 ──────────────────────────────
  if (state.view === "tool-b2b-email") {
    els.viewTitle.textContent = "📝 메일 양식";
    els.viewSubtitle.textContent = "업체에 보낼 메일 문구를 카테고리별로 만들어 두고, [발송 관리]에서 골라 씁니다.";
    renderB2BEmailManager();
    return;
  }
  if (state.view === "tool-mail-accounts") {
    els.viewTitle.textContent = "📬 메일 계정 관리";
    els.viewSubtitle.textContent = "메일을 보낼 회사 이메일 주소와 서명을 등록합니다.";
    renderMailAccountsTool();
    return;
  }
  if (state.view === "tool-crawler") {
    els.viewTitle.textContent = "🕷 이메일 크롤링";
    els.viewSubtitle.textContent = "웹사이트에서 컨택 이메일 자동 수집.";
    renderCrawlerTool();
    return;
  }
  // ── 국내판 전용 화면 (public/kr-screens.js) ──
  // 단계 목록이 아닌 화면으로 옮기면 카테고리 탭을 걷어낸다
  if (typeof state.view === 'string' && !state.view.startsWith('pipeline-')) {
    clearCategoryTabs();
  }
  if (state.view === "tool-crawl") {
    els.viewTitle.textContent = "🔎 크롤링 실행";
    els.viewSubtitle.textContent = "네이버에서 업체를 찾고 홈페이지에서 이메일을 뽑아옵니다.";
    renderCrawlPage();
    return;
  }
  if (state.view === "tool-keywords") {
    els.viewTitle.textContent = "🏷 키워드 관리";
    els.viewSubtitle.textContent = "카테고리별 검색 키워드. 새 키워드를 넣어야 새 업체가 쌓입니다.";
    renderKeywordsPage();
    return;
  }
  if (state.view === "tool-categories") {
    els.viewTitle.textContent = "📊 카테고리 현황";
    els.viewSubtitle.textContent = "타깃 5분류가 각각 어느 단계까지 갔는지.";
    renderCategoriesPage();
    return;
  }
  if (state.view === "tool-import-history") {
    els.viewTitle.textContent = "📋 Import History";
    els.viewSubtitle.textContent = "CSV 가져오기 기록. 배치별 롤백 가능.";
    renderImportHistory();
    return;
  }
  if (state.view === "tool-scheduled-mails") {
    els.viewTitle.textContent = "📅 예약 발송 관리";
    els.viewSubtitle.textContent = "대기 중 예약 · 발송 여부 확인 · 취소 · 즉시 발송.";
    renderScheduledMailsPage();
    return;
  }
  if (state.view === "tool-crm-account") {
    els.viewTitle.textContent = "👤 CRM 계정 관리";
    els.viewSubtitle.textContent = "내 로그인 아이디를 확인하고 비밀번호를 바꿉니다.";
    renderCrmAccountPage();
    return;
  }
  if (state.view === "tool-user-guide") {
    els.viewTitle.textContent = "📖 사용 설명서";
    els.viewSubtitle.textContent = "처음 쓰시는 분을 위한 단계별 가이드 · 각 화면이 어떻게 이어지는지.";
    renderUserGuidePage();
    return;
  }
  // 메일 화면을 **옮겨 왔을 때만** 폴더·검색 조건을 비운다. 받은 메일함에서 고른 폴더가
  // 회신 필요 화면까지 따라가 "회신 필요 6건" 처럼 보였다. 같은 화면 안에서 페이지를 넘기거나
  // 다시 그릴 때는 그대로 둔다.
  if ((state.view === "tool-inbox" || state.view === "tool-inbox-needsreply") && _inboxState.lastView !== state.view) {
    Object.assign(_inboxState, { page: 1, classification: '', q: '', linked: '', group: '', trashed: false, today: false, sent: false });
    _inboxState.lastView = state.view;
  }
  if (state.view === "tool-inbox") {
    els.viewTitle.textContent = "📥 받은 메일함";
    els.viewSubtitle.textContent = "이카운트 메일함에서 수집한 수신 메일. 대화 단위로 접어서 표시.";
    renderInboxPage({ needsReplyOnly: false });
    return;
  }
  if (state.view === "tool-inbox-needsreply") {
    els.viewTitle.textContent = "⚠️ 회신 필요";
    els.viewSubtitle.textContent = "상대가 질문·요청을 보냈고 아직 답하지 않은 메일.";
    renderInboxPage({ needsReplyOnly: true });
    return;
  }
  if (state.view === "tool-deadlines") {
    els.viewTitle.textContent = "⏰ 기한 관리";
    els.viewSubtitle.textContent = "회신 기한이 잡힌 메일 · 지난 것부터 순서대로 (최근 2개월).";
    renderDeadlinesPage();
    return;
  }
  if (state.view === "tool-briefing") {
    els.viewTitle.textContent = "📋 오늘의 브리핑";
    els.viewSubtitle.textContent = "회신 필요 · 기한 임박 · 새로 답장 온 곳을 한 장으로.";
    renderBriefingPage();
    return;
  }
  if (state.view === "tool-legacy") {
    els.viewTitle.textContent = "📚 올린 업체 목록";
    els.viewSubtitle.textContent = "엑셀로 올린 업체입니다. AI 검증과 직접 검토를 돌려 보낼 곳을 고릅니다.";
    renderLegacyPage();
    return;
  }
  // 사이드바 [⬆ 엑셀·CSV 올리기] — 별도 화면이 아니라 올리기 창을 띄우고
  // 목록 화면에 머문다. 올린 뒤 결과를 바로 그 자리에서 보게 하려는 것이다.
  if (state.view === "tool-legacy-import") {
    state.view = "tool-legacy";
    render();
    openImportCsvModal();
    return;
  }
  if (state.view === "tool-decisions") {
    els.viewTitle.textContent = "🗂 검토 결과";
    els.viewSubtitle.textContent = "지금까지 어느 업체를 어디로 보냈는지 날짜별로 봅니다. 잘못 누른 것은 여기서 되돌립니다.";
    renderDecisionsPage();
    return;
  }
  if (state.view === "tool-review") {
    const fromLegacy = _review.source === 'legacy';
    els.viewTitle.textContent = fromLegacy ? "🔎 직접 검토 · 올린 데이터" : "🔎 직접 검토";
    els.viewSubtitle.textContent = fromLegacy
      ? "엑셀로 올린 업체 중 아직 고르지 않은 곳을 한 회사씩 봅니다."
      : "AI 판정을 통과한 곳을 한 회사씩 봅니다. 버튼을 누르면 바로 다음 회사로 넘어갑니다.";
    renderReviewPage();
    return;
  }
  if (state.view === "tool-trash") {
    els.viewTitle.textContent = "🗑 휴지통";
    els.viewSubtitle.textContent = "치워둔 메일. DB 에서 지우지 않으므로 언제든 되돌릴 수 있습니다.";
    renderTrashPage();
    return;
  }
  if (state.view === "tool-mail-settings") {
    els.viewTitle.textContent = "🔌 메일 수신 설정";
    els.viewSubtitle.textContent = "이카운트 IMAP 연결 · 수집 폴더 · 광고 필터.";
    renderMailSettingsPage();
    return;
  }

  els.viewTitle.textContent = "📋 업체 목록";
  els.viewSubtitle.textContent = "업체를 찾고, 검토하고, 메일을 관리합니다.";
  renderLeadTable(leads);
}

function renderStats(leads) {
  // 파이프라인 페이지에서는 stage 배너로 대체하므로 stats grid 비움
  const isStagePage = state.view && state.view.startsWith('pipeline-');
  const isToolPage = state.view && state.view.startsWith('tool-');
  if (isStagePage || isToolPage) {
    if (els.stats) els.stats.innerHTML = '';
    return;
  }
  const all = getLeads();
  const regionCount = unique(all.map((lead) => lead.Region)).length;
  const contacted = all.filter((lead) => lead.status !== "New").length;
  const today = new Date().toISOString().slice(0, 10);
  const due = all.filter((lead) => lead.nextFollowUp && lead.nextFollowUp <= today && !["Won", "Lost"].includes(lead.status)).length;

  // stage 기반 통과/실패 카운트 (파이프라인과 일치) — 서버 카운트 우선, 없으면 클라이언트 계산
  const stages = (_stageCountsCache && _stageCountsCache.stages) || {};
  const passedCount   = stages.verified != null ? stages.verified   : all.filter(l => (l.stage || 'imported') === 'verified').length;
  const failedCount   = stages.failed   != null ? stages.failed     : all.filter(l => (l.stage || 'imported') === 'failed').length;
  const archivedCount = stages.archived != null ? stages.archived   : all.filter(l => (l.stage || 'imported') === 'archived').length;

  els.stats.innerHTML = [
    stat("Visible", leads.length, "leads"),
    stat("Countries", regionCount, "countries"),
    stat("Worked", contacted, "worked"),
    stat("Due", due, "followups"),
    stat("No Email", all.filter((lead) => !hasEmail(lead)).length, "emails"),
    // ── stage 기반 (사이드바와 일치) ──
    statVerify("✅ AI 1차 통과", passedCount, "passed"),
    statVerify("🚫 실패 (컨택 불가)", failedCount, "invalid"),
    statVerify("📦 보관", archivedCount, "archived"),
  ].join("");

  els.stats.querySelectorAll("[data-stat-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetView = button.dataset.statView;
      state.view = targetView;
      if (["leads", "worked", "favorites"].includes(targetView)) {
        resetAllFilters();
      }
      state.selectedId = getFilteredLeads()[0]?.id || state.selectedId;
      render();
    });
  });

  // 검증 stat 카드 클릭 → leads 뷰 + 검증 필터 적용
  els.stats.querySelectorAll("[data-verify-bucket]").forEach((button) => {
    button.addEventListener("click", () => {
      const bucket = button.dataset.verifyBucket;
      state.view = "leads";
      // 다른 필터는 초기화 (분류 뷰처럼 동작)
      resetAllFilters();
      state.verify = bucket;
      if (els.verify) els.verify.value = bucket;
      state.selectedId = getFilteredLeads()[0]?.id || state.selectedId;
      render();
    });
  });
}

function renderPipeline() {
  if (!els.pipeline) return;
  const leads = getLeads();
  const HIDDEN_PIPELINE_STATUSES = ["New", "Qualified", "Contacted", "Sample Sent", "Negotiating", "Won", "Lost"];
  els.pipeline.innerHTML = STATUSES
    .filter((status) => !HIDDEN_PIPELINE_STATUSES.includes(status))
    .map((status) => {
      const count = leads.filter((lead) => lead.status === status).length;
      const active = state.view === "leads" && state.status === status ? "active" : "";
      return `
        <button class="pipeline-pill ${active}" data-pipeline-status="${escapeAttr(status)}" type="button">
          <span>${escapeHtml(status)}</span>
          <strong>${count}</strong>
        </button>
      `;
    }).join("");

  els.pipeline.querySelectorAll("[data-pipeline-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = "leads";
      state.status = button.dataset.pipelineStatus;
      if (els.status) els.status.value = state.status;   // 숨겨져 있을 수 있다
      state.selectedId = getFilteredLeads()[0]?.id || state.selectedId;
      render();
    });
  });
}

// stage 배너 (파이프라인 페이지 상단에 표시)
// 검증대기/검증완료 stage 에서 실행 대상 카운트 계산
// 클라이언트 티어 판정 (server-side lead-tier.ts 와 동일 로직)
var MAJOR_RETAILERS_CLIENT = [
  'sephora','ulta','walmart','target','costco','amazon',
  'boots','superdrug','watsons','as watson','mannings',
  'douglas','nocibe','marionnaud','kruidvat',
  'dm-drogerie','dm drogerie','rossmann','muller','müller',
  'etos','trekpleister','ici paris','iciparisxl',
  'harrods','selfridges','liberty','harvey nichols',
  'el corte ingles','el corte inglés',
  'galeries lafayette','printemps','kadewe',
  'la rinascente','la redoute',
  'shinsegae','lotte','olive young','chicor','aritaum','hyundai department',
  'nykaa','purplle','tira','reliance','shoppers stop',
  'sociolla','cosrx','watson','guardian',
  'matsumotokiyoshi','matsukiyo','welcia',
  'ainz','tsuruha','sundrug','tokyu hands','loft',
  'faces','sephora middle east','gulf',
  'asos','cult beauty','lookfantastic','feelunique',
  'beauty bay','mecca','adore beauty',
  'yesstyle','stylekorean','jolse','stylevana',
  'falabella','liverpool','palacio de hierro',
  'beauty distributor','beauty wholesaler','cosmetics distributor',
];
function getClientLeadTier(lead) {
  const email = (lead.Email || '').trim();
  const hasEmail = email && !/^Not found/i.test(email) && /@/.test(email);
  if (!hasEmail) return 'C';
  const site = (lead.WebsiteContact || '').trim();
  const hasSite = site && (/^https?:\/\/|^www\.|\.(com|net|org|co|io|kr|jp|de|fr|uk|es|it|ru|au|nl|pl|tr|sa|ae|hk|sg|my|vn|th|id|ph|in|br|mx|ar|ca)($|\/)/i.test(site));
  if (!hasSite) return 'C';
  const c = (lead.Company || '').toLowerCase();
  const w = site.toLowerCase();
  const isMajor = MAJOR_RETAILERS_CLIENT.some(kw => c.includes(kw) || w.includes(kw));
  return isMajor ? 'A' : 'B';
}

function computeVerificationCounts(stage) {
  const isKorean = (c) => /korea|한국|대한민국/i.test(c || '') && !/north/i.test(c || '');
  const inStage = baseLeads.filter((l) => (l.stage || 'imported') === stage && !l.deleted && !isKorean(l.Region));
  const aiPending = inStage.filter((l) => !l.verification?.aiVerifiedAt).length;
  const noEmailWithSite = inStage.filter((l) =>
    (!l.Email || String(l.Email).trim() === '') &&
    l.WebsiteContact && String(l.WebsiteContact).trim() !== ''
  );
  const crawlPending = noEmailWithSite.filter((l) => !l.crawledAt).length;
  const crawlTriedNoResult = noEmailWithSite.filter((l) => !!l.crawledAt).length;
  return { aiPending, crawlPending, crawlTriedNoResult };
}

function renderStageBanner(stageInfo, totalCount, filteredCount) {
  const style = STAGE_STYLE[stageInfo.stage] || STAGE_STYLE.imported;
  const iconMatch = stageInfo.title.match(/^([^\s]+)/);
  const icon = iconMatch ? iconMatch[1] : '📊';
  // ── 숫자는 서버 집계를 쓴다 ──
  //
  // 여기 들어오는 totalCount/filteredCount 는 브라우저가 들고 있는 배열
  // (baseLeads)에서 센 값이다. 그런데 검증 완료·답장 받음 같은 화면은 목록을
  // 서버에서 페이지로 받아오므로 그 배열이 비어 있거나 일부만 차 있다.
  // 그래서 실제로는 541곳인데 배너에 68건이 떴다 — 사이드바 배지와도 어긋나
  // 어느 쪽이 맞는지 알 수 없었다.
  //
  // 사이드바 배지와 같은 곳(stage-counts)을 쓰면 두 숫자가 늘 같다.
  // 집계가 아직 안 왔으면 숫자를 아예 안 보여준다 — 틀린 수보다 없는 편이 낫다.
  const serverN = _stageCountsCache?.stages?.[stageInfo.stage];
  const showN = typeof serverN === 'number' ? serverN : null;
  const filterHint = (showN !== null && filteredCount !== showN && filteredCount > 0)
    ? `<span style="color:var(--text-tertiary);font-size:12px;margin-left:8px">(화면에 ${filteredCount}건 표시 중)</span>`
    : '';
  const container = document.getElementById('stageBannerContainer') || (() => {
    const wrap = document.createElement('div');
    wrap.id = 'stageBannerContainer';
    const content = document.getElementById('content');
    content.parentNode.insertBefore(wrap, document.getElementById("toolbarSection") || content);
    return wrap;
  })();

  // 검증대기 / 검증완료 stage 는 히어로 CTA 카드 추가 렌더
  let heroCard = '';
  if (stageInfo.stage === 'verifying') {
    // [🧠 AI 검증 실행] 버튼은 뺐다.
    //
    // 누를 때마다 대기 건수만큼 Claude API 가 호출되어 요금이 나가는 버튼이라,
    // 수백 건이 쌓인 화면에서 무심코 누르면 비용이 한 번에 터진다.
    // 기업 분석이 필요하면 개발자 쪽에서 일괄로 돌려 결과만 DB 에 넣는다.
    //
    // 되살리려면: 아래 heroCard 를 지우고 git 이력의 카드 마크업을 복원하면 된다.
    // 핸들러(runAiVerifyOnVerifyingBtn)와 API(/api/leads/verify-ai)는 그대로 있다.
    heroCard = '';
  } else if (stageInfo.stage === '__failed') {
    // 검증 실패 페이지 — archived + not-fit 리드
    const failedCount = baseLeads.filter(l =>
      !l.deleted &&
      (l.stage || 'imported') === 'archived' &&
      l?.verification?.aiVerdict === 'not-fit'
    ).length;
    heroCard = `
      <div class="verify-hero" style="margin-top:12px">
        <div class="verify-hero-card" style="
          padding:20px;border-radius:16px;
          background:linear-gradient(135deg,#fef2f2 0%,#fecaca 100%);
          border:1px solid #fca5a5;display:flex;align-items:center;gap:20px;
        ">
          <div style="font-size:40px">🚫</div>
          <div style="flex:1">
            <div style="font-size:12px;color:#991b1b;font-weight:600;letter-spacing:0.5px">검증 실패</div>
            <div style="font-size:14px;color:#7f1d1d;margin-top:2px;line-height:1.65">
              <b>${failedCount.toLocaleString()}건</b> · 메일을 보낼 수 없어 걸러진 곳입니다.<br>
              <span style="font-size:12.5px">
                대부분 <b>보낼 메일 주소가 없습니다</b> — 이메일 칸에 "Contact form on site",
                "Not found publicly" 처럼 <b>연락 방법</b>이 적혀 있거나 비어 있습니다.
                일부는 AI 가 K-뷰티와 무관하다고 본 곳입니다.<br>
                주소를 찾아 넣으면 각 행의 <b>[→ ✅ 검증완료]</b> 로 되돌릴 수 있습니다.
                <b>[전부 정리]</b> 는 목록에서 감출 뿐이고 되살릴 수 있습니다.
              </span>
            </div>
          </div>
          <!-- '완전 삭제' 가 아니다. 목록에서 감출 뿐이고 되살릴 수 있다.
               AI 판정은 틀릴 수 있어서(실제로 규모 있는 곳이 잘못 걸러진 적이 있다)
               한 번 지우면 되돌릴 방법이 없는 쪽으로 두면 안 된다.
               건수는 서버에서 다시 세므로 여기 숫자는 안내용이다. -->
          <button id="deleteAllFailedHeroBtn" type="button"
            title="목록에서 치웁니다 — 완전히 지우는 것이 아니라 되살릴 수 있습니다"
            style="
            font-size:13px;font-weight:700;padding:12px 20px;white-space:nowrap;
            background:#fff;color:#b91c1c;border:1px solid #fca5a5;border-radius:10px;cursor:pointer;
          ">
            🗑 전부 정리
          </button>
        </div>
      </div>
    `;
  } else if (stageInfo.stage === 'verified' && (state.verifiedResultTab || 'success') !== 'failed') {
    // 검증 완료 = "승인하면 바로 나가는" 자리. 카드 하나로 끝낸다.
    //
    // 예전에는 여기에 (1) 메일 크롤링 카드 (2) A/B 등급 원클릭 발송 카드가 같이 떴다.
    // 등급을 나눈 건 "많으니 좋은 것부터 보내자"는 뜻이었는데, 어차피 전부 눈으로
    // 확인하고 보내므로 "B등급은 봐야 하나 말아야 하나" 하는 고민만 늘었다.
    // 크롤링은 쓰지 않기로 해서 같이 뺐다.
    // (getClientLeadTier / sendAllTierABtn 핸들러는 그대로 살아 있어 되살리기 쉽다.)
    const emailOk = (l) =>
      !l.deleted && (l.stage || 'imported') === 'verified' &&
      l.Email && !/^Not found/i.test(l.Email) && /@/.test(l.Email);
    // baseLeads 에 기대면 안 된다. 사이드바에서 검증 완료로 바로 들어오면
    // 그 배열이 비어 있어서 "발송 가능 0건" 으로 뜨고 버튼까지 죽는다
    // (발송 관리 화면이 통째로 비어 보이던 것과 같은 원인).
    // 서버 집계를 우선 쓰고, 없을 때만 로컬 배열로 떨어진다.
    const localReady = baseLeads.filter(emailOk).length;
    const serverVerified = _stageCountsCache?.stages?.verified;
    // 2차 검토 대상은 **메일 주소가 있는 곳**이다 (검토 화면 진행바와 같은 기준).
    // 전체 검증 완료 수(541)를 그대로 쓰면 검토를 누르는 순간 '0 / 317' 로 바뀌어 헷갈린다.
    const serverNoEmail = _stageCountsCache?.verifiedSub?.noEmail;
    const serverHidden = _stageCountsCache?.verifiedSub?.hidden || 0;
    const serverReviewNeeded = _stageCountsCache?.verifiedSub?.reviewNeeded;
    const emailReadyCount = typeof serverReviewNeeded === 'number'
      ? serverReviewNeeded
      : (typeof serverVerified === 'number' && serverVerified > localReady)
        ? Math.max(0, serverVerified - (typeof serverNoEmail === 'number' ? serverNoEmail : 0))
        : localReady;
    // "승인 완료 / 검토 남음" 은 readyForOutreach 로 세던 값이라 늘 전체와 같았다.
    // 지금 의미 있는 수는 "발송 리스트로 옮긴 곳"뿐이라 그것만 쓴다.
    const queuedCount = (_stageCountsCache?.stages?.queued) || 0;

    // 아직 안 고른 곳 — 직접 검토가 할 일이 남아 있는지
    // [발송 관리]로 옮긴 곳은 stage 가 queued 로 바뀌어 emailReadyCount 에서 이미 빠져 있다.
    // 여기서 queuedCount 를 또 빼면 옮긴 수만큼 두 번 줄어든다 (예전: 371 인데 367 로 떴다).
    const notPicked = emailReadyCount;

    // 두 가지를 한 줄에 나란히 두지 않는다.
    //
    // [직접 검토]와 [메일 보내기]는 같은 크기의 선택지가 아니다.
    // 검토는 **매일 하는 일**이고, 발송은 검토가 끝난 뒤 한 번 누르는 일이다.
    // 나란히 두면 둘 중 뭘 먼저 해야 하는지가 화면에 안 나타나고,
    // 검토를 건너뛰고 바로 보내버리는 일이 생긴다 (보낸 건 되돌릴 수 없다).
    //
    // 그래서 검토를 큰 카드로 위에 두고, 발송은 그 아래 한 줄로 내렸다.
    heroCard = `
      <!-- ⓪ 업체 정보 요청 — 평소엔 한 줄로 접혀 있다.
           펼친 채로 두면 오늘 할 일인 [2차 검토] 카드가 아래로 밀려난다. -->
      ${infoReqCardHtml()}

      <div class="verify-hero" style="margin-top:12px">

        <!-- ① 오늘 할 일 — 직접 검토 -->
        <div style="padding:26px 30px;border-radius:18px;position:relative;overflow:hidden;
                    background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);
                    border:1px solid #93c5fd;box-shadow:0 4px 20px rgba(37,99,235,.13)">
          <div style="display:flex;align-items:center;gap:26px;flex-wrap:wrap">
            <div style="width:72px;height:72px;flex:none;border-radius:20px;display:flex;
                        align-items:center;justify-content:center;font-size:36px;
                        background:#fff;box-shadow:0 2px 10px rgba(37,99,235,.18)">🔎</div>

            <div style="flex:1;min-width:230px">
              <div style="font-size:11.5px;font-weight:800;color:#2563eb;letter-spacing:.06em;
                          text-transform:uppercase">오늘 할 일</div>
              <h2 style="margin:3px 0 0;font-size:27px;font-weight:800;color:#0f2d6b;line-height:1.15">
                2차 검토
              </h2>
              <!-- "아직 안 고른 곳" 으로는 왜 또 봐야 하는지가 안 드러난다.
                   AI 가 1차로 걸러낸 뒤 사람이 한 번 더 본다는 것이 이 화면의 뜻이다. -->
              <p style="font-size:13px;color:#1e40af;margin:7px 0 0;line-height:1.6">
                <b>AI 1차 검토가 끝났습니다.</b> 2차 검토를 통해 실제로 보낼 업체를 선정해 주세요.<br>
                한 회사씩 큰 화면으로 보면서 버튼 하나만 누르면 다음 회사로 넘어갑니다.
              </p>
            </div>

            <div style="display:flex;align-items:center;gap:26px;flex-wrap:wrap">
              <div>
                <div style="font-size:44px;font-weight:800;color:#1d4ed8;line-height:1">
                  ${notPicked.toLocaleString()}</div>
                <div style="font-size:12px;font-weight:700;color:#1e40af;margin-top:2px">2차 검토 필요</div>
                <!-- 아래 탭은 '검증 성공 540', 여기는 316 이라 줄어든 것처럼 보였다.
                     2차 검토는 메일 주소가 있는 곳만 대상이라 두 숫자가 다르다 — 그 관계를 같이 적는다. -->
                ${typeof serverVerified === 'number' && typeof serverNoEmail === 'number' && serverNoEmail > 0 ? `
                <div style="font-size:11px;color:#3b82f6;margin-top:3px;line-height:1.5"
                     title="메일 주소 대신 문의폼·인스타 DM 등으로만 연락되는 곳은 메일을 보낼 수 없어 2차 검토에서 뺍니다. 목록 위 [📭 이메일 없음] 칩에서 볼 수 있습니다.">
                  검증 성공 <b>${serverVerified.toLocaleString()}</b>곳 중 메일 주소가 있는 곳<br>
                  <span style="color:#64748b">(메일 주소 없음 ${serverNoEmail.toLocaleString()}곳${serverHidden ? ` · 중복 ${serverHidden.toLocaleString()}곳` : ''} 제외)</span>
                </div>` : ''}
              </div>
              <div style="width:1px;height:46px;background:#93c5fd"></div>
              <div>
                <div style="font-size:26px;font-weight:800;color:#1e3a8a;line-height:1">
                  ${queuedCount.toLocaleString()}</div>
                <div style="font-size:12px;font-weight:600;color:#3b82f6;margin-top:2px">보낼 곳으로 선정</div>
              </div>
            </div>

            <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:7px">
              <button id="startReviewBtn" type="button"
                title="한 회사씩 카드로 보며 보낼 곳인지 아닌지만 고릅니다"
                style="font-size:16px;font-weight:800;padding:17px 34px;white-space:nowrap;
                       background:#2563eb;color:#fff;border:none;border-radius:13px;cursor:pointer;
                       box-shadow:0 4px 16px rgba(37,99,235,.36);
                       ${emailReadyCount === 0 ? 'opacity:0.4;cursor:not-allowed' : ''}"
                ${emailReadyCount === 0 ? 'disabled' : ''}>
                2차 검토 시작 →
              </button>
              <!-- 고르고 나면 "내가 뭘 골랐더라" 를 볼 곳이 필요하다 -->
              <button id="goDecisionsBtn" type="button"
                title="지금까지 어느 업체를 어디로 보냈는지 날짜별로 봅니다"
                style="font-size:12px;font-weight:700;padding:6px 14px;white-space:nowrap;
                       background:transparent;color:#1d4ed8;border:none;cursor:pointer;
                       text-decoration:underline">🗂 지금까지 고른 결과 보기</button>
            </div>
          </div>
        </div>

        <!-- ② 검토가 끝난 뒤 넘어가는 자리.
             이 버튼은 **메일을 보내지 않는다** — [발송 관리] 화면으로 옮겨갈 뿐이다.
             그런데 글자가 "메일 보내기" 였어서, 누르면 바로 나가는 줄 알고
             못 누르는 일이 생겼다. 버튼 글자는 실제로 일어나는 일을 적는다. -->
        <div style="margin-top:9px;padding:13px 18px;border-radius:12px;display:flex;
                    align-items:center;gap:14px;flex-wrap:wrap;
                    background:var(--bg-surface);border:1px solid var(--border-default)">
          <span style="font-size:19px">📨</span>
          <div style="flex:1;min-width:240px">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">
              발송 관리로 이동
            </div>
            <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px;line-height:1.6">
              리스트에 있는 모든 업체를 <b>점검 완료한 뒤</b> 이 버튼을 누르면 발송 관리로 이동합니다.
              <span style="color:var(--text-quaternary)">누른다고 메일이 나가지 않습니다 — 화면만 옮겨갑니다.</span>
              ${queuedCount
                ? `<br>지금 발송 관리에 <b style="color:var(--text-secondary)">${queuedCount.toLocaleString()}곳</b>이 있습니다.`
                : '<br>아직 발송 관리에 옮긴 곳이 없습니다. 위에서 보낼 곳을 먼저 골라 주세요.'}
            </div>
          </div>
          <button id="openFirstSendBtn" type="button"
            title="메일을 보내지 않습니다. [발송 관리 → 보낼 메일] 화면으로 이동만 합니다."
            style="font-size:13px;font-weight:700;padding:9px 18px;white-space:nowrap;
                   background:var(--bg-surface);color:#1d4ed8;border:1px solid #2563eb;
                   border-radius:9px;cursor:pointer;
                   ${emailReadyCount === 0 ? 'opacity:0.4;cursor:not-allowed' : ''}"
            ${emailReadyCount === 0 ? 'disabled' : ''}>
            발송 관리 →
          </button>
        </div>
      </div>
    `;
  }

  // 단계 배너(아이콘 + 건수 + 설명)는 뺐다.
  //
  // 같은 내용이 이미 세 곳에 있다 — 사이드바 배지, 화면 제목, 그 아래 부제.
  // 게다가 건수는 브라우저 캐시에서 세던 값이라 사이드바와 어긋났다
  // (541곳인데 68건으로 떴다). 맞는 숫자를 넣어도 같은 말을 네 번 하는 셈이고,
  // 세로 공간만 차지해 정작 아래 [직접 검토] 카드가 밀려났다.
  //
  // 히어로 카드(직접 검토 / 검증 실패 안내)는 그대로 둔다 — 그건 할 일이다.
  container.innerHTML = heroCard;

  // 액션 버튼 핸들러 바인딩
  bindInfoReqCard(container);
  document.getElementById('runAiVerifyOnVerifyingBtn')?.addEventListener('click', () => runVerifyingStageAi());
  document.getElementById('runCrawlOnVerifyingBtn')?.addEventListener('click', () => runCrawlEmails('verifying-no-email'));
  document.getElementById('runCrawlOnVerifiedBtn')?.addEventListener('click', () => runCrawlEmails('verified-no-email'));
  document.getElementById('goApproveBtn')?.addEventListener('click', () => {
    state.verifiedSubFilter = 'pending';
    resetPagination();
    render();
  });
  // 빠른 검토 진입 — 들어갈 때마다 대기열을 새로 받는다.
  // 이전에 보던 큐가 남아 있으면 이미 판단한 회사가 다시 뜬다.
  document.getElementById('startReviewBtn')?.addEventListener('click', () => startDirectReview());
  document.getElementById('goDecisionsBtn')?.addEventListener('click', () => {
    state.view = 'tool-decisions';
    render();
  });
  // 검증 완료 · 첫 발송 진입점 (verified stage · 승인된 리드 or 이메일 있는 리드 대상)
  // 발송은 한 곳(발송 화면)에서만 시작한다. 여기서 모달을 바로 띄우면
  // 같은 일을 두 자리에서 하게 되고, "보낼 메일" 목록을 건너뛰게 된다.
  // 화면 이동은 사이드바 항목을 눌러서 한다 — 진입 처리가 그 핸들러에 몰려 있다.
  document.getElementById('openFirstSendBtn')?.addEventListener('click', () => {
    _outboxTab = 'ready';
    document.querySelector('.nav-item[data-view="pipeline-contacted"]')?.click();
  });
  // 원클릭 등급별 발송 (A/B) — 발송함으로 자동 이동 · 검증 완료에서 사라짐
  document.getElementById('sendAllTierABtn')?.addEventListener('click', () => openComposeModal('tier-A'));
  document.getElementById('sendAllTierBBtn')?.addEventListener('click', () => openComposeModal('tier-B'));
  document.getElementById('deleteAllFailedHeroBtn')?.addEventListener('click', () => deleteAllFailedLeads());
  document.getElementById('openBulkComposeBtn')?.addEventListener('click', () => openComposeModal('bulk-contacted'));
  document.getElementById('openBulkScheduleBtn')?.addEventListener('click', () => {
    _composeState.useSchedule = true;
    _composeState.scheduleAt = defaultScheduleTime();
    openComposeModal('bulk-contacted');
  });
  document.getElementById('openTemplateEditorBtn')?.addEventListener('click', () => {
    state.email.mode = 'list';   // 늘 목록부터 — 전에 편집하던 양식이 열리면 안 된다
    state.view = 'tool-b2b-email';
    render();
  });
}

// ── AI 1차 검증 (verifying stage 파이프라인) ─────────────────
async function runVerifyingStageAi() {
  const btn = document.getElementById('runAiVerifyOnVerifyingBtn');
  const ok = confirm(
    '🧠 검증 대기 파이프라인 AI 1차 검증\n\n' +
    '조건: stage=검증대기 + AI 미검증 + 한국 기업 제외\n' +
    '진행: 청크당 20건씩 순차 처리 (예상 대상 4,000+ 건)\n' +
    '결과: target-fit → 검증완료로 자동 이동 / not-fit → 보관함\n' +
    '비용: 약 $2 (Claude Haiku 4.5)\n\n' +
    '계속하시겠습니까?'
  );
  if (!ok) return;

  if (btn) { btn.disabled = true; btn.textContent = '🧠 AI 검증 중...'; }

  let totalProcessed = 0;
  let totalMoved = { verified: 0, archived: 0, kept: 0 };
  let iterations = 0;

  try {
    while (iterations < 250) {  // 안전장치 최대 250 chunk (=5000건)
      const res = await fetch('/api/leads/verify-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'verifying-stage',
          limit: 20,
          excludeKorea: true,
          autoMoveStage: true,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'AI 검증 실패');

      totalProcessed += data.processed || 0;
      if (data.stageMoves) {
        totalMoved.verified += data.stageMoves.verified || 0;
        totalMoved.archived += data.stageMoves.archived || 0;
        totalMoved.kept += data.stageMoves.kept || 0;
      }
      iterations++;

      if (btn) btn.textContent = `🧠 ${totalProcessed}건 완료 (남은: ${data.remaining || 0})`;

      if (!data.hasMore) break;
      // API 부하 완화 — 짧게 쉬기
      await new Promise(r => setTimeout(r, 300));
    }

    alert(
      `✅ AI 검증 완료\n\n` +
      `총 처리: ${totalProcessed}건\n` +
      `→ 검증완료: ${totalMoved.verified}건\n` +
      `→ 보관함: ${totalMoved.archived}건\n` +
      `→ 대기 유지 (모호): ${totalMoved.kept}건`
    );
    invalidateServerPage();
    await loadLeads({ force: true });
    render();
  } catch (e) {
    alert(`❌ AI 검증 실패: ${e.message || 'unknown'}\n\n지금까지 처리: ${totalProcessed}건`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🧠 AI 1차 검증 실행'; }
  }
}

// ── 메일 크롤링 ─────────────────────────────────────
async function runCrawlEmails(scope) {
  const label = scope === 'verified-no-email' ? '검증 완료' : '검증 대기';
  const ok = confirm(
    `🔍 ${label} 리드 메일 크롤링\n\n` +
    `조건: stage=${label} + Email 비어있음 + 사이트 있음 + 한국 제외\n` +
    `진행: 청크당 50건씩, 사이트당 홈+/contact+/about 순회\n` +
    `결과: 최우선 후보 자동으로 Email 필드에 채움\n\n` +
    `계속하시겠습니까?`
  );
  if (!ok) return;

  const btnId = scope === 'verified-no-email' ? 'runCrawlOnVerifiedBtn' : 'runCrawlOnVerifyingBtn';
  const btn = document.getElementById(btnId);
  const origText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '🔍 크롤링 중...'; }

  let totalProcessed = 0;
  let totalFound = 0;
  let totalPromoted = 0;
  let iterations = 0;

  try {
    while (iterations < 40) {  // 40*50 = 2000건 상한
      const res = await fetch('/api/leads/crawl-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          limit: 50,
          excludeKorea: true,
          promoteToEmail: true,
          skipAlreadyCrawled: true,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '크롤링 실패');

      totalProcessed += data.processed || 0;
      totalFound += data.foundCount || 0;
      totalPromoted += data.promotedCount || 0;
      iterations++;

      if (btn) btn.textContent = `🔍 ${totalProcessed}건 처리 (메일 ${totalFound}건 발견)`;

      // 처리 건수 0 이면 대상 소진
      if (!data.processed) break;
      await new Promise(r => setTimeout(r, 500));
    }

    alert(
      `✅ 메일 크롤링 완료\n\n` +
      `총 처리: ${totalProcessed}건\n` +
      `메일 발견: ${totalFound}건\n` +
      `Email 필드 자동 승격: ${totalPromoted}건`
    );
    invalidateServerPage();
    await loadLeads({ force: true });
    render();
  } catch (e) {
    alert(`❌ 크롤링 실패: ${e.message || 'unknown'}\n\n지금까지 처리: ${totalProcessed}건`);
  } finally {
    if (btn) { btn.disabled = false; if (origText) btn.textContent = origText; }
  }
}

// 파이프라인/도구 페이지에서는 stage 배너로 대체하므로 stat grid 는 숨김
function clearStageBanner() {
  const c = document.getElementById('stageBannerContainer');
  if (c) c.innerHTML = '';
}

// 검증대기 페이지 서브필터 chip (AI 진행 여부로 분류)
function renderVerifyingSubFilterChips(allInStage) {
  const containerId = 'verifyingSubFilterChips';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    // stageBannerContainer 바로 아래에 삽입
    const banner = document.getElementById('stageBannerContainer');
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(container, banner.nextSibling);
    } else {
      const content = document.getElementById('content');
      content.parentNode.insertBefore(container, document.getElementById("toolbarSection") || content);
    }
  }

  // 각 필터별 카운트 (검증대기 stage 내부 3 상태만)
  const cAll = allInStage.length;
  const cUnverified = allInStage.filter(l => !l?.verification?.aiVerifiedAt).length;
  const cMaybe = allInStage.filter(l => l?.verification?.aiVerdict === 'maybe').length;

  const cur = state.verifyingSubFilter || 'unverified';
  const chip = (key, label, count, color) => {
    const active = key === cur;
    const bg = active ? color : 'var(--surface-1)';
    const fg = active ? 'white' : 'var(--text-primary)';
    const bd = active ? color : 'var(--border)';
    return `<button type="button" class="sub-filter-chip" data-sub-filter="${key}"
      style="padding:6px 12px;font-size:12px;font-weight:600;
      background:${bg};color:${fg};border:1px solid ${bd};border-radius:99px;cursor:pointer;
      display:inline-flex;align-items:center;gap:6px;transition:all 0.1s">
      ${label} <span style="opacity:0.7;font-weight:500">${count.toLocaleString()}</span>
    </button>`;
  };

  container.innerHTML = `
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <span style="font-size:11px;color:var(--text-tertiary);margin-right:4px;font-weight:600">🔎 상태별:</span>
      ${chip('unverified', '⏳ 검증 전 (기본)', cUnverified, '#f59e0b')}
      ${chip('maybe', '🧠 모호 (사람 판단)', cMaybe, '#a855f7')}
      ${chip('all', '📦 전체 검증대기', cAll, '#334155')}
    </div>
  `;

  container.querySelectorAll('.sub-filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.verifyingSubFilter = el.dataset.subFilter;
      resetPagination();
      render();
    });
  });
}
function clearVerifyingSubFilterChips() {
  const c = document.getElementById('verifyingSubFilterChips');
  if (c && c.parentNode) c.parentNode.removeChild(c);
}

// 검증완료 페이지 서브필터 chip + 벌크 승인 버튼
function renderVerifiedSubFilterChips(allInStage) {
  const containerId = 'verifiedSubFilterChips';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    const banner = document.getElementById('stageBannerContainer');
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(container, banner.nextSibling);
    } else {
      const content = document.getElementById('content');
      content.parentNode.insertBefore(container, document.getElementById("toolbarSection") || content);
    }
  }

  const isKor = (c) => /korea|한국|대한민국/i.test(c || '') && !/north/i.test(c || '');
  const hasRealEmail = (l) => l.Email && String(l.Email).trim() && !/^Not found/i.test(l.Email);

  // 한국 제외한 실질 대상 기준
  const nonKr = allInStage.filter(l => !isKor(l.Region || ''));
  const cAll = nonKr.length;
  const cApproved = nonKr.filter(l => l.readyForOutreach === true).length;
  const cPending = nonKr.filter(l => l.readyForOutreach !== true && hasRealEmail(l)).length;
  const cNoEmail = nonKr.filter(l => !hasRealEmail(l)).length;

  const cur = state.verifiedSubFilter || 'all';
  const chip = (key, label, count, color) => {
    const active = key === cur;
    const bg = active ? color : 'var(--surface-1)';
    const fg = active ? 'white' : 'var(--text-primary)';
    const bd = active ? color : 'var(--border)';
    return `<button type="button" class="v-sub-filter-chip" data-sub-filter="${key}"
      style="padding:6px 12px;font-size:12px;font-weight:600;
      background:${bg};color:${fg};border:1px solid ${bd};border-radius:99px;cursor:pointer;
      display:inline-flex;align-items:center;gap:6px;transition:all 0.1s">
      ${label} <span style="opacity:0.7;font-weight:500">${count.toLocaleString()}</span>
    </button>`;
  };

  container.innerHTML = `
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <!-- readyForOutreach 기준 승인 칩·버튼은 뺐다. 그 플래그는 검증 완료
             전 건에 켜져 있어 "승인됨" 이 늘 전체와 같은 수로 떴고, 실제로 보낼
             목록(발송 리스트)과는 무관했다. 승인은 이제 발송 리스트로 옮기는
             것 하나뿐이다. (bulkApproveVisible / runDryRunSimulation 은 그대로
             살아 있어 되살리기 쉽다.) -->
        ${chip('all', '아직 안 옮김', cAll, '#334155')}
        ${chip('no-email', '📭 이메일 없음', cNoEmail, '#94a3b8')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11px;color:var(--text-tertiary)">
          보낼 곳을 체크해서 <b>[📨 발송 관리로 이동]</b>
        </span>
      </div>
    </div>
  `;

  container.querySelectorAll('.v-sub-filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.verifiedSubFilter = el.dataset.subFilter;
      resetPagination();
      render();
    });
  });
}
function clearVerifiedSubFilterChips() {
  const c = document.getElementById('verifiedSubFilterChips');
  if (c && c.parentNode) c.parentNode.removeChild(c);
}

// 검증완료 상단 성공/실패 대형 탭 (한 페이지 안에서 결과 분류)
function renderVerifiedResultTabs(successCount, failedCount) {
  const containerId = 'verifiedResultTabs';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    const banner = document.getElementById('stageBannerContainer');
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(container, banner.nextSibling);
    } else {
      const content = document.getElementById('content');
      content.parentNode.insertBefore(container, document.getElementById("toolbarSection") || content);
    }
  }
  const cur = state.verifiedResultTab || 'success';
  const tab = (key, label, count, activeColor, activeBg) => {
    const active = key === cur;
    return `<button type="button" class="v-result-tab" data-tab="${key}"
      style="flex:1;padding:14px 18px;font-size:14px;font-weight:${active ? '700' : '500'};
      background:${active ? activeBg : '#f1f5f9'};
      color:${active ? activeColor : '#475569'};
      border:none;border-bottom:3px solid ${active ? activeColor : 'transparent'};
      cursor:pointer;transition:all 0.15s;
      display:flex;align-items:center;justify-content:center;gap:8px">
      <span>${label}</span>
      <span style="padding:2px 8px;background:${active ? activeColor : '#e2e8f0'};color:${active ? 'white' : '#64748b'};border-radius:99px;font-size:11px;font-weight:700">${(count || 0).toLocaleString()}</span>
    </button>`;
  };
  container.innerHTML = `
    <div style="margin-top:12px;display:flex;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden">
      ${tab('success', '✅ 검증 성공', successCount, '#15803d', '#dcfce7')}
      ${tab('failed',  '🚫 검증 실패', failedCount,  '#dc2626', '#fef2f2')}
    </div>
  `;
  container.querySelectorAll('.v-result-tab').forEach(el => {
    el.addEventListener('click', () => {
      state.verifiedResultTab = el.dataset.tab;
      // 서브필터/페이지 리셋
      state.verifiedSubFilter = 'all';
      resetPagination();
      // 캐시 무효화 (다른 stage 페이지드)
      _serverPageCache = null;
      render();
    });
  });
}
function clearVerifiedResultTabs() {
  const c = document.getElementById('verifiedResultTabs');
  if (c && c.parentNode) c.parentNode.removeChild(c);
}

// ── 검증완료 A/B/C 등급 breakdown ────────────────────
var _tierCountsCache = null;
async function loadTierCounts(force) {
  const now = Date.now();
  if (!force && _tierCountsCache && (now - _tierCountsCache.ts) < 60 * 1000) {
    return _tierCountsCache;
  }
  try {
    const res = await fetch('/api/leads/tier-counts');
    const data = await res.json();
    if (data.success) {
      _tierCountsCache = { ...data, ts: now };
      return _tierCountsCache;
    }
  } catch (e) { console.error('tier-counts', e); }
  return null;
}

async function renderVerifiedTierChips() {
  // 캐시 없으면 fetch — 그동안 아무것도 렌더 안 함 (다른 탭 이동시 잔상 방지)
  const c = await loadTierCounts();
  if (!c) return;
  // 렌더 시점에도 verified 성공 탭 유지 중인지 확인 (fetch 중 사용자가 탭 변경했을 수 있음)
  if (state.view !== 'pipeline-verified' || (state.verifiedResultTab && state.verifiedResultTab !== 'success')) {
    return;
  }
  const containerId = 'verifiedTierChips';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    const subChips = document.getElementById('verifiedSubFilterChips');
    if (subChips && subChips.parentNode) {
      subChips.parentNode.insertBefore(container, subChips.nextSibling);
    } else {
      const banner = document.getElementById('stageBannerContainer');
      if (banner && banner.parentNode) banner.parentNode.insertBefore(container, banner.nextSibling);
    }
  }
  const cur = state.tierFilter || null;
  const tierCard = (key, label, count, sub, color, bg, bd) => {
    const active = cur === key;
    return `
      <div class="tier-card" data-tier="${key}"
        style="flex:1;padding:12px 14px;background:${active ? color : bg};
               border:2px solid ${active ? color : bd};border-radius:12px;
               display:flex;flex-direction:column;gap:2px;min-width:0;cursor:pointer;
               transition:all 0.15s;box-shadow:${active ? '0 4px 12px ' + color + '55' : 'none'}">
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:20px;font-weight:800;color:${active ? 'white' : color}">${count.toLocaleString()}</span>
          <span style="font-size:12px;color:${active ? 'white' : color};font-weight:700">${label}</span>
        </div>
        <div style="font-size:10px;color:${active ? 'rgba(255,255,255,0.9)' : color};opacity:${active ? 1 : 0.75};line-height:1.3">${sub}</div>
      </div>
    `;
  };
  const cCount = c.C || 0;
  container.innerHTML = `
    <div style="margin-top:10px;padding:10px;background:var(--surface-1);border:1px solid var(--border);border-radius:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:11px;color:var(--text-secondary);font-weight:700">
          📊 등급 클릭해서 필터 · 총 ${c.total.toLocaleString()}건
        </div>
        ${cur ? `<button type="button" id="clearTierBtn" style="font-size:11px;padding:3px 10px;background:var(--surface-2);color:var(--text-secondary);border:1px solid var(--border);border-radius:99px;cursor:pointer">✕ 전체 보기</button>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${tierCard('A', '🥇 A급', c.A, '이메일 + 사이트 + 대형 리테일러', '#a16207', '#fef9c3', '#fde047')}
        ${tierCard('B', '🥈 B급', c.B, '이메일 + 사이트 있음', '#1e40af', '#dbeafe', '#93c5fd')}
        ${cCount > 0 ? tierCard('C', '🥉 C급', cCount, '이메일/사이트 부족', '#57534e', '#f5f5f4', '#d6d3d1') : ''}
      </div>
    </div>
  `;
  container.querySelectorAll('.tier-card').forEach(el => {
    el.addEventListener('click', () => {
      const t = el.dataset.tier;
      state.tierFilter = (state.tierFilter === t) ? null : t;
      resetPagination();
      _serverPageCache = null;
      render();
    });
  });
  const clearBtn = document.getElementById('clearTierBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    state.tierFilter = null;
    resetPagination();
    _serverPageCache = null;
    render();
  });
}

function clearVerifiedTierChips() {
  const c = document.getElementById('verifiedTierChips');
  if (c && c.parentNode) c.parentNode.removeChild(c);
}

// 검증완료 서브필터 chip — 서버 카운트 기반 (전체 리드 fetch 없이)
function renderVerifiedSubFilterChipsServer(verifiedSub, _failedCount) {
  const containerId = 'verifiedSubFilterChips';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    const banner = document.getElementById('stageBannerContainer');
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(container, banner.nextSibling);
    } else {
      const content = document.getElementById('content');
      content.parentNode.insertBefore(container, document.getElementById("toolbarSection") || content);
    }
  }
  const cur = state.verifiedSubFilter || 'all';
  const chip = (key, label, count, color) => {
    const active = key === cur;
    const bg = active ? color : 'var(--surface-1)';
    const fg = active ? 'white' : 'var(--text-primary)';
    const bd = active ? color : 'var(--border)';
    return `<button type="button" class="v-sub-filter-chip" data-sub-filter="${key}"
      style="padding:6px 12px;font-size:12px;font-weight:600;
      background:${bg};color:${fg};border:1px solid ${bd};border-radius:99px;cursor:pointer;
      display:inline-flex;align-items:center;gap:6px;transition:all 0.1s">
      ${label} <span style="opacity:0.7;font-weight:500">${(count || 0).toLocaleString()}</span>
    </button>`;
  };
  // ── 승인 상태 줄 ──
  //
  // 예전에는 readyForOutreach 기준으로 "승인됨 409 · 승인 대기 0" 이 떴다.
  // 그 플래그는 검증 완료 전 건에 켜져 있어 항상 전체와 같은 수가 나왔고,
  // 정작 실제로 보낼 목록(발송 리스트, queued)과는 아무 상관이 없었다.
  // 지금 승인은 "발송 리스트로 옮겼는가" 하나뿐이라 그것만 보여준다.
  const queuedN = verifiedSub.queued || 0;
  container.innerHTML = `
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${chip('all', '아직 안 옮김', verifiedSub.all, '#334155')}
      ${chip('no-email', '📭 이메일 없음', verifiedSub.noEmail, '#94a3b8')}
      <button type="button" id="goSendListBtn"
        title="발송 관리로 옮긴 곳을 봅니다 (발송 관리 → 보낼 메일)"
        style="padding:6px 12px;font-size:12px;font-weight:700;border-radius:99px;cursor:pointer;
               display:inline-flex;align-items:center;gap:6px;
               background:${queuedN ? '#e0f2fe' : 'var(--surface-1)'};
               color:${queuedN ? '#075985' : 'var(--text-tertiary)'};
               border:1px solid ${queuedN ? '#7dd3fc' : 'var(--border)'}">
        📨 발송 관리 <span style="opacity:.75;font-weight:600">${queuedN.toLocaleString()}</span> →
      </button>
      <span style="font-size:11px;color:var(--text-tertiary)">
        보낼 곳을 체크해서 <b>[📨 발송 관리로 이동]</b> 을 누르면 그쪽으로 넘어갑니다
      </span>
    </div>
  `;
  container.querySelectorAll('.v-sub-filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.verifiedSubFilter = el.dataset.subFilter;
      resetPagination();
      render();
    });
  });
  container.querySelector('#goSendListBtn')?.addEventListener('click', () => {
    _outboxTab = 'ready';
    document.querySelector('.nav-item[data-view="pipeline-contacted"]')?.click();
  });
}

// 서버 페이지드 테이블 렌더러 (verified/failed 전용)
function renderServerPagedTable(pageData, stageInfo) {
  const leads = pageData.leads;
  if (!leads.length) {
    els.content.innerHTML = emptyState(`${stageInfo.title}에 해당하는 리드가 없습니다.`);
    return;
  }
  const start = (pageData.page - 1) * 50 + 1;
  const end = start + leads.length - 1;
  const visibleIds = leads.map(l => l.id);
  const selectedVisibleCount = visibleIds.filter(id => state.selectedLeadIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  els.content.innerHTML = `
    <!-- 페이지 넘김을 맨 위로 — 위쪽 안내가 길어 2페이지를 보려면 한참 내려가야 했다 -->
    ${renderPaginationBar(pageData.page, pageData.totalPages, pageData.total, { compact: true })}
    <div class="bulk-actions">
      <button class="button secondary" data-select-visible type="button">${allVisibleSelected ? "이 페이지 선택 해제" : "이 페이지 전체 선택"}</button>
      <!-- ⚠️ 이 두 버튼이 여기 없었다.
           검증 완료는 목록을 서버 페이지로 받는데, 옮기기 버튼은 예전(로컬 배열)
           표에만 있었다. 그래서 행을 체크해도 **할 수 있는 일이 [Delete Selected]
           뿐**이었다 — 정작 이 화면의 본래 목적(보낼 곳 고르기)을 못 했다. -->
      <!-- [🚫 검증 실패] 탭도 내부 단계는 verified 로 들고 들어온다. 그 탭에서 [남은 전체 옮기기]를
           누르면 **성공 쪽** 업체가 발송 관리로 옮겨진다 — 실패 목록을 보는 중에는 숨긴다. -->
      ${stageInfo.stage === 'verified' && (state.verifiedResultTab || 'success') !== 'failed' ? `
        <button class="button primary" id="moveToQueueBtn" type="button" ${state.selectedLeadIds.size ? '' : 'disabled'}
          title="고른 곳을 [발송 관리 → 보낼 메일] 로 옮깁니다. 옮겨야 발송 대상이 됩니다."
          style="${state.selectedLeadIds.size ? '' : 'opacity:.45;cursor:default'}">
          📨 발송 관리로 이동 (${state.selectedLeadIds.size})
        </button>
        <button class="button secondary" id="moveAllToQueueBtn" type="button"
          title="지금 검증 완료에 남아 있는 곳을 전부 발송 관리로 옮깁니다 (검색·지역로 좁혀 놨으면 그 범위만)">
          ⇢ 남은 전체 옮기기
        </button>` : ''}
      <button class="button ghost danger-action" data-delete-selected type="button" ${state.selectedLeadIds.size ? "" : "disabled"}>
        🗑 목록에서 빼기 (${state.selectedLeadIds.size})
      </button>
      <span class="list-toolbar-meta" style="margin-left:auto;font-size:12px;color:var(--text-tertiary);display:inline-flex;align-items:center;gap:10px">
        <label style="display:inline-flex;align-items:center;gap:5px">
          정렬
          <select id="leadSortSelect" style="padding:4px 8px;font-size:12px;border:1px solid var(--border-default);
                  border-radius:6px;background:var(--bg-surface);color:var(--text-primary);cursor:pointer">
            <option value="reco" ${_leadSort === 'reco' ? 'selected' : ''}>추천순</option>
            <option value="region" ${_leadSort === 'region' ? 'selected' : ''}>지역별</option>
            <option value="recent" ${_leadSort === 'recent' ? 'selected' : ''}>최근 등록순</option>
          </select>
        </label>
        <span>총 <b style="color:var(--text-primary)">${pageData.total.toLocaleString()}</b>건 중 <b style="color:var(--text-primary)">${start}~${end}</b>번 표시</span>
      </span>
    </div>
    ${_leadSort === 'region' ? `
      <div style="margin:-4px 0 10px;font-size:11.5px;color:var(--text-tertiary);line-height:1.6">
        지역별 = 같은 나라끼리 묶어서 봅니다. 한 시장을 연달아 보면 판단 기준이 덜 흔들리고,
        나라별로 메일 문구를 다르게 쓸 때도 편합니다. 같은 나라 안에서는 추천순입니다.
      </div>` : ''}
    ${_leadSort === 'reco' ? `
      <div style="margin:-4px 0 10px;font-size:11.5px;color:var(--text-tertiary);line-height:1.6">
        추천순 = <b>거래 규모</b>(유통사·체인이 위) + <b>담당자 도달</b>(b2b@·wholesale@ 이 info@ 보다 위)
        + <b>K-뷰티 실적</b>(한국 브랜드를 이미 파는 곳). 각 회사의 근거는 순위 옆에 마우스를 올리면 보입니다.
      </div>` : ''}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:34px"><span class="sr-only">선택</span></th>
            ${_leadSort === 'reco' ? '<th style="width:52px" title="발송 우선순위 — 마우스를 올리면 근거가 보입니다">순위</th>' : ''}
            <th>회사</th>
            <th style="width:110px">지역</th>
            <th style="width:230px">이메일</th>
            <th style="width:260px">웹사이트</th>
            <th style="width:120px">전화</th>
            <th style="width:170px;white-space:nowrap" title="이 회사는 아니다 싶으면 다른 단계로 옮깁니다. 지워지지 않아 언제든 되돌릴 수 있습니다">이동</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map((l, i) => rowHtml(l, _leadSort === 'reco' ? (pageData.page - 1) * 50 + i + 1 : null)).join('')}
        </tbody>
      </table>
    </div>
    ${renderPaginationBar(pageData.page, pageData.totalPages, pageData.total)}
  `;

  els.content.querySelector('#leadSortSelect')?.addEventListener('change', (e) => {
    _leadSort = e.target.value;
    state.pagination.currentPage = 1;
    invalidateServerPage();
    render();
  });
  els.content.querySelector('[data-select-visible]')?.addEventListener('click', () => {
    if (allVisibleSelected) visibleIds.forEach(id => state.selectedLeadIds.delete(id));
    else visibleIds.forEach(id => state.selectedLeadIds.add(id));
    render();
  });
  els.content.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = parseInt(btn.dataset.page, 10);
      if (isNaN(target) || target === pageData.page) return;
      state.pagination.currentPage = Math.min(Math.max(1, target), pageData.totalPages);
      render();
      els.content?.scrollTo?.({ top: 0, behavior: 'smooth' });
    });
  });
  els.content.querySelector('#pageJumpInput')?.addEventListener('change', (e) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1 && v <= pageData.totalPages) {
      state.pagination.currentPage = v;
      render();
    }
  });
}

// ── 일괄 승인/취소 (현재 필터에 보이는 리드 대상) ──────────────
async function bulkApproveVisible(approve) {
  // 현재 렌더된 verified 리드들 (state.verifiedSubFilter 반영)
  const isKor = (c) => /korea|한국|대한민국/i.test(c || '') && !/north/i.test(c || '');
  const hasRealEmail = (l) => l.Email && String(l.Email).trim() && !/^Not found/i.test(l.Email);
  let candidates = baseLeads.filter(l =>
    (l.stage || 'imported') === 'verified' && !isKor(l.Region || '')
  );
  // 승인은 이메일 있는 것만
  if (approve) candidates = candidates.filter(hasRealEmail);
  // sub-filter 반영
  const sub = state.verifiedSubFilter || 'all';
  if (sub === 'approved' && approve) {
    alert('이미 승인된 리드만 표시 중입니다. 승인 대상 없음.');
    return;
  }
  if (sub === 'approved') candidates = candidates.filter(l => l.readyForOutreach === true);
  if (sub === 'pending') candidates = candidates.filter(l => l.readyForOutreach !== true);
  if (sub === 'no-email') {
    alert('이메일 없는 리드는 승인할 수 없습니다. 먼저 크롤링을 실행하세요.');
    return;
  }
  if (!candidates.length) {
    alert('처리 대상 리드가 없습니다.');
    return;
  }

  const label = approve ? '승인' : '승인 취소';
  const ok = confirm(
    `📤 ${label} 대상: ${candidates.length}건\n\n` +
    (approve ? '이 리드들에 "발송 승인" 을 부여합니다.\n실제 메일은 발송되지 않습니다 — 승인 게이트만 통과시킵니다.\n\n' : '이 리드들의 발송 승인을 취소합니다.\n\n') +
    '계속하시겠습니까?'
  );
  if (!ok) return;

  try {
    const res = await fetch('/api/leads/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'ids',
        leadIds: candidates.map(l => l.leadId),
        approve,
        excludeKorea: true,
        requireEmail: approve,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'bulk 실패');
    // 로컬 상태 동기화
    candidates.forEach(l => { l.readyForOutreach = approve; });
    alert(
      `✅ ${label} 완료\n\n` +
      `요청: ${candidates.length}건\n` +
      `실제 반영: ${data.updated}건\n` +
      (data.skipReasons ? `스킵: 이메일없음 ${data.skipReasons.noEmail}, 한국 ${data.skipReasons.korean}, stage 불일치 ${data.skipReasons.wrongStage}` : '')
    );
    invalidateServerPage();
    await loadLeads({ force: true });
    render();
  } catch (e) {
    alert(`${label} 실패: ${e.message || 'unknown'}`);
  }
}

// ── dry-run 발송 시뮬레이션 (실제 SMTP 호출 없음) ──────────────
async function runDryRunSimulation() {
  const isKor = (c) => /korea|한국|대한민국/i.test(c || '') && !/north/i.test(c || '');
  const hasRealEmail = (l) => l.Email && String(l.Email).trim() && !/^Not found/i.test(l.Email);
  const approved = baseLeads.filter(l =>
    (l.stage || 'imported') === 'verified' &&
    l.readyForOutreach === true &&
    !isKor(l.Region || '') &&
    hasRealEmail(l)
  );

  if (!approved.length) {
    alert('검증 완료 목록이 비어있습니다. 먼저 리드를 "✅ 승인" 처리하세요.');
    return;
  }

  // 지역별/도메인별 분포 요약
  const byRegion = {};
  const domainCounts = {};
  for (const l of approved) {
    byRegion[l.Region || '(미상)'] = (byRegion[l.Region || '(미상)'] || 0) + 1;
    const dom = (l.Email || '').split('@')[1]?.toLowerCase() || '';
    if (dom) domainCounts[dom] = (domainCounts[dom] || 0) + 1;
  }
  const topCountries = Object.entries(byRegion).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const topDomains = Object.entries(domainCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);

  const sample = approved.slice(0, 5).map(l =>
    `  · ${l.Company} (${l.Region}) → ${l.Email}`
  ).join('\n');

  const msg =
    `🧪 dry-run 발송 시뮬레이션 (실제 발송 없음)\n\n` +
    `총 대기열: ${approved.length}건\n\n` +
    `📍 지역 top 8:\n${topCountries.map(([k,v])=>`  · ${k}: ${v}건`).join('\n')}\n\n` +
    `📮 도메인 top 8:\n${topDomains.map(([k,v])=>`  · ${k}: ${v}건`).join('\n')}\n\n` +
    `첫 5건 미리보기:\n${sample}\n\n` +
    `※ 실제 발송하려면 다음 세션에서 B(실제 SMTP 발송) 구현 필요.\n` +
    `※ .env.local 에 SMTP_USER / SMTP_PASS 설정 필요.`;
  alert(msg);
}

// ── 파이프라인 자동 리로드 (verifying/verified 탭에서 배치 진행 실시간 반영) ─
// var 로 선언 (function-scope 호이스팅) — render() 가 managePipelineAutoRefresh 를
// 호출할 때 (line ~1171) 이 선언 (line ~2127) 보다 먼저 접근되어 TDZ 오류 발생 방지.
var _pipelineAutoRefreshTimer = null;
var _pipelineAutoRefreshView = null;
function managePipelineAutoRefresh(currentView) {
  const wantAutoRefresh = currentView === 'pipeline-verifying' || currentView === 'pipeline-verified';
  // 다른 뷰로 이동하거나 auto-refresh 필요 없음 → 타이머 정리
  if (!wantAutoRefresh) {
    if (_pipelineAutoRefreshTimer) {
      clearInterval(_pipelineAutoRefreshTimer);
      _pipelineAutoRefreshTimer = null;
      _pipelineAutoRefreshView = null;
    }
    return;
  }
  // 같은 view 에서 이미 타이머 돌고 있으면 그대로 유지
  if (_pipelineAutoRefreshTimer && _pipelineAutoRefreshView === currentView) return;
  // 다른 pipeline view 로 전환됐으면 기존 타이머 갈아치우기
  if (_pipelineAutoRefreshTimer) clearInterval(_pipelineAutoRefreshTimer);
  _pipelineAutoRefreshView = currentView;
  _pipelineAutoRefreshTimer = setInterval(async () => {
    if (state.view !== currentView) return;  // 사용자가 이미 다른 곳으로 이동
    try {
      // 캐시 무시하고 강제 재로드 (배치 진행 반영 목적)
      invalidateServerPage();
    await loadLeads({ force: true });
      render();
    } catch (e) { /* silent */ }
  }, 5 * 60 * 1000);  // 5분마다 (기존 30초는 너무 잦음 → 매번 5MB fetch)
}

// ══════════════════════════════════════════════════════════════
// 📧 B2B 메일 컴포즈 모달 (Gmail 스타일 좌: 편집 · 우: 미리보기)
// ══════════════════════════════════════════════════════════════
var _mailerEnvCache = null;   // { dryRun: boolean, from: string } · var for hoisting
var _composeState = {
  isOpen: false,
  recipientIds: [],
  templateId: null,
  // 리드마다 그 리드의 카테고리 양식으로 보낸다 (국내판).
  // 켜면 아래 제목·본문 편집은 쓰지 않는다 — 양식이 리드마다 다르기 때문이다.
  byCategory: false,
  mailAccountId: null,
  subject: '',
  body: '',
  fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: 15,
  previewLeadId: null,
  sending: false,
  resultSummary: null,
  forceDryRun: false,
  useSchedule: false,   // 📅 예약 발송
  scheduleAt: '',       // datetime-local 값
  touched: false,       // 사용자가 뭔가 입력했나 (다시 그려도 유지)
};

// 예약 datetime 헬퍼
function nowLocalDatetime() {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultScheduleTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const COMPOSE_FONTS = [
  { key: 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif', label: 'Pretendard (기본)' },
  { key: '"Noto Sans KR", sans-serif', label: 'Noto Sans KR' },
  { key: '"Malgun Gothic", sans-serif', label: '맑은 고딕' },
  { key: 'Arial, sans-serif', label: 'Arial' },
  { key: 'Georgia, serif', label: 'Georgia (Serif)' },
  { key: '"Times New Roman", serif', label: 'Times New Roman' },
  { key: 'Verdana, sans-serif', label: 'Verdana' },
];
const COMPOSE_SIZES = [12, 13, 14, 15, 16, 17, 18, 20];

async function openComposeModal(scope) {
  // 발송 대상 확정
  let recipients = [];
  const hasValidEmail = (l) => l && l.Email && !/^Not found/i.test(l.Email) && /@/.test(l.Email);
  if (scope === 'bulk-verified') {
    // 검증 완료 (verified) 승인된 리드 · 첫 발송 대상
    recipients = baseLeads.filter(l =>
      !l.deleted && (l.stage || 'imported') === 'verified' && l.readyForOutreach && hasValidEmail(l),
    );
    if (!recipients.length) {
      // 승인된 것 없으면 verified + email 있는 것 다 (사용자 판단 위임)
      recipients = baseLeads.filter(l => !l.deleted && (l.stage || 'imported') === 'verified' && hasValidEmail(l));
    }
  } else if (scope === 'tier-A' || scope === 'tier-B') {
    // 검증 완료 (verified) 안에서 특정 등급만 한 방에 · 원클릭 발송
    const wantTier = scope === 'tier-A' ? 'A' : 'B';
    recipients = baseLeads.filter(l =>
      !l.deleted && (l.stage || 'imported') === 'verified' && hasValidEmail(l) && getClientLeadTier(l) === wantTier,
    );
  } else if (scope === 'outbox-ready') {
    // 발송함 [보낼 메일] 이 보여준 그 목록 그대로.
    // 여기서 다시 필터를 짜면 화면 숫자와 모달 숫자가 어긋나고,
    // 이미 예약해 둔 곳에 또 예약이 걸린다.
    recipients = _outboxReadyIds
      .map((id) => findLeadForPopup(id))
      .filter(hasValidEmail);
  } else if (scope === 'bulk-contacted') {
    // 첫 발송 관리 (contacted) · 재발송 대상 (답장 안 온 애들 우선)
    recipients = baseLeads.filter(l => !l.deleted && (l.stage || 'imported') === 'contacted' && hasValidEmail(l));
  } else if (scope === 'bulk-resend-no-reply') {
    // 재발송 (답장 없는 리드만) - contacted stage + emailHistory 있음 + replied 로 안 넘어감
    recipients = baseLeads.filter(l => !l.deleted && (l.stage || 'imported') === 'contacted' && hasValidEmail(l));
  } else if (scope === 'selected') {
    recipients = [...state.selectedLeadIds]
      .map(id => findLeadForPopup(id))
      .filter(hasValidEmail);
  } else if (typeof scope === 'string') {
    const l = findLeadForPopup(scope);
    if (l) recipients = [l];
  }
  if (!recipients.length) {
    alert('발송 대상이 없습니다 (유효한 이메일 있는 리드만 가능).');
    return;
  }

  // 템플릿 + 메일 계정 로드
  if (state.email.templates.length === 0) await loadEmailTemplates();
  await loadMailAccounts();

  _composeState.isOpen = true;
  _composeState.recipientIds = recipients.map(l => l.leadId);
  _composeState.previewLeadId = recipients[0].leadId;
  _composeState.resultSummary = null;

  // 최초 진입 시 기본 템플릿 자동 선택
  if (!_composeState.templateId && state.email.templates.length > 0) {
    const defaultTpl = state.email.templates.find(t => t.purpose === 'intro' && t.language === 'en')
                    || state.email.templates[0];
    _composeState.templateId = defaultTpl._id;
    _composeState.subject = defaultTpl.subject;
    _composeState.body = defaultTpl.body;
  }
  // 발송 계정 — 열 때는 대표 계정으로 골라 둔다. 선택칸에서 등록된 다른 계정으로 바꿀 수 있다.
  // (예전에는 테스트 계정(isTestSender)을 먼저 골라서 실제 발송이 fe@ 로 나갈 뻔했다 — 기본은 늘 대표 계정)
  _composeState.mailAccountId = outreachAccount()?._id || null;

  await refreshMailerEnv();
  renderComposeModal();
}

function closeComposeModal(skipRefresh) {
  if (_composeState.sending) {
    if (!confirm('발송 진행 중입니다. 정말 닫으시겠습니까? (진행 상황 유실)')) return;
  }
  const sentSomething = !!_composeState.resultSummary;
  _composeState.isOpen = false;
  _composeState.touched = false;   // 다음에 열 때 다시 묻지 않도록
  document.getElementById('composeModalRoot')?.remove();
  // 발송/예약을 하고 닫았으면 발송함이 옛 목록을 들고 있다.
  // 보낸 곳이 [보낼 메일]에 그대로 남아 있으면 또 보내게 된다.
  if (!skipRefresh && sentSomething && state.view === 'pipeline-contacted') {
    _composeState.resultSummary = null;
    renderOutboxPage();
  }
}

async function refreshMailerEnv() {
  if (_mailerEnvCache) return _mailerEnvCache;
  try {
    const r = await fetch('/api/mail/test');
    const d = await r.json();
    _mailerEnvCache = { dryRun: false, from: d.user || '' };
    // dry_run 여부는 별도 판단 필요 — 서버가 알려주지 않음. 일단 UI 에서 표시만.
  } catch {
    _mailerEnvCache = { dryRun: true, from: '' };
  }
  return _mailerEnvCache;
}

function renderComposeModal() {
  // 기존 모달 제거 후 재생성
  document.getElementById('composeModalRoot')?.remove();

  // 발송 대상은 반드시 찾혀야 한다 — 못 찾으면 받는 사람이 0명이 되어
  // 메일을 아예 못 보낸다. 서버 페이지로 받은 것까지 본다.
  const recipients = _composeState.recipientIds.map(id =>
    findLeadForPopup(id)
  ).filter(Boolean);
  const previewLead = recipients.find(l => l.leadId === _composeState.previewLeadId) || recipients[0];

  // 미리보기 렌더 (변수 치환)
  const example = {};
  for (const v of state.email.variables) example[v.key] = v.fromLead ? '' : v.example;
  const buildVars = (lead) => {
    const out = {};
    for (const v of state.email.variables) {
      // fromLead 시뮬레이션 (client-side)
      const val = lead[v.key] || '';
      out[v.key] = val || v.example;
    }
    // 변수 목록을 아직 못 받았어도 회사명 등은 그 회사 값으로
    for (const k of ['Company', 'Region', 'BuyerContact', 'Title', 'Email', 'Phone']) {
      if (lead[k]) out[k] = lead[k];
    }
    out.SenderName = '요기보';
    out.SenderCompany = '요기보';
    out.SenderEmail = _mailerEnvCache?.from || 'partnerships@yogico.kr';
    return out;
  };
  // [회사명] 같은 한글 마커도 바꾼다 — 발송관리 미리보기(outboxSubstitute)·서버 발송과 같은 규칙
  const renderClient = (src, vars) => outboxSubstitute(src, vars);
  const previewVars = previewLead ? buildVars(previewLead) : example;
  const previewSubject = renderClient(_composeState.subject, previewVars);
  const previewBody = renderClient(_composeState.body, previewVars);
  const previewBodyHtml = previewBody.includes('<') ? previewBody : previewBody.replace(/\n/g, '<br>');

  const modalHtml = `
    <div id="composeModalRoot" style="
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="
        width:min(1200px, 95vw);height:min(800px, 92vh);
        background:#ffffff;color:#0f172a;border-radius:16px;
        display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 24px 64px rgba(0,0,0,0.5);
      ">
        <!-- 헤더 -->
        <div style="
          padding:16px 24px;border-bottom:1px solid var(--border);
          display:flex;justify-content:space-between;align-items:center;
        ">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:22px">📧</span>
            <div>
              <div style="font-size:15px;font-weight:700">B2B 메일 작성 & 발송</div>
              <div style="font-size:11px;color:var(--text-tertiary)">
                수신자 <b>${recipients.length}명</b>
                · From: <b>${_mailerEnvCache?.from || '(env 미설정)'}</b>
              </div>
            </div>
          </div>
          <button type="button" id="composeCloseBtn" style="
            background:transparent;border:none;font-size:22px;cursor:pointer;
            color:var(--text-tertiary);padding:4px 10px;
          ">×</button>
        </div>

        <!-- 결과 표시 (발송 후) -->
        ${_composeState.resultSummary ? `
          <div style="padding:12px 24px;background:${_composeState.resultSummary.failed > 0 ? '#fef3c7' : '#dcfce7'};border-bottom:1px solid var(--border);font-size:13px">
            ${_composeState.resultSummary.dryRun ? '🧪 <b>DRY_RUN</b>: 실제 발송 안 됨 (로그만). ' : '✅ '}
            요청 ${_composeState.resultSummary.requested}건 · 성공 <b style="color:#15803d">${_composeState.resultSummary.sent}</b> · 실패 <b style="color:#dc2626">${_composeState.resultSummary.failed}</b>
          </div>
        ` : ''}

        <!-- 본문 2열 (좌: 편집 · 우: 미리보기) -->
        <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;overflow:hidden">

          <!-- 좌: 편집 -->
          <div style="padding:16px 20px;overflow-y:auto;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:12px">

            <!-- 받는 사람 —— 여기가 이 화면에서 제일 중요한 정보다.
                 예전에는 12곳만 칩으로 보이고 나머지는 "+N명" 이었다. 409곳을 보낼 때
                 무엇이 나가는지 알 수 없어 사실상 눈 감고 누르는 셈이었다.
                 나라별로 몇 곳인지 먼저 보여주고, 전체 목록은 펼쳐서 확인하게 한다. -->
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <label style="font-size:11px;color:var(--text-secondary);font-weight:700">받는 사람</label>
                <span style="font-size:15px;font-weight:800;color:#1d4ed8">${recipients.length.toLocaleString()}곳</span>
                <button type="button" id="composeToggleList"
                  style="margin-left:auto;padding:3px 10px;font-size:11px;font-weight:700;
                         border:1px solid var(--border-default);border-radius:99px;
                         background:var(--bg-surface);color:var(--text-secondary);cursor:pointer">
                  전체 목록 보기
                </button>
              </div>

              <!-- 나라별 요약 — "어디로 나가는지"가 한눈에 들어온다 -->
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                ${(() => {
                  const byRegion = {};
                  for (const l of recipients) {
                    const c = l.Region || '(지역 미상)';
                    byRegion[c] = (byRegion[c] || 0) + 1;
                  }
                  return Object.entries(byRegion).sort((a, b) => b[1] - a[1]).map(([c, n]) => `
                    <span style="padding:3px 9px;background:var(--bg-surface-alt);border-radius:99px;
                                 font-size:11px;color:var(--text-secondary)">
                      ${escapeHtml(c)} <b style="color:var(--text-primary)">${n}</b>
                    </span>`).join('');
                })()}
              </div>

              <div id="composeRecipientList" style="display:none;margin-top:6px;max-height:220px;overflow-y:auto;
                   padding:6px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
                ${recipients.map((l, i) => `
                  <div style="display:flex;gap:8px;padding:3px 4px;font-size:11.5px;
                              border-bottom:1px solid var(--border-subtle)">
                    <span style="width:34px;flex:none;color:var(--text-quaternary)">${i + 1}</span>
                    <span style="flex:1;min-width:0;color:var(--text-primary);overflow:hidden;
                                 text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.Company || '?')}</span>
                    <span style="color:var(--text-tertiary)">${escapeHtml(l.Region || '')}</span>
                    <span style="width:200px;flex:none;color:var(--text-tertiary);overflow:hidden;
                                 text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.Email)}</span>
                  </div>`).join('')}
              </div>
            </div>

            <!-- 발송 계정 선택 —— 어느 주소로 나가는지가 목록만큼 중요하다.
                 대표 주소로 잘못 쏘면 진행 중인 거래 메일까지 평판이 같이 상한다. -->
            <div>
              ${(() => {
                // 어느 주소로 나가는지는 받는 사람 목록만큼 중요하다.
                // 다만 '테스트 계정' 같은 라벨은 붙이지 않는다 — 화면에 설명이 늘수록
                // 정작 봐야 할 주소가 묻힌다. 주소 자체만 크게 보여준다.
                const acc = (_mailAccounts || []).find(a => a._id === _composeState.mailAccountId);
                if (!acc) return '';
                return `<div style="padding:9px 12px;margin-bottom:6px;border-radius:8px;
                  background:var(--bg-surface-alt);border:1px solid var(--border-default)">
                  <div style="font-size:10.5px;font-weight:800;color:var(--text-tertiary);
                              text-transform:uppercase;letter-spacing:.4px">보내는 주소</div>
                  <div style="font-size:14px;font-weight:800;color:var(--text-primary);margin-top:2px">
                    ${escapeHtml(acc.fromAddress || acc.smtpUser)}
                  </div>
                </div>`;
              })()}
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">📮 발송 계정</label>
              <div style="margin-top:2px">${outreachAccountBoxHtml('composeAccountSel', _composeState.mailAccountId)}</div>
              ${(_mailAccounts || []).length === 0 ? `
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">
                  💡 <b>📬 메일 계정</b> 페이지에서 계정을 등록하면 여기서 선택 가능
                </div>
              ` : ''}
            </div>

            <!-- 카테고리별 양식 발송 (국내판) -->
            <div style="padding:10px 12px;border:1px solid ${_composeState.byCategory ? '#3FA6D3' : 'var(--border)'};
                        border-radius:10px;background:${_composeState.byCategory ? 'rgba(63,166,211,.08)' : 'transparent'}">
              <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer">
                <input id="composeByCategory" type="checkbox" ${_composeState.byCategory ? 'checked' : ''} style="margin-top:2px">
                <span>
                  <span style="font-size:12.5px;font-weight:800;color:var(--text-primary)">🏷 카테고리별 양식으로 보내기</span>
                  <span style="display:block;font-size:11px;color:var(--text-tertiary);line-height:1.55;margin-top:2px">
                    업체마다 그 업체 카테고리(학교·기업·병의원·리조트·스포츠)에 맞는 양식이 나갑니다.
                    켜면 아래 제목·본문은 쓰지 않습니다.
                  </span>
                </span>
              </label>
            </div>

            <!-- 템플릿 선택 -->
            <div style="${_composeState.byCategory ? 'opacity:.4;pointer-events:none' : ''}">
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">템플릿</label>
              <select id="composeTemplateSel" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
                <option value="">— 커스텀 (템플릿 없이) —</option>
                ${state.email.templates.map(t => `
                  <option value="${escapeAttr(t._id)}" ${t._id === _composeState.templateId ? 'selected' : ''}>
                    ${escapeHtml(t.name)} (${t.language === 'ko' ? '🇰🇷' : '🇺🇸'} ${t.purpose})
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- 폰트 -->
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary);font-weight:700">폰트</label>
                <select id="composeFontSel" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
                  ${COMPOSE_FONTS.map(f => `<option value="${escapeAttr(f.key)}" ${f.key === _composeState.fontFamily ? 'selected' : ''}>${f.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary);font-weight:700">크기</label>
                <select id="composeSizeSel" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
                  ${COMPOSE_SIZES.map(s => `<option value="${s}" ${s === _composeState.fontSize ? 'selected' : ''}>${s}px</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- 제목 -->
            <div>
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">제목</label>
              <input id="composeSubjectInput" type="text" value="${escapeAttr(_composeState.subject)}"
                style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;margin-top:2px;background:#ffffff;color:#0f172a"
                placeholder="예: Partnership inquiry — {{Company}}">
            </div>

            <!-- 본문 -->
            <div style="display:flex;flex-direction:column;flex:1;min-height:200px">
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">본문 (템플릿 편집에서 저장한 변수 자동 치환됨)</label>
              <textarea id="composeBodyInput"
                style="width:100%;flex:1;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:${_composeState.fontFamily};margin-top:2px;resize:vertical;min-height:250px;line-height:1.6;background:#ffffff;color:#0f172a"
              >${escapeHtml(_composeState.body)}</textarea>
            </div>
          </div>

          <!-- 우: 미리보기 (Gmail 스타일) -->
          <div style="padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;background:var(--surface-1)">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <label style="font-size:11px;color:var(--text-tertiary);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">👁 실시간 미리보기</label>
              <select id="composePreviewSel" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:11px">
                ${recipients.map(l => `
                  <option value="${escapeAttr(l.leadId)}" ${l.leadId === _composeState.previewLeadId ? 'selected' : ''}>
                    ${escapeHtml((l.Company || '?').slice(0, 30))}
                  </option>
                `).join('')}
              </select>
            </div>

            <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;flex:1;display:flex;flex-direction:column">
              <!-- 헤더 (Gmail 느낌) -->
              <div style="padding:14px 20px;border-bottom:1px solid #e5e7eb;background:#f9fafb">
                <div style="font-size:16px;font-weight:700;color:#111827;line-height:1.3">${escapeHtml(previewSubject) || '<span style="color:#9ca3af">(제목 없음)</span>'}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:6px">
                  <b>From:</b> ${escapeHtml(_mailerEnvCache?.from || '(env)')}
                  · <b>To:</b> ${previewLead ? escapeHtml(previewLead.Email) : '?'}
                </div>
              </div>
              <!-- 본문 (실제 발송되는 스타일 그대로) -->
              <div style="padding:20px;overflow-y:auto;flex:1;background:white;font-family:${_composeState.fontFamily};font-size:${_composeState.fontSize}px;line-height:1.65;color:#111827">
                ${previewBodyHtml || '<span style="color:#9ca3af">(본문 없음)</span>'}
              </div>
            </div>
            <div style="font-size:10px;color:var(--text-tertiary);text-align:center">
              📌 미리보기는 선택한 리드 (${previewLead ? escapeHtml(previewLead.Company || '?') : '?'})의 값으로 변수 치환
            </div>
          </div>
        </div>

        <!-- 하단 액션 바 -->
        <div style="
          padding:14px 24px;border-top:1px solid var(--border);
          display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;
        ">
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer">
              <input type="checkbox" id="composeForceDryRunChk" ${_composeState.forceDryRun ? 'checked' : ''}>
              🧪 DRY_RUN
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer">
              <input type="checkbox" id="composeUseScheduleChk" ${_composeState.useSchedule ? 'checked' : ''}>
              📅 예약 발송
            </label>
            ${_composeState.useSchedule ? `
              <input type="datetime-local" id="composeScheduleAt" value="${escapeAttr(_composeState.scheduleAt || defaultScheduleTime())}"
                min="${escapeAttr(nowLocalDatetime())}"
                style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;background:#ffffff;color:#0f172a">
            ` : ''}
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" id="composeCancelBtn" class="button ghost" style="font-size:13px;padding:9px 16px">닫기</button>
            <button type="button" id="composeSendBtn" ${_composeState.sending ? 'disabled' : ''} style="
              font-size:14px;font-weight:700;padding:9px 22px;
              background:${_composeState.useSchedule ? '#d97706' : '#2563eb'};color:white;border:none;border-radius:8px;cursor:pointer;
              box-shadow:0 2px 6px ${_composeState.useSchedule ? 'rgba(217,119,6,0.3)' : 'rgba(37,99,235,0.3)'};
              ${_composeState.sending ? 'opacity:0.5;cursor:wait' : ''}
            ">
              ${_composeState.sending
                ? '⏳ 처리 중...'
                : (_composeState.useSchedule
                    ? `📅 ${recipients.length}명 예약 발송`
                    : `✉ ${recipients.length}명 지금 발송`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // 이벤트 바인딩
  document.getElementById('composeCloseBtn')?.addEventListener('click', closeComposeModal);
  document.getElementById('composeCancelBtn')?.addEventListener('click', closeComposeModal);
  // 배경 클릭 → 닫기. 제목·본문을 쓰다 배경을 스쳐 날리는 일이 많던 곳이라
  // 한 글자라도 썼으면 물어보고 닫는다.
  const root = document.getElementById('composeModalRoot');
  bindBackdropDismiss(root, closeComposeModal);
  // 이 팝업은 양식을 바꿀 때마다 통째로 다시 그려진다.
  // 그때 "쓰던 내용" 표시도 같이 지워지므로 상태에서 되살린다.
  if (root && _composeState.touched) root.dataset.userTyped = '1';
  root?.addEventListener('input', () => { _composeState.touched = true; }, true);

  // Esc 키 → 닫기 (한 번만 바인딩)
  const escHandler = (e) => {
    if (e.key === 'Escape' && _composeState.isOpen) {
      if (!confirmDiscardTyped(document.getElementById('composeModalRoot'))) return;
      closeComposeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  document.getElementById('composeByCategory')?.addEventListener('change', (e) => {
    _composeState.byCategory = !!e.target.checked;
    renderComposeModal();
  });
  document.getElementById('composeTemplateSel')?.addEventListener('change', (e) => {
    const tid = e.target.value;
    _composeState.templateId = tid || null;
    if (tid) {
      const t = state.email.templates.find(x => x._id === tid);
      if (t) {
        _composeState.subject = t.subject;
        _composeState.body = t.body;
      }
    }
    renderComposeModal();
  });
  // 받는 사람 전체 목록 펼치기/접기
  document.getElementById('composeToggleList')?.addEventListener('click', (e) => {
    const list = document.getElementById('composeRecipientList');
    if (!list) return;
    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : '';
    e.currentTarget.textContent = open ? '전체 목록 보기' : '목록 접기';
  });

  document.getElementById('composeAccountSel')?.addEventListener('change', (e) => {
    _composeState.mailAccountId = e.target.value || null;
    renderComposeModal();
  });
  document.getElementById('composeFontSel')?.addEventListener('change', (e) => {
    _composeState.fontFamily = e.target.value;
    renderComposeModal();
  });
  document.getElementById('composeSizeSel')?.addEventListener('change', (e) => {
    _composeState.fontSize = parseInt(e.target.value, 10);
    renderComposeModal();
  });
  document.getElementById('composePreviewSel')?.addEventListener('change', (e) => {
    _composeState.previewLeadId = e.target.value;
    renderComposeModal();
  });
  // 실시간 미리보기 위해 input 이벤트 hook — 하지만 매타이핑 재렌더 하면 포커스 잃음
  // → 타이핑 시엔 미리보기 우측만 부분 업데이트, 재렌더 스킵
  document.getElementById('composeSubjectInput')?.addEventListener('input', (e) => {
    _composeState.subject = e.target.value;
    // 우측 subject 만 갱신 (포커스 유지)
    const previewLead = findLeadForPopup(_composeState.previewLeadId);
    const vars = {};
    for (const v of state.email.variables) vars[v.key] = (previewLead?.[v.key] || v.example || '');
    vars.SenderName = '요기보'; vars.SenderCompany = '요기보'; vars.SenderEmail = _mailerEnvCache?.from || '';
    const s = e.target.value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k) => vars[k] != null ? String(vars[k]) : `{{${k}}}`);
    const titleEl = document.querySelector('#composeModalRoot .verify-hero-card') || document.querySelector('#composeModalRoot [data-preview-subject]');
    // 간단 fallback: 재렌더
    // 성능 이슈 없으면 매번 재렌더 OK
    renderComposeModal();
    // 포커스 복구
    setTimeout(() => {
      const el = document.getElementById('composeSubjectInput');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
  });
  document.getElementById('composeBodyInput')?.addEventListener('input', (e) => {
    _composeState.body = e.target.value;
    // 재렌더 + 포커스 복구
    const cursorPos = e.target.selectionStart;
    renderComposeModal();
    setTimeout(() => {
      const el = document.getElementById('composeBodyInput');
      if (el) { el.focus(); el.setSelectionRange(cursorPos, cursorPos); }
    }, 0);
  });
  document.getElementById('composeForceDryRunChk')?.addEventListener('change', (e) => {
    _composeState.forceDryRun = e.target.checked;
  });
  document.getElementById('composeUseScheduleChk')?.addEventListener('change', (e) => {
    _composeState.useSchedule = e.target.checked;
    if (e.target.checked && !_composeState.scheduleAt) {
      _composeState.scheduleAt = defaultScheduleTime();
    }
    renderComposeModal();
  });
  document.getElementById('composeScheduleAt')?.addEventListener('change', (e) => {
    _composeState.scheduleAt = e.target.value;
  });
  document.getElementById('composeSendBtn')?.addEventListener('click', () => handleComposeSend());
}

async function handleComposeSend() {
  const recipients = _composeState.recipientIds;
  if (!recipients.length) return;

  // 예약 발송 분기
  if (_composeState.useSchedule) {
    if (!_composeState.templateId) {
      alert('예약 발송은 저장된 메일 양식이 필요합니다.\n메일 양식 페이지에서 먼저 저장해주세요.');
      return;
    }
    if (!_composeState.scheduleAt) {
      alert('예약 시각을 선택해주세요.');
      return;
    }
    const scheduledFor = new Date(_composeState.scheduleAt);
    if (isNaN(scheduledFor.getTime())) { alert('예약 시각 형식이 올바르지 않습니다.'); return; }
    if (scheduledFor.getTime() < Date.now()) { alert('과거 시각으로 예약할 수 없습니다.'); return; }
    const ok = confirm(
      `📅 ${recipients.length}명 예약 발송\n\n` +
      `예약 시각: ${scheduledFor.toLocaleString('ko-KR')}\n` +
      `제목: ${_composeState.subject.slice(0, 60)}\n\n등록하시겠습니까? (Vercel Cron 이 5분마다 실행)`
    );
    if (!ok) return;
    _composeState.sending = true;
    let movedToSchedule = false;
    renderComposeModal();
    try {
      const res = await fetch('/api/mail/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: recipients,
          templateId: _composeState.templateId,
          scheduledFor: scheduledFor.toISOString(),
          mailAccountId: _composeState.mailAccountId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '예약 실패');
      alert(
        `✅ ${data.scheduled}건 예약 완료\n\n` +
        `예약 시각: ${new Date(data.scheduledFor).toLocaleString('ko-KR')}\n\n` +
        `[발송 관리 → 📅 예약 발송] 에서 확인·취소할 수 있습니다.`,
      );
      _composeState.resultSummary = { requested: recipients.length, sent: 0, failed: 0, scheduled: data.scheduled };
      // 예약한 곳은 [보낼 메일]에서 빠지고 [예약 발송]으로 내려가야 한다.
      // finally 가 모달을 다시 그리므로 여기서 바로 닫지 않고 표시만 해 둔다.
      if (state.view === 'pipeline-contacted') movedToSchedule = true;
    } catch (e) {
      alert(`예약 실패: ${e.message || 'unknown'}`);
    } finally {
      _composeState.sending = false;
      if (movedToSchedule) {
        _outboxTab = 'scheduled';
        closeComposeModal(true);   // 아래에서 직접 그린다
        renderOutboxPage();
      } else {
        renderComposeModal();
      }
    }
    return;
  }

  const ok = confirm(
    `📧 ${recipients.length}명에게 발송\n\n` +
    (_composeState.forceDryRun ? '🧪 DRY_RUN 모드 (실제 발송 X)\n' : '') +
    `제목: ${_composeState.subject.slice(0, 60)}\n\n계속하시겠습니까?`
  );
  if (!ok) return;

  _composeState.sending = true;
  renderComposeModal();

  try {
    const res = await fetch('/api/mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadIds: recipients,
        // 카테고리별 발송이면 제목·본문을 아예 보내지 않는다.
        // 보내면 서버가 그것을 '직접 쓴 내용' 으로 보고 모든 업체에 똑같이 써 버린다
        // (explicitSubject 가 양식보다 우선한다).
        ...(_composeState.byCategory
          ? { byCategory: true }
          : {
              templateId: _composeState.templateId || undefined,
              subject: _composeState.subject,
              body: _composeState.body,
            }),
        bodyIsHtml: true,
        fontFamily: _composeState.fontFamily,
        fontSize: _composeState.fontSize,
        mailAccountId: _composeState.mailAccountId || undefined,
        dryRun: !!_composeState.forceDryRun,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '발송 실패');
    _composeState.resultSummary = {
      requested: data.requested,
      sent: data.sent,
      failed: data.failed,
      dryRun: data.dryRun,
    };
    // 로컬 lead emailHistory 갱신 위해 재로드
    invalidateServerPage();
    await loadLeads({ force: true });
  } catch (e) {
    alert(`발송 실패: ${e.message || 'unknown'}`);
  } finally {
    _composeState.sending = false;
    renderComposeModal();
  }
}

// ══════════════════════════════════════════════════════════════
// Import 배치별 폴더 UI (검증대기/완료/실패 페이지 공용)
// ══════════════════════════════════════════════════════════════

// stageMatch 함수 받아서 해당 stage 리드를 batch 별로 그룹핑
function groupLeadsByBatch(stageMatch) {
  const groups = new Map();  // batchId -> { batchId, dateLabel, leads: [] }
  for (const lead of getLeads()) {
    if (!stageMatch(lead)) continue;
    const b = lead.importBatch || '(수동/미배치)';
    if (!groups.has(b)) {
      // batchId 예: "import-20260813-153021" → date label 추출
      const m = String(b).match(/(\d{4})(\d{2})(\d{2})/);
      const dateLabel = m ? `${m[1]}-${m[2]}-${m[3]}` : (b === '(수동/미배치)' ? '수동 추가' : '미상');
      groups.set(b, { batchId: b, dateLabel, leads: [] });
    }
    groups.get(b).leads.push(lead);
  }
  // 최신 배치 (batchId 문자열 역순) 먼저
  return Array.from(groups.values()).sort((a, b) => b.batchId.localeCompare(a.batchId));
}

// 배치 전체 (모든 stage 포함) breakdown — 검증대기/완료/실패 카드 공용
// 한 배치의 리드가 각 stage 로 얼마나 이동했는지 카운트
function getBatchStageBreakdown(batchId) {
  const inBatch = baseLeads.filter(l =>
    !l.deleted && (l.importBatch || '(수동/미배치)') === batchId
  );
  const bd = {
    total: inBatch.length,
    verifying: 0,
    verified: 0,
    failed: 0,          // archived + not-fit
    archivedOther: 0,   // archived + 그 외 (수동 폐기)
    contacted: 0,
    replied: 0,
    negotiating: 0,
    partner: 0,
    imported: 0,
  };
  for (const l of inBatch) {
    const s = l.stage || 'imported';
    if (s === 'archived') {
      if (l?.verification?.aiVerdict === 'not-fit') bd.failed++;
      else bd.archivedOther++;
    } else if (bd[s] !== undefined) {
      bd[s]++;
    }
  }
  return bd;
}

// 검증대기 폴더 카드 (AI 진행 상태 + 이 배치가 어디로 얼마나 이동했는지)
function batchCardVerifying(g) {
  const bd = getBatchStageBreakdown(g.batchId);
  const total = g.leads.length;   // 검증대기 stage 잔여
  const aiChecked = g.leads.filter(l => l?.verification?.aiVerifiedAt).length;
  const pctChecked = total > 0 ? Math.round(aiChecked / total * 100) : 100;
  const allProcessed = bd.total > 0 && bd.verifying === 0;

  const statusBadge = allProcessed
    ? `<span style="padding:2px 8px;background:#dcfce7;color:#166534;border-radius:99px;font-size:11px;font-weight:700">✅ 검증 완료 (전량 이동)</span>`
    : aiChecked > 0 || (bd.verified + bd.failed) > 0
      ? `<span style="padding:2px 8px;background:#fef3c7;color:#92400e;border-radius:99px;font-size:11px;font-weight:700">🔄 검증 진행 중</span>`
      : `<span style="padding:2px 8px;background:#f1f5f9;color:#475569;border-radius:99px;font-size:11px;font-weight:700">⏳ 진행 전</span>`;

  return `
    <div class="batch-folder-card" data-batch="${escapeAttr(g.batchId)}" style="
      background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:16px 18px;
      cursor:pointer;transition:all 0.15s;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="font-size:22px">📁</span>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${g.dateLabel}</div>
            <div style="font-size:11px;color:var(--text-tertiary);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(g.batchId)}</div>
          </div>
        </div>
        ${statusBadge}
      </div>

      <!-- 이 배치 전체 흐름 요약 -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;margin-bottom:8px">
        <span style="padding:3px 8px;background:var(--surface-2);color:var(--text-secondary);border-radius:6px">
          📊 배치 총 <b style="color:var(--text-primary)">${bd.total.toLocaleString()}</b>건
        </span>
        <span style="padding:3px 8px;background:#fef3c7;color:#92400e;border-radius:6px">
          ⏳ 검증대기 <b>${bd.verifying}</b>
        </span>
        ${bd.verified > 0 ? `<span style="padding:3px 8px;background:#dcfce7;color:#166534;border-radius:6px">✅ 검증완료 <b>${bd.verified}</b></span>` : ''}
        ${bd.failed > 0 ? `<span style="padding:3px 8px;background:#fef2f2;color:#991b1b;border-radius:6px">🚫 검증실패 <b>${bd.failed}</b></span>` : ''}
        ${(bd.contacted + bd.replied + bd.negotiating) > 0 ? `<span style="padding:3px 8px;background:#dbeafe;color:#1e40af;border-radius:6px">📨 컨택+ <b>${bd.contacted + bd.replied + bd.negotiating}</b></span>` : ''}
        ${bd.partner > 0 ? `<span style="padding:3px 8px;background:#f3e8ff;color:#6b21a8;border-radius:6px">⭐ 파트너 <b>${bd.partner}</b></span>` : ''}
      </div>
      <div style="display:flex;justify-content:flex-end;font-size:12px;color:var(--brand-primary,#4338ca);font-weight:600">
        폴더 열기 (검증대기 ${total}건) →
      </div>
    </div>
  `;
}

// 검증완료 폴더 카드 (컨택 이동 준비 상태 + 배치 breakdown)
function batchCardVerified(g) {
  const bd = getBatchStageBreakdown(g.batchId);
  const total = g.leads.length;
  const hasRealEmail = (l) => l.Email && String(l.Email).trim() && !/^Not found/i.test(l.Email);
  const withEmail = g.leads.filter(hasRealEmail).length;
  const approved = g.leads.filter(l => l.readyForOutreach === true).length;
  const noEmailWithSite = g.leads.filter(l => !hasRealEmail(l) && l.WebsiteContact && String(l.WebsiteContact).trim()).length;

  return `
    <div class="batch-folder-card" data-batch="${escapeAttr(g.batchId)}" style="
      background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:16px 18px;
      cursor:pointer;transition:all 0.15s;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="font-size:22px">📁</span>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${g.dateLabel}</div>
            <div style="font-size:11px;color:var(--text-tertiary);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(g.batchId)}</div>
          </div>
        </div>
        <span style="padding:2px 8px;background:#dcfce7;color:#166534;border-radius:99px;font-size:11px;font-weight:700">✅ 검증 통과 ${total}</span>
      </div>
      <!-- 배치 전체 흐름 -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;margin-bottom:8px">
        <span style="padding:3px 8px;background:var(--surface-2);color:var(--text-secondary);border-radius:6px">
          📊 배치 총 <b style="color:var(--text-primary)">${bd.total.toLocaleString()}</b>건
        </span>
        ${bd.verifying > 0 ? `<span style="padding:3px 8px;background:#fef3c7;color:#92400e;border-radius:6px">⏳ 검증대기 <b>${bd.verifying}</b></span>` : ''}
        ${bd.failed > 0 ? `<span style="padding:3px 8px;background:#fef2f2;color:#991b1b;border-radius:6px">🚫 실패 <b>${bd.failed}</b></span>` : ''}
        <span style="padding:3px 8px;background:#dcfce7;color:#166534;border-radius:6px">✅ 통과 <b>${bd.verified}</b></span>
        ${(bd.contacted + bd.replied + bd.negotiating) > 0 ? `<span style="padding:3px 8px;background:#dbeafe;color:#1e40af;border-radius:6px">📨 컨택+ <b>${bd.contacted + bd.replied + bd.negotiating}</b></span>` : ''}
      </div>
      <!-- 검증완료 특화 지표 -->
      <div style="display:flex;gap:12px;font-size:12px;color:var(--text-secondary);flex-wrap:wrap">
        <span>📧 메일 있음 <b style="color:#15803d">${withEmail}/${total}</b></span>
        ${noEmailWithSite > 0 ? `<span>🔍 크롤 대상 <b style="color:#d97706">${noEmailWithSite}</b></span>` : ''}
        ${approved > 0 ? `<span>✔ 승인 <b style="color:#15803d">${approved}</b></span>` : ''}
        <span style="margin-left:auto;color:var(--brand-primary,#4338ca);font-weight:600">폴더 열기 →</span>
      </div>
    </div>
  `;
}

// 검증실패 폴더 카드 (배치 breakdown 포함)
function batchCardFailed(g) {
  const bd = getBatchStageBreakdown(g.batchId);
  const total = g.leads.length;
  return `
    <div class="batch-folder-card" data-batch="${escapeAttr(g.batchId)}" style="
      background:var(--surface-1);border:1px solid #fca5a540;border-radius:12px;padding:16px 18px;
      cursor:pointer;transition:all 0.15s;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="font-size:22px">📁</span>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${g.dateLabel}</div>
            <div style="font-size:11px;color:var(--text-tertiary);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(g.batchId)}</div>
          </div>
        </div>
        <span style="padding:2px 8px;background:#fef2f2;color:#991b1b;border-radius:99px;font-size:11px;font-weight:700">🚫 실패 ${total}</span>
      </div>
      <!-- 배치 전체 흐름 -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;margin-bottom:8px">
        <span style="padding:3px 8px;background:var(--surface-2);color:var(--text-secondary);border-radius:6px">
          📊 배치 총 <b style="color:var(--text-primary)">${bd.total.toLocaleString()}</b>건
        </span>
        <span style="padding:3px 8px;background:#fef2f2;color:#991b1b;border-radius:6px">🚫 실패 <b>${bd.failed}</b></span>
        ${bd.verified > 0 ? `<span style="padding:3px 8px;background:#dcfce7;color:#166534;border-radius:6px">✅ 통과 <b>${bd.verified}</b></span>` : ''}
        ${bd.verifying > 0 ? `<span style="padding:3px 8px;background:#fef3c7;color:#92400e;border-radius:6px">⏳ 대기 <b>${bd.verifying}</b></span>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)">
        <span style="font-size:11px;color:var(--text-tertiary)">💡 실패는 수동으로 검증완료로 되돌리기 가능</span>
        <span style="color:var(--brand-primary,#4338ca);font-weight:600">폴더 열기 →</span>
      </div>
    </div>
  `;
}

// 배치 폴더 목록 뷰 (열린 배치가 없을 때)
function renderBatchFolders(stageMatch, cardRenderer, emptyText) {
  const groups = groupLeadsByBatch(stageMatch);
  if (groups.length === 0) {
    els.content.innerHTML = emptyState(emptyText);
    return;
  }
  els.content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${groups.map(cardRenderer).join('')}
    </div>
  `;
  // 카드 클릭 → 폴더 열기
  els.content.querySelectorAll('.batch-folder-card').forEach(el => {
    el.addEventListener('click', () => {
      state.folderView.openBatch = el.dataset.batch;
      resetPagination();
      render();
    });
    el.addEventListener('mouseenter', () => {
      el.style.borderColor = 'var(--brand-primary, #4338ca)';
      el.style.transform = 'translateY(-1px)';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.borderColor = 'var(--border)';
      el.style.transform = '';
      el.style.boxShadow = '';
    });
  });
}

// 폴더 안에서 표시할 상단 breadcrumb (뒤로 가기 링크)
function renderFolderBreadcrumb(batchId, count) {
  const m = String(batchId).match(/(\d{4})(\d{2})(\d{2})/);
  const dateLabel = m ? `${m[1]}-${m[2]}-${m[3]}` : '수동';
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 14px;background:var(--surface-2);border-radius:8px;font-size:13px">
      <button id="folderBackBtn" type="button" style="background:transparent;border:none;color:var(--brand-primary,#4338ca);cursor:pointer;font-weight:600;font-size:13px;padding:0">
        ← 폴더 목록으로
      </button>
      <span style="color:var(--text-tertiary)">/</span>
      <span style="font-weight:600">📁 ${dateLabel}</span>
      <span style="color:var(--text-tertiary);font-family:monospace;font-size:11px">${escapeHtml(batchId)}</span>
      <span style="margin-left:auto;color:var(--text-tertiary)">${count.toLocaleString()}건</span>
    </div>
  `;
}

// ── 페이지네이션 바 (게시판 스타일 1 · 2 · 3 · ... · N) ────────
/**
 * 페이지 이동 바.
 *
 * 표 아래에만 두면 50줄을 스크롤해야 나와서 "다음 장으로 가는 버튼이 없다" 고 느낀다.
 * 그래서 표 위에도 같은 바를 둔다(compact: 페이지 입력칸 없이 화살표만 — id 중복 방지).
 */
function renderPaginationBar(current, totalPages, totalItems, opts) {
  if (totalPages <= 1) return '';
  const compact = opts && opts.compact === true;

  // 페이지 번호 리스트 계산 — 현재 페이지 주변 + 처음/끝 + 생략(...)
  //  예: [1, ..., 4, 5, 6, ..., 45]
  const pages = new Set([1, totalPages, current, current - 1, current + 1, current - 2, current + 2]);
  const visible = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const pageBtn = (p, label = String(p), active = false, disabled = false) => {
    const bg = active ? 'var(--brand-primary,#4338ca)' : 'var(--surface-1)';
    const fg = active ? 'white' : disabled ? 'var(--text-tertiary)' : 'var(--text-primary)';
    const bd = active ? 'var(--brand-primary,#4338ca)' : 'var(--border)';
    return `<button type="button" class="page-btn" data-page="${p}" ${disabled ? 'disabled' : ''}
      style="min-width:34px;height:34px;padding:0 10px;font-size:12px;font-weight:${active ? '700' : '500'};
      background:${bg};color:${fg};border:1px solid ${bd};border-radius:8px;cursor:${disabled ? 'not-allowed' : 'pointer'};
      display:inline-flex;align-items:center;justify-content:center;transition:all 0.1s;
      ${disabled ? 'opacity:0.4' : ''}">${label}</button>`;
  };

  let itemsHtml = '';
  let prev = 0;
  for (const p of visible) {
    if (p - prev > 1) {
      itemsHtml += `<span style="min-width:24px;text-align:center;color:var(--text-tertiary);font-size:12px">…</span>`;
    }
    itemsHtml += pageBtn(p, String(p), p === current);
    prev = p;
  }

  // 표 위에 붙는 바는 페이지 입력칸을 빼서 id 중복을 피한다
  const jumpHtml = compact
    ? `<span style="margin-left:10px;font-size:12px;color:var(--text-tertiary)">${current} / ${totalPages} 페이지</span>`
    : `<span style="margin-left:12px;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-tertiary)">
         <span>페이지</span>
         <input id="pageJumpInput" type="number" min="1" max="${totalPages}" value="${current}"
           style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;
                  text-align:center;background:var(--surface-1);color:var(--text-primary)"
           title="페이지 번호 입력 후 Enter">
         <span>/ ${totalPages}</span>
       </span>`;

  return `
    <div style="${compact ? 'margin:0 0 10px' : 'margin-top:16px'};padding:${compact ? '8px' : '12px'};
                display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap">
      ${pageBtn(1, '⏮', false, current === 1)}
      ${pageBtn(current - 1, '◀', false, current === 1)}
      ${itemsHtml}
      ${pageBtn(current + 1, '▶', false, current === totalPages)}
      ${pageBtn(totalPages, '⏭', false, current === totalPages)}
      ${jumpHtml}
    </div>
  `;
}

// 필터/뷰가 바뀔 때 1페이지로 리셋 (호출 지점: 뷰 이동, 필터 변경, 서브필터 chip)
function resetPagination() {
  if (state.pagination) state.pagination.currentPage = 1;
}

function renderLeadTable(leads, emptyText = "No leads match the current filters.") {
  if (!leads.length) {
    els.content.innerHTML = emptyState(emptyText);
    return;
  }

  // ── 페이지네이션 ───────────────────────────────
  const pageSize = state.pagination?.pageSize || 100;
  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  // 리드 수가 줄어들어 현재 페이지가 범위 초과 시 자동 클램프
  if (state.pagination.currentPage > totalPages) state.pagination.currentPage = totalPages;
  if (state.pagination.currentPage < 1) state.pagination.currentPage = 1;
  const page = state.pagination.currentPage;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, leads.length);
  const pageLeads = leads.slice(start, end);

  const visibleIds = pageLeads.map((lead) => lead.id);
  const selectedVisibleCount = visibleIds.filter((id) => state.selectedLeadIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  els.content.innerHTML = `
    <!-- 페이지 넘김을 맨 위로 올린다.
         이 화면은 위쪽에 안내 카드·칩·탭이 쌓여 있어서, 2페이지를 보려면
         그걸 다 지나쳐 내려가야 했다. 목록을 훑는 동안 가장 자주 누르는
         버튼이라 손이 먼저 닿는 자리에 둔다. (표 아래에도 그대로 있다) -->
    ${renderPaginationBar(page, totalPages, leads.length, { compact: true })}
    <div class="bulk-actions">
      <button class="button secondary" data-select-visible type="button">${allVisibleSelected ? "이 페이지 선택 해제" : "이 페이지 전체 선택"}</button>
      ${state.view === 'pipeline-verified' && (state.verifiedResultTab || 'success') !== 'failed' ? `
        <button class="button primary" id="moveToQueueBtn" type="button" ${state.selectedLeadIds.size ? '' : 'disabled'}
          title="고른 곳을 [발송 관리 → 보낼 메일] 로 옮깁니다. 옮겨야 발송 대상이 됩니다."
          style="${state.selectedLeadIds.size ? '' : 'opacity:.45;cursor:default'}">
          📨 발송 관리로 이동 (${state.selectedLeadIds.size})
        </button>
        <!-- 아닌 곳을 검증 실패로 다 뺀 뒤에는 남은 전체를 한 번에 옮기는 게 자연스럽다.
             418건을 페이지마다 체크하게 두면 9페이지를 넘겨야 한다. -->
        <button class="button" id="moveAllToQueueBtn" type="button"
          title="지금 검증 완료에 남아 있는 곳을 전부 발송 관리로 옮깁니다 (검색·지역로 좁혀 놨으면 그 범위만)"
          style="border:1px solid #15803d;background:#f0fdf4;color:#15803d;font-weight:700">
          ⇢ 남은 전체 옮기기
        </button>` : ''}
      <button class="button ghost danger-action" data-delete-selected type="button" ${state.selectedLeadIds.size ? "" : "disabled"}>
        🗑 목록에서 빼기 (${state.selectedLeadIds.size})
      </button>
      <span style="margin-left:auto;font-size:12px;color:var(--text-tertiary);display:inline-flex;align-items:center;gap:8px">
        <span>총 <b style="color:var(--text-primary)">${leads.length.toLocaleString()}</b>건 중 <b style="color:var(--text-primary)">${start + 1}~${end}</b>번 표시</span>
        <select id="pageSizeSel" title="한 페이지에 보여줄 리드 수"
          style="padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-size:11px;background:var(--surface-1);color:var(--text-primary);cursor:pointer">
          <option value="25" ${pageSize === 25 ? 'selected' : ''}>25/page</option>
          <option value="50" ${pageSize === 50 ? 'selected' : ''}>50/page</option>
          <option value="100" ${pageSize === 100 ? 'selected' : ''}>100/page</option>
        </select>
      </span>
    </div>
    <div class="table-wrap">
      <table>
        <!-- 이 헤더는 rowHtml 이 실제로 그리는 칸과 반드시 같아야 한다.
             예전에는 Stage·발송승인·Priority·검증 까지 10칸이 적혀 있었는데
             rowHtml 은 7칸만 그려서, 값이 한 칸씩 밀리고 끝의 세 칸이
             비어 보였다 (검색 결과 화면에서 그대로 드러났다). -->
        <thead>
          <tr>
            <th style="width:34px"><span class="sr-only">선택</span></th>
            <th>회사</th>
            <th class="sortable" data-sort="Region" style="width:110px;cursor:pointer;user-select:none" title="지역순 정렬">
              지역
              <span style="color:#999;font-size:0.8em;margin-left:4px">${state.sortField === 'Region' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '⇕'}</span>
            </th>
            <th style="width:230px">이메일</th>
            <th style="width:260px">웹사이트</th>
            <th style="width:120px">전화</th>
            <th style="width:170px;white-space:nowrap" title="이 회사는 아니다 싶으면 다른 단계로 옮깁니다. 지워지지 않아 언제든 되돌릴 수 있습니다">이동</th>
          </tr>
        </thead>
        <tbody>
          ${pageLeads.map((lead) => rowHtml(lead)).join("")}
        </tbody>
      </table>
    </div>
    ${renderPaginationBar(page, totalPages, leads.length)}
  `;

  els.content.querySelector("[data-select-visible]")?.addEventListener("click", () => {
    if (allVisibleSelected) {
      visibleIds.forEach((id) => state.selectedLeadIds.delete(id));
    } else {
      visibleIds.forEach((id) => state.selectedLeadIds.add(id));
    }
    render();
  });

  // 발송 관리로 옮기기 — 이 표에도 버튼이 생겼으니 여기서 묶어준다
  els.content.querySelector("#moveToQueueBtn")?.addEventListener("click", moveSelectedToQueue);
  els.content.querySelector("#moveAllToQueueBtn")?.addEventListener("click", moveAllToQueue);

  // 페이지네이션 클릭
  els.content.querySelectorAll('.page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = parseInt(btn.dataset.page, 10);
      if (isNaN(target) || target === state.pagination.currentPage) return;
      state.pagination.currentPage = Math.min(Math.max(1, target), totalPages);
      render();
      // 상단으로 스크롤
      els.content?.scrollTo?.({ top: 0, behavior: 'smooth' });
    });
  });
  els.content.querySelector('#pageJumpInput')?.addEventListener('change', (e) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1 && v <= totalPages) {
      state.pagination.currentPage = v;
      render();
      els.content?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }
  });
  els.content.querySelector('#pageSizeSel')?.addEventListener('change', (e) => {
    const newSize = parseInt(e.target.value, 10);
    if ([25, 50, 100].includes(newSize)) {
      state.pagination.pageSize = newSize;
      state.pagination.currentPage = 1;   // 페이지 크기 변경 시 1페이지로
      try { localStorage.setItem('leads-page-size', String(newSize)); } catch {}
      render();
    }
  });

  els.content.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      if (state.sortField === field) {
        if (state.sortOrder === "asc") {
          state.sortOrder = "desc";
        } else {
          state.sortField = null;
          state.sortOrder = "asc";
        }
      } else {
        state.sortField = field;
        state.sortOrder = "asc";
      }
      render();
    });
  });

  els.content.querySelector("[data-delete-selected]")?.addEventListener("click", deleteSelectedLeads);
  els.content.querySelector('#moveToQueueBtn')?.addEventListener('click', moveSelectedToQueue);
  els.content.querySelector('#moveAllToQueueBtn')?.addEventListener('click', moveAllToQueue);

  els.content.querySelectorAll("[data-select-lead]").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedLeadIds.add(checkbox.dataset.selectLead);
      } else {
        state.selectedLeadIds.delete(checkbox.dataset.selectLead);
      }
      render();
    });
  });

  els.content.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(button.dataset.favorite);
    });
  });

  els.content.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openEditModal(row.dataset.id);
    });
  });
}

function renderMissingEmails(leads) {
  const missing = leads.filter((lead) => !hasEmail(lead));
  if (!missing.length) {
    els.content.innerHTML = emptyState("All visible leads already have an email.");
    return;
  }

  els.content.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Region</th>
            <th>Website</th>
            <th>Contact Clues</th>
            <th>Save Email</th>
          </tr>
        </thead>
        <tbody>
          ${missing.map((lead) => `
            <tr data-id="${escapeHtml(lead.id)}">
              <td><strong>${escapeHtml(lead.Company)}</strong><div class="meta-line">${escapeHtml(truncate(lead.Type, 70))}</div></td>
              <td>${escapeHtml(lead.Region)}</td>
              <td>${websiteLinkHtml(lead.WebsiteContact, { short: true })}</td>
              <td>${escapeHtml(truncate([lead.BuyerContact, lead.RoleMemo, lead.Phone].filter(Boolean).join(" · "), 110))}</td>
              <td>
                <div class="inline-save">
                  <input data-email-for="${escapeAttr(lead.id)}" placeholder="email@company.com">
                  <button class="button secondary" data-save-email="${escapeAttr(lead.id)}" type="button">Save</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  els.content.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("input,button,a")) return;
      state.selectedId = row.dataset.id;
      render();
    });
  });

  els.content.querySelectorAll("[data-save-email]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.saveEmail;
      const input = els.content.querySelector(`[data-email-for="${CSS.escape(id)}"]`);
      const email = input.value.trim();
      if (!email) return;
      updateLead(id, "Email", email);
      state.selectedId = id;
      render();
    });
  });
}

function renderCountries(leads) {
  const grouped = groupBy(leads, "Region");
  const byContinent = Object.entries(grouped)
    .sort(([regionA], [regionB]) => localeSort(regionA, regionB))
    .reduce((acc, [region, items]) => {
      const continent = continentFor(region);
      acc[continent] = acc[continent] || [];
      acc[continent].push([region, items]);
      return acc;
    }, {});

  els.content.innerHTML = CONTINENT_ORDER
    .filter((continent) => byContinent[continent]?.length)
    .map((continent) => {
      const countries = byContinent[continent];
      const leadCount = countries.reduce((sum, [, items]) => sum + items.length, 0);
      const cards = countries.map(([region, items]) => {
        const active = items.filter((lead) => !["Won", "Lost"].includes(lead.status)).length;
        return `
          <button class="region-card" data-region="${escapeHtml(region)}" type="button">
            <strong>${escapeHtml(region)}</strong>
            <span>${items.length} leads, ${active} active</span>
          </button>
        `;
      }).join("");

      return `
        <section class="continent-section">
          <div class="continent-heading">
            <h3>${escapeHtml(continent)}</h3>
            <span>${countries.length} countries, ${leadCount} leads</span>
          </div>
          <div class="region-grid">${cards}</div>
        </section>
      `;
    })
    .join("");

  els.content.querySelectorAll("[data-region]").forEach((card) => {
    card.addEventListener("click", () => {
      state.region = card.dataset.region;
      state.view = "leads";
      els.region.value = state.region;
      render();
    });
  });
}

function renderFollowups(leads) {
  const items = leads
    .filter((lead) => lead.nextFollowUp)
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

  if (!items.length) {
    els.content.innerHTML = emptyState("No follow-ups scheduled for the current filters.");
    return;
  }

  els.content.innerHTML = `
    <div class="followup-list">
      ${items.map((lead) => `
        <button class="followup-item" data-id="${escapeHtml(lead.id)}" type="button">
          <strong>${escapeHtml(lead.nextFollowUp)} · ${escapeHtml(lead.Company)}</strong>
          <span class="muted">${escapeHtml(lead.Region)} · ${escapeHtml(lead.status)} · ${escapeHtml(lead.BuyerContact || "No contact listed")}</span>
        </button>
      `).join("")}
    </div>
  `;

  els.content.querySelectorAll("[data-id]").forEach((item) => {
    item.addEventListener("click", () => {
      state.selectedId = item.dataset.id;
      state.view = "leads";
      render();
    });
  });
}

// ── Import History View ─────────────────────────────────────────────────────

async function renderImportHistory() {
  els.content.innerHTML = `
    <div class="table-wrap">
      <p style="padding: 16px; color: var(--muted); font-size:14px;" id="importHistoryLoading">⏳ 불러오는 중...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/leads/batches');
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    const batches = data.data;

    if (!batches.length) {
      els.content.innerHTML = emptyState('아직 CSV Import 기록이 없습니다. ⬆ Import CSV 버튼으로 데이터를 가져올 수 있습니다.');
      return;
    }

    els.content.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Batch ID</th>
              <th style="width:160px; text-align:center">가져온 날짜·시각</th>
              <th style="width:70px; text-align:center">건수</th>
              <th style="width:120px; text-align:center">롤백 (삭제)</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map(b => {
              const dateStr = b.importedAt
                ? new Date(b.importedAt).toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                : '-';
              return `
                <tr>
                  <td><code style="font-size:13px;background:#e0f2fe;color:#0c4a6e;padding:3px 8px;border-radius:6px;font-weight:600;border:1px solid #7dd3fc">${escapeHtml(b.batchId)}</code></td>
                  <td style="text-align:center;color:var(--text-secondary)">${escapeHtml(dateStr)}</td>
                  <td style="text-align:center;font-weight:700">${b.count}</td>
                  <td style="text-align:center">
                    <button class="button ghost"
                      style="color:#9f3333;border-color:#9f3333;padding:4px 10px;font-size:13px"
                      data-rollback-batch="${escapeAttr(b.batchId)}"
                      data-rollback-count="${b.count}"
                      type="button">
                      🗑 삭제
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    els.content.querySelectorAll('[data-rollback-batch]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const batchId = btn.dataset.rollbackBatch;
        const count = btn.dataset.rollbackCount;
        const ok = confirm(`"${batchId}" 배치의 리드 ${count}건을 모두 삭제하여 롤백하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
        if (!ok) return;

        btn.disabled = true;
        btn.textContent = '삭제 중...';

        try {
          const res = await fetch(`/api/leads/batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
          const result = await res.json();
          if (result.success) {
            // Reload baseLeads
            const leadsRes = await fetch('/api/leads');
            const leadsResult = await leadsRes.json();
            if (leadsResult.success) {
              baseLeads = leadsResult.data.map(lead => ({ ...lead, id: lead.leadId }));
              renderFilters();
            }
            // Re-render history view
            renderImportHistory();
          } else {
            alert('삭제 실패: ' + result.error);
            btn.disabled = false;
            btn.textContent = '🗑 삭제';
          }
        } catch (err) {
          alert('오류가 발생했습니다.');
          btn.disabled = false;
          btn.textContent = '🗑 삭제';
        }
      });
    });

  } catch (err) {
    els.content.innerHTML = emptyState('Import 기록을 불러오는 중 오류가 발생했습니다.');
  }
}

function initImportHistoryModal() {}



// stage 색상 매핑 (label 은 사용자 친화 문장)
const STAGE_STYLE = {
  imported:      { bg: '#f1f5f9', fg: '#475569', label: '📥 가져오기' },
  'ai-searched': { bg: '#ede9fe', fg: '#5b21b6', label: '🤖 AI 서칭' },
  verifying:     { bg: '#fef9c3', fg: '#854d0e', label: '🔍 검증 대기' },
  verified:      { bg: '#dcfce7', fg: '#166534', label: '✅ AI 검증 완료' },
  queued:        { bg: '#e0f2fe', fg: '#075985', label: '📨 보낼 메일' },
  contacted:     { bg: '#dbeafe', fg: '#1e40af', label: '✅ 발송 완료' },
  replied:       { bg: '#e0e7ff', fg: '#3730a3', label: '💬 답장 받음' },
  negotiating:   { bg: '#fed7aa', fg: '#9a3412', label: '🤝 대화 진행 중' },
  partner:       { bg: '#f3e8ff', fg: '#6b21a8', label: '⭐ 파트너십 확정' },
  archived:      { bg: '#f3f4f6', fg: '#6b7280', label: '📦 보관함' },
  failed:        { bg: '#fee2e2', fg: '#991b1b', label: '🚫 검증 실패' },
};
const STAGE_ORDER = ['imported','ai-searched','verifying','verified','queued','contacted','replied','negotiating','partner','archived','failed'];

// 각 stage 에서 실무적으로 자주 이동하는 다음 단계들 (원클릭 버튼)
const STAGE_QUICK_MOVES = {
  imported:      ['verifying', 'archived'],
  'ai-searched': ['verifying', 'verified', 'archived'],  // AI 발굴 후보 → 검증대기 승격 / 즉시 검증 완료 / 제외
  verifying:     ['verified', 'archived'],
  // 검증 완료에서 클라이언트가 실제로 하는 판단은 두 가지다.
  //   "이 업체는 아닌데"  → 검증 실패 (아예 대상이 아님)
  //   "지금은 아닌데"      → 보관함  (나중에 다시 볼 수도)
  verified:      ['queued', 'failed', 'archived'],
  queued:        ['verified', 'failed', 'archived'],   // 되돌리기 = 발송 리스트에서 빼기
  contacted:     ['replied', 'archived'],
  // 답장 받음에서 실제로 하는 판단은 셋이다.
  //   "얘기가 되겠다"     → 대화 진행 중
  //   "우리랑 안 맞는다"  → 검증 실패 (아예 대상이 아니었음)
  //   "지금은 아니다"     → 보관함 (나중에 다시 볼 수도)
  replied:       ['negotiating', 'partner', 'failed', 'archived'],
  negotiating:   ['partner', 'archived'],
  // 파트너십 확정에서 [대화 진행 중]으로 되돌리는 버튼은 뺐다 (대표님 요청 2026-09-14) —
  // 관계가 끝났거나 잘못 넣은 곳은 파트너십 화면의 [🗑 파트너십에서 삭제]로 뺀다.
  partner:       ['archived'],
  // 보관함·검증 실패에서 하는 일은 '잘못 뺐다 → 되돌리기' 하나다.
  // 검증 대기·가져오기는 사이드바에서 숨긴 단계라, 그리로 보내면 업체가 어디에도 안 보이게 된다.
  archived:      ['verified'],
  failed:        ['verified'],
};

// 리드 발송 횟수 배지 (emailHistory 중 status='sent' 만 카운트)
// MAX_SEND_COUNT_PER_LEAD = 3 · 초과 임박 시 색상 강조
function sendCountBadgeHtml(lead) {
  const eh = Array.isArray(lead.emailHistory) ? lead.emailHistory : [];
  const sentCount = eh.filter(h => h && h.status === 'sent').length;
  if (sentCount === 0) return '';
  const MAX = 3;
  const color = sentCount >= MAX ? '#991b1b' : (sentCount >= 2 ? '#92400e' : '#166534');
  const bg    = sentCount >= MAX ? '#fee2e2' : (sentCount >= 2 ? '#fef3c7' : '#dcfce7');
  const bd    = sentCount >= MAX ? '#fca5a5' : (sentCount >= 2 ? '#fcd34d' : '#86efac');
  const lastSent = lead.lastEmailSentAt ? new Date(lead.lastEmailSentAt).toLocaleDateString('ko-KR', { month:'2-digit', day:'2-digit' }) : '';
  const tip = `이 리드에 총 ${sentCount}회 발송됨\n최대 ${MAX}회 · 48h 최소 간격 · 초과 시 자동 차단${lastSent ? '\n최근 발송: ' + lastSent : ''}`;
  return `<span title="${escapeAttr(tip)}" style="display:inline-block;margin-top:3px;padding:2px 8px;background:${bg};color:${color};border:1px solid ${bd};border-radius:99px;font-size:10px;font-weight:700;line-height:1.4">✉ 메일 ${sentCount}회 발송${sentCount >= MAX ? ' (한도)' : ''}</span>`;
}

function stageCellHtml(lead) {
  const cur = lead.stage || 'imported';
  const style = STAGE_STYLE[cur] || STAGE_STYLE.imported;
  // 사이드바에서 숨긴 단계(가져오기·AI 서칭·검증 대기)는 목록에서 뺀다.
  // 옮겨놓고 나면 볼 화면이 없어서 리드가 사라진 것처럼 된다.
  // 단, 지금 그 단계에 있는 리드라면 자기 값은 보여야 하므로 예외로 남긴다.
  const HIDDEN_STAGES = new Set(['imported', 'ai-searched', 'verifying']);
  const options = STAGE_ORDER
    .filter(s => !HIDDEN_STAGES.has(s) || s === cur)
    .map(s => {
      const st = STAGE_STYLE[s];
      return `<option value="${s}" ${s === cur ? 'selected' : ''}>${st.label}</option>`;
    }).join('');

  // 원클릭 이동 버튼 (현재 stage 에서 실무적으로 자주 가는 다음 단계들)
  const quickTargets = STAGE_QUICK_MOVES[cur] || [];
  const quickBtns = quickTargets.map(target => {
    const t = STAGE_STYLE[target];
    // 같은 단계라도 어디서 옮기느냐에 따라 뜻이 다르다.
    // 답장까지 온 곳을 'failed' 로 보내는 것은 검증이 틀렸다는 뜻이 아니라
    // "얘기해 보니 우리랑 안 맞는다"는 뜻이라, 라벨을 그에 맞게 바꿔 준다.
    const CONTEXT_LABEL = {
      'replied:failed': '🚫 컨택 실패',
      'negotiating:failed': '🚫 컨택 실패',
      'queued:verified': '↩ 검증 완료로 되돌리기',
      // 검증 완료에서 보낼 곳으로 고르는 순간이라 '어디로 가는가' 를 적는다
      'verified:queued': '📨 발송 관리로 이동',
    };
    const shortLabel = CONTEXT_LABEL[`${cur}:${target}`]
      || t.label.replace(/^([^\s]+)\s(.+)$/, '$1 $2');
    // ⚠️ 인라인 onclick 으로 stopPropagation 을 하면 안 된다.
    //    클릭 핸들러가 document 에 위임 등록돼 있어서, 여기서 전파를 끊으면
    //    핸들러가 아예 호출되지 않는다 (버튼이 먹통이 된다).
    //    행 클릭 차단은 위임 핸들러 안에서 stopPropagation 으로 처리한다.
    return `<button
      type="button"
      class="stage-quick-move"
      data-quick-lead="${escapeAttr(lead.id)}"
      data-quick-target="${target}"
      title="${shortLabel.replace(/^[^\s]+\s/, '')}(으)로 이동"
      style="padding:2px 6px;font-size:10px;border:1px solid ${t.fg}30;border-radius:99px;background:${t.bg};color:${t.fg};font-weight:600;cursor:pointer;white-space:nowrap;line-height:1.4"
    >→ ${shortLabel}</button>`;
  }).join('');

  return `
    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
      <select
        class="stage-select"
        data-stage-lead="${escapeAttr(lead.id)}"
        onclick="event.stopPropagation()"
        style="padding:4px 6px;font-size:11px;border:1px solid ${style.fg}40;border-radius:6px;background:${style.bg};color:${style.fg};font-weight:600;cursor:pointer;min-width:120px"
      >${options}</select>
      ${quickBtns ? `<div style="display:flex;gap:3px;flex-wrap:wrap;max-width:180px">${quickBtns}</div>` : ''}
      ${sendCountBadgeHtml(lead)}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
//  메일함 — 외부 B2B 메일 관리 도구를 대체하는 화면들
//  파이프라인이 '회사' 중심이라면 여기는 '메일' 중심이다.
//  리드에 매칭되지 않은 메일까지 전부 여기서 본다.
// ══════════════════════════════════════════════════════════════

// accountId: 어느 메일함을 볼지. 'all' 이면 등록된 계정 전부.
// 등록된 발송 계정(MailAccount)이 곧 수신 계정이다 — 이카운트는 자격증명이 같다.
var _inboxState = { page: 1, classification: '', q: '', linked: '', accountId: 'all', group: '', trashed: false, today: false };
var _mailAccountsCache = null;
var _mailGroupsCache = null;

/**
 * 지금 보고 있는 메일함의 계정 id.
 *
 * 대표 계정이 곧 메일함이다. 사용자가 메일함에서 계정 탭을 직접 누른 동안에만
 * (accountPicked) 그 선택을 따르고, 그 밖에는 늘 대표 계정을 가리킨다.
 *
 * _inboxState 는 메모리에만 있어서 새로고침하면 accountId 가 'all' 로 돌아간다.
 * 사이드바 배지(받은 메일함·회신 필요·기한 관리)는 메일함 화면보다 먼저 그려지기
 * 때문에, 이 함수를 거치지 않으면 대표를 바꿔놔도 배지만 '전체 계정' 숫자로 남는다.
 * 실제로 대표를 fe 로 바꿨는데 배지가 david 것까지 합친 100 으로 떠 있었다.
 *
 * accountId 는 MailAccount._id 문자열과 같다(lib/mail/accounts.ts summarize).
 */
function currentMailboxAccountId() {
  if (typeof _inboxState === 'undefined') return 'all';
  if (_inboxState.accountPicked) return _inboxState.accountId || 'all';
  const def = (_mailAccountsCache?.accounts || []).find((a) => a.isDefault);
  if (def?.accountId) {
    _inboxState.accountId = def.accountId;   // 화면들이 같은 값을 보게 맞춰둔다
    return def.accountId;
  }
  return _inboxState.accountId || 'all';
}

// 거래처(폴더) 목록 — 대표가 메일함에서 나눠둔 폴더가 그대로 온다
async function loadMailGroups(force) {
  if (!force && _mailGroupsCache) return _mailGroupsCache;
  try {
    const acc = currentMailboxAccountId();
    const r = await safeJsonFetch(`/api/mail/groups?accountId=${encodeURIComponent(acc)}`);
    if (r && r.success) { _mailGroupsCache = r; return r; }
  } catch (e) { console.warn('mail-groups', e); }
  return null;
}

// ⚠️ 이름을 loadMailAccounts 로 두면 안 된다.
//    아래쪽(계정 관리 화면)에 같은 이름의 함수가 또 있어서 이게 통째로 덮인다.
//    둘은 부르는 API 도(/api/mail/accounts vs /api/mail-accounts) 반환 모양도
//    (객체 {accounts,legacyCount} vs 배열) 달라서, 덮이면 메일함이 배열을 받고
//    accInfo.accounts 가 undefined 가 된다 — "등록된 계정 없음" 이 뜨던 원인.
async function loadInboxAccounts(force) {
  if (!force && _mailAccountsCache) return _mailAccountsCache;
  try {
    const r = await safeJsonFetch('/api/mail/accounts');
    if (r && r.success) {
      _mailAccountsCache = r;
      return r;
    }
  } catch (e) { console.warn('mail-accounts', e); }
  return null;
}

// 메일 분류 7가지.
//
// desc 는 배지에 마우스를 올리면 뜬다. 이름만으로는 "광고와 자동발송이 뭐가
// 다른가", "제휴는 어디까지인가"를 알 수 없어서, 판단 기준을 한 줄로 붙였다.
// (분류 규칙 자체는 src/lib/ai/analyze-mail.ts 의 SYSTEM 프롬프트에 있다)
const MAIL_CLASS = {
  b2b:        { label: '💼 B2B 거래', bg: '#dcfce7', fg: '#166534',
                desc: '실제 거래·수입·유통·대리점·OEM 관련. 이미 거래 중이거나 구체적인 거래 의사가 있는 메일.' },
  inquiry:    { label: '❓ 문의·견적', bg: '#dbeafe', fg: '#1e40af',
                desc: '제품·가격·MOQ·재고·견적·샘플 문의. 아직 거래 전이지만 회사와 담당자가 특정되는 실제 문의.' },
  partner:    { label: '🤝 제휴',     bg: '#e0e7ff', fg: '#3730a3',
                desc: '제휴·협업·입점·미디어·전시회 참가 제안 중 검토할 가치가 있는 것.' },
  newsletter: { label: '📰 뉴스레터', bg: '#fef3c7', fg: '#92400e',
                desc: '정기 소식지·업계 뉴스·구독 콘텐츠. 개별 응답이 필요 없는 것.' },
  ad:         { label: '📢 광고',     bg: '#fee2e2', fg: '#991b1b',
                desc: '사람이 보냈지만 우리에게 무언가를 팔려는 메일. 대량 발송 영업, 전시회 참가 권유, 마케팅·개발 외주 제안 등.' },
  system:     { label: '⚙ 자동발송',  bg: '#f1f5f9', fg: '#64748b',
                desc: '사람이 아니라 시스템이 자동으로 보낸 것. 인증번호, 알림, 부재중 자동응답, 읽음 확인, 발송 실패 통지, 건물 공지 등.' },
  unknown:    { label: '· 미분류',    bg: '#f8fafc', fg: '#475569',
                desc: '위 어디에도 확실히 넣기 어렵거나, 아직 AI 분석을 돌리지 않아 판단 근거가 부족한 메일.' },
};

// 광고·자동발송을 모아두는 폴더 이름 — 서버(lib/mail/ingest.ts)와 같아야 한다.
// 다르면 화면에서 거래처 폴더인 줄 알고 목록 사이에 섞여 나온다.
var AD_FOLDER_NAME = '광고·자동발송';

// ═══ 📤 보낸 메일함 ═══════════════════════════════════════════
//
// 받은 메일함 폴더 목록 맨 아래의 [📤 보낸 메일함]을 누르면 열린다.
// 사이드바 메뉴를 늘리지 않고 휴지통처럼 폴더의 하나로 둔다.
//
// 보낸 메일은 DB 에 모으지 않고 **이카운트 보낸메일함을 그 자리에서 읽는다**
// (/api/mail/sent). 받은 메일함 숫자·대화 묶기에 섞이지 않고, 웹메일과 늘 같다.
// 메일 서버에 붙어서 읽기 때문에 한 쪽에 2~5초 걸린다 — 기다리는 동안 무엇을 하는지 적어 둔다.
var _sentState = { page: 1, q: '', data: null, busy: false };
/** 보낸 메일함 폴더를 받은 메일함 폴더 목록에 보여줄지 — 대표님 요청으로 일단 숨김 (2026-09-14) */
var SHOW_SENT_MAILBOX = true;   // 대표님 요청으로 다시 켬 (2026-09-14)

async function renderSentMailPage() {
  const accountId = currentMailboxAccountId();
  els.content.innerHTML = `<div class="inline-loader">이카운트 보낸메일함을 읽는 중… (2~5초)</div>`;

  const params = new URLSearchParams({ page: String(_sentState.page) });
  if (_sentState.q) params.set('q', _sentState.q);
  if (accountId && accountId !== 'all') params.set('accountId', accountId);

  const d = await safeJsonFetch('/api/mail/sent?' + params.toString());
  if (!_inboxState.sent || (state.view !== 'tool-inbox' && state.view !== 'tool-inbox-needsreply')) return;   // 기다리는 사이 다른 화면으로 갔다

  const back = `<button type="button" id="sentBack"
      style="padding:7px 14px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-surface);
             color:var(--text-secondary);font-size:12.5px;font-weight:700;cursor:pointer">← 받은 메일함</button>`;

  if (!d || !d.success) {
    els.content.innerHTML = `
      <div style="margin-bottom:12px">${back}</div>
      <div class="empty-detail"><h3>보낸메일함을 읽지 못했습니다</h3><p>${escapeHtml((d && d.error) || '잠시 뒤 다시 시도해 주세요.')}</p></div>`;
    els.content.querySelector('#sentBack')?.addEventListener('click', leaveSentMailPage);
    return;
  }
  _sentState.data = d;

  const dt = (v) => {
    if (!v) return '';
    const x = new Date(v); const now = new Date();
    if (x.toDateString() === now.toDateString()) return x.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return x.toLocaleDateString('ko-KR', x.getFullYear() === now.getFullYear()
      ? { month: '2-digit', day: '2-digit' } : { year: '2-digit', month: '2-digit', day: '2-digit' });
  };
  const who = (list) => {
    const a = (list || [])[0];
    if (!a) return '(받는 사람 없음)';
    const more = (list || []).length > 1 ? ` 외 ${(list || []).length - 1}명` : '';
    return escapeHtml(sentName(a.name) || a.address) + more;
  };

  const rows = (d.items || []).map((m) => `
    <tr class="sent-row" data-uid="${m.uid}" style="cursor:pointer">
      <td style="white-space:nowrap;color:var(--text-tertiary);font-size:12px;width:90px">${dt(m.date)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <div style="font-weight:600;color:var(--text-primary);font-size:13px;overflow:hidden;text-overflow:ellipsis">${who(m.to)}</div>
        <div style="font-size:11px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis">${escapeHtml((m.to && m.to[0] && m.to[0].address) || '')}</div>
      </td>
      <td style="color:var(--text-primary);font-size:13px">${escapeHtml(String(m.subject || '(제목 없음)').slice(0, 90))}</td>
      <td style="width:28px;text-align:center">${m.hasAttachment ? '<span title="첨부파일 있음">📎</span>' : ''}</td>
    </tr>`).join('');

  const pager = `
    <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;margin:10px 0">
      <button type="button" class="sent-page" data-page="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}
        style="padding:6px 12px;border-radius:7px;border:1px solid var(--border-default);background:var(--bg-surface);cursor:pointer;${d.page <= 1 ? 'opacity:.4;cursor:default' : ''}">‹ 이전</button>
      <span style="font-size:12px;color:var(--text-tertiary)">${d.page} / ${d.totalPages} 쪽</span>
      <button type="button" class="sent-page" data-page="${d.page + 1}" ${d.page >= d.totalPages ? 'disabled' : ''}
        style="padding:6px 12px;border-radius:7px;border:1px solid var(--border-default);background:var(--bg-surface);cursor:pointer;${d.page >= d.totalPages ? 'opacity:.4;cursor:default' : ''}">다음 ›</button>
    </div>`;

  els.content.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${back}
      <div style="flex:1;min-width:220px">
        <div style="font-size:16px;font-weight:800;color:var(--text-primary)">📤 보낸 메일함</div>
        <div style="font-size:12px;color:var(--text-tertiary)">
          ${escapeHtml(d.account.address)} · 이카운트 보낸메일함을 그대로 보여줍니다 · 전체 ${Number(d.total).toLocaleString()}통${_sentState.q ? ` · "${escapeHtml(_sentState.q)}" 검색` : ''}
        </div>
      </div>
      <form id="sentSearch" style="display:flex;gap:6px">
        <input id="sentQ" type="search" value="${escapeAttr(_sentState.q)}" placeholder="제목·받는 사람 주소"
          style="padding:7px 10px;border:1px solid var(--border-default);border-radius:8px;font-size:12.5px;min-width:200px;background:var(--bg-surface);color:var(--text-primary)">
        <button type="submit" style="padding:7px 12px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-surface);cursor:pointer;font-size:12.5px">찾기</button>
      </form>
    </div>
    <!-- 아웃룩에서 보낸 메일이 여기 없는 경우가 있다 — 그 프로그램이 서버에 사본을 안 남기면
         메일 서버에는 아무 기록이 없어 이 화면도 보여줄 수가 없다. 무엇을 바꿔야 하는지 알려 준다. -->
    <details style="margin:-4px 0 12px;border:1px solid var(--border-subtle);border-radius:9px;background:var(--bg-surface-alt)">
      <summary style="cursor:pointer;padding:8px 12px;font-size:12px;color:var(--text-secondary)">
        보낸 메일이 여기 안 보이나요? <span style="color:var(--text-quaternary)">· 메일 프로그램 설정 확인</span>
      </summary>
      <div style="padding:2px 14px 12px;font-size:12px;color:var(--text-secondary);line-height:1.75">
        이 화면은 <b>이카운트 서버의 보낸메일함</b>을 그대로 보여줍니다. 아래 경우에는 서버에 사본이 없어 보이지 않습니다.
        <ul style="margin:6px 0 0;padding-left:18px">
          <li><b>아웃룩을 POP 으로 쓰는 경우</b> — 보낸 메일이 그 컴퓨터에만 남습니다.
            계정을 <b>IMAP</b> 으로 등록하고 <b>[보낸 편지함을 서버에 저장]</b> 을 켜 주세요.</li>
          <li><b>웹메일에서 "보낸 메일 저장 안 함"</b> 으로 보낸 경우</li>
        </ul>
        이 CRM 에서 보낸 메일(답장·업체 발송·예약 발송)은 자동으로 여기 남습니다.
        받은편지함에 사본이 있는 메일도 매일 한 번 자동으로 채워 넣습니다.
      </div>
    </details>
    ${(d.items || []).length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>보낸 시각</th><th>받는 사람</th><th>제목</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${pager}` : `<div class="empty-detail"><h3>${_sentState.q ? '찾는 메일이 없습니다' : '보낸 메일이 없습니다'}</h3></div>`}`;

  els.content.querySelector('#sentBack')?.addEventListener('click', leaveSentMailPage);
  els.content.querySelector('#sentSearch')?.addEventListener('submit', (e) => {
    e.preventDefault();
    _sentState.q = (els.content.querySelector('#sentQ')?.value || '').trim();
    _sentState.page = 1;
    renderSentMailPage();
  });
  els.content.querySelectorAll('.sent-page').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    _sentState.page = Number(b.dataset.page) || 1;
    renderSentMailPage();
  }));
  els.content.querySelectorAll('.sent-row').forEach((tr) => tr.addEventListener('click', () => {
    openSentMailModal(Number(tr.dataset.uid), d.account.accountId);
  }));
}

/** 메일 서버가 이름을 'Camilla Hjerrild' 처럼 따옴표째 주는 경우가 있어 떼어 낸다 */
function sentName(name) {
  const s = String(name || '').trim();
  const m = s.match(/^'(.*)'$/) || s.match(/^"(.*)"$/);
  return (m ? m[1] : s).trim();
}

function leaveSentMailPage() {
  _inboxState.sent = false;
  _sentState.page = 1;
  _sentState.q = '';
  render();
}

function closeSentMailModal() {
  document.getElementById('sentMailRoot')?.remove();
  document.body.classList.remove('modal-open');
}

async function openSentMailModal(uid, accountId) {
  closeSentMailModal();
  const root = document.createElement('div');
  root.id = 'sentMailRoot';
  root.className = 'modal-backdrop';
  root.style.display = 'flex';
  root.innerHTML = `<div class="modal-card" style="max-width:920px;width:94vw;max-height:90vh;display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden">
      <div class="inline-loader" style="padding:40px">보낸 메일을 읽는 중… (2~5초)</div></div>`;
  document.body.appendChild(root);
  document.body.classList.add('modal-open');
  bindBackdropDismiss(root, closeSentMailModal);
  const onKey = (e) => { if (e.key === 'Escape') { closeSentMailModal(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  const d = await safeJsonFetch(`/api/mail/sent/${uid}${q}`);
  if (!document.getElementById('sentMailRoot')) return;
  const card = root.querySelector('.modal-card');
  if (!d || !d.success) {
    card.innerHTML = `<div style="padding:28px"><h3 style="margin:0 0 8px">메일을 열지 못했습니다</h3>
      <p style="color:#64748b">${escapeHtml((d && d.error) || '잠시 뒤 다시 시도해 주세요.')}</p>
      <button type="button" id="sentClose" style="margin-top:10px;padding:8px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">닫기</button></div>`;
    card.querySelector('#sentClose')?.addEventListener('click', closeSentMailModal);
    return;
  }
  const m = d.mail;
  const addrs = (list) => (list || []).filter(Boolean).map((a) => sentName(a.name) ? `${escapeHtml(sentName(a.name))} &lt;${escapeHtml(a.address)}&gt;` : escapeHtml(a.address)).join(', ') || '—';
  const when = m.date ? new Date(m.date).toLocaleString('ko-KR') : '';
  const bodyHtml = m.html
    ? `<div class="sent-body-html" style="font-size:14.5px;color:#1e293b;line-height:1.75;word-break:break-word">${renderMailBodyHtml(m.html)}</div>`
    : `<div style="font-size:15px;color:#1e293b;line-height:1.85;white-space:pre-wrap;word-break:break-word">${escapeHtml(m.text || '(본문 없음)')}</div>`;
  const atts = (m.attachments || []).map((a) => `
    <button type="button" class="mail-att-dl" data-name="${escapeAttr(a.filename || '첨부파일')}"
      data-url="${escapeAttr(`/api/mail/sent/${m.uid}/attachment?part=${encodeURIComponent(a.partId)}&name=${encodeURIComponent(a.filename || 'attachment')}&type=${encodeURIComponent(a.contentType || '')}${accountId ? '&accountId=' + encodeURIComponent(accountId) : ''}`)}"
      style="display:inline-flex;align-items:center;gap:6px;padding:6px 11px;font-size:12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;cursor:pointer">
      <span>${attachmentIcon(a.contentType, a.filename)}</span>
      <span style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.filename || '첨부파일')}</span>
      ${a.size ? `<span style="color:#94a3b8;font-size:11px">${fmtAttachmentSize(a.size)}</span>` : ''}
      <span class="mail-att-state" style="color:#2563eb;font-weight:700">⬇</span>
    </button>`).join('');

  card.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;gap:12px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <span style="font-size:10.5px;font-weight:800;color:#1d4ed8;background:#eff6ff;border-radius:99px;padding:2px 8px">📤 보낸 메일</span>
        <h3 style="margin:6px 0 6px;font-size:17px;color:#0f172a;word-break:break-word">${escapeHtml(m.subject || '(제목 없음)')}</h3>
        <div style="font-size:12.5px;color:#475569;line-height:1.7">
          <div><b style="color:#64748b">받는 사람</b> ${addrs(m.to)}</div>
          ${(m.cc || []).length ? `<div><b style="color:#64748b">참조</b> ${addrs(m.cc)}</div>` : ''}
          <div><b style="color:#64748b">보낸 사람</b> ${addrs([m.from])} · ${escapeHtml(when)}</div>
        </div>
      </div>
      <button type="button" id="sentClose" title="닫기 (Esc)"
        style="border:none;background:none;font-size:22px;color:#94a3b8;cursor:pointer;line-height:1">×</button>
    </div>
    <div style="padding:18px 22px;overflow:auto;flex:1;background:#fcfcfd">
      ${bodyHtml}
      ${atts ? `<div style="margin-top:16px">
        <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px">📎 첨부파일 ${(m.attachments || []).length}개 · 누르면 내려받습니다</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${atts}</div></div>` : ''}
    </div>`;
  card.querySelector('#sentClose')?.addEventListener('click', closeSentMailModal);
}

async function renderInboxPage(opts) {
  const needsReplyOnly = opts && opts.needsReplyOnly === true;
  // [📤 보낸 메일함]을 연 상태면 그 화면을 그린다 (받은 메일함 안의 폴더 하나로 둔다)
  if (_inboxState.sent && !needsReplyOnly) return renderSentMailPage();
  els.content.innerHTML = `<div class="inline-loader">메일함 불러오는 중…</div>`;

  // 계정 목록을 먼저 받아야 대표 계정을 알 수 있다. 이 줄이 params 뒤에 있던 동안에는
  // 새로고침 직후 첫 조회가 accountId='all' 로 나가서 남의 계정 메일까지 섞여 보였다.
  const accInfo = await loadInboxAccounts();

  const params = new URLSearchParams({
    page: String(_inboxState.page),
    limit: '50',
  });
  if (needsReplyOnly) params.set('needsReply', '1');
  if (_inboxState.classification) params.set('classification', _inboxState.classification);
  if (_inboxState.q) params.set('q', _inboxState.q);
  if (_inboxState.linked) params.set('linked', _inboxState.linked);
  params.set('accountId', currentMailboxAccountId());
  if (_inboxState.group) params.set('group', _inboxState.group);
  // 휴지통 보기 — 치운 메일은 기본 목록에서 빠져 있다
  if (_inboxState.trashed) { params.set('trashed', '1'); params.set('flat', '1'); }
  // 오늘 온 메일 — 대화로 접지 않고 낱개로 본다.
  // 위에 "오늘 12통" 이라고 써 놓고 목록이 8줄이면(대화로 접혀서) 숫자가 어긋난다.
  if (_inboxState.today && !_inboxState.trashed) { params.set('today', '1'); params.set('flat', '1'); }

  const groupInfo = await loadMailGroups();
  // 상단 [오늘 온 메일]의 숫자는 사이드바 배지와 같은 API 에서 온다.
  // 이 await 가 없으면 새로고침 직후 첫 화면에서만 숫자가 비어 보인다.
  await loadMailCounts();

  let data;
  try {
    data = await safeJsonFetch(`/api/mail/inbox?${params.toString()}`);
  } catch (e) {
    els.content.innerHTML = `<div class="empty-detail"><h3>불러오기 실패</h3><p>${escapeHtml(String(e.message || e))}</p></div>`;
    return;
  }
  if (!data || !data.success) {
    els.content.innerHTML = `<div class="empty-detail"><h3>조회 실패</h3><p>${escapeHtml(data?.error || '알 수 없는 오류')}</p></div>`;
    return;
  }

  const items = data.items || [];
  const total = data.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const dt = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  };

  // 수집이 한 번도 안 돌았으면 빈 목록 대신 다음 행동을 알려준다.
  //
  // 단, [오늘 온 메일]을 보는 중이면 이 화면으로 빠지지 않는다. 오늘 0통인 것은
  // 정상인데 "수집된 메일이 없습니다"가 뜨면 수집이 고장난 줄 알게 되고,
  // 무엇보다 오늘 보기를 끄는 버튼까지 화면에서 사라져 되돌아갈 길이 없어진다.
  // ⚠️ 폴더·휴지통·연결 필터가 걸린 상태도 빼야 한다. 빠져 있어서, 빈 폴더(예: Yogibo Japan 0통)를
  //    누르면 폴더 패널까지 사라진 "수집된 메일이 없습니다" 화면에 갇혀 되돌아갈 길이 없었다.
  if (!total && !_inboxState.q && !_inboxState.classification && !_inboxState.today
      && !_inboxState.group && !_inboxState.trashed && !_inboxState.linked) {
    els.content.innerHTML = `
      <div class="empty-detail">
        <h3>${needsReplyOnly ? '회신이 필요한 메일이 없습니다' : '수집된 메일이 없습니다'}</h3>
        <p>${needsReplyOnly
          ? '상대가 질문이나 요청을 보내면 여기에 모입니다.'
          : '이카운트 메일함에서 아직 메일을 가져오지 않았습니다.'}</p>
        ${needsReplyOnly ? '' : `
          <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
            <button class="button" id="inboxIngestBtn" type="button">📥 지금 메일 가져오기</button>
            <button class="button primary" id="inboxBackfillBtn" type="button" title="이카운트 메일함에서 최근 2달 메일을 전부 가져와 분류합니다">📥 전체 메일함 2달 가져오기</button>
            <button class="button secondary" data-goto-view="tool-mail-settings" type="button">🔌 수신 설정</button>
          </div>`}
      </div>`;
    bindInboxActions();
    return;
  }

  const filterChip = (label, key, val) => {
    const active = _inboxState[key] === val;
    return `<button type="button" class="inbox-filter" data-filter-key="${key}" data-filter-val="${escapeAttr(val)}"
      style="padding:5px 12px;font-size:12px;border-radius:99px;cursor:pointer;font-weight:600;
             border:1px solid ${active ? 'var(--brand)' : 'var(--border-default)'};
             background:${active ? 'var(--brand-soft)' : 'var(--bg-surface)'};
             color:${active ? 'var(--brand-text)' : 'var(--text-secondary)'}">${label}</button>`;
  };

  // 제목 앞에 붙는 거래처 폴더 태그.
  //
  // [오늘 온 메일]은 폴더로 나누지 않고 온 순서대로 다 보여준다. 대신
  // 한 줄 한 줄에 "이건 사업개발 폴더로 들어갔다" 가 보여야 한다 —
  // 안 그러면 오늘 본 메일을 나중에 어디서 찾을지 알 수 없다.
  // 그래서 오늘 보기에서는 미분류까지 태그를 붙인다(평소엔 폴더가 있을 때만).
  // 태그는 버튼이다 — 눌러서 그 자리에서 폴더를 지정한다.
  //
  // 자동 분류는 확실한 것만 잡고 나머지는 미분류로 남긴다(억지로 넣으면
  // 1통짜리 폴더가 무더기로 생긴다). 그래서 미분류는 계속 쌓이는데,
  // 그걸 옮기려면 체크박스를 켜고 위쪽 선택바의 드롭다운을 찾아야 했다.
  // 보고 있는 자리에서 바로 넣을 수 있어야 실제로 정리가 된다.
  //
  // 행 클릭(메일 상세 열기)은 button 을 제외하므로 서로 부딪히지 않는다.
  const folderTag = (m) => {
    const id = escapeAttr(String(m._id));
    if (m.group) {
      return `<button type="button" class="mail-folder-tag" data-mail-id="${id}" data-cur="${escapeAttr(m.group)}"
                title="거래처 폴더 · ${escapeAttr(m.groupBy === 'manual' ? '직접 지정' : m.groupBy || '자동 분류')}&#10;눌러서 다른 폴더로 옮깁니다"
                style="background:var(--bg-surface-alt);color:var(--text-secondary);border:1px solid var(--border-subtle);
                       border-radius:5px;padding:1px 6px;font-size:10px;font-weight:700;margin-right:5px;
                       cursor:pointer">📁 ${escapeHtml(m.group)}</button>`;
    }
    // 미분류 태그는 오늘 보기와 미분류 폴더에서만 띄운다.
    // 평소 목록에서까지 모든 줄에 뜨면 제목이 밀려 읽기 어려워진다.
    const sug = m.groupSuggest && m.groupSuggest.group;
    const showHere = _inboxState.today || _inboxState.group === '__none__';
    if (!showHere && !sug) return '';
    // 전에 같은 곳에서 온 메일을 넣어둔 폴더가 있으면 그것을 먼저 권한다
    if (sug) {
      return `<button type="button" class="mail-folder-tag" data-mail-id="${id}" data-cur=""
                data-suggest="${escapeAttr(sug)}"
                title="이 발신자의 메일을 전에 [${escapeAttr(sug)}] 폴더에 넣으셨습니다 (${m.groupSuggest.count}통).&#10;눌러서 폴더를 지정합니다."
                style="background:#fffbeb;color:#92400e;border:1px solid #fcd34d;
                       border-radius:5px;padding:1px 6px;font-size:10px;font-weight:700;margin-right:5px;
                       cursor:pointer">📥 ${escapeHtml(sug)}?</button>`;
    }
    return `<button type="button" class="mail-folder-tag" data-mail-id="${id}" data-cur=""
              title="아직 어느 거래처 폴더에도 들어가지 않았습니다. 눌러서 지정하세요."
              style="color:var(--text-tertiary);background:var(--bg-surface);
                     border:1px dashed var(--border-strong);
                     border-radius:5px;padding:1px 6px;font-size:10px;font-weight:700;margin-right:5px;
                     cursor:pointer">❔ 폴더 지정</button>`;
  };

  const rows = items.map((m) => {
    const cls = MAIL_CLASS[m.classification] || MAIL_CLASS.unknown;
    const from = m.from || {};
    const threadBadge = (m.threadCount || 1) > 1
      ? `<span style="background:var(--bg-surface-alt);color:var(--text-tertiary);border-radius:99px;
                     padding:1px 7px;font-size:10px;font-weight:700;margin-left:6px">${m.threadCount}통</span>`
      : '';
    // 우리가 보낸 메일(보낸메일함에서 함께 수집된 것)은 '할 일'이 아니다.
    // 예전에는 받은 메일과 똑같이 그려서, 목록 맨 위에 우리 전무가 보낸 메일이
    // 발신자로 뜨고 '⚠ 회신 필요'까지 붙었다 — 자기 메일에 답하라는 셈이다.
    const isOut = m.direction === 'out';
    const noise = ['ad', 'system', 'newsletter'].includes(m.classification);
    const needsReply = !isOut && !noise && m.analysis && m.analysis.needsReply;
    const deadline = isOut || noise ? null : (m.threadDeadline || (m.analysis && m.analysis.deadline));
    const toFirst = (m.to && m.to[0]) || {};
    // 리드에 연결된 메일은 그 회사의 대화로 바로 갈 수 있게 한다
    const leadLink = m.leadId
      ? `<button type="button" class="conversation-btn" data-conv-lead="${escapeAttr(m.leadId)}"
           style="padding:2px 8px;font-size:10px;border:1px solid #16a34a;border-radius:99px;
                  background:#16a34a;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap">
           💬 리드 대화</button>`
      : `<span title="이 메일을 보낸 곳이 우리 업체 목록에 없습니다.&#10;&#10;우리가 먼저 메일을 보낸 적이 없는 곳(새 문의·광고 등)이면 정상입니다.&#10;거래 중인 곳인데 미연결이면, 그 주소로 업체를 등록하면 대화가 이어서 보입니다.&#10;(대화 진행 중·파트너십 화면의 [+ 업체 직접 추가])" style="font-size:10px;color:var(--text-quaternary);border-bottom:1px dotted var(--border-strong);cursor:help">리드 미연결 <b>?</b></span>`;

    return `
      <tr class="inbox-row" data-mail-id="${escapeAttr(String(m._id))}" style="cursor:pointer">
        <td style="width:32px"><input type="checkbox" class="inbox-check" data-mail-id="${escapeAttr(String(m._id))}"
          style="width:15px;height:15px;cursor:pointer"></td>
        <td style="white-space:nowrap;color:var(--text-tertiary);font-size:12px">${dt(m.date)}</td>
        <td>
          ${isOut ? `
          <div style="font-weight:600;color:#475569;font-size:13px">
            <span style="font-size:10px;font-weight:800;color:#2563eb;background:#eff6ff;border-radius:4px;padding:1px 5px;margin-right:4px">↗ 보냄</span>${escapeHtml(toFirst.name || toFirst.address || '(받는 사람 없음)')}
          </div>
          <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(from.address || '')} 이(가) 보냄</div>` : `
          <div style="font-weight:600;color:var(--text-primary);font-size:13px">
            ${escapeHtml(from.name || from.address || '(발신자 없음)')}
          </div>
          <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(from.address || '')}</div>`}
        </td>
        <td>
          <div style="color:var(--text-primary);font-size:13px">
            ${folderTag(m)}
            ${escapeHtml(String(m.subject || '(제목 없음)').slice(0, 70))}${threadBadge}
          </div>
          <!-- 요약은 AI 분석이 끝난 메일만 보여준다. 수집 때 도는 무료 로컬 분석은
               '질문 21개 · 요청 표현 감지' 같은 판정 근거라 사람이 읽을 요약이 아니다. -->
          ${m.analysis?.method === 'ai' && m.analysis?.summary ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${escapeHtml(String(m.analysis.summary).slice(0, 90))}</div>` : ''}
        </td>
        <td style="white-space:nowrap">
          <span title="${escapeAttr(cls.desc || '')}" style="background:${cls.bg};color:${cls.fg};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;cursor:help">${cls.label}</span>
        </td>
        <td style="white-space:nowrap">
          ${m.status === 'replied'
            ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700"
                 title="${m.repliedOutside ? '이카운트 웹메일에서 답한 것을 보낸메일함에서 확인했습니다' : '앱에서 회신했습니다'}">
                 ✅ 회신함${m.repliedOutside ? ' (웹메일)' : ''}</span>`
            : isOut
              ? '<span style="color:#64748b;font-size:11px" title="우리가 보낸 메일입니다">↗ 보낸 메일</span>'
            : needsReply
              ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">⚠ 회신 필요</span>`
              : '<span style="color:var(--text-quaternary);font-size:11px">—</span>'}
          ${deadline ? `<div style="font-size:10px;color:#b45309;margin-top:3px">기한 ${dt(deadline)}</div>` : ''}
        </td>
        <td style="white-space:nowrap">${leadLink}</td>
      </tr>`;
  }).join('');

  // ── 계정 선택 탭 ──
  // 등록된 계정이 하나뿐이면 굳이 보여주지 않는다 (선택지가 없는 선택기는 잡음이다)
  const accounts = accInfo?.accounts || [];

  // 어느 계정 메일함을 그릴지는 한 군데(currentMailboxAccountId)에서만 정한다.
  // 사이드바 배지도 같은 함수를 쓰기 때문에 화면끼리 숫자가 어긋나지 않는다.
  // 대표가 아직 하나도 없으면(예: 전부 해제된 상태) 첫 계정으로 떨어뜨린다.
  {
    const resolved = currentMailboxAccountId();
    if (resolved === 'all' && !_inboxState.accountPicked && accounts.length) {
      _inboxState.accountId = accounts[0].accountId;
    }
  }
  // 계정 탭은 뺐다.
  //
  // 대표 계정을 지정하면 메일함이 그 계정 것으로 바뀌는데, 위에 계정 탭이 또
  // 있으면 "지금 누구 메일함인가"가 두 군데서 정해지는 셈이라 헷갈린다.
  // 계정을 바꾸려면 [📬 메일 계정]에서 대표 계정을 바꾸면 된다.
  // (되살리려면 아래 false 를 accounts.length > 1 로 돌리면 된다.)
  const accountTabs = false ? `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text-tertiary);font-weight:700;margin-right:2px">메일함</span>
      ${[{ accountId: 'all', label: '전체', address: '', mailCount: accounts.reduce((a, x) => a + (x.mailCount || 0), 0) }]
        .concat(accounts)
        .map((a) => {
          const active = _inboxState.accountId === a.accountId;
          return `<button type="button" class="inbox-account" data-account-id="${escapeAttr(a.accountId)}"
            title="${escapeAttr(a.address || '등록된 계정 전체')}"
            style="padding:5px 12px;font-size:12px;border-radius:8px;cursor:pointer;font-weight:600;
                   border:1px solid ${active ? 'var(--brand)' : 'var(--border-default)'};
                   background:${active ? 'var(--brand-soft)' : 'var(--bg-surface)'};
                   color:${active ? 'var(--brand-text)' : 'var(--text-secondary)'}">
            ${escapeHtml(a.label)}${a.isDefault ? ' <span title="설정 → 메일 계정에서 지정한 대표 계정입니다" style="font-size:9.5px;font-weight:800;color:#1e40af">대표</span>' : ''}
            <span style="opacity:.65;font-weight:400">${a.mailCount || 0}</span>
          </button>`;
        }).join('')}
      ${accInfo?.legacyCount
        ? `<span style="font-size:11px;color:var(--text-quaternary)"
             title="계정 구분 없이 수집된 옛 메일입니다. 다시 수집하면 계정이 붙습니다.">
             · 계정 미분류 ${accInfo.legacyCount}통</span>`
        : ''}
    </div>` : '';

  // ── 지금 어느 메일함을 보고 있는가 ──
  // 계정 탭은 등록 계정이 2개 이상일 때만 뜨기 때문에, 탭이 없으면 화면 어디에도
  // "지금 보고 있는 주소"가 적혀 있지 않았다. 남의 메일함을 자기 것으로 착각한 채
  // 회신 필요 건수를 읽는 일이 생길 수 있어, 주소를 항상 맨 위에 박아둔다.
  const curAcc = accounts.find((a) => a.accountId === _inboxState.accountId);
  const viewingLabel = curAcc
    ? (curAcc.address || curAcc.label)
    : (accounts.map((a) => a.address).filter(Boolean).join('  ·  ') || '등록된 계정 없음');
  const viewingBanner = `
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:10px;padding:10px 14px;
                background:var(--brand-soft,#eef2ff);border:1px solid var(--brand,#c7d2fe);border-radius:10px">
      <span style="font-size:18px">📬</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:10.5px;font-weight:800;letter-spacing:.5px;
                    color:var(--brand-text,#4338ca);text-transform:uppercase">현재 확인 중인 메일함</div>
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);line-height:1.35;
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escapeHtml(viewingLabel)}${curAcc ? '' : (accounts.length > 1 ? '  (전체)' : '')}
        </div>
      </div>
      ${accounts.length > 1
        ? `<span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">아래 탭에서 전환 ↓</span>`
        : ''}
    </div>`;

  // ── 오늘 온 메일 ──
  //
  // 폴더는 "어느 거래처인가"로 나눈다. 그건 나중에 찾을 때 쓰는 축이고,
  // 아침에 메일함을 열었을 때 알고 싶은 것은 "밤사이 뭐가 왔나" 하나다.
  // 폴더로만 나눠 두면 오늘 온 3통이 다섯 폴더에 흩어져 있어 다 열어봐야 한다.
  // 그래서 시간 축을 폴더 위에 따로 둔다.
  //
  // 숫자는 사이드바 배지와 같은 API(/api/mail/counts)에서 온다 — 한 화면에
  // 두 숫자가 다르게 뜨는 일이 없도록 기준을 하나로 묶어 둔다.
  // "오늘"의 경계는 서버에서 서울 자정으로 못박는다 (lib/mail/period.ts).
  const todayN = _mailCountsCache?.counts?.today ?? null;
  const todayNoise = _mailCountsCache?.counts?.todayNoise ?? 0;
  const todayReply = _mailCountsCache?.counts?.todayNeedsReply ?? 0;
  const todayOn = !!_inboxState.today && !_inboxState.trashed;
  const todayReal = todayN === null ? null : Math.max(0, todayN - todayNoise);

  // 아침에 메일함을 열고 가장 먼저 보는 것이라, 화면에서 가장 큰 덩어리로 둔다.
  // 폴더 목록과 같은 크기로 놓으면 여러 갈래 중 하나로 묻혀 눈에 안 들어온다.
  const todayLabel = new Date().toLocaleDateString('ko-KR',
    { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

  const stat = (n, label, tone) => `
    <div style="min-width:76px">
      <div style="font-size:21px;font-weight:800;line-height:1.15;color:${tone}">${n.toLocaleString()}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-top:1px">${label}</div>
    </div>`;

  const todayStrip = needsReplyOnly ? '' : `
    <section style="margin-bottom:14px;padding:20px 24px;border-radius:16px;position:relative;overflow:hidden;
                    border:1px solid ${todayOn ? '#2563eb' : 'var(--border-default)'};
                    background:${todayOn
                      ? 'linear-gradient(135deg,#eff6ff 0%,#e0ecff 100%)'
                      : 'linear-gradient(135deg,var(--bg-surface) 0%,var(--bg-surface-alt) 100%)'};
                    box-shadow:${todayOn ? '0 4px 16px rgba(37,99,235,.14)' : 'var(--shadow-sm)'}">
      <div class="today-row" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">

        <div class="today-head" style="display:flex;align-items:center;gap:14px;min-width:0">
          <div style="width:52px;height:52px;flex:none;border-radius:14px;display:flex;
                      align-items:center;justify-content:center;font-size:26px;
                      background:${todayOn ? '#2563eb' : '#eff6ff'}">📨</div>
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <h2 style="margin:0;font-size:19px;font-weight:800;line-height:1.2;
                         color:${todayOn ? '#1d4ed8' : 'var(--text-primary)'}">오늘 온 메일</h2>
              ${todayOn ? `<span style="background:#2563eb;color:#fff;border-radius:99px;padding:2px 10px;
                             font-size:11px;font-weight:800">보는 중</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${todayLabel}</div>
          </div>
        </div>

        ${todayN === null
          ? `<div style="flex:1;font-size:13px;color:var(--text-tertiary)">숫자를 불러오는 중…</div>`
          : todayN === 0
            ? `<div style="flex:1;min-width:180px">
                 <div style="font-size:15px;font-weight:700;color:var(--text-secondary)">아직 오늘 온 메일이 없습니다</div>
                 <div style="font-size:12px;color:var(--text-quaternary);margin-top:3px">
                   새 메일은 [📥 메일 가져오기] 를 누르면 들어옵니다</div>
               </div>`
            : `<div class="today-stats" style="flex:1;display:flex;align-items:center;gap:22px;flex-wrap:wrap;min-width:0">
                 <div style="display:flex;align-items:baseline;gap:5px">
                   <span style="font-size:40px;font-weight:800;line-height:1;
                                color:${todayOn ? '#1d4ed8' : 'var(--text-primary)'}">${todayN.toLocaleString()}</span>
                   <span style="font-size:14px;font-weight:700;color:var(--text-tertiary)">통</span>
                 </div>
                 <div style="width:1px;height:40px;background:var(--border-default)"></div>
                 ${stat(todayReal, '읽을 메일', 'var(--text-primary)')}
                 ${todayReply ? stat(todayReply, '회신 필요', '#b45309') : ''}
                 ${todayNoise ? stat(todayNoise, '광고·자동발송', 'var(--text-quaternary)') : ''}
               </div>`}

        <div class="today-cta" style="margin-left:auto;text-align:right">
          <button type="button" id="inboxTodayBtn"
            title="${todayOn ? '전체 메일함으로 돌아갑니다' : '오늘 들어온 메일만 폴더 구분 없이 모아서 봅니다'}"
            style="padding:13px 24px;border-radius:11px;cursor:pointer;font-size:14px;font-weight:800;
                   white-space:nowrap;
                   border:${todayOn ? '1px solid #2563eb' : 'none'};
                   background:${todayOn ? '#fff' : '#2563eb'};
                   color:${todayOn ? '#1d4ed8' : '#fff'};
                   box-shadow:${todayOn ? 'none' : '0 2px 10px rgba(37,99,235,.32)'}">
            ${todayOn ? '✕ 전체 메일함으로' : '오늘 메일 열기 →'}
          </button>
          <div style="font-size:11px;color:var(--text-quaternary);margin-top:7px">
            ${todayOn ? '제목 앞 📁 가 들어간 폴더입니다' : '폴더 구분 없이 한 번에 봅니다'}
          </div>
        </div>
      </div>
    </section>`;

  // ── 거래처 폴더 목록 (좌측) ──
  // 대표가 메일함에서 나눠둔 폴더가 그대로 온다. 새 메일은 수집 시점에
  // 발신자 이력·제목으로 같은 폴더에 자동 분류된다 (AI 없이 무료).
  const groups = groupInfo?.groups || [];
  const ungrouped = groupInfo?.ungrouped || 0;
  const folderItem = (label, value, count, fresh, icon) => {
    // 오늘 보기 중에는 폴더를 하나도 고르지 않은 상태다.
    // 이 줄이 없으면 [전체]가 켜진 것처럼 보여, 오늘 보기인데 전체를 보는 줄 안다.
    const active = !todayOn && _inboxState.group === value;
    return `<button type="button" class="inbox-group" data-group="${escapeAttr(value)}"
      style="display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:7px 10px;
             font-size:12.5px;border:none;border-radius:7px;cursor:pointer;margin-bottom:2px;
             background:${active ? 'var(--brand-soft)' : 'transparent'};
             color:${active ? 'var(--brand-text)' : 'var(--text-secondary)'};
             font-weight:${active ? '700' : '500'}">
      <span style="width:16px;flex-shrink:0">${icon}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(label)}</span>
      ${fresh ? `<span style="background:#fee2e2;color:#991b1b;border-radius:99px;padding:0 6px;
                   font-size:10px;font-weight:800">${fresh}</span>` : ''}
      <span style="color:var(--text-quaternary);font-size:11px">${count}</span>
    </button>`;
  };

  const folderPanel = `
    <aside class="inbox-folders" style="width:210px;flex-shrink:0;background:var(--bg-surface);border:1px solid var(--border-subtle);
                  border-radius:12px;padding:10px;align-self:flex-start;max-height:72vh;overflow:auto">
      <div style="font-size:10px;font-weight:800;color:var(--text-tertiary);padding:2px 10px 8px;
                  text-transform:uppercase;letter-spacing:.5px">거래처 폴더</div>
      ${folderItem('전체', '', total, 0, '📬')}
      <!-- 순서: 거래처 폴더 → 미분류 → 광고·자동발송.
           광고는 목록 맨 아래 [미분류] 바로 밑이다. 거래처 사이에 끼면
           거래처인 줄 알고, 따로 상자를 쳐서 내려두면 목록 밖으로 보여
           아예 못 찾는다 (실제로 못 찾으셨다). 같은 목록 안, 맨 끝이 맞다.
           아이콘만 📢 로 달리 써서 거래처 폴더(📁)와 구분한다. -->
      ${groups.filter((g) => g.group !== AD_FOLDER_NAME)
        .map((g) => folderItem(g.group, g.group, g.total, g.fresh, '📁')).join('')}
      ${ungrouped ? folderItem('미분류', '__none__', ungrouped, 0, '❔') : ''}
      ${(() => {
        const ad = groups.find((g) => g.group === AD_FOLDER_NAME);
        return ad ? folderItem('광고·자동발송', AD_FOLDER_NAME, ad.total, 0, '📢') : '';
      })()}
      <!-- 휴지통도 폴더의 하나로 둔다. 별도 화면으로 빼두면 "치웠는데 어디 갔지"가 되고,
           치운 메일을 되돌리려면 다른 화면으로 나가야 해서 흐름이 끊긴다.
           DB 에서 지우지 않으므로 여기서 언제든 되살릴 수 있다. -->
      <div style="border-top:1px solid var(--border-subtle);margin-top:6px;padding-top:6px">
        <!-- 보낸 메일함 — 이카운트 보낸메일함을 그 자리에서 읽는다 (renderSentMailPage).
             사이드바 메뉴를 늘리지 않고 휴지통처럼 폴더의 하나로 둔다.
             일단 숨김 (2026-09-14) — 기능(renderSentMailPage · /api/mail/sent)은 그대로 살아 있고,
             다시 켜려면 SHOW_SENT_MAILBOX 를 true 로 바꾸면 된다. -->
        ${SHOW_SENT_MAILBOX ? `<button type="button" class="inbox-group" data-group="__sent__"
          title="이카운트 보낸메일함을 그대로 보여줍니다 — 보낸 메일의 내용·첨부를 확인합니다"
          style="display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:7px 10px;
                 font-size:12.5px;border:none;border-radius:7px;cursor:pointer;margin-bottom:2px;
                 background:transparent;color:var(--text-secondary);font-weight:500">
          <span style="width:16px;flex-shrink:0">📤</span>
          <span style="flex:1">보낸 메일함</span>
        </button>` : ''}
        <button type="button" class="inbox-group" data-group="__trash__"
          style="display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:7px 10px;
                 font-size:12.5px;border:none;border-radius:7px;cursor:pointer;margin-bottom:2px;
                 background:${_inboxState.trashed ? 'var(--brand-soft)' : 'transparent'};
                 color:${_inboxState.trashed ? 'var(--brand-text)' : 'var(--text-secondary)'};
                 font-weight:${_inboxState.trashed ? '700' : '500'}">
          <span style="width:16px;flex-shrink:0">🗑</span>
          <span style="flex:1">휴지통</span>
          <span style="color:var(--text-quaternary);font-size:11px">${(_mailCountsCache?.counts?.trash ?? 0)}</span>
        </button>
      </div>
      <div style="border-top:1px solid var(--border-subtle);margin-top:8px;padding-top:8px">
        <button type="button" id="inboxRegroupBtn"
          style="width:100%;padding:6px;font-size:11px;border:1px solid var(--border-default);
                 border-radius:7px;background:var(--bg-surface);color:var(--text-secondary);cursor:pointer"
          title="이미 폴더에 넣어둔 메일을 보고 '이 주소는 이 거래처' 를 익혀서, 미분류에 남은 메일을 같은 폴더로 옮깁니다.">
          🔄 미분류 메일 정리하기
        </button>
        <div style="font-size:10px;color:var(--text-quaternary);margin-top:6px;line-height:1.5">
          새로 온 메일은 보낸 사람을 보고 자동으로 폴더에 들어갑니다.<br>
          모르는 곳에서 온 메일만 <b>미분류</b>에 남습니다.
        </div>
      </div>
    </aside>`;

  els.content.innerHTML = `
    ${viewingBanner}
    ${todayStrip}
    ${accountTabs}
    <div class="inbox-layout" style="display:flex;gap:14px;align-items:flex-start">
    ${folderPanel}
    <div class="inbox-main" style="flex:1;min-width:0">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input id="inboxSearch" type="search" placeholder="제목·발신자 검색" value="${escapeAttr(_inboxState.q)}"
        style="padding:7px 12px;font-size:13px;border:1px solid var(--border-default);border-radius:8px;
               background:var(--bg-surface);color:var(--text-primary);min-width:220px">
      ${filterChip('전체', 'classification', '')}
      ${filterChip('💼 B2B·문의', 'classification', 'b2b,inquiry,partner')}
      ${filterChip('· 미분류', 'classification', 'unknown')}
      ${filterChip('📢 광고·자동', 'classification', 'ad,system,newsletter')}
      <!-- 이름만으로는 '광고와 자동발송이 뭐가 다른가'를 알 수 없다.
           눌러서 펼치는 설명을 옆에 둔다 (평소엔 접혀 있어 화면을 어지럽히지 않는다) -->
      <button type="button" id="clsHelpBtn" title="분류 기준 보기"
        style="width:20px;height:20px;padding:0;border-radius:50%;border:1px solid var(--border-default);
               background:var(--bg-surface);color:var(--text-tertiary);font-size:11px;font-weight:800;
               cursor:pointer;line-height:1">?</button>
      <span style="width:1px;height:20px;background:var(--border-default)"></span>
      ${filterChip('리드 연결됨', 'linked', '1')}
      ${filterChip('미연결', 'linked', '0')}
      <button class="button secondary" id="inboxIngestBtn" type="button" style="margin-left:auto">📥 메일 가져오기</button>
      <button class="button secondary" id="inboxBackfillBtn" type="button" title="이카운트 메일함에서 최근 2달 메일을 전부 가져와 분류합니다 (새로 등록한 메일함은 처음에 한 번 눌러 주세요)">📥 2달 전체</button>
      <!-- [🧠 AI 분석] 은 뺐다 — 한 번에 N통을 유료 분석하는 버튼이라 비용이 예측되지 않는다.
           분석 결과(한글 번역·요약·기한)를 *보는* 기능은 그대로다. 분석 자체는 개발자 쪽에서
           일괄로 돌려 DB 에 넣는다. 되살리려면 아래 주석을 풀면 된다 (핸들러는 살아 있다).
      <button class="button secondary" id="inboxAnalyzeBtn" type="button" title="한글 번역 + 요약 + 기한 추출 (유료)">🧠 AI 분석</button>
      -->
    </div>

    <div id="clsHelpPanel" style="display:none;margin-bottom:12px;padding:12px 14px;
         background:var(--bg-surface-alt);border:1px solid var(--border-default);border-radius:10px">
      <div style="font-size:11.5px;font-weight:800;color:var(--text-secondary);margin-bottom:8px">
        메일 분류 기준 — 받은 메일은 아래 7가지 중 하나로 자동 분류됩니다
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:7px">
        ${Object.values(MAIL_CLASS).map((c) => `
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="flex:none;background:${c.bg};color:${c.fg};padding:2px 8px;border-radius:99px;
                         font-size:11px;font-weight:700;white-space:nowrap">${c.label}</span>
            <span style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">${escapeHtml(c.desc)}</span>
          </div>`).join('')}
      </div>
      <div style="margin-top:9px;padding-top:8px;border-top:1px solid var(--border-default);
                  font-size:11px;color:var(--text-tertiary);line-height:1.6">
        <b>📢 광고와 ⚙ 자동발송의 차이</b> — 광고는 <b>사람</b>이 우리에게 팔려고 보낸 것,
        자동발송은 <b>기계</b>가 알리려고 보낸 것입니다. 둘 다 배지 숫자에서 빠집니다
        (인증번호까지 세면 "받은 메일 N통"이 의미를 잃기 때문입니다).
        <br>분류가 틀렸으면 메일을 열어 직접 바꿀 수 있고, 손으로 고친 분류는 재분석이 덮지 않습니다.
      </div>
    </div>

    <!-- 선택 액션 — 아무것도 안 골랐으면 숨어 있다가 체크하면 나타난다 -->
    <div id="inboxBulkBar" style="display:none;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;
         background:var(--brand-soft);border:1px solid var(--brand);border-radius:9px">
      <span style="font-size:12.5px;font-weight:700;color:var(--brand-text)">
        <span id="inboxSelCount">0</span>통 선택됨
      </span>
      ${_inboxState.trashed
        ? `<button type="button" id="inboxRestoreBtn" class="button" style="padding:5px 14px;font-size:12px">↩ 받은함으로 되돌리기</button>`
        : `
          <!-- 폴더 이동 — 자동 분류가 애매한 것은 미분류로 남고, 여기서 사람이 옮긴다 -->
          <select id="inboxMoveGroup" style="padding:5px 10px;font-size:12px;border-radius:7px;
                  border:1px solid var(--border-default);background:var(--bg-surface);
                  color:var(--text-primary);cursor:pointer">
            <option value="">거래처 폴더로 이동…</option>
            ${(groupInfo?.groups || []).map((g) => `<option value="${escapeAttr(g.group)}">📁 ${escapeHtml(g.group)}</option>`).join('')}
            <option value="__none__">❔ 미분류로 되돌리기</option>
          </select>
          <button type="button" id="inboxTrashBtn" class="button secondary" style="padding:5px 14px;font-size:12px">🗑 휴지통으로</button>`}
      <button type="button" id="inboxSelClear" style="background:none;border:none;color:var(--text-tertiary);
              font-size:12px;cursor:pointer">선택 해제</button>
      <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">
        휴지통으로 보내도 <b>지워지지 않습니다</b> — 언제든 되돌릴 수 있습니다
      </span>
    </div>

    <div style="margin-bottom:10px;font-size:12px;color:var(--text-tertiary);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span>총 <b style="color:var(--text-primary)">${total.toLocaleString()}</b>${_inboxState.trashed ? '통 (휴지통)' : (todayOn ? '통 · 오늘 들어온 것' : '개 대화')}
      ${needsReplyOnly ? ' · 회신 필요만' : ''}
      ${todayOn
        ? ' · <span style="color:var(--text-quaternary)">제목 앞 📁 태그가 이 메일이 들어간 거래처 폴더입니다</span>'
        : (_inboxState.group ? ` · 📁 ${escapeHtml(_inboxState.group === '__none__' ? '미분류' : _inboxState.group)}` : '')}</span>
      <span id="inboxAiStatus" style="color:var(--text-quaternary)"></span>
    </div>

    ${renderPaginationBar(data.page, totalPages, total, { compact: true })}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:32px"><input type="checkbox" id="inboxCheckAll" title="이 페이지 전체 선택" style="width:15px;height:15px;cursor:pointer"></th>
            <th>받은 시각</th><th>발신자</th><th>제목</th><th>분류</th><th>상태</th><th>리드</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary);padding:32px">조건에 맞는 메일이 없습니다.</td></tr>'}</tbody>
      </table>
    </div>
    ${renderPaginationBar(data.page, totalPages, total)}
    </div>
    </div>
  `;

  bindInboxActions();
  els.content.querySelectorAll('.page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = parseInt(btn.dataset.page, 10);
      if (isNaN(t) || t === data.page) return;
      _inboxState.page = Math.min(Math.max(1, t), totalPages);
      render();
    });
  });
}

/**
 * 폴더 지정 메뉴 — 메일 한 통을 그 자리에서 거래처 폴더에 넣는다.
 *
 * 태그 바로 아래에 붙여 띄운다. 팝업 한가운데로 띄우면 지금 어느 메일을
 * 옮기는 중인지 눈을 뗀 사이에 놓친다.
 *
 * 넣고 나서 화면 전체를 다시 그리지는 않는다 — 오늘 온 메일을 위에서부터
 * 훑어 내려가며 정리하는 중인데 매번 맨 위로 튀면 정리를 할 수가 없다.
 * 누른 줄의 태그만 바꾸고, 폴더 숫자는 다음에 그릴 때 맞춘다.
 */
function closeFolderPicker() {
  document.getElementById('mailFolderPicker')?.remove();
}

function openFolderPicker(anchor) {
  closeFolderPicker();
  const mailId = anchor.dataset.mailId;
  const cur = anchor.dataset.cur || '';
  const groups = (_mailGroupsCache?.groups || []).map((g) => g.group).filter(Boolean);
  const suggested = anchor.dataset.suggest || '';

  const item = (label, value, style) => `
    <button type="button" class="mfp-pick" data-group="${escapeAttr(value)}"
      style="display:flex;align-items:center;gap:7px;width:100%;text-align:left;padding:7px 11px;
             font-size:12.5px;border:none;border-radius:7px;cursor:pointer;background:none;
             color:var(--text-secondary);${style || ''}">${label}</button>`;

  const r = anchor.getBoundingClientRect();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="mailFolderPicker" style="position:fixed;inset:0;z-index:9997">
      <div style="position:absolute;top:${Math.min(r.bottom + 4, window.innerHeight - 340)}px;
                  left:${Math.min(r.left, window.innerWidth - 260)}px;width:248px;max-height:330px;
                  overflow:auto;background:var(--bg-surface);border:1px solid var(--border-default);
                  border-radius:11px;box-shadow:0 10px 34px rgba(0,0,0,.18);padding:7px">
        <div style="font-size:10px;font-weight:800;color:var(--text-tertiary);padding:4px 11px 6px;
                    text-transform:uppercase;letter-spacing:.5px">거래처 폴더로 넣기</div>
        ${suggested ? `
          <div style="padding:0 4px 5px;margin-bottom:4px;border-bottom:1px solid var(--border-subtle)">
            ${item(`📥 <b>${escapeHtml(suggested)}</b> <span style="font-size:10px;opacity:.7">추천</span>`,
                   suggested, 'background:#fffbeb;color:#92400e;font-weight:700')}
          </div>` : ''}
        ${groups.length
          ? groups.map((g) => item(
              `${g === cur ? '✓' : '📁'} ${escapeHtml(g)}`, g,
              g === cur ? 'font-weight:800;color:var(--brand-text)' : '')).join('')
          : `<div style="padding:10px 11px;font-size:11.5px;color:var(--text-quaternary);line-height:1.5">
               아직 만든 폴더가 없습니다.<br>아래에서 첫 폴더를 만드세요.</div>`}
        <div style="border-top:1px solid var(--border-subtle);margin-top:5px;padding-top:5px">
          ${item('➕ 새 폴더 만들어 넣기', '__new__', 'color:var(--brand-text);font-weight:700')}
          ${cur ? item('❔ 미분류로 되돌리기', '', 'color:var(--text-tertiary)') : ''}
        </div>
      </div>
    </div>`);

  const rootEl = document.getElementById('mailFolderPicker');
  rootEl.addEventListener('click', (e) => { if (e.target === rootEl) closeFolderPicker(); });

  rootEl.querySelectorAll('.mfp-pick').forEach((b) => {
    b.addEventListener('click', async () => {
      let group = b.dataset.group;
      if (group === '__new__') {
        const name = (prompt('새 거래처 폴더 이름을 적어주세요.\n\n예) 사업개발, Beauty Lyrics USA') || '').trim();
        if (!name) return;
        group = name;
      }
      if (group === cur) { closeFolderPicker(); return; }
      closeFolderPicker();
      await moveMailToFolder(mailId, group, anchor);
    });
  });
}

/** 메일 한 통을 폴더로. 화면은 그 줄만 바꾼다. */
async function moveMailToFolder(mailId, group, anchor) {
  const prevHtml = anchor.innerHTML;
  anchor.innerHTML = '⏳ 옮기는 중';
  anchor.disabled = true;
  try {
    const r = await safeJsonFetch('/api/mail/move-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailIds: [mailId], group }),
    });
    if (!r || !r.success) throw new Error(r?.error || '이동 실패');

    // 폴더 목록은 비우지 않는다 — 비워버리면 바로 다음 줄에서 메뉴를 열었을 때
    // 고를 폴더가 하나도 안 뜬다(화면을 다시 그리지 않으므로 채워질 기회가 없다).
    // 새로 만든 폴더는 즉시 끼워 넣고, 정확한 숫자는 뒤에서 다시 받아온다.
    if (group && _mailGroupsCache && Array.isArray(_mailGroupsCache.groups)
        && !_mailGroupsCache.groups.some((g) => g.group === group)) {
      _mailGroupsCache.groups.push({ group, count: 0, total: 0, fresh: 0, last: null });
    }
    loadMailGroups(true).catch(() => {});

    // 폴더별로 보고 있던 중이라면 이 메일은 더 이상 이 목록에 속하지 않는다.
    // 자리에 남겨두면 없는 것을 보고 있는 셈이라 그때만 다시 그린다.
    const viewingFolder = _inboxState.group && _inboxState.group !== '__none__';
    const leftThisFolder = viewingFolder && group !== _inboxState.group;
    const leftUngrouped = _inboxState.group === '__none__' && group;
    if (leftThisFolder || leftUngrouped) { render(); return; }

    anchor.disabled = false;
    anchor.dataset.cur = group;
    if (group) {
      anchor.innerHTML = `📁 ${escapeHtml(group)}`;
      anchor.style.cssText = `background:#ecfdf5;color:#047857;border:1px solid #6ee7b7;
        border-radius:5px;padding:1px 6px;font-size:10px;font-weight:700;margin-right:5px;cursor:pointer`;
      anchor.title = `거래처 폴더 · 직접 지정\n눌러서 다른 폴더로 옮깁니다`;
      // 방금 넣은 것은 초록으로 잠깐 표시했다가 평소 색으로 돌아간다 —
      // 위에서부터 훑어 내려갈 때 어디까지 했는지 보인다
      setTimeout(() => {
        anchor.style.cssText = `background:var(--bg-surface-alt);color:var(--text-secondary);
          border:1px solid var(--border-subtle);border-radius:5px;padding:1px 6px;
          font-size:10px;font-weight:700;margin-right:5px;cursor:pointer`;
      }, 2200);
    } else {
      anchor.innerHTML = '❔ 폴더 지정';
      anchor.style.cssText = `color:var(--text-tertiary);background:var(--bg-surface);
        border:1px dashed var(--border-strong);border-radius:5px;padding:1px 6px;
        font-size:10px;font-weight:700;margin-right:5px;cursor:pointer`;
    }
  } catch (e) {
    anchor.disabled = false;
    anchor.innerHTML = prevHtml;
    alert(`폴더 이동 실패: ${(e && e.message) || e}`);
  }
}

function bindInboxActions() {
  // 계정 전환 — 목록·배지가 모두 그 계정 기준으로 바뀐다
  els.content.querySelectorAll('.inbox-account').forEach((btn) => {
    btn.addEventListener('click', () => {
      _inboxState.accountId = btn.dataset.accountId;
      _inboxState.accountPicked = true;   // 사용자가 직접 골랐으면 기본계정으로 되돌리지 않는다
      _inboxState.page = 1;
      _inboxState.group = '';       // 계정이 바뀌면 폴더 선택도 초기화
      _mailGroupsCache = null;      // 폴더 목록은 계정별로 다르다
      loadMailCounts(true);
      render();
    });
  });

  // 분류 기준 설명 펼치기/접기
  els.content.querySelector('#clsHelpBtn')?.addEventListener('click', () => {
    const p = els.content.querySelector('#clsHelpPanel');
    if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
  });

  // ── 목록에서 여러 통 골라 휴지통으로 / 되돌리기 ──
  // 한 통씩 상세를 열어 치우면 수십 통 정리에 한참 걸린다.
  const selected = new Set();
  const bar = els.content.querySelector('#inboxBulkBar');
  const syncBar = () => {
    if (!bar) return;
    bar.style.display = selected.size ? 'flex' : 'none';
    const c = els.content.querySelector('#inboxSelCount');
    if (c) c.textContent = String(selected.size);
  };
  els.content.querySelectorAll('.inbox-check').forEach((cb) => {
    // 체크박스 클릭이 행 클릭(상세 열기)까지 번지지 않게 막는다
    cb.addEventListener('click', (ev) => ev.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.dataset.mailId); else selected.delete(cb.dataset.mailId);
      syncBar();
    });
  });
  els.content.querySelector('#inboxCheckAll')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const on = ev.target.checked;
    els.content.querySelectorAll('.inbox-check').forEach((cb) => {
      cb.checked = on;
      if (on) selected.add(cb.dataset.mailId); else selected.delete(cb.dataset.mailId);
    });
    syncBar();
  });
  els.content.querySelector('#inboxSelClear')?.addEventListener('click', () => {
    selected.clear();
    els.content.querySelectorAll('.inbox-check, #inboxCheckAll').forEach((cb) => { cb.checked = false; });
    syncBar();
  });

  const bulkTrash = async (restore) => {
    const ids = [...selected];
    if (!ids.length) return;
    const btn = els.content.querySelector(restore ? '#inboxRestoreBtn' : '#inboxTrashBtn');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중…'; }
    try {
      const r = await safeJsonFetch('/api/mail/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailIds: ids, restore }),
      });
      selected.clear();
      _mailGroupsCache = null;       // 폴더별 통수가 바뀐다
      await loadMailCounts(true);
      render();
      // 결과는 화면 숫자로 바로 보이므로 alert 은 되돌리기 안내만 남긴다
      if (!restore) console.log(`[inbox] ${r.moved}통 휴지통으로`);
    } catch (e) {
      alert(`처리 실패: ${e.message || e}`);
      if (btn) { btn.disabled = false; btn.textContent = restore ? '↩ 받은함으로 되돌리기' : '🗑 휴지통으로'; }
    }
  };
  // 고른 메일을 거래처 폴더로 옮긴다
  els.content.querySelector('#inboxMoveGroup')?.addEventListener('change', async (ev) => {
    const sel = ev.target;
    const val = sel.value;
    if (!val || !selected.size) { sel.selectedIndex = 0; return; }
    const group = val === '__none__' ? '' : val;
    const label = group || '미분류';
    if (!confirm(`선택한 ${selected.size}통을 [${label}] 로 옮깁니다.

직접 옮긴 분류는 자동 재분류가 덮지 않습니다.`)) {
      sel.selectedIndex = 0;
      return;
    }
    try {
      const r = await safeJsonFetch('/api/mail/move-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailIds: [...selected], group }),
      });
      selected.clear();
      _mailGroupsCache = null;      // 폴더별 통수가 바뀐다
      await loadMailCounts(true);
      render();
      console.log(`[inbox] ${r.moved}통 → ${r.group}`);
    } catch (e) {
      alert(`이동 실패: ${e.message || e}`);
      sel.selectedIndex = 0;
    }
  });

  els.content.querySelector('#inboxTrashBtn')?.addEventListener('click', () => bulkTrash(false));
  els.content.querySelector('#inboxRestoreBtn')?.addEventListener('click', () => bulkTrash(true));

  // 제목 앞 폴더 태그 → 그 자리에서 폴더 지정
  els.content.querySelectorAll('.mail-folder-tag').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();          // 행 클릭(메일 상세)까지 번지지 않게
      openFolderPicker(btn);
    });
  });

  // 오늘 온 메일 — 폴더·휴지통과 같은 자리를 두고 다투는 축이라 서로 끈다
  els.content.querySelector('#inboxTodayBtn')?.addEventListener('click', () => {
    const on = !_inboxState.today;
    _inboxState.today = on;
    if (on) { _inboxState.group = ''; _inboxState.trashed = false; }
    _inboxState.page = 1;
    render();
  });

  // 거래처 폴더 선택 (휴지통 포함)
  els.content.querySelectorAll('.inbox-group').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.group;
      _inboxState.today = false;      // 폴더를 고르면 오늘 보기는 꺼진다
      if (g === '__sent__') {
        // 보낸 메일함은 목록 필터가 아니라 다른 화면이다 (이카운트 보낸메일함을 바로 읽음)
        _inboxState.sent = true;
        _inboxState.trashed = false;
        _inboxState.group = '';
        _sentState.page = 1;
        _sentState.q = '';
      } else if (g === '__trash__') {
        // 휴지통은 폴더 필터가 아니라 "치운 것만" 이라는 별도 축이다
        _inboxState.sent = false;
        _inboxState.trashed = true;
        _inboxState.group = '';
      } else {
        _inboxState.sent = false;
        _inboxState.trashed = false;
        _inboxState.group = g;
      }
      _inboxState.page = 1;
      render();
    });
  });

  // 거래처 재분류 — 학습 기반 · AI 미사용이라 비용이 없다
  els.content.querySelector('#inboxRegroupBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '분류 중…';
    try {
      const r = await safeJsonFetch('/api/mail/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: _inboxState.accountId || 'all' }),
      });
      alert(
        `미분류 ${r.scanned}통 검사 → ${r.classified}통 분류\n\n`
        + `· 발신자 이력으로 ${r.bySender}통\n`
        + `· 제목의 거래처명으로 ${r.byName}통\n\n`
        + `학습된 발신자 ${r.learnedSenders}명 · 거래처 ${r.knownGroups}곳`,
      );
      _mailGroupsCache = null;
      render();
    } catch (err) {
      alert(`재분류 실패: ${err.message || err}`);
      btn.disabled = false;
      btn.textContent = '🔄 미분류 메일 정리하기';
    }
  });

  els.content.querySelectorAll('.inbox-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.filterKey;
      const v = btn.dataset.filterVal;
      // 같은 값을 다시 누르면 해제
      _inboxState[k] = _inboxState[k] === v ? '' : v;
      _inboxState.page = 1;
      render();
    });
  });
  const search = els.content.querySelector('#inboxSearch');
  if (search) {
    search.addEventListener('change', (e) => {
      _inboxState.q = e.target.value.trim();
      _inboxState.page = 1;
      render();
    });
  }
  els.content.querySelector('#inboxIngestBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '가져오는 중…';
    try {
      const r = await safeJsonFetch('/api/mail/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 지금 보고 있는 메일함을 수집한다 ('전체' 면 등록된 계정 모두)
        body: JSON.stringify({ accountId: _inboxState.accountId || 'all' }),
      });
      const s = r.summary || {};
      const msg = `조회 ${s.fetched || 0} · 신규 ${s.inserted || 0} · 리드 매칭 ${s.matched || 0}`
        + (s.movedToReplied ? ` · 답장옴 이동 ${s.movedToReplied}` : '');
      // 실패 건수는 반드시 노출한다 — 신규 건수만 보면 전량 실패해도 정상처럼 읽힌다
      alert(r.errors?.length ? `${msg}\n\n⚠ 오류 ${r.errors.length}건:\n${r.errors.join('\n')}` : msg);
      invalidateServerPage?.();
      _inboxState.page = 1;
      render();
    } catch (err) {
      alert(`수집 실패: ${err.message || err}`);
      btn.disabled = false;
      btn.textContent = '📥 메일 가져오기';
    }
  });
  els.content.querySelector('#inboxBackfillBtn')?.addEventListener('click', async () => {
    const r = await loadInboxAccounts(true);
    const all = (r && r.accounts) || [];
    const cur = currentMailboxAccountId();
    const targets = cur && cur !== 'all' ? all.filter((a) => a.accountId === cur) : all;
    if (!targets.length) { alert('먼저 [📬 메일 계정 관리]에서 메일 계정을 등록하세요.'); return; }
    runMailBackfill(targets.map((a) => ({ id: a.accountId, label: a.label || a.address })));
  });
  els.content.querySelectorAll('[data-goto-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.gotoView;
      render();
    });
  });

  // ── AI 분석 대기 통수·예상 비용 표시 (조회는 과금 없음) ──
  const statusEl = els.content.querySelector('#inboxAiStatus');
  const analyzeBtn = els.content.querySelector('#inboxAnalyzeBtn');
  if (statusEl && analyzeBtn) {
    safeJsonFetch('/api/mail/analyze').then((r) => {
      if (!r || !r.success) return;
      if (!r.hasApiKey) {
        statusEl.textContent = '· AI 미설정 (ANTHROPIC_API_KEY 없음)';
        analyzeBtn.disabled = true;
        return;
      }
      if (!r.pendingTotal) {
        statusEl.textContent = '· AI 분석 대기 없음';
        analyzeBtn.disabled = true;
        return;
      }
      // 실행 전에 금액을 먼저 보여준다 — 눌러보고 나서 비용을 알게 되면 안 된다
      statusEl.textContent =
        `· AI 분석 대기 ${r.pendingTotal}통 (이번 ${r.batchSize}통 · 예상 ₩${r.estimate.krw} · ${r.estimate.modelLabel})`;
      analyzeBtn.dataset.batch = String(r.batchSize);
      analyzeBtn.dataset.krw = String(r.estimate.krw);
    }).catch(() => { /* AI 미설정이어도 메일함은 동작해야 한다 */ });

    analyzeBtn.addEventListener('click', async () => {
      const n = analyzeBtn.dataset.batch || '?';
      const won = analyzeBtn.dataset.krw || '?';
      if (!confirm(`${n}통을 AI 분석합니다.\n한글 번역 + 요약 + 기한 추출\n\n예상 비용: ₩${won}\n\n진행할까요?`)) return;
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = '분석 중…';
      try {
        const r = await safeJsonFetch('/api/mail/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const fails = (r.results || []).filter((x) => x.error);
        alert(
          `분석 ${r.analyzed}통 · 실패 ${r.failed}통 · 남은 ${r.remaining}통\n실제 비용 ₩${r.totalKrw}`
          + (fails.length ? `\n\n⚠ 실패 사유:\n${fails.slice(0, 3).map((x) => x.error).join('\n')}` : ''),
        );
        render();
      } catch (e) {
        alert(`분석 실패: ${e.message || e}`);
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🧠 AI 분석';
      }
    });
  }
}

// ── 기한 관리 ─────────────────────────────────────────────────
// 회신 기한은 로컬 분석(무료)에서도 추출되므로 AI 크레딧 없이 동작한다.
async function renderDeadlinesPage() {
  els.content.innerHTML = `<div class="inline-loader">기한 불러오는 중…</div>`;
  let data;
  try {
    // 대표 계정 기준으로 — 사이드바 배지와 같은 계정을 봐야 숫자가 맞는다
    await loadInboxAccounts();
    data = await safeJsonFetch(
      `/api/mail/deadlines?accountId=${encodeURIComponent(currentMailboxAccountId())}`,
    );
  } catch (e) {
    els.content.innerHTML = `<div class="empty-detail"><h3>불러오기 실패</h3><p>${escapeHtml(String(e.message || e))}</p></div>`;
    return;
  }
  if (!data || !data.success) {
    els.content.innerHTML = `<div class="empty-detail"><h3>조회 실패</h3><p>${escapeHtml(data?.error || '')}</p></div>`;
    return;
  }

  const g = data.groups || {};
  const dday = (v) => {
    const d = new Date(v);
    const days = Math.ceil((d.setHours(12, 0, 0, 0) - new Date().setHours(12, 0, 0, 0)) / 86400000);
    if (days < 0) return { text: `${Math.abs(days)}일 지남`, color: '#b91c1c' };
    if (days === 0) return { text: '오늘', color: '#b91c1c' };
    if (days <= 3) return { text: `D-${days}`, color: '#c2410c' };
    return { text: `D-${days}`, color: '#475569' };
  };

  const section = (title, items, tone) => {
    if (!items.length) return '';
    return `
      <div style="margin-bottom:22px">
        <h3 style="font-size:14px;margin-bottom:8px;color:${tone}">${title} <span style="color:var(--text-tertiary);font-weight:400">${items.length}건</span></h3>
        <div class="table-wrap"><table><tbody>
          ${items.map((m) => {
            const d = dday(m.deadline);
            return `<tr>
              <td style="width:92px;white-space:nowrap;font-weight:800;color:${d.color}">${d.text}</td>
              <td style="width:110px;white-space:nowrap;color:var(--text-tertiary);font-size:12px">
                ${new Date(m.deadline).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
              </td>
              <td>
                <div style="font-size:13px;color:var(--text-primary)">${escapeHtml(String(m.subject || '').slice(0, 70))}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">
                  ${escapeHtml(m.from?.address || '')}
                  ${m.deadlineText ? ` · "${escapeHtml(m.deadlineText)}"` : ''}
                </div>
              </td>
              <td style="width:150px">${m.leadId
                ? `<button type="button" class="conversation-btn" data-conv-lead="${escapeAttr(m.leadId)}"
                     style="padding:3px 9px;font-size:11px;border:1px solid #16a34a;border-radius:99px;
                            background:#16a34a;color:#fff;font-weight:700;cursor:pointer">💬 ${escapeHtml(String(m.company || '대화').slice(0, 14))}</button>`
                : '<span title="이 메일을 보낸 곳이 우리 업체 목록에 없습니다.&#10;&#10;우리가 먼저 메일을 보낸 적이 없는 곳(새 문의·광고 등)이면 정상입니다.&#10;거래 중인 곳인데 미연결이면, 그 주소로 업체를 등록하면 대화가 이어서 보입니다.&#10;(대화 진행 중·파트너십 화면의 [+ 업체 직접 추가])" style="font-size:11px;color:var(--text-quaternary);border-bottom:1px dotted var(--border-strong);cursor:help">리드 미연결 <b>?</b></span>'}</td>
            </tr>`;
          }).join('')}
        </tbody></table></div>
      </div>`;
  };

  const totalN = (g.overdue?.length || 0) + (g.soon?.length || 0) + (g.later?.length || 0);
  els.content.innerHTML = totalN
    ? `
      <div style="margin-bottom:16px;font-size:12px;color:var(--text-tertiary)">
        회신 기한이 잡힌 메일 ${totalN}건 · 기한은 본문에서 자동 추출됩니다.
      </div>
      ${section('🔴 기한 지남', g.overdue || [], '#b91c1c')}
      ${section('🟠 7일 이내', g.soon || [], '#c2410c')}
      ${section('⚪ 이후', g.later || [], 'var(--text-secondary)')}`
    : `<div class="empty-detail"><h3>기한이 잡힌 메일이 없습니다</h3>
         <p>상대가 "by Friday", "3영업일 내" 같은 표현을 쓰면 자동으로 여기에 모입니다.</p></div>`;
}


/**
 * 예약된 발송을 발송함 화면에 펼쳐 보여준다.
 *
 * "언제 · 어디로 나가는가"가 안 보이면 예약은 그냥 블랙박스다.
 * 날짜별로 묶어서, 그 날 나갈 회사를 이름까지 늘어놓는다.
 */
// ── AI 번역 (화면 어디서나) ───────────────────────────────────
//
// 화면 곳곳에 영문이 그대로 남아 있다 — 메일 제목·본문, 리드 근거 문장 등.
// 전부 미리 번역해 두면 안 볼 것까지 돈을 내게 되므로 **누른 것만** 번역한다.
//
// 쓰는 법: 번역이 필요한 영문 옆에 translateBtnHtml(원문) 을 넣으면 끝이다.
// 클릭 처리는 아래 위임 핸들러가 맡으므로 화면마다 바인딩할 필요가 없다.

// 같은 문장을 두 번 누르면 돈이 두 번 나간다 → 세션 동안 기억해 둔다
var _trCache = new Map();
var _trSeq = 0;

/** 이 문자열이 번역할 만한 외국어인가 (한글이 이미 많으면 버튼을 띄우지 않는다) */
function needsTranslation(text) {
  const s = String(text || '').trim();
  if (s.length < 12) return false;
  const ko = (s.match(/[가-힣]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  return latin > 20 && ko / Math.max(1, ko + latin) < 0.25;
}

/**
 * 원문 옆에 붙일 [🌐 AI 번역] 버튼.
 * @param text  번역할 원문
 * @param opts  {inline:true} 면 작은 글씨 인라인 버튼
 */
function translateBtnHtml(text, opts) {
  const s = String(text || '');
  if (!needsTranslation(s)) return '';
  const id = 'tr' + (++_trSeq);
  // 원문을 DOM 에 실어두면 클릭 시 다시 찾을 필요가 없다
  window.__trText = window.__trText || {};
  window.__trText[id] = s;
  const small = opts && opts.inline;
  return `<button type="button" class="ai-translate-btn" data-tr-id="${id}"
    style="margin-left:6px;padding:${small ? '1px 7px' : '3px 9px'};font-size:${small ? '10.5' : '11'}px;
           font-weight:700;border:1px solid #c7d2fe;border-radius:99px;background:#eef2ff;
           color:#4338ca;cursor:pointer;white-space:nowrap;vertical-align:middle"
    title="이 부분만 AI 로 한국어 번역합니다 (누를 때만 비용 발생)">🌐 AI 번역</button>
  <div class="ai-translate-out" data-tr-out="${id}" style="display:none;margin-top:6px;padding:9px 11px;
       background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;font-size:12.5px;
       line-height:1.65;color:#312e81;white-space:pre-wrap"></div>`;
}

// 위임 핸들러 — 어느 화면에서 눌러도 동작한다
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.ai-translate-btn');
  if (!btn) return;
  ev.preventDefault();
  ev.stopPropagation();          // 메일 행 클릭 등 상위 핸들러가 같이 뜨지 않게

  const id = btn.dataset.trId;
  const out = document.querySelector(`[data-tr-out="${id}"]`);
  const text = (window.__trText || {})[id] || '';
  if (!out || !text) return;

  // 이미 번역해 둔 것이면 다시 부르지 않고 보이기/숨기기만
  if (out.dataset.done === '1') {
    const showing = out.style.display !== 'none';
    out.style.display = showing ? 'none' : '';
    btn.textContent = showing ? '🌐 AI 번역' : '🇰🇷 번역 숨기기';
    return;
  }
  const cached = _trCache.get(text);
  if (cached) {
    out.textContent = cached;
    out.dataset.done = '1';
    out.style.display = '';
    btn.textContent = '🇰🇷 번역 숨기기';
    return;
  }

  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = '번역 중…';
  try {
    const r = await safeJsonFetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    _trCache.set(text, r.translated);
    out.textContent = r.translated;
    out.dataset.done = '1';
    out.style.display = '';
    btn.disabled = false;
    btn.textContent = '🇰🇷 번역 숨기기';
  } catch (e) {
    out.style.display = '';
    out.textContent = `번역 실패: ${e.message || e}`;
    out.dataset.done = '';
    btn.disabled = false;
    btn.textContent = label;
  }
});

// ── 기존 데이터 ───────────────────────────────────────────────
//
// 클라이언트가 원래 가지고 있던 CSV 업로드분(5천여 건). 대부분 중복 정리로
// 보관함에 들어가 있지만 지운 것이 아니라, "이건 살려서 보내자" 싶은 걸
// 골라 검증 완료로 되돌릴 수 있게 한다.
var _legacy = { batch: '', page: 1, q: '', region: '', sel: new Set(), moveTarget: 'verified' };

// 올린 데이터 화면 위쪽 작업 줄 — 올리기 / AI 검증 / 직접 검토.
// 숫자는 서버에서 받아 나중에 채운다(_legacyCounts). 브라우저가 들고 있는
// 목록으로 세면 화면에 뜬 한 페이지만 세어져서, 800건인데 50건이라고 적힌다.
var _legacyCounts = null;

function legacyActionBarHtml(batch) {
  const c = _legacyCounts;
  const aiN = c ? c.target : null;
  const cost = c ? c.cost : null;
  // 배치 안에서는 그 파일 안의 업체만 다룬다는 걸 글자로 못박는다 —
  // 같은 버튼인데 범위가 다르면 눌러보고 나서야 알게 된다.
  const scopeNote = batch ? '이 파일 안에서만' : '올린 데이터 전체에서';

  const card = (id, icon, title, desc, accent, disabled) => `
    <button type="button" id="${id}" ${disabled ? 'disabled' : ''}
      style="flex:1;min-width:230px;display:flex;align-items:center;gap:13px;text-align:left;
             padding:15px 17px;border-radius:13px;cursor:${disabled ? 'not-allowed' : 'pointer'};
             border:1px solid ${disabled ? 'var(--border-default)' : accent};
             background:var(--bg-surface);opacity:${disabled ? '.5' : '1'};
             box-shadow:${disabled ? 'none' : 'var(--shadow-sm)'}">
      <span style="width:42px;height:42px;flex:none;border-radius:11px;display:flex;align-items:center;
                   justify-content:center;font-size:21px;background:${accent}14">${icon}</span>
      <span style="flex:1;min-width:0">
        <span style="display:block;font-size:14px;font-weight:800;color:var(--text-primary)">${title}</span>
        <span style="display:block;font-size:11.5px;color:var(--text-tertiary);margin-top:2px;line-height:1.5">${desc}</span>
      </span>
    </button>`;

  return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${batch ? '' : card('lgImportBtn', '⬆', '엑셀·CSV 올리기',
        '업체 목록 파일을 올립니다. 올린 날짜별 폴더로 들어갑니다.', '#2563eb', false)}
      ${card('lgAiVerifyBtn', '🧠', 'AI 검증 시작',
        aiN === null ? '대상을 세는 중…'
          : aiN === 0 ? '검증할 곳이 없습니다 — 모두 끝났습니다'
          : `${scopeNote} 아직 안 본 <b style="color:var(--text-primary)">${aiN.toLocaleString()}곳</b> · 약 ₩${cost.krw.toLocaleString()}`,
        '#7c3aed', aiN === 0)}
      ${card('lgDirectReviewBtn', '🔎', '직접 검토 시작',
        `${scopeNote} 한 회사씩 카드로 보며 보낼 곳인지 고릅니다.`, '#059669', false)}
    </div>`;
}

/**
 * 올린 데이터 AI 검증 — 20건씩 끊어 끝까지 돌린다.
 *
 * 누를 때마다 대상 건수만큼 Claude 요금이 나가는 버튼이라, 세 가지를 지킨다.
 *   1) 건수는 서버에서 센 값만 쓴다 (브라우저 목록으로 세면 틀린다)
 *   2) 시작 전에 건수와 예상 요금을 그대로 보여주고 확인을 받는다
 *   3) 도는 동안 어디까지 갔는지 보여주고, 중간에 멈출 수 있게 한다
 */
var _legacyAiStop = false;

async function runLegacyAiVerify() {
  if (!_legacyCounts) await loadLegacyCounts();
  const c = _legacyCounts;
  if (!c || !c.target) { alert('AI 검증할 곳이 없습니다.'); return; }

  const ok = confirm(
    `🧠 AI 검증을 시작합니다.\n\n` +
    `대상       ${c.target.toLocaleString()}곳 (아직 AI가 안 본 곳)\n` +
    `예상 요금  약 ₩${c.cost.krw.toLocaleString()} (${c.cost.model})\n` +
    (c.korea ? `한국 기업    ${c.korea.toLocaleString()}곳\n` : '') +
    `\n판정 결과에 따라 자동으로 나뉩니다.\n` +
    `  · 규모 적합      → [AI 검증 완료] 로 이동\n` +
    `  · 무관           → [보관함] 으로 이동\n` +
    `  · 애매함         → 그대로 두고 직접 검토 대상\n\n` +
    `메일은 보내지 않습니다. 진행할까요?`,
  );
  if (!ok) return;

  _legacyAiStop = false;
  const bar = document.getElementById('lgAiVerifyBtn');
  if (bar) bar.disabled = true;

  // 진행 상황을 작업 줄 자리에 그린다
  const host = document.createElement('div');
  host.id = 'lgAiProgress';
  host.style.cssText = `margin-bottom:14px;padding:17px 20px;border-radius:13px;
    border:1px solid #7c3aed;background:#faf5ff`;
  els.content.prepend(host);

  const paint = (done, moved, note) => {
    const pct = c.target ? Math.min(100, Math.round((done / c.target) * 100)) : 0;
    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <span style="font-size:20px">🧠</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:#5b21b6">AI 검증 중…</div>
          <div style="font-size:11.5px;color:#7c3aed;margin-top:1px">
            ${done.toLocaleString()} / ${c.target.toLocaleString()}곳 · ${note || '진행 중'}
          </div>
        </div>
        <button type="button" id="lgAiStop"
          style="padding:7px 15px;font-size:12px;font-weight:700;border:1px solid #c4b5fd;
                 border-radius:8px;background:#fff;color:#6d28d9;cursor:pointer">■ 여기서 멈추기</button>
      </div>
      <div style="height:9px;background:#ede9fe;border-radius:99px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#7c3aed;transition:width .3s"></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:#5b21b6">
        <span>✅ 검증 완료로 <b>${moved.verified.toLocaleString()}</b></span>
        <span>📦 보관함으로 <b>${moved.archived.toLocaleString()}</b></span>
        <span>🤔 애매함 <b>${moved.kept.toLocaleString()}</b></span>
      </div>
      <div style="font-size:11px;color:#7c3aed;opacity:.8;margin-top:7px">
        멈춰도 여기까지 판정한 것은 그대로 남습니다. 나중에 이어서 돌릴 수 있습니다.
      </div>`;
    document.getElementById('lgAiStop')?.addEventListener('click', () => {
      _legacyAiStop = true;
      const b = document.getElementById('lgAiStop');
      if (b) { b.disabled = true; b.textContent = '멈추는 중…'; }
    });
  };

  let done = 0;
  const moved = { verified: 0, archived: 0, kept: 0 };
  paint(0, moved, '시작하는 중');

  try {
    // 안전장치 — 대상 수로 계산한 청크보다 넉넉히, 그래도 무한 루프는 막는다
    const maxRounds = Math.min(400, Math.ceil(c.target / 20) + 5);
    for (let i = 0; i < maxRounds; i++) {
      if (_legacyAiStop) break;
      const r = await safeJsonFetch('/api/leads/verify-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'legacy', limit: 20, excludeKorea: true, autoMoveStage: true,
          batch: _legacy.batch || undefined,
        }),
      });
      if (!r || !r.success) throw new Error(r?.error || 'AI 검증 실패');

      done += r.processed || 0;
      if (r.stageMoves) {
        moved.verified += r.stageMoves.verified || 0;
        moved.archived += r.stageMoves.archived || 0;
        moved.kept += r.stageMoves.kept || 0;
      }
      paint(done, moved, `남은 ${(r.remaining || 0).toLocaleString()}곳`);

      if (!r.hasMore || !r.processed) break;
      await new Promise((res) => setTimeout(res, 300));   // API 부하 완화
    }

    alert(
      `✅ AI 검증 ${_legacyAiStop ? '중단' : '완료'}\n\n` +
      `처리한 곳          ${done.toLocaleString()}\n` +
      `→ AI 검증 완료로   ${moved.verified.toLocaleString()}\n` +
      `→ 보관함으로       ${moved.archived.toLocaleString()}\n` +
      `→ 애매해서 그대로  ${moved.kept.toLocaleString()}\n\n` +
      (moved.kept ? '애매한 곳은 [🔎 직접 검토 시작]에서 직접 보시면 됩니다.' : ''),
    );
  } catch (e) {
    alert(`❌ AI 검증 실패: ${(e && e.message) || e}\n\n여기까지 처리: ${done.toLocaleString()}곳 (그대로 남아 있습니다)`);
  } finally {
    _legacyCounts = null;              // 숫자를 다시 받는다
    _legacy.batch = '';
    invalidateServerPage();
    loadStageCounts(true);
    document.getElementById('lgAiProgress')?.remove();
    renderLegacyPage();
  }
}

/** 작업 줄 숫자 — 서버에서 받아 그 부분만 다시 그린다 */
async function loadLegacyCounts() {
  try {
    const p = new URLSearchParams({ scope: 'legacy' });
    if (_legacy.batch) p.set('batch', _legacy.batch);   // 파일 안에 있으면 그 파일만
    const r = await safeJsonFetch('/api/leads/verify-ai/count?' + p);
    if (r && r.success) _legacyCounts = r;
  } catch (e) {
    console.warn('[legacy] AI 검증 대상 조회 실패', e);
  }
}

function bindLegacyActionBar() {
  document.getElementById('lgImportBtn')?.addEventListener('click', () => openImportCsvModal());
  document.getElementById('lgAiVerifyBtn')?.addEventListener('click', () => runLegacyAiVerify());
  document.getElementById('lgDirectReviewBtn')?.addEventListener('click', () => startDirectReview('legacy', _legacy.batch));
}

/**
 * 올린 업체 화면에서 바로 옮길 수 있는 단계 (서버 api/leads/legacy LEGACY_MOVE_STAGES 와 같아야 한다).
 * 대표님 요청 2026-09-15 — 검증 완료뿐 아니라 2차 검토·발송·대화 진행 중으로도 바로 보낸다.
 */
const LEGACY_MOVE_TARGETS = [
  { stage: 'verified', label: '✅ AI 검증 완료', hint: '2차 검토에서 볼 곳으로', needsEmail: true },
  { stage: 'queued', label: '📨 발송 관리 (보낼 메일)', hint: '바로 보낼 곳으로', needsEmail: true },
  { stage: 'replied', label: '💬 답장 받음', hint: '이미 답이 온 곳' },
  { stage: 'negotiating', label: '🤝 대화 진행 중', hint: '이야기 중인 곳' },
  { stage: 'partner', label: '⭐ 파트너십 확정', hint: '계약·합의된 곳' },
  { stage: 'failed', label: '🚫 검증 실패', hint: '보낼 곳이 아님' },
];
const legacyTarget = (stage) => LEGACY_MOVE_TARGETS.find((t) => t.stage === stage) || LEGACY_MOVE_TARGETS[0];

/** 올린 업체를 고른 단계로 옮긴다 (한 곳 또는 여러 곳) */
async function moveLegacyLeads(leadIds, stage, opts = {}) {
  const t = legacyTarget(stage);
  if (!leadIds.length) return;
  if (!opts.skipConfirm) {
    const extra = t.needsEmail ? '\n\n메일 주소가 없는 곳은 제외됩니다.' : '';
    if (!confirm(`${leadIds.length}곳을 [${t.label}] 로 옮깁니다.${extra}\n\n진행할까요?`)) return;
  }
  try {
    const r = await safeJsonFetch('/api/leads/legacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds, stage }),
    });
    if (!r?.success) throw new Error(r?.error || '이동 실패');
    if (!opts.quiet) {
      alert(`${r.moved}곳을 [${t.label}] 로 옮겼습니다.` + (r.skipped ? `\n(메일 주소가 없는 ${r.skipped}곳은 제외)` : ''));
    }
    _legacy.sel.clear();
    invalidateServerPage();
    loadStageCounts(true);
    renderLegacyPage();
  } catch (e) {
    alert(`이동하지 못했습니다: ${(e && e.message) || e}`);
  }
}

async function renderLegacyPage() {
  els.content.innerHTML = `<div class="inline-loader">불러오는 중…</div>`;
  const p = new URLSearchParams();
  if (_legacy.batch) {
    p.set('batch', _legacy.batch);
    p.set('page', String(_legacy.page));
    p.set('limit', '50');
    if (_legacy.q) p.set('q', _legacy.q);
    if (_legacy.region) p.set('region', _legacy.region);
  }
  let d;
  try {
    d = await safeJsonFetch(`/api/leads/legacy?${p}`);
    // safeJsonFetch 는 500 에도 예외를 던지지 않고 본문을 그대로 준다.
    // 이 줄이 없으면 아래 d.items.map 에서 TypeError 가 나고, 화면에는
    // "불러오는 중…" 만 남아 고장 원인을 알 수 없다.
    if (!d || !d.success) throw new Error(d?.error || '올린 데이터를 불러오지 못했습니다');
  } catch (e) {
    els.content.innerHTML = `
      <div class="empty-detail" style="padding:40px 24px">
        <div style="font-size:44px;margin-bottom:8px">⚠️</div>
        <h3>불러오기 실패</h3>
        <p>${escapeHtml(String(e.message || e))}</p>
        <p style="margin-top:6px;color:var(--text-tertiary);font-size:12.5px">
          올린 데이터는 그대로 있습니다. 잠시 뒤 다시 시도해 주세요.</p>
        <button type="button" id="lgRetry"
          style="margin-top:16px;padding:11px 22px;border:none;border-radius:10px;background:#2563eb;
                 color:#fff;font-size:13.5px;font-weight:800;cursor:pointer">다시 시도</button>
      </div>`;
    els.content.querySelector('#lgRetry')?.addEventListener('click', () => renderLegacyPage());
    return;
  }

  // ── 배치 목록 ──
  if (d.mode === 'batches') {
    const dateOf = (b) => {
      const m = String(b || '').match(/(\d{4})(\d{2})(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : '날짜 미상';
    };
    els.content.innerHTML = `
      ${legacyActionBarHtml('')}
      <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:13px;
                  padding:17px 20px;margin-bottom:15px">
        <div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:5px">
          올린 파일별로 나뉘어 있습니다
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.75">
          엑셀로 올린 데이터는 <b>올린 날짜별 폴더</b>로 들어옵니다. 여기서 사라지지 않습니다.<br>
          보낼 만한 곳을 골라 <b>[AI 검증 완료]</b> 로 옮기면 발송 대상이 됩니다.
        </div>
        <div style="margin-top:11px;padding-top:11px;border-top:1px solid var(--border-subtle);
                    font-size:12px;color:var(--text-tertiary);line-height:1.7">
          같은 파일을 여러 번 올려 생긴 <b>완전 사본은 정리했습니다</b>
          (회사명·이메일·지역가 모두 같은 건만). 지역나 연락처가 다르면 다른 업체로 보고 남겨 뒀습니다.
        </div>
      </div>
      <div style="font-size:11px;font-weight:800;color:var(--text-quaternary);letter-spacing:.04em;
                  margin:0 2px 8px">📁 올린 파일 (${d.batches.length}개)</div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${d.batches.map((b) => `
          <div class="legacy-batch" data-batch="${escapeAttr(b._id || '')}"
               style="border:1px solid var(--border-default);border-radius:12px;padding:15px 18px;
                      background:var(--bg-surface);cursor:pointer;display:flex;align-items:center;gap:16px">
            <span style="font-size:26px">📄</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:800;color:var(--text-primary)">${escapeHtml(dateOf(b._id))} 업로드</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);font-family:monospace">${escapeHtml(b._id || '(배치 없음)')}</div>
            </div>
            <div style="text-align:right;font-size:12px;color:var(--text-secondary);white-space:nowrap">
              <div>이메일 있는 곳 <b style="color:var(--text-primary)">${(b.withEmail || 0).toLocaleString()}</b></div>
              <div style="font-size:11px;color:var(--text-tertiary)">전체 ${(b.total || 0).toLocaleString()} · 보관 ${(b.archived || 0).toLocaleString()}</div>
            </div>
            <span style="color:#2563eb;font-weight:700;font-size:13px">열기 →</span>
          </div>`).join('')}
      </div>`;
    bindLegacyActionBar();
    els.content.querySelectorAll('.legacy-batch').forEach((el) => {
      el.addEventListener('click', () => {
        _legacy.batch = el.dataset.batch;
        _legacy.page = 1; _legacy.q = ''; _legacy.region = ''; _legacy.sel.clear();
        renderLegacyPage();
      });
    });
    // 숫자는 뒤늦게 와도 된다 — 화면이 먼저 뜨는 편이 낫다.
    // 받고 나면 작업 줄만 다시 그린다.
    if (!_legacyCounts) {
      loadLegacyCounts().then(() => {
        if (state.view !== 'tool-legacy' || _legacy.batch) return;
        const bar = els.content.firstElementChild;
        if (!bar) return;
        bar.outerHTML = legacyActionBarHtml();
        bindLegacyActionBar();
      });
    }
    return;
  }

  // ── 배치 안의 리드 목록 ──
  const totalPages = Math.max(1, Math.ceil(d.total / d.limit));
  const rows = d.items.map((l) => {
    const on = _legacy.sel.has(l.leadId);
    const why = l.dedupReason || l.bulkMoveReason || '';
    return `<tr class="legacy-row" data-oid="${escapeAttr(String(l._id))}" data-lead="${escapeAttr(l.leadId)}" style="cursor:pointer">
      <td style="width:34px"><input type="checkbox" class="lg-check" data-lead="${escapeAttr(l.leadId)}" ${on ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer"></td>
      <td>
        <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${escapeHtml(l.Company || '')}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(l.Email || '')}</div>
        ${why ? `<div style="font-size:10.5px;color:var(--text-quaternary)">보관 사유 · ${escapeHtml(String(why).slice(0, 70))}</div>` : ''}
      </td>
      <td style="white-space:nowrap;font-size:12px;color:var(--text-secondary)">${escapeHtml(l.Region || '')}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${escapeHtml(String(l.Type || '').slice(0, 26))}</td>
      <td>${websiteLinkHtml(l.WebsiteContact, { short: true })}</td>
      <td style="white-space:nowrap;font-size:11px;color:var(--text-tertiary)">${escapeHtml((STAGE_STYLE[l.stage] || {}).label || l.stage || '')}</td>
      <td style="white-space:nowrap;text-align:right">
        <select class="lg-row-move" data-lead="${escapeAttr(l.leadId)}" title="이 업체를 바로 다른 단계로 옮깁니다"
          style="padding:4px 7px;font-size:11.5px;border:1px solid var(--border-default);border-radius:7px;
                 background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;max-width:150px">
          <option value="">→ 옮기기…</option>
          ${LEGACY_MOVE_TARGETS.map((t) => `<option value="${t.stage}">${escapeHtml(t.label)}</option>`).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');

  els.content.innerHTML = `
    ${legacyActionBarHtml(_legacy.batch)}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <button class="button secondary" id="lgBack" type="button">← 배치 목록</button>
      <input id="lgSearch" type="search" placeholder="회사·이메일 검색" value="${escapeAttr(_legacy.q)}"
        style="padding:7px 12px;font-size:13px;border:1px solid var(--border-default);border-radius:8px;
               background:var(--bg-surface);color:var(--text-primary);min-width:190px">
      <select id="lgRegion" style="padding:7px 10px;font-size:13px;border:1px solid var(--border-default);
              border-radius:8px;background:var(--bg-surface);color:var(--text-primary)">
        <option value="">전체 지역</option>
        ${(d.countries || []).map((c) => `<option value="${escapeAttr(c._id || '')}" ${_legacy.region === c._id ? 'selected' : ''}>${escapeHtml(c._id || '(없음)')} (${c.n})</option>`).join('')}
      </select>
      <span style="font-size:12px;color:var(--text-tertiary)">총 ${d.total.toLocaleString()}건</span>
      <button type="button" id="lgSelectAll"
        style="font-size:12px;padding:7px 13px;border:1px solid var(--border-default);border-radius:8px;
               background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;white-space:nowrap">
        이 페이지 전체 선택
      </button>
      <select id="lgMoveTarget" title="어디로 옮길지 고릅니다"
        style="margin-left:auto;padding:9px 11px;font-size:13px;border:1px solid var(--border-default);
               border-radius:9px;background:var(--bg-surface);color:var(--text-primary);font-weight:700">
        ${LEGACY_MOVE_TARGETS.map((t) => `<option value="${t.stage}" ${_legacy.moveTarget === t.stage ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
      </select>
      <button id="lgMove" type="button" disabled
        style="font-size:13.5px;font-weight:700;padding:10px 18px;border:none;
               border-radius:9px;white-space:nowrap;background:#94a3b8;color:#fff;cursor:default">
        선택한 <span id="lgCount">0</span>곳 옮기기
      </button>
    </div>
    <div style="font-size:12px;color:var(--text-tertiary);margin:-4px 2px 10px;line-height:1.6">
      체크한 뒤 오른쪽에서 <b>어디로 보낼지</b> 고르고 [옮기기]를 누릅니다. 한 곳만 옮길 때는 그 줄 오른쪽의
      <b>[→ 옮기기…]</b> 를 쓰면 됩니다. <b>[✅ AI 검증 완료]</b> 로 보내면 2차 검토에서 보이고,
      <b>[📨 발송 관리]</b> 로 보내면 바로 보낼 곳이 됩니다 (메일 주소가 있는 곳만).
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>회사</th><th>지역</th><th>업종</th><th>웹사이트</th><th>상태</th><th style="text-align:right">이동</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div id="lgPager"></div>`;

  const syncBtn = () => {
    const n = _legacy.sel.size;
    const btn = els.content.querySelector('#lgMove');
    els.content.querySelector('#lgCount').textContent = String(n);
    btn.disabled = n === 0;
    // disabled 속성만으로는 눌러도 되는 버튼처럼 보인다 — 색으로도 알린다
    btn.style.background = n ? '#15803d' : '#94a3b8';
    btn.style.cursor = n ? 'pointer' : 'default';
    btn.style.boxShadow = n ? '0 2px 8px rgba(21,128,61,.3)' : 'none';
  };
  els.content.querySelectorAll('.lg-check').forEach((cb) => {
    cb.addEventListener('click', (ev) => ev.stopPropagation());   // 체크가 행 클릭으로 번지지 않게
    cb.addEventListener('change', () => {
      if (cb.checked) _legacy.sel.add(cb.dataset.lead); else _legacy.sel.delete(cb.dataset.lead);
      syncBtn();
    });
  });

  // 행 클릭 → 검증 완료와 같은 상세 팝업.
  // 이 리드들은 화면 목록(baseLeads)에 없어서 _id 로 직접 받아온다.
  els.content.querySelectorAll('.legacy-row').forEach((tr) => {
    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('input, a, button')) return;
      openLeadPopupByObjectId(tr.dataset.oid, tr.dataset.lead);
    });
  });
  syncBtn();

  // 이 페이지에 보이는 것만 토글한다 — 전체 256건을 한 번에 잡으면
  // 확인 없이 옮기게 되고, 되돌리려면 하나씩 빼야 한다.
  els.content.querySelector('#lgSelectAll')?.addEventListener('click', (ev) => {
    const boxes = [...els.content.querySelectorAll('.lg-check')];
    const allOn = boxes.length > 0 && boxes.every((cb) => cb.checked);
    boxes.forEach((cb) => {
      cb.checked = !allOn;
      if (cb.checked) _legacy.sel.add(cb.dataset.lead);
      else _legacy.sel.delete(cb.dataset.lead);
    });
    ev.currentTarget.textContent = allOn ? '이 페이지 전체 선택' : '이 페이지 선택 해제';
    syncBtn();
  });

  bindLegacyActionBar();
  // 이 파일 안의 대상 수를 다시 받는다 — 배치마다 숫자가 다르다
  loadLegacyCounts().then(() => {
    if (state.view !== 'tool-legacy' || !_legacy.batch) return;
    const bar = els.content.firstElementChild;
    if (!bar) return;
    bar.outerHTML = legacyActionBarHtml(_legacy.batch);
    bindLegacyActionBar();
  });

  els.content.querySelector('#lgBack').addEventListener('click', () => {
    _legacy.batch = ''; _legacy.sel.clear();
    _legacyCounts = null;    // 범위가 전체로 바뀌므로 숫자를 다시 받는다
    renderLegacyPage();
  });
  let t;
  els.content.querySelector('#lgSearch').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { _legacy.q = e.target.value; _legacy.page = 1; renderLegacyPage(); }, 400);
  });
  els.content.querySelector('#lgRegion').addEventListener('change', (e) => {
    _legacy.region = e.target.value; _legacy.page = 1; renderLegacyPage();
  });

  els.content.querySelector('#lgMoveTarget')?.addEventListener('change', (e) => {
    _legacy.moveTarget = e.target.value;
  });
  els.content.querySelector('#lgMove').addEventListener('click', async (e) => {
    const ids = [..._legacy.sel];
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = '이동 중…';
    await moveLegacyLeads(ids, _legacy.moveTarget || 'verified');
  });
  // 한 곳만 바로 옮기기 (행 오른쪽 선택칸)
  els.content.querySelectorAll('.lg-row-move').forEach((sel) => {
    sel.addEventListener('click', (ev) => ev.stopPropagation());
    sel.addEventListener('change', async () => {
      const stage = sel.value;
      if (!stage) return;
      await moveLegacyLeads([sel.dataset.lead], stage);
    });
  });

  const pager = els.content.querySelector('#lgPager');
  if (pager && totalPages > 1) {
    pager.innerHTML = renderPaginationBar(d.page, totalPages, d.total, { compact: true });
    pager.querySelectorAll('[data-page]').forEach((b) => {
      b.addEventListener('click', () => {
        const t2 = parseInt(b.dataset.page);
        if (!Number.isNaN(t2)) { _legacy.page = Math.min(Math.max(1, t2), totalPages); renderLegacyPage(); }
      });
    });
  }
}

// ── 직접 검토 ─────────────────────────────────────────────────
//
// 400여 곳을 표에서 한 줄씩 열고 닫으며 판단하면 지친다.
// 한 회사를 한 화면에 크게 띄우고, 버튼 하나를 누르면 바로 다음으로 넘어간다.
// 키보드(← 검증 실패 / → 메일 보낼곳 / Enter 웹사이트)로도 되어
// 마우스를 놓지 않아도 된다.
//
// 분류 탭은 뺐다. AI 가 이미 한 번 걸러 놓은 목록이라 분류를 또 고르는 것은
// 고를 것만 하나 늘리는 일이었다. 추천 점수 높은 곳부터 내려오므로 도중에
// 그만둬도 값어치 있는 곳은 이미 판단이 끝나 있다.
//
// 판단 기준이 흔들리지 않게 점수가 같으면 지역순으로 내려준다 —
// 스웨덴 20곳을 연달아 보는 편이 매번 다른 나라로 튀는 것보다 덜 지친다.
// decided — 이번에 고른 것을 기억한다 (leadId → 'queued' | 'failed' | 'archived').
//
// [‹ 이전] 으로 돌아가는 이유는 대개 "방금 잘못 눌렀다" 이다. 그때 이 회사를
// 어디로 보냈는지 화면에 보여주지 않으면 되돌아온 의미가 없다.
// 진행 수도 이 크기로 센다 — 하나를 두 번 고쳐도 2건으로 세지 않는다.
// skip — 지금까지 건너뛴 만큼의 오프셋.
//
// 이게 없으면 [다음 ›] 으로만 30곳을 넘긴 뒤 묶음을 새로 받을 때 똑같은 30곳이
// 다시 온다. 건너뛰기는 DB 를 건드리지 않아 서버 대기열이 그대로이고 정렬도
// 고정이기 때문이다. 판정을 하나도 안 하면 같은 카드 30장을 영원히 돌게 된다.
// 판정한 건은 대기열에서 빠져 뒤가 당겨지므로, 건너뛴 수만큼만 밀어준다.
var _review = { queue: [], idx: 0, skip: 0, source: '', batch: '', from: '', remaining: 0, queued: 0, failed: 0, decided: new Map(), busy: false };

// 분류 배지는 국내 카테고리(lead.category)를 쓴다.
//
// 예전에는 Lead.Category(대문자) 라는 별도 칸을 봤다. 해외판이 바이어를
// 'Distributor' · 'Retail Chain' 처럼 나누던 칸인데, 국내판에는 값이 한 건도 없다.
// 소문자 category 와 이름이 한 글자 차이라 어느 쪽을 읽는지 늘 헷갈렸고,
// 실제로 배지가 아무 데서도 안 뜨는 원인이었다. 칸을 하나로 합쳤다.

/**
 * 다음 묶음(30곳)을 받아온다.
 *
 * 고른 회사는 서버 대기열에서 빠지므로, 다시 받으면 아직 안 고른 것만 온다.
 * 건너뛴 회사는 그대로 남아 있어 다시 나온다 — 건너뛰기는 "나중에" 라는 뜻이다.
 */
function reviewScopeParams() {
  // 목록에서 검색·지역로 좁혀 놓고 들어왔으면 그 범위만 본다.
  // 12곳을 보다 눌렀는데 418곳이 나오면 무엇을 보고 있는지 알 수 없다.
  //
  // source 는 어느 풀을 검토하는지 — [AI 검증 완료] 인지 [올린 데이터] 인지.
  // 올린 데이터에서 들어오면 검색·지역는 따라가지 않는다(그 화면의 조건이 아니다).
  if (_review.source === 'legacy') {
    return _review.batch ? { source: 'legacy', batch: _review.batch } : { source: 'legacy' };
  }
  return {
    q: (state.query || '').trim(),
    region: state.region && state.region !== 'All' ? state.region : '',
  };
}

async function loadReviewBatch(wrapped) {
  els.content.innerHTML = `<div class="inline-loader">불러오는 중…</div>`;
  const scope = reviewScopeParams();
  const p = new URLSearchParams({ limit: '30', skip: String(_review.skip || 0) });
  if (scope.q) p.set('q', scope.q);
  if (scope.region) p.set('region', scope.region);
  if (scope.source) p.set('source', scope.source);
  if (scope.batch) p.set('batch', scope.batch);

  const d = await safeJsonFetch(`/api/leads/review?${p}`);
  // safeJsonFetch 는 4xx·5xx 에도 예외를 던지지 않고 본문을 그대로 준다.
  // 이 줄이 없으면 서버 오류가 "items 0건" 으로 읽혀 🎉 검토 완료 화면이 뜨고,
  // 누적 숫자까지 0 으로 덮어써진다 — 418곳이 남아 있는데 다 끝난 줄 알게 된다.
  if (!d || !d.success) throw new Error(d?.error || '검토 목록을 불러오지 못했습니다');

  // 끝까지 훑었는데 비었다면, 앞에서 건너뛴 것들이 아직 남아 있다.
  // 오프셋을 0 으로 되돌려 한 바퀴 더 돈다 (한 번만 — 진짜 0건이면 그대로 끝낸다).
  if (!(d.items || []).length && (_review.skip || 0) > 0 && !wrapped) {
    _review.skip = 0;
    return loadReviewBatch(true);
  }

  _review.queue = d.items || [];
  _review.idx = 0;
  _review.remaining = d.remaining || 0;
  _review.queued = d.queued || 0;
  _review.failed = d.failed || 0;
}

async function renderReviewPage() {
  if (!_review.queue.length || _review.idx >= _review.queue.length) {
    try {
      await loadReviewBatch();
    } catch (e) {
      if (state.view !== 'tool-review') return;
      els.content.innerHTML = `
        <div class="empty-detail" style="padding:40px 24px">
          <div style="font-size:44px;margin-bottom:8px">⚠️</div>
          <h3>목록을 불러오지 못했습니다</h3>
          <p>${escapeHtml(String(e.message || e))}</p>
          <p style="margin-top:6px;color:var(--text-tertiary);font-size:12.5px">
            아직 아무것도 사라지지 않았습니다. 잠시 뒤 다시 시도해 주세요.</p>
          <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button type="button" id="rvRetry"
              style="padding:11px 22px;border:none;border-radius:10px;background:#2563eb;
                     color:#fff;font-size:13.5px;font-weight:800;cursor:pointer">다시 시도</button>
            <button type="button" id="rvExitErr"
              style="padding:11px 22px;border:1px solid var(--border-default);border-radius:10px;
                     background:var(--bg-surface);color:var(--text-secondary);font-size:13.5px;
                     font-weight:700;cursor:pointer">← 돌아가기</button>
          </div>
        </div>`;
      els.content.querySelector('#rvRetry')?.addEventListener('click', () => renderReviewPage());
      els.content.querySelector('#rvExitErr')?.addEventListener('click', () => exitDirectReview());
      return;
    }
    // 불러오는 사이 사이드바로 나갔을 수 있다.
    // 그대로 그리면 지금 보고 있는 화면 위에 검토 카드가 덮어 그려진다.
    if (state.view !== 'tool-review') return;
  }

  const done = _review.decided.size;
  const lead = _review.queue[_review.idx];
  if (!lead) {
    els.content.innerHTML = `
      <div class="empty-detail" style="padding:44px 24px">
        <div style="font-size:52px;margin-bottom:10px">🎉</div>
        <h3>검토할 회사가 없습니다</h3>
        <p>이번에 <b>${done.toLocaleString()}곳</b>을 판단하셨습니다.</p>
        <p style="margin-top:6px">
          메일 보낼곳으로 고른 <b>${_review.queued.toLocaleString()}곳</b>은
          [📤 발송 관리 → 보낼 메일]에서 보낼 수 있습니다.
        </p>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button type="button" id="rvGoOutbox"
            style="padding:11px 22px;border:none;border-radius:10px;background:#2563eb;
                   color:#fff;font-size:13.5px;font-weight:800;cursor:pointer">📤 발송 관리로 가기</button>
          <button type="button" id="rvExitEmpty"
            style="padding:11px 22px;border:1px solid var(--border-default);border-radius:10px;
                   background:var(--bg-surface);color:var(--text-secondary);font-size:13.5px;
                   font-weight:700;cursor:pointer">←
            ${_review.source === 'legacy' ? '올린 데이터로' : 'AI 검증 완료로'}</button>
        </div>
      </div>`;
    els.content.querySelector('#rvGoOutbox')?.addEventListener('click', () =>
      document.querySelector('.nav-item[data-view="pipeline-contacted"]')?.click());
    els.content.querySelector('#rvExitEmpty')?.addEventListener('click', () => exitDirectReview());
    return;
  }

  const totalKnown = _review.remaining + done;
  const pct = totalKnown ? Math.round((done / totalKnown) * 100) : 0;
  const site = lead.WebsiteContact || '';

  // 이 회사를 이번에 이미 골랐나 — [‹ 이전] 으로 돌아온 경우
  const picked = _review.decided.get(lead.leadId) || '';
  const atFirst = _review.idx === 0;
  const row = (label, value) => value
    ? `<div style="display:flex;gap:16px;padding:11px 0;border-bottom:1px solid var(--border-default)">
         <span style="width:88px;flex:none;font-size:13px;color:var(--text-tertiary);font-weight:700">${label}</span>
         <span style="font-size:15px;color:var(--text-primary);word-break:break-word;line-height:1.55">${value}</span>
       </div>` : '';

  els.content.innerHTML = `
    <div style="max-width:960px;margin:0 auto">
      <!-- 나가는 길. 이 화면은 목록을 덮고 뜨는데 [이전]/[다음]은 회사를
           넘기는 버튼이라, 이게 없으면 검토를 그만두고 싶어도 사이드바를
           다시 누르는 수밖에 없었다. 그것도 어디서 들어왔는지는 안 남는다. -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <button type="button" id="rvExit"
          title="검토를 멈추고 돌아갑니다 (Esc). 여기까지 고른 것은 그대로 저장돼 있습니다."
          style="display:inline-flex;align-items:center;gap:6px;padding:8px 15px;border-radius:9px;
                 border:1px solid var(--border-default);background:var(--bg-surface);
                 color:var(--text-secondary);font-size:12.5px;font-weight:700;cursor:pointer">
          ← ${_review.source === 'legacy' ? '올린 데이터로' : 'AI 검증 완료로'}
        </button>
        <span style="font-size:11.5px;color:var(--text-quaternary)">
          여기까지 고른 것은 이미 저장돼 있습니다 · Esc 로도 나갈 수 있습니다
        </span>
      </div>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
        <span style="font-size:13px;font-weight:800;color:var(--text-primary)">
          ${done.toLocaleString()} / ${totalKnown.toLocaleString()}
        </span>
        <div style="flex:1;height:7px;background:var(--bg-surface-alt);border-radius:99px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:#2563eb;transition:width .2s"></div>
        </div>
        <span style="font-size:12px;color:#2563eb;font-weight:700">보낼곳 ${_review.queued.toLocaleString()}</span>
        <span style="font-size:12px;color:var(--text-tertiary)">실패 ${_review.failed.toLocaleString()}</span>
      </div>
      <div style="font-size:11px;color:var(--text-quaternary);margin-bottom:14px">
        키보드 — ← 검증 실패 · → 메일 보낼곳 · Backspace 이전 회사 · Enter 웹사이트 열기 · Esc 나가기
        &nbsp;|&nbsp; 실패로 빼도 지워지지 않습니다. [❌ 검증 실패]에서 되돌릴 수 있습니다.
      </div>

      <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:20px;
                  padding:34px 38px;box-shadow:0 4px 24px rgba(15,23,42,0.07)">
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:6px;flex-wrap:wrap">
          <h2 style="margin:0;font-size:32px;font-weight:800;color:var(--text-primary);line-height:1.2;
                     flex:1;min-width:260px;word-break:break-word">
            ${escapeHtml(lead.Company || '(회사명 없음)')}
          </h2>
          <span style="flex:none;padding:6px 14px;background:var(--bg-surface-alt);border-radius:99px;
                       font-size:13px;font-weight:700;color:var(--text-secondary)">${escapeHtml(lead.Region || '—')}</span>
          ${lead.category ? `<span style="flex:none">${krCategoryBadge(lead.category)}</span>` : ''}
          ${lead.recoScore ? `<span title="발송 우선순위 점수" style="flex:none;padding:6px 13px;background:#ecfdf5;
                       border-radius:99px;font-size:13px;font-weight:800;color:#047857">추천 ${lead.recoScore}</span>` : ''}
        </div>
        ${site ? `<a href="${escapeAttr(urlFor(site))}" target="_blank" rel="noreferrer"
             style="font-size:14.5px;color:#2563eb;text-decoration:none;word-break:break-all">${escapeHtml(site)} ↗</a>` : ''}

        <div style="margin-top:22px">
          ${row('이메일', escapeHtml(lead.Email || ''))}
          ${row('업종', escapeHtml(lead.TypeKo || lead.Type || ''))}
          ${row('전화', escapeHtml(lead.Phone || ''))}
          ${row('취급', escapeHtml(String(lead.BrandsChannels || '').slice(0, 300)))}
        </div>

        ${lead.Evidence || lead.EvidenceKo ? `
          <div style="margin-top:22px;padding:18px 21px;background:var(--bg-surface-alt);border-radius:13px;
                      border-left:4px solid #2563eb">
            <div style="font-size:11.5px;font-weight:800;color:#2563eb;
                        letter-spacing:.5px;margin-bottom:8px">왜 이 회사인가</div>
            <!-- 한국어본이 있으면 그것을 보여준다. 쓰는 사람이 전부 한국인이라
                 영문을 매번 번역 버튼으로 여는 건 손이 많이 간다. -->
            <div style="font-size:14.5px;line-height:1.8;color:var(--text-secondary);white-space:pre-wrap">${escapeHtml(String(lead.EvidenceKo || lead.Evidence).slice(0, 700))}</div>
            ${lead.EvidenceKo ? '' : translateBtnHtml(String(lead.Evidence).slice(0, 700), { inline: true })}
            ${lead.Sources ? `<div style="margin-top:11px;font-size:12px;color:var(--text-quaternary);word-break:break-all">
              출처 · ${escapeHtml(String(lead.Sources).slice(0, 300))}</div>` : ''}
          </div>` : ''}

        ${(lead.recoReasons || []).length ? `
          <div style="margin-top:15px;display:flex;gap:6px;flex-wrap:wrap">
            ${lead.recoReasons.map((r) => `<span style="padding:5px 12px;background:var(--bg-surface-alt);
              border-radius:99px;font-size:12.5px;color:var(--text-secondary)">${escapeHtml(r)}</span>`).join('')}
          </div>` : ''}

        <!-- 이미 고른 회사로 되돌아온 경우 — 무엇으로 골랐는지 먼저 알려준다.
             안 그러면 되돌아와서 또 같은 고민을 하게 된다. -->
        ${picked ? `
          <div style="margin-top:18px;padding:11px 14px;border-radius:10px;display:flex;
                      align-items:center;gap:8px;font-size:12.5px;font-weight:700;
                      background:${picked === 'queued' ? '#eff6ff' : '#fef2f2'};
                      color:${picked === 'queued' ? '#1d4ed8' : '#b91c1c'};
                      border:1px solid ${picked === 'queued' ? '#bfdbfe' : '#fecaca'}">
            <span style="font-size:15px">${picked === 'queued' ? '✉' : '🚫'}</span>
            이 회사는 <b>${picked === 'queued' ? '메일 보낼곳' : '검증 실패'}</b>으로 골랐습니다.
            <span style="font-weight:500;opacity:.8">아래에서 다시 고르면 바뀝니다.</span>
          </div>` : ''}

        <!-- 버튼 글자를 결과 그대로 적는다. "승인/제외" 로는 누른 뒤 이 회사가
             어디로 가는지 알 수 없어서, 목록 이름을 그대로 쓴다. -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:${picked ? '10px' : '20px'}">
          <button type="button" id="rvReject" style="padding:19px;border-radius:13px;
            border:1px solid ${picked === 'failed' ? '#b91c1c' : '#fca5a5'};
            background:${picked === 'failed' ? '#fee2e2' : '#fef2f2'};
            box-shadow:${picked === 'failed' ? 'inset 0 0 0 2px #b91c1c' : 'none'};
            color:#b91c1c;font-size:16px;font-weight:800;cursor:pointer">🚫 검증실패 업체로 선정 <span style="opacity:.6;font-weight:500">←</span></button>
          <button type="button" id="rvApprove" style="padding:19px;border-radius:13px;border:none;
            background:${picked === 'queued' ? '#1d4ed8' : '#2563eb'};
            box-shadow:${picked === 'queued' ? 'inset 0 0 0 3px #93c5fd' : '0 4px 14px rgba(37,99,235,.34)'};
            color:#fff;font-size:16px;font-weight:800;cursor:pointer">✉ 메일 보낼곳으로 선정 <span style="opacity:.7;font-weight:500">→</span></button>
        </div>

        <!-- 앞뒤로 넘기기. 고르지 않고 넘어가는 [다음 ›] 은 예전의 "건너뛰기" 와
             같다 — DB 를 건드리지 않으므로 다시 들어오면 또 나온다.
             [‹ 이전] 은 잘못 눌렀을 때 되돌아가려고 둔다. -->
        <div style="display:flex;align-items:center;gap:10px;margin-top:14px;
                    padding-top:13px;border-top:1px solid var(--border-default)">
          <button type="button" id="rvPrev" ${atFirst ? 'disabled' : ''}
            title="${atFirst ? '첫 회사입니다' : '앞 회사로 돌아갑니다'}"
            style="padding:9px 16px;border-radius:9px;border:1px solid var(--border-default);
                   background:var(--bg-surface);color:var(--text-secondary);font-size:12.5px;
                   font-weight:700;cursor:${atFirst ? 'not-allowed' : 'pointer'};
                   opacity:${atFirst ? '.4' : '1'}">‹ 이전</button>
          <span style="flex:1;text-align:center;font-size:12px;color:var(--text-tertiary)">
            이 묶음 ${(_review.idx + 1).toLocaleString()} / ${_review.queue.length.toLocaleString()}
            ${picked ? '' : '<span style="color:var(--text-quaternary)"> · 고르지 않고 넘어가면 나중에 다시 나옵니다</span>'}
          </span>
          <button type="button" id="rvNext"
            title="고르지 않고 다음 회사로 넘어갑니다"
            style="padding:9px 16px;border-radius:9px;border:1px solid var(--border-default);
                   background:var(--bg-surface);color:var(--text-secondary);font-size:12.5px;
                   font-weight:700;cursor:pointer">다음 ›</button>
        </div>
      </div>
    </div>`;

  els.content.querySelector('#rvExit').addEventListener('click', () => exitDirectReview());
  els.content.querySelector('#rvApprove').addEventListener('click', () => reviewDecide('send'));
  els.content.querySelector('#rvReject').addEventListener('click', () => reviewDecide('reject'));
  els.content.querySelector('#rvPrev').addEventListener('click', () => reviewGo(-1));
  els.content.querySelector('#rvNext').addEventListener('click', () => reviewGo(1));
}

/**
 * 카드 앞뒤로 넘기기. 판정은 하지 않는다.
 *
 * 묶음(30곳)의 끝에서 [다음 ›] 을 누르면 다음 묶음을 받아온다.
 * 그때 이번에 고른 것들은 서버 대기열에서 이미 빠져 있어 다시 오지 않는다.
 */
function reviewGo(delta) {
  if (_review.busy) return;
  const next = _review.idx + delta;
  if (next < 0) return;                       // 첫 회사에서 더 뒤로는 없다
  if (next >= _review.queue.length) {
    // 이 묶음에서 판정하지 않고 넘긴 수만큼 오프셋을 민다.
    // 판정한 건은 서버 대기열에서 빠져 뒤가 저절로 당겨지므로 세지 않는다.
    _review.skip = (_review.skip || 0)
      + _review.queue.filter((l) => !_review.decided.has(l.leadId)).length;
    _review.queue = [];                       // 다음 묶음을 새로 받는다
    _review.idx = 0;
  } else {
    _review.idx = next;
  }
  renderReviewPage();
}

async function reviewDecide(decision, force) {
  if (_review.busy) return;               // 연타로 두 건이 한 번에 넘어가지 않게
  const lead = _review.queue[_review.idx];
  if (!lead) return;

  // 되돌아와서 같은 버튼을 또 누른 경우 — 바뀌는 게 없으니 다음으로만 넘어간다
  const wanted = decision === 'send' ? 'queued' : decision === 'reject' ? 'failed' : 'archived';
  const already = _review.decided.get(lead.leadId);
  if (already === wanted) { reviewGo(1); return; }

  _review.busy = true;
  let r;
  try {
    // safeJsonFetch 는 4xx 에도 예외를 던지지 않고 본문을 그대로 준다.
    // 그래서 성공 여부는 예외가 아니라 r.success 로 본다.
    r = await safeJsonFetch('/api/leads/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 보고 있는 범위를 같이 보낸다 — 안 보내면 응답의 remaining 이
      // 전체 수로 와서 진행바 분모가 판정 한 번에 어긋난다.
      body: JSON.stringify({ leadId: lead.leadId, decision, force: !!force, ...reviewScopeParams() }),
    });
  } catch (e) {
    _review.busy = false;
    alert(`처리 실패: ${(e && e.message) || e}`);
    return;
  }
  _review.busy = false;

  if (!r || !r.success) {
    // 예약이 걸려 있어 서버가 멈춰 세운 경우 —
    // 무엇이 함께 취소되는지 알리고 확인을 받은 뒤 다시 보낸다
    if (r && r.needsConfirm) {
      if (confirm(`${r.error}\n\n계속할까요?`)) return reviewDecide(decision, true);
      return;
    }
    alert(`처리 실패: ${(r && r.error) || '알 수 없는 오류'}`);
    return;
  }

  _review.decided.set(lead.leadId, r.stage);   // 같은 곳을 고쳐도 한 건으로 센다
  _review.remaining = r.remaining;
  _review.queued = r.queued;
  _review.failed = r.failed;
  // 로컬 캐시도 맞춰둔다 — 다른 화면으로 갔을 때 숫자가 어긋나지 않게
  const local = baseLeads.find((l) => l.leadId === lead.leadId);
  if (local) local.stage = r.stage;
  invalidateServerPage();
  loadStageCounts(true);

  if (r.canceledSchedules) {
    alert(`예약된 메일 ${r.canceledSchedules}통을 함께 취소했습니다.`);
  }

  // 서버에 다녀오는 사이 사이드바로 나갔으면 여기서 멈춘다.
  // 판정 자체는 이미 저장됐고, 화면만 덮어 그리지 않는다.
  if (state.view !== 'tool-review') return;

  reviewGo(1);                                 // 고른 회사는 지나간다
}

// 키보드 — 검토 화면에서만 듣는다
document.addEventListener('keydown', (ev) => {
  if (state.view !== 'tool-review') return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
  if (document.querySelector('.modal-backdrop[style*="flex"], #mailDetailRoot')) return;
  if (ev.key === 'ArrowRight') { ev.preventDefault(); reviewDecide('send'); }
  else if (ev.key === 'ArrowLeft') { ev.preventDefault(); reviewDecide('reject'); }
  // 앞뒤 넘기기는 ←/→ 를 판정이 쓰고 있어 다른 키에 둔다.
  // Backspace 는 "뒤로" 라는 뜻이 이미 몸에 붙어 있다.
  // (브라우저 뒤로가기로 새지 않게 preventDefault 를 반드시 부른다)
  else if (ev.key === 'Backspace') { ev.preventDefault(); reviewGo(-1); }
  // Esc — 검토를 멈추고 들어왔던 화면으로. 팝업의 Esc 와 같은 감각이다.
  else if (ev.key === 'Escape') { ev.preventDefault(); exitDirectReview(); }
  else if (ev.key === 'Enter') {
    const a = els.content.querySelector('a[target="_blank"]');
    if (a) { ev.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
  }
});

// ── 거래가 살아 있는 회사들 (대화 진행 중 · 파트너십 확정) ──────
//
// 여기는 발굴한 후보를 거르는 자리가 아니라 **이미 사람이 붙어 있는 곳**이다.
// 그래서 표가 아니라 회사 카드로 본다 — 몇 곳 안 되고, 회사마다 상태가
// 제각각이라 한 줄로 줄여 놓으면 정작 필요한 게 안 보인다.
//
// 카드에 올리는 것은 "지금 내가 뭘 해야 하나"에 답하는 것만 둔다.
//   · 답을 기다리고 있나 (회신 필요)
//   · 마지막으로 말이 오간 게 언제인가
//   · 지금까지 몇 통 주고받았나
var _rel = { stage: 'partner', q: '', items: [], open: null, thread: null, busy: false };

async function renderRelationshipsPage(stage) {
  if (stage && stage !== _rel.stage) { _rel.stage = stage; _rel.open = null; _rel.thread = null; }

  // 회사를 하나 열어둔 상태면 그 화면을 그린다
  if (_rel.open) return renderRelationshipDetail();

  els.content.innerHTML = `<div class="inline-loader">불러오는 중…</div>`;
  let d;
  try {
    const p = new URLSearchParams({ stage: _rel.stage });
    if (_rel.q) p.set('q', _rel.q);
    d = await safeJsonFetch(`/api/leads/relationships?${p}`);
    if (!d || !d.success) throw new Error(d?.error || '불러오지 못했습니다');
  } catch (e) {
    els.content.innerHTML = `
      <div class="empty-detail" style="padding:40px 24px">
        <div style="font-size:44px;margin-bottom:8px">⚠️</div>
        <h3>불러오기 실패</h3><p>${escapeHtml(String(e.message || e))}</p>
        <button type="button" id="relRetry"
          style="margin-top:16px;padding:11px 22px;border:none;border-radius:10px;background:#2563eb;
                 color:#fff;font-size:13.5px;font-weight:800;cursor:pointer">다시 시도</button>
      </div>`;
    els.content.querySelector('#relRetry')?.addEventListener('click', () => renderRelationshipsPage());
    return;
  }
  if (state.view !== 'pipeline-partner' && state.view !== 'pipeline-negotiating') return;

  _rel.items = d.items || [];
  const s = d.summary || {};
  const isPartner = _rel.stage === 'partner';
  const tone = isPartner ? '#7c3aed' : '#0891b2';

  els.content.innerHTML = `
    <div style="max-width:1180px;margin:0 auto">
      ${relHeaderHtml(isPartner, s, tone)}
      ${_rel.items.length
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:13px">
             ${_rel.items.map((it) => relCardHtml(it, tone)).join('')}
           </div>`
        : relEmptyHtml(isPartner)}
    </div>`;

  bindRelationshipsPage();
}

function relHeaderHtml(isPartner, s, tone) {
  return `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px;
                padding:18px 22px;border-radius:15px;border:1px solid ${tone}44;
                background:linear-gradient(135deg,${tone}0f 0%,${tone}05 100%)">
      <span style="width:54px;height:54px;flex:none;border-radius:15px;display:flex;align-items:center;
                   justify-content:center;font-size:27px;background:#fff">${isPartner ? '⭐' : '🤝'}</span>
      <div style="min-width:170px">
        <div style="font-size:26px;font-weight:800;color:var(--text-primary);line-height:1.1">
          ${(s.count || 0).toLocaleString()}<span style="font-size:14px;font-weight:600;color:var(--text-tertiary);margin-left:4px">곳</span>
        </div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">
          지금까지 주고받은 메일 ${(s.totalMails || 0).toLocaleString()}통
        </div>
      </div>
      ${s.needsReply
        ? `<div style="padding:9px 15px;border-radius:10px;background:#fef3c7;border:1px solid #fcd34d">
             <div style="font-size:19px;font-weight:800;color:#b45309;line-height:1">${s.needsReply}</div>
             <div style="font-size:11.5px;font-weight:700;color:#92400e;margin-top:1px">곳이 답을 기다립니다</div>
           </div>`
        : `<div style="font-size:12.5px;color:var(--text-tertiary)">답을 기다리는 곳은 없습니다 👍</div>`}

      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="relSearch" type="search" placeholder="회사·담당자 검색" value="${escapeAttr(_rel.q)}"
          style="padding:8px 13px;font-size:13px;border:1px solid var(--border-default);border-radius:9px;
                 background:var(--bg-surface);color:var(--text-primary);min-width:180px">
        <!-- 이 앱을 쓰기 전부터 메일로 거래하던 곳은 파이프라인 어디에도 없다.
             정작 지금 가장 중요한 회사들이라 직접 넣을 수 있어야 한다. -->
        <button type="button" id="relAddBtn"
          style="padding:10px 18px;border:none;border-radius:10px;background:${tone};color:#fff;
                 font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap">+ 업체 직접 추가</button>
      </div>
    </div>`;
}

function relCardHtml(it, tone) {
  const days = it.lastTouch
    ? Math.floor((Date.now() - new Date(it.lastTouch).getTime()) / 86400000) : null;
  const touchLabel = days === null ? '연락 기록 없음'
    : days === 0 ? '오늘 주고받음'
    : days === 1 ? '어제 주고받음'
    : `${days}일 전 주고받음`;
  // 오래 말이 없으면 눈에 띄게 — 파트너는 방치가 곧 이탈이다
  const stale = days !== null && days >= 30;

  return `
    <div class="rel-card" data-lead-id="${escapeAttr(it.leadId)}"
      style="border:1px solid ${it.needsReply ? '#fcd34d' : 'var(--border-default)'};
             border-radius:14px;padding:17px 19px;cursor:pointer;background:var(--bg-surface);
             box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:11px">

      <div style="display:flex;align-items:flex-start;gap:9px">
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:800;color:var(--text-primary);line-height:1.3;
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(it.Company || '(이름 없음)')}
          </div>
          <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:3px;
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(it.Region || '지역 미상')}${it.BuyerContact ? ' · ' + escapeHtml(it.BuyerContact) : ''}
          </div>
        </div>
        ${it.needsReply
          ? `<span style="flex:none;background:#fef3c7;color:#92400e;border-radius:99px;padding:3px 10px;
               font-size:11px;font-weight:800;white-space:nowrap">⚠ 답장 ${it.needsReply}</span>`
          : ''}
        ${it.addedManually
          ? `<span title="화면에서 직접 등록한 회사입니다" style="flex:none;background:var(--bg-surface-alt);
               color:var(--text-tertiary);border-radius:99px;padding:3px 9px;font-size:10.5px;
               font-weight:700;white-space:nowrap">직접 등록</span>`
          : ''}
        <!-- 목록에서 바로 삭제 — 여러 곳을 정리할 때 하나하나 열지 않아도 되게.
             카드를 누르면 상세가 열리므로, 이 버튼은 누른 뒤 카드 클릭으로 번지지 않게 막는다(bindRelationshipsPage). -->
        <button type="button" class="rel-card-remove"
          data-lead-id="${escapeAttr(it.leadId)}" data-company="${escapeAttr(it.Company || '(이름 없음)')}"
          title="${_rel.stage === 'partner' ? '파트너십에서 삭제' : '더 이상 진행 안 함 · 목록에서 삭제'}"
          aria-label="${_rel.stage === 'partner' ? '파트너십에서 삭제' : '더 이상 진행 안 함 · 삭제'}"
          style="flex:none;padding:3px 9px;font-size:11px;font-weight:700;border-radius:99px;cursor:pointer;
                 border:1px solid #fca5a5;background:var(--bg-surface);color:#b91c1c;white-space:nowrap">✕ 삭제</button>
      </div>

      <div style="font-size:11.5px;color:var(--text-tertiary);font-family:monospace;
                  overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(it.Email || '—')}</div>

      <div style="display:flex;gap:14px;align-items:center;padding-top:10px;
                  border-top:1px solid var(--border-subtle)">
        <div>
          <div style="font-size:17px;font-weight:800;color:${tone};line-height:1">${it.total.toLocaleString()}</div>
          <div style="font-size:10.5px;color:var(--text-quaternary);margin-top:1px">주고받은 메일</div>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5">
          받음 ${it.inCount} · 보냄 ${it.outCount}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:11.5px;font-weight:700;color:${stale ? '#b45309' : 'var(--text-secondary)'}">
            ${stale ? '⏳ ' : ''}${touchLabel}
          </div>
          ${it.nearestDeadline
            ? `<div style="font-size:10.5px;color:#b45309;margin-top:2px">기한 ${new Date(it.nearestDeadline).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</div>`
            : ''}
        </div>
      </div>
    </div>`;
}

function relEmptyHtml(isPartner) {
  return `
    <div class="empty-detail" style="padding:52px 28px">
      <div style="font-size:50px;margin-bottom:10px">${isPartner ? '⭐' : '🤝'}</div>
      <h3>${isPartner ? '확정된 파트너가 아직 없습니다' : '대화 중인 곳이 아직 없습니다'}</h3>
      <p>${isPartner
        ? '거래가 확정되면 [대화 진행 중]에서 이쪽으로 옮겨집니다.'
        : '답장이 오가기 시작한 곳이 여기로 옵니다.'}</p>
      <p style="margin-top:6px;color:var(--text-tertiary);font-size:12.5px">
        이 앱을 쓰기 전부터 연락하던 거래처가 있다면 위 <b>[+ 업체 직접 추가]</b> 로 넣어주세요.<br>
        이미 받아둔 메일이 있으면 등록하면서 자동으로 붙습니다.
      </p>
    </div>`;
}

/**
 * 회사 하나를 펼친 화면 — 이 회사와 어디까지 갔나.
 *
 * 카드가 "누구와 거래 중인가" 라면 여기는 "무슨 얘기가 오갔나" 다.
 * 보낸 메일(Lead.emailHistory)과 받은 메일(InboundMail)을 시간순으로 엮어
 * 한 줄기로 보여준다 — 두 곳에 나뉘어 있어서 어느 한쪽만으로는 못 만드는 화면이다.
 */
async function renderRelationshipDetail() {
  const leadId = _rel.open;
  if (!leadId) return renderRelationshipsPage();

  const card = _rel.items.find((x) => x.leadId === leadId) || {};
  const tone = _rel.stage === 'partner' ? '#7c3aed' : '#0891b2';

  if (!_rel.thread || _rel.thread.lead?.leadId !== leadId) {
    els.content.innerHTML = `<div class="inline-loader">대화를 불러오는 중…</div>`;
    try {
      const d = await safeJsonFetch(`/api/mail/thread?leadId=${encodeURIComponent(leadId)}`);
      if (!d || !d.success) throw new Error(d?.error || '불러오지 못했습니다');
      _rel.thread = d;
    } catch (e) {
      els.content.innerHTML = `
        <div class="empty-detail" style="padding:40px 24px">
          <div style="font-size:44px;margin-bottom:8px">⚠️</div>
          <h3>대화를 불러오지 못했습니다</h3><p>${escapeHtml(String(e.message || e))}</p>
          <button type="button" id="relBackErr"
            style="margin-top:16px;padding:11px 22px;border:1px solid var(--border-default);
                   border-radius:10px;background:var(--bg-surface);color:var(--text-secondary);
                   font-size:13.5px;font-weight:700;cursor:pointer">← 목록으로</button>
        </div>`;
      els.content.querySelector('#relBackErr')?.addEventListener('click', () => {
        _rel.open = null; _rel.thread = null; renderRelationshipsPage();
      });
      return;
    }
  }
  if (state.view !== 'pipeline-partner' && state.view !== 'pipeline-negotiating') return;

  const lead = _rel.thread.lead || {};
  const timeline = _rel.thread.timeline || [];
  const company = lead.Company || card.Company || '(이름 없음)';

  els.content.innerHTML = `
    <div style="max-width:1020px;margin:0 auto">
      <button type="button" id="relBack"
        style="display:inline-flex;align-items:center;gap:6px;margin-bottom:13px;padding:8px 15px;
               border-radius:9px;border:1px solid var(--border-default);background:var(--bg-surface);
               color:var(--text-secondary);font-size:12.5px;font-weight:700;cursor:pointer">
        ← ${_rel.stage === 'partner' ? '파트너 목록으로' : '대화 진행 중 목록으로'}
      </button>

      ${relDetailHeadHtml(company, lead, card, tone)}
      ${relDetailFactsHtml(lead, card)}

      <div style="font-size:12px;font-weight:800;color:var(--text-tertiary);letter-spacing:.04em;
                  margin:22px 2px 10px">💬 주고받은 대화 · ${timeline.length}건</div>
      ${timeline.length
        ? relTimelineHtml(timeline)
        : `<div style="padding:36px 24px;text-align:center;background:var(--bg-surface);
                       border:1px dashed var(--border-default);border-radius:12px;
                       color:var(--text-tertiary);font-size:13px">
             아직 주고받은 메일이 없습니다.<br>
             <span style="font-size:12px;color:var(--text-quaternary)">
               이 회사 주소로 메일이 오면 자동으로 여기에 쌓입니다.</span>
           </div>`}
    </div>`;

  els.content.querySelector('#relBack')?.addEventListener('click', () => {
    _rel.open = null; _rel.thread = null; renderRelationshipsPage();
  });
  els.content.querySelectorAll('.rel-stage-move').forEach((b) => {
    b.addEventListener('click', () => moveRelationshipStage(leadId, b.dataset.to, company));
  });
  els.content.querySelector('.rel-remove')?.addEventListener('click', () => removeRelationshipLead(leadId, company));

  // 이전 대화 펼치기 — 한 번 펼치면 다시 접지 않는다.
  // 읽는 중에 접히면 보던 자리를 잃는다.
  els.content.querySelector('#relMoreBtn')?.addEventListener('click', (e) => {
    const box = document.getElementById('relMoreBox');
    // 인라인 display:flex 는 hidden 을 덮어써서 처음부터 다 펼쳐져 있었다 → 펼칠 때만 flex 를 준다
    if (box) { box.removeAttribute('hidden'); box.style.display = 'flex'; }
    e.currentTarget.remove();
  });
  els.content.querySelectorAll('.rel-quote').forEach((b) => {
    b.addEventListener('click', () => {
      const box = document.getElementById(b.dataset.target);
      if (!box) return;
      const showing = box.hasAttribute('hidden');
      if (showing) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
      b.textContent = showing ? '▲ 인용문 접기' : '▼ 인용된 이전 대화 보기';
    });
  });
}

function relDetailHeadHtml(company, lead, card, tone) {
  const site = lead.WebsiteContact || card.WebsiteContact || '';
  return `
    <div style="padding:24px 27px;border-radius:17px;border:1px solid ${tone}44;
                background:linear-gradient(135deg,${tone}0f 0%,${tone}05 100%)">
      <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <h2 style="margin:0;font-size:28px;font-weight:800;color:var(--text-primary);line-height:1.2">
            ${escapeHtml(company)}
          </h2>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:5px">
            ${escapeHtml(lead.Region || card.Region || '지역 미상')}
            ${(lead.BuyerContact || card.BuyerContact) ? ' · ' + escapeHtml(lead.BuyerContact || card.BuyerContact) : ''}
            ${card.Title ? ' (' + escapeHtml(card.Title) + ')' : ''}
          </div>
          ${site ? `<a href="${escapeAttr(urlFor(site))}" target="_blank" rel="noreferrer"
               style="font-size:12.5px;color:#2563eb;text-decoration:none;word-break:break-all">${escapeHtml(site)} ↗</a>` : ''}
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap">
          <div><div style="font-size:24px;font-weight:800;color:${tone};line-height:1">${(card.total ?? 0).toLocaleString()}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:1px">주고받은 메일</div></div>
          <div><div style="font-size:24px;font-weight:800;color:var(--text-primary);line-height:1">${(card.inCount ?? 0).toLocaleString()}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:1px">받은 메일</div></div>
          ${card.needsReply
            ? `<div><div style="font-size:24px;font-weight:800;color:#b45309;line-height:1">${card.needsReply}</div>
                 <div style="font-size:11px;color:#92400e;margin-top:1px">답장 필요</div></div>` : ''}
        </div>
      </div>

      <!-- 아래 줄은 두 칸으로 나눈다 — **단계 옮기기**(앞으로 나아감) 와 **삭제**(여기서 끝냄) 는 성격이 다르다.
           한 줄에 섞어 두니 삭제가 단계 이동의 하나처럼 보여 "대화 진행 중엔 삭제가 없다" 로 읽혔다 (대표님 지적 2026-09-15). -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:stretch;margin-top:17px;padding-top:15px;
                  border-top:1px solid ${tone}33">
        <!-- 파트너십 확정 → [대화 진행 중으로] 되돌리기는 뺐다 (대표님 요청 2026-09-14).
             확정된 파트너를 다시 협의 단계로 내리는 일은 실제로 없어, 파트너 화면에는 단계 옮기기 칸 자체가 없다.
             [📦 보관함으로] 도 뺐다 — 사이드바에 보관함 메뉴가 없어 옮기고 나면 다시 볼 방법이 없다. -->
        ${_rel.stage !== 'partner' ? `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:11.5px;color:var(--text-tertiary);font-weight:700">단계 옮기기</span>
          <button type="button" class="rel-stage-move" data-to="partner"
            style="padding:7px 14px;font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;
                   border:1px solid #7c3aed;background:#7c3aed;color:#fff">⭐ 파트너십 확정으로</button>
        </div>` : ''}

        <!-- 여기서 끝내기 — 얘기가 끝났거나 잘못 들어온 곳을 목록에서 뺀다.
             답장을 한 번 보내면 자동으로 [대화 진행 중]에 들어오므로(lib/mail/stage-on-reply.ts) 정리 수단이 꼭 있어야 한다. -->
        <div style="margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;
                    padding:8px 12px;border-radius:10px;border:1px solid #fecaca;background:#fef2f2">
          <span style="font-size:12px;color:#991b1b;line-height:1.5">
            ${_rel.stage === 'partner' ? '관계가 끝났거나 잘못 넣은 곳인가요?' : '더 이상 대화를 이어가지 않나요?'}
          </span>
          <button type="button" class="rel-remove"
            title="${_rel.stage === 'partner' ? '파트너' : '대화 진행 중'} 목록에서 뺍니다. DB 에서 지우지 않아 필요하면 되살릴 수 있고, 주고받은 메일은 받은 메일함에 그대로 남습니다"
            style="padding:7px 14px;font-size:12.5px;font-weight:800;border-radius:8px;cursor:pointer;
                   border:1px solid #dc2626;background:#dc2626;color:#fff">${_rel.stage === 'partner' ? '🗑 파트너십에서 삭제' : '✕ 더 이상 진행 안 함 · 삭제'}</button>
        </div>
      </div>
    </div>`;
}

function relDetailFactsHtml(lead, card) {
  const row = (label, value) => value
    ? `<div style="display:flex;gap:14px;padding:9px 0;border-bottom:1px solid var(--border-subtle)">
         <span style="width:86px;flex:none;font-size:12px;color:var(--text-tertiary);font-weight:700">${label}</span>
         <span style="font-size:13.5px;color:var(--text-primary);word-break:break-word">${value}</span>
       </div>` : '';
  const fmt = (d) => d ? new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const body = [
    row('이메일', escapeHtml(lead.Email || card.Email || '')),
    row('전화', escapeHtml(lead.Phone || card.Phone || '')),
    row('업종', escapeHtml(card.Type || '')),
    row('취급', escapeHtml(String(card.BrandsChannels || '').slice(0, 300))),
    row('첫 연락', escapeHtml(fmt(card.firstTouch))),
    row('마지막 연락', escapeHtml(fmt(card.lastTouch))),
    row('메모', escapeHtml(String(card.notes || '').slice(0, 500))),
  ].join('');

  if (!body) return '';
  return `
    <div style="margin-top:14px;padding:18px 22px;background:var(--bg-surface);
                border:1px solid var(--border-default);border-radius:14px">
      <div style="font-size:11.5px;font-weight:800;color:var(--text-tertiary);
                  letter-spacing:.04em;margin-bottom:6px">회사 정보</div>
      ${body}
    </div>`;
}

/**
 * 대화 타임라인 — 최근 것만 펼치고 나머지는 접는다.
 *
 * 왜 전부 펼치지 않는가:
 * 파트너 한 곳에 메일이 30통씩 쌓여 있다. 그걸 다 늘어놓으면 화면이 수십 번
 * 스크롤이 되고, 정작 알고 싶은 "지금 어디까지 왔나" 는 맨 위 한 통에 있다.
 * 지난 대화는 필요할 때만 펼치면 된다.
 *
 * 위에 요약 줄을 둔다 — 처음 연락한 날, 오간 통수, 지금 누구 차례인가.
 * 대화를 읽지 않고도 상태를 알 수 있어야 한다.
 */
var REL_RECENT_N = 3;

function relTimelineHtml(timeline) {
  const newest = timeline.slice().reverse();      // 최근 것이 위로
  const head = newest.slice(0, REL_RECENT_N);
  const rest = newest.slice(REL_RECENT_N);

  // 마지막이 상대 메일이면 우리가 답할 차례다
  const last = newest[0];
  const ourTurn = last && last.direction === 'in';
  const firstAt = timeline[0]?.at;
  const days = firstAt
    ? Math.max(0, Math.floor((Date.now() - new Date(firstAt).getTime()) / 86400000)) : null;
  const inN = timeline.filter((t) => t.direction === 'in').length;
  const outN = timeline.length - inN;

  return `
    <!-- 한눈 요약 — 대화를 읽지 않고도 상태를 알 수 있게 -->
    <div style="padding:13px 17px;border-radius:11px;margin-bottom:11px;
                background:${ourTurn ? '#fffbeb' : 'var(--bg-surface-alt)'};
                border:1px solid ${ourTurn ? '#fcd34d' : 'var(--border-default)'};
                display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="font-size:17px">${ourTurn ? '⚠' : '✓'}</span>
      <div style="flex:1;min-width:220px;font-size:12.5px;line-height:1.7;
                  color:${ourTurn ? '#78350f' : 'var(--text-secondary)'}">
        <b>${ourTurn ? '우리가 답할 차례입니다' : '상대 답을 기다리는 중입니다'}</b>
        <span style="opacity:.85">
          · 마지막 ${last?.at ? new Date(last.at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '—'}
          ${days !== null ? ` · ${days}일째 이어진 대화` : ''}
          · 받음 ${inN} / 보냄 ${outN}
        </span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px">
      ${head.map(relTimelineItemHtml).join('')}
    </div>

    ${rest.length ? `
      <button type="button" id="relMoreBtn"
        style="width:100%;margin-top:10px;padding:11px;border-radius:10px;cursor:pointer;
               border:1px dashed var(--border-strong);background:var(--bg-surface);
               color:var(--text-secondary);font-size:12.5px;font-weight:700">
        ▼ 이전 대화 ${rest.length}통 더 보기
      </button>
      <div id="relMoreBox" hidden style="flex-direction:column;gap:10px;margin-top:10px">
        ${rest.map((t, i) => relTimelineItemHtml(t, i + REL_RECENT_N)).join('')}
      </div>` : ''}`;
}

function relTimelineItemHtml(t, i) {
  const out = t.direction === 'out';
  const when = t.at
    ? new Date(t.at).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  const who = out
    ? `우리 → ${escapeHtml(t.to || '')}`
    : `${escapeHtml(t.from?.name || t.from?.address || '상대')} → 우리`;
  const qid = `rel-q-${i}`;

  return `
    <div style="border:1px solid ${out ? 'var(--border-default)' : '#bfdbfe'};border-left:4px solid ${out ? 'var(--border-strong)' : '#2563eb'};
                border-radius:12px;padding:15px 18px;background:${out ? 'var(--bg-surface-alt)' : 'var(--bg-surface)'}">
      <div style="display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;margin-bottom:7px">
        <span style="font-size:11px;font-weight:800;padding:2px 9px;border-radius:99px;
                     background:${out ? 'var(--bg-surface)' : '#eff6ff'};color:${out ? 'var(--text-tertiary)' : '#1d4ed8'}">
          ${out ? '↗ 보냄' : '↘ 받음'}</span>
        <span style="font-size:13.5px;font-weight:700;color:var(--text-primary);flex:1;min-width:0;
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.subject || '(제목 없음)')}</span>
        <span style="font-size:11.5px;color:var(--text-quaternary);white-space:nowrap">${escapeHtml(when)}</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:8px">${who}
        ${t.needsReply ? '<span style="color:#b45309;font-weight:700"> · ⚠ 답장 필요</span>' : ''}
        ${t.deadline ? ` · 기한 ${escapeHtml(new Date(t.deadline).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }))}` : ''}
      </div>

      ${t.summary ? `
        <div style="padding:10px 13px;background:#eef2ff;border-radius:9px;margin-bottom:9px">
          <div style="font-size:10.5px;font-weight:800;color:#4338ca;margin-bottom:4px">요지</div>
          <div style="font-size:12.5px;color:#3730a3;line-height:1.7">${escapeHtml(t.summary)}</div>
        </div>` : ''}

      <!-- 한국어본이 있으면 그것을 먼저 보여준다. 쓰는 사람이 전부 한국인이다. -->
      <!-- 우리가 보낸 메일은 HTML 이다. 그대로 escape 하면 태그가 글자로 보인다. -->
      <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.8;
                  ${t.translation || !looksLikeHtml(t.body) ? 'white-space:pre-wrap;' : ''}
                  word-break:break-word;max-height:280px;overflow:auto">${
        t.translation ? escapeHtml(String(t.translation).slice(0, 2000)) : renderMailBodyHtml(t.body)
      }</div>
      ${t.translation ? `<div style="font-size:10.5px;color:var(--text-quaternary);margin-top:6px">🌐 한글 번역본입니다</div>` : ''}

      ${t.hasQuoted && t.bodyFull ? `
        <div style="margin-top:9px;display:flex;align-items:baseline;gap:7px;flex-wrap:wrap">
          <button type="button" class="rel-quote" data-target="${qid}"
            style="background:none;border:none;color:var(--text-tertiary);font-size:11.5px;
                   cursor:pointer;padding:0;text-decoration:underline">▼ 인용된 이전 대화 보기</button>
          <span style="font-size:10.5px;color:var(--text-quaternary)">— 답장에 딸려온 지난번 내용입니다</span>
        </div>
        <pre id="${qid}" hidden style="margin:8px 0 0;padding:11px;background:var(--bg-surface-alt);
             border:1px solid var(--border-subtle);border-radius:8px;font-size:11.5px;
             color:var(--text-tertiary);white-space:pre-wrap;word-break:break-word;
             max-height:240px;overflow:auto">${escapeHtml(t.bodyFull)}</pre>` : ''}
    </div>`;
}

/** 단계 옮기기 — 확정되거나 물러날 때 */
/**
 * [파트너십 확정]·[대화 진행 중] 목록에서 업체를 삭제 처리한다 (/api/leads/[id]/remove — DB 에서 지우지 않는 삭제).
 * 주고받은 메일은 받은 메일함에 그대로 남고, 걸려 있던 예약 발송은 함께 취소된다.
 * 삭제한 업체는 새 답장이 와도 다시 매칭되지 않는다 (lib/mail/match-lead.ts 가 deleted 를 뺀다).
 */
async function removeRelationshipLead(leadId, company) {
  const listName = _rel.stage === 'partner' ? '파트너십 확정' : '대화 진행 중';
  if (!confirm(`[${company}] 을(를) ${listName} 목록에서 삭제합니다.\n\n` +
    '· 주고받은 메일은 받은 메일함에 그대로 남습니다\n' +
    '· 걸려 있던 예약 발송이 있으면 함께 취소됩니다\n' +
    '· 이 업체에서 새 답장이 와도 목록에 다시 올라오지 않습니다\n' +
    '· DB 에서 지우지는 않아, 잘못 지웠으면 되살릴 수 있습니다\n\n진행할까요?')) return;

  const lead = (_rel.items || []).find((x) => x.leadId === leadId);
  const id = lead && lead._id;
  if (!id) { alert('이 업체의 내부 번호를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
  try {
    const r = await safeJsonFetch(`/api/leads/${encodeURIComponent(id)}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: `${listName}에서 삭제` }),
    });
    if (!r?.success) throw new Error(r?.error || '삭제 실패');
    _rel.items = (_rel.items || []).filter((x) => x.leadId !== leadId);
    _rel.open = null;
    _rel.thread = null;
    invalidateServerPage();
    loadStageCounts(true);
    renderRelationshipsPage();
  } catch (e) {
    alert(`삭제하지 못했습니다: ${(e && e.message) || e}`);
  }
}

async function moveRelationshipStage(leadId, to, company) {
  const label = { negotiating: '대화 진행 중', partner: '파트너십 확정', archived: '보관함' }[to] || to;
  if (!confirm(`[${company}] 을(를) [${label}] 로 옮깁니다.\n\n대화 이력은 그대로 남습니다. 진행할까요?`)) return;

  const lead = (_rel.items || []).find((x) => x.leadId === leadId);
  // stage API 는 Mongo _id 로 찾는다(findById). leadId 를 넘기면 404 다.
  const id = lead && lead._id;
  if (!id) { alert('이 업체의 내부 번호를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
  try {
    const r = await safeJsonFetch(`/api/leads/${encodeURIComponent(id)}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: to }),
    });
    if (!r?.success) throw new Error(r?.error || '이동 실패');
    if (lead) lead.stage = to;
    _rel.open = null;
    _rel.thread = null;
    invalidateServerPage();
    loadStageCounts(true);
    renderRelationshipsPage();
  } catch (e) {
    alert(`옮기지 못했습니다: ${(e && e.message) || e}`);
  }
}

function bindRelationshipsPage() {
  // 카드 안의 [✕ 삭제] — 누르면 상세가 열리지 않고 삭제만 묻는다.
  // 카드 클릭보다 먼저 받아 전파를 끊는다 (버튼이 카드 안에 있어 그대로 두면 상세 화면이 열린다).
  els.content.querySelectorAll('.rel-card-remove').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRelationshipLead(b.dataset.leadId, b.dataset.company);
    });
  });
  els.content.querySelectorAll('.rel-card').forEach((el) => {
    el.addEventListener('click', () => {
      _rel.open = el.dataset.leadId;
      _rel.thread = null;
      renderRelationshipDetail();
    });
  });
  els.content.querySelector('#relAddBtn')?.addEventListener('click', () => openRelationshipAddModal(_rel.stage));

  const box = els.content.querySelector('#relSearch');
  let t;
  box?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { _rel.q = box.value.trim(); renderRelationshipsPage(); }, 350);
  });
}

/**
 * 이미 연락이 닿아 있던 회사를 직접 등록하는 창.
 *
 * 이 앱을 쓰기 전부터 메일로 거래하던 곳은 파이프라인 어디에도 없다.
 * 검증도 발송도 거치지 않았으니 당연한데, 정작 지금 가장 중요한 회사들이다.
 *
 * 회사명과 메일 주소만 받는다. 나머지는 비워도 되고, 등록하고 나면
 * 그 주소로 이미 받아둔 메일이 자동으로 붙어 대화 이력이 바로 보인다.
 */
function openRelationshipAddModal(stage) {
  document.getElementById('relAddRoot')?.remove();
  const label = stage === 'partner' ? '파트너십 확정' : '대화 진행 중';
  const tone = stage === 'partner' ? '#7c3aed' : '#0891b2';

  const field = (id, label, ph, required) => `
    <label style="display:block;margin-bottom:11px">
      <span style="display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">
        ${label}${required ? ' <span style="color:#dc2626">*</span>' : ''}
      </span>
      <input id="${id}" type="text" placeholder="${escapeAttr(ph)}"
        style="width:100%;box-sizing:border-box;padding:9px 12px;font-size:13.5px;border-radius:9px;
               border:1px solid var(--border-default);background:var(--bg-surface);color:var(--text-primary)">
    </label>`;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="relAddRoot" style="position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,.5);
         display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="background:var(--bg-surface);border-radius:16px;max-width:560px;width:100%;
                  max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="padding:19px 24px;border-bottom:1px solid var(--border-default);display:flex;
                    align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-size:16.5px;font-weight:800;color:var(--text-primary)">업체 직접 추가</div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">
              [${label}] 로 바로 등록됩니다
            </div>
          </div>
          <button id="relAddClose" type="button"
            style="border:none;background:none;font-size:22px;line-height:1;cursor:pointer;
                   color:var(--text-tertiary);padding:2px 6px">×</button>
        </div>

        <div style="padding:18px 24px;overflow-y:auto">
          <div style="padding:11px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;
                      font-size:12px;color:#1e40af;line-height:1.65;margin-bottom:15px">
            이미 메일을 주고받던 거래처를 넣는 자리입니다.
            <b>등록하면 그 주소로 받아둔 메일이 자동으로 붙어</b> 대화 이력이 바로 보입니다.
            <span style="color:#1d4ed8">여기 넣은 곳에는 콜드메일이 나가지 않습니다.</span>
          </div>

          ${field('relAddCompany', '회사명', '예: Dangaard Group', true)}
          ${field('relAddEmail', '메일 주소', '예: lcl@dangaard.com', true)}
          ${field('relAddRegion', '지역', '예: Denmark')}
          ${field('relAddContact', '담당자', '예: Lars Christensen')}
          ${field('relAddTitle', '직함', '예: Purchasing Manager')}
          ${field('relAddPhone', '전화', '')}
          ${field('relAddSite', '웹사이트', 'https://…')}
          <label style="display:block">
            <span style="display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">메모</span>
            <textarea id="relAddNotes" rows="3" placeholder="어떤 경위로 연결된 곳인지 적어두면 나중에 도움이 됩니다"
              style="width:100%;box-sizing:border-box;padding:9px 12px;font-size:13px;border-radius:9px;
                     border:1px solid var(--border-default);background:var(--bg-surface);
                     color:var(--text-primary);resize:vertical;line-height:1.6"></textarea>
          </label>
          <div id="relAddMsg" style="font-size:12.5px;margin-top:11px;line-height:1.6"></div>
        </div>

        <div style="padding:14px 24px;border-top:1px solid var(--border-default);display:flex;
                    justify-content:flex-end;gap:8px">
          <button id="relAddCancel" type="button"
            style="padding:10px 18px;border:1px solid var(--border-default);border-radius:9px;
                   background:var(--bg-surface);color:var(--text-secondary);font-size:13px;
                   font-weight:700;cursor:pointer">취소</button>
          <button id="relAddSave" type="button"
            style="padding:10px 22px;border:none;border-radius:9px;background:${tone};color:#fff;
                   font-size:13px;font-weight:800;cursor:pointer">등록</button>
        </div>
      </div>
    </div>`);

  const root = document.getElementById('relAddRoot');
  const close = () => { root?.remove(); syncBodyScrollLock?.(); };
  document.getElementById('relAddClose')?.addEventListener('click', close);
  document.getElementById('relAddCancel')?.addEventListener('click', close);
  bindBackdropDismiss(root, close);   // 쓰던 내용이 있으면 확인을 묻는다
  document.getElementById('relAddCompany')?.focus();

  document.getElementById('relAddSave')?.addEventListener('click', async () => {
    const msg = document.getElementById('relAddMsg');
    const btn = document.getElementById('relAddSave');
    const val = (id) => (document.getElementById(id)?.value || '').trim();

    const payload = {
      stage,
      Company: val('relAddCompany'),
      Email: val('relAddEmail'),
      Region: val('relAddRegion'),
      BuyerContact: val('relAddContact'),
      Title: val('relAddTitle'),
      Phone: val('relAddPhone'),
      WebsiteContact: val('relAddSite'),
      notes: val('relAddNotes'),
    };
    if (!payload.Company) { msg.innerHTML = '<span style="color:#b91c1c">회사명을 적어주세요.</span>'; return; }
    if (!payload.Email) { msg.innerHTML = '<span style="color:#b91c1c">메일 주소를 적어주세요.</span>'; return; }

    btn.disabled = true;
    btn.textContent = '등록 중…';
    msg.innerHTML = '';
    try {
      const r = await safeJsonFetch('/api/leads/relationships/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r || !r.success) {
        // 같은 주소가 이미 있으면 새로 만들지 않는다 — 대화 이력이 갈라지기 때문
        msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(r?.error || '등록 실패')}</span>`;
        btn.disabled = false; btn.textContent = '등록';
        return;
      }
      close();
      alert(
        `[${r.Company}] 을(를) ${label} 에 등록했습니다.` +
        (r.linkedMails ? `\n\n이미 받아둔 메일 ${r.linkedMails}통이 이 회사에 연결됐습니다.` : ''),
      );
      _rel.open = null; _rel.thread = null;
      invalidateServerPage();
      loadStageCounts(true);
      renderRelationshipsPage();
    } catch (e) {
      msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(String((e && e.message) || e))}</span>`;
      btn.disabled = false; btn.textContent = '등록';
    }
  });

  syncBodyScrollLock?.();
}

// ── 검토 결과 ─────────────────────────────────────────────────
//
// 2차 검토로 수백 곳을 훑고 나면 "내가 뭘 골랐더라" 를 볼 곳이 없다.
// 잘못 누른 것도 그때는 모르고 지나간다.
//
// 날짜로 묶는 이유:
// 이 데이터에는 사람이 고른 것과 정리 스크립트가 옮긴 것이 섞여 있다.
// 필드만으로는 안 갈린다 — 9/8 에 한꺼번에 들어간 1,647곳에도 사유가 없다.
// 날짜로 묶으면 "오늘 내가 한 것" 이 맨 위에 그대로 올라온다.
// ═══ 업체 정보 요청 ═══════════════════════════════════════════
//
// "이 업체들에 대해 이런 것까지 알고 싶다" 를 화면에서 직접 받는다.
//
// 왜 이 화면인가:
// 목록에는 회사명·지역·이메일·홈페이지와 AI 가 왜 골랐는지가 들어 있다.
// 그런데 실제로 영업하는 사람이 보고 싶은 것은 따로 있다 — 누구 앞으로
// 보내야 하는지, 이미 한국 화장품을 수입하는지 같은 것들이다.
// 그건 업체를 보고 있는 순간에만 떠오르므로, 업체 목록 바로 위에서 받는다.
//
// 평소에는 한 줄로 접어 둔다. 펼친 채로 두면 정작 오늘 할 일인
// [2차 검토] 카드가 아래로 밀려난다.
var _infoReq = { items: [], open: false, busy: false, loaded: false };

/** 무엇을 적으면 되는지 보여주는 보기 — 눌러서 넣는다 */
const INFO_REQ_EXAMPLES = [
  '담당자 이름·직책',
  '이미 수입 중인 K-뷰티 브랜드',
  '회사 규모 (직원 수·매출)',
  '매장 수 · 온라인몰 주소',
  '최소 주문 수량(MOQ)',
  '전시회 참가 이력',
  '인스타·SNS 규모',
  '대표 전화번호',
];

function infoReqCardHtml() {
  const open = _infoReq.open;
  const list = _infoReq.items || [];
  const openCnt = list.filter((r) => r.status !== 'done').length;

  const head = `
    <button type="button" id="infoReqToggle"
      style="display:flex;align-items:center;gap:11px;width:100%;text-align:left;cursor:pointer;
             padding:12px 16px;border:1px dashed var(--border-default);border-radius:12px;
             background:var(--bg-surface);color:inherit;font:inherit">
      <span style="font-size:17px">📋</span>
      <span style="flex:1;min-width:0">
        <span style="font-size:13px;font-weight:700;color:var(--text-primary)">
          이 업체들, 어떤 정보가 더 필요하세요?
        </span>
        <span style="display:block;font-size:11.5px;color:var(--text-tertiary);margin-top:2px">
          적어 주시면 업체별로 찾아서 채워 드립니다${openCnt ? ` · <b style="color:#b45309">처리 대기 ${openCnt}건</b>` : ''}
        </span>
      </span>
      <span style="font-size:12px;color:var(--text-tertiary);white-space:nowrap">
        ${open ? '접기 ▴' : '적기 ▾'}
      </span>
    </button>`;

  if (!open) return `<div style="margin-top:12px">${head}</div>`;

  const chips = INFO_REQ_EXAMPLES.map((t) => `
    <button type="button" class="info-req-chip" data-text="${escapeAttr(t)}"
      style="font-size:11.5px;padding:5px 11px;border-radius:99px;cursor:pointer;
             border:1px solid var(--border-default);background:var(--bg-surface-alt);
             color:var(--text-secondary)">+ ${escapeHtml(t)}</button>`).join('');

  const rows = list.length ? list.map((r) => {
    const done = r.status === 'done';
    const when = String(r.createdAt || '').slice(0, 10).replace(/-/g, '.');
    return `
      <div style="display:flex;gap:10px;padding:10px 12px;border-radius:9px;
                  background:${done ? 'transparent' : 'var(--bg-surface-alt)'};
                  border:1px solid var(--border-subtle);margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;line-height:1.65;white-space:pre-wrap;
                      color:${done ? 'var(--text-quaternary)' : 'var(--text-primary)'};
                      ${done ? 'text-decoration:line-through' : ''}">${escapeHtml(r.body || '')}</div>
          <div style="font-size:10.5px;color:var(--text-quaternary);margin-top:5px">
            ${when}${r.createdBy ? ' · ' + escapeHtml(r.createdBy) : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button type="button" class="info-req-done" data-id="${escapeAttr(r._id)}"
            data-next="${done ? 'open' : 'done'}"
            style="font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer;
                   border:1px solid var(--border-default);background:var(--bg-surface);
                   color:var(--text-secondary);white-space:nowrap">
            ${done ? '↩ 되돌리기' : '✓ 처리함'}
          </button>
          <button type="button" class="info-req-del" data-id="${escapeAttr(r._id)}"
            style="font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer;
                   border:1px solid var(--border-subtle);background:transparent;
                   color:var(--text-quaternary);white-space:nowrap">삭제</button>
        </div>
      </div>`;
  }).join('') : `<div style="font-size:12px;color:var(--text-quaternary);padding:6px 2px">
      아직 남긴 요청이 없습니다.</div>`;

  return `
    <div style="margin-top:12px">
      ${head}
      <div style="margin-top:8px;padding:18px 20px;border-radius:12px;
                  background:var(--bg-surface);border:1px solid var(--border-default)">

        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.8">
          지금 목록에는 <b>회사명 · 지역 · 이메일 · 홈페이지</b>와
          AI 가 왜 이 회사를 골랐는지가 들어 있습니다.<br>
          영업하실 때 <b>이것만으로 부족한 것</b>을 적어 주세요. 적어 주신 항목을
          업체별로 찾아서 채워 드립니다.
          <span style="color:var(--text-quaternary)">
            한 줄이어도 괜찮습니다 — 정확한 표현보다 "무엇이 있어야 연락하기 편한가" 가 중요합니다.
          </span>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:6px;margin:13px 0 9px">${chips}</div>

        <textarea id="infoReqBody" rows="4"
          placeholder="예) 메일을 받을 담당자 이름과 직책을 알고 싶습니다. 이미 한국 화장품을 수입하고 있는지, 어떤 브랜드를 취급하는지도 함께 알면 좋겠습니다."
          style="width:100%;box-sizing:border-box;padding:11px 13px;font:inherit;font-size:12.5px;
                 line-height:1.7;border:1px solid var(--border-default);border-radius:9px;
                 background:var(--bg-surface-alt);color:var(--text-primary);resize:vertical"></textarea>

        <div style="display:flex;align-items:center;gap:10px;margin-top:9px;flex-wrap:wrap">
          <button type="button" id="infoReqSave"
            style="font-size:12.5px;font-weight:700;padding:9px 18px;border-radius:9px;cursor:pointer;
                   border:none;background:#2563eb;color:#fff"
            ${_infoReq.busy ? 'disabled' : ''}>
            ${_infoReq.busy ? '저장 중…' : '요청 남기기'}
          </button>
          <span id="infoReqMsg" style="font-size:11.5px;color:var(--text-tertiary)"></span>
        </div>

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle)">
          <div style="font-size:11px;font-weight:800;color:var(--text-tertiary);
                      letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px">
            남긴 요청 ${list.length ? `(${list.length})` : ''}
          </div>
          ${rows}
        </div>
      </div>
    </div>`;
}

/** 목록을 받아 온다. safeJsonFetch 는 4xx/5xx 에도 던지지 않으므로 success 를 직접 본다. */
async function loadInfoRequests(force) {
  if (_infoReq.loaded && !force) return;
  const d = await safeJsonFetch('/api/info-requests');
  if (!d || !d.success) { _infoReq.items = []; _infoReq.loaded = true; return; }
  _infoReq.items = d.items || [];
  _infoReq.loaded = true;
}

function bindInfoReqCard(root) {
  const scope = root || document;

  scope.querySelector('#infoReqToggle')?.addEventListener('click', async () => {
    _infoReq.open = !_infoReq.open;
    if (_infoReq.open) await loadInfoRequests(true);
    render();
  });

  // 보기 칩 — 누르면 적는 칸에 한 줄로 붙는다.
  // 넣고 나서 커서를 칸 끝으로 옮겨, 바로 이어 쓸 수 있게 한다.
  scope.querySelectorAll('.info-req-chip').forEach((b) => {
    b.addEventListener('click', () => {
      const ta = document.getElementById('infoReqBody');
      if (!ta) return;
      const t = b.getAttribute('data-text') || '';
      ta.value = (ta.value.trim() ? ta.value.replace(/\s*$/, '') + '\n' : '') + '- ' + t;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    });
  });

  scope.querySelector('#infoReqSave')?.addEventListener('click', async () => {
    const ta = document.getElementById('infoReqBody');
    const msg = document.getElementById('infoReqMsg');
    const text = (ta?.value || '').trim();
    if (!text) {
      if (msg) { msg.textContent = '내용을 적어 주세요'; msg.style.color = '#b91c1c'; }
      ta?.focus();
      return;
    }
    _infoReq.busy = true;
    if (msg) { msg.textContent = '저장 중…'; msg.style.color = 'var(--text-tertiary)'; }
    const d = await safeJsonFetch('/api/info-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, scope: 'verified' }),
    });
    _infoReq.busy = false;
    if (!d || !d.success) {
      if (msg) { msg.textContent = (d && d.error) || '저장하지 못했습니다'; msg.style.color = '#b91c1c'; }
      return;
    }
    await loadInfoRequests(true);
    render();
  });

  scope.querySelectorAll('.info-req-done').forEach((b) => {
    b.addEventListener('click', async () => {
      const d = await safeJsonFetch('/api/info-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.getAttribute('data-id'), status: b.getAttribute('data-next') }),
      });
      if (!d || !d.success) { alert((d && d.error) || '바꾸지 못했습니다'); return; }
      await loadInfoRequests(true);
      render();
    });
  });

  scope.querySelectorAll('.info-req-del').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('이 요청을 지울까요?')) return;
      const d = await safeJsonFetch('/api/info-requests?id=' + encodeURIComponent(b.getAttribute('data-id')), { method: 'DELETE' });
      if (!d || !d.success) { alert((d && d.error) || '지우지 못했습니다'); return; }
      await loadInfoRequests(true);
      render();
    });
  });
}

var _dec = { days: 0, stage: '', items: [], byDay: [], counts: {}, busy: false };

const DEC_STAGE = {
  queued:   { label: '📨 보낼 메일',   color: '#2563eb', bg: '#eff6ff', bd: '#bfdbfe' },
  failed:   { label: '🚫 검증 실패',   color: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' },
  archived: { label: '📦 보관함',      color: '#6b7280', bg: '#f3f4f6', bd: '#e5e7eb' },
};

async function renderDecisionsPage() {
  els.content.innerHTML = `<div class="inline-loader">불러오는 중…</div>`;
  let d;
  try {
    const p = new URLSearchParams({ days: String(_dec.days), limit: '200' });
    if (_dec.stage) p.set('stage', _dec.stage);
    d = await safeJsonFetch(`/api/leads/decisions?${p}`);
    if (!d || !d.success) throw new Error(d?.error || '불러오지 못했습니다');
  } catch (e) {
    els.content.innerHTML = `
      <div class="empty-detail" style="padding:40px 24px">
        <div style="font-size:44px;margin-bottom:8px">⚠️</div>
        <h3>불러오기 실패</h3><p>${escapeHtml(String(e.message || e))}</p>
        <button type="button" id="decRetry"
          style="margin-top:16px;padding:11px 22px;border:none;border-radius:10px;background:#2563eb;
                 color:#fff;font-size:13.5px;font-weight:800;cursor:pointer">다시 시도</button>
      </div>`;
    els.content.querySelector('#decRetry')?.addEventListener('click', () => renderDecisionsPage());
    return;
  }
  if (state.view !== 'tool-decisions') return;

  _dec.items = d.items || [];
  _dec.byDay = d.byDay || [];
  _dec.counts = d.counts || {};

  const tab = (key, label, n, tone) => {
    const on = _dec.stage === key;
    return `<button type="button" class="dec-tab" data-stage="${key}"
      style="padding:9px 17px;font-size:13px;font-weight:${on ? '800' : '600'};border-radius:10px;
             cursor:pointer;border:1px solid ${on ? tone : 'var(--border-default)'};
             background:${on ? tone : 'var(--bg-surface)'};color:${on ? '#fff' : 'var(--text-secondary)'}">
      ${label} <span style="opacity:.75;font-weight:600">${(n || 0).toLocaleString()}</span></button>`;
  };

  const period = (v, label) => `<button type="button" class="dec-days" data-days="${v}"
    style="padding:5px 12px;font-size:12px;font-weight:${_dec.days === v ? '800' : '600'};
           border-radius:99px;cursor:pointer;
           border:1px solid ${_dec.days === v ? 'var(--brand)' : 'var(--border-default)'};
           background:${_dec.days === v ? 'var(--brand-soft)' : 'var(--bg-surface)'};
           color:${_dec.days === v ? 'var(--brand-text)' : 'var(--text-secondary)'}">${label}</button>`;

  els.content.innerHTML = `
    <div style="max-width:1080px;margin:0 auto">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
        ${tab('', '전체', (_dec.counts.queued || 0) + (_dec.counts.failed || 0) + (_dec.counts.archived || 0), '#334155')}
        ${tab('queued', '📨 보낼 메일', _dec.counts.queued, '#2563eb')}
        ${tab('failed', '🚫 검증 실패', _dec.counts.failed, '#b91c1c')}
        ${tab('archived', '📦 보관함', _dec.counts.archived, '#6b7280')}
        <span style="margin-left:auto;display:flex;gap:5px;align-items:center">
          <span style="font-size:11px;color:var(--text-tertiary);font-weight:700">기간</span>
          ${period(7, '최근 7일')}${period(30, '최근 30일')}${period(0, '전체')}
        </span>
      </div>

      ${decByDayHtml()}

      <div style="font-size:11.5px;font-weight:800;color:var(--text-quaternary);
                  letter-spacing:.04em;margin:20px 2px 9px">
        최근 판정 ${_dec.items.length.toLocaleString()}곳
        ${d.total > _dec.items.length ? `<span style="font-weight:500">· 전체 ${d.total.toLocaleString()}곳 중</span>` : ''}
      </div>
      ${_dec.items.length ? decListHtml() : `
        <div style="padding:38px 24px;text-align:center;background:var(--bg-surface);
                    border:1px dashed var(--border-default);border-radius:12px;
                    color:var(--text-tertiary);font-size:13px">
          이 조건에 해당하는 판정이 없습니다.
        </div>`}
    </div>`;

  bindDecisionsPage();
}

/** 날짜별 묶음 — "며칠에 무엇을 골랐나" 로 읽히게 */
function decByDayHtml() {
  if (!_dec.byDay.length) return '';
  const today = new Date().toISOString().slice(0, 10);
  const bar = (n, total, color) => n
    ? `<div style="flex:${n};height:100%;background:${color}" title="${n}곳"></div>` : '';

  return `
    <div style="background:var(--bg-surface);border:1px solid var(--border-default);
                border-radius:13px;overflow:hidden">
      <div style="padding:12px 18px;border-bottom:1px solid var(--border-subtle);
                  font-size:12.5px;font-weight:800;color:var(--text-secondary)">
        날짜별 판정
        <span style="font-weight:500;color:var(--text-quaternary);margin-left:6px">
          숫자가 큰 날은 일괄 정리가 돌아간 날입니다</span>
      </div>
      ${_dec.byDay.slice(0, 14).map((b) => {
        const isToday = b.date === today;
        return `
        <div style="display:flex;align-items:center;gap:14px;padding:11px 18px;
                    border-bottom:1px solid var(--border-subtle);
                    background:${isToday ? '#eff6ff' : 'transparent'}">
          <div style="width:104px;flex:none;font-size:12.5px;font-weight:${isToday ? '800' : '600'};
                      color:${isToday ? '#1d4ed8' : 'var(--text-secondary)'}">
            ${escapeHtml(b.date)}${isToday ? ' · 오늘' : ''}
          </div>
          <div style="width:58px;flex:none;text-align:right;font-size:15px;font-weight:800;
                      color:var(--text-primary)">${b.total.toLocaleString()}</div>
          <div style="flex:1;min-width:80px;height:8px;border-radius:99px;overflow:hidden;
                      display:flex;background:var(--bg-surface-alt)">
            ${bar(b.queued, b.total, '#2563eb')}
            ${bar(b.failed, b.total, '#b91c1c')}
            ${bar(b.archived, b.total, '#9ca3af')}
          </div>
          <div style="width:210px;flex:none;text-align:right;font-size:11.5px;color:var(--text-tertiary)">
            ${b.queued ? `<span style="color:#2563eb;font-weight:700">보낼곳 ${b.queued}</span> ` : ''}
            ${b.failed ? `<span style="color:#b91c1c;font-weight:700">실패 ${b.failed}</span> ` : ''}
            ${b.archived ? `<span>보관 ${b.archived}</span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function decListHtml() {
  return `
    <div style="display:flex;flex-direction:column;gap:7px">
      ${_dec.items.map((l) => {
        const s = DEC_STAGE[l.stage] || DEC_STAGE.archived;
        const when = l.stageChangedAt
          ? new Date(l.stageChangedAt).toLocaleString('ko-KR',
              { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '';
        return `
        <div style="display:flex;align-items:center;gap:12px;padding:11px 15px;border-radius:10px;
                    background:var(--bg-surface);border:1px solid var(--border-subtle)">
          <span style="flex:none;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;
                       background:${s.bg};color:${s.color};border:1px solid ${s.bd};
                       white-space:nowrap">${s.label}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;color:var(--text-primary);
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escapeHtml(l.Company || '(이름 없음)')}
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:1px;
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escapeHtml(l.Region || '')}${l.Email ? ' · ' + escapeHtml(l.Email) : ''}
              ${l.sentCount ? ` · 메일 ${l.sentCount}회 나감` : ''}
            </div>
          </div>
          <span style="flex:none;font-size:11px;color:var(--text-quaternary);white-space:nowrap">${escapeHtml(when)}</span>
          <!-- 되돌리기 — 잘못 누른 것을 여기서 바로 고칠 수 있어야
               "내가 뭘 골랐나" 를 보는 의미가 있다. -->
          <button type="button" class="dec-undo" data-lead="${escapeAttr(l.leadId)}" data-cur="${l.stage}"
            title="이 업체를 [AI 검증 완료] 로 되돌립니다"
            style="flex:none;padding:5px 12px;font-size:11.5px;font-weight:700;border-radius:8px;
                   cursor:pointer;border:1px solid var(--border-default);
                   background:var(--bg-surface);color:var(--text-secondary);white-space:nowrap"
            ${l.sentCount ? 'disabled title="메일이 이미 나가서 되돌릴 수 없습니다" style="opacity:.4;cursor:not-allowed"' : ''}>
            ↩ 되돌리기
          </button>
        </div>`;
      }).join('')}
    </div>`;
}

function bindDecisionsPage() {
  els.content.querySelectorAll('.dec-tab').forEach((b) =>
    b.addEventListener('click', () => { _dec.stage = b.dataset.stage; renderDecisionsPage(); }));
  els.content.querySelectorAll('.dec-days').forEach((b) =>
    b.addEventListener('click', () => { _dec.days = Number(b.dataset.days); renderDecisionsPage(); }));

  els.content.querySelectorAll('.dec-undo').forEach((b) =>
    b.addEventListener('click', async () => {
      if (_dec.busy) return;
      const leadId = b.dataset.lead;
      const row = _dec.items.find((x) => x.leadId === leadId);
      if (!confirm(`[${row?.Company || leadId}] 를 [AI 검증 완료] 로 되돌립니다.\n\n진행할까요?`)) return;
      _dec.busy = true;
      b.disabled = true;
      const was = b.textContent;
      b.textContent = '⏳';
      try {
        const r = await safeJsonFetch(`/api/leads/${encodeURIComponent(row._id)}/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: 'verified' }),
        });
        if (!r?.success) throw new Error(r?.error || '되돌리기 실패');
        invalidateServerPage();
        await loadStageCounts(true);
        renderDecisionsPage();
      } catch (e) {
        alert(`되돌리지 못했습니다: ${(e && e.message) || e}`);
        b.disabled = false;
        b.textContent = was;
      } finally {
        _dec.busy = false;
      }
    }));
}

// ── 휴지통 ────────────────────────────────────────────────────
// DB 에서 지우지 않고 trashedAt 만 세팅하므로 언제든 되돌릴 수 있다.
// 광고 오분류가 자료 소실이 되면 안 되기 때문이다.
var _trashSelected = new Set();

async function renderTrashPage() {
  els.content.innerHTML = `<div class="inline-loader">휴지통 불러오는 중…</div>`;
  let data;
  try {
    data = await safeJsonFetch('/api/mail/inbox?trashed=1&flat=1&limit=100');
  } catch (e) {
    els.content.innerHTML = `<div class="empty-detail"><h3>불러오기 실패</h3><p>${escapeHtml(String(e.message || e))}</p></div>`;
    return;
  }
  if (!data?.success) {
    els.content.innerHTML = `<div class="empty-detail"><h3>조회 실패</h3><p>${escapeHtml(data?.error || '')}</p></div>`;
    return;
  }

  const items = data.items || [];
  const dt = (v) => v ? new Date(v).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '';

  if (!items.length) {
    els.content.innerHTML = `<div class="empty-detail">
      <h3>휴지통이 비어 있습니다</h3>
      <p>메일 상세에서 [🗑 휴지통] 을 누르면 여기로 옵니다. 실제로 삭제되지는 않습니다.</p></div>`;
    _trashSelected.clear();
    return;
  }

  const rows = items.map((m) => {
    const cls = MAIL_CLASS[m.classification] || MAIL_CLASS.unknown;
    const checked = _trashSelected.has(String(m._id)) ? 'checked' : '';
    // inbox-row 를 함께 붙여야 행 클릭 → 상세 모달이 열린다 (document 위임 핸들러)
    return `<tr class="trash-row inbox-row" data-mail-id="${escapeAttr(String(m._id))}" style="cursor:pointer">
      <td style="width:36px"><input type="checkbox" class="trash-check" data-mail-id="${escapeAttr(String(m._id))}" ${checked} style="width:16px;height:16px;cursor:pointer"></td>
      <td style="white-space:nowrap;color:var(--text-tertiary);font-size:12px">${dt(m.date)}</td>
      <td>
        <div style="font-size:12.5px;color:var(--text-primary)">
          ${m.group ? `<span style="background:var(--bg-surface-alt);color:var(--text-secondary);border-radius:5px;padding:1px 6px;font-size:10px;font-weight:700;margin-right:5px">📁 ${escapeHtml(m.group)}</span>` : ''}
          ${escapeHtml(String(m.subject || '(제목 없음)').slice(0, 66))}
        </div>
        <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(m.from?.address || '')}</div>
      </td>
      <td style="white-space:nowrap"><span title="${escapeAttr(cls.desc || '')}" style="background:${cls.bg};color:${cls.fg};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;cursor:help">${cls.label}</span></td>
      <td style="white-space:nowrap;color:var(--text-quaternary);font-size:11px">${dt(m.trashedAt)} 치움</td>
    </tr>`;
  }).join('');

  els.content.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <button class="button secondary" id="trashSelectAll" type="button">이 페이지 전체 선택</button>
      <button class="button" id="trashRestore" type="button" disabled>↩ 선택 복구 (<span id="trashCount">0</span>)</button>
      <span style="font-size:12px;color:var(--text-tertiary);margin-left:auto">
        총 ${data.total}통 · <b>DB 에서 지우지 않습니다</b> — 언제든 복구 가능
      </span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>받은 날</th><th>제목</th><th>분류</th><th>치운 날</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  const syncBtn = () => {
    const n = _trashSelected.size;
    els.content.querySelector('#trashCount').textContent = String(n);
    els.content.querySelector('#trashRestore').disabled = n === 0;
  };

  els.content.querySelectorAll('.trash-check').forEach((cb) => {
    cb.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = cb.dataset.mailId;
      if (cb.checked) _trashSelected.add(id); else _trashSelected.delete(id);
      syncBtn();
    });
  });

  els.content.querySelector('#trashSelectAll')?.addEventListener('click', () => {
    const all = items.every((m) => _trashSelected.has(String(m._id)));
    items.forEach((m) => { if (all) _trashSelected.delete(String(m._id)); else _trashSelected.add(String(m._id)); });
    render();
  });

  els.content.querySelector('#trashRestore')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ids = [..._trashSelected];
    if (!ids.length) return;
    btn.disabled = true;
    btn.textContent = '복구 중…';
    try {
      const r = await safeJsonFetch('/api/mail/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailIds: ids, restore: true }),
      });
      alert(`${r.moved}통을 받은 메일함으로 되돌렸습니다.`);
      _trashSelected.clear();
      loadMailCounts(true);
      render();
    } catch (err) {
      alert(`복구 실패: ${err.message || err}`);
      btn.disabled = false;
    }
  });

  syncBtn();
}

// ── 메일 상세 모달 ────────────────────────────────────────────
function closeMailDetailModal() {
  const el = document.getElementById('mailDetailRoot');
  if (!el) return;                 // 열려 있지 않으면 잠금 카운트를 건드리지 않는다
  el.remove();
  unlockBodyScroll();
}


// ── 팝업이 실수로 닫히는 것 막기 ─────────────────────────────
//
// 배경(어두운 부분)을 누르면 팝업이 닫힌다. 편하긴 한데, 메일 제목과 본문을
// 한참 쓰다가 배경을 스치면 그대로 날아간다. 되돌릴 방법이 없다.
//
// 두 가지가 겹쳐 있었다.
//
//  1) 안에서 글을 끌어 선택하다가 손을 밖에서 떼면 닫혔다.
//     click 은 누른 곳이 아니라 뗀 곳을 기준으로 오기 때문이다.
//     → 누른 곳도 배경이어야 배경 클릭으로 본다.
//
//  2) 쓰던 내용이 있어도 아무것도 묻지 않고 닫혔다.
//     → 한 글자라도 건드렸으면 물어보고 닫는다.
//
// 안 건드린 팝업(업체 목록, 설명창 같은 읽기 전용)은 예전처럼 바로 닫힌다.
// 묻는 창이 매번 뜨면 그것대로 성가시기 때문이다.

// 마우스를 처음 누른 지점. click 만으로는 1) 을 가려낼 수 없다.
var _modalPressTarget = null;
document.addEventListener('mousedown', (e) => { _modalPressTarget = e.target; }, true);

// 팝업 안에서 무언가 입력·선택하면 그 팝업에 표시를 남긴다.
// 팝업마다 따로 달지 않고 한 번만 걸어 둔다 — 나중에 팝업이 늘어도 따라온다.
var MODAL_ROOT_SELECTOR = '.modal-backdrop, [data-modal]';
['input', 'change'].forEach((evt) =>
  document.addEventListener(evt, (e) => {
    const root = e.target && e.target.closest && e.target.closest(MODAL_ROOT_SELECTOR);
    if (root) root.dataset.userTyped = '1';
  }, true));

/** 이 팝업에서 사용자가 뭔가 입력했는가 */
function modalHasTypedInput(root) {
  return !!(root && root.dataset && root.dataset.userTyped === '1');
}

/**
 * 닫아도 되는지 확인한다. 입력한 게 없으면 묻지 않고 true.
 * 취소를 누르면 false — 부르는 쪽은 닫지 말아야 한다.
 */
function confirmDiscardTyped(root) {
  if (!modalHasTypedInput(root)) return true;
  return confirm('작성 중인 내용이 있습니다.\n\n닫으면 지금 입력한 내용은 사라집니다. 닫을까요?');
}

/**
 * 배경 클릭으로 닫기를 붙인다. 팝업마다 제각각 쓰던 것을 한 곳으로 모았다.
 *   bindBackdropDismiss(root, close)
 */
function bindBackdropDismiss(root, close) {
  if (!root) return;
  root.dataset.modal = '1';
  root.addEventListener('click', (e) => {
    if (e.target !== root) return;            // 팝업 카드 안을 누른 것
    if (_modalPressTarget !== root) return;   // 안에서 끌어다 밖에서 뗀 것
    if (!confirmDiscardTyped(root)) return;
    close();
  });
}

// ── 팝업 배경 스크롤 잠금 ─────────────────────────────────────
//
// 모달 안에서 스크롤하다 끝에 닿으면 뒤 목록이 이어서 움직인다(스크롤 체이닝).
// 닫고 나면 보던 자리가 아닌 곳에 가 있어서 "어디였지"가 된다.
//
// 열고 닫는 지점이 20군데가 넘어 카운터로 세면 한 곳만 빠져도 화면이
// 영영 잠긴다. 그래서 세지 않고 **지금 열려 있는 게 있나** 를 DOM 에서
// 직접 본다 — 몇 번을 불러도 결과가 같아 어긋날 여지가 없다.
//
// 잠글 때 스크롤바가 사라지며 화면이 옆으로 튀는 것도 같이 막는다:
// 사라지는 스크롤바 폭을 재서 padding 으로 메운다.
function syncBodyScrollLock() {
  const open = Boolean(
    document.getElementById('mailDetailRoot') ||
    document.getElementById('conversationModalRoot') ||
    document.getElementById('sendLogicModalRoot') ||
    document.getElementById('outboxPeekRoot') ||
    [...document.querySelectorAll('.modal-backdrop')].some((el) => el.style.display === 'flex'),
  );
  if (open) {
    const w = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--scrollbar-w', `${Math.max(0, w)}px`);
  } else {
    document.documentElement.style.removeProperty('--scrollbar-w');
  }
  document.body.classList.toggle('modal-open', open);
}
// 이름을 그대로 두어 기존 호출부가 계속 동작하게 한다
const lockBodyScroll = syncBodyScrollLock;
const unlockBodyScroll = syncBodyScrollLock;

// ═══ 받은 메일 첨부파일 내려받기 ═══════════════════════════════
//
// 예전에는 첨부가 "📎 파일이름 · 파일이름" 글자로만 떴고 받을 방법이 없었다.
// 파일 내용은 DB 에 없고, 누를 때 서버가 메일함에서 그 파일만 받아온다
// (/api/mail/[id]/attachment).
//
// 링크(<a download>)로 바로 걸지 않고 fetch 로 받는 이유:
// 메일 서버 원본이 지워졌거나 계정 비밀번호가 바뀌면 서버가 오류 설명(JSON)을
// 돌려준다. 링크로 걸면 그 오류 글이 "파일"로 저장돼 버려, 받았는데 안 열리는
// 파일만 남는다. fetch 로 받으면 실패했을 때 무엇이 문제인지 그대로 알려줄 수 있다.

/** 1234567 → "1.2MB" */
function fmtAttachmentSize(n) {
  const b = Number(n) || 0;
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(b >= 10 * 1024 * 1024 ? 0 : 1) + 'MB';
  if (b >= 1024) return Math.round(b / 1024) + 'KB';
  return b ? b + 'B' : '';
}

/** 형식별 아이콘 — 목록에서 무슨 파일인지 먼저 보이게 */
function attachmentIcon(type, name) {
  const t = String(type || '').toLowerCase();
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (t.startsWith('image/')) return '🖼';
  if (t === 'application/pdf' || ext === 'pdf') return '📕';
  if (/sheet|excel|csv/.test(t) || ['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (/presentation|powerpoint/.test(t) || ['ppt', 'pptx', 'key'].includes(ext)) return '📙';
  if (/word/.test(t) || ['doc', 'docx', 'hwp', 'hwpx'].includes(ext)) return '📄';
  if (/zip|compressed|rar|7z/.test(t) || ['zip', 'rar', '7z'].includes(ext)) return '🗜';
  if (t.startsWith('video/')) return '🎞';
  return '📎';
}

/**
 * 첨부 목록을 누를 수 있는 단추로 그린다.
 * mailId 는 받은 메일(InboundMail)의 id 여야 한다 — 보낸 메일 기록에는 첨부 위치가 없다.
 */
function attachmentChipsHtml(mailId, attachments, opts) {
  const list = (attachments || []).filter((a) => a && !a.inline);
  if (!mailId || !list.length) return '';
  const small = opts && opts.small;
  const chips = list.map((a, i) => `
    <button type="button" class="mail-att-dl"
      data-mail="${escapeAttr(mailId)}" data-att="${escapeAttr(a._id || '')}" data-i="${i}"
      data-name="${escapeAttr(a.filename || '첨부파일')}"
      title="눌러서 내려받기 — ${escapeAttr(a.filename || '')}"
      style="display:inline-flex;align-items:center;gap:6px;max-width:100%;
             padding:${small ? '4px 9px' : '6px 11px'};font-size:${small ? '11px' : '12px'};
             border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;
             cursor:pointer;text-align:left;line-height:1.3">
      <span style="flex:none">${attachmentIcon(a.contentType, a.filename)}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${escapeHtml(a.filename || '첨부파일')}</span>
      ${a.size ? `<span style="flex:none;color:#94a3b8;font-size:${small ? '10px' : '11px'}">${fmtAttachmentSize(a.size)}</span>` : ''}
      <span class="mail-att-state" style="flex:none;color:#2563eb;font-weight:700">⬇</span>
    </button>`).join('');
  return `
    <div style="margin-top:${small ? '8px' : '14px'}">
      <div style="font-size:${small ? '10.5px' : '11px'};font-weight:700;color:#64748b;margin-bottom:6px">
        📎 첨부파일 ${list.length}개 <span style="font-weight:400;color:#94a3b8">· 누르면 내려받습니다</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
    </div>`;
}

/** 모든 화면의 첨부 단추를 한 곳에서 처리한다 (화면이 다시 그려져도 동작하도록 위임) */
function initAttachmentDownloads() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('.mail-att-dl');
    if (!btn || btn.dataset.busy === '1') return;
    e.preventDefault();
    e.stopPropagation();   // 대화 카드 등 부모의 클릭(펼치기)으로 번지지 않게

    const state = btn.querySelector('.mail-att-state');
    const name = btn.dataset.name || '첨부파일';
    const qs = btn.dataset.att ? `att=${encodeURIComponent(btn.dataset.att)}` : `i=${encodeURIComponent(btn.dataset.i || '0')}`;
    btn.dataset.busy = '1';
    if (state) state.textContent = '⏳';

    try {
      // data-url 이 있으면 그 주소로 받는다 (보낸 메일함 첨부 — /api/mail/sent/[uid]/attachment)
      const res = await fetch(btn.dataset.url || `/api/mail/${encodeURIComponent(btn.dataset.mail)}/attachment?${qs}`, {
        credentials: 'same-origin',
      });
      const ctype = res.headers.get('content-type') || '';
      if (!res.ok || ctype.includes('application/json')) {
        let msg = `내려받지 못했습니다 (${res.status})`;
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* 본문 없음 */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      if (state) state.textContent = '✓';
      setTimeout(() => { if (state) state.textContent = '⬇'; }, 2500);
    } catch (err) {
      if (state) state.textContent = '⚠';
      alert(`${name}\n\n${err.message || err}`);
      setTimeout(() => { if (state) state.textContent = '⬇'; }, 2500);
    } finally {
      btn.dataset.busy = '';
    }
  });
}

async function openMailDetailModal(mailId) {
  closeMailDetailModal();
  const root = document.createElement('div');
  root.id = 'mailDetailRoot';
  root.style.cssText = `position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:24px`;
  root.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:860px;width:100%;
    max-height:88vh;padding:40px;text-align:center;color:#64748b;font-size:14px">메일 불러오는 중…</div>`;
  document.body.appendChild(root);
  lockBodyScroll();

  let data;
  try {
    data = await safeJsonFetch(`/api/mail/${encodeURIComponent(mailId)}`);
  } catch (e) {
    root.firstElementChild.innerHTML = `<div style="color:#991b1b">${escapeHtml(String(e.message || e))}</div>`;
    return;
  }
  if (!data?.success) {
    root.firstElementChild.innerHTML = `<div style="color:#991b1b">${escapeHtml(data?.error || '조회 실패')}</div>`;
    return;
  }

  const m = data.mail;
  const lead = data.lead;
  const a = m.analysis || {};
  const cls = MAIL_CLASS[m.classification] || MAIL_CLASS.unknown;
  const dt = (v) => v ? new Date(v).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  const aiBlock = a.method === 'ai' ? `
    <div style="margin:12px 0;padding:12px 14px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px">
      <div style="font-size:10px;font-weight:800;color:#15803d;margin-bottom:6px">✅ AI 분석 완료${a.analyzedAt
        ? ` <span style="font-weight:500;color:#64748b">· ${escapeHtml(new Date(a.analyzedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }))}</span>` : ''}</div>
      ${a.topic ? `<div style="font-size:13px;font-weight:700;color:#1e1b4b">${escapeHtml(a.topic)}</div>` : ''}
      ${a.summary ? `<div style="font-size:12.5px;color:#312e81;line-height:1.6;margin-top:4px">${escapeHtml(a.summary)}</div>` : ''}
      ${(a.keyPoints || []).length ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:12px;color:#3730a3;line-height:1.7">
        ${a.keyPoints.map((k) => `<li>${escapeHtml(k)}</li>`).join('')}</ul>` : ''}
      ${a.suggestedAction ? `<div style="margin-top:8px;padding:7px 10px;background:#fff;border-radius:6px;
        font-size:12px;color:#1e1b4b;border-left:3px solid #6366f1"><b>다음 할 일</b> · ${escapeHtml(a.suggestedAction)}</div>` : ''}
      ${a.deadlineText ? `<div style="margin-top:6px;font-size:11.5px;color:#b45309">⏰ "${escapeHtml(a.deadlineText)}"</div>` : ''}
    </div>` : m.direction === 'out' ? `
    <!-- 우리가 보낸 메일 — 분석 대상이 아니다.
         분석은 "상대가 무엇을 요구했나 · 언제까지 답해야 하나" 를 가리는 일인데, 내가 쓴 메일에는 물어볼 것이 없다.
         그런데도 [아직 분석하지 않은 메일입니다] 가 떠서 "왜 이건 안 해줬지" 로 읽혔다 (대표님 지적 2026-09-16). -->
    <div style="margin:12px 0;padding:10px 14px;background:var(--bg-surface-alt);border:1px solid var(--border-subtle);
                border-radius:10px;font-size:12px;color:var(--text-tertiary);line-height:1.7">
      <b style="color:var(--text-secondary)">내가 보낸 메일입니다</b> — AI 분석은 <b>받은 메일에만</b> 합니다.
      보낸 내용은 아래에 그대로 있습니다.
    </div>` : `
    <!-- 버튼을 설명 안에 둔다.
         예전에는 설명은 본문 위에 있고 버튼은 팝업 오른쪽 맨 위 구석에 있었다.
         "위의 [🧠 AI 분석] 을 누르세요" 라고 적혀 있어도 눈이 거기까지 안 간다.
         읽은 자리에서 바로 누를 수 있어야 한다. -->
    <div style="margin:12px 0;padding:13px 15px;background:#eef2ff;border:1px solid #c7d2fe;
                border-radius:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:230px;font-size:12px;color:#3730a3;line-height:1.7">
        <b style="font-size:12.5px;color:#312e81">아직 분석하지 않은 메일입니다</b><br>
        누르면 <b>한글 번역까지 한 번에</b> 붙습니다 — 번역 · 요약 · 회신 필요 여부 · 회신 기한.
        <span style="color:#6366f1">본문만 한글로 보려면 본문 아래 [🌐 AI 번역] 이 더 저렴합니다.</span>
      </div>
      <button type="button" id="mdAnalyzeInline"
        title="이 메일 한 통만 — 한글 번역 + 요약 + 회신 필요 여부 + 기한을 한 번에. 누를 때만 비용이 발생합니다"
        style="flex:none;padding:11px 20px;font-size:13px;font-weight:800;border:none;border-radius:9px;
               background:#4338ca;color:#fff;cursor:pointer;white-space:nowrap;
               box-shadow:0 2px 8px rgba(67,56,202,.3)">🧠 AI 분석하기</button>
    </div>`;

  const transBlock = m.translation?.body ? `
    <details style="margin-top:12px">
      <summary style="cursor:pointer;font-size:12px;color:#4338ca;font-weight:600">🇰🇷 한글 번역 전문</summary>
      <div style="margin-top:8px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                  font-size:12.5px;color:#334155;line-height:1.7;white-space:pre-wrap;max-height:320px;overflow:auto">${escapeHtml(m.translation.body)}</div>
    </details>` : '';

  // 인용문이 무엇인지 한 줄 붙인다.
  // 메일에 답장하면 원래 편지가 아래에 그대로 딸려오는데, 그게 본문인 줄 알고
  // 다시 읽으면 "같은 말을 또 하네" 가 된다. 접어 두되 왜 접혀 있는지는 적는다.
  const quoteBlock = m.hasQuoted ? `
    <details style="margin-top:10px">
      <summary style="cursor:pointer;font-size:11.5px;color:#64748b">
        ▼ 인용된 이전 대화 보기
        <span style="color:#94a3b8;font-weight:400">
          — 이 메일 아래에 딸려온 <b>지난번 주고받은 내용</b>입니다. 새로 온 말이 아니라 접어 뒀습니다.
        </span>
      </summary>
      <pre style="margin-top:8px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;
                  font-size:11px;color:#64748b;white-space:pre-wrap;word-break:break-word;
                  max-height:280px;overflow:auto">${escapeHtml(m.bodyFull)}</pre>
    </details>` : '';

  const replied = m.status === 'replied';

  root.innerHTML = `
    <!-- 좌우로 나누려면 폭이 있어야 한다. 1140px 에서 반으로 자르면
         답장 칸이 570px 도 안 되어 영문 한 줄이 자꾸 접힌다. -->
    <div style="background:#fff;border-radius:14px;max-width:min(1560px,96vw);width:100%;height:90vh;
                display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px">
        <div style="min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">
            <span title="${escapeAttr(cls.desc || '')}" style="background:${cls.bg};color:${cls.fg};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;cursor:help">${cls.label}</span>
            ${m.group ? `<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">📁 ${escapeHtml(m.group)}</span>` : ''}
            ${replied
              ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">✅ 회신함${m.repliedOutside ? ' (웹메일)' : ''}</span>`
              : m.direction === 'out' ? `<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">↗ 보낸 메일</span>`
              : a.needsReply ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">⚠ 회신 필요</span>` : ''}
          </div>
          <div style="font-size:16px;font-weight:700;color:#0f172a;word-break:break-word">${escapeHtml(m.subject || '(제목 없음)')}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">
            ${escapeHtml(m.from?.name || '')} &lt;${escapeHtml(m.from?.address || '')}&gt; · ${dt(m.date)}
          </div>
          ${lead ? `<div style="font-size:11.5px;color:#166534;margin-top:4px">
            연결된 리드 · <b>${escapeHtml(lead.Company)}</b> (${escapeHtml(lead.Region || '')})
            <button type="button" class="conversation-btn" data-conv-lead="${escapeAttr(lead.leadId)}"
              style="margin-left:6px;padding:1px 8px;font-size:10px;border:1px solid #16a34a;border-radius:99px;
                     background:#16a34a;color:#fff;font-weight:700;cursor:pointer">💬 대화 전체</button>
          </div>` : ''}
        </div>
        <!-- 버튼은 한 덩어리로 묶는다.
             묶지 않으면 헤더(flex)의 자식이 되어 제목 높이만큼 세로로 늘어난다 —
             글자는 작은데 상자만 커다랗게 뜨던 원인이 이것이었다.
             align-self:flex-start 로 제목 줄 맨 위에 붙인다. -->
        <div style="display:flex;align-items:center;gap:6px;flex:none;align-self:flex-start">
          <!-- 한 통만 분석한다. 목록의 일괄 분석 버튼은 뺐지만(비용이 예측되지 않아서)
               건당 1회는 비용이 정해져 있어 남겨둔다. -->
          <!-- 분석이 끝난 메일은 버튼을 그냥 없애지 않고 '완료'로 바꿔 둔다.
               버튼이 사라지기만 하면 끝난 건지, 안 뜨는 건지 알 수가 없다. -->
          ${m.analysis?.method === 'ai' ? `<span id="mdAnalyzed"
            title="${escapeAttr('AI 분석 완료' + (m.analysis.analyzedAt ? ' · ' + new Date(m.analysis.analyzedAt).toLocaleString('ko-KR') : ''))}"
            style="display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;
                   font-size:12px;font-weight:700;border:1px solid #bbf7d0;line-height:1;
                   border-radius:8px;background:#f0fdf4;color:#15803d;white-space:nowrap;cursor:default">✅ AI 분석 완료</span>` : `<button type="button" id="mdAnalyze"
            style="display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;
                   font-size:12px;font-weight:700;border:1px solid #c7d2fe;line-height:1;
                   border-radius:8px;background:#eef2ff;color:#4338ca;cursor:pointer;white-space:nowrap"
            title="이 메일 한 통만 — 한글 번역 + 요약 + 회신 필요 여부 + 기한을 한 번에. 누를 때만 비용이 발생합니다">🧠 AI 분석</button>`}
          <button type="button" id="mdFullscreen"
            style="display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;
                   font-size:12px;font-weight:700;border:1px solid var(--border-default);line-height:1;
                   border-radius:8px;background:#fff;color:#475569;cursor:pointer;white-space:nowrap"
            title="편지를 화면 전체로 보기 (Esc 로 되돌리기)">⛶ 전체 보기</button>
          <button type="button" id="mailDetailClose" title="닫기 (Esc)"
            style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;
                   background:none;border:none;border-radius:8px;font-size:20px;color:#94a3b8;
                   cursor:pointer;line-height:1;padding:0">×</button>
        </div>
      </div>

      <!-- 왼쪽 받은 편지 · 오른쪽 답장. 편지를 보면서 그대로 답을 쓴다.
           좁은 화면(1100px 미만)에서는 CSS 가 다시 위아래로 되돌린다. -->
      <div class="mail-split">
        <div class="mail-read" style="padding:16px 20px;background:#fcfcfd">
          ${aiBlock}
          <!-- 편지 본문은 이 화면에서 가장 오래 읽는 글자다. 목록의 글자 크기에
               맞춰 13.5px 로 두었더니 영문 편지를 훑기가 눈에 부담이 됐다. -->
          <div style="font-size:15.5px;color:#1e293b;line-height:1.85;white-space:pre-wrap;word-break:break-word">${escapeHtml(m.body || '(본문 없음)')}</div>
          <!-- 이미 AI 분석으로 번역본이 있으면(transBlock) 굳이 또 부르지 않는다 -->
          ${m.translation?.body ? '' : translateBtnHtml(m.body || '')}
          ${quoteBlock}
          ${transBlock}
          ${attachmentChipsHtml(m.id, m.attachments)}
        </div>
        <div class="mail-reply">
          ${m.direction === 'out' ? sentMailPanelHtml(m) : replyBoxHtml({ _id: m.id, subject: m.subject, from: m.from })}
        </div>
      </div>

      <div style="border-top:1px solid #e2e8f0;padding:12px 20px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${!replied && m.direction !== 'out' ? `<button type="button" id="mdMarkReplied" data-mail-id="${escapeAttr(m.id)}"
          style="padding:7px 14px;font-size:12.5px;font-weight:700;border:none;border-radius:8px;
                 background:#16a34a;color:#fff;cursor:pointer">✅ 회신 완료로 표시</button>` : ''}
        ${lead ? `<button type="button" class="conversation-btn" data-conv-lead="${escapeAttr(lead.leadId)}"
          style="padding:7px 14px;font-size:12.5px;font-weight:700;border:1px solid #2563eb;border-radius:8px;
                 background:#eff6ff;color:#1e40af;cursor:pointer">↩ 여기서 답장</button>` : ''}
        <button type="button" id="mdTrash" data-mail-id="${escapeAttr(m.id)}"
          style="padding:7px 14px;font-size:12.5px;border:1px solid ${m.trashedAt ? '#16a34a' : '#cbd5e1'};border-radius:8px;
                 background:#fff;color:${m.trashedAt ? '#166534' : '#64748b'};cursor:pointer">${m.trashedAt ? '↩ 받은함으로 되돌리기' : '🗑 휴지통'}</button>
        <span id="mdMsg" style="font-size:12px;margin-left:auto"></span>
      </div>
    </div>`;

  root.querySelector('#mailDetailClose')?.addEventListener('click', closeMailDetailModal);

  // 전체 보기 — 긴 편지는 팝업 안에서 좁게 읽기 힘들다
  const fsBtn = root.querySelector('#mdFullscreen');
  fsBtn?.addEventListener('click', () => {
    const on = root.classList.toggle('mail-full');
    fsBtn.textContent = on ? '⤡ 창으로' : '⛶ 전체 보기';
  });
  // Esc — 전체 보기 중이면 창으로 되돌리고, 아니면 팝업을 닫는다
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (root.classList.contains('mail-full')) {
      root.classList.remove('mail-full');
      if (fsBtn) fsBtn.textContent = '⛶ 전체 보기';
    } else closeMailDetailModal();
  });
  root.tabIndex = -1;
  root.focus();

  // 이 메일 한 통만 AI 분석 (번역까지 함께)
  // AI 분석 버튼은 두 군데 있다 — 헤더 구석과 본문 위 안내 상자 안.
  // 둘 다 같은 일을 하므로 한 번에 묶는다. 하나가 없어도 나머지는 동작한다.
  const analyzeBtns = [root.querySelector('#mdAnalyze'), root.querySelector('#mdAnalyzeInline')]
    .filter(Boolean);
  const runAnalyze = async (btn) => {
    const msg = [
      '이 메일 한 통을 AI로 분석합니다.',
      '',
      '한글 번역 + 요약 + 회신 필요 여부 + 기한이 한 번에 붙습니다.',
      '비용은 메일 길이에 따라 대략 ₩5~20입니다.',
      '',
      '진행할까요?',
    ].join('\n');
    if (!confirm(msg)) return;
    const was = btn.textContent;
    analyzeBtns.forEach((b) => { b.disabled = true; });
    btn.textContent = '⏳ 분석 중…';
    try {
      await safeJsonFetch('/api/mail/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailIds: [m.id] }),
      });
      loadMailCounts(true);
      openMailDetailModal(m.id);   // 결과를 반영해 다시 그린다
    } catch (e) {
      alert(`분석 실패: ${e.message || e}`);
      analyzeBtns.forEach((b) => { b.disabled = false; });
      btn.textContent = was;
    }
  };
  analyzeBtns.forEach((b) => b.addEventListener('click', () => runAnalyze(b)));
  bindBackdropDismiss(root, closeMailDetailModal);

  const patch = async (body, okMsg) => {
    const msg = root.querySelector('#mdMsg');
    try {
      await safeJsonFetch(`/api/mail/${encodeURIComponent(m.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      msg.innerHTML = `<span style="color:#166534">${okMsg}</span>`;
      loadMailCounts(true);
      setTimeout(() => { closeMailDetailModal(); render(); }, 600);
    } catch (e) {
      msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(String(e.message || e))}</span>`;
    }
  };

  root.querySelector('#mdMarkReplied')?.addEventListener('click', () =>
    patch({ status: 'replied', needsReply: false }, '✅ 회신 완료로 표시했습니다'));

  // 답장 상자는 공용 구현(replyBoxHtml/bindConversationReply)을 그대로 쓴다.
  bindConversationReply(null, 'mailDetailRoot');

  root.querySelector('#mdTrash')?.addEventListener('click', async () => {
    const msg = root.querySelector('#mdMsg');
    try {
      await safeJsonFetch('/api/mail/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailIds: [m.id], restore: Boolean(m.trashedAt) }),
      });
      msg.innerHTML = m.trashedAt
        ? '<span style="color:#166534">↩ 받은 메일함으로 되돌렸습니다</span>'
        : '<span style="color:#166534">🗑 휴지통으로 옮겼습니다 (삭제되지 않음)</span>';
      loadMailCounts(true);
      setTimeout(() => { closeMailDetailModal(); render(); }, 600);
    } catch (e) {
      msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(String(e.message || e))}</span>`;
    }
  });
}

// ── 오늘의 브리핑 ─────────────────────────────────────────────
async function renderBriefingPage() {
  els.content.innerHTML = `<div class="inline-loader">브리핑 만드는 중…</div>`;
  let data;
  try {
    data = await safeJsonFetch('/api/mail/briefing?days=1');
  } catch (e) {
    els.content.innerHTML = `<div class="empty-detail"><h3>불러오기 실패</h3><p>${escapeHtml(String(e.message || e))}</p></div>`;
    return;
  }
  if (!data || !data.success) {
    els.content.innerHTML = `<div class="empty-detail"><h3>조회 실패</h3><p>${escapeHtml(data?.error || '')}</p></div>`;
    return;
  }
  const b = data.briefing;
  const t = b.totals || {};
  const d = (v) => v ? new Date(v).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '';
  const uColor = (u) => u === 'high' ? '#b91c1c' : u === 'mid' ? '#c2410c' : '#64748b';
  const uLabel = (u) => u === 'high' ? '🔴 긴급' : u === 'mid' ? '🟠 보통' : '⚪ 낮음';

  const card = (n, label, bg, fg) => `
    <div style="flex:1;min-width:130px;background:${bg};padding:14px;border-radius:10px">
      <div style="font-size:24px;font-weight:800;color:${fg}">${n}</div>
      <div style="font-size:11px;color:${fg}">${label}</div>
    </div>`;

  const item = (m) => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border-subtle)">
      <div style="font-size:11px;font-weight:700;color:${uColor(m.urgency)}">
        ${uLabel(m.urgency)}
        ${m.deadline ? ` · 기한 ${d(m.deadline)}` : ''}
        ${m.company || m.group ? ` · ${escapeHtml(m.company || m.group)}` : ''}
        ${!m.analyzedByAi ? ' · <span style="color:var(--text-quaternary)">AI 미분석</span>' : ''}
      </div>
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-top:3px">
        ${escapeHtml(m.topic || m.subject)}
      </div>
      ${m.summary ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.5">${escapeHtml(m.summary)}</div>` : ''}
      ${m.suggestedAction ? `<div style="font-size:12px;color:var(--brand-text);margin-top:4px">→ ${escapeHtml(m.suggestedAction)}</div>` : ''}
      <div style="font-size:11px;color:var(--text-quaternary);margin-top:3px">
        ${escapeHtml(m.fromName || m.from)}
        ${m.leadId ? ` · <button type="button" class="conversation-btn" data-conv-lead="${escapeAttr(m.leadId)}"
            style="padding:1px 7px;font-size:10px;border:1px solid #16a34a;border-radius:99px;
                   background:#16a34a;color:#fff;font-weight:700;cursor:pointer">💬 대화</button>` : ''}
      </div>
    </div>`;

  const section = (title, items) => items.length ? `
    <h3 style="font-size:14px;margin:22px 0 4px">${title}
      <span style="color:var(--text-tertiary);font-weight:400">${items.length}건</span></h3>
    ${items.map(item).join('')}` : '';

  els.content.innerHTML = `
    <div style="max-width:760px">
      <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px">
        직전 24시간 (${d(b.since)} ~ ${d(b.until)}) · 새 메일 ${b.newMails}건
        · 합계는 <b>${escapeHtml(b.periodLabel || '최근 2개월')}</b> 기준
      </div>

      <div style="display:flex;gap:10px;margin-bottom:6px;flex-wrap:wrap">
        ${card(t.needsReply || 0, '회신 필요', '#fef3c7', '#92400e')}
        ${card(t.overdue || 0, '기한 지남', '#fee2e2', '#991b1b')}
        ${card((b.newReplies || []).length, '새 답장', '#dcfce7', '#166534')}
        ${card(t.unanalyzed || 0, 'AI 미분석', '#f1f5f9', '#475569')}
      </div>

      ${(b.newReplies || []).length ? `
        <h3 style="font-size:14px;margin:22px 0 4px">💬 새로 답장이 온 곳</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${b.newReplies.map((r) => `<button type="button" class="conversation-btn" data-conv-lead="${escapeAttr(r.leadId)}"
            style="padding:5px 12px;font-size:12px;border:1px solid #16a34a;border-radius:99px;
                   background:#16a34a;color:#fff;font-weight:700;cursor:pointer">
            💬 ${escapeHtml(r.company || r.leadId)}</button>`).join('')}
        </div>` : ''}

      ${section('⚠️ 회신이 필요한 메일', b.needsReply || [])}
      ${section('⏰ 기한이 다가온 건', b.deadlinesSoon || [])}

      ${!(b.needsReply || []).length && !(b.deadlinesSoon || []).length && !(b.newReplies || []).length
        ? '<div class="empty-detail" style="margin-top:20px"><h3>오늘은 새 소식이 없습니다</h3><p>회신이 필요한 메일이나 기한 임박 건이 생기면 여기에 모입니다.</p></div>'
        : ''}

      <div style="margin-top:24px;padding-top:14px;border-top:1px solid var(--border-subtle);
                  display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="button secondary" id="briefingSendBtn" type="button">📧 이 브리핑을 메일로 받기</button>
        <span id="briefingMsg" style="font-size:12px;color:var(--text-tertiary)"></span>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-quaternary);line-height:1.5">
        매일 아침 자동 발송하려면 <b>메일 수신 설정</b>에서 받을 주소를 지정하세요.
        새 소식이 없는 날은 보내지 않습니다.
      </div>
    </div>`;

  els.content.querySelector('#briefingSendBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msg = els.content.querySelector('#briefingMsg');
    btn.disabled = true;
    btn.textContent = '보내는 중…';
    try {
      const r = await safeJsonFetch('/api/mail/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 1, force: true }),
      });
      msg.innerHTML = r.success
        ? (r.skipped
            ? `<span style="color:var(--text-tertiary)">${escapeHtml(r.reason)}</span>`
            : `<span style="color:#166534">✅ ${escapeHtml(r.to)} 로 보냈습니다</span>`)
        : `<span style="color:#b91c1c">${escapeHtml(r.error)}</span>`;
    } catch (err) {
      msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(String(err.message || err))}</span>`;
    }
    btn.disabled = false;
    btn.textContent = '📧 이 브리핑을 메일로 받기';
  });
}

// ── 메일 수신 설정 ────────────────────────────────────────────
async function renderMailSettingsPage() {
  els.content.innerHTML = `<div class="inline-loader">설정 불러오는 중…</div>`;
  let data;
  try {
    data = await safeJsonFetch('/api/mail/settings');
  } catch (e) {
    els.content.innerHTML = `<div class="empty-detail"><h3>불러오기 실패</h3><p>${escapeHtml(String(e.message || e))}</p></div>`;
    return;
  }
  const s = data.settings || {};
  const folders = s.imapFolders || [];

  els.content.innerHTML = `
    <div style="max-width:720px;display:flex;flex-direction:column;gap:16px">
      <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;padding:20px">
        <h3 style="font-size:14px;margin-bottom:4px">이카운트 웹메일 연결</h3>
        <p style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">
          이카운트 웹메일 → 개인기능설정 → 외부연동설정에서 "메일 클라이언트 사용"이 켜져 있어야 합니다.
        </p>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;font-size:13px">
          <span style="color:var(--text-secondary)">수신 서버</span>
          <input class="form-input" id="msHost" value="${escapeAttr(s.imapHost || 'wmbox4.ecount.com')}" style="padding:7px 10px">
          <span style="color:var(--text-secondary)">계정</span>
          <input class="form-input" id="msUser" value="${escapeAttr(s.imapUser || '')}" placeholder="david@yogico.kr" style="padding:7px 10px">
          <span style="color:var(--text-secondary)">비밀번호</span>
          <input class="form-input" id="msPass" type="password" placeholder="${s.imapPassSet ? '저장됨 — 바꿀 때만 입력' : '입력하세요'}" style="padding:7px 10px">
        </div>
        <div style="margin-top:14px;display:flex;gap:8px">
          <button class="button" id="msSaveBtn" type="button">저장</button>
          <button class="button secondary" id="msTestBtn" type="button">🔌 연결 테스트</button>
        </div>
        <div id="msResult" style="margin-top:12px;font-size:12px"></div>
      </div>

      <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;padding:20px">
        <h3 style="font-size:14px;margin-bottom:4px">수집 폴더</h3>
        <p style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px">
          비워두면 INBOX 만 수집합니다. 거래처별 폴더를 나눠 두셨다면 여기에 추가하세요 —
          <b>추가하지 않으면 그 폴더로 들어온 메일을 놓칩니다.</b>
        </p>
        <div id="msFolders" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${folders.length
            ? folders.map((f) => `<span style="background:var(--bg-surface-alt);padding:4px 10px;border-radius:99px;font-size:12px">${escapeHtml(f)}</span>`).join('')
            : '<span style="font-size:12px;color:var(--text-quaternary)">INBOX 만 수집 중</span>'}
        </div>
        <div style="font-size:12px;color:var(--text-tertiary)">
          마지막 수집: ${s.lastIngestAt ? new Date(s.lastIngestAt).toLocaleString('ko-KR') : '없음'}
          ${s.lastIngestError ? `<div style="color:#b91c1c;margin-top:4px">⚠ ${escapeHtml(s.lastIngestError)}</div>` : ''}
        </div>
      </div>
    </div>`;

  els.content.querySelector('#msSaveBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const payload = {
      imapHost: els.content.querySelector('#msHost').value.trim(),
      imapUser: els.content.querySelector('#msUser').value.trim(),
    };
    // 빈 비밀번호는 "변경 없음" — 기존 값을 지우지 않는다
    const pass = els.content.querySelector('#msPass').value;
    if (pass) payload.imapPass = pass;
    try {
      await safeJsonFetch('/api/mail/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      els.content.querySelector('#msResult').innerHTML = '<span style="color:#166534">✅ 저장했습니다.</span>';
    } catch (err) {
      els.content.querySelector('#msResult').innerHTML = `<span style="color:#b91c1c">저장 실패: ${escapeHtml(String(err.message || err))}</span>`;
    }
    btn.disabled = false;
  });

  els.content.querySelector('#msTestBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const out = els.content.querySelector('#msResult');
    btn.disabled = true;
    out.innerHTML = '<span class="inline-loader">연결 확인 중…</span>';
    try {
      const r = await safeJsonFetch('/api/mail/test-connection', { method: 'POST' });
      if (r.success) {
        out.innerHTML = `<span style="color:#166534">✅ 연결 성공 — 폴더 ${r.folderCount}개</span>
          <div style="margin-top:6px;color:var(--text-tertiary)">${(r.folders || []).map(escapeHtml).join(' · ')}</div>
          ${r.mailbox ? `<div style="margin-top:4px;color:var(--text-tertiary)">INBOX ${r.mailbox.exists}통</div>` : ''}`;
      } else {
        out.innerHTML = `<span style="color:#b91c1c">❌ ${escapeHtml(r.error || '실패')}</span>`;
      }
    } catch (err) {
      out.innerHTML = `<span style="color:#b91c1c">❌ ${escapeHtml(String(err.message || err))}</span>`;
    }
    btn.disabled = false;
  });
}

// ── 메일 대화 모달 ────────────────────────────────────────────
// 보낸 메일(Lead.emailHistory)과 받은 답장(InboundMail)을 한 타임라인으로 보여준다.
// 답장이 오간 뒤부터는 "어느 회사냐" 보다 "무슨 얘기가 오갔냐" 가 중요하므로,
// 회사 목록이 아니라 메일 대화 형식으로 읽게 한다.
function closeConversationModal() {
  const el = document.getElementById('conversationModalRoot');
  if (!el) return;
  el.remove();
  unlockBodyScroll();
}

async function openConversationModal(leadId) {
  closeConversationModal();
  const root = document.createElement('div');
  root.id = 'conversationModalRoot';
  root.style.cssText = `
    position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:24px;
  `;
  root.innerHTML = `
    <div style="background:#ffffff;border-radius:14px;max-width:1140px;width:100%;max-height:90vh;
                display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.3);overflow:hidden">
      <div style="padding:40px;text-align:center;color:#64748b;font-size:14px">대화를 불러오는 중…</div>
    </div>`;
  document.body.appendChild(root);
  lockBodyScroll();

  let data;
  try {
    data = await safeJsonFetch(`/api/mail/thread?leadId=${encodeURIComponent(leadId)}`);
  } catch (e) {
    root.querySelector('div').innerHTML = `
      <div style="padding:32px;color:#991b1b">대화를 불러오지 못했습니다: ${escapeHtml(String(e.message || e))}</div>`;
    return;
  }
  if (!data || !data.success) {
    root.querySelector('div').innerHTML = `
      <div style="padding:32px;color:#991b1b">${escapeHtml(data?.error || '조회 실패')}</div>`;
    return;
  }

  const L = data.lead || {};
  const S = data.stats || {};
  const tl = data.timeline || [];

  const stageStyle = STAGE_STYLE[L.stage] || STAGE_STYLE.imported;
  const dt = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // 회신 대상 = 가장 최근에 받은 메일 (여기에 In-Reply-To 를 건다)
  const inbounds = tl.filter((t) => t.direction === 'in');
  const lastInbound = inbounds.length ? inbounds[inbounds.length - 1] : null;

  // 우리가 답할 차례인지 — 마지막이 상대 메일이면 대응이 필요하다
  const alertBar = S.awaitingOurReply
    ? `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:8px 12px;
                  border-radius:8px;font-size:12px;font-weight:600;margin-bottom:12px">
         ⚠ 상대 답장이 마지막입니다 — 우리가 회신할 차례
         ${S.nearestDeadline ? ` · 회신 기한 ${dt(S.nearestDeadline)}` : ''}
       </div>`
    : '';

  const bubbles = tl.map((t, i) => {
    const out = t.direction === 'out';
    const bg = out ? '#eff6ff' : '#f0fdf4';
    const bd = out ? '#bfdbfe' : '#bbf7d0';
    const fg = out ? '#1e40af' : '#166534';
    const who = out ? '📤 우리가 보냄' : '📥 상대 답장';
    const meta = [];
    if (!out) {
      // 매칭 방식(domain/email-address)·분류 코드(b2b)는 개발용 정보라 보여주지 않는다
      const LANG_KO = { en: '영어', ko: '한국어', ja: '일본어', zh: '중국어', he: '히브리어', da: '덴마크어', de: '독일어',
        fr: '프랑스어', es: '스페인어', it: '이탈리아어', ro: '루마니아어', tr: '터키어', sv: '스웨덴어', no: '노르웨이어', nl: '네덜란드어', pl: '폴란드어' };
      if (t.lang && t.lang !== 'ko') meta.push(LANG_KO[t.lang] || t.lang);
      if (t.needsReply) meta.push('답변 필요');
    } else if (t.to) {
      meta.push(`to ${t.to}`);
    }

    const quoteId = `conv-quote-${i}`;
    const quoteBlock = (!out && t.hasQuoted && t.bodyFull)
      ? `<div style="margin-top:8px;display:flex;align-items:baseline;gap:7px;flex-wrap:wrap">
           <button type="button" class="conv-quote-toggle" data-quote-target="${quoteId}"
                style="background:none;border:none;color:#64748b;font-size:11px;
                       cursor:pointer;padding:0;text-decoration:underline">▼ 인용된 이전 대화 보기</button>
           <span style="font-size:10.5px;color:#94a3b8">— 답장에 딸려온 지난번 내용입니다</span>
         </div>
         <pre id="${quoteId}" hidden style="margin:8px 0 0;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;
                    border-radius:6px;font-size:11px;color:#64748b;white-space:pre-wrap;
                    word-break:break-word;max-height:220px;overflow:auto">${escapeHtml(t.bodyFull)}</pre>`
      : '';

    // ── AI 분석 결과 (유료 분석을 돌린 메일만) ──
    // 영문 답장이면 한글 번역을 접어서 함께 둔다 — 대표가 원문/번역을 오가며 읽는다.
    const transId = `conv-trans-${i}`;
    const aiBlock = (!out && t.analyzedBy === 'ai')
      ? `<div style="margin-top:10px;padding:10px 12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px">
           <div style="font-size:10px;font-weight:800;color:#15803d;margin-bottom:6px">✅ AI 분석 완료</div>
           ${t.topic ? `<div style="font-size:12px;font-weight:700;color:#1e1b4b;margin-bottom:4px">${escapeHtml(t.topic)}</div>` : ''}
           ${t.summary ? `<div style="font-size:12px;color:#312e81;line-height:1.55">${escapeHtml(t.summary)}</div>` : ''}
           ${(t.keyPoints && t.keyPoints.length)
             ? `<ul style="margin:8px 0 0;padding-left:16px;font-size:11.5px;color:#3730a3;line-height:1.6">
                  ${t.keyPoints.map(k => `<li>${escapeHtml(k)}</li>`).join('')}
                </ul>` : ''}
           ${t.suggestedAction
             ? `<div style="margin-top:8px;padding:6px 9px;background:#ffffff;border-radius:6px;
                            font-size:11.5px;color:#1e1b4b;border-left:3px solid #6366f1">
                  <b>다음 할 일</b> · ${escapeHtml(t.suggestedAction)}
                </div>` : ''}
           ${t.deadlineText
             ? `<div style="margin-top:6px;font-size:11px;color:#b45309">⏰ 기한 표현: "${escapeHtml(t.deadlineText)}"</div>` : ''}
           ${t.translation
             ? `<button type="button" class="conv-quote-toggle" data-quote-target="${transId}"
                        style="margin-top:8px;background:none;border:none;color:#4338ca;font-size:11px;
                               cursor:pointer;padding:0;text-decoration:underline">▼ 한글 번역 전문 보기</button>
                <div id="${transId}" hidden style="margin-top:8px;padding:10px;background:#ffffff;
                            border:1px solid #c7d2fe;border-radius:6px;font-size:12px;color:#1e1b4b;
                            line-height:1.6;white-space:pre-wrap;max-height:280px;overflow:auto">${escapeHtml(t.translation)}</div>`
             : ''}
         </div>`
      : '';

    // 받은 메일만 내려받을 수 있다 — 보낸 메일 기록에는 메일함 위치가 없다
    const attachBlock = (!out && t._id && t.attachments && t.attachments.length)
      ? attachmentChipsHtml(t._id, t.attachments, { small: true })
      : '';

    return `
      <div style="margin-bottom:14px;${out ? 'margin-right:40px' : 'margin-left:40px'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:11px;font-weight:700;color:${fg}">${who}</span>
          <span style="font-size:11px;color:#94a3b8">${dt(t.at)}</span>
        </div>
        <div style="background:${bg};border:1px solid ${bd};border-radius:10px;padding:12px 14px">
          <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px">
            ${escapeHtml(t.subject || '(제목 없음)')}
          </div>
          <!-- 우리가 보낸 메일은 HTML 이라 그대로 escape 하면 태그가 글자로 보인다.
               위험한 것만 걷어내고 보이는 대로 그린다 (renderMailBodyHtml). -->
          <div style="font-size:13px;color:#334155;line-height:1.6;${looksLikeHtml(t.body) ? '' : 'white-space:pre-wrap;'}word-break:break-word">${renderMailBodyHtml(t.body)}</div>
          <!-- 상대가 보낸 영문 답장에만. 우리가 보낸 것과 이미 번역이 있는 건 제외 -->
          ${!out && !t.translation ? translateBtnHtml(t.body || '', { inline: true }) : ''}
          ${attachBlock}
          ${quoteBlock}
          ${aiBlock}
          ${meta.length ? `<div style="margin-top:8px;font-size:10px;color:#94a3b8">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div style="background:#ffffff;border-radius:14px;max-width:1140px;width:100%;max-height:90vh;
                display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.3);overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;
                  justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <strong style="font-size:16px;color:#0f172a">${escapeHtml(L.Company || '')}</strong>
            <span style="background:${stageStyle.bg};color:${stageStyle.fg};padding:2px 8px;
                         border-radius:99px;font-size:11px;font-weight:700">${stageStyle.label}</span>
          </div>
          <div style="font-size:12px;color:#64748b;margin-top:3px">
            ${escapeHtml(L.Region || '')}
            ${L.Email ? ` · ${escapeHtml(L.Email)}` : ''}
            ${L.WebsiteContact ? ` · ${websiteLinkHtml(L.WebsiteContact, { short: true })}` : ''}
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px">
            📤 보낸 ${S.sentCount || 0}통 · 📥 받은 ${S.receivedCount || 0}통
          </div>
        </div>
        <button type="button" id="conversationModalClose"
          style="background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer;line-height:1;padding:0 4px">×</button>
      </div>
      <div style="padding:16px 20px;overflow:auto;flex:1;background:#fcfcfd">
        ${alertBar}
        ${tl.length ? bubbles : '<div style="text-align:center;color:#94a3b8;padding:40px;font-size:13px">아직 주고받은 메일이 없습니다.</div>'}
      </div>
      ${replyBoxHtml(lastInbound)}
    </div>`;

  bindConversationReply(leadId);
}

/**
 * 회신 작성 영역 — 마지막으로 받은 메일에 스레드로 답한다.
 *
 * 받은 메일이 없으면 답할 대상이 없으므로 표시하지 않는다
 * (새 메일 발송은 발송함 화면의 몫).
 */
/**
 * 답장에 쓸 글꼴 목록.
 *
 * 메일은 받는 사람 컴퓨터에서 그려진다. 웹폰트를 링크로 걸어도 지메일·아웃룩이
 * 걷어내므로, **상대 컴퓨터에 이미 깔려 있는 글꼴**만 뜻이 있다.
 * 그래서 목록은 윈도우·맥 기본 글꼴과 무료로 풀린 나눔 계열로만 짰다.
 *
 * stack 에 대체 글꼴을 줄줄이 적는 이유도 같다 — 나눔고딕이 없는 컴퓨터에서는
 * 맑은 고딕으로, 그것도 없으면 기본 고딕으로 떨어진다.
 */
var REPLY_FONTS = [
  // 한글
  { label: '맑은 고딕',    stack: "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif" },
  { label: '나눔고딕',     stack: "'NanumGothic','나눔고딕','Malgun Gothic',sans-serif" },
  { label: '나눔바른고딕', stack: "'NanumBarunGothic','나눔바른고딕','Malgun Gothic',sans-serif" },
  { label: '나눔명조',     stack: "'NanumMyeongjo','나눔명조','Batang',serif" },
  { label: '굴림',         stack: "'Gulim','굴림',sans-serif" },
  { label: '돋움',         stack: "'Dotum','돋움',sans-serif" },
  { label: '바탕',         stack: "'Batang','바탕',serif" },
  { label: '궁서',         stack: "'Gungsuh','궁서',serif" },
  // 영문
  { label: 'Arial',           stack: "Arial,Helvetica,sans-serif" },
  { label: 'Calibri',         stack: "Calibri,'Segoe UI',sans-serif" },
  { label: 'Segoe UI',        stack: "'Segoe UI',Tahoma,sans-serif" },
  { label: 'Verdana',         stack: "Verdana,Geneva,sans-serif" },
  { label: 'Tahoma',          stack: "Tahoma,Geneva,sans-serif" },
  { label: 'Trebuchet MS',    stack: "'Trebuchet MS',sans-serif" },
  { label: 'Georgia',         stack: "Georgia,serif" },
  { label: 'Times New Roman', stack: "'Times New Roman',Times,serif" },
  { label: 'Courier New',     stack: "'Courier New',monospace" },
];

/**
 * 메일 본문을 화면에 보이는 대로 그린다.
 *
 * 우리가 보낸 메일은 HTML 로 저장된다(양식이 HTML 이라서). 그걸 그대로
 * escapeHtml 로 감싸면 <p>Dear …</p> 같은 **태그가 글자로 보인다** —
 * 대화 이력을 읽을 수가 없다.
 *
 * 그렇다고 innerHTML 에 통째로 넣을 수는 없다. 받은 메일 본문에는 남이 보낸
 * 내용이 들어 있어서, 스크립트가 섞여 있으면 그대로 실행된다.
 * 그래서 **위험한 것만 걷어내고** 그린다.
 *
 * 걷어내는 것:
 *   · script · style · iframe · object · embed · link · meta  — 통째로
 *   · on* 속성 (onclick 등)                                   — 실행 지점
 *   · href/src 의 javascript: 스킴                             — 클릭 시 실행
 *   · form · input                                            — 가짜 입력창 방지
 *
 * HTML 이 아니면(그냥 글) 예전처럼 줄바꿈만 살려 글자로 보여준다.
 */
function looksLikeHtml(s) {
  return /<\s*(p|div|br|table|span|a|ul|ol|li|h[1-6]|img|b|strong|em|font)\b|<\/\s*[a-z]+\s*>/i.test(String(s || ''));
}

function renderMailBodyHtml(body) {
  const raw = String(body || '');
  if (!raw.trim()) return '<span style="color:var(--text-quaternary)">(본문 없음)</span>';

  if (!looksLikeHtml(raw)) {
    // 평문 — 줄바꿈만 살린다 (바깥 컨테이너가 white-space:pre-wrap 를 준다)
    return escapeHtml(raw);
  }

  let el;
  try {
    // DOMParser 는 넣는 순간 스크립트를 실행하지 않는다.
    // innerHTML 로 임시 div 에 넣으면 img onerror 같은 것이 바로 터진다.
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    el = doc.body;
  } catch {
    return escapeHtml(raw);
  }

  el.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach((n) => n.remove());
  el.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      const name = a.name.toLowerCase();
      const val = String(a.value || '');
      if (name.startsWith('on')) { n.removeAttribute(a.name); return; }
      if ((name === 'href' || name === 'src' || name === 'xlink:href')
          && /^\s*(javascript|data:text\/html|vbscript)/i.test(val)) {
        n.removeAttribute(a.name);
      }
    });
    // 링크는 새 창으로 — 대화 화면이 통째로 날아가지 않게
    if (n.tagName === 'A') {
      n.setAttribute('target', '_blank');
      n.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return el.innerHTML;
}

/**
 * 우리가 보낸 메일의 오른쪽 칸 — 예전에는 "우리가 보낸 메일입니다" 안내만 떠서 정작 무엇을 보냈는지
 * 확인하려면 왼쪽의 요약 본문만 봐야 했다 (인용된 앞 대화·서식이 빠진 글자). 보낸 **원문 그대로**를 보여주고,
 * 같은 받는 사람에게 이어서 보낼 수 있게 한다 (대표님 요청 2026-09-14).
 * 이어서 보내기는 받는 사람(상대)에게 간다 — 서버 api/mail/reply 가 보낸 메일이면 받는 사람을 주소로 쓴다.
 */
function sentMailPanelHtml(m) {
  const fmtAddr = (list) => (list || []).map((t) => t.name ? `${t.name} <${t.address}>` : t.address).join(', ');
  const recipient = (m.to || []).find((t) => t && t.address && !/@yogico\.kr$/i.test(t.address)) || (m.to || [])[0];
  const when = m.date ? new Date(m.date).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const original = m.html
    ? `<div class="sent-original-html" style="font-size:13.5px;line-height:1.7;color:#1e293b;word-break:break-word">${renderMailBodyHtml(m.html)}</div>`
    : `<div style="font-size:13.5px;line-height:1.8;color:#1e293b;white-space:pre-wrap;word-break:break-word">${escapeHtml(m.bodyFull || m.body || '(본문 없음)')}</div>`;
  return `
    <div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;min-height:0">
      <div style="padding:11px 13px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12.5px;color:#0c4a6e;line-height:1.75">
        <div style="font-size:13.5px;font-weight:800;margin-bottom:3px">↗ 우리가 보낸 메일</div>
        <div><span style="color:#64748b">보낸 사람</span> <b>${escapeHtml(fmtAddr([m.from]) || '—')}</b></div>
        <div><span style="color:#64748b">받는 사람</span> <b>${escapeHtml(fmtAddr(m.to) || '—')}</b></div>
        ${(m.cc || []).length ? `<div><span style="color:#64748b">참조</span> ${escapeHtml(fmtAddr(m.cc))}</div>` : ''}
        <div><span style="color:#64748b">보낸 시각</span> ${escapeHtml(when)}</div>
      </div>
      <details open style="border:1px solid #e2e8f0;border-radius:10px;background:#fff">
        <summary style="cursor:pointer;padding:9px 12px;font-size:12.5px;font-weight:700;color:#334155">📄 보낸 원문 그대로 보기 <span style="font-weight:400;color:#94a3b8">· 서식·인용된 앞 대화 포함</span></summary>
        <div style="padding:4px 14px 14px;max-height:420px;overflow:auto">${original}</div>
      </details>
      ${recipient ? `
      <div style="border-top:1px dashed #cbd5e1;padding-top:10px">
        <div style="font-size:12px;font-weight:800;color:#334155;margin-bottom:6px">↪ ${escapeHtml(recipient.name || recipient.address)} 에게 이어서 보내기</div>
        ${replyBoxHtml({ _id: m.id, subject: m.subject, from: recipient })}
      </div>` : ''}
    </div>`;
}

function replyBoxHtml(lastInbound) {
  if (!lastInbound || !lastInbound._id) return '';
  const subj = String(lastInbound.subject || '');
  const replySubject = /^re\s*:/i.test(subj) ? subj : `Re: ${subj}`;
  const tb = "padding:4px 8px;background:#fff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:11.5px;color:#0f172a";
  return `
    <div style="border-top:1px solid #e2e8f0;background:#ffffff;padding:14px 20px 16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:800;color:#1e40af">↩ 회신</span>
        <span style="font-size:11px;color:#64748b">
          ${escapeHtml(lastInbound.from?.address || '')} · ${escapeHtml(replySubject.slice(0, 60))}
        </span>
      </div>

      <!-- 초안 생성이 무엇인지 한 줄로. 처음 보는 사람은 이 버튼이
           '내 대신 메일을 보내버리는 것'으로 오해하기 쉬워서 명시한다. -->
      <div style="padding:8px 11px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;
                  font-size:11.5px;color:#3730a3;line-height:1.6;margin-bottom:8px">
        <b>🧠 초안 생성</b> — 아래 칸에 한국어로 요지만 적으면, AI가 <b>받은 메일 내용을 읽고</b>
        상대 언어에 맞는 답장 초안을 써 줍니다. 한글 대역본이 오른쪽에 같이 나와 내용을 확인할 수 있습니다.
        <b>자동으로 발송되지 않습니다</b> — 고친 뒤 [보내기]를 눌러야 나갑니다.
      </div>

      <div style="display:flex;gap:6px;margin-bottom:9px">
        <input type="text" id="convDraftIntent"
          placeholder="한국어로 요지만 (예: MOQ 500개 확인, FOB 단가 회신, 샘플 다음주 발송)"
          style="flex:1;padding:8px 11px;font-size:12.5px;border:1px solid #cbd5e1;border-radius:8px;
                 background:#ffffff;color:#0f172a">
        <button type="button" id="convDraftBtn" data-inbound-id="${escapeAttr(lastInbound._id)}"
          style="padding:8px 13px;font-size:12px;font-weight:700;border:1px solid #6366f1;border-radius:8px;
                 background:#eef2ff;color:#4338ca;cursor:pointer;white-space:nowrap">🧠 초안 생성</button>
      </div>

      <!-- 서명을 붙일지 **쓰기 전에** 정한다.
           예전에는 [보내기] 옆에 있어서, 다 쓰고 보내려는 순간에야 눈에 띄었다. -->
      <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px;
                  padding:8px 11px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;
                      color:#166534;cursor:pointer">
          <input type="checkbox" id="convReplySig" checked style="width:15px;height:15px;cursor:pointer">
          서명 붙이기
        </label>
        <span style="font-size:11.5px;color:#15803d;line-height:1.6">
          켜 두면 답장 <b>맨 아래에 보내는 사람 정보</b>(이름·직함·회사·주소·연락처·웹사이트)가 자동으로 붙습니다.
          본문에 직접 쓰지 않아도 됩니다. 본문 칸 맨 아래에 실제로 붙는 서명이 보입니다.
        </span>
      </div>

      <!-- 좌우 2단: 왼쪽에 쓰고 오른쪽에서 한글로 확인.
           위아래로 쌓으면 초안을 고칠 때마다 스크롤을 오르내려야 한다. -->
      <div class="reply-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">
        <div>
          <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;background:#f1f5f9;
                      border:1px solid #cbd5e1;border-bottom:none;border-radius:8px 8px 0 0;padding:5px 6px">
            <!-- 글꼴 — 메일에서 실제로 뜨는 것만 넣는다.
                 웹폰트(구글 폰트를 링크로 불러오는 방식)는 지메일·아웃룩이
                 걷어내기 때문에, 아무리 예쁘게 골라도 받는 쪽에서는 기본 글꼴로
                 보인다. 그래서 컴퓨터에 이미 깔려 있는 글꼴만 골랐다.
                 나눔 계열은 무료로 풀린 글꼴이고 한국에서는 대부분 깔려 있다.
                 각 항목을 그 글꼴로 그려서 고르기 전에 모양을 보게 한다. -->
            <select id="convFontFamily" title="글꼴 — 받는 사람 화면에서도 이대로 보입니다" style="${tb};padding:4px;max-width:150px">
              <option value="">글꼴</option>
              ${REPLY_FONTS.map((f) => `
                <option value="${escapeAttr(f.stack)}" style="font-family:${f.stack}">
                  ${escapeHtml(f.label)} (ABCD 가나다)
                </option>`).join('')}
            </select>
            <select id="convFontSize" title="글자 크기" style="${tb};padding:4px">
              <option value="">크기</option>
              <option value="13">13px</option><option value="14">14px</option>
              <option value="15">15px · 보통</option><option value="16">16px</option>
              <option value="18">18px</option><option value="20">20px</option>
              <option value="24">24px</option>
            </select>
            <button type="button" data-rcmd="bold" style="${tb};font-weight:800" title="굵게"><b>B</b></button>
            <button type="button" data-rcmd="italic" style="${tb};font-style:italic" title="기울임"><i>I</i></button>
            <button type="button" data-rcmd="underline" style="${tb};text-decoration:underline" title="밑줄"><u>U</u></button>
            <label title="글자 색" style="display:inline-flex;align-items:center;gap:3px;${tb}">
              <span style="font-weight:800">A</span>
              <input type="color" id="convFontColor" value="#111827"
                     style="width:20px;height:16px;padding:0;border:none;background:none;cursor:pointer">
            </label>
            <button type="button" data-rcmd="insertUnorderedList" style="${tb}" title="글머리 목록">• 목록</button>
            <button type="button" id="convInsertLink" style="${tb};color:#1d4ed8;font-weight:700" title="링크 걸기">🔗</button>
            <button type="button" data-rcmd="removeFormat" style="${tb}" title="서식 지우기">서식해제</button>
          </div>
          <!-- 본문 칸과 서명을 **한 테두리 안에** 둔다 — 받는 사람이 보는 메일처럼 본문 바로 아래에 서명이 붙어 보이게.
               (대표님 요청 2026-09-15: 서명이 칸 밖에 따로 있으니 "안 붙는다" 로 보였다) -->
          <div id="convReplyFrame" style="border:1px solid #cbd5e1;border-radius:0 0 8px 8px;background:#ffffff">
            <div id="convReplyBody" contenteditable="true"
              data-placeholder="답장 내용을 입력하세요."
              style="width:100%;min-height:170px;max-height:40vh;overflow-y:auto;padding:11px 13px;
                     font-size:15px;line-height:1.8;background:#ffffff;color:#0f172a;outline:none"></div>

            <!-- 서명 — **편집 칸 밖**(contenteditable 이 아님)에 둔다.
                 칸 안에 넣으면 실수로 지워지거나, 서버가 한 번 더 붙여 서명이 두 번 나간다.
                 내용은 서버에 물어 받아온다(GET /api/mail/reply) — 보낼 때와 같은 계정 규칙이라 실제와 어긋나지 않는다. -->
            <div id="convSigPreview" contenteditable="false"
                 style="margin:0 13px;padding:0 0 8px;border-top:1px dashed #e2e8f0;user-select:none">
              <div id="convSigLabel" style="font-size:10.5px;font-weight:700;color:#94a3b8;margin-top:7px">
                서명 불러오는 중…
              </div>
              <div id="convSigBody"></div>
            </div>
          </div>
        </div>

        <div id="convDraftKo" style="padding:11px 13px;background:#f8fafc;border:1px solid #e2e8f0;
             border-radius:8px;font-size:14px;color:#334155;line-height:1.75;min-height:236px;
             max-height:calc(44vh + 30px);overflow-y:auto">
          <div style="font-size:10.5px;font-weight:800;color:#64748b;margin-bottom:6px">
            KR 한글 대역본 <span style="font-weight:400">· 검토용 · 발송되지 않음</span>
          </div>
          <div style="color:#94a3b8">초안을 생성하면 왼쪽 영문 내용이 여기에 한국어로 표시됩니다.</div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap">
        <!-- 보내기 전에 받는 사람이 볼 모습 그대로 — 보내는 사람·받는 사람·제목·본문·서명 전체 -->
        <button type="button" id="convReplyPreview"
          style="padding:9px 16px;font-size:13.5px;font-weight:800;border:1px solid #2563eb;border-radius:8px;
                 background:#ffffff;color:#1d4ed8;cursor:pointer">👁 미리보기</button>
        <button type="button" id="convReplySend" data-inbound-id="${escapeAttr(lastInbound._id)}"
          style="padding:9px 20px;font-size:13.5px;font-weight:800;border:none;border-radius:8px;
                 background:#2563eb;color:#fff;cursor:pointer">보내기</button>
        <!-- [서명 붙이기] 는 본문 위로 올렸다 — 다 쓰고 나서가 아니라 쓰기 전에 정하는 것이라서. -->
        <span id="convReplySigNote" style="font-size:11.5px;color:#64748b">
          서명이 함께 나갑니다 · 내용은 <b>설정 · 도구 → 📬 메일 계정 관리</b>에서 바꿉니다
        </span>
        <span id="convReplyMsg" style="font-size:12px;margin-left:auto"></span>
      </div>
      <div style="margin-top:6px;font-size:10.5px;color:#94a3b8">
        보낸 답장은 상대 메일함에서 원래 메일과 같은 대화로 묶여 보입니다.
      </div>
    </div>`;
}

// rootId: 이 답장 상자가 들어 있는 모달의 id.
// 대화 모달과 받은메일 상세 모달 둘 다 같은 상자를 쓴다 (구현이 두 벌이면 한쪽만 고쳐진다).
// ── 서식 선택칸을 누르는 동안 본문의 글자 선택 지키기 ──────────────
//
// 편집기 툴바의 [B][I][U] 같은 **단추**는 mousedown 기본 동작을 막아서
// 본문 선택이 풀리지 않게 한다. 그런데 같은 처리를 글꼴·크기 **선택칸(<select>)**
// 에도 걸어 두었더니, 브라우저가 목록 자체를 펼치지 못했다
// ("글꼴 눌러도 안 내려온다"). 선택칸은 눌러야 열리므로 막으면 안 된다.
//
// 대신 선택칸을 누르기 **직전**의 글자 선택을 기억해 두었다가, 값을 고른 뒤
// 본문에 되살려서 거기에 서식을 건다. 선택칸으로 포커스가 옮겨가면 본문 선택이
// 사라지므로 되살리지 않으면 "먼저 글자를 선택하세요" 만 뜬다.
function keepEditorSelection(editor, controls) {
  let saved = null;
  const capture = () => {
    const sel = window.getSelection();
    if (!editor || !sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (editor.contains(r.commonAncestorContainer)) saved = r.cloneRange();
  };
  editor?.addEventListener('mouseup', capture);
  editor?.addEventListener('keyup', capture);
  (controls || []).forEach((c) => {
    c?.addEventListener('mousedown', capture);   // ⚠️ preventDefault 하지 않는다
    c?.addEventListener('focus', capture);
  });
  return {
    /** 기억해 둔 선택을 본문에 되살린다. 글자가 선택돼 있으면 true */
    restore() {
      if (!editor || !saved || !editor.contains(saved.commonAncestorContainer)) return false;
      editor.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(saved);
      return !saved.collapsed;
    },
    clear() { saved = null; },
  };
}

function bindConversationReply(leadId, rootId) {
  const root = document.getElementById(rootId || 'conversationModalRoot');
  if (!root) return;
  const btn = root.querySelector('#convReplySend');
  if (!btn) return;

  // ── 회신 상자 서식 툴바 ──
  // styleWithCSS: <font> 태그 대신 인라인 style 로 넣는다.
  // 메일 클라이언트는 <style>/class 를 지우므로 인라인이어야 서식이 살아남는다.
  try { document.execCommand('styleWithCSS', false, true); } catch {}
  const rbody = root.querySelector('#convReplyBody');
  const keep = (el) => el?.addEventListener('mousedown', (e) => e.preventDefault());

  root.querySelectorAll('[data-rcmd]').forEach((b) => {
    keep(b);
    b.addEventListener('click', () => { document.execCommand(b.dataset.rcmd, false, null); rbody?.focus(); });
  });

  // 선택 영역을 style 로 감싼다 — fontSize 는 execCommand 가 1~7 단계만 지원해
  // px 로 지정하려면 직접 감싸야 한다.
  const wrapSel = (prop, val) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { alert('먼저 바꿀 글자를 선택하세요.'); return; }
    const range = sel.getRangeAt(0);
    if (!rbody || !rbody.contains(range.commonAncestorContainer)) { alert('답장 본문 안에서 선택해 주세요.'); return; }
    const span = document.createElement('span');
    span.style[prop] = val;
    try { span.appendChild(range.extractContents()); range.insertNode(span); } catch {}
  };

  // 글꼴·크기·색 — 선택칸은 mousedown 을 막지 않는다 (막으면 목록이 안 펼쳐진다).
  // 누르기 직전 글자 선택을 기억했다가 되살려서 건다 (keepEditorSelection).
  const fs = root.querySelector('#convFontSize');
  const ff = root.querySelector('#convFontFamily');
  const fc = root.querySelector('#convFontColor');
  const pick = keepEditorSelection(rbody, [fs, ff, fc]);

  // 고른 글자가 있으면 그 부분만, 없으면 **본문 전체**에 건다.
  // 아무것도 선택하지 않고 골랐을 때 아무 일도 안 일어나면 고장으로 보인다.
  // 전체에 건 서식은 보낼 때 본문을 감싸서 함께 보낸다 (아래 [보내기] 참고).
  const applyStyle = (prop, val) => {
    if (pick.restore()) wrapSel(prop, val);
    else if (rbody) { rbody.style[prop] = val; rbody.focus({ preventScroll: true }); }
  };

  fs?.addEventListener('change', (e) => {
    if (e.target.value) applyStyle('fontSize', e.target.value + 'px');
    e.target.selectedIndex = 0;
  });
  ff?.addEventListener('change', (e) => {
    if (e.target.value) applyStyle('fontFamily', e.target.value);
    e.target.selectedIndex = 0;
  });
  fc?.addEventListener('input', (e) => {
    if (pick.restore()) document.execCommand('foreColor', false, e.target.value);
  });

  const lk = root.querySelector('#convInsertLink');
  keep(lk);
  lk?.addEventListener('click', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { alert('링크를 걸 글자를 먼저 선택하세요.'); return; }
    const url = prompt('연결할 주소', 'https://');
    if (!url || url === 'https://') return;
    const href = /^(https?:|mailto:)/i.test(url) ? url : 'https://' + url;
    document.execCommand('createLink', false, href);
    rbody?.querySelectorAll('a[href]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  });

  // ── 서명 붙이기 ──
  // 켜면 실제로 붙는 서명을 본문 아래에 그대로 보여주고, 끄면 감춘다.
  // "켜 두긴 했는데 무엇이 붙는지 모르겠다" 가 안 되게 눈으로 확인시킨다.
  const sigChk = root.querySelector('#convReplySig');
  const sigBox = root.querySelector('#convSigPreview');
  const sigNote = root.querySelector('#convReplySigNote');
  const syncSig = () => {
    const on = sigChk ? sigChk.checked : true;
    if (sigBox) sigBox.hidden = !on;
    if (sigNote) {
      sigNote.innerHTML = on
        ? '서명이 함께 나갑니다 · 내용은 <b>설정 · 도구 → 📬 메일 계정 관리</b>에서 바꿉니다'
        : '<span style="color:#b45309">서명 없이 나갑니다</span> — 본문에 직접 적으셔야 합니다';
    }
  };
  sigChk?.addEventListener('change', syncSig);
  syncSig();

  // 실제로 붙을 서명을 서버에서 받아 채운다.
  // 화면의 계정 목록(_mailAccounts)으로 그리면, 목록을 아직 안 불러온 채 대화를 열었을 때 서명이 비어 보였다.
  const sigLabel = root.querySelector('#convSigLabel');
  const sigBody = root.querySelector('#convSigBody');
  const replyInboundId = root.querySelector('#convReplySend')?.dataset.inboundId;
  if (sigBody && replyInboundId) {
    safeJsonFetch(`/api/mail/reply?inboundMailId=${encodeURIComponent(replyInboundId)}`)
      .then((r) => {
        if (!r || !r.success) {
          if (sigLabel) sigLabel.innerHTML = `<span style="color:#b91c1c">서명을 불러오지 못했습니다 — ${escapeHtml((r && r.error) || '')}</span>`;
          return;
        }
        const addr = r.from?.address || '';
        if (r.signatureHtml) {
          if (sigLabel) sigLabel.textContent = `서명 · ${addr} 계정으로 보냅니다`;
          sigBody.innerHTML = r.signatureHtml;
          // 서버 서명은 위 여백이 24px 이다 — 칸 안에서는 구분선이 있으니 조금 줄인다
          const first = sigBody.firstElementChild;
          if (first) first.style.marginTop = '8px';
        } else {
          if (sigLabel) sigLabel.textContent = `${addr} 계정`;
          sigBody.innerHTML = `<div style="font-size:11.5px;color:#94a3b8;line-height:1.6;margin-top:4px">
              이 계정에는 서명 정보가 없어 <b>서명 없이 나갑니다</b>.
              [📬 메일 계정 관리]에서 이름·직함·회사·주소·전화·웹사이트를 채우면 여기에 붙습니다.
            </div>`;
        }
      })
      .catch((e) => {
        if (sigLabel) sigLabel.innerHTML = `<span style="color:#b91c1c">서명을 불러오지 못했습니다 — ${escapeHtml(String(e?.message || e))}</span>`;
      });
  }

  // ── AI 초안 생성 ──
  // 한국어로 적은 의도를 상대 언어 본문으로 바꿔 회신 상자에 채운다.
  // 발송은 하지 않는다 — 사람이 읽고 고친 뒤 [보내기] 를 눌러야 나간다.
  const draftBtn = root.querySelector('#convDraftBtn');
  draftBtn?.addEventListener('click', async () => {
    const intentEl = root.querySelector('#convDraftIntent');
    const msg = root.querySelector('#convReplyMsg');
    const intent = (intentEl?.value || '').trim();
    if (!intent) {
      msg.innerHTML = '<span style="color:#b91c1c">전달할 내용을 먼저 적어주세요</span>';
      intentEl?.focus();
      return;
    }
    draftBtn.disabled = true;
    draftBtn.textContent = '생성 중…';
    msg.innerHTML = '';
    try {
      const r = await safeJsonFetch('/api/mail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboundMailId: draftBtn.dataset.inboundId, intent }),
      });
      if (r.success) {
        // 회신 상자가 contenteditable 이라 .value 가 아니라 .innerHTML 로 넣는다.
        // 초안은 평문이므로 줄바꿈을 <br> 로 바꿔야 문단이 유지된다.
        const ta = root.querySelector('#convReplyBody');
        if (ta) ta.innerHTML = escapeHtml(r.draft.body || '').split('\n').join('<br>');
        const koBox = root.querySelector('#convDraftKo');
        if (koBox) {
          koBox.innerHTML = `
            <div style="font-size:10.5px;font-weight:800;color:#64748b;margin-bottom:6px">KR 한글 대역본 <span style="font-weight:400">· 검토용 · 발송되지 않음</span></div>
            <div style="white-space:pre-wrap">${escapeHtml(r.draft.bodyKo || '')}</div>
            ${r.draft.notes ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #cbd5e1;color:#b45309">
              <b>확인 필요</b> · ${escapeHtml(r.draft.notes)}</div>` : ''}`;
          koBox.removeAttribute('hidden');
        }
        msg.innerHTML = `<span style="color:#166534">✅ 초안 생성 (₩${r.krw || 0})</span>`;
      } else {
        msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(r.error || '실패')}</span>`;
      }
    } catch (e) {
      msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(String(e.message || e))}</span>`;
    }
    draftBtn.disabled = false;
    draftBtn.textContent = '🧠 초안 생성';
  });

  /**
   * 보낼 내용을 모은다 — [보내기] 와 [👁 미리보기] 가 **같은 값**을 서버에 넘겨야 미리보기를 믿을 수 있다.
   * 본문이 비었으면 null.
   */
  const collectReplyPayload = () => {
    const ta = root.querySelector('#convReplyBody');
    // 글자를 고르지 않고 글꼴·크기를 바꾸면 본문 **칸 자체**에 서식이 걸린다.
    // innerHTML 은 칸 안쪽만 담으므로 그대로 보내면 받는 쪽에는 기본 글꼴로 간다
    // (화면에서만 바뀌고 메일에는 안 가는 상태였다). 칸의 서식으로 한 번 감싸서 보낸다.
    let text = (ta?.innerHTML || '').trim();
    const wrapCss = [
      ta?.style.fontFamily ? `font-family:${ta.style.fontFamily}` : '',
      ta?.style.fontSize ? `font-size:${ta.style.fontSize}` : '',
    ].filter(Boolean).join(';');
    if (text && wrapCss) text = `<div style="${escapeAttr(wrapCss)}">${text}</div>`;
    // 서식 태그만 남고 글자가 없는 경우(빈 <br> 등)를 걸러낸다
    const plainLen = (ta?.innerText || '').trim().length;
    if (!plainLen) return null;
    return {
      inboundMailId: btn.dataset.inboundId,
      body: text,
      bodyIsHtml: true,   // 서식 편집기라 본문이 HTML 이다
      appendSignature: root.querySelector('#convReplySig')?.checked !== false,
    };
  };

  // ── 👁 미리보기 ──
  // 서버가 **실제 발송과 같은 함수**로 조립한 결과를 받아 보여준다 (api/mail/reply/preview — 메일을 보내지 않는다).
  const previewBtn = root.querySelector('#convReplyPreview');
  previewBtn?.addEventListener('click', async () => {
    const msg = root.querySelector('#convReplyMsg');
    const payload = collectReplyPayload();
    if (!payload) {
      msg.innerHTML = '<span style="color:#b91c1c">본문을 입력하면 미리 볼 수 있습니다</span>';
      return;
    }
    previewBtn.disabled = true;
    previewBtn.textContent = '만드는 중…';
    msg.innerHTML = '';
    try {
      const r = await safeJsonFetch('/api/mail/reply/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r || !r.success) {
        msg.innerHTML = `<span style="color:#b91c1c">미리보기 실패 — ${escapeHtml((r && r.error) || '')}</span>`;
        return;
      }
      openReplyPreviewModal(r.preview, () => btn.click());
    } catch (e) {
      msg.innerHTML = `<span style="color:#b91c1c">미리보기 실패 — ${escapeHtml(String(e.message || e))}</span>`;
    } finally {
      previewBtn.disabled = false;
      previewBtn.textContent = '👁 미리보기';
    }
  });

  btn.addEventListener('click', async () => {
    const msg = root.querySelector('#convReplyMsg');
    const payload = collectReplyPayload();
    if (!payload) {
      msg.innerHTML = '<span style="color:#b91c1c">본문을 입력하세요</span>';
      return;
    }
    btn.disabled = true;
    btn.textContent = '보내는 중…';
    msg.innerHTML = '';
    try {
      const r = await safeJsonFetch('/api/mail/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.success) {
        msg.innerHTML = `<span style="color:#166534">✅ ${r.dryRun ? '발송 시뮬레이션 완료' : '보냈습니다'}</span>`;
        // 타임라인을 다시 그려 방금 보낸 회신이 보이게 한다
        setTimeout(() => openConversationModal(leadId), 700);
        invalidateServerPage?.();
      } else {
        msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(r.error || '실패')}</span>`;
        btn.disabled = false;
        btn.textContent = '보내기';
      }
    } catch (e) {
      msg.innerHTML = `<span style="color:#b91c1c">${escapeHtml(String(e.message || e))}</span>`;
      btn.disabled = false;
      btn.textContent = '보내기';
    }
  });
}

/**
 * 👁 답장 미리보기 창 — **받는 사람 메일함에 보이는 모습 그대로**.
 *
 * 본문은 iframe 안에 그린다. 화면(CRM)의 글꼴·줄간격이 섞이면 실제 메일과 달라 보이고,
 * 반대로 메일 본문의 서식이 CRM 화면으로 새어 나오지도 않는다.
 * sandbox 에 스크립트 허용을 주지 않는다 — 본문에 무엇이 들어 있어도 실행되지 않는다.
 *
 * @param pv    서버(api/mail/reply/preview)가 조립한 결과
 * @param onSend [이대로 보내기] 를 누르면 부를 함수 — 원래 [보내기] 와 같은 경로로 보낸다
 */
function openReplyPreviewModal(pv, onSend) {
  document.getElementById('replyPreviewModal')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'replyPreviewModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.55);'
    + 'display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:28px 16px';

  const fromLine = pv.from?.name ? `${pv.from.name} <${pv.from.address}>` : (pv.from?.address || '');
  const orig = pv.inReplyTo || {};
  const origDate = orig.date ? new Date(orig.date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const row = (label, value) => `
    <div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;line-height:1.5">
      <span style="flex:0 0 74px;color:#64748b;font-weight:700">${label}</span>
      <span style="flex:1;min-width:0;color:#0f172a;word-break:break-all">${value}</span>
    </div>`;

  wrap.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="답장 미리보기"
         style="width:min(760px,100%);background:#ffffff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;background:#eff6ff;border-bottom:1px solid #bfdbfe">
        <b style="font-size:15px;color:#1e3a8a">👁 미리보기 — 이렇게 나갑니다</b>
        <span style="font-size:11.5px;color:#3b82f6">아직 보내지 않았습니다</span>
        <button type="button" data-rp-close title="닫기"
          style="margin-left:auto;border:none;background:none;font-size:20px;line-height:1;color:#64748b;cursor:pointer">×</button>
      </div>

      <div style="padding:10px 18px 4px">
        ${row('보내는 사람', escapeHtml(fromLine))}
        ${row('받는 사람', escapeHtml(pv.to || ''))}
        ${row('제목', `<b>${escapeHtml(pv.subject || '')}</b>`)}
        ${orig.subject ? row('답장 대상', `<span style="color:#475569">${escapeHtml(orig.subject)}</span>
          <span style="color:#94a3b8;font-size:11.5px"> · ${escapeHtml(orig.from || '')}${origDate ? ` · ${escapeHtml(origDate)}` : ''}</span>`) : ''}
        ${row('대화 연결', pv.threaded
          ? '<span style="color:#166534">✓ 상대 메일함에서 원래 메일과 같은 대화로 묶입니다</span>'
          : '<span style="color:#b45309">원래 메일 번호가 없어 새 메일처럼 보일 수 있습니다</span>')}
        ${row('서명', pv.signatureAppended
          ? '<span style="color:#166534">✓ 본문 아래에 붙습니다</span>'
          : '<span style="color:#b45309">붙지 않습니다</span>')}
      </div>

      <div style="padding:8px 18px 4px;font-size:11px;font-weight:800;color:#64748b">본문</div>
      <div style="margin:0 18px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff">
        <iframe data-rp-frame sandbox="allow-same-origin" title="답장 본문 미리보기"
          style="display:block;width:100%;height:320px;border:0;background:#ffffff"></iframe>
      </div>
      <div style="padding:6px 18px 0;font-size:11px;color:#94a3b8;line-height:1.6">
        받는 사람의 메일 프로그램(아웃룩·지메일 등)에 따라 글꼴이 조금 다르게 보일 수 있습니다.
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 18px;margin-top:10px;border-top:1px solid #e2e8f0;background:#f8fafc">
        <button type="button" data-rp-close
          style="padding:9px 16px;font-size:13px;font-weight:700;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;color:#334155;cursor:pointer">고치러 돌아가기</button>
        <button type="button" data-rp-send
          style="padding:9px 18px;font-size:13px;font-weight:800;border:none;border-radius:8px;background:#2563eb;color:#ffffff;cursor:pointer">이대로 보내기</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  // 본문 — 메일 클라이언트처럼 흰 바탕·기본 여백으로. 링크는 눌러도 이동하지 않는다(미리보기일 뿐이다).
  const frame = wrap.querySelector('[data-rp-frame]');
  const doc = `<!doctype html><html><head><meta charset="utf-8">
    <style>html,body{margin:0;background:#fff;color:#111827}body{padding:16px 18px;font-family:sans-serif;font-size:14px;line-height:1.6;word-break:break-word}
    img{max-width:100%}a{pointer-events:none}</style></head><body>${pv.html || ''}</body></html>`;
  frame.addEventListener('load', () => {
    try {
      const h = frame.contentDocument?.documentElement?.scrollHeight || 0;
      // 짧은 답장은 빈칸 없이, 긴 답장은 창 안에서 스크롤되게
      frame.style.height = `${Math.min(Math.max(h + 4, 160), Math.round(window.innerHeight * 0.55))}px`;
    } catch { /* 높이를 못 재도 기본 높이로 보인다 */ }
  });
  frame.srcdoc = doc;

  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-rp-close]').forEach((b) => b.addEventListener('click', close));
  wrap.querySelector('[data-rp-send]')?.addEventListener('click', () => {
    close();
    if (typeof onSend === 'function') onSend();
  });
}

/**
 * 메일 대화 보기 버튼 — 회사명 바로 아래에 둔다.
 *
 * 처음에는 Stage 칸에 넣었는데, 단계 이동 버튼들과 생김새가 같아 묻혔다.
 * 답장이 온 뒤부터는 "무슨 얘기가 오갔나" 를 보는 것이 주요 동작이므로
 * 회사명 옆에서 바로 눈에 띄어야 한다.
 */
function conversationButtonHtml(lead) {
  const stage = lead.stage || 'imported';
  if (!['contacted', 'replied', 'negotiating', 'partner'].includes(stage)) return '';

  const n = lead.inboundCount || 0;
  const hasReply = n > 0;

  // 답장이 온 건은 초록으로 채워 눈에 띄게, 아직 없는 건은 옅게
  const bg = hasReply ? '#16a34a' : '#f1f5f9';
  const fg = hasReply ? '#ffffff' : '#64748b';
  const bd = hasReply ? '#16a34a' : '#cbd5e1';
  const label = hasReply ? `답장 ${n}통 보기` : '보낸 메일 보기';
  const needsReply = lead.needsReply === true;

  return `
    <button type="button" class="conversation-btn" data-conv-lead="${escapeAttr(lead.leadId || lead.id)}"
      title="주고받은 메일 내용 보기"
      style="margin-top:5px;padding:4px 10px;font-size:11px;border:1px solid ${bd};border-radius:99px;
             background:${bg};color:${fg};font-weight:700;cursor:pointer;white-space:nowrap;
             display:inline-flex;align-items:center;gap:4px;
             ${hasReply ? 'box-shadow:0 1px 3px rgba(22,163,74,0.3)' : ''}">
      💬 ${label}${needsReply ? ' ⚠' : ''}
    </button>`;
}

function outreachApprovalCellHtml(lead) {
  // verified 단계에서만 승인 체크박스 노출
  const stage = lead.stage || 'imported';
  if (stage !== 'verified') {
    if (stage === 'contacted' || stage === 'replied' || stage === 'negotiating') {
      return `<span style="font-size:10px;color:#059669;background:#d1fae5;padding:2px 6px;border-radius:99px">✅ 발송됨</span>`;
    }
    if (stage === 'partner') {
      return `<span style="font-size:10px;color:#6b21a8;background:#f3e8ff;padding:2px 6px;border-radius:99px">⭐ 파트너</span>`;
    }
    return `<span style="font-size:10px;color:#9ca3af">—</span>`;
  }
  const on = lead.readyForOutreach === true;
  // white-space:nowrap 이 없으면 좁은 칸에서 "승/인/됨" 으로 세로로 쪼개진다
  return `
    <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:11.5px;
                  white-space:nowrap" onclick="event.stopPropagation()">
      <input type="checkbox" class="outreach-approval"
        data-approve-lead="${escapeAttr(lead.id)}"
        ${on ? 'checked' : ''}
        style="width:14px;height:14px;cursor:pointer;flex:none">
      <span style="color:${on ? '#166534' : '#6b7280'};font-weight:${on ? '700' : '400'}">
        ${on ? '승인됨' : '승인'}
      </span>
    </label>
  `;
}

// 상대 시간 포맷 ("3일 전" / "5시간 전")
function formatRelativeKo(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}달 전`;
  const year = Math.floor(day / 365);
  return `${year}년 전`;
}
function formatDateKo(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);  // YYYY-MM-DD
}

function updatedInfoBadgeHtml(lead) {
  // updatedInfoAt > stageChangedAt > registeredAt 우선순위로 가장 최근 활동 시각 표시
  const iso = lead.updatedInfoAt || lead.stageChangedAt || lead.registeredAt || lead.importedAt;
  if (!iso) return '';
  const rel = formatRelativeKo(iso);
  const abs = formatDateKo(iso);
  if (!rel) return '';
  // 오래된 정보 (30일 초과) 는 색상으로 강조
  const stale = (Date.now() - new Date(iso).getTime()) > 30 * 24 * 60 * 60 * 1000;
  const color = stale ? '#dc2626' : '#059669';
  const bg = stale ? '#fef2f2' : '#f0fdf4';
  return `<span class="update-badge" title="정보 업데이트: ${abs}"
    style="display:inline-block;font-size:10px;color:${color};background:${bg};border:1px solid ${color}20;padding:1px 6px;border-radius:99px;margin-top:2px;font-weight:500">
    🕒 ${rel}
  </span>`;
}

// 출처 배치 라벨 (검증완료/실패 페이지에서 각 행에 표시)
function sourceBatchBadgeHtml(lead) {
  const b = lead.importBatch;
  if (!b) return '';
  const m = String(b).match(/(\d{4})(\d{2})(\d{2})/);
  const dateLabel = m ? `${m[1].slice(2)}/${m[2]}/${m[3]}` : b;
  return `<span title="출처 배치: ${escapeAttr(b)}"
    style="display:inline-block;font-size:9px;color:#6366f1;background:#eef2ff;border:1px solid #a5b4fc40;padding:1px 6px;border-radius:99px;margin-top:2px;font-weight:500;margin-left:4px">
    📁 ${dateLabel}
  </span>`;
}

// rank: 추천순 정렬일 때만 넘어온다. null 이면 순위 칸을 그리지 않는다
// (다른 화면에서도 이 함수를 쓰므로 헤더에 순위 열이 없을 때 칸이 밀리면 안 된다)
function rowHtml(lead, rank) {
  const selected = lead.id === state.selectedId ? "selected" : "";
  const checked = state.selectedLeadIds.has(lead.id) ? "checked" : "";
  // 점수 자체보다 "왜 위인지"가 중요하다 — 근거를 툴팁으로 붙인다
  const rankCell = rank == null ? '' : `
      <td style="text-align:center;white-space:nowrap"
          title="${escapeAttr((lead.recoReasons || []).join(' · ') || '근거 없음')}">
        <div style="font-size:13px;font-weight:800;color:var(--text-primary)">${rank}</div>
        <div style="font-size:9.5px;color:var(--text-quaternary)">${lead.recoScore ?? '-'}점</div>
      </td>`;
  return `
    <tr data-id="${escapeHtml(lead.id)}" class="${selected}">
      <td>
        <input class="lead-select" data-select-lead="${escapeAttr(lead.id)}" type="checkbox" ${checked} aria-label="Select ${escapeAttr(lead.Company)}">
      </td>${rankCell}
      <td>
        <div class="company-cell">
          <strong>${escapeHtml(lead.Company)}</strong>
          <!-- 업종은 한국어본이 있으면 그걸 쓴다 (TypeKo). 없으면 원문.
               배치 날짜 배지(📁 26/09/08)는 뺐다 — 우리 쪽 관리용이라
               클라이언트가 보낼지 말지 판단하는 데는 쓰이지 않는데,
               회사명 바로 아래를 차지해 정작 업종이 안 보였다. -->
          <span class="meta-line">${escapeHtml(truncate(lead.TypeKo || lead.Type, 74))}</span>
          ${conversationButtonHtml(lead)}${updatedInfoBadgeHtml(lead)}
        </div>
      </td>
      <td style="font-size:12.5px;color:var(--text-secondary);line-height:1.35">${escapeHtml(lead.Region)}</td>
      <td class="cell-ellipsis" title="${escapeAttr(lead.Email || '')}">${emailCell(lead.Email)}</td>
      <!-- 홈페이지를 한눈에 보는 게 판단에 제일 크다 — 전화보다 앞에, 더 넓게. -->
      <td class="cell-ellipsis" title="${escapeAttr(lead.WebsiteContact || '')}">${websiteLinkHtml(lead.WebsiteContact, { short: true })}</td>
      <!-- 전화번호에 "+48 222 662 877 (B2B/wholesale) / +48 22 602 28 32 (retail…)"
           같은 긴 값이 들어와 표를 옆으로 밀어냈다. 잘라 보여주고 전체는 툴팁으로. -->
      <td class="cell-ellipsis" style="font-size:12px;color:var(--text-tertiary)"
          title="${escapeAttr(lead.Phone || '')}">${escapeHtml(lead.Phone || '—')}</td>
      <!-- 단계 이동 —— 클라이언트가 "이 업체는 아닌데" 싶을 때 여기서 넘긴다.
           Stage 열을 뺄 때 같이 사라졌던 기능이라 되살렸다. -->
      <td>${stageCellHtml(lead)}</td>
    </tr>
  `;
}

// 팝업으로 열어본 리드를 담아두는 곁방 캐시.
//
// baseLeads 는 현재 파이프라인 화면에 보이는 리드만 담는다. 여기에 보관함
// 리드를 밀어 넣으면 상단 통계·필터 숫자가 같이 틀어지므로 섞지 않는다.
// 상세 팝업만 이 캐시를 함께 뒤진다.
var _popupLeadCache = [];

function getLeads() {
  return baseLeads.filter(lead => !lead.deleted);
}

/**
 * 지금 화면이 알고 있는 리드 전부.
 *
 * getLeads() 는 baseLeads(브라우저가 통째로 받아둔 배열)만 본다. 그런데
 * 검증 완료·검증 실패·답장 받음·대화 진행 중·파트너십은 목록을 **서버에서
 * 페이지로** 받아오고, 그 결과는 baseLeads 가 아니라 _serverPageCache 에 들어간다.
 *
 * 첫 로딩에서 전체 리드(3.3MB)를 안 받게 바꾼 뒤, baseLeads 만 보던 기능들이
 * 줄줄이 조용히 멈췄다 — 팝업 저장, 선택 삭제, 중복 판정, 미리보기 회사 목록…
 * 오류도 안 나고 알림도 없어서 "눌렀는데 왜 그대로지" 로만 보인다.
 *
 * 목록을 만들거나 리드를 찾을 때는 이걸 쓴다.
 * (한 건만 찾을 때는 findLeadForPopup 이 같은 범위를 훑는다)
 */
function allKnownLeads() {
  const out = [];
  const seen = new Set();
  // 아래 var 들의 대입보다 먼저 불릴 수 있다 (findLeadForPopup 주석 참고)
  const sources = [
    typeof baseLeads !== 'undefined' ? baseLeads : [],
    _serverPageCache?.leads || [],
    typeof _popupLeadCache !== 'undefined' ? _popupLeadCache : [],
  ];
  for (const src of sources) {
    for (const l of src) {
      if (!l || l.deleted || seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(l);
    }
  }
  return out;
}

/**
 * 상세 팝업이 찾는 범위.
 *
 * ⚠️ baseLeads 만 보면 안 된다.
 * 검증 완료·답장 받음 같은 화면은 목록을 **서버에서 페이지로** 받아오고,
 * 그 결과는 baseLeads 가 아니라 _serverPageCache.leads 에 들어간다.
 * baseLeads 만 뒤지면 지금 화면에 보이는 회사를 눌러도 못 찾아서
 * 팝업이 아예 안 뜬다 (첫 로딩에서 전체 리드를 안 받게 한 뒤 드러났다).
 *
 * 그래서 세 곳을 다 본다 — 로컬 캐시 · 지금 화면의 서버 페이지 · 팝업으로 열어본 것.
 */
function findLeadForPopup(id) {
  if (!id) return null;
  // ?. 와 || [] 를 쓰는 이유:
  // init() 이 파일 위쪽에서 먼저 돌아서, 아래에 있는 var 들의 **대입이 아직
  // 실행되기 전에** 이 함수가 불린다 (선언은 끌어올려지지만 값은 undefined).
  // 방어가 없으면 첫 렌더에서 "Cannot read properties of undefined (reading 'find')"
  // 로 화면이 통째로 죽는다.
  return (typeof baseLeads !== 'undefined' ? baseLeads : [])
        .find(l => l && !l.deleted && l.id === id)
      || (_serverPageCache?.leads || []).find(l => l && l.id === id)
      || (typeof _popupLeadCache !== 'undefined' ? _popupLeadCache : [])
        .find(l => l && l.id === id)
      || null;
}

/**
 * leadId 든 _id 든 받아서 상세 팝업을 띄운다.
 * 화면 목록에 없는 리드(보관함·기존 데이터)도 열 수 있다.
 */
async function openLeadPopupByObjectId(oid, fallbackLeadId) {
  const cached = fallbackLeadId ? findLeadForPopup(fallbackLeadId) : null;
  if (cached) { openEditModal(cached.id); return; }
  try {
    const r = await safeJsonFetch(`/api/leads/${oid}`);
    if (!r?.lead) throw new Error('리드를 찾을 수 없습니다');
    const lead = { ...r.lead, id: r.lead.leadId };
    _popupLeadCache = _popupLeadCache.filter(l => l.id !== lead.id).concat(lead);
    openEditModal(lead.id);
  } catch (e) {
    alert(`불러오기 실패: ${e.message || e}`);
  }
}

// ── Stage 변경 핸들러 ───────────────────────────────────────
async function handleStageChange(leadId, newStage, selectEl) {
  // ⚠️ baseLeads 만 보면 안 된다.
  // 표가 서버 페이지로 그려지는 화면(검증 완료·검증 실패·답장 받음)에서는
  // 그 배열이 비어 있어서, 행의 [→ 발송 리스트]·[→ 검증 실패] 버튼을 눌러도
  // 여기서 조용히 return 되어 **아무 일도 일어나지 않았다**.
  // 오류도 안 나고 알림도 없어서 "눌렀는데 왜 그대로지" 가 된다.
  const lead = findLeadForPopup(leadId);
  if (!lead) {
    alert('이 업체를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    return;
  }
  if (!lead._id) {
    alert('이 업체는 여기서 단계를 옮길 수 없습니다 (내부 번호 없음).');
    return;
  }

  // ── 안전 게이트: 이메일 컨택 이동 시 실제 이메일 필수 ─────────
  // 이메일 컨택 = B2B 메일 발송 준비 상태. 메일 없으면 발송 불가 → 이동 자체 차단
  if (newStage === 'contacted') {
    const email = (lead.Email || '').trim();
    const isValid = email && !/^Not found/i.test(email) && /@/.test(email);
    if (!isValid) {
      alert(
        `❌ 이메일 컨택으로 이동 불가\n\n` +
        `"${lead.Company}" 리드에 유효한 이메일이 없습니다.\n\n` +
        `해결책:\n` +
        `1) 검증완료 페이지에서 "🔍 메일 크롤링" 실행\n` +
        `2) 리드 편집으로 이메일 수동 입력\n` +
        `3) 이메일 확보 불가면 검증실패로 이동`
      );
      // 드롭다운이면 원래 값으로 복원
      if (selectEl && selectEl.tagName === 'SELECT') {
        selectEl.value = lead.stage || 'imported';
      }
      return;
    }
  }

  const oldStage = lead.stage || 'imported';
  const oldStyle = STAGE_STYLE[oldStage];
  // 누른 티를 낸다.
  //
  // 예전에는 실패해도 아무 표시가 없어서 "눌렀는데 왜 그대로지" 가 됐다.
  // 서버에 다녀오는 동안 버튼이 눌린 상태로 보이면, 적어도 눌리긴 했다는 걸 안다.
  const restoreBtn = (() => {
    if (!selectEl) return () => {};
    const wasHtml = selectEl.tagName === 'SELECT' ? null : selectEl.innerHTML;
    selectEl.style.opacity = '0.55';
    selectEl.disabled = true;
    if (wasHtml !== null) selectEl.innerHTML = '⏳ 옮기는 중';
    return () => {
      selectEl.disabled = false;
      selectEl.style.opacity = '1';
      if (wasHtml !== null) selectEl.innerHTML = wasHtml;
    };
  })();
  try {
    const res = await fetch(`/api/leads/${lead._id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'stage 변경 실패');
    // 로컬 상태 동기화
    lead.stage = data.data.stage;
    lead.stageChangedAt = data.data.stageChangedAt;
    if (data.data.becamePartnerAt) lead.becamePartnerAt = data.data.becamePartnerAt;
    if (typeof data.data.readyForOutreach === 'boolean') lead.readyForOutreach = data.data.readyForOutreach;

    // ⚠️ 이 두 줄이 없으면 "옮겼는데 그대로 남아 있다" 가 된다.
    //
    // 답장 받음·대화 진행 중 같은 화면은 목록을 서버에서 받아 캐시해 둔다.
    // 위에서 고친 것은 브라우저가 들고 있는 배열(baseLeads)뿐이라,
    // 캐시를 비우지 않으면 render() 가 옛 응답을 그대로 다시 그린다.
    // 새로고침을 해야만 사라지던 원인이 이것이다.
    invalidateServerPage();
    loadStageCounts(true);   // 사이드바 숫자도 같이 맞춘다

    render();
  } catch (e) {
    // 실패를 반드시 보여준다. 조용히 끝나면 "눌렀는데 그대로" 가 된다.
    alert(`옮기지 못했습니다: ${e.message || 'unknown'}\n\n화면을 새로고침한 뒤 다시 시도해 주세요.`);
    restoreBtn();
    if (selectEl && selectEl.tagName === 'SELECT') selectEl.value = oldStage;
  }
}

// ── 발송 승인 토글 ─────────────────────────────────────────
async function handleOutreachApproval(leadId, on) {
  const lead = findLeadForPopup(leadId);   // 서버 페이지 화면에서도 찾히게
  if (!lead || !lead._id) return;
  try {
    const res = await fetch(`/api/leads/${lead._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readyForOutreach: on }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'approval failed');
    lead.readyForOutreach = on;
    // 라벨 즉시 갱신 (전체 재렌더 최소화)
    render();
  } catch (e) {
    alert(`승인 상태 변경 실패: ${e.message || 'unknown'}`);
    render();
  }
}

// 검증 버킷 매칭
//   즐겨찾기                       → passed (대표 직접 검증)
//   사업관련성 ✅ + 컨택 수단 1+   → passed
//     (이메일/전화/LinkedIn 중 한 개라도 통과해야 실제 접근 가능)
//   종합 5점                       → passed
//   종합 3~4점                     → suspicious
//   종합 0~2점                     → invalid
//   미검증                         → unverified
function verifyBucketOf(lead) {
  // 즐겨찾기는 대표가 직접 확인한 리드 — 자동 검증과 무관하게 통과 처리
  if (lead?.favorite === true) return 'passed';
  const v = lead?.verification;
  if (!v || !v.verifiedAt) return 'unverified';
  // 사업관련성 ✅ 로 통과 처리하려면:
  //   (1) 실제로 사이트에 접근해서 분석한 결과여야 (websiteAlive=true)
  //   (2) 이메일/전화/LinkedIn 중 1개라도 통과 (컨택 가능)
  // 사이트 health 가 false / null 이면 분석 자체가 의심스러우므로 점수 경로로 떨어뜨림
  if (v.businessLevel === 'relevant' && v.websiteAlive === true) {
    const hasContact =
      v.emailValid === true ||
      v.phoneMatch === true ||
      v.linkedinValid === true;
    if (hasContact) return 'passed';
  }
  const s = typeof v.score === 'number' ? v.score : 0;
  if (s >= 5) return 'passed';
  if (s >= 3) return 'suspicious';
  return 'invalid';
}
function verifyBucketMatches(lead, filter) {
  if (!filter || filter === 'All') return true;
  return verifyBucketOf(lead) === filter;
}

// 실패 사유 코드 → 사용자 친화 한국어
const VERIFY_REASON_KO = {
  // email
  'syntax': '형식 오류',
  'disposable': '일회용 메일',
  'no-mx': 'MX 레코드 없음',
  'mx-timeout': 'DNS 타임아웃',
  'mx-error': '도메인 조회 실패',
  // phone
  'too-short': '번호 너무 짧음',
  'unknown-region': '지역 미매핑',
  // linkedin
  'format': 'URL 형식 오류',
  // business relevance
  'no-url': '사이트 없음',
  'fetch-failed': '사이트 접근 실패',
  'invalid-url': 'URL 형식 오류',
  'empty-content': '본문 비어있음',
  // common
  'empty': '값 없음',
};
function businessLevelLabel(level) {
  return level === 'relevant' ? '✅ 뷰티 관련' :
         level === 'unclear'  ? '⚠ 모호함' :
         level === 'unrelated'? '❌ 무관' :
         '⏳ 미확인';
}
function reasonKo(raw) {
  if (!raw) return '';
  if (VERIFY_REASON_KO[raw]) return VERIFY_REASON_KO[raw];
  // "expected +82" 같은 동적 메시지는 그대로 표시
  if (raw.startsWith('expected +')) return `예상 지역코드 ${raw.replace('expected ', '')}`;
  return raw;
}

// 리드 하나의 모든 실패 사유 — [{label, reason}] 형태로 반환
function verifyFailures(lead) {
  // 즐겨찾기 = 대표 검증 완료 — 실패 사유 노출 안 함
  if (lead?.favorite === true) return [];
  const v = lead?.verification;
  if (!v || !v.verifiedAt) return [];
  const out = [];
  if (v.emailValid === false) {
    out.push({ label: '이메일', reason: reasonKo(v.emailReason) || '실패' });
  }
  if (v.websiteAlive === false) {
    const status = v.websiteStatus ? ` (HTTP ${v.websiteStatus})` : ' (응답 없음)';
    out.push({ label: '사이트', reason: '연결 실패' + status });
  }
  if (v.phoneMatch === false) {
    out.push({ label: '전화', reason: reasonKo(v.phoneReason) || '지역코드 불일치' });
  }
  if (v.linkedinValid === false) {
    out.push({ label: 'LinkedIn', reason: reasonKo(v.linkedinReason) || '실패' });
  }
  // 사업 관련성 — 무관/모호도 실패로 분류해 사용자에게 노출
  // 단, 사이트 자체가 없는(no-url) 경우는 웹사이트 체크와 중복이므로 노출 안 함
  if (v.businessLevel === 'unrelated') {
    out.push({ label: '사업관련성', reason: '뷰티 키워드 없음' });
  } else if (v.businessLevel === 'unclear') {
    out.push({ label: '사업관련성', reason: '뷰티 신호 약함' });
  } else if (v.businessLevel === null && v.businessReason && v.businessReason !== 'no-url') {
    out.push({ label: '사업관련성', reason: reasonKo(v.businessReason) });
  }
  return out;
}

// 뱃지 HTML — 테이블 셀에서 사용. invalid/suspicious 면 짧은 사유 같이 표시
// 한국 기업 판별
function isKoreanCompany(region) {
  if (!region) return false;
  const c = String(region);
  return /korea|한국|대한민국/i.test(c) && !/north/i.test(c);
}

// AI 검증 결과 첫 문장 (요약) — 40자 내외로 자르되 단어 경계에서
function summarizeReasoning(text, max = 60) {
  if (!text) return '';
  const s = String(text).trim();
  // 첫 문장 우선
  const firstSentence = s.split(/[.!?。]/)[0].trim();
  const base = firstSentence.length > 10 ? firstSentence : s;
  if (base.length <= max) return base;
  return base.slice(0, max).replace(/\s\S*$/, '') + '…';
}

// AI 판정 배지 — verify-ai 결과 + 검증 시각 + 왜 그렇게 판정됐는지 사유 요약
function aiVerdictBadgeHtml(lead) {
  const v = lead?.verification || {};
  const verifiedAt = v.aiVerifiedAt;
  const relTime = verifiedAt ? formatRelativeKo(verifiedAt) : null;
  const absTime = verifiedAt ? formatDateKo(verifiedAt) : null;

  // ── (a) AI 미검증 리드 — 왜 검증 안됐는지 사유 표시 ────────
  if (!verifiedAt) {
    // 한국 기업이면 정책 제외
    if (isKoreanCompany(lead?.Region)) {
      return `<div style="margin-top:3px;display:flex;flex-direction:column;gap:2px;align-items:flex-start"
        title="한국 기업은 자동 검증에서 제외되어 있음">
        <span style="display:inline-block;padding:1px 6px;border-radius:99px;background:#fef2f2;color:#991b1b;font-size:10px;font-weight:700;border:1px solid #fca5a540">
          ⚠️ 불일치
        </span>
        <span style="font-size:9px;color:var(--text-tertiary);font-weight:500;line-height:1.3">
          🇰🇷 한국 기업 (정책 제외)
        </span>
      </div>`;
    }
    // 나머지 = AI 실행 안 됨 → 대기 상태
    return `<div style="margin-top:3px;display:flex;flex-direction:column;gap:2px;align-items:flex-start"
      title="AI 검증 아직 실행 안 됨. 검증 대기 페이지에서 AI 실행 필요">
      <span style="display:inline-block;padding:1px 6px;border-radius:99px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;border:1px solid #cbd5e140">
        ⏳ AI 대기
      </span>
      <span style="font-size:9px;color:var(--text-tertiary);font-weight:500;line-height:1.3">
        검증 실행 필요
      </span>
    </div>`;
  }

  // ── (b) AI 판정 있는 리드 — 판정 + 사유 요약 ──────────────
  const verdict = v.aiVerdict;
  const conf = v.aiConfidence;
  const fullReasoning = v.aiReasoning || '';
  const briefReasoning = summarizeReasoning(fullReasoning, 60);
  const style = {
    'target-fit': { bg: '#dcfce7', fg: '#166534', bd: '#22c55e', label: '🧠 규모 적합' },
    'maybe':        { bg: '#fef3c7', fg: '#92400e', bd: '#f59e0b', label: '🧠 모호' },
    'not-fit':    { bg: '#fee2e2', fg: '#991b1b', bd: '#ef4444', label: '🧠 무관' },
  }[verdict] || { bg: '#f1f5f9', fg: '#475569', bd: '#94a3b8', label: '🧠 AI 검증됨' };

  // '검증 완료' 는 이제 단계 이름이라 여기서 쓰면 "그 단계로 갔다"는 뜻으로 읽힌다
  const tip = `AI 판정: ${verdict || '?'} (${conf || '?'})\n검증 시각: ${absTime || '?'}\n\n${fullReasoning}`;

  return `<div style="margin-top:3px;display:flex;flex-direction:column;gap:2px;align-items:flex-start" title="${escapeAttr(tip)}">
    <span style="display:inline-block;padding:1px 6px;border-radius:99px;background:${style.bg};color:${style.fg};font-size:10px;font-weight:700;border:1px solid ${style.bd}40">${style.label}</span>
    ${briefReasoning ? `<span style="font-size:9px;color:var(--text-tertiary);font-weight:500;line-height:1.3;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(fullReasoning)}">💬 ${escapeHtml(briefReasoning)}</span>` : ''}
    ${relTime ? `<span style="font-size:9px;color:var(--text-tertiary);font-weight:500">📅 ${relTime}</span>` : ''}
  </div>`;
}

function verifyBadgeHtml(lead) {
  // 즐겨찾기는 별도 라벨 — 대표 직접 검증
  if (lead?.favorite === true) {
    return `<span title="대표가 직접 확인한 리드 (즐겨찾기 등록)" style="display:inline-block;padding:2px 8px;border-radius:99px;background:#fef9c3;color:#854d0e;font-size:11px;font-weight:700;white-space:nowrap;border:1px solid #facc15">⭐ 검증완료</span>${aiVerdictBadgeHtml(lead)}`;
  }

  const bucket = verifyBucketOf(lead);
  const styles = {
    passed:      { bg: '#dcfce7', fg: '#166534', label: '✅ 통과' },
    suspicious:  { bg: '#fef3c7', fg: '#92400e', label: '⚠ 의심' },
    invalid:     { bg: '#fee2e2', fg: '#991b1b', label: '❌ 무효' },
    unverified:  { bg: '#f1f5f9', fg: '#64748b', label: '⏳ 미검증' },
  }[bucket];

  const failures = verifyFailures(lead);
  const tooltip = failures.length
    ? `점수 ${lead?.verification?.score ?? '-'}/5\n실패: ${failures.map(f => `${f.label}(${f.reason})`).join(', ')}`
    : `검증 점수: ${lead?.verification?.score ?? '-'}/5`;

  const badge = `<span title="${escapeAttr(tooltip)}" style="display:inline-block;padding:2px 8px;border-radius:99px;background:${styles.bg};color:${styles.fg};font-size:11px;font-weight:600;white-space:nowrap">${styles.label}</span>`;

  // AI 판정 배지 (있는 경우) 를 항상 아래에 표시
  const ai = aiVerdictBadgeHtml(lead);

  // suspicious / invalid 만 짧은 사유 라벨 같이 표시 (테이블에서 한눈에)
  if (bucket === 'suspicious' || bucket === 'invalid') {
    const labels = failures.slice(0, 2).map(f => f.label).join(', ');
    const more = failures.length > 2 ? ` +${failures.length - 2}` : '';
    if (labels) {
      return `${badge}<div style="font-size:10px;color:#6b7280;margin-top:3px;line-height:1.2">${escapeHtml(labels)}${more}</div>${ai}`;
    }
  }
  return badge + ai;
}

// 검증 분류 뷰 — 4개 버킷별로 섹션 카드 + 각 섹션에 대표 리드 상위 10개
function renderVerificationClassification() {
  const all = getLeads();
  const buckets = { passed: [], suspicious: [], invalid: [], unverified: [] };
  for (const l of all) buckets[verifyBucketOf(l)].push(l);

  const sections = [
    { key: 'passed',     label: '✅ 통과 (모든 항목 정상)',   bg: '#dcfce7', fg: '#166534', accent: '#22c55e' },
    { key: 'suspicious', label: '⚠ 의심 (일부 항목 실패)',     bg: '#fef3c7', fg: '#92400e', accent: '#f59e0b' },
    { key: 'invalid',    label: '❌ 무효 (대부분 실패)',       bg: '#fee2e2', fg: '#991b1b', accent: '#ef4444' },
    { key: 'unverified', label: '⏳ 미검증 (아직 검사 안 됨)', bg: '#f1f5f9', fg: '#64748b', accent: '#94a3b8' },
  ];

  const renderPreview = (bucket, items) => {
    if (items.length === 0) {
      return `<p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;padding:16px 0">해당 항목이 없습니다</p>`;
    }
    const preview = items.slice(0, 6).map((lead) => {
      const failures = verifyFailures(lead);
      const failText = failures.length
        ? failures.slice(0, 2).map(f => `${f.label}(${f.reason})`).join(' · ')
        : '';
      return `
        <button type="button" data-verify-lead-id="${escapeAttr(lead.id)}"
          style="display:block;width:100%;text-align:left;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;margin-bottom:6px;cursor:pointer;font-size:13px">
          <strong>${escapeHtml(lead.Company || '(이름 없음)')}</strong>
          <span style="color:#9ca3af;margin-left:6px">${escapeHtml(lead.Region || '')}</span>
          ${failText ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(failText)}</div>` : ''}
        </button>
      `;
    }).join('');
    const more = items.length > 6
      ? `<button type="button" data-verify-bucket-jump="${bucket}" style="width:100%;padding:6px;font-size:12px;color:#4f8cff;background:transparent;border:1px dashed #cbd5e1;border-radius:6px;cursor:pointer;margin-top:4px">+ 나머지 ${items.length - 6}건 전체 보기 →</button>`
      : `<button type="button" data-verify-bucket-jump="${bucket}" style="width:100%;padding:6px;font-size:12px;color:#4f8cff;background:transparent;border:1px dashed #cbd5e1;border-radius:6px;cursor:pointer;margin-top:4px">목록 전체 보기 →</button>`;
    return preview + more;
  };

  els.content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
      ${sections.map(sec => `
        <section style="background:${sec.bg};border:1px solid ${sec.accent};border-radius:12px;padding:14px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <strong style="color:${sec.fg};font-size:14px">${sec.label}</strong>
            <span style="color:${sec.fg};font-size:18px;font-weight:800">${buckets[sec.key].length}</span>
          </div>
          ${renderPreview(sec.key, buckets[sec.key])}
        </section>
      `).join('')}
    </div>
  `;

  // 개별 리드 클릭 → edit 모달
  els.content.querySelectorAll('[data-verify-lead-id]').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.verifyLeadId));
  });

  // "전체 보기" → leads 뷰 + 해당 버킷 필터
  els.content.querySelectorAll('[data-verify-bucket-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = 'leads';
      resetAllFilters();
      state.verify = btn.dataset.verifyBucketJump;
      if (els.verify) els.verify.value = state.verify;
      state.selectedId = getFilteredLeads()[0]?.id || state.selectedId;
      render();
    });
  });
}

// K-beauty 추천 리스트 — 글로벌 발굴 시드 표시 + 선택 후 leads 로 import
var _recommendedCache = null;
// ── Phase 1 스켈레톤: B2B 메일 관리 ──────────────────────────
// ══════════════════════════════════════════════════════════════
// B2B 메일 매니저 — 템플릿 CRUD + 변수 치환 + 리드 대입 미리보기
// ══════════════════════════════════════════════════════════════

const DEFAULT_TEMPLATE_EDITOR = {
  name: '',
  language: 'en',
  subject: '',
  body: '',
  purpose: 'intro',
  bodyIsHtml: false,
  isActive: true,
  appendAccountSignature: true,   // 발송 시 계정 서명 자동 부착
  attachments: [],                // [{ name, url }] — 보낼 때 서버가 주소에서 받아 붙인다
};

async function loadEmailTemplates() {
  try {
    const res = await fetch('/api/email-templates');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'load failed');
    state.email.templates = data.templates || [];
    state.email.variables = data.variables || [];
    state.email.variableGroups = data.variableGroups || [
      { key: 'recipient', label: '받는 사람', icon: '👤', color: '#0ea5e9' },
      { key: 'company',   label: '상대 회사', icon: '🏢', color: '#8b5cf6' },
      { key: 'sender',    label: '발송자 정보', icon: '✉',  color: '#059669' },
    ];
  } catch (e) {
    console.error('[templates] load failed', e);
    state.email.templates = [];
    state.email.variables = [];
    state.email.variableGroups = [];
  }
}

function selectTemplate(templateId) {
  if (state.email.dirty) {
    if (!confirm('편집 중인 내용이 있습니다. 저장하지 않고 다른 템플릿으로 이동할까요?')) return;
  }
  state.email.currentTemplateId = templateId;
  state.email.dirty = false;
  state.email.previewResult = null;
  if (templateId) {
    const t = state.email.templates.find(x => x._id === templateId);
    if (t) {
      state.email.editor = {
        name: t.name || '',
        language: t.language || 'en',
        subject: t.subject || '',
        body: t.body || '',
        purpose: t.purpose || 'intro',
        bodyIsHtml: !!t.bodyIsHtml,
        isActive: t.isActive !== false,
        appendAccountSignature: t.appendAccountSignature !== false,
        attachments: (t.attachments || []).map((a) => ({ name: a.name || '', url: a.url })),
      };
    }
  } else {
    state.email.editor = { ...DEFAULT_TEMPLATE_EDITOR };
  }
  renderB2BEmailManager();
}

function startNewTemplate() {
  if (state.email.dirty) {
    if (!confirm('편집 중인 내용이 있습니다. 그대로 새 템플릿을 시작할까요?')) return;
  }
  state.email.currentTemplateId = null;
  state.email.editor = { ...DEFAULT_TEMPLATE_EDITOR, name: '' };
  state.email.dirty = false;
  state.email.previewResult = null;
  state.email.wizardStep = 1;
  renderB2BEmailManager();
}

async function saveTemplate() {
  const ed = state.email.editor;
  if (!ed) return;
  if (!ed.name.trim() || !ed.subject.trim() || !ed.body.trim()) {
    alert('이름, 제목, 본문은 필수입니다.');
    return;
  }
  state.email.loading = true;
  renderB2BEmailManager();
  try {
    const url = state.email.currentTemplateId
      ? `/api/email-templates/${state.email.currentTemplateId}`
      : '/api/email-templates';
    const method = state.email.currentTemplateId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ed),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'save failed');
    await loadEmailTemplates();
    state.email.currentTemplateId = data.template._id;
    state.email.dirty = false;
    // 저장하면 목록으로 — 여러 양식을 오가며 관리하는 화면이라
    // 편집기에 머무르면 "저장이 됐나" 를 목록에서 확인할 수 없다.
    state.email.mode = 'list';
  } catch (e) {
    alert('저장 실패: ' + (e.message || 'unknown'));
  } finally {
    state.email.loading = false;
    renderB2BEmailManager();
  }
}

async function deleteTemplate() {
  if (!state.email.currentTemplateId) return;
  const t = state.email.templates.find(x => x._id === state.email.currentTemplateId);
  if (!t) return;
  if (!confirm(`템플릿 "${t.name}"을(를) 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
  try {
    const res = await fetch(`/api/email-templates/${state.email.currentTemplateId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'delete failed');
    await loadEmailTemplates();
    state.email.currentTemplateId = null;
    state.email.editor = { ...DEFAULT_TEMPLATE_EDITOR };
    state.email.dirty = false;
    renderB2BEmailManager();
  } catch (e) {
    alert('삭제 실패: ' + (e.message || 'unknown'));
  }
}

async function refreshPreview() {
  if (!state.email.currentTemplateId) {
    // 저장 안 된 새 템플릿은 로컬 렌더링 (변수 예시 값으로)
    const ed = state.email.editor;
    if (!ed) return;
    const example = {};
    for (const v of state.email.variables) example[v.key] = v.example;
    const renderLocal = (s) => s.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k) => example[k] || `{{${k}}}`);
    state.email.previewResult = {
      subject: renderLocal(ed.subject),
      body: renderLocal(ed.body),
      bodyIsHtml: ed.bodyIsHtml,
      missing: [],
      leadInfo: null,
    };
    renderB2BEmailManager();
    return;
  }
  try {
    const res = await fetch(`/api/email-templates/${state.email.currentTemplateId}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: state.email.previewLeadId, mailAccountId: state.email.previewAccountId || null }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'preview failed');
    state.email.previewResult = data;
    renderB2BEmailManager();
  } catch (e) {
    alert('미리보기 실패: ' + (e.message || 'unknown'));
  }
}

function insertVariableIntoBody(varKey) {
  const ta = document.getElementById('templateBodyInput');
  if (!ta) return;
  const insertText = `{{${varKey}}}`;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = ta.value.substring(0, start);
  const after = ta.value.substring(end);
  ta.value = before + insertText + after;
  state.email.editor.body = ta.value;
  state.email.dirty = true;
  const pos = start + insertText.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
}

function insertVariableIntoSubject(varKey) {
  const inp = document.getElementById('templateSubjectInput');
  if (!inp) return;
  const insertText = `{{${varKey}}}`;
  const start = inp.selectionStart || inp.value.length;
  const end = inp.selectionEnd || inp.value.length;
  const before = inp.value.substring(0, start);
  const after = inp.value.substring(end);
  inp.value = before + insertText + after;
  state.email.editor.subject = inp.value;
  state.email.dirty = true;
  const pos = start + insertText.length;
  inp.focus();
  inp.setSelectionRange(pos, pos);
}

// ── 자동완성 (typeahead) ─────────────────────────────
// 사용법: 본문에서 "{{" 를 타이핑하면 한글 라벨 드롭다운 표시
// 화살표 ↑/↓ 로 이동 · Enter 선택 · Esc 닫기 · 클릭 선택
var _varSuggest = { el: null, ta: null, items: [], active: 0, triggerPos: -1 };

function ensureSuggestBox() {
  if (_varSuggest.el && document.body.contains(_varSuggest.el)) return _varSuggest.el;
  const box = document.createElement('div');
  box.id = 'varSuggestBox';
  box.style.cssText = `
    position:fixed;z-index:9999;min-width:220px;max-width:320px;
    background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;
    box-shadow:0 6px 20px rgba(0,0,0,0.15);
    padding:6px;display:none;font-family:inherit;
  `;
  document.body.appendChild(box);
  _varSuggest.el = box;
  return box;
}

function hideSuggest() {
  if (_varSuggest.el) _varSuggest.el.style.display = 'none'; syncBodyScrollLock();
  _varSuggest.items = [];
  _varSuggest.triggerPos = -1;
}

function renderSuggest() {
  const box = ensureSuggestBox();
  const groupsMap = {};
  (state.email.variableGroups || []).forEach(g => { groupsMap[g.key] = g; });
  box.innerHTML = _varSuggest.items.map((v, i) => {
    const grp = groupsMap[v.group] || { icon: '📎', color: '#6366f1' };
    const bg = i === _varSuggest.active ? '#eef2ff' : '#ffffff';
    const bd = i === _varSuggest.active ? '#a5b4fc' : 'transparent';
    return `
      <div class="var-suggest-item" data-idx="${i}" data-key="${escapeAttr(v.key)}"
        style="padding:8px 10px;border-radius:8px;cursor:pointer;background:${bg};border:1px solid ${bd};
               display:flex;align-items:center;gap:10px;transition:all 0.05s">
        <span style="font-size:16px">${grp.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#0f172a;line-height:1.2">${escapeHtml(v.label)}</div>
          <div style="font-size:10px;color:#64748b;font-family:'Menlo',monospace;margin-top:1px">{{${escapeHtml(v.key)}}}</div>
        </div>
      </div>
    `;
  }).join('');
  box.querySelectorAll('.var-suggest-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      _varSuggest.active = parseInt(el.dataset.idx, 10);
      renderSuggest();
    });
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pickSuggest(parseInt(el.dataset.idx, 10));
    });
  });
}

function positionSuggestBox(ta) {
  const box = ensureSuggestBox();
  const rect = ta.getBoundingClientRect();
  box.style.display = 'block';
  const boxH = box.offsetHeight || 260;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  // 아래 공간이 부족하면 위로
  const top = (spaceBelow < boxH + 12 && spaceAbove > boxH + 12)
    ? Math.max(8, rect.top - boxH - 6)
    : rect.bottom + 4;
  box.style.left = Math.max(8, Math.min(window.innerWidth - 340, rect.left)) + 'px';
  box.style.top = top + 'px';
}

function pickSuggest(idx) {
  const ta = _varSuggest.ta;
  if (!ta || !_varSuggest.items[idx]) { hideSuggest(); return; }
  const v = _varSuggest.items[idx];
  const cursor = ta.selectionStart;
  const before = ta.value.substring(0, _varSuggest.triggerPos);
  const after = ta.value.substring(cursor);
  const insert = `{{${v.key}}}`;
  ta.value = before + insert + after;
  state.email.editor.body = ta.value;
  state.email.dirty = true;
  const pos = before.length + insert.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  hideSuggest();
}

function updateSuggest(ta) {
  const cursor = ta.selectionStart;
  const text = ta.value.substring(0, cursor);
  // "{{" 이후 커서까지 문자열 잡기 (닫는 "}}" 없이)
  const m = text.match(/\{\{([^\{\}]*)$/);
  if (!m) { hideSuggest(); return; }
  const query = m[1].toLowerCase();
  const triggerPos = cursor - m[0].length;
  _varSuggest.triggerPos = triggerPos;
  _varSuggest.ta = ta;
  const all = state.email.variables || [];
  const items = all.filter(v => {
    if (!query) return true;
    return v.key.toLowerCase().includes(query)
      || (v.label || '').toLowerCase().includes(query)
      || (v.description || '').toLowerCase().includes(query);
  }).slice(0, 8);
  if (!items.length) { hideSuggest(); return; }
  _varSuggest.items = items;
  if (_varSuggest.active >= items.length) _varSuggest.active = 0;
  renderSuggest();
  positionSuggestBox(ta);
}

function attachVariableAutocomplete(textareaId) {
  const ta = document.getElementById(textareaId);
  if (!ta || ta.dataset.varAutocomplete === '1') return;
  ta.dataset.varAutocomplete = '1';
  ta.addEventListener('input', () => updateSuggest(ta));
  ta.addEventListener('click', () => updateSuggest(ta));
  ta.addEventListener('keyup', (e) => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) updateSuggest(ta);
  });
  ta.addEventListener('keydown', (e) => {
    if (!_varSuggest.items.length || (_varSuggest.el && _varSuggest.el.style.display === 'none')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _varSuggest.active = (_varSuggest.active + 1) % _varSuggest.items.length;
      renderSuggest();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _varSuggest.active = (_varSuggest.active - 1 + _varSuggest.items.length) % _varSuggest.items.length;
      renderSuggest();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pickSuggest(_varSuggest.active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideSuggest();
    }
  });
  ta.addEventListener('blur', () => setTimeout(hideSuggest, 150));
}


/** 양식 용도 — 목록에서 한눈에 구분되게 */
const TEMPLATE_PURPOSE_KO = {
  intro: { label: '첫 소개', bg: '#e0e7ff', fg: '#3730a3' },
  followup: { label: '팔로우업', bg: '#fef3c7', fg: '#92400e' },
  're-engage': { label: '재접촉', bg: '#ffedd5', fg: '#9a3412' },
  'partner-onboarding': { label: '파트너 온보딩', bg: '#f3e8ff', fg: '#6b21a8' },
  other: { label: '기타', bg: '#f1f5f9', fg: '#475569' },
};

/**
 * 📝 메일 양식 — 목록(게시판).
 *
 * 영업 담당자마다, 상황마다 쓰는 문구가 다르다. 하나만 편집하는 화면이면
 * 그때그때 덮어쓰는 수밖에 없어서 지난 문구가 남지 않는다. 여러 개 저장해
 * 두고 발송할 때 고르는 편이 실제 쓰임에 맞다.
 */
function renderTemplateListPage(templates) {
  const list = (templates || []).slice().sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const fmt = (v) => v
    ? new Date(v).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
    : '—';
  const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  els.content.innerHTML = `
    <div style="max-width:940px;margin:0 auto;padding-bottom:32px">

      <!-- 머리말 -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;
                  flex-wrap:wrap;padding:4px 2px 16px">
        <div style="min-width:0">
          <h3 style="margin:0;font-size:19px;font-weight:800;color:var(--text-primary);
                     letter-spacing:-.01em">메일 양식</h3>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:5px;line-height:1.65">
            상황별로 양식을 만들어 두고, 메일 보낼 때 골라 씁니다.
            <code style="background:var(--brand-soft,#eef2ff);padding:2px 7px;border-radius:5px;
                         color:var(--brand-text,#4338ca);font-weight:700;font-size:12px">[회사명]</code>
            을 넣으면 각 회사 이름으로 바뀝니다.
          </div>
        </div>
        <button id="tplNewBtn" type="button"
          style="font-size:13.5px;font-weight:700;padding:11px 20px;white-space:nowrap;
                 background:var(--brand,#4f46e5);color:#fff;border:none;border-radius:10px;
                 cursor:pointer;box-shadow:0 2px 8px rgba(79,70,229,.28)">
          + 새 양식 작성
        </button>
      </div>

      ${!list.length ? `
        <div style="padding:56px 28px;text-align:center;background:var(--bg-surface);
                    border:1px dashed var(--border-default);border-radius:14px">
          <div style="font-size:38px;margin-bottom:12px;opacity:.5">📝</div>
          <div style="font-size:15px;font-weight:800;color:var(--text-primary)">저장된 양식이 없습니다</div>
          <div style="font-size:13px;margin-top:7px;line-height:1.7;color:var(--text-tertiary)">
            [+ 새 양식 작성] 을 눌러 첫 양식을 만들어 주세요.<br>
            만든 양식은 <b style="color:var(--text-secondary)">발송 관리 → 보낼 메일</b> 에서 고를 수 있습니다.
          </div>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:11px">
          ${list.map((t) => {
            const p = TEMPLATE_PURPOSE_KO[t.purpose] || TEMPLATE_PURPOSE_KO.other;
            const preview = truncate(strip(t.body), 140);
            return `
            <div class="tpl-card" data-tpl-id="${escapeAttr(t._id)}"
                 title="클릭하면 이 양식을 엽니다"
                 style="position:relative;background:var(--bg-surface);
                        border:1px solid var(--border-default);border-radius:13px;
                        padding:17px 19px 17px 23px;cursor:pointer;overflow:hidden;
                        box-shadow:0 1px 2px rgba(16,24,40,.04);
                        transition:box-shadow .14s ease, border-color .14s ease, transform .14s ease">
              <!-- 용도별 색 띠 — 목록을 훑을 때 종류가 먼저 읽히게 -->
              <span style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${p.fg};opacity:.85"></span>

              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px">
                <div style="min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <strong style="font-size:15px;font-weight:800;color:var(--text-primary);
                                   letter-spacing:-.01em">${escapeHtml(t.name || '(이름 없음)')}</strong>
                    <span style="padding:2px 9px;background:${p.bg};color:${p.fg};border-radius:99px;
                                 font-size:10.5px;font-weight:800;letter-spacing:.02em">${p.label}</span>
                    ${t.isActive === false
                      ? '<span style="padding:2px 9px;background:var(--bg-surface-hover);color:var(--text-tertiary);border-radius:99px;font-size:10.5px;font-weight:700">사용 안 함</span>'
                      : ''}
                    ${(t.attachments || []).length
                      ? `<span title="${escapeAttr(t.attachments.map((a) => a.name).join(', '))}" style="padding:2px 9px;background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:99px;font-size:10.5px;font-weight:700">📎 첨부 ${t.attachments.length}</span>`
                      : ''}
                  </div>

                  <div style="display:flex;align-items:baseline;gap:7px;margin-top:9px;min-width:0">
                    <span style="font-size:10.5px;font-weight:800;color:var(--text-quaternary);
                                 letter-spacing:.04em;flex-shrink:0">제목</span>
                    <span style="font-size:13px;font-weight:600;color:var(--text-primary);
                                 overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      ${escapeHtml(t.subject || '(제목 없음)')}
                    </span>
                  </div>

                  <div style="font-size:12px;color:var(--text-tertiary);margin-top:7px;line-height:1.65;
                              display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
                              overflow:hidden">
                    ${escapeHtml(preview) || '(본문 없음)'}
                  </div>
                </div>

                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex-shrink:0">
                  <span style="font-size:11px;color:var(--text-quaternary);white-space:nowrap">
                    ${fmt(t.updatedAt)} 수정
                  </span>
                  <!-- [복사] 는 뺐다. 양식은 몇 개 안 되고 그때그때 고쳐 쓰는 것이라,
                       복사본이 쌓이면 발송할 때 "어느 게 최신이지" 가 된다.
                       변형이 필요하면 [수정] 으로 고치면 된다.
                       (핸들러 .tpl-copy 는 남겨 뒀다 — 되살리려면 버튼만 다시 넣으면 된다) -->
                  <div style="display:flex;gap:6px">
                    <button type="button" class="tpl-edit" data-tpl-id="${escapeAttr(t._id)}"
                      title="이 양식의 제목·본문을 고칩니다"
                      style="font-size:11.5px;font-weight:700;padding:6px 14px;
                             border:1px solid #2563eb;border-radius:8px;
                             background:var(--bg-surface);color:#1d4ed8;cursor:pointer">✏ 수정</button>
                    <button type="button" class="tpl-del" data-tpl-id="${escapeAttr(t._id)}"
                      title="이 양식을 삭제합니다"
                      style="font-size:11.5px;font-weight:600;padding:6px 12px;
                             border:1px solid var(--border-default);border-radius:8px;
                             background:var(--bg-surface);color:#dc2626;cursor:pointer">삭제</button>
                  </div>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <div style="margin-top:16px;padding:13px 17px;background:var(--bg-surface-alt);
                    border:1px solid var(--border-subtle);border-radius:11px;
                    font-size:12px;color:var(--text-tertiary);line-height:1.7">
          💡 양식은 <b style="color:var(--text-secondary)">[✏ 수정]</b> 으로 언제든 고칠 수 있습니다.
          상황마다 다른 문구가 필요하면 <b style="color:var(--text-secondary)">[+ 새 양식 작성]</b> 으로 하나 더 만들어 두고,
          발송할 때 골라 쓰면 됩니다.
        </div>
      `}
    </div>`;

  // 카드 hover — 인라인 스타일이라 CSS 선택자 대신 직접 건다
  els.content.querySelectorAll('.tpl-card').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      el.style.boxShadow = '0 4px 14px rgba(16,24,40,.09)';
      el.style.borderColor = 'var(--brand,#4f46e5)';
      el.style.transform = 'translateY(-1px)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.boxShadow = '0 1px 2px rgba(16,24,40,.04)';
      el.style.borderColor = 'var(--border-default)';
      el.style.transform = 'none';
    });
  });

  document.getElementById('tplNewBtn')?.addEventListener('click', () => openTemplateEditor(null));

  // 카드 아무 데나 눌러도 열리고, [✏ 수정] 을 눌러도 같은 곳이 열린다.
  // 카드 클릭만으로는 "눌러도 되는 건가" 를 모르는 사람이 있어 버튼도 같이 둔다.
  els.content.querySelectorAll('.tpl-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tpl-del') || e.target.closest('.tpl-copy')) return;
      openTemplateEditor(el.dataset.tplId);
    });
  });

  els.content.querySelectorAll('.tpl-edit').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openTemplateEditor(b.dataset.tplId);
    });
  });

  els.content.querySelectorAll('.tpl-copy').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = (state.email.templates || []).find((x) => x._id === b.dataset.tplId);
      if (!t) return;
      // 복사본은 저장 전 상태로 연다 — currentTemplateId 를 비워 POST 로 나가게 한다
      openTemplateEditor(null, { ...t, _id: undefined, name: `${t.name} (복사본)` });
    });
  });

  els.content.querySelectorAll('.tpl-del').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const t = (state.email.templates || []).find((x) => x._id === b.dataset.tplId);
      if (!t) return;
      if (!confirm(`양식 "${t.name}" 을(를) 삭제합니다.\n되돌릴 수 없습니다. 진행할까요?`)) return;
      try {
        const r = await safeJsonFetch(`/api/email-templates/${t._id}`, { method: 'DELETE' });
        if (!r?.success) throw new Error(r?.error || '삭제 실패');
        await loadEmailTemplates();
        if (state.email.currentTemplateId === t._id) state.email.currentTemplateId = null;
        renderB2BEmailManager();
      } catch (err) {
        alert('삭제 실패: ' + (err.message || 'unknown'));
      }
    });
  });
}

/** 목록에서 하나를 열거나(id) 새로 쓴다(null). seed 는 복사본용 초기값. */
function openTemplateEditor(id, seed) {
  const t = seed || (id ? (state.email.templates || []).find((x) => x._id === id) : null);
  state.email.currentTemplateId = seed ? null : (id || null);
  state.email.editor = t ? {
    name: t.name || '',
    language: 'en',
    subject: t.subject || '',
    body: t.body || '',
    purpose: t.purpose || 'intro',
    bodyIsHtml: true,
    isActive: t.isActive !== false,
    appendAccountSignature: t.appendAccountSignature !== false,
    adPrefix: t.adPrefix === true,
    attachments: (t.attachments || []).map((a) => ({ name: a.name || '', url: a.url })),
  } : { ...DEFAULT_TEMPLATE_EDITOR, language: 'en', bodyIsHtml: true, attachments: [] };
  state.email.dirty = !!seed;      // 복사본은 저장이 필요한 상태로 연다
  state.email.mode = 'edit';
  renderB2BEmailManager();
}

async function renderB2BEmailManager() {
  // 최초 진입 시 템플릿 + 메일 계정 병렬 로드
  if (state.email.templates.length === 0 && state.email.variables.length === 0) {
    els.content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-tertiary)">템플릿 로드 중...</div>`;
    await Promise.all([loadEmailTemplates(), loadMailAccounts()]);
    if (!state.email.editor) {
      state.email.editor = { ...DEFAULT_TEMPLATE_EDITOR };
    }
  } else if (!_mailAccounts) {
    await loadMailAccounts();
  }

  // 미리보기용 샘플 리드 후보 (승인/컨택중 등에서 100건만)
  // 미리보기에 쓸 실제 회사들.
  //
  // baseLeads 만 보면 이 화면에서는 늘 비어서, 회사 고르는 칸에
  // '— 예시 회사 —' 한 줄만 뜨고 [회사명] 이 항상 'Acme Beauty Co.' 로 치환됐다.
  // 진짜로 어떻게 나갈지를 못 보는 셈이라 미리보기의 뜻이 없어진다.
  //
  // readyForOutreach 조건도 뺐다. 그 플래그는 검증 완료 전 건에 켜져 있거나
  // 비어 있어서 기준이 되지 못한다 — 지금은 '어느 단계에 있는가' 로만 고른다.
  let previewCandidates = allKnownLeads().filter(l =>
    ['verified', 'queued', 'contacted', 'replied', 'negotiating', 'partner'].includes(l.stage)
  ).slice(0, 100);

  // 이 화면은 리드를 따로 받지 않는다. 다른 화면을 거치지 않고 바로 들어오면
  // 고를 회사가 하나도 없으므로, 미리보기에 쓸 만큼만(30곳) 가볍게 받아온다.
  if (!previewCandidates.length) {
    try {
      const r = await safeJsonFetch('/api/leads?stage=verified&limit=30');
      if (r && r.success) {
        previewCandidates = (r.data || []).map((l) => ({ ...l, id: l.leadId }));
        // 팝업·다른 화면에서도 찾히도록 곁방 캐시에 얹어 둔다
        const known = new Set(_popupLeadCache.map((l) => l.id));
        for (const l of previewCandidates) if (!known.has(l.id)) _popupLeadCache.push(l);
      }
    } catch { /* 미리보기는 거들 뿐이라 실패해도 화면은 그대로 */ }
  }

  // ── 목록(게시판) 모드 ───────────────────────────────────
  // 예전에는 첫 템플릿을 자동으로 열어 그 하나만 편집하게 했다. 그러면 양식을
  // 여러 개 만들어 상황에 맞게 골라 쓸 수가 없다. 기본은 목록이고, 거기서
  // 골라 들어가거나 새로 쓴다.
  const templates = state.email.templates;
  if (state.email.mode !== 'edit') {
    renderTemplateListPage(templates);
    return;
  }
  if (!state.email.editor) {
    state.email.editor = { ...DEFAULT_TEMPLATE_EDITOR, name: '메일 양식', language: 'en', bodyIsHtml: true };
  }
  // 강제 영문 + HTML
  state.email.editor.language = 'en';
  state.email.editor.bodyIsHtml = true;
  const ed = state.email.editor;

  els.content.innerHTML = `
    <!-- 단일 양식 편집 -->
    <div id="tplEditorBox" style="max-width:960px;margin:0 auto;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:14px;min-height:calc(100vh - 220px);box-shadow:0 1px 3px rgba(16,24,40,.05)">

      <!-- 상단 헤더 + 저장 -->
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <button id="tplBackBtn" type="button"
            style="font-size:12px;padding:5px 12px;margin-bottom:8px;border-radius:8px;cursor:pointer;
                   border:1px solid var(--border-default);background:var(--bg-surface);color:var(--text-secondary)">
            ← 양식 목록으로
          </button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <label style="flex:1;min-width:220px">
              <span style="font-size:12px;color:var(--text-secondary);font-weight:700">양식 이름 <span style="color:#dc2626">*</span></span>
              <input id="templateNameInput" type="text" value="${escapeAttr(ed.name || '')}"
                placeholder="예: 첫 소개 — 유럽 유통사용"
                style="width:100%;padding:10px 13px;border:1px solid #cbd5e1;border-radius:8px;
                       font-size:14px;font-weight:700;margin-top:4px;background:#ffffff;color:#0f172a">
            </label>
            <label style="min-width:150px">
              <span style="font-size:12px;color:var(--text-secondary);font-weight:700">용도</span>
              <select id="templatePurposeSel"
                style="width:100%;padding:10px 11px;border:1px solid #cbd5e1;border-radius:8px;
                       font-size:13px;margin-top:4px;background:#ffffff;color:#0f172a">
                ${Object.entries(TEMPLATE_PURPOSE_KO).map(([k, v]) =>
                  `<option value="${k}" ${ (ed.purpose || 'intro') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
              </select>
            </label>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:7px">
            발송할 메일을 그대로 작성하세요. 회사명 자리엔 <code style="background:#eef2ff;padding:2px 8px;border-radius:4px;color:#4338ca;font-weight:700">[회사명]</code> · 서명은 자동.
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);font-weight:600;cursor:pointer">
            <input type="checkbox" id="tplAdPrefix" ${ed.adPrefix ? 'checked' : ''}>
            <span>(광고) 접두사 자동</span>
          </label>
          <button id="saveTemplateBtn" type="button" style="font-size:13px;font-weight:700;padding:9px 22px;background:${state.email.dirty ? '#15803d' : '#94a3b8'};color:white;border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 6px rgba(21,128,61,0.25)" ${state.email.loading ? 'disabled' : ''}>
            ${state.email.loading ? '⏳ 저장 중...' : (state.email.dirty ? '💾 저장' : '✅ 저장됨')}
          </button>
        </div>
      </div>

      <!-- 제목 -->
      <div>
        <label style="font-size:12px;color:var(--text-secondary);font-weight:700">제목 <span style="color:#dc2626">*</span></label>
        <input id="templateSubjectInput" type="text" value="${escapeAttr(ed.subject)}"
          style="width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;margin-top:4px;background:#ffffff;color:#0f172a"
          placeholder="예: [회사명] 휴게공간 제안 — 요기보">
        ${ed.adPrefix ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">실제 발송 제목: <code style="color:#dc2626;font-weight:600">(광고)</code> ${escapeHtml(ed.subject || '(제목 미입력)')}</div>` : ''}
      </div>

      <!-- 리치 텍스트 툴바 + 본문 -->
      <div style="display:flex;flex-direction:column;flex:1;min-height:340px">
        <label style="font-size:12px;color:var(--text-secondary);font-weight:700">본문 (서식 지원)</label>
        <div id="tplToolbar" style="display:flex;gap:2px;flex-wrap:wrap;align-items:center;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px 8px 0 0;padding:6px;margin-top:4px">
          <!-- 메일은 웹폰트를 못 쓴다. 수신자 PC 에 이미 깔려 있는 글꼴만 넣는다.
               (Pretendard 같은 걸 지정해도 상대 메일함에서는 기본 글꼴로 떨어진다) -->
          <select id="tplFontFamily" title="글꼴" style="padding:6px 6px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a">
            <option value="">글꼴</option>
            <option value="Arial, Helvetica, sans-serif">기본 (Arial)</option>
            <option value="'Malgun Gothic','맑은 고딕',sans-serif">맑은 고딕</option>
            <option value="Dotum,'돋움',sans-serif">돋움</option>
            <option value="Gulim,'굴림',sans-serif">굴림</option>
            <option value="Helvetica, Arial, sans-serif">Helvetica</option>
            <option value="Georgia,'Times New Roman',serif">Georgia</option>
            <option value="'Times New Roman', Times, serif">Times</option>
            <option value="Verdana, Geneva, sans-serif">Verdana</option>
            <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
            <option value="'Trebuchet MS', Helvetica, sans-serif">Trebuchet</option>
            <option value="'Courier New', Courier, monospace">Courier</option>
          </select>
          <select id="tplFontSize" title="글자 크기" style="padding:6px 6px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a">
            <option value="">크기</option>
            <option value="12">12px</option>
            <option value="13">13px</option>
            <option value="14">14px</option>
            <option value="15">15px</option>
            <option value="16">16px</option>
            <option value="18">18px</option>
            <option value="20">20px</option>
            <option value="24">24px</option>
          </select>
          <div style="width:1px;background:#cbd5e1;margin:0 3px"></div>
          <button type="button" data-cmd="bold" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a;font-weight:800" title="굵게 (Ctrl+B)"><b>B</b></button>
          <button type="button" data-cmd="italic" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a;font-style:italic" title="기울임 (Ctrl+I)"><i>I</i></button>
          <button type="button" data-cmd="underline" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a;text-decoration:underline" title="밑줄 (Ctrl+U)"><u>U</u></button>
          <button type="button" data-cmd="strikeThrough" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a;text-decoration:line-through" title="취소선">S</button>
          <label title="글자 색" style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a">
            <span style="font-weight:800">A</span>
            <input type="color" id="tplFontColor" value="#111827"
                   style="width:22px;height:18px;padding:0;border:none;background:none;cursor:pointer">
          </label>
          <div style="width:1px;background:#cbd5e1;margin:0 3px"></div>
          <button type="button" data-cmd="insertUnorderedList" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a" title="글머리 목록">• 목록</button>
          <button type="button" data-cmd="insertOrderedList" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a" title="번호 목록">1. 목록</button>
          <div style="width:1px;background:#cbd5e1;margin:0 3px"></div>
          <button type="button" data-cmd="justifyLeft" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a" title="왼쪽 정렬">좌</button>
          <button type="button" data-cmd="justifyCenter" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a" title="가운데 정렬">중앙</button>
          <button type="button" data-cmd="justifyRight" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a" title="오른쪽 정렬">우</button>
          <div style="width:1px;background:#cbd5e1;margin:0 3px"></div>
          <button type="button" id="tplInsertLink" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a;color:#1d4ed8;font-weight:700" title="선택한 글자에 링크 걸기">🔗 링크</button>
          <button type="button" id="tplUnlink" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a" title="링크 해제">링크해제</button>
          <button type="button" id="tplInsertImage" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#047857;font-weight:700" title="cafe24 오픈호스팅 등에 올린 이미지 주소로 본문에 그림을 넣습니다">🖼 이미지</button>
          <div style="width:1px;background:#cbd5e1;margin:0 3px"></div>
          <button type="button" data-cmd="removeFormat" style="padding:6px 10px;background:white;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:12px;color:#0f172a" title="서식 지우기">서식해제</button>
          <div style="flex:1"></div>
          <button type="button" id="insertCompanyMarker" style="padding:6px 12px;background:#eef2ff;border:1px solid #a5b4fc;border-radius:4px;cursor:pointer;font-size:12px;color:#4338ca;font-weight:700" title="회사명 자동 대체 마커 삽입">➕ [회사명]</button>
        </div>
        <div id="templateBodyRich" contenteditable="true"
          style="width:100%;flex:1;padding:16px 20px;border:1px solid #cbd5e1;border-top:none;border-radius:0 0 8px 8px;font-size:14px;font-family:inherit;min-height:340px;line-height:1.75;background:#ffffff;color:#0f172a;outline:none;overflow-y:auto">${ed.bodyIsHtml && ed.body ? ed.body : (ed.body ? escapeHtml(ed.body).replace(/\n/g, '<br>') : '')}</div>
      </div>

        <!-- 첨부파일 — 파일을 이 앱에 올리지 않고 주소로 둔다 (lib/mail/template-attachments.ts).
             보내는 순간 서버가 그 주소에서 받아 파일로 붙인다. cafe24 오픈호스팅 주소를 그대로 쓰면 된다. -->
        <div id="tplAttachBox" style="padding:12px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px">
          <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:7px">📎 첨부파일
            <span style="font-weight:400">· cafe24 오픈호스팅 등에 올린 <b>파일 주소</b>를 넣으면 보낼 때 파일로 붙여 보냅니다 (최대 5개 · 합계 10MB)</span></div>
          ${(ed.attachments || []).length ? `
          <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:8px">
            ${(ed.attachments || []).map((a, i) => `
            <div class="tpl-att-row" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff;border:1px solid #fde68a;border-radius:7px;font-size:12px;min-width:0">
              <span>📎</span>
              <b style="color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%">${escapeHtml(a.name || '첨부파일')}</b>
              <a href="${escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer" title="새 창에서 파일 열어보기"
                 style="flex:1;min-width:0;color:#64748b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.url)}</a>
              <button type="button" class="tpl-att-del" data-idx="${i}"
                style="padding:3px 9px;font-size:11px;border:1px solid #fca5a5;background:#fff;color:#b91c1c;border-radius:6px;cursor:pointer;flex-shrink:0">빼기</button>
            </div>`).join('')}
          </div>` : ''}
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <input id="tplAttUrl" type="url" placeholder="https://…/catalog.pdf  (파일 주소)"
              style="flex:2;min-width:200px;padding:7px 9px;border:1px solid #fcd34d;border-radius:6px;font-size:12px;background:#fff;color:#0f172a">
            <input id="tplAttName" type="text" placeholder="받는 쪽에 보일 파일 이름 (비우면 주소의 이름)"
              style="flex:1;min-width:160px;padding:7px 9px;border:1px solid #fcd34d;border-radius:6px;font-size:12px;background:#fff;color:#0f172a">
            <button type="button" id="tplAttAdd"
              style="padding:7px 14px;font-size:12px;font-weight:700;border:1px solid #d97706;background:#f59e0b;color:#fff;border-radius:6px;cursor:pointer">+ 첨부 추가</button>
          </div>
          <div style="font-size:10.5px;color:#92400e;margin-top:7px;line-height:1.6">
            첨부는 <b>[💾 저장]</b>해야 반영됩니다. 주소에서 파일을 못 받으면 메일을 보내지 않고 사유를 알려드립니다.<br>
            처음 연락하는 메일에 파일이 붙어 있으면 스팸함으로 갈 확률이 올라갑니다 — 첫 메일은 <b>🔗 링크</b>, 답장이 온 뒤 파일을 권장합니다.
          </div>
        </div>

        <!-- 서명 미리보기 (선택한 계정 기반) -->
        <div style="padding:12px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px">
          <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:6px">✍ 발송 시 자동으로 붙는 서명</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <select id="sigAccountSelect" style="flex:1;padding:8px 10px;border:1px solid #86efac;border-radius:6px;font-size:12px;background:#ffffff;color:#0f172a">
              <option value="">— 서명에 사용할 메일 계정 선택 —</option>
              ${(_mailAccounts || []).map(a => `
                <option value="${escapeAttr(a._id)}" ${a._id === state.email.previewAccountId ? 'selected' : ''}>
                  ${escapeHtml(a.accountName)} · ${escapeHtml(a.fromAddress || a.smtpUser)}
                </option>
              `).join('')}
            </select>
          </div>
          ${(() => {
            const acc = (_mailAccounts || []).find(a => a._id === state.email.previewAccountId);
            if (!acc) return `<div style="margin-top:8px;font-size:11px;color:#166534">계정을 선택하면 실제 붙을 서명이 여기 표시됩니다.</div>`;
            return `<div style="margin-top:10px;padding:12px 14px;background:white;border:1px solid #86efac;border-radius:6px">${signaturePreviewHtml(acc)}</div>`;
          })()}
        </div>

        <!-- 미리보기 (실제 발송 대상 리드 기준) -->
        <div style="padding:12px 14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px">
            <div style="font-size:11px;font-weight:700;color:#334155">👁 실제 발송 미리보기 (샘플 회사)</div>
            <select id="previewLeadSelect" style="max-width:280px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;background:#ffffff;color:#0f172a">
              <option value="">— 예시 회사 —</option>
              ${previewCandidates.slice(0, 100).map(l => `
                <option value="${escapeAttr(l.leadId)}" ${l.leadId === state.email.previewLeadId ? 'selected' : ''}>
                  ${escapeHtml(l.Company)}
                </option>
              `).join('')}
            </select>
          </div>
          ${(() => {
            const sampleCompany = (() => {
              if (state.email.previewLeadId) {
                const l = previewCandidates.find(x => x.leadId === state.email.previewLeadId);
                if (l) return l.Company || 'Acme Beauty Co.';
              }
              return previewCandidates[0]?.Company || 'Acme Beauty Co.';
            })();
            const applyMarkers = (s) => (s || '').replace(/\[회사명\]/g, sampleCompany).replace(/\{\{\s*Company\s*\}\}/g, sampleCompany);
            const subj = applyMarkers(ed.subject) || '(제목 없음)';
            const body = applyMarkers(ed.body) || '(본문 없음)';
            return `
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
                <div style="padding:10px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:700;color:#111827">${escapeHtml(subj)}</div>
                <!-- 양식 본문은 HTML 이다(서식 편집기). 이스케이프해서 찍으면 <p><ul> 태그가 글자로 보인다.
                     발송 화면 미리보기와 같은 방식으로 그린다. 옛 양식(평문)은 줄바꿈을 살린다. -->
                <div class="tpl-preview-body" style="padding:14px 16px;font-size:13px;line-height:1.65;color:#111827">${/<[a-z][\s\S]*>/i.test(body) ? renderMailBodyHtml(body) : escapeHtml(body).split(String.fromCharCode(10)).join('<br>')}</div>
              </div>
              <div style="margin-top:6px;font-size:10px;color:#64748b">🎯 샘플: <b>${escapeHtml(sampleCompany)}</b> · 실제 발송 시 각 리드별 회사명으로 치환</div>
              ${(ed.attachments || []).length ? `<div class="tpl-preview-atts" style="margin-top:4px;font-size:11px;color:#92400e">📎 함께 붙는 파일: ${(ed.attachments || []).map((a) => `<b>${escapeHtml(a.name || '첨부파일')}</b>`).join(' · ')}</div>` : ''}
            `;
          })()}
        </div>

      <!-- 숨겨진 필드 (하위 호환) -->
      <input type="hidden" id="templateNameInput" value="${escapeAttr(ed.name || '메일 양식')}">
      <input type="hidden" id="templateLangInput" value="en">
      <input type="hidden" id="templatePurposeInput" value="intro">
      <input type="hidden" id="templateHtmlInput" value="1">
      <input type="hidden" id="templateSigInput" value="1">
    </div>
  `;

  // ── 이벤트 바인딩 ─────────────────────────────────────────
  document.getElementById('saveTemplateBtn')?.addEventListener('click', saveTemplate);

  // 목록으로 — 저장 안 한 내용이 있으면 확인하고 나간다
  document.getElementById('tplBackBtn')?.addEventListener('click', () => {
    if (state.email.dirty &&
        !confirm('저장하지 않은 내용이 있습니다.\n목록으로 나가면 사라집니다. 나갈까요?')) return;
    state.email.mode = 'list';
    state.email.dirty = false;
    renderB2BEmailManager();
  });

  // 양식 이름 · 용도 — 목록에서 구분하는 값이라 편집기 맨 위에 둔다
  document.getElementById('templateNameInput')?.addEventListener('input', (e) => {
    state.email.editor.name = e.target.value;
    state.email.dirty = true;
    const btn = document.getElementById('saveTemplateBtn');
    if (btn) { btn.style.background = '#15803d'; btn.textContent = '💾 저장'; }
  });
  document.getElementById('templatePurposeSel')?.addEventListener('change', (e) => {
    state.email.editor.purpose = e.target.value;
    state.email.dirty = true;
    const btn = document.getElementById('saveTemplateBtn');
    if (btn) { btn.style.background = '#15803d'; btn.textContent = '💾 저장'; }
  });

  // 서명 계정 선택 → 미리보기 갱신
  document.getElementById('sigAccountSelect')?.addEventListener('change', (e) => {
    state.email.previewAccountId = e.target.value || null;
    renderB2BEmailManager();
  });
  // 미리보기 리드 선택
  document.getElementById('previewLeadSelect')?.addEventListener('change', (e) => {
    state.email.previewLeadId = e.target.value || null;
    renderB2BEmailManager();
  });

  // (광고) 접두사 토글
  document.getElementById('tplAdPrefix')?.addEventListener('change', (e) => {
    state.email.editor.adPrefix = e.target.checked;
    state.email.dirty = true;
    renderB2BEmailManager();
  });

  // ── 리치 에디터 툴바 ──────────────────────────────────────
  // styleWithCSS: 서식을 <font> 태그가 아니라 style="" 인라인으로 넣게 한다.
  // 메일 클라이언트는 <style> 블록이나 클래스를 대부분 지우므로,
  // 인라인 style 로 들어가야 상대 메일함에서 서식이 살아남는다.
  try { document.execCommand('styleWithCSS', false, true); } catch {}

  const syncRich = () => {
    const rich = document.getElementById('templateBodyRich');
    if (!rich) return;
    state.email.editor.body = rich.innerHTML;
    state.email.editor.bodyIsHtml = true;
    state.email.dirty = true;
    markSaveDirty();
  };
  // 툴바를 누르는 순간 본문 선택이 풀리면 서식이 엉뚱한 데 걸린다 → mousedown 차단
  const keepFocus = (el) => el?.addEventListener('mousedown', (e) => e.preventDefault());

  document.querySelectorAll('#tplToolbar button[data-cmd]').forEach(btn => {
    keepFocus(btn);
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      syncRich();
    });
  });

  // 글꼴 — execCommand('fontName') 은 <font face> 를 만들어서 메일에서 잘 깨진다.
  // 선택 영역을 style="font-family:…" 로 감싸는 편이 안전하다.
  const wrapSelection = (styleProp, value) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      alert('먼저 본문에서 바꿀 글자를 선택하세요.');
      return false;
    }
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style[styleProp] = value;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const r2 = document.createRange();
      r2.selectNodeContents(span);
      sel.addRange(r2);
    } catch {
      return false;
    }
    return true;
  };

  // 선택칸은 mousedown 을 막지 않는다 — 막으면 목록이 안 펼쳐진다 (keepEditorSelection 참고).
  const fontSel = document.getElementById('tplFontFamily');
  const sizeSel = document.getElementById('tplFontSize');
  const tplPick = keepEditorSelection(document.getElementById('templateBodyRich'),
    [fontSel, sizeSel, document.getElementById('tplFontColor')]);

  fontSel?.addEventListener('change', (e) => {
    tplPick.restore();
    if (e.target.value && wrapSelection('fontFamily', e.target.value)) syncRich();
    e.target.selectedIndex = 0;
  });

  sizeSel?.addEventListener('change', (e) => {
    tplPick.restore();
    if (e.target.value && wrapSelection('fontSize', e.target.value + 'px')) syncRich();
    e.target.selectedIndex = 0;
  });

  const colorInput = document.getElementById('tplFontColor');
  colorInput?.addEventListener('input', (e) => {
    // 색상표가 열리면 본문 선택이 풀린다 — 되살린 뒤에 색을 건다
    if (!tplPick.restore()) return;
    document.execCommand('foreColor', false, e.target.value);
    syncRich();
  });

  // 링크 — createLink 로 만든 <a> 에 target/rel 을 직접 붙인다.
  // 메일에서 열리는 링크는 새 창으로 뜨는 편이 자연스럽고,
  // rel 이 없으면 일부 클라이언트가 경고를 띄운다.
  const linkBtn = document.getElementById('tplInsertLink');
  keepFocus(linkBtn);
  linkBtn?.addEventListener('click', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      alert('링크를 걸 글자를 먼저 선택하세요.\n(예: "자세히 보기" 를 드래그한 뒤 🔗 링크)');
      return;
    }
    const url = prompt('연결할 주소를 입력하세요', 'https://');
    if (!url || url === 'https://') return;
    const href = /^(https?:|mailto:)/i.test(url) ? url : 'https://' + url;
    document.execCommand('createLink', false, href);
    const rich = document.getElementById('templateBodyRich');
    rich?.querySelectorAll(`a[href="${CSS.escape(href)}"]`).forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.style.color = '#1d4ed8';
    });
    syncRich();
  });

  const unlinkBtn = document.getElementById('tplUnlink');
  keepFocus(unlinkBtn);
  unlinkBtn?.addEventListener('click', () => { document.execCommand('unlink', false, null); syncRich(); });

  // 이미지 — 파일을 올리지 않고 **주소**로 넣는다 (cafe24 오픈호스팅 등).
  // 그림을 메일에 통째로 박으면(data:) Gmail·Outlook 이 지우거나 스팸 점수를 올린다.
  // 주소로 넣으면 받는 쪽 메일 프로그램이 그 주소에서 그림을 불러온다.
  // width 를 적어 두는 이유: Outlook(PC)은 max-width 를 무시해 큰 그림이 옆으로 삐져나간다.
  const imgBtn = document.getElementById('tplInsertImage');
  keepFocus(imgBtn);
  imgBtn?.addEventListener('click', () => {
    const richEl = document.getElementById('templateBodyRich');
    if (!richEl) return;
    const sel = window.getSelection();
    const saved = sel && sel.rangeCount && richEl.contains(sel.getRangeAt(0).commonAncestorContainer)
      ? sel.getRangeAt(0).cloneRange() : null;
    const url = (prompt('이미지 주소를 넣어주세요 (cafe24 오픈호스팅 등에 올린 이미지)\n예: https://…/product.jpg', 'https://') || '').trim();
    if (!url || url === 'https://') return;
    if (!/^https?:\/\//i.test(url)) { alert('이미지 주소는 http:// 또는 https:// 로 시작해야 합니다.'); return; }
    const probe = new Image();
    probe.onload = () => {
      const w = Math.min(600, probe.naturalWidth || 600);
      richEl.focus();
      const s2 = window.getSelection();
      const r = saved || document.createRange();
      if (!saved) { r.selectNodeContents(richEl); r.collapse(false); }
      s2.removeAllRanges();
      s2.addRange(r);
      document.execCommand('insertHTML', false,
        `<img src="${escapeAttr(url)}" alt="" width="${w}" style="max-width:100%;height:auto;border:0;display:block;margin:8px 0">`);
      syncRich();
    };
    probe.onerror = () => alert('이 주소에서 이미지를 불러오지 못했습니다.\n주소가 이미지 파일(…jpg · png · gif)을 가리키는지 확인해주세요.');
    probe.src = url;
  });
  // 그림 파일을 본문에 바로 붙여넣으면 data: 로 박힌다 → 막고 [🖼 이미지]로 안내한다
  document.getElementById('templateBodyRich')?.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])];
    if (items.some((it) => it.kind === 'file' && /^image\//.test(it.type))) {
      e.preventDefault();
      alert('그림 파일은 본문에 바로 붙여넣을 수 없습니다.\ncafe24 오픈호스팅에 올린 뒤 [🖼 이미지] 버튼으로 주소를 넣어주세요.');
    }
  });

  // 첨부파일 — 주소를 목록에 더한다. 저장해야 서버에 남고, 보낼 때 서버가 받아서 붙인다.
  const addAttachment = () => {
    const urlEl = document.getElementById('tplAttUrl');
    const nameEl = document.getElementById('tplAttName');
    const url = (urlEl?.value || '').trim();
    if (!url) { urlEl?.focus(); return; }
    if (!/^https?:\/\//i.test(url)) { alert('파일 주소는 http:// 또는 https:// 로 시작해야 합니다.'); return; }
    const cur = state.email.editor.attachments || [];
    if (cur.length >= 5) { alert('첨부파일은 5개까지 붙일 수 있습니다.'); return; }
    if (cur.some((a) => a.url === url)) { alert('이미 붙인 주소입니다.'); return; }
    let name = (nameEl?.value || '').trim();
    if (!name) {
      try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch { name = ''; }
    }
    state.email.editor.attachments = [...cur, { name: name || 'attachment', url }];
    state.email.dirty = true;
    renderB2BEmailManager();
  };
  document.getElementById('tplAttAdd')?.addEventListener('click', addAttachment);
  ['tplAttUrl', 'tplAttName'].forEach((id) => document.getElementById(id)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addAttachment(); }
  }));
  document.querySelectorAll('.tpl-att-del').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.idx);
    state.email.editor.attachments = (state.email.editor.attachments || []).filter((_, k) => k !== i);
    state.email.dirty = true;
    renderB2BEmailManager();
  }));

  // [회사명] 마커 삽입
  document.getElementById('insertCompanyMarker')?.addEventListener('mousedown', (e) => e.preventDefault());
  document.getElementById('insertCompanyMarker')?.addEventListener('click', () => {
    document.execCommand('insertText', false, '[회사명]');
    const rich = document.getElementById('templateBodyRich');
    if (rich) {
      state.email.editor.body = rich.innerHTML;
      state.email.dirty = true;
      markSaveDirty();
    }
  });

  // 리치 본문 편집 → state 동기화
  const rich = document.getElementById('templateBodyRich');
  if (rich) {
    rich.addEventListener('input', () => {
      state.email.editor.body = rich.innerHTML;
      state.email.editor.bodyIsHtml = true;
      state.email.dirty = true;
      markSaveDirty();
    });
  }

  function markSaveDirty() {
    const saveBtn = document.getElementById('saveTemplateBtn');
    if (saveBtn && !state.email.loading) {
      saveBtn.textContent = '💾 저장';
      saveBtn.style.background = '#15803d';
    }
  }

  // 제목 입력 → state
  document.getElementById('templateSubjectInput')?.addEventListener('input', (e) => {
    state.email.editor.subject = e.target.value;
    state.email.dirty = true;
    markSaveDirty();
  });

  document.querySelectorAll('.tpl-item').forEach(el => {
    el.addEventListener('click', () => selectTemplate(el.dataset.tplId));
  });

  // 폼 입력 → editor state 반영
  const bindEditor = (id, key, prop = 'value') => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      state.email.editor[key] = prop === 'checked' ? el.checked : el.value;
      state.email.dirty = true;
      // 저장 버튼만 갱신 (재렌더 하면 포커스 잃음)
      const saveBtn = document.getElementById('saveTemplateBtn');
      if (saveBtn && !state.email.loading) saveBtn.textContent = '💾 저장*';
    });
    if (prop === 'checked') {
      el.addEventListener('change', () => {
        state.email.editor[key] = el.checked;
        state.email.dirty = true;
      });
    }
  };
  bindEditor('templateNameInput', 'name');
  bindEditor('templateLangInput', 'language');
  bindEditor('templatePurposeInput', 'purpose');
  bindEditor('templateSubjectInput', 'subject');
  bindEditor('templateBodyInput', 'body');
  bindEditor('templateHtmlInput', 'bodyIsHtml', 'checked');
  bindEditor('templateSigInput', 'appendAccountSignature', 'checked');

  // 자동완성: 본문에 {{ 타이핑하면 한글 라벨 드롭다운
  attachVariableAutocomplete('templateBodyInput');
  attachVariableAutocomplete('templateSubjectInput');

  // 미리보기 리드 선택 → 자동 렌더
  document.getElementById('previewAccountSelect')?.addEventListener('change', (e) => {
    state.email.previewAccountId = e.target.value || null;
    if (state.email.currentTemplateId) refreshPreview();
  });
  document.getElementById('previewLeadSelect')?.addEventListener('change', (e) => {
    state.email.previewLeadId = e.target.value || null;
    refreshPreview();
  });
}

// ── Phase 1 스켈레톤: 이메일 크롤링 ─────────────────────────
// ══════════════════════════════════════════════════════════════
// 🕷 이메일 크롤링 대시보드 — 대기열 · 결과 · 벌크 실행
// ══════════════════════════════════════════════════════════════
var _crawlState = {
  scopeSel: 'verified',        // 검증완료 리드만 대상 (검증대기는 크롤링 안 함)
  chunkLimit: 50,
  running: false,
  runResults: [],              // { chunk, processed, found, promoted, ts }
};

// ══════════════════════════════════════════════════════════════
// 📬 메일 계정 관리 (다계정 SMTP 등록/관리)
// ══════════════════════════════════════════════════════════════
var _mailAccounts = null;   // 캐시 (컴포즈 모달도 공유)

async function loadMailAccounts(force) {
  if (!force && _mailAccounts) return _mailAccounts;
  try {
    const res = await fetch('/api/mail-accounts');
    const data = await res.json();
    if (data.success) { _mailAccounts = data.accounts || []; return _mailAccounts; }
  } catch {}
  _mailAccounts = [];
  return _mailAccounts;
}

// ══════════════════════════════════════════════════════════════
// 📖 사용 설명서 (User Guide) 페이지
// ══════════════════════════════════════════════════════════════
/**
 * 📖 사용 설명서 — 클라이언트가 매일 하는 일을 순서대로.
 *
 * 예전 설명서는 지금 없는 화면(AI 서칭·검증 대기·크롤링·등급별 발송)을 설명하고,
 * 예약이 "5분마다" 나간다는 등 실제와 다른 내용을 담고 있었다. 화면과 설명이
 * 어긋나면 설명서를 믿지 않게 되므로, 지금 있는 화면만 순서대로 다시 적는다.
 */
function renderUserGuidePage() {
  // 화면 하나 = 카드 하나. 순서가 곧 일하는 순서다.
  const stepCard = (n, icon, title, lead, doList, note, tone) => `
    <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px;
                padding:20px 22px;display:flex;gap:16px;align-items:flex-start;
                box-shadow:0 1px 3px rgba(16,24,40,.05)">
      <div style="min-width:40px;height:40px;background:${tone || 'linear-gradient(135deg,#4f8cff,#3b6fe0)'};
                  color:#fff;border-radius:11px;display:flex;align-items:center;justify-content:center;
                  font-size:16px;font-weight:800;flex-shrink:0">${n}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:5px;flex-wrap:wrap">
          <span style="font-size:18px">${icon}</span>
          <h3 style="margin:0;font-size:15.5px;font-weight:800;color:var(--text-primary)">${title}</h3>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.75">${lead}</div>
        ${doList ? `
          <div style="margin-top:11px;background:var(--bg-surface-alt);border:1px solid var(--border-subtle);
                      border-radius:9px;padding:11px 14px">
            <div style="font-size:10.5px;font-weight:800;color:var(--text-quaternary);
                        letter-spacing:.04em;margin-bottom:6px">여기서 하는 것</div>
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.85">${doList}</div>
          </div>` : ''}
        ${note ? `
          <div style="margin-top:9px;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;
                      padding:10px 14px;font-size:12.5px;color:#78350f;line-height:1.7">${note}</div>` : ''}
      </div>
    </div>`;

  els.content.innerHTML = `
    <div style="max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:13px">

      <!-- 한 줄 요약 — 이 앱이 무엇을 하는가.
           설명서는 **사이드바와 같은 순서·같은 이름**이어야 한다. 예전 설명서는 '발송 리스트',
           '직접 검토 시작' 같은 옛 이름과 옛 순서(올린 데이터가 1단계)로 남아 있었다. -->
      <div style="padding:24px 26px;border-radius:16px;
                  background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #93c5fd">
        <h2 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#0f2d6b">
          국내 B2B 업체를 찾아 메일을 보내고, 답장을 관리하는 곳입니다
        </h2>
        <div style="font-size:13.5px;color:#1e40af;line-height:1.85">
          왼쪽 메뉴는 <b>네 묶음</b>입니다 — ① 메일함 ② 리드 파이프라인 ③ 직접 올린 업체 ④ 설정·도구.<br>
          <b>고른 곳에만 메일이 나갑니다.</b> 목록에 있다고 저절로 나가지 않습니다.
        </div>
        <div style="margin-top:13px;padding:11px 15px;background:#fff;border-radius:10px;
                    font-size:12.5px;color:#1e3a8a;line-height:1.8">
          <b>AI 1차 검토</b>(저희가 돌려 넣어 드림) → <b>2차 검토</b>(대표님이 고름) → <b>발송 관리</b> →
          답장 받음 → 대화 진행 중 → 파트너십 확정
        </div>
        <div style="margin-top:8px;font-size:12px;color:#1e40af">
          휴대폰처럼 좁은 화면에서는 왼쪽 위 <b>☰</b> 를 눌러 메뉴를 엽니다.
        </div>
      </div>

      ${stepCard(1, '✅', 'AI 검증 완료 — 2차 검토로 보낼 곳을 고릅니다',
        'AI가 1차로 거른 업체들입니다. 새 업체 발굴과 AI 1차 검토는 저희가 돌려서 여기에 넣어 드립니다. <b>여기 있다고 메일이 나가지는 않습니다.</b>',
        `<b>[2차 검토 시작 →]</b> — 한 회사씩 크게 보면서 둘 중 하나를 누릅니다. 숫자는 <b>메일 주소가 있는 곳</b>만 셉니다.<br>
         &nbsp;&nbsp;· <b>✉ 메일 보낼곳으로 선정</b> → [발송 관리 → 보낼 메일]로<br>
         &nbsp;&nbsp;· <b>🚫 검증실패 업체로 선정</b> → 이 화면의 [🚫 검증 실패] 탭으로<br>
         잘못 눌렀으면 <b>[‹ 이전]</b>(또는 Backspace)으로 돌아가 다시 고르면 바뀝니다. <b>Esc</b> 로 나갑니다.<br>
         <b>[🗂 지금까지 고른 결과 보기]</b> — 날짜별로 무엇을 골랐는지 보고 <b>[↩ 되돌리기]</b> 합니다.<br>
         <b>📋 이 업체들, 어떤 정보가 더 필요하세요?</b> — 맨 위 칸에 적어 주시면 업체별로 찾아서 채워 드립니다.<br>
         <b>[발송 관리 →]</b> 는 화면만 옮깁니다 (메일 안 나감). 표에서 체크 후 <b>[📨 발송 관리로 이동]</b> 을 누르면 그 업체만 옮겨집니다.`,
        '검토 화면에서 <b>키보드 → 는 바로 [메일 보낼곳], ← 는 바로 [검증 실패]</b>로 저장됩니다. 화면을 넘기려고 방향키를 누르지 마세요. 검증 실패로 빼도 지워지지 않고, [🚫 검증 실패] 탭에서 <b>[→ ✅ AI 검증 완료]</b>로 되돌릴 수 있습니다.')}

      ${stepCard(2, '📨', '발송 관리 — 메일을 보냅니다',
        '탭 세 개가 <b>메일의 일생</b>입니다. 왼쪽에서 오른쪽으로 흘러갑니다.',
        `<b>✉️ 보낼 메일</b> — [📨 발송 관리로 이동]으로 고른 곳이 모입니다. 양식과 보내는 주소를 정하고 발송합니다.<br>
         <b>📅 예약 발송</b> — 잡아둔 예약이 시각 순서대로 있습니다. 답장이 오면 자동으로 빠집니다.<br>
         <b>✅ 발송 완료</b> — 실제로 나간 것들입니다.<br><br>
         <b>[❓ 발송 로직]</b> 을 누르면 메일이 나가는 순서를 그림으로 볼 수 있습니다.`,
        '한 번에 쏟지 않습니다. <b>하루 정해진 통수까지, 한 통과 다음 통 사이 몇 초를 쉬면서</b> 나갑니다. 수백 통이 한꺼번에 나가면 받는 쪽이 광고로 보고 스팸함으로 넘기는데, 그러면 <b>진행 중인 거래 메일까지</b> 같이 스팸이 됩니다.')}

      ${stepCard(3, '💬', '답장 받음 → 대화 진행 중 → 파트너십 확정',
        '답장이 온 곳은 <b>자동으로</b> [답장 받음]으로 옮겨집니다. 그다음부터는 사람이 단계를 옮깁니다.',
        `<b>💬 답장 받음</b> — 답이 온 곳. 회사명 옆 <b>[💬 대화 전체]</b> 로 주고받은 내용을 봅니다.<br>
         <b>🤝 대화 진행 중 · ⭐ 파트너십 확정</b> — 회사별 <b>카드</b>로 봅니다.
           카드를 누르면 그 회사와 오간 대화가 <b>요약 + 최근 3통</b>으로 열리고, 나머지는 <b>[이전 대화 더 보기]</b>로 펼칩니다.<br>
         <b>[+ 업체 직접 추가]</b> — 이 앱을 쓰기 전부터 메일로 거래하던 곳을 직접 넣습니다.
           넣으면 <b>이미 받아둔 메일이 자동으로 붙어</b> 대화 이력이 바로 보입니다.`,
        '직접 추가한 곳에는 <b>콜드메일이 나가지 않습니다.</b> 이미 연락이 닿은 곳이라 처음 보내는 소개 메일을 받으면 곤란하기 때문입니다.')}

      ${stepCard(4, '📥', '받은 메일함 · 회신 필요 · 기한 관리 — 답장을 봅니다',
        '이카운트 메일함에서 가져온 메일입니다. <b>앱을 열 때 자동으로</b> 새 메일을 당겨오고, <b>메일마다 AI가 번역·요약·회신 필요 여부·기한</b>을 붙여 둡니다.',
        `<b>📨 오늘 온 메일</b> — 폴더 구분 없이 오늘 온 것만 모아 봅니다.<br>
         <b>폴더</b> — 거래처 폴더 → <b>❔ 미분류</b> → <b>📢 광고·자동발송</b> 순입니다. 광고·인증번호·뉴스레터는 자동으로 광고 폴더에 모이고 숫자에서 빠집니다.
           미분류 메일은 제목 앞 <b>[❔ 폴더 지정]</b> 으로 그 자리에서 넣습니다.<br>
         <b>메일 열기</b> — <b>왼쪽 반은 받은 편지, 오른쪽 반은 답장 칸</b>입니다. 분석이 끝난 메일은 위에 <b>✅ AI 분석 완료</b>와 요약이 보입니다.<br>
         <b>첨부파일</b> — 본문 아래 파일 단추를 누르면 내려받습니다.<br>
         <b>답장</b> — 한국어로 요지만 적고 <b>[🧠 초안 생성]</b> 을 누르면 AI가 상대 언어로 초안을 써 줍니다. 글꼴·크기도 바꿀 수 있습니다.<br>
         <b>⚠️ 회신 필요</b> — 상대가 물어봤는데 아직 답하지 않은 메일만 모읍니다. 14일이 지난 것과 이미 답장한 것은 빠집니다.<br>
         <b>⏰ 기한 관리</b> — 본문에서 찾은 날짜(회신 기한·미팅·신청 마감) 순으로 봅니다.<br>
         <b>↗ 보낸 메일</b> — 우리가 보낸 메일도 대화 흐름을 보려고 함께 가져옵니다. 할 일로 세지 않습니다.`,
        '초안 생성은 <b>자동으로 발송되지 않습니다.</b> 내용을 고치고 [보내기]를 눌러야 나갑니다. 아직 분석하지 않은 메일의 <b>[🧠 AI 분석]</b> 은 누를 때만 건당 약 ₩5~20이 듭니다.')}

      ${stepCard(5, '📥', '직접 올린 업체 — 가진 목록이 있을 때',
        '대표님이 따로 가진 업체 목록이 있을 때 올리는 곳입니다. 올린 파일은 <b>올린 날짜별 폴더</b>로 들어가고 사라지지 않습니다.',
        `<b>[⬆ 엑셀·CSV 올리기]</b> — <b>CSV 파일</b>을 올립니다. 엑셀 파일은 <b>[다른 이름으로 저장 → CSV UTF-8]</b>로 저장한 뒤 올려 주세요.<br>
         <b>[📚 올린 업체 목록]</b> — 폴더를 열어 <b>[🔎 직접 검토]</b> 로 한 회사씩 고릅니다. 이미 AI 검증 완료에 있는 업체·중복·주소가 틀린 곳은 자동으로 빠집니다.<br>
         AI 가 무관으로 본 곳은 <b>보관함</b>으로 갑니다 — [🗂 지금까지 고른 결과 보기]의 <b>📦 보관함</b> 탭에서 볼 수 있습니다.`,
        '올린 업체의 AI 검증은 <b>누를 때만 요금이 나갑니다.</b> 저절로 돌아가는 일은 없습니다.')}

      ${stepCard(6, '📬', '메일 계정 관리 — 보내는 주소와 서명',
        '메일을 보낼 회사 주소와 서명을 등록합니다. <b>대표 계정</b>을 정하면 받은 메일함·회신 필요·기한 관리가 그 계정 기준으로 바뀝니다.',
        `<b>[+ 계정 추가]</b> 로 등록하고 <b>[✏ 수정]</b> 에서 보내는 사람 이름·직함·회사·전화를 채웁니다.<br>
         이 정보가 메일 끝 <b>서명</b>으로 붙습니다. 국내 업체에 가는 메일이므로 <b>국문으로</b> 적어 주세요.`,
        '')}

      ${stepCard(7, '📝', '메일 양식 — 보낼 문구를 정합니다',
        '보낼 메일의 제목과 본문을 미리 만들어 두는 곳입니다. [발송 관리]에서 골라 씁니다.',
        `<b>[+ 새 양식 작성]</b> 으로 만들고, <b>[✏ 수정]</b> 으로 고칩니다. 글꼴·크기·색도 바꿀 수 있습니다.<br>
         <b>[회사명]</b> 처럼 대괄호로 적어두면 <b>회사마다 그 회사 이름으로 바뀌어</b> 나갑니다.<br>
         편집 화면 아래 <b>👁 실제 발송 미리보기</b>에서 회사를 바꿔 가며 받는 사람이 볼 모습을 확인합니다.`,
        '양식을 고치면 <b>다음 발송부터</b> 적용됩니다. 이미 예약된 메일은 예약 당시 문구로 나갑니다.')}

      <!-- 지금 발송이 열려 있는가 -->
      <div id="guideLockBox" style="margin-top:14px"></div>

      <!-- 안전장치 -->
      <div style="background:var(--bg-surface);border:1px solid var(--border-default);
                  border-radius:14px;padding:20px 22px">
        <h3 style="margin:0 0 6px;font-size:15.5px;font-weight:800;color:var(--text-primary)">
          🛡 저절로 사고가 나지 않게 해둔 것
        </h3>
        <div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:12px">
          아래는 화면에서 끌 수 없습니다. 실수로 눌러도 이 선을 넘지 않습니다.
        </div>
        ${[
          ['고른 곳에만 나갑니다', '[발송 관리]로 옮긴 업체에만 메일이 나갑니다. AI 검증 완료에 있는 나머지는 나가지 않습니다.'],
          ['하루 통수 제한', '하루에 정해진 통수를 넘지 않습니다. 남은 것은 다음 날로 넘어갑니다.'],
          ['한 통씩 쉬어 가며', '한 통과 다음 통 사이에 간격을 둡니다. 한꺼번에 쏟으면 스팸으로 걸립니다.'],
          ['같은 곳에 3번까지', '한 업체에 최대 3번(첫 메일 + 재발송 2회)만 나갑니다.'],
          ['48시간 간격', '같은 곳에 이틀 안에 두 번 나가지 않습니다.'],
          ['답장이 오면 멈춤', '답장이 온 곳에는 예약된 재발송이 나가지 않습니다.'],
          ['지우지 않습니다', '검증 실패·보관함으로 보낸 것도 DB에서 지우지 않습니다. 언제든 되돌릴 수 있습니다.'],
        ].map(([t, d]) => `
          <div style="display:flex;gap:11px;padding:9px 0;border-top:1px solid var(--border-subtle)">
            <span style="color:#16a34a;font-weight:800;flex-shrink:0">✓</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${t}</div>
              <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-top:2px">${d}</div>
            </div>
          </div>`).join('')}
      </div>

      <!-- 자주 묻는 것 -->
      <div style="background:var(--bg-surface);border:1px solid var(--border-default);
                  border-radius:14px;padding:20px 22px">
        <h3 style="margin:0 0 12px;font-size:15.5px;font-weight:800;color:var(--text-primary)">
          ❓ 자주 묻는 것
        </h3>
        ${[
          ['보내기를 눌렀는데 왜 바로 안 나가나요?',
           '예약으로 깔리기 때문입니다. 정해진 통수씩 나눠서 나갑니다. [📅 예약 발송] 탭에서 언제 누구에게 나갈지 볼 수 있습니다.'],
          ['예약 시각이 지났는데 안 나갑니다.',
           '예약을 실제로 내보내는 작업이 하루 한 번 돕니다. 지금 당장 보내려면 [📅 예약 발송] 탭의 <b>[⏱ 지금 예약분 내보내기]</b> 를 누르세요. 시각이 지난 것만 나가고 아직 안 된 것은 그대로 둡니다.'],
          ['업체가 목록에서 사라졌어요.',
           '답장이 오면 [💬 답장 받음] 으로 자동으로 옮겨갑니다. 지워진 것이 아니라 다음 단계로 넘어간 것입니다. 단계를 직접 옮겨도 마찬가지입니다.'],
          ['같은 곳에 또 보내고 싶은데 안 됩니다.',
           '한 곳에 최대 3번까지만 나갑니다. 마지막 발송 후 48시간도 지나야 합니다. 스팸으로 걸리지 않기 위한 제한입니다.'],
          ['메일 문구를 바꾸고 싶어요.',
           '[📝 메일 양식] 에서 [✏ 수정] 으로 고쳐 저장하면 다음 발송부터 적용됩니다. 이번 한 번만 다르게 보내려면 발송 화면에서 직접 고치면 됩니다.'],
          ['받은 메일이 안 보입니다.',
           '앱을 열면 자동으로 가져옵니다. 방금 온 메일을 당장 보려면 받은 메일함의 <b>[📥 메일 가져오기]</b> 를 누르세요.'],
          ['받은 메일함 숫자가 이상합니다.',
           '[📬 메일 계정 관리] 의 대표 계정 기준으로 셉니다. 대표 계정을 바꾸면 그 계정 메일함으로 바뀝니다. 광고·자동발송과 우리가 보낸 메일은 할 일 숫자에서 빠집니다.'],
          ['AI 검증·AI 분석은 돈이 드나요?',
           '네, 누를 때마다 비용이 듭니다. 그래서 <b>버튼을 누를 때만</b> 돌아갑니다. 새로 들어온 메일의 1차 분석은 저희가 비용 없이 넣어 드리고 있어, 대부분 이미 <b>✅ AI 분석 완료</b>로 보입니다.'],
          ['첨부파일은 어디서 받나요?',
           '메일을 열면 본문 아래에 파일 단추가 있습니다. 누르면 이카운트 메일함에서 바로 받아옵니다. 원본 메일을 웹메일에서 지웠다면 받을 수 없다고 알려 줍니다.'],
          ['잘못 눌러서 엉뚱한 곳으로 보냈어요.',
           '단계를 옮긴 것이라면 그 화면에서 되돌릴 수 있습니다. <b>메일이 이미 나간 것은 되돌릴 수 없습니다</b> — 그래서 발송 전에 한 번 더 묻습니다.'],
        ].map(([q, a]) => `
          <div style="padding:11px 0;border-top:1px solid var(--border-subtle)">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Q. ${q}</div>
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.75">${a}</div>
          </div>`).join('')}
      </div>
    </div>`;

  // 발송 잠금 상태는 서버에서 받아 채운다 — 설명서에 고정 문구로 박아두면
  // 잠금을 푼 뒤에도 "테스트 중" 이라고 남아 거짓말이 된다.
  loadOutboundStatus().then((lock) => {
    const box = document.getElementById('guideLockBox');
    if (!box) return;
    box.innerHTML = lock && lock.locked ? `
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:14px;padding:18px 22px">
        <div style="font-size:14.5px;font-weight:800;color:#78350f;margin-bottom:6px">
          🔒 지금은 테스트 중입니다
        </div>
        <div style="font-size:12.5px;color:#78350f;line-height:1.75">
          실제 업체로는 메일이 <b>나가지 않습니다</b>.
          ${(lock.testRecipients || []).length
            ? `테스트 주소 <b style="font-family:monospace">${(lock.testRecipients || []).map(escapeHtml).join(', ')}</b> 로만 실제 발송됩니다.`
            : ''}
          나머지는 버튼을 눌러도 "발송 잠금 중" 으로 기록만 남습니다.<br>
          화면을 미리 익혀 두셔도 <b>사고가 나지 않습니다.</b>
        </div>
      </div>` : `
      <div style="background:#eff6ff;border:1px solid #2563eb;border-radius:14px;padding:18px 22px">
        <div style="font-size:14.5px;font-weight:800;color:#1e3a8a;margin-bottom:6px">
          📤 실제 발송이 열려 있습니다 — 누르면 진짜로 나갑니다
        </div>
        <div style="font-size:12.5px;color:#1e3a8a;line-height:1.75">
          <b>[발송 관리 → 보낼 메일]</b> 에 있는 곳으로만 나갑니다.
          [AI 검증 완료]에 있는 나머지는 [발송 관리로 이동]하기 전까지 나가지 않습니다.<br>
          하루 최대 <b>${(lock && lock.dailyCap) || 300}통</b> ·
          한 통 사이 <b>${Math.round(((lock && lock.intervalMs) || 8000) / 1000)}초</b> ·
          같은 곳에는 48시간 안에 다시 나가지 않습니다.
        </div>
      </div>`;
  }).catch(() => {});
}

function outboxPreviewVars(lead) {
  const out = {};
  for (const v of (state.email.variables || [])) {
    out[v.key] = (lead && lead[v.key]) || v.example || '';
  }
  // 변수 목록을 아직 못 받았어도 회사명 등은 그 회사 값으로 보이게 한다
  for (const k of ['Company', 'Region', 'BuyerContact', 'Title', 'Email', 'Phone']) {
    if (lead && lead[k]) out[k] = lead[k];
  }
  out.SenderName = '요기보';
  out.SenderCompany = '요기보';
  out.SenderEmail = _mailerEnvCache?.from || 'partnerships@yogico.kr';
  return out;
}
// 한글 마커 → 변수. 서버 lib/mailer.ts KO_ALIAS_TO_KEY 와 같아야 미리보기와 실제 발송이 같다.
// (예전에는 {{Company}} 만 바꿔서, 양식에 [회사명] 을 쓰면 미리보기에 [회사명] 이 그대로 떠
//  "어느 회사에 가는 메일인지" 헷갈렸다 — 대표님 피드백 2026-09-14)
const OUTBOX_KO_MARKERS = {
  '회사명': 'Company', '상대회사': 'Company', '상대 회사명': 'Company',
  '받는사람': 'BuyerContact', '담당자': 'BuyerContact', '담당자 이름': 'BuyerContact',
  '담당자 직함': 'Title', '담당자 이메일': 'Email', '담당자 전화번호': 'Phone', '지역': 'Region',
};
/**
 * 양식의 {{Key}} · [한글마커] 를 그 회사 값으로 바꾼다.
 * opts.html      — 바뀐 자리를 노란 표시로 감싼 HTML 을 돌려준다 (회사마다 바뀌는 자리가 보이게)
 * opts.escapeText — 원문이 평문일 때 나머지 글자를 이스케이프한다 (html 과 함께)
 */
function outboxSubstitute(src, vars, opts = {}) {
  const text = String(src || '');
  const re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}|\[([^\[\]\n]+?)\]/g;
  let out = '';
  let last = 0;
  let m;
  const esc = (t) => (opts.html && opts.escapeText ? escapeHtml(t) : t);
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    last = m.index + m[0].length;
    const key = m[1] || OUTBOX_KO_MARKERS[String(m[2] || '').trim()];
    const val = key && vars[key] != null && vars[key] !== '' ? String(vars[key]) : null;
    if (!key || val == null) { out += esc(m[0]); continue; }
    out += opts.html
      ? `<span class="ob-var" title="회사마다 바뀌는 자리" style="background:#fef3c7;color:#92400e;border-radius:4px;padding:0 3px;font-weight:700">${escapeHtml(val)}</span>`
      : val;
  }
  return out + esc(text.slice(last));
}
/** 테스트 메일 받을 주소 — 사람이 적은 주소가 있으면 그것, 없으면 보내는 계정(본인 메일) */
function outboxTestTo() {
  if (_outboxCompose.testToEdited && _outboxCompose.testTo) return _outboxCompose.testTo;
  const acc = outreachAccounts().find((a) => a._id === _outboxCompose.mailAccountId) || outreachAccount();
  return (acc && (acc.fromAddress || acc.smtpUser)) || '';
}

/** 🧪 테스트 메일 보내기 — 저장된 양식으로 실제 발송과 같은 모양을 만들어 바로 보낸다 (/api/mail/test-send) */
async function sendOutboxTestMail(ready) {
  const to = (document.getElementById('obTestTo')?.value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(to)) { alert('받을 메일 주소를 확인해 주세요.'); return; }
  if (!_outboxCompose.templateId) { alert('메일 양식을 먼저 고르세요.'); return; }
  const acc = outreachAccounts().find((a) => a._id === _outboxCompose.mailAccountId) || outreachAccount();
  const note = _outboxCompose.dirty ? '\n\n※ 이 화면에서 고친 문구가 아니라 저장된 양식으로 보냅니다 (업체 발송도 저장된 양식으로 나갑니다).' : '';
  if (!confirm(`테스트 메일을 보냅니다.\n\n받는 주소  ${to}\n보내는 주소  ${acc ? (acc.fromAddress || acc.smtpUser) : '(대표 계정)'}\n회사명 자리  Acme Beauty Co. (예제 업체)${note}`)) return;
  const btn = document.getElementById('obTestSendBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 보내는 중...'; }
  try {
    const r = await safeJsonFetch('/api/mail/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // previewLeadId 를 안 보내면 서버가 예제 업체(Acme Beauty Co.) 값으로 채운다 (api/mail/test-send)
      body: JSON.stringify({ to, templateId: _outboxCompose.templateId, mailAccountId: _outboxCompose.mailAccountId || undefined }),
    });
    if (!r?.success) throw new Error(r?.error || '보내지 못했습니다');
    alert(`✅ 테스트 메일을 보냈습니다${r.dryRun ? ' (DRY RUN — 실제로는 나가지 않음)' : ''}\n\n${r.to} 메일함을 확인하세요.\n제목: ${r.subject}${r.attachments ? `\n첨부 ${r.attachments}개` : ''}`);
  } catch (e) {
    alert(`테스트 메일을 보내지 못했습니다: ${(e && e.message) || e}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🧪 테스트 메일 보내기'; }
  }
}

/** 미리보기 받는 사람 칸 — 회사명과 주소를 함께 */
function outboxPreviewToHtml(lead) {
  if (!lead) return '—';
  return `<span style="font-family:inherit;font-weight:800;color:var(--text-primary)">${escapeHtml(lead.Company || '')}</span>`
    + ` <span style="font-family:monospace">${escapeHtml(lead.Email || '—')}</span>`;
}

/* ═══════════════════════════════════════════════════════════════
   발송 관리 — 보낼 메일 → 예약 발송 → 발송 완료

   메일이 지나가는 순서대로 목록 셋으로 나눈다.
     ✉️ 보낼 메일   — 발송 리스트(queued)로 옮겨둔 곳. 여기서 묶음 발송/예약.
     📅 예약 발송   — 예약을 잡아둔 것. 시각이 되면 자동으로 아래로 내려간다.
     ✅ 발송 완료   — 실제로 나간 것. 답장이 오면 [답장 받음]으로 빠진다.
   ═══════════════════════════════════════════════════════════════ */
var _outboxTab = 'ready';             // ready / scheduled / sent
var _outboxReadyIds = [];             // [보낼 메일] 이 지금 화면에 띄운 대상 (모달과 공유)
var _outboxReadyPage = 1;             // [보낼 메일] 업체 목록 쪽 번호 (10곳씩)
const OUTBOX_PAGE_SIZE = 10;
var _outboundStatusCache = null;      // { locked, message, dailyCap, intervalMs, testRecipients }

// 보낼 메일 탭의 양식 — 화면 안에서 바로 고치고 미리 본다
var _outboxCompose = {
  templateId: null,
  mailAccountId: null,
  subject: '',
  body: '',
  previewLeadId: null,
  dirty: false,        // 사용자가 문구를 직접 고쳤으면 양식 값으로 덮지 않는다
  // ── 나눠 보내기 ──
  //
  // 여기 숫자를 크게 잡으면 **보내는 계정이 잠긴다.** 추측이 아니라 겪은 일이다.
  // 2026-09-16 구 시스템(mktCl)에서 1시간 34분 동안 409통을 쏟아붓자 이카운트가
  // 발신 주소를 끊었다 (554 5.7.1 Sender address rejected: Temporary disabled).
  // 병·의원 캠페인이 **돌아가는 도중에** 끊겨서, 남은 224곳이 전부 실패했다.
  //
  // 그때가 시간당 약 260통이었으므로 그 아래로 크게 낮춘다.
  // 30곳 × 30분 = 시간당 60통. 224곳이면 8묶음, 약 3시간 30분에 걸쳐 나간다.
  // 느린 것이 문제가 아니다 — 계정이 잠기면 그날 발송이 통째로 멈추고,
  // 같은 도메인으로 나가는 실거래 메일까지 같이 막힌다.
  batchSize: 30,
  testTo: '',                     // 🧪 테스트 메일 받을 주소 — 비어 있으면 보내는 계정(본인 메일)
  testToEdited: false,            // 사람이 직접 고쳤으면 계정을 바꿔도 덮지 않는다
  intervalMinutes: 30,
  startNow: true,
  startAt: '',         // startNow=false 일 때 쓰는 datetime-local 값
  // ── 자동 재발송 ──
  followUp: true,
  followUpDays: 7,
};

/** 아웃바운드 잠금 상태 — 버튼을 눌러보기 전에 화면에서 알 수 있어야 한다 */
async function loadOutboundStatus(force) {
  if (!force && _outboundStatusCache) return _outboundStatusCache;
  try {
    const d = await safeJsonFetch('/api/mail/outbound-status');
    if (d && d.success) { _outboundStatusCache = d; return d; }
  } catch (e) { console.warn('outbound-status', e); }
  // 못 받아왔으면 잠긴 것으로 본다 — 모르는 채로 보내는 쪽이 더 위험하다
  _outboundStatusCache = { locked: true, message: '발송 가능 여부를 확인하지 못했습니다.', dailyCap: 0, intervalMs: 0 };
  return _outboundStatusCache;
}

var _schedStatusFilter = 'pending';   // pending / sent / failed / canceled / all

async function fetchScheduledMails(status) {
  const res = await fetch(`/api/mail/schedule?status=${encodeURIComponent(status)}&limit=500`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'load failed');
  return data.items || [];
}

async function renderOutboxPage() {
  els.content.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-tertiary)">로드 중...</div>`;

  // ── 한 번에 다 부른다 ──
  //
  // 예전에는 네 번을 차례로 기다렸다 (묶음 → 양식 → 계정 → 메일러 설정 → 리드).
  // 서로 필요로 하는 것이 없는데도 앞의 것이 끝나야 다음이 나갔다.
  // 서버가 서울에 있어도 한 번에 몇십 ms 씩 쌓이고, 리전이 어긋나 있으면
  // 한 번에 200ms 라 그것만으로 1초가 넘는다.
  //
  // 전부 독립이므로 한 묶음으로 보낸다. 느린 하나만큼만 기다리면 된다.
  const [lock, schedData, queuedRes, contactedRes] = await Promise.all([
    loadOutboundStatus(),
    safeJsonFetch('/api/mail/schedule?status=all&limit=500').catch(() => null),
    // 이 화면은 baseLeads 에 기대면 안 된다.
    // 사이드바에서 발송 관리로 바로 들어오면 그 배열이 비어 있어서, 옮겨둔
    // 곳이 있는데도 화면이 통째로 비어 보였다. 필요한 단계만 직접 가져온다.
    safeJsonFetch('/api/leads?stage=queued&limit=500').catch(() => null),
    safeJsonFetch('/api/leads?stage=contacted&limit=500').catch(() => null),
    loadStageCounts().catch(() => null),   // 발송 완료 탭의 "답장 와서 넘어간 곳"
    state.email.templates.length ? null : loadEmailTemplates().catch(() => {}),
    (_mailAccounts || []).length ? null : loadMailAccounts().catch(() => {}),
    refreshMailerEnv().catch(() => {}),
  ]);

  const all = (schedData && schedData.items) || [];
  let pending    = all.filter((i) => i.status === 'pending');
  const sentSched = all.filter((i) => i.status === 'sent');
  const failed   = all.filter((i) => i.status === 'failed');
  const canceled = all.filter((i) => i.status === 'canceled');

  const queuedLeads = ((queuedRes && queuedRes.data) || []).map((l) => ({ ...l, id: l.leadId }));
  let sentLeads = ((contactedRes && contactedRes.data) || []).map((l) => ({ ...l, id: l.leadId }));

  // 상세 팝업(openEditModal)은 baseLeads 에서 찾는다 — 여기서 가져온 것도 보이게 합친다
  const known = new Set(baseLeads.map((l) => l.id));
  const extra = [...queuedLeads, ...sentLeads].filter((l) => !known.has(l.id));
  if (extra.length) baseLeads = baseLeads.concat(extra);

  // 예약을 이미 잡아둔 곳은 '보낼 메일'에서 빼야 두 번 잡지 않는다
  const scheduledLeadIds = new Set(pending.map((i) => i.leadId));
  const hasEmail = (l) => l && l.Email && !/^Not found/i.test(l.Email) && /@/.test(l.Email);
  // 보낼 메일 = 사람이 [발송 리스트로 옮기기] 를 눌러 queued 로 올린 것만.
  // 검증만 끝난 것(verified)까지 여기 넣으면 고르는 단계가 없어진다.
  let ready = queuedLeads.filter((l) =>
    !l.deleted && hasEmail(l) && !scheduledLeadIds.has(l.leadId));

  // ── 분류별로 나눠 보기 (public/kr-screens.js) ──────────────
  // 224곳이 한 덩어리면 '전체 발송' 말고 할 수 있는 일이 없는데, 나가는 문구는
  // 분류마다 다르다. 실제 작업 단위는 "리조트 139곳을 리조트 양식으로" 이므로
  // 화면도 그 단위로 갈라 둔다. 아래부터는 거른 목록으로만 움직인다.
  const leadLookup = new Map(baseLeads.map((l) => [l.leadId || l.id, l]));
  const readyAll = ready;
  const pendingAll = pending;
  const sentLeadsAll = sentLeads;
  ready = krFilterByCategory(readyAll, leadLookup);
  pending = krFilterByCategory(pendingAll, leadLookup);
  sentLeads = krFilterByCategory(sentLeadsAll, leadLookup);

  _outboxReadyIds = ready.map((l) => l.leadId);
  outboxSyncCompose(ready);

  // 탭은 "몇 곳인지" 와 "그게 어느 업체인지" 를 같이 알려야 한다.
  // 목록이 아래에 있어도 스크롤해야 보이니, 탭에서 바로 열 수 있게 한다.
  const tab = (key, icon, label, n, tone) => {
    const on = _outboxTab === key;
    return `<div class="outbox-tab" data-tab="${key}"
      style="flex:1;min-width:172px;padding:11px 14px;border-radius:10px;cursor:pointer;
             border:1px solid ${on ? tone : 'var(--border-default)'};
             background:${on ? tone + '14' : 'var(--bg-surface)'};
             box-shadow:${on ? 'inset 0 0 0 1px ' + tone : 'none'}">
      <div style="font-size:11.5px;font-weight:700;color:${on ? tone : 'var(--text-tertiary)'}">${icon} ${label}</div>
      <div style="display:flex;align-items:baseline;gap:5px;margin-top:1px">
        <span style="font-size:20px;font-weight:800;color:var(--text-primary);line-height:1.2">${n.toLocaleString()}</span>
        <span style="font-size:12px;font-weight:700;color:var(--text-tertiary)">곳</span>
      </div>
      ${n ? `<button type="button" class="outbox-peek" data-peek="${key}"
        title="어느 업체인지 목록으로 봅니다"
        style="margin-top:6px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;
               border:1px solid ${tone}55;background:${tone}12;color:${tone};cursor:pointer">
        🔍 업체 보기
      </button>` : `<div style="margin-top:6px;font-size:11px;color:var(--text-quaternary)">해당 없음</div>`}
    </div>`;
  };

  els.content.innerHTML = `
    <div style="max-width:1180px;margin:0 auto">
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
        <button id="outboxHowBtn" type="button"
          title="메일이 어떤 순서로 나가는지 봅니다"
          style="font-size:12px;font-weight:700;padding:6px 13px;border-radius:99px;cursor:pointer;
                 background:var(--brand-soft,#eef2ff);color:var(--brand-text,#4338ca);
                 border:1px solid var(--brand,#c7d2fe)">
          ❓ 발송 로직 — 메일이 나가는 순서
        </button>
      </div>
      ${outboxLockBannerHtml(lock, ready.length)}

      <!-- 위 칸의 숫자는 분류를 거르기 전 '전체'다 — 분류를 고른 채로도
           "원래 몇 곳짜리 일인지"가 보여야 한다. -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">
        ${tab('ready',     '✉️', '보낼 메일',  readyAll.length,      '#2563eb')}
        ${tab('scheduled', '📅', '예약 발송',  pendingAll.length,    '#b45309')}
        ${tab('sent',      '✅', '발송 완료',  sentSched.length + sentLeadsAll.length, '#166534')}
      </div>

      ${krOutboxCategoryBarHtml(
        _outboxTab === 'ready' ? readyAll : _outboxTab === 'scheduled' ? pendingAll : sentLeadsAll,
        leadLookup,
      )}

      <div id="outboxBody"></div>
    </div>`;

  const body = document.getElementById('outboxBody');
  if (_outboxTab === 'ready')     body.innerHTML = outboxReadyHtml(ready, lock);
  if (_outboxTab === 'scheduled') body.innerHTML = outboxScheduledHtml(pending, failed, canceled);
  if (_outboxTab === 'sent')      body.innerHTML = outboxSentHtml(sentSched, sentLeads);

  krBindOutboxCategoryBar(() => renderOutboxPage());

  document.querySelectorAll('.outbox-tab').forEach((b) =>
    b.addEventListener('click', (e) => {
      if (e.target.closest('.outbox-peek')) return;   // 목록 보기는 탭 전환이 아니다
      _outboxTab = b.dataset.tab;
      renderOutboxPage();
    }));

  document.querySelectorAll('.outbox-peek').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = b.dataset.peek;
      if (k === 'ready') openOutboxPeek('보낼 메일', ready, { kind: 'lead' });
      if (k === 'scheduled') openOutboxPeek('예약 발송', pending, { kind: 'schedule' });
      if (k === 'sent') openOutboxPeek('발송 완료', sentLeads, { kind: 'lead', sent: true });
    }));

  outboxBindComposeInputs(ready);
  document.getElementById('outboxGoVerified')?.addEventListener('click', () =>
    document.querySelector('.nav-item[data-view="pipeline-verified"]')?.click());

  document.getElementById('outboxSendBtn')?.addEventListener('click', () => runOutboxCampaign(ready, lock));

  // 예약분을 지금 처리 — 크론이 하루 한 번이라 테스트 때 기다릴 수 없어 둔다
  document.getElementById('outboxRunDue')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!confirm(
      '예약 시각이 이미 지난 건을 지금 내보냅니다.\n\n' +
      '아직 시각이 안 된 건은 그대로 둡니다.\n' +
      '하루 상한과 발송 간격은 그대로 적용됩니다.\n\n진행할까요?',
    )) return;
    b.disabled = true;
    const was = b.textContent;
    b.textContent = '⏳ 내보내는 중…';
    try {
      const r = await safeJsonFetch('/api/cron/process-schedules');
      if (!r || r.success === false) throw new Error(r?.error || '처리 실패');

      // 응답은 { processed, due, results:[{id, ok, error}], sentToday, dailyCap, stoppedFor }
      const res = r.results || [];
      const ok = res.filter((x) => x && x.ok).length;
      const ng = res.filter((x) => x && !x.ok);

      alert(
        `예약 처리 결과\n\n` +
        `시각이 된 건    ${r.due ?? 0}건\n` +
        `처리한 건       ${r.processed ?? 0}건\n` +
        `  → 보냄        ${ok}건\n` +
        `  → 실패        ${ng.length}건\n` +
        `오늘 누적       ${r.sentToday ?? 0} / ${r.dailyCap ?? '-'}통\n` +
        (r.stoppedFor === 'daily-cap' ? '\n※ 하루 상한에 걸려 멈췄습니다.\n' : '') +
        (r.stoppedFor === 'time-budget' ? '\n※ 시간이 길어져 멈췄습니다. 다시 누르면 이어서 나갑니다.\n' : '') +
        (r.skipped === 'daily-cap' ? '\n※ 오늘 상한을 이미 채워 한 통도 나가지 않았습니다.\n' : '') +
        (ng.length ? `\n실패 사유\n${ng.slice(0, 5).map((x) => ' · ' + (x.error || '알 수 없음')).join('\n')}\n` : '') +
        `\n[✅ 발송 완료] 탭에서 확인하세요.`,
      );
    } catch (err) {
      alert(`예약 처리 실패: ${(err && err.message) || err}`);
    } finally {
      b.disabled = false;
      b.textContent = was;
      renderOutboxPage();
    }
  });
  document.getElementById('outboxHowBtn')?.addEventListener('click', () => openSendLogicModal(lock));
  document.getElementById('obGoTemplates')?.addEventListener('click', () => {
    state.email.mode = 'list';
    document.querySelector('.nav-item[data-view="tool-b2b-email"]')?.click();
  });

  document.querySelectorAll('.outbox-sched-cancel').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('이 예약을 취소합니다. 이 회사에는 메일이 나가지 않습니다.')) return;
      try {
        await safeJsonFetch(`/api/mail/schedule/${b.dataset.schedId}`, { method: 'DELETE' });
        renderOutboxPage();
      } catch (e) { alert(`취소 실패: ${e.message || e}`); }
    }));

  // baseLeads 는 id 를 leadId 로 맞춰 두므로 그대로 상세 팝업을 연다
  document.querySelectorAll('.outbox-lead-open').forEach((el) =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('.outbox-unqueue')) return;   // 빼기는 상세 열기가 아니다
      openEditModal(el.dataset.leadId);
    }));

  // 발송 리스트에서 빼기 — 잘못 올렸거나 이미 컨택된 곳을 되돌린다.
  // 이 화면에는 단계 이동 버튼이 없어서, 한 번 올리면 뺄 방법이 없었다.
  document.querySelectorAll('.outbox-unqueue').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = b.dataset.leadId;
      const lead = ready.find((l) => l.leadId === id);
      const name = (lead && lead.Company) || id;
      if (!confirm(`"${name}" 을(를) 발송 리스트에서 뺍니다.

[✅ 검증 완료] 로 되돌아가고, 메일은 나가지 않습니다.
진행할까요?`)) return;
      b.disabled = true; b.textContent = '⏳';
      try {
        const r = await safeJsonFetch('/api/leads/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadIds: [id], undo: true }),
        });
        if (!r?.success) throw new Error(r?.error || '되돌리기 실패');
        invalidateServerPage();
        loadStageCounts(true);
        renderOutboxPage();
      } catch (err) {
        alert('되돌리기 실패: ' + (err.message || 'unknown'));
        b.disabled = false; b.textContent = '↩ 빼기';
      }
    }));
}

/** 발송 잠금 배너 — 지금 메일이 나가는 상태인지 화면 맨 위에서 못 박는다 */
function outboxLockBannerHtml(lock, readyCount) {
  if (!lock || !lock.locked) {
    // 열려 있을 때를 초록으로 두면 "괜찮다"로 읽힌다.
    // 여기서부터는 진짜 업체로 메일이 나가므로, 상태가 한눈에 보여야 한다.
    // 특히 "어디로 나가는가"(발송 리스트에 있는 곳만)를 같이 적는다 —
    // 검증 완료 수백 곳으로 나가는 줄 알고 겁내거나, 반대로 전부 나가는 줄
    // 모르고 누르는 일을 둘 다 막기 위해서다.
    const n = typeof readyCount === 'number' ? readyCount : null;
    return `
      <div style="padding:14px 17px;background:#eff6ff;border:1px solid #2563eb;border-radius:11px;
                  display:flex;align-items:flex-start;gap:12px">
        <span style="font-size:19px">📤</span>
        <div style="flex:1;font-size:13px;color:#1e3a8a;line-height:1.65">
          <b style="font-size:14px">실제 발송이 열려 있습니다 — 누르면 진짜로 나갑니다</b>
          <div style="margin-top:4px">
            ${n === null
              ? '아래 <b>[보낼 메일]</b>에 있는 곳으로만 나갑니다.'
              : n === 0
                ? '지금 <b>[보낼 메일]이 비어 있어</b> 나갈 곳이 없습니다. 검증 완료에서 옮겨야 대상이 됩니다.'
                : `지금 나갈 수 있는 곳은 <b>[보낼 메일] ${n.toLocaleString()}곳</b>뿐입니다.
                   AI 검증 완료에 있는 나머지는 [발송 관리로 이동]하기 전까지 나가지 않습니다.`}
            ${lock?.dailyCap
              ? `<br><span style="color:#1d4ed8">하루 최대 ${lock.dailyCap}통 · 한 통 사이 ${Math.round((lock.intervalMs || 0) / 1000)}초 ·
                 같은 곳에는 48시간 안에 다시 안 나갑니다</span>` : ''}
          </div>
        </div>
      </div>`;
  }
  const tests = lock.testRecipients || [];
  return `
    <div style="padding:13px 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:11px;
                display:flex;align-items:flex-start;gap:11px">
      <span style="font-size:19px">🔒</span>
      <div style="flex:1;font-size:13px;color:#78350f;line-height:1.65">
        <b style="font-size:14px">지금은 실제 업체로 메일이 나가지 않습니다 (테스트 중)</b>
        <div style="margin-top:3px">
          ${tests.length
            ? `테스트 주소 <b style="font-family:monospace">${tests.map(escapeHtml).join(', ')}</b> 로만 실제 발송됩니다.
               나머지 업체는 눌러도 나가지 않고 "발송 잠금 중"으로 기록됩니다.`
            : '예약을 잡아두는 것까지는 됩니다. 잠금이 풀리기 전에는 예약 시각이 지나도 발송되지 않습니다.'}
        </div>
      </div>
    </div>`;
}

/**
 * 탭에서 바로 여는 업체 목록 팝업.
 *
 * 목록은 화면 아래에도 있지만, 스크롤해야 보이니 "지금 몇 곳인지"만 읽고
 * 어느 업체인지는 모르고 지나가기 쉽다. 탭 숫자 옆에서 바로 열 수 있게 한다.
 */
function openOutboxPeek(title, items, opts) {
  document.getElementById('outboxPeekRoot')?.remove();
  const kind = (opts && opts.kind) || 'lead';
  const showSent = !!(opts && opts.sent);

  const rowsHtml = items.map((it) => {
    // 예약 항목은 lead 가 안에 들어 있다
    const l = kind === 'schedule' ? (it.lead || {}) : it;
    const leadId = kind === 'schedule' ? it.leadId : it.leadId;
    const email = kind === 'schedule' ? (it.to || l.Email || '') : (l.Email || '');
    const when = kind === 'schedule'
      ? new Date(it.scheduledFor).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : (l.lastEmailSentAt ? new Date(l.lastEmailSentAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '');
    const sentN = Array.isArray(l.emailHistory)
      ? l.emailHistory.filter((h) => h && h.status === 'sent').length : 0;

    return `
      <tr class="peek-row" data-lead-id="${escapeAttr(leadId || '')}"
          style="border-top:1px solid var(--border-subtle);cursor:pointer"
          title="클릭하면 이 업체의 상세 정보가 열립니다">
        <td style="padding:9px 14px;max-width:280px">
          <div style="font-weight:700;color:var(--text-primary);overflow:hidden;
                      text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.Company || email || leadId || '(이름 없음)')}</div>
          ${(l.TypeKo || l.Type) ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;
               overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(truncate(l.TypeKo || l.Type, 54))}</div>` : ''}
        </td>
        <td style="padding:9px 10px;white-space:nowrap;color:var(--text-secondary);font-size:12px">${escapeHtml(l.Region || '—')}</td>
        <td style="padding:9px 10px;font-family:monospace;font-size:11.5px;color:var(--text-tertiary);
                   max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${escapeAttr(email)}">${escapeHtml(email || '—')}</td>
        <td style="padding:9px 14px;white-space:nowrap;text-align:right;font-size:11.5px;color:var(--text-tertiary)">
          ${kind === 'schedule'
            ? `${escapeHtml(when)} 예정`
            : (showSent
                ? `${sentN ? `메일 ${sentN}회` : ''}${when ? ` · ${when}` : ''}`
                : (sentN ? `이미 ${sentN}회 보냄` : '아직 안 보냄'))}
        </td>
      </tr>`;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `
    <div id="outboxPeekRoot" style="position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,.5);
         display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="background:var(--surface-1);border-radius:16px;max-width:820px;width:100%;
                  max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="padding:17px 22px;border-bottom:1px solid var(--border);display:flex;
                    align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--text-primary)">
              ${escapeHtml(title)} · ${items.length.toLocaleString()}곳
            </div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">
              ${kind === 'schedule'
                ? '예약된 순서대로 나갑니다. 회사를 누르면 상세가 열립니다.'
                : '회사를 누르면 상세 정보가 열립니다.'}
            </div>
          </div>
          <button id="outboxPeekClose" type="button"
            style="border:none;background:none;font-size:22px;line-height:1;cursor:pointer;
                   color:var(--text-tertiary);padding:2px 6px">×</button>
        </div>
        <div style="overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead>
              <tr style="background:var(--surface-2);color:var(--text-secondary);text-align:left;
                         position:sticky;top:0">
                <th style="padding:9px 14px;font-weight:700">회사 · 업종</th>
                <th style="padding:9px 10px;font-weight:700;width:110px">지역</th>
                <th style="padding:9px 10px;font-weight:700;width:220px">이메일</th>
                <th style="padding:9px 14px;font-weight:700;width:150px;text-align:right">
                  ${kind === 'schedule' ? '발송 예정' : '발송 이력'}
                </th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div style="padding:12px 22px;border-top:1px solid var(--border);display:flex;
                    justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-size:11.5px;color:var(--text-tertiary)">
            이 목록은 아래 화면에도 그대로 있습니다.
          </span>
          <button id="outboxPeekOk" type="button" class="button primary"
            style="font-size:13px;padding:9px 20px">닫기</button>
        </div>
      </div>
    </div>`);

  const root = document.getElementById('outboxPeekRoot');
  const close = () => { root?.remove(); syncBodyScrollLock?.(); };
  document.getElementById('outboxPeekClose')?.addEventListener('click', close);
  document.getElementById('outboxPeekOk')?.addEventListener('click', close);
  bindBackdropDismiss(root, close);
  root?.querySelectorAll('.peek-row').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = tr.dataset.leadId;
      if (!id) return;
      close();
      openEditModal(id);
    });
  });
  syncBodyScrollLock?.();
}

/**
 * 발송 로직 설명 팝업 — 클라이언트에게 "메일이 어떤 순서로 나가는가"를 보여준다.
 *
 * 화면만 봐서는 눌렀을 때 무슨 일이 생기는지 알 수 없다. 특히 예약으로 깔린다는
 * 것, 답장이 오면 자동으로 빠진다는 것, 같은 곳에 3번까지만 나간다는 것은
 * 어디에도 적혀 있지 않으면 "왜 안 나가지" / "왜 또 나갔지" 로 이어진다.
 */
function openSendLogicModal(lock) {
  document.getElementById('sendLogicModalRoot')?.remove();

  const step = (n, title, body, tone) => `
    <div style="display:flex;gap:12px;padding:13px 0;border-top:1px solid var(--border-subtle)">
      <div style="flex-shrink:0;width:26px;height:26px;border-radius:50%;display:flex;
                  align-items:center;justify-content:center;font-size:12.5px;font-weight:800;
                  background:${tone || '#eef2ff'};color:${tone ? '#78350f' : '#4338ca'}">${n}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:800;color:var(--text-primary);margin-bottom:3px">${title}</div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.75">${body}</div>
      </div>
    </div>`;

  const tests = (lock && lock.testRecipients) || [];

  const html = `
    <div id="sendLogicModalRoot" style="position:fixed;inset:0;z-index:9998;
         background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="background:var(--surface-1);border-radius:16px;max-width:660px;width:100%;
                  max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;
                    align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--text-primary)">📨 메일이 나가는 순서</div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">
              버튼을 눌렀을 때 실제로 무슨 일이 일어나는지
            </div>
          </div>
          <button id="sendLogicClose" type="button"
            style="border:none;background:none;font-size:22px;line-height:1;cursor:pointer;
                   color:var(--text-tertiary);padding:2px 6px">×</button>
        </div>

        <div style="padding:6px 22px 18px;overflow-y:auto">
          ${step(1, '검증 완료에서 보낼 곳을 고릅니다',
            '체크한 뒤 <b>[📨 발송 관리로 이동]</b> 를 누릅니다. ' +
            '옮기지 않은 곳에는 메일이 나가지 않습니다.')}

          ${step(2, '보낼 메일에서 문구를 정합니다',
            '양식은 하나만 씁니다. <b>회사명 같은 부분만 각 회사 것으로 바뀌어</b> 나갑니다.<br>' +
            '오른쪽에서 회사를 바꿔 가며 실제로 갈 모습을 미리 볼 수 있습니다. ' +
            '보내는 주소도 여기서 고릅니다.')}

          ${step(3, '한 번에 쏟지 않고 나눠 보냅니다',
            '<b>하루 ' + (lock?.dailyCap || 20) + '통까지</b>, 한 통과 다음 통 사이 ' +
            '<b>' + Math.round((lock?.intervalMs || 8000) / 1000) + '초</b>를 쉬면서 내보냅니다. ' +
            '남은 것은 다음 날로 넘어갑니다.<br>' +
            '<span style="color:var(--text-tertiary)">한꺼번에 수백 통을 보내면 받는 쪽 메일서버가 ' +
            '광고성 대량 발송으로 보고 스팸함으로 넘깁니다. 그러면 같은 주소로 나가는 ' +
            '실제 거래 메일까지 함께 스팸 취급을 받습니다.</span>')}

          ${step(4, '예약 발송에 쌓입니다',
            '누른 즉시 나가는 것이 아니라 <b>예약</b>으로 깔립니다. ' +
            '어느 회사에 며칠 나갈지 [📅 예약 발송] 탭에서 볼 수 있고, ' +
            '나가기 전이면 <b>취소</b>할 수 있습니다.')}

          ${step(5, '매일 정해진 시각에 나갑니다',
            '예약된 메일은 <b>매일 오전 9시</b>에 하루 치만큼 나갑니다. ' +
            '나간 것은 [✅ 발송 완료] 탭에 <b>며칠에 · 몇 번째로</b> 보냈는지 남고, ' +
            '답이 없는 곳은 <b>무응답 N일</b> 로 표시됩니다.')}

          ${step(6, '답장이 오면 자동으로 빠집니다',
            '상대가 답장을 보내면 그 회사는 <b>[💬 답장 받음]</b> 으로 자동으로 옮겨가고 ' +
            '발송 관리에서 사라집니다. <b>더 이상 광고 메일이 나가지 않습니다.</b>')}

          ${step(7, '답이 없으면 7일 뒤 한 번 더',
            '<b>같은 곳에 최대 3번까지</b>만 나갑니다 (첫 메일 + 재발송 2번).<br>' +
            '중간에 답장이 오면 그 자리에서 멈춥니다.')}

          <div style="margin-top:16px;padding:13px 15px;background:var(--bg-surface-alt);
                      border:1px solid var(--border-default);border-radius:10px">
            <div style="font-size:12.5px;font-weight:800;color:var(--text-primary);margin-bottom:6px">
              🛡 안전장치
            </div>
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.8">
              · 같은 곳에 <b>최대 3회</b><br>
              · 마지막 발송 후 <b>48시간</b> 안에는 다시 나가지 않음<br>
              · 하루 총 <b>${(lock && lock.dailyCap) || 300}통</b>을 넘지 않음<br>
              · 메일 주소가 없는 곳은 발송 리스트로 옮겨지지 않음<br>
              · 이미 예약이 걸린 곳은 중복으로 잡히지 않음
            </div>
          </div>

          ${lock && lock.locked ? `
            <div style="margin-top:11px;padding:13px 15px;background:#fef3c7;
                        border:1px solid #fcd34d;border-radius:10px">
              <div style="font-size:12.5px;font-weight:800;color:#78350f;margin-bottom:5px">
                🔒 지금은 테스트 중입니다
              </div>
              <div style="font-size:12.5px;color:#78350f;line-height:1.8">
                실제 업체로는 메일이 <b>나가지 않습니다</b>.
                ${tests.length ? `테스트 주소 <b style="font-family:monospace">${tests.map(escapeHtml).join(', ')}</b> 로만 실제 발송됩니다.` : ''}<br>
                나머지는 눌러도 "발송 잠금 중" 으로 기록만 남습니다.
              </div>
            </div>` : ''}
        </div>

        <div style="padding:13px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
          <button id="sendLogicOk" type="button" class="button primary"
            style="font-size:13px;padding:9px 20px">알겠습니다</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  const root = document.getElementById('sendLogicModalRoot');
  const close = () => { root?.remove(); syncBodyScrollLock?.(); };
  document.getElementById('sendLogicClose')?.addEventListener('click', close);
  document.getElementById('sendLogicOk')?.addEventListener('click', close);
  bindBackdropDismiss(root, close);
  syncBodyScrollLock?.();
}

/**
 * 발송 실행 — 예약 큐에 깔아 두고, 크론이 시각이 된 것부터 내보낸다.
 *
 * "지금 보내기"도 즉시 루프를 돌리지 않고 지금 시각 예약으로 만든다.
 * 한 요청에서 수백 통을 연속 발송하면 서버리스 타임아웃에 걸리고, 어디까지
 * 나갔는지도 알 수 없게 된다. 예약으로 두면 한 통씩 상태가 남는다.
 */
async function runOutboxCampaign(ready, lock) {
  if (!ready.length) return;

  /**
   * 분류를 안 고르고 전체를 보낼 때는 **리드마다 그 리드 분류의 양식**으로 나간다
   * (서버의 byCategory). 224곳을 한 양식으로 보내면 호텔 문구가 요양병원으로 간다.
   *
   * 분류를 하나 골라 둔 상태면 화면에 보이는 것이 그 분류뿐이므로, 위에서 고른
   * 양식 하나를 그대로 쓴다 — 사람이 그 분류 전용 문구를 보면서 고른 것이다.
   */
  const perCategory = !_outboxCategory;
  if (!perCategory && !_outboxCompose.templateId) {
    alert('메일 양식을 먼저 고르세요.\n[📝 메일 양식]에서 만들 수 있습니다.');
    return;
  }
  const n = ready.length;
  const size = _outboxCompose.batchSize || n;
  const gap = _outboxCompose.intervalMinutes || 10;
  const batches = Math.max(1, Math.ceil(n / size));
  const acc = (_mailAccounts || []).find((a) => a._id === _outboxCompose.mailAccountId);

  const startAt = _outboxCompose.startNow ? null : _outboxCompose.startAt;
  if (!_outboxCompose.startNow) {
    if (!startAt) { alert('시작 시각을 골라 주세요.'); return; }
    if (new Date(startAt).getTime() < Date.now()) { alert('지난 시각으로는 보낼 수 없습니다.'); return; }
  }

  const lines = [
    `${krCurrentCategoryLabel() ? '[' + krCurrentCategoryLabel() + '] ' : ''}${n.toLocaleString()}곳에 메일을 보냅니다.`,
    '',
    perCategory
      ? '보내는 문구  업체마다 그 업체 분류의 양식 (학교·기업·병의원·리조트·스포츠)'
      : '보내는 문구  고른 양식 하나',
    `보내는 주소  ${acc ? acc.smtpUser : '(기본 계정)'}`,
    `내보내기     ${_outboxCompose.startNow ? '지금부터' : new Date(startAt).toLocaleString('ko-KR')} · ${size}곳씩 ${gap}분 간격 (${batches}번)`,
    _outboxCompose.followUp
      ? `자동 재발송  답 없으면 ${_outboxCompose.followUpDays}일 뒤 다시 (최대 3회 · 답장 오면 중단)`
      : '자동 재발송  안 함',
  ];
  if (lock?.locked) {
    const t = (lock.testRecipients || []).join(', ');
    lines.push('', `🔒 지금은 발송 잠금 중입니다 — 실제로 나가는 것은 ${t || '없음'} 뿐이고`,
      '   나머지는 "발송 잠금 중"으로 기록됩니다.');
  }
  lines.push('', '진행할까요?');
  if (!confirm(lines.join('\n'))) return;

  const btn = document.getElementById('outboxSendBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 예약을 깔고 있습니다...'; }
  try {
    const r = await safeJsonFetch('/api/mail/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadIds: ready.map((l) => l.leadId),
        ...(perCategory
          ? { byCategory: true }
          : { templateId: _outboxCompose.templateId }),
        mailAccountId: _outboxCompose.mailAccountId || undefined,
        startAt: startAt ? new Date(startAt).toISOString() : undefined,
        batchSize: size,
        intervalMinutes: gap,
        followUp: _outboxCompose.followUp,
        followUpDays: _outboxCompose.followUpDays,
      }),
    });
    if (!r?.success) throw new Error(r?.error || '예약 생성 실패');

    alert(
      `✅ ${r.scheduled.toLocaleString()}곳 예약 완료\n\n` +
      `${new Date(r.startAt).toLocaleString('ko-KR')} 부터\n` +
      `${r.batchSize}곳씩 ${r.intervalMinutes}분 간격 · 총 ${r.batches}번\n` +
      `마지막 묶음 ${new Date(r.lastAt).toLocaleString('ko-KR')}\n` +
      (r.skipped?.length ? `\n제외 ${r.skipped.length}곳 (메일 없음·이미 예약·발송 한도)\n` : '') +
      `\n[📅 예약 발송] 탭에서 확인·취소할 수 있습니다.`,
    );
    _outboxTab = 'scheduled';
    invalidateServerPage();
    await loadLeads({ force: true });
    renderOutboxPage();
  } catch (e) {
    alert('발송 예약 실패: ' + (e.message || 'unknown'));
    if (btn) {
      const catLabel = krCurrentCategoryLabel();
      btn.textContent = `✉️ ${catLabel ? catLabel + ' ' : ''}${n.toLocaleString()}곳에 보내기`;
      btn.disabled = false;
    }
  }
}

/** 양식·계정·미리보기 대상이 비어 있거나 사라졌으면 채워 넣는다 */
/**
 * 영업 메일을 보내는 계정 — 기본은 대표 계정, 등록된 다른 계정으로 바꿀 수 있다
 * (대표님 요청 2026-09-14: "고정하지 말고 계정이 등록돼 있으면 변경 가능하게").
 * 서버(lib/mail/accounts.ts resolveOutreachAccount)도 고른 계정으로 보낸다.
 */
function outreachAccounts() {
  return (_mailAccounts || []).filter((a) => a.isActive !== false);
}
/** 기본으로 골라 둘 계정 = 대표 계정 (없으면 첫 활성 계정) */
function outreachAccount() {
  const list = outreachAccounts();
  return list.find((a) => a.isDefault) || list[0] || null;
}
/** 지금 골라 둔 계정이 아직 쓸 수 있으면 그대로, 아니면 대표 계정 */
function keepOrDefaultAccountId(id) {
  return outreachAccounts().some((a) => a._id === id) ? id : (outreachAccount()?._id || null);
}

/** 발송 화면의 '보내는 계정' 선택칸 */
function outreachAccountBoxHtml(selectId, selectedId) {
  const list = outreachAccounts();
  if (!list.length) {
    return `<div style="padding:9px 11px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;
                        font-size:12px;color:#991b1b;line-height:1.6">
      등록된 메일 계정이 없어 보낼 수 없습니다. <b>[📬 메일 계정 관리]</b>에서 계정을 등록하세요.</div>`;
  }
  const cur = list.find((a) => a._id === selectedId) || outreachAccount();
  return `<select id="${selectId}" class="outreach-acc-sel" style="width:100%;padding:7px 9px;font-size:12.5px;font-weight:700;
            border:1px solid var(--border-default);border-radius:7px;background:var(--bg-surface);color:var(--text-primary)">
      ${list.map((a) => `<option value="${escapeAttr(a._id)}" ${a._id === cur._id ? 'selected' : ''}>${escapeHtml(a.fromAddress || a.smtpUser)}${a.isDefault ? ' · 대표' : ''}${a.accountName ? ` (${escapeHtml(a.accountName)})` : ''}</option>`).join('')}
    </select>
    <div class="outreach-acc-hint" style="font-size:10.5px;margin-top:3px;line-height:1.5;color:${cur.isDefault ? 'var(--text-tertiary)' : '#b45309'}">
      ${cur.isDefault
        ? '기본은 대표 계정 · 등록된 다른 계정으로 바꿀 수 있습니다'
        : '⚠ 대표 계정이 아닌 주소로 나갑니다 · 답장도 이 메일함으로 옵니다'}
    </div>`;
}

function outboxSyncCompose(ready) {
  const tpls = state.email.templates || [];
  const cur = tpls.find((t) => t._id === _outboxCompose.templateId);
  if (!cur && tpls.length) {
    const t = tpls.find((x) => x.purpose === 'intro' && x.language === 'en') || tpls[0];
    _outboxCompose.templateId = t._id;
    _outboxCompose.subject = t.subject || '';
    _outboxCompose.body = t.body || '';
    _outboxCompose.dirty = false;
  }
  // 보내는 계정 — 고른 계정이 아직 쓸 수 있으면 그대로, 처음이거나 지워졌으면 대표 계정.
  _outboxCompose.mailAccountId = keepOrDefaultAccountId(_outboxCompose.mailAccountId);
  if (!ready.some((l) => l.leadId === _outboxCompose.previewLeadId)) {
    _outboxCompose.previewLeadId = ready[0]?.leadId || null;
  }
}

/**
 * 입력 바인딩 — 제목·본문은 화면을 다시 그리지 않고 미리보기만 갱신한다.
 * 한 글자마다 renderOutboxPage() 를 부르면 커서가 튀어 글을 쓸 수 없다.
 */
function outboxBindComposeInputs(ready) {
  const tplSel = document.getElementById('obTpl');
  const accSel = document.getElementById('obAcc');
  const subjEl = document.getElementById('obSubject');
  const bodyEl = document.getElementById('obBody');
  const prevSel = document.getElementById('obPreviewLead');

  tplSel?.addEventListener('change', () => {
    const t = (state.email.templates || []).find((x) => x._id === tplSel.value);
    if (!t) return;
    if (_outboxCompose.dirty &&
        !confirm('고쳐 쓴 문구가 있습니다. 양식을 바꾸면 지금 문구는 사라집니다. 바꿀까요?')) {
      tplSel.value = _outboxCompose.templateId;
      return;
    }
    _outboxCompose.templateId = t._id;
    _outboxCompose.subject = t.subject || '';
    _outboxCompose.body = t.body || '';
    _outboxCompose.dirty = false;
    renderOutboxPage();
  });
  // 계정을 바꾸면 안내 문구(대표 계정이 아닌 주소 경고)도 바뀌어야 해서 다시 그린다
  accSel?.addEventListener('change', () => { _outboxCompose.mailAccountId = accSel.value; renderOutboxPage(); });
  // 테스트 메일 주소 — 직접 고치면 그 주소를 기억한다. 비우면 다시 본인 메일(보내는 계정)로 돌아간다.
  const testToEl = document.getElementById('obTestTo');
  testToEl?.addEventListener('input', () => {
    _outboxCompose.testTo = testToEl.value.trim();
    _outboxCompose.testToEdited = !!_outboxCompose.testTo;
  });
  document.getElementById('obTestSendBtn')?.addEventListener('click', () => sendOutboxTestMail(ready));
  document.querySelectorAll('.ob-page').forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.page);
    if (!n || b.disabled) return;
    _outboxReadyPage = n;
    renderOutboxPage();
  }));
  prevSel?.addEventListener('change', () => {
    _outboxCompose.previewLeadId = prevSel.value;
    outboxRefreshPreview(ready);
  });
  subjEl?.addEventListener('input', () => {
    _outboxCompose.subject = subjEl.value; _outboxCompose.dirty = true; outboxRefreshPreview(ready);
  });
  bodyEl?.addEventListener('input', () => {
    _outboxCompose.body = bodyEl.value; _outboxCompose.dirty = true; outboxRefreshPreview(ready);
  });

  // ── 내보내는 방식 ──
  const split   = document.getElementById('obSplit');
  const bSize   = document.getElementById('obBatchSize');
  const bInt    = document.getElementById('obInterval');
  const fUp     = document.getElementById('obFollowUp');
  const fDays   = document.getElementById('obFollowDays');
  const sNow    = document.getElementById('obStartNow');
  const sLater  = document.getElementById('obStartLater');
  const sAt     = document.getElementById('obStartAt');

  const syncPlan = () => {
    const n = ready.length;
    const on = split ? split.checked : true;
    const size = on ? Math.max(1, Number(bSize?.value) || 30) : n;
    const gap = Math.max(1, Number(bInt?.value) || 10);
    _outboxCompose.batchSize = size;
    _outboxCompose.intervalMinutes = gap;
    _outboxCompose.followUp = !!fUp?.checked;
    _outboxCompose.followUpDays = Math.max(1, Number(fDays?.value) || 7);
    _outboxCompose.startNow = !!sNow?.checked;
    _outboxCompose.startAt = sAt?.value || '';
    if (bSize) bSize.disabled = !on;
    if (bInt) bInt.disabled = !on;
    if (sAt) { sAt.disabled = _outboxCompose.startNow; sAt.style.opacity = _outboxCompose.startNow ? '.45' : '1'; }
    if (fDays) fDays.disabled = !_outboxCompose.followUp;

    const batches = Math.max(1, Math.ceil(n / size));
    const mins = (batches - 1) * gap;
    const hint = document.getElementById('obSplitHint');
    if (hint) {
      // 실제 발송 속도는 서버의 하루 상한이 정한다 (lib/outbound-lock.ts).
      // 여기 값은 "예약을 며칠에 걸쳐 깔지"를 정하는 것이라, 하루 상한을
      // 같이 보여주지 않으면 "10분 뒤면 다 나가겠네"로 잘못 읽힌다.
      const cap = (_outboundStatusCache && _outboundStatusCache.dailyCap) || 300;
      const days = Math.ceil(n / cap);
      hint.textContent = on
        ? `${n.toLocaleString()}곳 → ${batches}번에 나눠 예약됩니다.`
          + ` 실제 발송은 하루 ${cap}통씩이라 전부 나가는 데 약 ${days}일 걸립니다`
        : `${n.toLocaleString()}곳을 한 번에 예약합니다 — 그래도 발송은 하루 ${cap}통씩 나갑니다`;
      hint.style.color = on ? 'var(--text-tertiary)' : '#b45309';
    }
    const plan = document.getElementById('obPlanHint');
    if (plan) {
      const start = _outboxCompose.startNow ? '지금부터' : `${new Date(_outboxCompose.startAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}부터`;
      plan.textContent = `${start} ${on ? `${size}곳씩 ${gap}분 간격` : '한 번에'}`
        + (_outboxCompose.followUp ? ` · 답 없으면 ${_outboxCompose.followUpDays}일 뒤 다시 (최대 3회)` : '');
    }
  };
  [split, bSize, bInt, fUp, fDays, sNow, sLater, sAt].forEach((el) =>
    el?.addEventListener('change', syncPlan));
  [bSize, bInt, fDays].forEach((el) => el?.addEventListener('input', syncPlan));
  syncPlan();
}

/**
 * 미리보기 본문 — **실제로 나가는 메일 그대로**.
 *
 * 본문 뒤에 서명이 붙는다. 서명은 발송할 때 서버가 붙이므로(api/mail/send · lib/template-vars.ts
 * buildSignatureBlock) 여기서 빼먹으면 "미리보기엔 없었는데 실제로는 붙어 나갔다" 가 된다.
 * 양식에서 서명 끄기(appendAccountSignature=false)를 했으면 여기서도 안 붙는다.
 */
function outboxPreviewBodyHtml(vars, acc, tpl) {
  const raw = _outboxCompose.body || '';
  const body = raw.includes('<')
    ? outboxSubstitute(raw, vars, { html: true })
    : outboxSubstitute(raw, vars, { html: true, escapeText: true }).split('\n').join('<br>');
  const appendSig = tpl ? tpl.appendAccountSignature !== false : true;
  if (!appendSig) return body;
  const sig = accountSignatureHtml(acc);
  if (sig) return body + sig;
  // 서명 정보가 비어 있으면 실제로도 아무것도 안 붙는다 — 어디서 채우는지 알려 준다
  return body + `
    <div style="margin-top:20px;padding:8px 10px;border:1px dashed var(--border-default);border-radius:7px;
                font-size:11.5px;color:var(--text-quaternary);line-height:1.6">
      이 계정에는 서명이 비어 있어 <b>서명 없이 나갑니다</b>.
      [📬 메일 계정 관리]에서 이름·직함·회사·주소·전화·웹사이트를 채우면 여기에 붙습니다.
    </div>`;
}

/** 지금 고른 보내는 계정 */
function outboxSelectedAccount() {
  return (_mailAccounts || []).find((a) => a._id === _outboxCompose.mailAccountId)
    || (_mailAccounts || [])[0] || null;
}

/** 미리보기 칸만 다시 칠한다 (입력 중 포커스를 잃지 않게) */
function outboxRefreshPreview(ready) {
  const lead = ready.find((l) => l.leadId === _outboxCompose.previewLeadId) || ready[0];
  const vars = outboxPreviewVars(lead);
  const acc = outboxSelectedAccount();
  const tpl = (state.email.templates || []).find((t) => t._id === _outboxCompose.templateId) || null;
  const to = document.getElementById('obPvTo');
  const fr = document.getElementById('obPvFrom');
  const sj = document.getElementById('obPvSubject');
  const bd = document.getElementById('obPvBody');
  if (to) to.innerHTML = outboxPreviewToHtml(lead);
  if (fr) fr.innerHTML = outboxPreviewFromHtml(acc);
  if (sj) sj.innerHTML = outboxSubstitute(_outboxCompose.subject, vars, { html: true, escapeText: true }) || '(제목 없음)';
  if (bd) bd.innerHTML = outboxPreviewBodyHtml(vars, acc, tpl);
}

/** 보내는 사람 — 받는 사람 눈에 보이는 그대로 (이름 <주소>) */
function outboxPreviewFromHtml(acc) {
  if (!acc) return '<span style="color:#b91c1c">보내는 계정을 고르세요</span>';
  const name = String(acc.fromName || '').trim();
  const addr = String(acc.fromAddress || acc.smtpUser || '').trim();
  return escapeHtml(name ? `${name} <${addr}>` : addr);
}

/**
 * ✉️ 보낼 메일 — 양식을 화면 안에 둔다.
 *
 * 예전에는 버튼을 눌러 모달을 띄워야 문구가 보였다. 그래서 "지금 무슨 내용이
 * 나가는지" 를 확인하려면 매번 모달을 열어야 했고, 회사마다 무엇이 바뀌는지도
 * 눈에 띄지 않았다. 문구와 미리보기를 목록과 같은 화면에 붙여 둔다.
 */
function outboxReadyHtml(ready, lock) {
  if (!ready.length) {
    return `
      <div style="padding:44px 28px;text-align:center;background:var(--surface-1);
                  border:1px dashed var(--border);border-radius:12px;color:var(--text-tertiary)">
        <div style="font-size:34px;margin-bottom:8px">✉️</div>
        <div style="font-size:14px;font-weight:700;color:var(--text-secondary)">보낼 메일이 없습니다</div>
        <div style="font-size:12.5px;margin-top:5px;line-height:1.6">
          [✅ AI 검증 완료]에서 보낼 곳을 체크하고 <b>[📨 발송 관리로 이동]</b>을 누르면 여기에 모입니다.
        </div>
        <button id="outboxGoVerified" type="button" class="button primary"
          style="margin-top:13px;font-size:13px;padding:9px 16px">✅ 검증 완료에서 고르기</button>
      </div>`;
  }

  const tpls = state.email.templates || [];
  const tpl = tpls.find((t) => t._id === _outboxCompose.templateId) || tpls[0] || null;
  const preview = ready.find((l) => l.leadId === _outboxCompose.previewLeadId) || ready[0];
  const vars = outboxPreviewVars(preview);
  const subj = outboxSubstitute(_outboxCompose.subject, vars);
  const body = outboxSubstitute(_outboxCompose.body, vars);
  const acc = (_mailAccounts || []).find((a) => a._id === _outboxCompose.mailAccountId)
    || (_mailAccounts || [])[0] || null;

  // 어떤 자리가 회사마다 달라지는지 — 이게 '묶음 발송'의 핵심이라 눈에 띄어야 한다
  // {{Company}} 와 [회사명] 둘 다 센다 — 양식은 대부분 [회사명] 으로 쓴다
  const usedVars = [...new Set(
    (`${_outboxCompose.subject} ${_outboxCompose.body}`.match(/\{\{\s*[A-Za-z0-9_]+\s*\}\}|\[[^\[\]\n]+?\]/g) || [])
      .filter((m) => m.startsWith('{{') || OUTBOX_KO_MARKERS[m.slice(1, -1).trim()])
      .map((m) => (m.startsWith('{{') ? m.replace(/\s/g, '') : m)),
  )];

  const byRegion = new Map();
  ready.forEach((l) => byRegion.set(l.Region || '-', (byRegion.get(l.Region || '-') || 0) + 1));
  const topCountries = [...byRegion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const composeHtml = `
    <div style="border:1px solid #bfdbfe;border-radius:12px;overflow:hidden;margin-bottom:14px">
      <div style="padding:13px 17px;background:#eff6ff;border-bottom:1px solid #bfdbfe">
        <div style="font-size:14px;font-weight:800;color:#1e3a8a">
          📦 ${ready.length.toLocaleString()}곳에 같은 메일을 한 번에
        </div>
        <div style="font-size:12.5px;color:#1e40af;line-height:1.6;margin-top:3px">
          문구는 하나만 씁니다. <b>${usedVars.length ? usedVars.map((v) => escapeHtml(v)).join(' · ') : '[회사명]'}</b>
          자리만 회사마다 바뀝니다.
        </div>
      </div>

      <div class="outbox-compose" style="padding:14px 17px;background:var(--bg-surface);display:grid;
                  grid-template-columns:minmax(280px,1fr) minmax(280px,1fr);gap:16px">
        <!-- 왼쪽: 쓰는 곳 -->
        <div style="min-width:0">
          <div style="display:flex;gap:8px;margin-bottom:9px;flex-wrap:wrap">
            <label style="flex:1;min-width:130px">
              <span style="font-size:11px;font-weight:700;color:var(--text-tertiary)">양식</span>
              <select id="obTpl" style="width:100%;margin-top:3px;padding:7px 9px;font-size:12.5px;
                border:1px solid var(--border-default);border-radius:7px;
                background:var(--bg-surface);color:var(--text-primary)">
                ${tpls.length
                  ? tpls.map((t) => {
                      const p = (typeof TEMPLATE_PURPOSE_KO !== 'undefined' && TEMPLATE_PURPOSE_KO[t.purpose]) || null;
                      return `<option value="${escapeAttr(t._id)}" ${t._id === (tpl && tpl._id) ? 'selected' : ''}>${escapeHtml(t.name)}${p ? ` · ${p.label}` : ''}</option>`;
                    }).join('')
                  : '<option value="">(등록된 양식 없음)</option>'}
              </select>
            </label>
            <label style="flex:1;min-width:130px">
              <span style="font-size:11px;font-weight:700;color:var(--text-tertiary)">보내는 계정</span>
              <div style="margin-top:3px">${outreachAccountBoxHtml('obAcc', _outboxCompose.mailAccountId)}</div>
            </label>
          </div>


          <span style="font-size:11px;font-weight:700;color:var(--text-tertiary)">제목</span>
          <input id="obSubject" type="text" value="${escapeAttr(_outboxCompose.subject)}"
            style="width:100%;margin:3px 0 9px;padding:8px 10px;font-size:13px;
                   border:1px solid var(--border-default);border-radius:7px;
                   background:var(--bg-surface);color:var(--text-primary)">

          <span style="font-size:11px;font-weight:700;color:var(--text-tertiary)">본문</span>
          <textarea id="obBody" rows="11"
            style="width:100%;margin-top:3px;padding:9px 11px;font-size:12.5px;line-height:1.65;
                   border:1px solid var(--border-default);border-radius:7px;resize:vertical;
                   background:var(--bg-surface);color:var(--text-primary);font-family:inherit"
          >${escapeHtml(_outboxCompose.body)}</textarea>
          <div style="font-size:11px;color:var(--text-quaternary);margin-top:4px">
            고친 문구는 <b>이번 발송에만</b> 쓰입니다. 양식 자체를 바꾸거나 새로 만들려면
            <button type="button" id="obGoTemplates"
              style="border:none;background:none;padding:0;font-size:11px;font-weight:700;
                     color:var(--brand-text,#4338ca);cursor:pointer;text-decoration:underline">[📝 메일 양식]</button>
            에서 저장하세요.
          </div>
        </div>

        <!-- 오른쪽: 실제로 나갈 모습 -->
        <div style="min-width:0">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:var(--text-tertiary)">이 회사에게는 이렇게 갑니다</span>
            <select id="obPreviewLead" style="flex:1;min-width:150px;padding:5px 8px;font-size:12px;
              border:1px solid var(--border-default);border-radius:7px;
              background:var(--bg-surface);color:var(--text-primary)">
              ${ready.slice(0, 300).map((l) => `<option value="${escapeAttr(l.leadId)}" ${l.leadId === (preview && preview.leadId) ? 'selected' : ''}>${escapeHtml(l.Company || l.Email || l.leadId)}</option>`).join('')}
            </select>
          </div>
          <div style="border:1px solid var(--border-default);border-radius:9px;overflow:hidden;
                      background:var(--surface-1)">
            <div style="padding:8px 12px;border-bottom:1px solid var(--border-subtle);
                        font-size:11.5px;color:var(--text-tertiary);line-height:1.8">
              <div>보내는 사람 <b id="obPvFrom" style="color:var(--text-secondary)">${outboxPreviewFromHtml(acc)}</b></div>
              <div>받는 사람 <b id="obPvTo" style="color:var(--text-secondary)">${outboxPreviewToHtml(preview)}</b></div>
            </div>
            <div id="obPvSubject" style="padding:9px 12px;border-bottom:1px solid var(--border-subtle);
                        font-size:13px;font-weight:700;color:var(--text-primary);word-break:break-word">
              ${outboxSubstitute(_outboxCompose.subject, vars, { html: true, escapeText: true }) || '(제목 없음)'}
            </div>
            <div id="obPvBody" style="padding:11px 13px;font-size:12.5px;line-height:1.7;color:var(--text-secondary);
                        max-height:360px;overflow:auto;word-break:break-word">
              ${outboxPreviewBodyHtml(vars, acc, tpl)}
            </div>
            <div style="padding:7px 12px;border-top:1px solid var(--border-subtle);background:var(--bg-surface);
                        font-size:11px;color:var(--text-quaternary)">
              여기 보이는 그대로 나갑니다 — 서명까지 포함한 실제 발송 내용입니다.
            </div>
          </div>
        </div>
      </div>

      ${tpl && (tpl.attachments || []).length ? `
      <div id="obAttachNote" style="padding:9px 17px;border-top:1px solid #fde68a;background:#fffbeb;font-size:12px;color:#92400e;line-height:1.6">
        📎 이 양식에는 파일 <b>${tpl.attachments.length}개</b>가 함께 붙어 나갑니다:
        ${tpl.attachments.map((a) => `<b>${escapeHtml(a.name || '첨부파일')}</b>`).join(' · ')}
      </div>` : ''}

      <!-- 어떻게 내보낼지 — 한 번에 쏟지 않기 위한 설정 -->
      <div style="padding:13px 17px;border-top:1px solid var(--border-default);background:var(--bg-surface)">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);margin-bottom:9px">
          어떻게 내보낼까요
        </div>

        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
          <label style="display:flex;gap:7px;align-items:flex-start;cursor:pointer;flex:1;min-width:260px">
            <input type="checkbox" id="obSplit" ${_outboxCompose.batchSize > 0 ? 'checked' : ''} style="margin-top:2px">
            <span style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">
              <b style="color:var(--text-primary)">나눠 보내기</b>
              <input type="number" id="obBatchSize" min="1" max="200" value="${_outboxCompose.batchSize}"
                style="width:58px;margin:0 3px;padding:3px 6px;font-size:12.5px;text-align:right;
                       border:1px solid var(--border-default);border-radius:6px;
                       background:var(--bg-surface);color:var(--text-primary)">곳씩
              <input type="number" id="obInterval" min="1" max="1440" value="${_outboxCompose.intervalMinutes}"
                style="width:52px;margin:0 3px;padding:3px 6px;font-size:12.5px;text-align:right;
                       border:1px solid var(--border-default);border-radius:6px;
                       background:var(--bg-surface);color:var(--text-primary)">분 간격
              <span id="obSplitHint" style="display:block;color:var(--text-tertiary);font-size:11.5px;margin-top:3px"></span>
            </span>
          </label>

          <label style="display:flex;gap:7px;align-items:flex-start;cursor:pointer;flex:1;min-width:260px">
            <input type="checkbox" id="obFollowUp" ${_outboxCompose.followUp ? 'checked' : ''} style="margin-top:2px">
            <span style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">
              <b style="color:var(--text-primary)">답장 없으면 자동으로 다시 보내기</b>
              <input type="number" id="obFollowDays" min="1" max="60" value="${_outboxCompose.followUpDays}"
                style="width:52px;margin:0 3px;padding:3px 6px;font-size:12.5px;text-align:right;
                       border:1px solid var(--border-default);border-radius:6px;
                       background:var(--bg-surface);color:var(--text-primary)">일 뒤
              <span style="display:block;color:var(--text-tertiary);font-size:11.5px;margin-top:3px">
                같은 곳에 최대 3회까지 · <b>답장이 오면 그 자리에서 멈춥니다</b>
              </span>
            </span>
          </label>
        </div>

        <div style="margin-top:11px;display:flex;gap:9px;flex-wrap:wrap;align-items:center">
          <span style="font-size:12.5px;color:var(--text-secondary)">시작</span>
          <label style="display:inline-flex;gap:5px;align-items:center;font-size:12.5px;cursor:pointer">
            <input type="radio" name="obStart" id="obStartNow" ${_outboxCompose.startNow ? 'checked' : ''}> 지금부터
          </label>
          <label style="display:inline-flex;gap:5px;align-items:center;font-size:12.5px;cursor:pointer">
            <input type="radio" name="obStart" id="obStartLater" ${_outboxCompose.startNow ? '' : 'checked'}> 시각 지정
          </label>
          <input type="datetime-local" id="obStartAt" value="${escapeAttr(_outboxCompose.startAt || defaultScheduleTime())}"
            ${_outboxCompose.startNow ? 'disabled' : ''}
            style="padding:5px 8px;font-size:12.5px;border:1px solid var(--border-default);border-radius:7px;
                   background:var(--bg-surface);color:var(--text-primary);${_outboxCompose.startNow ? 'opacity:.45' : ''}">
        </div>
      </div>

      <div style="padding:12px 17px;border-top:1px solid var(--border-default);
                  display:flex;gap:9px;flex-wrap:wrap;align-items:center;background:var(--bg-surface-alt)">
        <!-- 무엇을 보내는지 버튼에 박아 둔다. 분류를 고른 채로 보내는 일이 많아서,
             "전체인 줄 알고 눌렀는데 리조트만 나갔다" 를 막아야 한다. -->
        <button id="outboxSendBtn" type="button" class="button primary"
          style="font-size:14px;font-weight:700;padding:11px 22px">
          ✉️ ${krCurrentCategoryLabel() ? escapeHtml(krCurrentCategoryLabel()) + ' ' : ''}${ready.length.toLocaleString()}곳에 보내기${lock?.locked ? ' 🔒' : ''}
        </button>
        <span id="obPlanHint" style="font-size:12px;color:var(--text-tertiary)"></span>
      </div>

      <!-- 🧪 테스트 메일 — 맨 아래. 예제 업체로 회사명을 채워, 지정한 주소로 실제 모양 그대로 한 통 보낸다.
           (대표님 요청 2026-09-14: 업체는 예제 업체로, 메일 주소만 지정해서 어떻게 가는지 보고 싶다) -->
      <div id="obTestBox" style="padding:13px 17px;border-top:1px dashed #a5b4fc;background:#eef2ff">
        <div style="font-size:12.5px;font-weight:800;color:#3730a3">🧪 테스트 메일 보내기</div>
        <div style="font-size:11.5px;color:#4338ca;margin:3px 0 8px;line-height:1.6">
          지금 고른 양식을 <b>예제 업체(Acme Beauty Co.)</b> 이름으로 채워, 아래 주소로 바로 보냅니다.
          제목 앞에 <b>[테스트]</b>가 붙고, 업체 발송 기록에는 남지 않습니다.
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;max-width:560px">
          <input id="obTestTo" type="email" value="${escapeAttr(outboxTestTo())}" placeholder="받을 메일 주소 (기본: 보내는 계정 = 본인 메일)"
            style="flex:1;min-width:200px;padding:7px 10px;font-size:13px;border:1px solid #c7d2fe;border-radius:7px;background:var(--bg-surface);color:var(--text-primary)">
          <button type="button" id="obTestSendBtn"
            style="padding:7px 15px;font-size:12.5px;font-weight:700;border:1px solid #4f46e5;background:#4f46e5;color:#fff;border-radius:7px;cursor:pointer;white-space:nowrap">🧪 테스트 메일 보내기</button>
        </div>
      </div>
    </div>`;

  // 받는 곳 목록은 위에 둔다 — 누구에게 보내는지를 먼저 보고 문구를 고른다 (대표님 요청 2026-09-14)
  const pages = Math.max(1, Math.ceil(ready.length / OUTBOX_PAGE_SIZE));
  if (_outboxReadyPage > pages) _outboxReadyPage = pages;
  if (_outboxReadyPage < 1) _outboxReadyPage = 1;
  const from = (_outboxReadyPage - 1) * OUTBOX_PAGE_SIZE;
  const pageLeads = ready.slice(from, from + OUTBOX_PAGE_SIZE);

  return `
    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:7px">
      받는 곳 ${ready.length.toLocaleString()}곳 · ${topCountries.map(([c, n]) => `${escapeHtml(c)} ${n}`).join(' · ')}${byRegion.size > 6 ? ` 외 ${byRegion.size - 6}개국` : ''}
    </div>
    ${outboxLeadTableHtml(pageLeads, pageLeads.length)}
    ${outboxPagerHtml(_outboxReadyPage, pages, ready.length, from, pageLeads.length)}
    <div style="height:14px"></div>
    ${composeHtml}`;
}

/** [보낼 메일] 목록 쪽 번호 — 1 2 3 4 … (앞뒤 몇 쪽만 보이고 나머지는 … 로 줄인다) */
function outboxPagerHtml(page, pages, total, from, shown) {
  if (pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const btn = (label, target, active, disabled) => `
    <button type="button" class="ob-page" data-page="${target}" ${disabled ? 'disabled' : ''}
      style="min-width:32px;padding:5px 9px;font-size:12.5px;border-radius:7px;cursor:${disabled ? 'default' : 'pointer'};
             border:1px solid ${active ? '#2563eb' : 'var(--border-default)'};
             background:${active ? '#2563eb' : 'var(--bg-surface)'};color:${active ? '#fff' : 'var(--text-secondary)'};
             font-weight:${active ? 800 : 500};opacity:${disabled ? '.4' : '1'}">${label}</button>`;
  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;margin-top:9px">
      ${btn('‹', page - 1, false, page <= 1)}
      ${nums.map((n) => n === '…' ? '<span style="padding:0 3px;color:var(--text-quaternary)">…</span>' : btn(n, n, n === page, false)).join('')}
      ${btn('›', page + 1, false, page >= pages)}
      <span style="font-size:11.5px;color:var(--text-tertiary);margin-left:6px">${(from + 1).toLocaleString()}–${(from + shown).toLocaleString()} / ${total.toLocaleString()}곳</span>
    </div>`;
}

/** 📅 예약 발송 — 언제 · 어디로. 실패한 것도 사유와 함께 여기 남긴다 */
function outboxScheduledHtml(pending, failed, canceled) {
  const byDay = new Map();
  for (const it of pending) {
    const key = new Date(it.scheduledFor).toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(it);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const today = new Date().toISOString().slice(0, 10);
  const dayLabel = (k) => {
    const d = new Date(k + 'T00:00:00');
    const diff = Math.round((d - new Date(today + 'T00:00:00')) / 86400000);
    const base = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    if (diff === 0) return `${base} · 오늘`;
    if (diff === 1) return `${base} · 내일`;
    if (diff > 1) return `${base} · ${diff}일 뒤`;
    return `${base} · ⚠️ 지난 날짜`;
  };

  const pendingBlock = !pending.length ? `
    <div style="padding:40px 28px;text-align:center;background:var(--surface-1);
                border:1px dashed var(--border);border-radius:12px;color:var(--text-tertiary)">
      <div style="font-size:34px;margin-bottom:8px">📅</div>
      <div style="font-size:14px;font-weight:700;color:var(--text-secondary)">예약된 발송이 없습니다</div>
      <div style="font-size:12.5px;margin-top:5px">[✉️ 보낼 메일]에서 <b>예약 잡기</b>를 누르면 여기로 옵니다.</div>
    </div>` : `
    <div style="border:1px solid #fcd34d;border-radius:12px;overflow:hidden">
      <div style="padding:11px 16px;background:#fffbeb;border-bottom:1px solid #fde68a;
                  font-size:12.5px;color:#78350f;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <b>대기 중 ${pending.length.toLocaleString()}건</b>
        <span>${days.length}개 날짜</span>
        <!-- 예약을 실제로 내보내는 건 하루 한 번 도는 크론이다(Vercel 무료 플랜은
             하루 1회까지만 된다). 몇 분 뒤로 잡아놓고 나가는지 보고 싶을 때
             하루를 기다릴 수는 없으므로, 지금 돌려보는 버튼을 둔다.
             예약 시각이 지난 것만 나간다 — 아직 안 된 것은 그대로 남는다. -->
        <button type="button" id="outboxRunDue" style="margin-left:auto;font-size:11.5px;font-weight:700;
                padding:6px 13px;border-radius:8px;border:1px solid #b45309;background:#fff;
                color:#b45309;cursor:pointer"
          title="예약 시각이 이미 지난 건을 지금 내보냅니다. 아직 시각이 안 된 건은 그대로 둡니다.">
          ⏱ 지금 예약분 내보내기
        </button>
        <span style="margin-left:auto;font-size:11px">시각이 되면 자동으로 [발송 완료]로 넘어갑니다 · 취소는 회사 옆 ✕</span>
      </div>
      ${days.map(([key, list]) => `
        <div style="padding:11px 16px;border-bottom:1px solid var(--border-subtle)">
          <div style="display:flex;align-items:baseline;gap:9px;margin-bottom:6px">
            <b style="font-size:13px;color:var(--text-primary)">${escapeHtml(dayLabel(key))}</b>
            <span style="font-size:11.5px;color:var(--text-tertiary)">${list.length}곳</span>
            <span style="font-size:11px;color:var(--text-quaternary)">
              ${new Date(list[0].scheduledFor).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 발송
            </span>
          </div>
          <!-- 회사명만 칩으로 늘어놓으면 "이 업체 맞나"를 못 가린다.
               지역·이메일까지 같이 보여야 나가기 전에 뺄 수 있다. -->
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12.5px">
              <tbody>
                ${list.map((it) => {
                  const L = it.lead || {};
                  return `
                  <tr style="border-top:1px solid var(--border-subtle)">
                    <td class="outbox-lead-open" data-lead-id="${escapeAttr(it.leadId)}"
                        style="padding:7px 10px;cursor:pointer;max-width:320px"
                        title="클릭하면 이 업체의 상세 정보가 열립니다">
                      <div style="font-weight:700;color:var(--text-primary);overflow:hidden;
                                  text-overflow:ellipsis;white-space:nowrap">
                        ${escapeHtml(L.Company || it.to || it.leadId)}
                      </div>
                      ${(L.TypeKo || L.Type) ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:1px;
                           overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(truncate(L.TypeKo || L.Type, 58))}</div>` : ''}
                    </td>
                    <td style="padding:7px 10px;white-space:nowrap;color:var(--text-secondary);width:110px">${escapeHtml(L.Region || '—')}</td>
                    <td style="padding:7px 10px;font-family:monospace;font-size:11.5px;color:var(--text-tertiary);
                               max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                        title="${escapeAttr(it.to || '')}">${escapeHtml(it.to || '')}</td>
                    <td style="padding:7px 10px;white-space:nowrap;width:64px;text-align:right">
                      ${it.attemptNo && it.attemptNo > 1
                        ? `<span style="padding:1px 6px;background:#fef3c7;color:#92400e;border-radius:99px;
                                        font-size:10px;font-weight:800">${it.attemptNo}번째</span>` : ''}
                    </td>
                    <td style="padding:7px 12px;white-space:nowrap;width:52px;text-align:right">
                      <button type="button" class="outbox-sched-cancel" data-sched-id="${escapeAttr(it._id)}"
                        title="이 예약을 취소합니다 — 이 회사에는 나가지 않습니다"
                        style="border:1px solid var(--border-default);background:var(--bg-surface);
                               color:var(--text-tertiary);cursor:pointer;font-size:11px;
                               line-height:1;padding:4px 8px;border-radius:7px">취소</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`).join('')}
    </div>`;

  // 실패는 조용히 묻히면 안 된다 — "왜 안 나갔나"가 여기에만 남는다
  const failedBlock = !failed.length ? '' : `
    <div style="margin-top:14px;border:1px solid #fecaca;border-radius:12px;overflow:hidden">
      <div style="padding:11px 16px;background:#fef2f2;border-bottom:1px solid #fecaca;font-size:12.5px;color:#991b1b">
        <b>⚠️ 나가지 못한 예약 ${failed.length}건</b> — 사유를 확인하고 다시 예약해 주세요
      </div>
      ${failed.map((it) => `
        <div style="padding:10px 16px;border-bottom:1px solid var(--border-subtle);font-size:12.5px">
          <b style="color:var(--text-primary)">${escapeHtml((it.lead && it.lead.Company) || it.to || it.leadId)}</b>
          <span style="color:var(--text-tertiary);margin-left:7px">
            ${new Date(it.scheduledFor).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 예정이었음
          </span>
          <div style="margin-top:3px;color:#b91c1c">${escapeHtml(it.lastError || '사유 기록 없음')}</div>
        </div>`).join('')}
    </div>`;

  const canceledBlock = !canceled.length ? '' : `
    <div style="margin-top:12px;font-size:12px;color:var(--text-tertiary)">
      🚫 취소된 예약 ${canceled.length}건 — ${canceled.map((it) =>
        escapeHtml((it.lead && it.lead.Company) || it.to || it.leadId)).join(' · ')}
    </div>`;

  return pendingBlock + failedBlock + canceledBlock;
}

/**
 * ✅ 발송 완료 — "며칠에 나갔나" 와 "몇 번 보냈는데 답이 없나" 를 같이 본다.
 *
 * 통수만 세어 두면 팔로우업 판단을 못 한다. 광고 메일을 두 번 세 번 보내고도
 * 답이 없는 곳을 골라내야 다음에 뭘 할지 정할 수 있어서, 나간 날짜로 묶고
 * 회사마다 보낸 횟수와 답장 여부를 같은 줄에 붙여 둔다.
 */
function outboxSentHtml(sentSched, sentLeads) {
  // 회사별로 모은다 — 발송 이력이 있으면 그걸 쓰고, 없으면 마지막 발송 시각만이라도
  const rows = sentLeads.map((l) => {
    const hist = (l.emailHistory || []).filter((h) => h && h.status === 'sent');
    const sentAts = hist.map((h) => h.sentAt).filter(Boolean).sort();
    const last = sentAts[sentAts.length - 1] || l.lastEmailSentAt || '';
    return {
      leadId: l.leadId,
      company: l.Company || '(이름 없음)',
      email: l.Email || '',
      region: l.Region || '',
      count: hist.length || (l.lastEmailSentAt ? 1 : 0),
      first: sentAts[0] || l.lastEmailSentAt || '',
      last,
      replied: !!l.inboundCount,
      // 마지막으로 보낸 뒤 며칠째 답이 없는지 — 팔로우업 판단의 실제 기준
      waited: last ? Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 86400000)) : 0,
    };
  }).filter((r) => r.last);

  if (!rows.length && !sentSched.length) {
    return `
      <div style="padding:44px 28px;text-align:center;background:var(--surface-1);
                  border:1px dashed var(--border);border-radius:12px;color:var(--text-tertiary)">
        <div style="font-size:34px;margin-bottom:8px">✅</div>
        <div style="font-size:14px;font-weight:700;color:var(--text-secondary)">아직 나간 메일이 없습니다</div>
        <div style="font-size:12.5px;margin-top:5px">예약한 메일이 나가면 여기에 쌓입니다.</div>
      </div>`;
  }

  // 마지막으로 나간 날 기준으로 묶는다 — "이날 나간 것들은 어떻게 됐나"를 본다
  const byDay = new Map();
  for (const r of rows) {
    const key = String(r.last).slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));  // 최근 날짜부터
  const dayLabel = (k) => {
    const d = new Date(k + 'T00:00:00');
    if (isNaN(d.getTime())) return k;
    const diff = Math.round((new Date().setHours(0, 0, 0, 0) - d.getTime()) / 86400000);
    const base = d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    if (diff === 0) return `${base} · 오늘`;
    if (diff === 1) return `${base} · 어제`;
    return `${base} · ${diff}일 전`;
  };

  const nudged = rows.filter((r) => !r.replied && r.count >= 2);
  const maxed  = rows.filter((r) => !r.replied && r.count >= 3);
  // 답장이 오면 리드가 'replied' 로 올라가 이 목록에서 빠진다(lib/mail/ingest.ts).
  // 그래서 여기 남아 있다는 것 자체가 "아직 답이 없다"는 뜻이다. 어디로 갔는지는
  // 알려줘야 사라진 것을 잃어버린 것으로 오해하지 않는다.
  // 이 화면은 contacted/queued 만 가져오므로 baseLeads 로는 셀 수 없다.
  // 단계별 합계는 사이드바 배지와 같은 API 를 쓴다.
  const sc = _stageCountsCache?.stages || {};
  const movedToReplied = (sc.replied || 0) + (sc.negotiating || 0) + (sc.partner || 0);

  const summary = `
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:9px">
      ${[
        ['보내고 답 기다리는 곳', rows.length, 'var(--text-primary)', 'var(--border-default)'],
        ['2번 보냈는데 무응답', nudged.length, '#b45309', '#fcd34d'],
        ['3번 다 씀 · 무응답', maxed.length, '#b91c1c', '#fecaca'],
        ['답장 와서 넘어간 곳', movedToReplied, '#166534', '#86efac'],
      ].map(([label, n, color, border]) => `
        <div style="flex:1;min-width:132px;padding:10px 13px;border:1px solid ${border};
                    border-radius:10px;background:var(--bg-surface)">
          <div style="font-size:11px;color:var(--text-tertiary);font-weight:700">${label}</div>
          <div style="font-size:19px;font-weight:800;color:${color};line-height:1.2">${n.toLocaleString()}</div>
        </div>`).join('')}
    </div>
    <div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:13px;line-height:1.6">
      답장이 오면 그 회사는 <b>[💬 답장 받음]</b> 으로 자동으로 옮겨가고 이 목록에서 빠집니다.
      여기 남아 있는 곳은 아직 답이 없는 곳입니다.
    </div>`;

  const countBadge = (n) => {
    const tone = n >= 3 ? ['#fee2e2', '#991b1b'] : n >= 2 ? ['#fef3c7', '#92400e'] : ['#e0e7ff', '#3730a3'];
    return `<span style="padding:1px 7px;background:${tone[0]};color:${tone[1]};border-radius:99px;
                        font-size:10.5px;font-weight:800;white-space:nowrap">${n}번째</span>`;
  };
  const fmtT = (v) => v ? new Date(v).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

  const dayBlocks = days.map(([key, list]) => {
    list.sort((a, b) => Number(a.replied) - Number(b.replied) || b.count - a.count);
    const dayNoReply = list.filter((r) => !r.replied).length;
    return `
      <div style="border:1px solid var(--border-default);border-radius:11px;overflow:hidden;margin-bottom:11px">
        <div style="padding:10px 15px;background:var(--bg-surface-alt);border-bottom:1px solid var(--border-default);
                    display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <b style="font-size:13px;color:var(--text-primary)">${escapeHtml(dayLabel(key))}</b>
          <span style="font-size:11.5px;color:var(--text-tertiary)">${list.length}곳 발송</span>
          ${dayNoReply ? `<span style="font-size:11.5px;color:#b45309">무응답 ${dayNoReply}곳</span>` : ''}
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <tbody>
              ${list.map((r) => `
                <tr class="outbox-lead-open" data-lead-id="${escapeAttr(r.leadId)}"
                    style="border-top:1px solid var(--border-subtle);cursor:pointer">
                  <td style="padding:8px 15px;max-width:250px;overflow:hidden;text-overflow:ellipsis;
                             white-space:nowrap" title="${escapeAttr(r.company)}">
                    ${escapeHtml(r.company)}
                  </td>
                  <td style="padding:8px 10px;white-space:nowrap;color:var(--text-tertiary)">${escapeHtml(r.region)}</td>
                  <td style="padding:8px 10px;white-space:nowrap">${countBadge(r.count)}</td>
                  <td style="padding:8px 10px;white-space:nowrap;color:var(--text-quaternary);font-size:11.5px">
                    ${r.count > 1 && r.first ? `첫 발송 ${String(r.first).slice(5, 10).replace('-', '/')} · ` : ''}${fmtT(r.last)}
                  </td>
                  <td style="padding:8px 15px;white-space:nowrap;text-align:right">
                    ${r.replied
                      ? '<span style="color:#166534;font-weight:700">✅ 답장 옴</span>'
                      : r.count >= 3
                        ? `<span style="color:#b91c1c;font-weight:700">무응답 ${r.waited}일 · 더 못 보냄</span>`
                        : `<span style="color:#b45309">무응답 ${r.waited}일</span>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  // 예약으로 나간 건은 위 표에 이미 회사로 잡히지만, 예약분만 따로 세어 준다
  const schedNote = !sentSched.length ? '' : `
    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:11px">
      📅 이 중 예약으로 나간 건 ${sentSched.length}건입니다.
    </div>`;

  return summary + schedNote + dayBlocks;
}

/** 발송함에서 쓰는 가벼운 리드 표 — 클릭하면 기존 상세 팝업이 열린다 */
/** 이 업체에 지금까지 몇 번 나갔는가 — 발송함 어디서나 같은 모양으로 */
function outboxSendCountBadge(lead, opts) {
  const n = (lead && Array.isArray(lead.emailHistory))
    ? lead.emailHistory.filter((h) => h && h.status === 'sent').length : 0;
  const next = opts && opts.next;   // 다음에 몇 번째로 나갈지 (아직 안 보낸 화면용)
  if (!n && !next) {
    return `<span style="padding:1px 7px;background:var(--bg-surface-alt);color:var(--text-tertiary);
      border-radius:99px;font-size:10px;font-weight:700;white-space:nowrap">아직 안 보냄</span>`;
  }
  if (!n && next) {
    return `<span style="padding:1px 7px;background:#e0e7ff;color:#3730a3;border-radius:99px;
      font-size:10px;font-weight:800;white-space:nowrap">1회차 예정</span>`;
  }
  const tone = n >= 3 ? ['#fee2e2', '#991b1b'] : n >= 2 ? ['#fef3c7', '#92400e'] : ['#e0e7ff', '#3730a3'];
  return `<span title="같은 곳에 최대 3회까지 나갑니다"
    style="padding:1px 7px;background:${tone[0]};color:${tone[1]};border-radius:99px;
    font-size:10px;font-weight:800;white-space:nowrap">메일 ${n}회 발송</span>`;
}

/**
 * 발송함 공용 업체 표 — "누구에게 보내는가"를 실제로 읽을 수 있게.
 *
 * 회사명만 늘어놓으면 목록을 봐도 판단이 안 된다. 업종·지역·홈페이지까지 있어야
 * "이 업체 맞나" 를 그 자리에서 가릴 수 있다. 행을 누르면 상세 팝업이 열린다.
 */
function outboxLeadTableHtml(leads, total, showSent) {
  const fmtD = (v) => v ? new Date(v).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '—';
  const site = (u) => {
    const v = String(u || '').trim();
    if (!v) return '<span style="color:var(--text-quaternary)">—</span>';
    const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    const short = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener"
      onclick="event.stopPropagation()"
      style="color:var(--brand-text,#4338ca);text-decoration:none">${escapeHtml(truncate(short, 30))} ↗</a>`;
  };
  return `
    <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="background:var(--surface-2);color:var(--text-secondary);text-align:left">
              <th style="padding:9px 14px;font-weight:700">회사 · 업종</th>
              <!-- 분류가 곧 '어떤 문구가 나가는가' 라서 회사 바로 옆에 둔다 -->
              <th style="padding:9px 12px;font-weight:700;width:104px">분류</th>
              <th style="padding:9px 12px;font-weight:700;width:96px">지역</th>
              <th style="padding:9px 12px;font-weight:700;width:210px">이메일</th>
              <th style="padding:9px 12px;font-weight:700;width:190px">홈페이지</th>
              <th style="padding:9px 12px;font-weight:700;width:104px">발송</th>
              ${showSent
                ? '<th style="padding:9px 12px;font-weight:700;width:90px">보낸 날</th><th style="padding:9px 14px;font-weight:700;width:80px">답장</th>'
                : '<th style="padding:9px 14px;font-weight:700;width:96px;text-align:right">제외</th>'}
            </tr>
          </thead>
          <tbody>
            ${leads.map((l) => `
              <tr class="outbox-lead-open" data-lead-id="${escapeAttr(l.leadId)}"
                  style="border-top:1px solid var(--border-subtle);cursor:pointer"
                  title="클릭하면 이 업체의 상세 정보가 열립니다">
                <td style="padding:8px 14px;max-width:340px">
                  <div style="font-weight:700;color:var(--text-primary);overflow:hidden;
                              text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.Company || '(이름 없음)')}</div>
                  ${(l.TypeKo || l.Type) ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;
                       overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                       title="${escapeAttr(l.TypeKo || l.Type)}">${escapeHtml(truncate(l.TypeKo || l.Type, 62))}</div>` : ''}
                </td>
                <td style="padding:8px 12px;white-space:nowrap">${krCategoryBadge(l.category)}</td>
                <td style="padding:8px 12px;white-space:nowrap;color:var(--text-secondary)">${escapeHtml(l.Region || '—')}</td>
                <td style="padding:8px 12px;font-family:monospace;font-size:11.5px;color:var(--text-secondary);
                           max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                    title="${escapeAttr(l.Email || '')}">${escapeHtml(l.Email || '—')}</td>
                <td style="padding:8px 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${site(l.WebsiteContact)}</td>
                <td style="padding:8px 12px;white-space:nowrap">${outboxSendCountBadge(l, { next: !showSent })}</td>
                ${showSent ? `
                  <td style="padding:8px 12px;white-space:nowrap;color:var(--text-tertiary)">${fmtD(l.lastEmailSentAt)}</td>
                  <td style="padding:8px 14px;white-space:nowrap">${l.inboundCount
                    ? '<span style="color:#166534;font-weight:700">✅ 옴</span>'
                    : '<span style="color:var(--text-quaternary)">—</span>'}</td>`
                : `
                  <td style="padding:8px 14px;white-space:nowrap;text-align:right">
                    <button type="button" class="outbox-unqueue" data-lead-id="${escapeAttr(l.leadId)}"
                      title="발송 리스트에서 빼고 [검증 완료]로 되돌립니다. 메일은 나가지 않습니다."
                      style="font-size:11px;font-weight:600;padding:5px 10px;border-radius:7px;
                             border:1px solid var(--border-default);background:var(--bg-surface);
                             color:var(--text-secondary);cursor:pointer">↩ 빼기</button>
                  </td>`}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${total > leads.length ? `
        <div style="padding:9px 14px;font-size:11.5px;color:var(--text-tertiary);border-top:1px solid var(--border-subtle)">
          ${leads.length.toLocaleString()}곳만 표시 · 전체 ${total.toLocaleString()}곳
        </div>` : ''}
    </div>`;
}

async function renderScheduledMailsPage() {
  els.content.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-tertiary)">로드 중...</div>`;
  let items = [];
  try {
    items = await fetchScheduledMails(_schedStatusFilter);
  } catch (e) {
    els.content.innerHTML = `<div style="padding:24px;color:#dc2626">불러오기 실패: ${escapeHtml(e.message || 'unknown')}</div>`;
    return;
  }

  const statusMap = {
    pending:  { label: '⏳ 대기 중',   color: '#f59e0b', bg: '#fef3c7' },
    sent:     { label: '✅ 발송 완료', color: '#166534', bg: '#dcfce7' },
    failed:   { label: '❌ 실패',      color: '#991b1b', bg: '#fee2e2' },
    canceled: { label: '🚫 취소됨',    color: '#6b7280', bg: '#f3f4f6' },
  };

  const chip = (key, label, color) => {
    const active = _schedStatusFilter === key;
    return `<button type="button" class="sched-status-chip" data-status="${key}"
      style="padding:6px 14px;border-radius:99px;border:2px solid ${active ? color : '#cbd5e1'};
        background:${active ? color : 'transparent'};color:${active ? 'white' : 'var(--text-secondary)'};
        font-weight:700;font-size:12px;cursor:pointer;transition:all 0.15s">
      ${label}
    </button>`;
  };

  const fmtWhen = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const fmtRelative = (iso) => {
    if (!iso) return '';
    const diff = new Date(iso).getTime() - Date.now();
    const min = Math.round(diff / 60000);
    if (Math.abs(min) < 60) return min >= 0 ? `${min}분 후` : `${-min}분 전`;
    const hr = Math.round(min / 60);
    if (Math.abs(hr) < 48) return hr >= 0 ? `${hr}시간 후` : `${-hr}시간 전`;
    const d = Math.round(hr / 24);
    return d >= 0 ? `${d}일 후` : `${-d}일 전`;
  };

  els.content.innerHTML = `
    <div style="max-width:1100px;margin:0 auto">
      <div style="padding:16px 18px;background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #fcd34d;border-radius:12px;margin-bottom:16px;color:#78350f">
        <div style="font-size:15px;font-weight:800;margin-bottom:6px">📅 예약 발송 관리</div>
        <div style="font-size:13px;line-height:1.7">
          여기 있는 예약은 Vercel Cron 이 <b>5분마다</b> 확인해서 예약 시각 도래한 항목을 자동으로 발송합니다.
          <br>· <b>발송 여부 확인</b>: 대기 중/발송 완료/실패/취소 상태로 조회
          · <b>취소</b>: 대기 중일 때만 · <b>즉시 발송</b>: 예약 시각 전에 지금 바로 보내기
          <br>· <b>과도 발송 방지</b>: 리드당 최대 3회 · 최근 발송 후 48h 안 지났으면 자동 스킵 (실패로 기록)
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${chip('pending',  '⏳ 대기 중',   '#f59e0b')}
        ${chip('sent',     '✅ 발송 완료', '#166534')}
        ${chip('failed',   '❌ 실패',      '#dc2626')}
        ${chip('canceled', '🚫 취소됨',    '#6b7280')}
        ${chip('all',      '📋 전체',      '#334155')}
      </div>

      ${items.length === 0 ? `
        <div style="padding:48px;text-align:center;background:var(--surface-1);border:1px dashed var(--border);border-radius:12px;color:var(--text-tertiary);font-size:14px">
          📭 이 상태의 예약이 없습니다.<br>
          <span style="font-size:12px">"발송 관리" 페이지의 <b>📅 예약 발송</b> 카드로 등록하세요.</span>
        </div>
      ` : `
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:var(--surface-2);color:var(--text-secondary);text-align:left">
                <th style="padding:10px 14px;font-weight:700">상태</th>
                <th style="padding:10px 14px;font-weight:700">회사</th>
                <th style="padding:10px 14px;font-weight:700">수신자</th>
                <th style="padding:10px 14px;font-weight:700">예약 시각</th>
                <th style="padding:10px 14px;font-weight:700;text-align:right">액션</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => {
                const s = statusMap[it.status] || statusMap.pending;
                const canAct = it.status === 'pending';
                return `
                  <tr style="border-top:1px solid var(--border)">
                    <td style="padding:12px 14px">
                      <span style="background:${s.bg};color:${s.color};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">${s.label}</span>
                      ${it.attempts > 0 ? `<div style="margin-top:4px;font-size:10px;color:var(--text-tertiary)">시도 ${it.attempts}회</div>` : ''}
                    </td>
                    <td style="padding:12px 14px">
                      <div style="font-weight:600;color:var(--text-primary)">${escapeHtml((it.lead && it.lead.Company) || '(삭제된 리드)')}</div>
                      ${it.lead && it.lead.Region ? `<div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(it.lead.Region)}</div>` : ''}
                    </td>
                    <td style="padding:12px 14px;color:var(--text-secondary);font-family:monospace;font-size:12px">${escapeHtml(it.to)}</td>
                    <td style="padding:12px 14px">
                      <div style="color:var(--text-primary);font-size:12px">${fmtWhen(it.scheduledFor)}</div>
                      <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${fmtRelative(it.scheduledFor)}</div>
                      ${it.sentAt ? `<div style="font-size:10px;color:#166534;margin-top:2px">발송: ${fmtWhen(it.sentAt)}</div>` : ''}
                      ${it.lastError ? `<div style="font-size:10px;color:#dc2626;margin-top:4px;max-width:240px" title="${escapeAttr(it.lastError)}">${escapeHtml(it.lastError.slice(0,60))}</div>` : ''}
                    </td>
                    <td style="padding:12px 14px;text-align:right">
                      ${canAct ? `
                        <button type="button" class="sched-send-now" data-id="${escapeAttr(it._id)}"
                          style="padding:6px 10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;margin-right:4px">
                          ⚡ 즉시
                        </button>
                        <button type="button" class="sched-cancel" data-id="${escapeAttr(it._id)}"
                          style="padding:6px 10px;background:transparent;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">
                          🚫 취소
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  document.querySelectorAll('.sched-status-chip').forEach(el => {
    el.addEventListener('click', () => {
      _schedStatusFilter = el.dataset.status;
      renderScheduledMailsPage();
    });
  });
  document.querySelectorAll('.sched-cancel').forEach(el => {
    el.addEventListener('click', async () => {
      if (!confirm('이 예약을 취소하시겠습니까?')) return;
      try {
        const res = await fetch(`/api/mail/schedule/${el.dataset.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        renderScheduledMailsPage();
      } catch (e) {
        alert('취소 실패: ' + (e.message || 'unknown'));
      }
    });
  });
  document.querySelectorAll('.sched-send-now').forEach(el => {
    el.addEventListener('click', async () => {
      if (!confirm('이 예약을 지금 즉시 발송하시겠습니까?')) return;
      el.textContent = '⏳';
      el.disabled = true;
      try {
        const res = await fetch(`/api/mail/schedule/${el.dataset.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send-now' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        if (data.result?.ok) alert('✅ 발송 완료' + (data.result.dryRun ? ' (DRY_RUN)' : ''));
        else alert('❌ 발송 실패: ' + (data.result?.error || 'unknown'));
        invalidateServerPage();
        renderScheduledMailsPage();
      } catch (e) {
        alert('즉시 발송 실패: ' + (e.message || 'unknown'));
      }
    });
  });
}

async function renderMailAccountsTool() {
  els.content.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-tertiary)">로드 중...</div>`;
  const list = await loadMailAccounts(true);

  els.content.innerHTML = `
    ${mailAccountPrimaryPanelHtml(list)}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:14px;font-weight:700">등록된 계정 (${list.length})</h3>
      ${list.length > 0 ? `<button id="addMailAccountBtn" class="button primary" type="button" style="font-size:13px;padding:8px 14px">+ 계정 추가</button>` : ''}
    </div>

    ${list.length === 0 ? `
      <div style="padding:56px 32px;text-align:center;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #93c5fd;border-radius:16px">
        <div style="font-size:56px;margin-bottom:14px">📮</div>
        <div style="font-size:20px;font-weight:800;color:#1e40af;margin-bottom:8px">
          이카운트 웹메일에 로그인하기
        </div>
        <div style="font-size:13px;color:#1e3a8a;line-height:1.7;max-width:520px;margin:0 auto 24px">
          B2B 광고 메일을 회사 이메일로 자동 발송하려면 먼저 로그인이 필요합니다.<br>
          <b>이카운트가 아닌 Gmail · Outlook · Naver</b> 도 같은 화면에서 등록 가능.
        </div>

        <!-- 이카운트 사전 세팅 안내 (emailData 참고) -->
        <div style="text-align:left;background:white;border:1px solid #cbd5e1;border-radius:10px;padding:14px 18px;max-width:520px;margin:0 auto 20px">
          <div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:8px">
            ⚡ 이카운트는 로그인 전에 웹메일 설정 2가지가 필요해요
          </div>
          <ol style="margin:0;padding-left:20px;font-size:12px;color:#0f172a;line-height:1.7">
            <li>웹메일 → <b>개인기능설정 → 외부연동설정</b></li>
            <li><b>메일 클라이언트 사용</b>: "사용" 으로 변경</li>
            <li><b>해외 로그인 차단</b>: "사용안함" 으로 변경 (Vercel 서버는 해외라서 필수)</li>
          </ol>
        </div>

        <button id="addFirstAccountBtn" type="button"
          style="font-size:16px;font-weight:700;padding:14px 32px;background:#2563eb;color:white;
          border:none;border-radius:12px;cursor:pointer;box-shadow:0 4px 12px rgba(37,99,235,0.3)">
          📮 이카운트 웹메일 로그인
        </button>
        <div style="margin-top:14px;font-size:11px;color:#64748b">
          🔒 로그인 정보는 AES-256-GCM 로 암호화 저장. 서버에서만 복호화.
        </div>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${list.map(mailAccountCardHtml).join('')}
      </div>
    `}
  `;

  document.getElementById('addMailAccountBtn')?.addEventListener('click', () => openMailAccountModal());
  document.getElementById('addFirstAccountBtn')?.addEventListener('click', () => openMailAccountModal());
  document.querySelectorAll('.acc-verify-btn').forEach(b => b.addEventListener('click', () => verifyMailAccount(b.dataset.accId)));
  document.querySelectorAll('.acc-backfill-btn').forEach(b => b.addEventListener('click', () => runMailBackfill([{ id: b.dataset.accId, label: b.dataset.accLabel }])));
  document.querySelectorAll('.acc-edit-btn').forEach(b => b.addEventListener('click', () => openMailAccountModal(b.dataset.accId)));
  document.querySelectorAll('.acc-delete-btn').forEach(b => b.addEventListener('click', () => deleteMailAccount(b.dataset.accId)));

  // ── 대표 계정 지정 ──
  // 고르기만 해서는 바뀌지 않는다. 메일함이 통째로 바뀌는 일이라 한 번 더 누르게 한다.
  const sel = document.getElementById('primaryAccSelect');
  const applyBtn = document.getElementById('primaryAccApply');
  if (sel && applyBtn) {
    const cur = list.find(a => a.isDefault)?._id || '';
    const sync = () => {
      const changed = sel.value && sel.value !== cur;
      applyBtn.disabled = !changed;
      applyBtn.style.opacity = changed ? '1' : '.45';
      applyBtn.style.cursor = changed ? 'pointer' : 'default';
      applyBtn.textContent = changed ? '이 계정으로 지정' : '지정됨';
    };
    sel.addEventListener('change', sync);
    applyBtn.addEventListener('click', () => {
      if (applyBtn.disabled) return;
      setDefaultMailAccount(sel.value);
    });
    sync();
  }
}

/**
 * 대표 계정 지정 패널 — 이 화면 맨 위.
 *
 * 예전에는 계정 카드마다 '이 계정으로 전환' 버튼이 붙어 있었다. 버튼이 목록 속에
 * 흩어져 있으니 "지금 대표가 누구인가"를 한눈에 읽기 어려웠다. 지정은 한 곳에서만
 * 하고, 카드에는 결과(대표 배지)만 남긴다.
 */
function mailAccountPrimaryPanelHtml(list) {
  if (!list.length) {
    return `
      <div style="background:var(--brand-soft,#eef2ff);border:1px solid var(--brand,#c7d2fe);
                  border-radius:12px;padding:15px 20px;margin-bottom:16px">
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7">
          계정을 등록하면 그중 하나를 <b>대표 계정</b>으로 지정할 수 있습니다.
          대표 계정으로 지정된 주소가 곧 메일함이 됩니다.
        </div>
      </div>`;
  }

  const cur = list.find(a => a.isDefault) || null;
  const options = list.map(a => `
    <option value="${escapeAttr(a._id)}" ${a.isDefault ? 'selected' : ''} ${a.isActive === false ? 'disabled' : ''}>
      ${escapeHtml(a.accountName)} — ${escapeHtml(a.smtpUser)}${a.isActive === false ? ' (비활성)' : ''}
    </option>`).join('');

  return `
    <div style="background:var(--brand-soft,#eef2ff);border:1px solid var(--brand,#c7d2fe);
                border-radius:12px;padding:16px 20px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:4px">
        <span style="font-size:20px">👤</span>
        <strong style="font-size:14.5px;color:var(--brand-text,#4338ca)">대표 계정 지정</strong>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.6">
        여기서 지정한 계정이 <b>메일함이 됩니다.</b> 지정하면 아래 화면이 모두 그 계정 것으로 바뀝니다.
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:11px">
        <select id="primaryAccSelect"
          style="flex:1;min-width:240px;padding:9px 12px;font-size:13px;font-weight:600;
                 border:1px solid var(--border-default);border-radius:9px;
                 background:var(--bg-surface);color:var(--text-primary)">
          ${options}
        </select>
        <button id="primaryAccApply" type="button" class="button primary"
          style="font-size:13px;padding:9px 18px;white-space:nowrap">이 계정으로 지정</button>
      </div>

      <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-surface);
                  border:1px solid var(--border-default);border-radius:9px;margin-bottom:11px">
        <span style="font-size:10.5px;font-weight:800;letter-spacing:.4px;color:var(--text-tertiary);
                     text-transform:uppercase;white-space:nowrap">현재 대표</span>
        <span style="font-size:13.5px;font-weight:700;color:var(--text-primary);
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${cur ? escapeHtml(cur.smtpUser) : '<span style="color:#b45309;font-weight:600">지정된 계정이 없습니다</span>'}
        </span>
      </div>

      <div style="font-size:12px;color:var(--text-secondary);line-height:1.8">
        <b>지정하면 이렇게 바뀝니다</b>
        <br>· <b>받은 메일함</b> — 그 계정에 온 메일만 보입니다
        <br>· <b>회신 필요 · 기한 관리</b> — 그 계정 메일만 셉니다
        <br>· <b>거래처 폴더</b> — 그 계정 메일함의 폴더로 다시 그려집니다
        <br>· <b>답장</b> — 받은 메일에 답할 때 그 주소로 나갑니다
        <br><span style="color:var(--text-tertiary)">메일이 지워지는 것은 아닙니다. 대표를 되돌리면 그대로 보입니다.</span>
      </div>

      <p style="margin:11px 0 0;padding-top:10px;border-top:1px solid var(--border-default);
                font-size:11.5px;color:var(--text-tertiary);line-height:1.6">
        비밀번호는 서버에 AES-256-GCM 으로 암호화해 저장하고 발송할 때만 복호화합니다.
        이카운트 외에 Gmail · Outlook · 네이버도 같은 화면에서 등록할 수 있습니다.
      </p>
    </div>`;
}

function mailAccountCardHtml(acc) {
  const verifiedAgo = acc.lastVerifiedAt ? formatRelativeKo(acc.lastVerifiedAt) : null;
  const hasError = !!acc.lastVerifyError;
  return `
    <div style="background:var(--surface-1);border:1px solid ${acc.isDefault ? '#3b82f6' : 'var(--border)'};border-radius:12px;padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <strong style="font-size:15px">${escapeHtml(acc.accountName)}</strong>
            ${acc.isDefault ? '<span title="대표 계정입니다 — 지금 메일함이 이 계정 것입니다" style="padding:2px 8px;background:#dbeafe;color:#1e40af;border-radius:99px;font-size:10px;font-weight:700">👤 대표 계정</span>' : ''}
            ${!acc.isActive ? '<span style="padding:2px 8px;background:#f3f4f6;color:#6b7280;border-radius:99px;font-size:10px">비활성</span>' : ''}
          </div>
          <div style="font-size:13px;color:var(--text-secondary);font-family:monospace">
            ${escapeHtml(acc.smtpUser)} · ${escapeHtml(acc.smtpHost)}:${acc.smtpPort}
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">
            From: ${escapeHtml(acc.fromName || '(no name)')} &lt;${escapeHtml(acc.fromAddress)}&gt;
          </div>
          ${verifiedAgo || hasError ? `
            <div style="font-size:11px;margin-top:6px;color:${hasError ? '#dc2626' : '#059669'}">
              ${hasError ? '⚠ 마지막 검증 실패: ' + escapeHtml(acc.lastVerifyError.slice(0, 100)) : '✅ 검증됨 ' + verifiedAgo}
            </div>
          ` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button class="acc-backfill-btn button ghost" data-acc-id="${escapeAttr(acc._id)}" data-acc-label="${escapeAttr(acc.accountName || acc.smtpUser)}" type="button" style="font-size:11px;padding:5px 10px" title="이 메일함의 최근 2달 메일을 전부 가져와 분류합니다">📥 2달 가져오기</button>
          <button class="acc-verify-btn button ghost" data-acc-id="${escapeAttr(acc._id)}" type="button" style="font-size:11px;padding:5px 10px" title="지금 SMTP 연결 재검증">🔄 검증</button>
          <button class="acc-edit-btn button ghost" data-acc-id="${escapeAttr(acc._id)}" type="button" style="font-size:11px;padding:5px 10px">✏ 수정</button>
          <button class="acc-delete-btn button ghost" data-acc-id="${escapeAttr(acc._id)}" type="button" style="font-size:11px;padding:5px 10px;color:#dc2626">🗑</button>
        </div>
      </div>
    </div>
  `;
}

async function verifyMailAccount(id) {
  const btn = document.querySelector(`.acc-verify-btn[data-acc-id="${id}"]`);
  if (btn) { btn.textContent = '⏳ 검증 중'; btn.disabled = true; }
  try {
    const res = await fetch(`/api/mail-accounts/${id}/verify`, { method: 'POST' });
    const data = await res.json();
    alert(data.success ? `✅ 연결 확인 완료 (${data.verifiedAt})` : `❌ 실패: ${data.error}`);
    await loadMailAccounts(true);
    if (state.view === 'tool-mail-accounts') renderMailAccountsTool();
  } catch (e) {
    alert('검증 실패: ' + (e.message || 'unknown'));
    if (btn) { btn.textContent = '🔄 검증'; btn.disabled = false; }
  }
}

/**
 * 대표 계정을 바꾼다 — 저장만 하고 끝내면 안 된다.
 *
 * 메일함은 _inboxState.accountId 로 그려지고, 한 번이라도 탭을 눌렀으면
 * accountPicked 가 켜져서 대표 계정을 다시 따라가지 않는다. 그래서 대표를 바꿔도
 * 화면은 전에 보던 계정에 머물러 있었다. 여기서 그 고정을 풀고 새 대표로 옮긴다.
 * 폴더·페이지·휴지통도 이전 계정 기준이라 같이 초기화한다.
 *
 * accountId 는 MailAccount._id 문자열과 같은 값이다(lib/mail/accounts.ts summarize).
 */
async function setDefaultMailAccount(id) {
  const btn = document.getElementById('primaryAccApply');
  const prev = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 지정 중'; }
  try {
    const res = await fetch(`/api/mail-accounts/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    // 메일함을 새 대표 계정으로 옮긴다
    if (typeof _inboxState !== 'undefined') {
      _inboxState.accountId = String(id);
      _inboxState.accountPicked = false;  // 대표를 다시 따라가도록 고정 해제
      _inboxState.page = 1;
      _inboxState.group = '';             // 폴더는 계정마다 다르다
      _inboxState.trashed = false;
    }
    // 계정별로 다른 값들이라 캐시를 통째로 버린다
    _mailAccountsCache = null;
    _mailGroupsCache = null;
    _mailCountsCache = null;

    await loadMailAccounts(true);
    await loadInboxAccounts(true);
    loadMailCounts(true);               // 사이드바 배지도 새 계정 기준으로

    const acc = (_mailAccounts || []).find(a => String(a._id) === String(id));
    renderMailAccountsTool();
    if (acc) alert(`✅ 대표 계정을 ${acc.smtpUser} 로 지정했습니다.\n메일함이 이 계정 것으로 바뀝니다.`);
  } catch (e) {
    alert('대표 계정 지정 실패: ' + (e.message || 'unknown'));
    if (btn) { btn.disabled = false; btn.textContent = prev || '이 계정으로 지정'; }
  }
}

async function deleteMailAccount(id) {
  const acc = (_mailAccounts || []).find(a => a._id === id);
  if (!acc) return;
  if (!confirm(`계정 "${acc.accountName}" (${acc.smtpUser}) 을 삭제하시겠습니까?`)) return;
  try {
    const res = await fetch(`/api/mail-accounts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    await loadMailAccounts(true);
    renderMailAccountsTool();
  } catch (e) { alert('삭제 실패: ' + (e.message || 'unknown')); }
}

// 계정 추가/수정 모달
function openMailAccountModal(editId) {
  const isEdit = !!editId;
  const acc = isEdit ? (_mailAccounts || []).find(a => a._id === editId) : null;

  // ── 이카운트 하나만 남긴다 ──
  //
  // 예전에는 Gmail·Outlook·네이버·다음·카페24·직접입력까지 골랐다.
  // 그런데 회사 메일은 이카운트 하나뿐이고, 다른 것을 고르면 그때부터
  // 앱 비밀번호·IMAP 활성화 같은 각 서비스 사정을 알아야 한다.
  // 쓸 일이 없는 선택지가 여섯 개 있으면 "뭘 골라야 하지"가 먼저 생긴다.
  //
  // 되살리려면 아래 배열에 항목을 다시 넣으면 된다 — providerGuides 안내문과
  // 호스트 자동 채움은 그대로 살아 있다.
  const presetOptions = [
    { key: 'ecount',  label: '📮 이카운트 (ECOUNT)', host: 'wsmtp.ecount.com', port: 465, secure: true },
  ];
  // 서비스별 사전 세팅 안내
  const providerGuides = {
    ecount: {
      title: '이카운트는 웹메일에서 2가지 설정이 켜져 있어야 합니다',
      steps: [
        '웹메일 로그인 → 개인기능설정 → 외부연동설정',
        '"메일 클라이언트 사용"을 사용으로 변경',
        '"해외 로그인 차단"을 사용안함으로 변경 (Vercel 서버는 해외 IP)',
      ],
    },
    gmail: {
      title: 'Gmail은 계정 비밀번호로 로그인되지 않습니다',
      steps: [
        'Google 계정 → 보안 → 2단계 인증 켜기',
        '같은 화면에서 앱 비밀번호 발급 (16자리)',
        '아래 비밀번호 칸에는 앱 비밀번호를 입력',
      ],
    },
    naver: {
      title: '네이버는 IMAP/SMTP 사용 활성화가 필요합니다',
      steps: [
        '네이버 메일 → 환경설정 → POP3/IMAP 설정',
        'IMAP/SMTP 사용 켜기',
        '2단계 인증 사용 시 애플리케이션 비밀번호 발급',
      ],
    },
    outlook: {
      title: 'Outlook은 앱 비밀번호 필요',
      steps: [
        'Microsoft 계정 → 보안 → 2단계 인증 활성화',
        '고급 보안 옵션 → 앱 비밀번호 만들기',
        '앱 비밀번호를 아래 칸에 입력',
      ],
    },
  };
  // 현재 선택된 프리셋 (호스트 기반 추측 · 신규는 이카운트 기본)
  const guessPresetKey = (h) => {
    if (!h) return 'ecount';
    const l = h.toLowerCase();
    if (l.includes('ecount')) return 'ecount';
    if (l.includes('gmail')) return 'gmail';
    if (l.includes('office365') || l.includes('outlook')) return 'outlook';
    if (l.includes('naver')) return 'naver';
    if (l.includes('daum')) return 'daum';
    if (l.includes('cafe24')) return 'cafe24';
    return 'custom';
  };
  const currentPresetKey = guessPresetKey(acc?.smtpHost);

  document.getElementById('mailAccountModalRoot')?.remove();
  const modalHtml = `
    <div id="mailAccountModalRoot" style="position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)">
      <div style="width:min(560px,95vw);max-height:92vh;background:#ffffff;color:#0f172a;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.4)">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="font-size:36px">📮</div>
            <div>
              <div style="font-size:18px;font-weight:800;color:#92400e">
                ${isEdit ? '메일 계정 수정' : '메일 계정 로그인'}
              </div>
              <div style="font-size:12px;color:#78350f;margin-top:3px;line-height:1.5">
                ${isEdit ? '이 계정 정보를 업데이트합니다.' : '회사 메일 계정으로 로그인하면 <b>그 계정으로 광고 메일이 발송</b>됩니다.'}<br>
                🔒 비밀번호는 AES-256 로 서버에서만 복호화.
              </div>
            </div>
          </div>
          <button id="macModalClose" style="background:rgba(255,255,255,0.5);border:none;font-size:22px;cursor:pointer;color:#92400e;padding:2px 12px;border-radius:6px">×</button>
        </div>

        <div style="padding:16px 24px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">
          <!-- ① 서비스 선택 -->
          <div>
            <label style="font-size:12px;color:#1e40af;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">① 서비스 선택</label>
            <select id="macPreset" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;font-weight:600">
              ${presetOptions.map(p => `<option value="${p.key}" ${p.key === currentPresetKey ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
          </div>

          <!-- 서비스별 사전 세팅 안내 (프리셋에 따라 동적 표시) -->
          <div id="macGuide" style="display:none;padding:12px 14px;background:#eff6ff;border:1px solid #93c5fd;border-radius:10px">
            <div id="macGuideTitle" style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:6px"></div>
            <ol id="macGuideSteps" style="margin:0;padding-left:20px;font-size:12px;color:#0f172a;line-height:1.7"></ol>
          </div>

          <!-- 로그인 거절(535) 때 뜨는 안내 — 저장 실패 처리에서 보여준다 -->
          <div id="macAuthHelp" hidden style="padding:12px 14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px">
            <div style="font-size:12.5px;font-weight:800;color:#991b1b;margin-bottom:6px">🚫 메일 서버가 로그인을 거절했습니다 — 아래를 차례로 확인하세요</div>
            <ol style="margin:0;padding-left:20px;font-size:12px;color:#0f172a;line-height:1.75">
              <li><b>비밀번호</b> — ERP 로그인 비밀번호가 아니라 <b>메일(웹메일) 비밀번호</b>인지, 한/영·Caps Lock 확인</li>
              <li><b>이카운트 웹메일 로그인 → 개인기능설정 → 외부연동설정</b></li>
              <li><b>"해외 로그인 차단" → 사용안함</b> (이 앱의 서버는 해외 IP 로 잡혀 이 설정이 켜져 있으면 막힙니다)</li>
              <li><b>"메일 클라이언트 사용" → 사용</b></li>
              <li>설정을 바꾼 뒤 다시 <b>[저장]</b> — 틀린 시도를 여러 번 했다면 몇 분 뒤에 시도</li>
            </ol>
            <div style="font-size:11px;color:#7f1d1d;margin-top:6px">메뉴 이름은 이카운트 화면에 따라 조금 다를 수 있습니다. 회사 관리자 계정에서만 바꿀 수 있는 경우도 있습니다.</div>
          </div>

          <!-- ② 로그인 정보 -->
          <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
            <label style="font-size:12px;color:#1e40af;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">② 로그인 정보</label>
          </div>

          <div>
            <label style="font-size:11px;color:var(--text-secondary);font-weight:700">📧 이메일 (SMTP 계정)</label>
            <input id="macUser" type="text" value="${escapeAttr(acc?.smtpUser || '')}" placeholder="me@yogico.kr"
              style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:2px">
          </div>

          <div>
            <label style="font-size:11px;color:var(--text-secondary);font-weight:700">
              🔑 비밀번호 ${isEdit ? '<span style="color:var(--text-tertiary);font-weight:400">(변경 시에만 입력. 빈 값이면 기존 유지)</span>' : '<span style="color:#dc2626">*</span>'}
            </label>
            <input id="macPass" type="password" placeholder="${isEdit ? '(변경 안 함)' : '이카운트 웹메일 비밀번호 또는 앱 비밀번호'}"
              style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:2px">
          </div>

          <!-- ③ 별칭 + 발신자 -->
          <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
            <label style="font-size:12px;color:#1e40af;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">③ 별칭 & 발신자 표시</label>
          </div>

          <div>
            <label style="font-size:11px;color:var(--text-secondary);font-weight:700">📝 이 계정의 별칭 (내가 식별용)</label>
            <input id="macName" type="text" value="${escapeAttr(acc?.accountName || '')}" placeholder="예: PR팀 · 영업팀 · 개인 아이디"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
          </div>

          <!-- SMTP 상세 (기본 접힘 · 프리셋 선택 시 자동 채워짐) -->
          <details style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface-2)">
            <summary style="cursor:pointer;font-size:12px;color:var(--text-secondary);font-weight:600">⚙️ SMTP 서버 상세 (자동 채워짐 — 필요 시에만 수정)</summary>
            <div style="margin-top:12px;display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary);font-weight:700">SMTP 호스트</label>
                <input id="macHost" type="text" value="${escapeAttr(acc?.smtpHost || '')}" placeholder="smtp.example.com"
                  style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:2px">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary);font-weight:700">포트</label>
                <input id="macPort" type="number" value="${acc?.smtpPort || 465}"
                  style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:2px">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary);font-weight:700">보안</label>
                <select id="macSecure" style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:2px">
                  <option value="true" ${acc?.smtpSecure !== false ? 'selected' : ''}>SSL (465)</option>
                  <option value="false" ${acc?.smtpSecure === false ? 'selected' : ''}>STARTTLS (587)</option>
                </select>
              </div>
            </div>
            <div style="margin-top:6px;font-size:10px;color:var(--text-tertiary)">
              이카운트 기본: <code>wsmtp.ecount.com:465</code> SSL. 프리셋 변경 시 자동 반영.
            </div>
          </details>

          <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">발신자 이름</label>
              <input id="macFromName" type="text" value="${escapeAttr(acc?.fromName || '')}" placeholder="요기보"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">발신 주소</label>
              <input id="macFromAddress" type="text" value="${escapeAttr(acc?.fromAddress || acc?.smtpUser || '')}" placeholder="hello@company.com"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
            </div>
          </div>

          <!-- ④ 발송자 프로필 (템플릿 {{SenderXxx}} 변수 자동 채움) -->
          <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
            <label style="font-size:12px;color:#1e40af;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">④ 발송자 프로필</label>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">메일 템플릿의 <code style="background:#eef2ff;padding:1px 5px;border-radius:4px;color:#4338ca;font-weight:600">{{SenderTitle}}</code> <code style="background:#eef2ff;padding:1px 5px;border-radius:4px;color:#4338ca;font-weight:600">{{SenderPhone}}</code> <code style="background:#eef2ff;padding:1px 5px;border-radius:4px;color:#4338ca;font-weight:600">{{SenderCompany}}</code> 변수에 자동 주입됩니다.</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">🎯 내 직함 (선택)</label>
              <input id="macSenderTitle" type="text" value="${escapeAttr(acc?.senderTitle || '')}" placeholder="예: Head of Global Partnerships"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);font-weight:700">📞 내 전화번호 (M:)</label>
              <input id="macSenderPhone" type="text" value="${escapeAttr(acc?.senderPhone || '')}" placeholder="예: +82 10 6747 9443"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary);font-weight:700">🏢 내 회사명</label>
            <input id="macSenderCompany" type="text" value="${escapeAttr(acc?.senderCompany || '')}" placeholder="예: Yogi Corporation Inc."
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary);font-weight:700">🏛 주소 (A:)</label>
            <input id="macSenderAddress" type="text" value="${escapeAttr(acc?.senderAddress || '')}" placeholder="예: 201, 125, Bongeunsa-ro, Gangnam-gu, Seoul, Korea"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary);font-weight:700">🌐 웹사이트</label>
            <input id="macSenderWebsite" type="text" value="${escapeAttr(acc?.senderWebsite || '')}" placeholder="예: www.yogico.kr"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-top:2px">
          </div>

          <!-- 메일 하단에 붙을 서명 — 입력하는 대로 바뀐다 (서버 lib/template-vars.ts buildSignatureBlock 과 같은 모양) -->
          <div style="padding:12px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px">
            <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:8px">✍ 메일 하단에 이렇게 붙습니다</div>
            <div id="macSigPreview" style="padding:12px 14px;background:#fff;border:1px solid #bbf7d0;border-radius:8px">${signaturePreviewHtml(acc || {})}</div>
          </div>

          <!-- 대표 지정은 계정 관리 화면 맨 위 한 곳에서만 한다.
               여기서도 바꿀 수 있게 두면 "어디서 바꿨는지" 가 흩어지고,
               이 경로로 바꿨을 때 메일함이 따라오지 않아 화면이 어긋난다.
               다만 첫 등록 때는 대표를 정해줘야 해서 신규일 때만 남긴다. -->
          ${isEdit ? `
            <div style="font-size:12px;color:var(--text-tertiary);background:var(--surface-2,#f8fafc);
                        border:1px solid var(--border-default);border-radius:8px;padding:9px 12px;line-height:1.6">
              👤 <b>대표 계정 지정</b>은 이 창이 아니라 <b>계정 목록 맨 위</b>에서 바꿉니다.
              ${acc?.isDefault ? '<br>이 계정이 현재 대표 계정입니다.' : ''}
            </div>
          ` : `
            <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);cursor:pointer">
              <input type="checkbox" id="macIsDefault">
              <span>이 계정을 대표 계정으로 지정 (메일함이 이 계정 것이 됩니다)</span>
            </label>
          `}
        </div>

        <div style="padding:14px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
          <button id="macCancel" class="button ghost" type="button" style="font-size:13px;padding:9px 16px">닫기</button>
          <button id="macSave" class="button primary" type="button" style="font-size:14px;font-weight:700;padding:11px 24px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,0.3)">
            ${isEdit ? '💾 변경사항 저장' : '🚀 내 계정 등록하기'}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // 사용자 요청: 반드시 × 버튼 (또는 닫기 버튼) 을 눌러야만 닫히도록.
  // 백드롭 클릭·Esc 로는 닫히지 않음 (실수로 입력 다 날리는 것 방지).
  const closeModal = () => document.getElementById('mailAccountModalRoot')?.remove();
  document.getElementById('macModalClose')?.addEventListener('click', closeModal);
  document.getElementById('macCancel')?.addEventListener('click', closeModal);

  // 프리셋 선택 → 호스트/포트/보안 자동 채움 + 서비스별 가이드 표시
  const applyPreset = (key) => {
    const preset = presetOptions.find(p => p.key === key);
    if (preset && preset.host) {
      document.getElementById('macHost').value = preset.host;
      document.getElementById('macPort').value = preset.port;
      document.getElementById('macSecure').value = String(preset.secure);
    }
    // 가이드 표시/숨김
    const guide = providerGuides[key];
    const guideEl = document.getElementById('macGuide');
    const titleEl = document.getElementById('macGuideTitle');
    const stepsEl = document.getElementById('macGuideSteps');
    if (guide && guideEl) {
      titleEl.textContent = `⚡ ${guide.title}`;
      stepsEl.innerHTML = guide.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('');
      guideEl.style.display = 'block';
    } else if (guideEl) {
      guideEl.style.display = 'none'; syncBodyScrollLock();
    }
  };
  document.getElementById('macPreset')?.addEventListener('change', (e) => applyPreset(e.target.value));
  // 서명 미리보기 — 이름·직함·회사·주소·전화·웹사이트를 고칠 때마다 다시 그린다
  const refreshSig = () => {
    const box = document.getElementById('macSigPreview');
    if (!box) return;
    const v = (id) => document.getElementById(id)?.value.trim() || '';
    box.innerHTML = signaturePreviewHtml({
      fromName: v('macFromName'), senderTitle: v('macSenderTitle'), senderCompany: v('macSenderCompany'),
      senderAddress: v('macSenderAddress'), senderPhone: v('macSenderPhone'), senderWebsite: v('macSenderWebsite'),
      fromAddress: v('macFromAddress'),
    });
  };
  ['macFromName', 'macSenderTitle', 'macSenderCompany', 'macSenderAddress', 'macSenderPhone', 'macSenderWebsite', 'macFromAddress']
    .forEach((id) => document.getElementById(id)?.addEventListener('input', refreshSig));
  // 최초 렌더 시 현재 프리셋에 대한 가이드도 즉시 표시
  applyPreset(currentPresetKey);

  document.getElementById('macSave')?.addEventListener('click', async () => {
    const payload = {
      accountName: document.getElementById('macName').value.trim(),
      smtpHost: document.getElementById('macHost').value.trim(),
      smtpPort: parseInt(document.getElementById('macPort').value, 10),
      smtpSecure: document.getElementById('macSecure').value === 'true',
      smtpUser: document.getElementById('macUser').value.trim(),
      fromName: document.getElementById('macFromName').value.trim(),
      fromAddress: document.getElementById('macFromAddress').value.trim(),
      senderTitle: document.getElementById('macSenderTitle')?.value.trim() || '',
      senderPhone: document.getElementById('macSenderPhone')?.value.trim() || '',
      senderCompany: document.getElementById('macSenderCompany')?.value.trim() || '',
      senderAddress: document.getElementById('macSenderAddress')?.value.trim() || '',
      senderWebsite: document.getElementById('macSenderWebsite')?.value.trim() || '',
      // 수정 창에는 체크박스가 없다(대표 지정은 목록 맨 위에서만) — 없으면 건드리지 않는다
      isDefault: document.getElementById('macIsDefault')?.checked || undefined,
    };
    if (payload.isDefault === undefined) delete payload.isDefault;
    const pass = document.getElementById('macPass').value;
    if (pass) payload.smtpPass = pass;

    const btn = document.getElementById('macSave');
    btn.disabled = true; btn.textContent = '⏳ 저장 & 검증 중...';

    try {
      const url = isEdit ? `/api/mail-accounts/${editId}` : '/api/mail-accounts';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'save failed');
      closeModal();

      // 새 계정을 대표로 지정했으면 메일함도 그 계정으로 옮긴다
      const newId = data.account?._id;
      if (payload.isDefault && newId && typeof _inboxState !== 'undefined') {
        _inboxState.accountId = String(newId);
        _inboxState.accountPicked = false;
        _inboxState.page = 1;
        _inboxState.group = '';
        _inboxState.trashed = false;
        _mailAccountsCache = null;
        _mailGroupsCache = null;
        _mailCountsCache = null;
        await loadInboxAccounts(true);
        loadMailCounts(true);
      }

      await loadMailAccounts(true);
      renderMailAccountsTool();
      // 새로 등록한 메일함은 수집 위치가 없어 메일함이 0 · 0 · 0 으로 뜬다 — 묻지 않고 바로 2달치를 가져온다 (오른쪽 아래 %)
      if (!isEdit && newId) {
        runMailBackfill([{ id: String(newId), label: payload.accountName || payload.smtpUser }], { silent: true });
      }
    } catch (e) {
      const msg = String((e && e.message) || 'unknown');
      // 535 / Invalid login 은 비밀번호가 틀렸을 때만 나는 게 아니다.
      // 이카운트는 [해외 로그인 차단]·[메일 클라이언트 사용 안 함] 상태에서도 같은 오류로 막는다
      // (Vercel 서버에서 접속하면 해외 IP 로 잡혀 막힌다 — 실제로 설정을 바꿔야 나갔다, 2026-09-14).
      // 그래서 오류 문구만 띄우지 않고 무엇을 바꿔야 하는지 폼 안에 크게 보여준다.
      const authFail = /535|invalid login|authentication failed|auth.*fail|login.*fail/i.test(msg);
      const box = document.getElementById('macAuthHelp');
      if (box) {
        box.hidden = !authFail;
        if (authFail) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      alert('저장 실패: ' + msg + (authFail
        ? '\n\n메일 서버가 로그인을 거절했습니다. 비밀번호가 맞다면 이카운트 설정 때문일 가능성이 큽니다.\n폼 안의 빨간 안내(이카운트에서 바꿀 설정)를 확인해 주세요.'
        : ''));
      btn.disabled = false; btn.textContent = isEdit ? '💾 수정' : '+ 저장 & 연결 테스트';
    }
  });
}

function renderCrawlerTool() {
  const isKor = (c) => /korea|한국|대한민국/i.test(c || '') && !/north/i.test(c || '');
  const hasRealEmail = (l) => l.Email && String(l.Email).trim() && !/^Not found/i.test(l.Email);

  // 검증완료(verified) 리드만 크롤링 대상
  const in_stage = baseLeads.filter(l =>
    (l.stage || 'imported') === 'verified' && !isKor(l.Region || '')
  );
  const noEmail = in_stage.filter(l => !hasRealEmail(l));
  const withSite = noEmail.filter(l => l.WebsiteContact && String(l.WebsiteContact).trim());
  const pending = withSite.filter(l => !(l.crawledAt || '').trim());
  const attempted = withSite.filter(l => (l.crawledAt || '').trim());
  const promotedInStage = in_stage.filter(l => l.crawledEmails?.length && hasRealEmail(l));
  const cVerified = { total: in_stage.length, noEmail: noEmail.length, withSite: withSite.length,
                      pending: pending.length, attempted: attempted.length, promoted: promotedInStage.length };
  const totalPending = cVerified.pending;
  const totalAttempted = cVerified.attempted;
  const totalPromoted = cVerified.promoted;

  // 실행 대상 = verified 대기 건수
  const scopeCount = cVerified.pending;

  // 최근 실행 결과 최대 20개 (역순)
  const recentResults = _crawlState.runResults.slice(-20).reverse();

  els.content.innerHTML = `
    <!-- 설명 배너 -->
    <div style="background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%);border:1px solid #c7d2fe;border-radius:12px;padding:16px 20px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:22px">🕷</span>
        <strong style="font-size:15px;color:#3730a3">이메일 크롤링 (무료 · 외부 API 안 씀)</strong>
      </div>
      <p style="margin:0;font-size:12px;color:#4c1d95;line-height:1.6">
        회사 홈페이지 + <code style="background:#fff;color:#4c1d95;padding:1px 5px;border-radius:4px;font-weight:600">/contact</code>
        <code style="background:#fff;color:#4c1d95;padding:1px 5px;border-radius:4px;font-weight:600">/about</code>
        <code style="background:#fff;color:#4c1d95;padding:1px 5px;border-radius:4px;font-weight:600">/about-us</code> 순회 →
        mailto: 링크 + 텍스트 이메일 추출 →
        역할별 우선순위 (partnerships > business > sales > marketing > ceo > info) →
        <b>최우선 후보 자동으로 Email 필드 승격</b>
        · 🇰🇷 한국 기업 자동 제외 · 이미 시도한 리드는 재크롤 안 함
      </p>
    </div>

    <!-- 스탯 카드 -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div style="background:var(--surface-1);padding:14px;border:1px solid var(--border);border-radius:10px">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">🎯 크롤 대기</div>
        <div style="font-size:26px;font-weight:800;color:#f59e0b">${totalPending.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">
          검증완료 리드 중 메일 없음 + 사이트 있음
        </div>
      </div>
      <div style="background:var(--surface-1);padding:14px;border:1px solid var(--border);border-radius:10px">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">✅ 크롤 시도 완료</div>
        <div style="font-size:26px;font-weight:800;color:#3b82f6">${totalAttempted.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">이메일 발견/무 무관 · 재시도 안 함</div>
      </div>
      <div style="background:var(--surface-1);padding:14px;border:1px solid var(--border);border-radius:10px">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">📧 Email 자동 승격</div>
        <div style="font-size:26px;font-weight:800;color:#15803d">${totalPromoted.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">발견된 최우선 후보를 Email 필드에 등록</div>
      </div>
      <div style="background:var(--surface-1);padding:14px;border:1px solid var(--border);border-radius:10px">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">💰 예상 비용</div>
        <div style="font-size:26px;font-weight:800;color:#15803d">$0</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">외부 API 안 씀 · 서버 대역폭만 사용</div>
      </div>
    </div>

    <!-- 실행 컨트롤 -->
    <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0;font-size:15px;font-weight:700">🚀 크롤 배치 실행</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">
          한 번에 <b>${_crawlState.chunkLimit}건</b> 씩 순차 처리
        </span>
      </div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">대상: <b>✅ 검증완료</b></label>
        <span style="font-size:11px;color:var(--text-tertiary)">(검증대기 상태는 크롤 안 함 — AI 통과 후에만)</span>
        <div style="flex:1"></div>
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">청크당:</label>
        <select id="crawlChunkSel" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px">
          <option value="20" ${_crawlState.chunkLimit === 20 ? 'selected' : ''}>20건 (느리게)</option>
          <option value="50" ${_crawlState.chunkLimit === 50 ? 'selected' : ''}>50건 (기본)</option>
          <option value="100" ${_crawlState.chunkLimit === 100 ? 'selected' : ''}>100건 (빠르게)</option>
        </select>
      </div>
      <button id="crawlRunBtn" class="button primary" type="button"
        ${_crawlState.running || scopeCount === 0 ? 'disabled' : ''}
        style="width:100%;padding:14px;font-size:14px;font-weight:700;background:${scopeCount === 0 ? '#9ca3af' : '#4338ca'};color:white;border:none;border-radius:10px;cursor:${scopeCount === 0 ? 'not-allowed' : 'pointer'}">
        ${_crawlState.running
          ? '⏳ 크롤 실행 중...'
          : scopeCount === 0
            ? '✅ 크롤 대기 없음 (모두 처리됨)'
            : `🕷 크롤 실행 (${scopeCount}건 · 무료)`}
      </button>
    </div>

    <!-- 최근 실행 결과 -->
    <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px">
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:700">📊 최근 실행 결과 (이번 세션)</h3>
      ${recentResults.length === 0 ? `
        <div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px;background:var(--surface-2);border-radius:8px">
          아직 실행한 배치가 없습니다. 위 "🕷 크롤 실행" 버튼을 눌러 시작하세요.
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${recentResults.map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:6px;font-size:12px">
              <span style="color:var(--text-tertiary)">${r.ts} · chunk#${r.chunk}</span>
              <span>처리 <b style="color:#3b82f6">${r.processed}</b> · 발견 <b style="color:#15803d">${r.found}</b> · 승격 <b style="color:#15803d">${r.promoted}</b></span>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  // 바인딩
  document.getElementById('crawlChunkSel')?.addEventListener('change', (e) => {
    _crawlState.chunkLimit = parseInt(e.target.value, 10);
    renderCrawlerTool();
  });
  document.getElementById('crawlRunBtn')?.addEventListener('click', () => runCrawlerBatch());
}

async function runCrawlerBatch() {
  if (_crawlState.running) return;
  const scopes = ['verified-no-email'];
  _crawlState.running = true;
  renderCrawlerTool();

  let totalP = 0, totalF = 0, totalPr = 0;
  try {
    for (const scope of scopes) {
      let chunkNum = 0;
      // eslint-disable-next-line no-constant-condition
      while (chunkNum < 40) {
        const res = await fetch('/api/leads/crawl-emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            limit: _crawlState.chunkLimit,
            excludeKorea: true,
            promoteToEmail: true,
            skipAlreadyCrawled: true,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '크롤 실패');
        chunkNum++;
        totalP += data.processed || 0;
        totalF += data.foundCount || 0;
        totalPr += data.promotedCount || 0;
        _crawlState.runResults.push({
          chunk: chunkNum,
          processed: data.processed || 0,
          found: data.foundCount || 0,
          promoted: data.promotedCount || 0,
          ts: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
        });
        // 실시간 렌더링 (스탯 갱신)
        renderCrawlerTool();
        if ((data.processed || 0) === 0) break;
        await new Promise(r => setTimeout(r, 500));
      }
    }
    // 완료 후 leads 재로드
    invalidateServerPage();
    await loadLeads({ force: true });
    _crawlState.running = false;
    renderCrawlerTool();
    alert(
      `✅ 크롤링 배치 완료\n\n` +
      `처리: ${totalP}건\n` +
      `이메일 발견: ${totalF}건\n` +
      `Email 필드 자동 승격: ${totalPr}건\n` +
      `비용: $0 (외부 API 안 씀)`
    );
  } catch (e) {
    _crawlState.running = false;
    renderCrawlerTool();
    alert(`❌ 크롤 실패: ${e.message || 'unknown'}\n\n지금까지 처리: ${totalP}건`);
  }
}

async function renderRecommendedBuyers() {
  els.content.innerHTML = `<div style="padding:32px;text-align:center;color:#6b7280">불러오는 중...</div>`;
  if (!_recommendedCache) {
    try {
      const res = await fetch('/api/recommended-buyers');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'load failed');
      _recommendedCache = data.data;
    } catch (e) {
      els.content.innerHTML = emptyState('추천 리스트를 불러오지 못했습니다: ' + (e?.message || ''));
      return;
    }
  }

  const buyers = _recommendedCache;
  // 지역별 그룹핑
  const byRegion = {};
  for (const b of buyers) {
    byRegion[b.region] = byRegion[b.region] || [];
    byRegion[b.region].push(b);
  }
  const regionOrder = ['Global', 'Europe', 'Middle East', 'North America', 'Asia', 'Oceania', 'Africa', 'Latin America'];
  const regionLabels = {
    Global: '🌐 글로벌 플랫폼',
    Europe: '🇪🇺 유럽',
    'Middle East': '🕌 중동',
    'North America': '🇺🇸 북미',
    Asia: '🌏 아시아',
    Oceania: '🇦🇺 오세아니아',
    Africa: '🌍 아프리카',
    'Latin America': '🇧🇷 중남미',
  };

  const totalCount = buyers.length;
  const importedCount = buyers.filter(b => b.imported).length;
  const availableCount = totalCount - importedCount;

  els.content.innerHTML = `
    <div style="margin-bottom:20px;padding:16px 18px;background:linear-gradient(135deg,#fef9c3 0%,#fef3c7 100%);border:1px solid #facc15;border-radius:12px;font-size:13px;line-height:1.7;color:#854d0e">
      <div style="font-size:15px;font-weight:800;margin-bottom:8px">📋 추천 리스트가 뭔가요?</div>
      <div>
        웹 검색과 산업 매체 (knokglobal · kbeautyproduction · cosmeticindex 등) + 각 회사 공식 사이트 기반으로
        발굴한 <b>글로벌 K-beauty B2B 디스트리뷰터/도매/리테일러 시드 ${totalCount}건</b>입니다 (발굴 시점: 2026-06).
      </div>
      <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;font-size:12px">
        <span style="background:white;padding:4px 10px;border-radius:99px;font-weight:600">① 체크박스로 선택 또는 일괄 추가</span>
        <span style="background:white;padding:4px 10px;border-radius:99px;font-weight:600">② 내 리드로 들어감 → 검증 파이프라인 통과</span>
        <span style="background:white;padding:4px 10px;border-radius:99px;font-weight:600">③ 이메일 컨택 · 협상 등 이미 진행 중인 업체는 카드 우측 "이동" 버튼으로 바로 이동</span>
      </div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <span style="font-size:14px"><strong>${totalCount}</strong>개 시드</span>
      <span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600">✅ 이미 등록 ${importedCount}</span>
      <span style="background:#f1f5f9;color:#475569;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600">⭕ 추가 가능 ${availableCount}</span>
      <div style="flex:1"></div>
      <button id="recImportSelected" class="button" type="button" disabled style="padding:8px 16px;font-size:13px;font-weight:700">선택 항목 추가 (0)</button>
      <button id="recImportAll" class="button secondary" type="button" style="padding:8px 16px;font-size:13px">미등록 ${availableCount}건 일괄 추가</button>
    </div>

    ${regionOrder.filter(r => byRegion[r]).map(region => `
      <section style="margin-bottom:24px">
        <h3 style="margin:0 0 12px;font-size:15px;color:var(--text-primary);font-weight:700;display:flex;align-items:center;gap:8px">
          <span>${regionLabels[region]}</span>
          <span style="background:var(--surface-2);color:var(--text-secondary);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:700">${byRegion[region].length}</span>
        </h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">
          ${byRegion[region].map(b => recommendedCardHtml(b)).join('')}
        </div>
      </section>
    `).join('')}
  `;

  // 카드 체크박스 동기화
  const updateSelectedCount = () => {
    const n = els.content.querySelectorAll('[data-rec-select]:checked').length;
    const btn = document.getElementById('recImportSelected');
    if (btn) {
      btn.textContent = `선택 항목 추가 (${n})`;
      btn.disabled = n === 0;
    }
  };
  els.content.querySelectorAll('[data-rec-select]').forEach(cb => {
    cb.addEventListener('change', updateSelectedCount);
  });

  // 선택 import
  document.getElementById('recImportSelected')?.addEventListener('click', async () => {
    const companies = [...els.content.querySelectorAll('[data-rec-select]:checked')]
      .map(cb => cb.dataset.recSelect);
    if (!companies.length) return;
    await importRecommended(companies);
  });

  // 진행 중 업체 (컨택/응답/협상/파트너) 로 이동
  els.content.querySelectorAll('.rec-jump-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.jumpView;
      const leadId = btn.dataset.jumpLead;
      if (!view) return;
      state.view = view;
      if (leadId) state.selectedId = leadId;
      resetPagination();
      _serverPageCache = null;
      render();
    });
  });

  // 미등록 카드 · stage 선택 → 즉시 리드 추가 + 그 stage 로 이동
  els.content.querySelectorAll('.rec-stage-add').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const stage = e.target.value;
      const company = e.target.dataset.company;
      if (!stage || !company) return;
      const stageLabelMap = { verifying:'검증 대기', verified:'검증 완료', queued:'발송 리스트', contacted:'발송 완료', replied:'응답 옴', negotiating:'협상 중', partner:'파트너' };
      const ok = confirm(`"${company}" 을(를) ${stageLabelMap[stage] || stage} 로 추가하시겠습니까?`);
      if (!ok) {
        e.target.value = '';
        return;
      }
      await importRecommended([company], stage);
    });
  });

  // 전체 미등록 import
  document.getElementById('recImportAll')?.addEventListener('click', async () => {
    const ok = confirm(`미등록 ${availableCount}건을 모두 내 리드로 추가하시겠습니까?`);
    if (!ok) return;
    const companies = buyers.filter(b => !b.imported).map(b => b.company);
    await importRecommended(companies);
  });
}

function recommendedCardHtml(b) {
  const prioColor = b.priority === 'A-' ? '#dc2626' : b.priority === 'B' ? '#f59e0b' : '#64748b';
  // stage 기반 배지 · 이동 페이지 결정
  const stageMap = {
    imported:      { view:'pipeline-import',       label:'📥 가져오기',       bg:'#f1f5f9', fg:'#475569' },
    'ai-searched': { view:'pipeline-ai-searched', label:'🤖 AI 서칭',        bg:'#ede9fe', fg:'#5b21b6' },
    verifying:     { view:'pipeline-verifying',   label:'🔍 검증 대기',      bg:'#fef9c3', fg:'#854d0e' },
    verified:      { view:'pipeline-verified',    label:'✅ AI 검증 완료',      bg:'#dcfce7', fg:'#166534' },
    contacted:     { view:'pipeline-contacted',   label:'📨 이메일 컨택 중', bg:'#dbeafe', fg:'#1e40af' },
    replied:       { view:'pipeline-replied',     label:'💬 응답 옴',        bg:'#e0e7ff', fg:'#3730a3' },
    negotiating:   { view:'pipeline-negotiating', label:'🤝 협상 중',        bg:'#fed7aa', fg:'#9a3412' },
    partner:       { view:'pipeline-partner',     label:'⭐ 파트너',         bg:'#f3e8ff', fg:'#6b21a8' },
    archived:      { view:'pipeline-verified',    label:'📦 보관',           bg:'#f3f4f6', fg:'#6b7280' },
    failed:        { view:'pipeline-verified',    label:'🚫 검증 실패',      bg:'#fee2e2', fg:'#991b1b' },
  };
  const s = b.imported && b.existingStage ? stageMap[b.existingStage] : null;
  const stageBadge = s
    ? `<span style="background:${s.bg};color:${s.fg};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${s.label}</span>`
    : (b.imported ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">✅ 등록완료</span>` : '');

  const jumpBtn = s && ['contacted','replied','negotiating','partner'].includes(b.existingStage)
    ? `<button type="button" class="rec-jump-btn" data-jump-view="${s.view}" data-jump-lead="${escapeAttr(b.existingLeadId || '')}"
        style="padding:6px 12px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 1px 3px rgba(37,99,235,0.3)">
        →  ${s.label.replace(/^[^\s]+\s*/, '')} 로 이동
      </button>`
    : '';

  // 미등록 카드 · stage 선택 드롭다운 (선택 시 즉시 import + stage 설정)
  const addStageSelect = b.imported ? '' : `
    <select class="rec-stage-add" data-company="${escapeAttr(b.company)}"
      style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;font-weight:600;background:#ffffff;color:#0f172a;cursor:pointer;min-width:150px">
      <option value="">➕ 여기로 추가 ▾</option>
      <option value="verifying">🔍 검증 대기</option>
      <option value="verified">✅ 검증 완료 (승인 게이트)</option>
      <option value="contacted">📨 이메일 컨택 (발송함)</option>
      <option value="replied">💬 응답 옴</option>
      <option value="negotiating">🤝 협상 중</option>
      <option value="partner">⭐ 파트너 (완료)</option>
    </select>
  `;

  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;${b.imported && !s ? 'opacity:0.7' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">
            <strong style="font-size:14px;color:#0f172a">${escapeHtml(b.company)}</strong>
            <span style="background:${prioColor};color:#fff;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700">${b.priority}</span>
            ${stageBadge}
          </div>
          <div style="font-size:12px;color:#6b7280">${escapeHtml(b.region)} · ${escapeHtml(b.type)}</div>
        </div>
      </div>
      <div style="font-size:12px;color:#374151;line-height:1.5">${escapeHtml(b.brandsChannels)}</div>
      <div style="font-size:11px;color:#6b7280;line-height:1.5;padding:6px 8px;background:#f9fafb;border-radius:6px;border-left:3px solid #4f8cff">
        <strong>왜 추천:</strong> ${escapeHtml(b.evidence)}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="display:flex;gap:10px;align-items:center">
          <a href="${escapeAttr(b.website)}" target="_blank" rel="noreferrer" style="font-size:12px;color:#4f8cff">🔗 사이트 열기</a>
          <a href="${escapeAttr(b.source)}" target="_blank" rel="noreferrer" style="font-size:11px;color:#9ca3af">출처</a>
        </div>
        ${addStageSelect}
        ${jumpBtn}
      </div>
    </div>
  `;
}

async function importRecommended(companies, stage) {
  startTopProgress();
  const stageLabelMap = { verifying:'검증대기', verified:'검증완료', queued:'발송 리스트', contacted:'발송 완료', replied:'응답 옴', negotiating:'협상 중', partner:'파트너' };
  const stageLabel = stage ? ` (${stageLabelMap[stage] || stage} 로)` : '';
  showGlobalBlocker(`${companies.length}건${stageLabel} 추가 중...`);
  try {
    const res = await fetch('/api/recommended-buyers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies, stage }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'import failed');
    alert(`✅ 추가 완료\n\n신규: ${data.summary.inserted}건\n이미 존재: ${data.summary.skipped}건`);
    _recommendedCache = null;
    // baseLeads 새로고침
    try {
      const r = await fetch('/api/leads');
      const lr = await r.json();
      if (lr.success) baseLeads = lr.data.map(lead => ({ ...lead, id: lead.leadId }));
    } catch {}
    render();
  } catch (e) {
    alert('추가 실패: ' + (e?.message || e));
  } finally {
    hideGlobalBlocker();
    finishTopProgress();
  }
}

// edit 모달 등에서 사용할 상세 패널 HTML
function verifyDetailsHtml(lead) {
  // 즐겨찾기는 대표가 직접 검증한 리드 — 자동 검증 결과보다 우선 신뢰
  if (lead?.favorite === true) {
    const v = lead?.verification;
    const hasAuto = v && v.verifiedAt;
    return `
      <div style="background:#fef9c3;padding:12px 14px;border-radius:8px;border:1px solid #facc15">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:18px">⭐</span>
          <strong style="font-size:14px;color:#854d0e">직접 검증 완료</strong>
        </div>
        <p style="margin:0;font-size:12px;color:#92400e;line-height:1.5">
          즐겨찾기에 등록된 리드입니다. 자동 검증 결과와 무관하게 신뢰 가능한 항목으로 처리됩니다.
          ${hasAuto ? `<br><span style="color:#a16207">(참고: 자동 검증 점수 ${v.score ?? 0}/5)</span>` : ''}
        </p>
      </div>
    `;
  }

  const v = lead?.verification;
  if (!v || !v.verifiedAt) {
    // AI 판정이 있는데 '아직 검증되지 않았습니다'가 뜨면 모순으로 읽힌다 (위에 '규모 적합'가 보이는데).
    // 없는 툴바 버튼을 가리키던 안내도 뺐다.
    if (v && (v.aiVerdict || v.aiVerifiedAt)) return '';
    return `<div style="font-size:13px;color:#9ca3af">⏳ 아직 자동 점검(사이트·메일 형식)을 하지 않았습니다.</div>`;
  }
  const bucket = verifyBucketOf(lead);
  const headerColor = bucket === 'passed' ? '#166534' : bucket === 'suspicious' ? '#92400e' : bucket === 'invalid' ? '#991b1b' : '#64748b';

  const row = (label, ok, detail) => {
    const icon = ok === true ? '✅' : ok === false ? '❌' : '⏳';
    const color = ok === true ? '#166534' : ok === false ? '#991b1b' : '#9ca3af';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px">
        <span style="width:80px;color:#6b7280">${label}</span>
        <span style="color:${color};font-weight:600">${icon}</span>
        <span style="color:#374151">${detail}</span>
      </div>
    `;
  };

  const verifiedAt = new Date(v.verifiedAt).toLocaleString('ko-KR');

  // 사업 관련성 — 통과/실패가 boolean 이 아니라 level 기반이라 별도 처리
  const bizOk = v.businessLevel === 'relevant' ? true
              : v.businessLevel === 'unrelated' || v.businessLevel === 'unclear' ? false
              : null;
  const ev = v.businessEvidence || {};
  // 사이트가 자기소개로 뭐라고 하는지 (가장 강한 증거)
  const evidenceHtml = (ev.title || ev.description || ev.h1)
    ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;padding:6px 8px;background:#f9fafb;border-radius:4px;line-height:1.4">
         ${ev.title ? `<div><strong>제목:</strong> ${escapeHtml(ev.title)}${ev.titleHit ? ` <span style="color:#16a34a">⊕${escapeHtml(ev.titleHit)}</span>` : ''}</div>` : ''}
         ${ev.description ? `<div style="margin-top:2px"><strong>소개:</strong> ${escapeHtml(ev.description.slice(0, 150))}${ev.description.length > 150 ? '…' : ''}${ev.metaHit ? ` <span style="color:#16a34a">⊕${escapeHtml(ev.metaHit)}</span>` : ''}</div>` : ''}
         ${ev.h1 && ev.h1 !== ev.title ? `<div style="margin-top:2px"><strong>대표문구:</strong> ${escapeHtml(ev.h1)}</div>` : ''}
       </div>`
    : '';
  const bizDetail = v.businessLevel
    ? `${businessLevelLabel(v.businessLevel)} (점수 ${v.businessScore ?? 0}/3)` +
      (Array.isArray(v.businessKeywords) && v.businessKeywords.length
        ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">매칭 키워드: ${escapeHtml(v.businessKeywords.slice(0, 8).join(', '))}</div>`
        : '') +
      evidenceHtml
    : (v.businessReason ? reasonKo(v.businessReason) : '미확인');

  return `
    <div style="background:#f8fafc;padding:12px 14px;border-radius:8px;border:1px solid #e5e7eb">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:14px;color:${headerColor}">검증 점수: ${v.score ?? 0}/5</strong>
        <span style="font-size:11px;color:#9ca3af">${verifiedAt} 검증</span>
      </div>
      ${row('이메일',   v.emailValid,    v.emailValid === false ? reasonKo(v.emailReason) : (lead.Email || '값 없음'))}
      ${row('웹사이트', v.websiteAlive,  v.websiteAlive === false ? `연결 실패 ${v.websiteStatus ? `(HTTP ${v.websiteStatus})` : '(응답 없음)'}` : (lead.WebsiteContact ? websiteLinkHtml(lead.WebsiteContact) : '값 없음'))}
      ${row('전화',     v.phoneMatch,    v.phoneMatch === false ? reasonKo(v.phoneReason) : (lead.Phone || '값 없음'))}
      ${row('LinkedIn', v.linkedinValid, v.linkedinValid === false ? reasonKo(v.linkedinReason) : (lead.LinkedInCompany || lead.ContactLinkedIn || '값 없음'))}
      ${row('사업관련성', bizOk, bizDetail)}
      ${v.aiVerifiedAt ? aiVerdictRowHtml(v) : ''}
    </div>
  `;
}

// AI 판단 결과 행 — verifyDetailsHtml 안에서 사용
function aiVerdictRowHtml(v) {
  const verdictMap = {
    'target-fit': { icon: '✅', label: '규모 적합 (타깃)', color: '#166534', bg: '#dcfce7' },
    'maybe':        { icon: '⚠',  label: '모호 / 가능성 있음',  color: '#92400e', bg: '#fef3c7' },
    'not-fit':    { icon: '❌', label: '무관 산업',           color: '#991b1b', bg: '#fee2e2' },
  };
  const m = verdictMap[v.aiVerdict] || { icon: '⏳', label: '미확인', color: '#64748b', bg: '#f1f5f9' };
  const conf = v.aiConfidence ? `<span style="font-size:10px;color:#9ca3af;margin-left:4px">(신뢰도 ${v.aiConfidence})</span>` : '';
  const signals = Array.isArray(v.aiSignals) && v.aiSignals.length
    ? `<div style="font-size:11px;color:#6b7280;margin-top:3px">근거 키워드: ${v.aiSignals.slice(0, 6).map(escapeHtml).join(', ')}</div>`
    : '';
  return `
    <div style="padding:8px 0;border-top:1px dashed #c7d2fe;margin-top:6px">
      <div style="display:flex;align-items:center;gap:8px;font-size:12px">
        <span style="font-size:14px">🧠</span>
        <span style="background:${m.bg};color:${m.color};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${m.icon} ${m.label}</span>
        ${conf}
      </div>
      ${v.aiReasoning ? `<div style="font-size:12px;color:#1e1b4b;margin-top:6px;line-height:1.5;padding:6px 8px;background:#eef2ff;border-radius:6px;border-left:3px solid #6366f1">${escapeHtml(v.aiReasoning)}</div>` : ''}
      ${signals}
    </div>
  `;
}

function getFilteredLeads() {
  const query = state.query.toLowerCase();
  let filtered = getLeads().filter((lead) => {
    const haystack = [
      lead.Region,
      lead.Company,
      lead.Type,
      lead.Evidence,
      lead.BrandsChannels,
      lead.BuyerContact,
      lead.Title,
      lead.Email,
      lead.Phone,
      lead.WebsiteContact,
      lead.Sources,
      lead.notes
    ].join(" ").toLowerCase();

    return (!query || haystack.includes(query))
      && (state.region === "All" || lead.Region === state.region)
      && (state.status === "All" || lead.status === state.status)
      && (state.priority === "All" || lead.Priority === state.priority)
      && verifyBucketMatches(lead, state.verify);
  });
  
  if (state.sortField) {
    filtered.sort((a, b) => {
      const valA = String(a[state.sortField] || '');
      const valB = String(b[state.sortField] || '');
      const cmp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
      return state.sortOrder === 'asc' ? cmp : -cmp;
    });
  } else {
    filtered.sort(leadSort);
  }
  
  return filtered;
}

async function updateLead(id, key, value) {
  // ⚠️ getLeads()(=baseLeads) 만 보면 안 된다.
  // 검증 완료·검증 실패·답장 받음·올린 데이터는 목록이 서버 페이지라 그 배열이
  // 비어 있고, 그러면 여기서 조용히 return 되어 **PUT 이 아예 안 나갔다**.
  // 팝업에서 이메일·메모를 고치고 [저장 및 닫기] 를 눌러도 사라졌다.
  const current = findLeadForPopup(id);
  if (!current) return;
  const payload = { [key]: value };
  if (key === "status" && value === "Contacted" && current?.status !== "Contacted") {
    payload.previousStatus = current?.status || "New";
    payload.lastContact = new Date().toISOString().slice(0, 10);
  }
  if (key === "status" && value !== "Contacted") {
    payload.previousStatus = "";
  }
  Object.assign(current, payload);
  renderFilters();
  renderPipeline();
  renderStats(getFilteredLeads());
  updateActionButtons();
  if (key === "status") {
    render();
  } else if (["Region", "Priority"].includes(key)) {
    // Priority 필터는 화면에서 숨겼다 — 없을 수 있으니 확인하고 쓴다
    if (els.region) els.region.value = state.region;
    if (els.priority) els.priority.value = state.priority;
  }
  if(current._id) {
    await fetch('/api/leads/' + current._id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
}

async function toggleFavorite(id) {
  const lead = findLeadForPopup(id);   // 서버 페이지 화면에서도 찾히게
  if (!lead) return;
  lead.favorite = !Boolean(lead.favorite);
  render();
  if(lead._id) {
    await fetch('/api/leads/' + lead._id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: lead.favorite }) });
  }
}

async function markSelectedContacted() {
  if (!state.selectedId) return;
  updateLead(state.selectedId, "status", "Contacted");
}

async function undoSelectedContacted() {
  if (!state.selectedId) return;
  const lead = findLeadForPopup(state.selectedId);
  if (!lead || lead.status !== "Contacted") return;
  updateLead(state.selectedId, "status", lead.previousStatus || "New");
}

function updateActionButtons() {
  const lead = findLeadForPopup(state.selectedId);
  // 방어: 버튼이 없을 수 있음 (숨김 처리된 legacy 버튼)
  if (els.markContacted) els.markContacted.disabled = !lead || lead.status === "Contacted";
  if (els.undoContacted) els.undoContacted.disabled = !lead || lead.status !== "Contacted";
}

function addLead() {
  // 모달 열기
  const modal = document.getElementById('addLeadModal');
  if (!modal) return;
  // 폼 초기화
  const form = document.getElementById('addLeadForm');
  if (form) form.reset();
  modal.style.display = 'flex';
  delete modal.dataset.userTyped;   // 새로 여는 것이니 "쓰던 내용" 표시를 지운다
  lockBodyScroll();
}

function initAddLeadModal() {}

function initEditModal() {}

// 상세 모달의 입력칸 채우기. 처음 열 때(캐시)와 상세를 받아온 뒤 두 번 불린다.
// id 가 곧 DB 필드명이라 배열만 돌면 된다 (없는 칸은 건너뛴다).
function fillEditModalFields(lead) {
  const fields = ["status", "owner", "lastContact", "nextFollowUp", "notes",
    "Company", "Region", "Priority", "Type", "BuyerContact", "Title",
    "Email", "Phone", "WebsiteContact", "LinkedInCompany", "BrandsChannels",
    "Evidence", "Approach", "Sources"];
  fields.forEach((f) => {
    const el = document.getElementById('el-' + f);
    if (!el) return;
    // 근거·업종은 한국어본이 있으면 그것을 보여준다 (원문은 DB 에 그대로 남아 있다)
    if (f === 'Evidence') el.value = lead.EvidenceKo || lead.Evidence || "";
    else if (f === 'Type') el.value = lead.TypeKo || lead.Type || "";
    else el.value = lead[f] || "";
  });
  // 헤더 요약도 같이 — 상세를 받아오면 업종이 뒤늦게 채워진다
  const meta = document.getElementById('el-meta');
  if (meta) meta.textContent = (lead.Region || "") + " · " + (lead.TypeKo || lead.Type || "Lead");

  // AI 판정 사유 — 이미 한국어로 저장돼 있다. 번역이 필요 없다.
  const box = document.getElementById('el-aiReasonBox');
  if (box) {
    const v = lead.verification || {};
    const reason = String(v.aiReasoning || '').trim();
    if (!reason) { box.style.display = 'none'; box.innerHTML = ''; }
    else {
      const VERDICT = {
        'target-fit': { label: '규모 적합', bg: '#dcfce7', fg: '#166534' },
        'maybe':        { label: '모호 — 사람 판단 필요', bg: '#fef3c7', fg: '#92400e' },
        'not-fit':    { label: '무관', bg: '#fee2e2', fg: '#991b1b' },
      };
      const vd = VERDICT[v.aiVerdict] || { label: v.aiVerdict || '판정 없음', bg: '#f1f5f9', fg: '#475569' };
      box.style.display = '';
      box.innerHTML = `
        <div style="padding:11px 13px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:9px">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
            <span style="font-size:10.5px;font-weight:800;color:#4338ca;letter-spacing:.4px">AI 판정</span>
            <span style="padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;
                         background:${vd.bg};color:${vd.fg}">${escapeHtml(vd.label)}</span>
          </div>
          <div style="font-size:12.5px;line-height:1.65;color:#312e81;white-space:pre-wrap">${escapeHtml(reason)}</div>
        </div>`;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   상세 팝업 검토 바 — 닫지 않고 판정하고 다음 회사로.

   검증 완료 418곳을 검토하려면 지금까지는 [열기 → 보고 → 닫기 → 다음 행 클릭]
   을 418번 반복해야 했다. 그 사이 판정(발송 리스트로 / 검증 실패)은 목록으로
   돌아가서 따로 눌러야 했다. 팝업 안에서 다 끝내고 → 로 넘어가게 한다.
   ═══════════════════════════════════════════════════════════════ */

// 지금 팝업이 훑고 있는 목록 (화면에 보이는 순서 그대로)
var _reviewList = [];

/** leadId → _id (화면에 없는 업체를 서버에서 받아올 때 쓴다) */
var _reviewIdMap = new Map();
/** 이 목록이 어느 화면·조건으로 만들어졌는지 (조건이 그대로면 다시 안 받는다) */
var _reviewKey = '';

/** 팝업을 연 화면의 목록을 검토 순서로 잡아둔다 */
function setReviewList(ids) {
  _reviewList = Array.isArray(ids) ? ids.filter(Boolean) : [];
}

/** 지금 화면이 보고 있는 단계 (검토 목록을 서버에서 받을 때 쓴다) */
function reviewStageOfView() {
  return ({
    'pipeline-verified': 'verified',
    'pipeline-replied': 'replied',
    'pipeline-negotiating': 'negotiating',
    'pipeline-partner': 'partner',
    'pipeline-failed': '__failed',
    'pipeline-archived': 'archived',
  })[state.view] || null;
}

/**
 * 검토 목록을 화면 전체 기준으로 받아온다.
 *
 * 예전에는 DOM 에 그려진 행만 모아서 "3 / 50곳" 처럼 한 페이지 안에서만
 * 넘어갔다. 418곳을 훑으려고 연 팝업인데 50곳에서 막히면 결국 목록으로
 * 돌아가 다음 페이지를 눌러야 한다. 표시용 필드는 빼고 식별자만 받는다.
 */
async function loadReviewList() {
  const stage = reviewStageOfView();
  if (!stage) { setReviewList(collectVisibleLeadIds()); return; }

  const q = (state.query || '').trim();
  const region = state.region && state.region !== 'All' ? state.region : '';
  const sub = stage === 'verified' ? (state.verifiedSubFilter || 'all') : '';
  const key = [stage, q, region, sub, _leadSort].join('::');
  if (key === _reviewKey && _reviewList.length) return;   // 조건 그대로면 재사용

  try {
    const p = new URLSearchParams({ idsOnly: '1', stage });
    if (q) p.set('q', q);
    if (region) p.set('region', region);
    if (sub && sub !== 'all') p.set('sub', sub);
    if (_leadSort === 'reco' || _leadSort === 'region') p.set('sort', _leadSort);
    const r = await safeJsonFetch(`/api/leads?${p}`);
    if (!r?.success) throw new Error(r?.error || '목록 조회 실패');
    _reviewIdMap = new Map((r.ids || []).map((x) => [x.leadId, x._id]));
    setReviewList((r.ids || []).map((x) => x.leadId));
    _reviewKey = key;
  } catch (e) {
    console.warn('review-list', e);
    setReviewList(collectVisibleLeadIds());   // 실패하면 최소한 이 페이지라도
  }
}

/** 지금 화면에서 검토 대상이 되는 행들을 순서대로 (DOM 순서 = 사용자가 보는 순서) */
function collectVisibleLeadIds() {
  const sels = ['tr[data-id]', 'tr.legacy-row[data-lead]', 'tr.outbox-lead-open[data-lead-id]'];
  for (const sel of sels) {
    const rows = [...document.querySelectorAll(sel)];
    if (!rows.length) continue;
    const ids = rows
      .map((r) => r.dataset.id || r.dataset.lead || r.dataset.leadId)
      .filter(Boolean);
    if (ids.length) return ids;
  }
  return [];
}

/** 검토 바(이동·판정)를 지금 리드에 맞게 다시 그린다 */
function refreshReviewBar(lead) {
  const navBox = document.getElementById('el-navBox');
  const judgeBox = document.getElementById('el-judgeBox');
  const pos = document.getElementById('el-navPos');
  const prev = document.getElementById('el-prev');
  const next = document.getElementById('el-next');
  if (!navBox || !judgeBox) return;

  // 목록이 없으면(단건 조회 등) 이동 버튼은 숨긴다
  const idx = _reviewList.indexOf(state.selectedId);
  if (idx < 0 || _reviewList.length < 2) {
    navBox.style.display = 'none';
  } else {
    navBox.style.display = 'flex';
    pos.textContent = `${idx + 1} / ${_reviewList.length}곳`;
    prev.disabled = idx === 0;
    next.disabled = idx === _reviewList.length - 1;
  }

  // 판정 버튼은 "아직 안 보낸 단계" 에서만 의미가 있다.
  // 이미 나갔거나 답장이 온 곳을 앞단계로 돌리면 두 번 보내게 된다.
  const stage = (lead && lead.stage) || '';
  const canJudge = stage === 'verified' || stage === 'queued' || stage === 'archived';
  judgeBox.style.display = canJudge ? 'flex' : 'none';

  const toQueue = document.getElementById('el-toQueue');
  const toFailed = document.getElementById('el-toFailed');
  if (toQueue) {
    // 이미 발송 리스트에 있으면 빼는 버튼으로 바뀐다
    const inQueue = stage === 'queued';
    toQueue.textContent = inQueue ? '↩ 발송 취소' : '✉ 메일 보낼곳으로 선정';
    toQueue.className = 'el-judge ' + (inQueue ? 'el-judge-no' : 'el-judge-go');
    toQueue.title = inQueue
      ? '발송 리스트에서 빼고 검증 완료로 되돌립니다'
      : '이 업체는 메일을 보냅니다 — 발송 리스트로 옮깁니다. 지금 나가지는 않습니다';
    toQueue.disabled = false;
  }
  if (toFailed) { toFailed.disabled = false; toFailed.textContent = '🚫 검증실패 업체로 선정'; }
}

/**
 * 이전/다음 업체로 (팝업을 닫지 않는다).
 *
 * 목록이 화면 전체(418곳)라서 다음 업체가 지금 페이지에 없을 수 있다.
 * 그때는 그 업체만 서버에서 받아 캐시에 넣고 연다.
 */
async function reviewStep(delta) {
  const idx = _reviewList.indexOf(state.selectedId);
  if (idx < 0) return;
  const nextId = _reviewList[idx + delta];
  if (!nextId) return;

  if (findLeadForPopup(nextId)) { openEditModal(nextId); return; }

  // 캐시에 없다 — 이 한 건만 받아온다
  const oid = _reviewIdMap.get(nextId);
  const pos = document.getElementById('el-navPos');
  if (pos) pos.textContent = '불러오는 중';
  if (!oid) { if (pos) pos.textContent = ''; return; }
  try {
    const r = await safeJsonFetch(`/api/leads/${oid}`);
    if (!r?.lead) throw new Error('불러오기 실패');
    const lead = { ...r.lead, id: r.lead.leadId };
    _popupLeadCache = _popupLeadCache.filter((l) => l.id !== lead.id).concat(lead);
    openEditModal(lead.id);
  } catch (e) {
    alert('다음 업체를 불러오지 못했습니다: ' + (e.message || 'unknown'));
    if (pos) pos.textContent = '';
  }
}

/**
 * 판정하고 자동으로 다음 회사로.
 *
 * 판정한 회사는 이 화면 목록에서 빠지므로, 목록에서도 지우고 같은 자리에 있던
 * 다음 회사를 연다. 마지막이었으면 팝업을 닫는다.
 */
async function reviewJudge(action) {
  const id = state.selectedId;
  const lead = findLeadForPopup(id);
  if (!lead) return;

  const btns = [document.getElementById('el-toQueue'), document.getElementById('el-toFailed')];
  btns.forEach((b) => { if (b) b.disabled = true; });

  try {
    if (action === 'queue' || action === 'unqueue') {
      const r = await safeJsonFetch('/api/leads/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [lead.leadId], undo: action === 'unqueue' }),
      });
      if (!r?.success) throw new Error(r?.error || '이동 실패');
      // success 만 보면 0건 이동도 성공으로 읽힌다. 서버는 조건에 안 맞는 건
      // (메일 없음·이미 다른 단계로 넘어감)을 조용히 건너뛰므로, 실제로
      // 옮겨졌는지까지 확인해야 "눌렀는데 그대로"를 눈치챌 수 있다.
      if (r.moved === 0) {
        throw new Error(action === 'unqueue'
          ? '이미 발송 리스트에 없는 업체입니다. 화면을 새로고침해 주세요.'
          : '옮기지 못했습니다. 보낼 메일 주소가 없거나 이미 다른 단계로 넘어간 업체입니다.');
      }
      lead.stage = action === 'unqueue' ? 'verified' : 'queued';
    } else if (action === 'failed') {
      if (!lead._id) throw new Error('이 리드는 여기서 옮길 수 없습니다');
      const r = await safeJsonFetch(`/api/leads/${lead._id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'failed' }),
      });
      if (!r?.success) throw new Error(r?.error || '이동 실패');
      lead.stage = 'failed';
    }

    invalidateServerPage();
    loadStageCounts(true);

    // 리스트에서 빼기(unqueue)는 이 화면에 그대로 남는 판정이라 넘어가지 않는다
    if (action === 'unqueue') { refreshReviewBar(lead); return; }

    // 판정한 회사는 이 목록에서 빠진다 — 같은 자리의 다음 회사로
    const idx = _reviewList.indexOf(id);
    _reviewList = _reviewList.filter((x) => x !== id);
    const nextId = _reviewList[idx] || _reviewList[idx - 1];
    if (nextId) {
      openEditModal(nextId);
    } else {
      // 마지막 회사까지 판정했다 — 닫고 목록으로
      const modal = document.getElementById('editLeadModal');
      if (modal) modal.style.display = 'none';
      syncBodyScrollLock();
      render();
    }
  } catch (e) {
    alert('처리 실패: ' + (e.message || 'unknown'));
    btns.forEach((b) => { if (b) b.disabled = false; });
  }
}

function initReviewBar() {
  document.getElementById('el-prev')?.addEventListener('click', () => reviewStep(-1));
  document.getElementById('el-next')?.addEventListener('click', () => reviewStep(1));
  document.getElementById('el-toQueue')?.addEventListener('click', () => {
    const lead = findLeadForPopup(state.selectedId);
    reviewJudge((lead && lead.stage) === 'queued' ? 'unqueue' : 'queue');
  });
  document.getElementById('el-toFailed')?.addEventListener('click', () => {
    const lead = findLeadForPopup(state.selectedId);
    if (!confirm(`"${(lead && lead.Company) || ''}" 을(를) 검증 실패로 옮깁니다.\n\n이 회사에는 메일을 보내지 않습니다. 진행할까요?`)) return;
    reviewJudge('failed');
  });

  // 화살표 키로도 넘긴다 — 마우스를 옮기지 않고 훑을 수 있게.
  // 입력칸에 있을 때는 커서 이동이 우선이라 가로채지 않는다.
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('editLeadModal');
    if (!modal || modal.style.display === 'none') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); reviewStep(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); reviewStep(1); }
  });
}

function openEditModal(id) {
  // 보관함·기존 데이터에서 연 리드는 baseLeads 에 없다 (곁방 캐시에서 찾는다)
  const lead = findLeadForPopup(id);
  if (!lead) return;
  state.selectedId = id;
  render(); // Update row selection state

  const modal = document.getElementById('editLeadModal');
  if (!modal) return;

  // 목록 API 는 5천 건을 한 번에 내리느라 프로젝션으로 칸을 줄인다.
  // 업종·근거·출처·브랜드는 거기 안 들어 있어서, 캐시만 읽으면 DB 에 값이
  // 있는데도 빈칸으로 보인다 (실제로 그렇게 보이던 버그가 있었다).
  // 모달을 띄운 뒤 이 리드만 따로 받아 빈칸을 채운다.
  if (lead._id) {
    safeJsonFetch(`/api/leads/${lead._id}`)
      .then((r) => {
        if (!r?.lead) return;
        // 열려 있는 리드가 그새 바뀌었으면 덮지 않는다
        if (state.selectedId !== id) return;
        Object.assign(lead, r.lead);       // 캐시도 채워둔다 (두 번째 열 때는 즉시 표시)
        fillEditModalFields(lead);
        refreshReviewBar(lead);            // stage 가 캐시와 다를 수 있다
      })
      .catch((e) => console.warn('lead-detail', e));
  }

  // 검토 순서는 화면 전체 기준으로 잡는다 (한 페이지 50곳이 아니라 418곳 전부).
  // 먼저 보이는 행으로 즉시 그려 두고, 전체 목록은 받아온 뒤 다시 그린다.
  if (!_reviewList.includes(id)) setReviewList(collectVisibleLeadIds());
  refreshReviewBar(lead);
  loadReviewList().then(() => {
    if (state.selectedId === id) refreshReviewBar(findLeadForPopup(id) || lead);
  });

  document.getElementById('el-title').textContent = lead.Company;
  // 우선순위가 없으면 배지를 숨긴다 ('No priority' 영어가 그대로 떴다)
  {
    const badge = document.getElementById('el-badge');
    if (badge) { badge.textContent = lead.Priority ? `우선순위 ${lead.Priority}` : ''; badge.hidden = !lead.Priority; }
  }
  document.getElementById('el-badge').className = "badge " + badgeClass(lead.Priority);
  document.getElementById('el-meta').textContent = (lead.Region || "") + " · " + (lead.Type || "Lead");
  
  fillEditModalFields(lead);

  const webBtn = document.getElementById('el-website');
  if (webBtn) {
    webBtn.style.display = lead.WebsiteContact ? 'inline-block' : 'none';
    webBtn.href = lead.WebsiteContact ? urlFor(lead.WebsiteContact) : '#';
  }
  
  const inBtn = document.getElementById('el-linkedin');
  if (inBtn) {
    inBtn.style.display = lead.LinkedInCompany ? 'inline-block' : 'none';
    inBtn.href = lead.LinkedInCompany ? urlFor(lead.LinkedInCompany) : '#';
  }
  
  const emailBtn = document.getElementById('el-email-btn');
  if (emailBtn) {
    emailBtn.style.display = lead.Email ? 'inline-block' : 'none';
    emailBtn.href = lead.Email ? 'mailto:' + lead.Email : '#';
  }

  const phoneBtn = document.getElementById('el-phone-btn');
  if (phoneBtn) {
    phoneBtn.style.display = lead.Phone ? 'inline-block' : 'none';
    phoneBtn.href = lead.Phone ? 'tel:' + lead.Phone.replace(/[^0-9+]/g, '') : '#';
  }

  // 검증 상세 패널 — 모달 안에 있으면 채워넣고, 없으면 무시
  const verifyPanel = document.getElementById('el-verification');
  if (verifyPanel) verifyPanel.innerHTML = verifyDetailsHtml(lead);

  modal.style.display = 'flex';
  delete modal.dataset.userTyped;   // 새로 여는 것이니 "쓰던 내용" 표시를 지운다
  lockBodyScroll();
}

function initSettingsModal() {
  const btn = document.getElementById('settingsBtn');
  const subIdSection = document.getElementById('subIdSection');
  if (!btn) return;

  fetch('/api/auth/me').then(res => res.json()).then(data => {
    if (data.authenticated) {
      currentUser = data.username;
      isMaster = data.isMaster;
      btn.style.display = 'inline-block'; // 로그인 성공시 버튼 노출
      
      if (isMaster && subIdSection) {
        subIdSection.style.display = 'block';
      }
    }
  }).catch(console.error);
}

/**
 * 👤 CRM 계정 관리 — 로그인한 사람이 자기 비밀번호(와 아이디)를 바꾸는 화면.
 * 사람마다 아이디가 따로 있고(david 대표님 · hoon 전무님 · 초기 비밀번호 yogibo), 각자 여기서 바꾼다.
 * 서버: PUT /api/users/me — 현재 비밀번호 확인 · 바꾸면 로그아웃 → 새 정보로 다시 로그인.
 */
async function renderCrmAccountPage() {
  let me = { username: currentUser, isMaster };
  try {
    const d = await fetch('/api/auth/me').then((r) => r.json());
    if (d && d.authenticated) me = { username: d.username, isMaster: !!d.isMaster };
  } catch { /* 아래에서 알 수 없음으로 표시 */ }
  if (state.view !== 'tool-crm-account') return;

  const field = (id, label, type, placeholder, hint) => `
    <label style="display:block;margin-bottom:12px">
      <span style="display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">${label}</span>
      <input id="${id}" type="${type}" placeholder="${escapeAttr(placeholder || '')}" autocomplete="off"
        style="width:100%;max-width:360px;padding:9px 11px;font-size:14px;border:1px solid var(--border-default);border-radius:8px;
               background:var(--bg-surface);color:var(--text-primary)">
      ${hint ? `<span style="display:block;font-size:11px;color:var(--text-tertiary);margin-top:3px">${hint}</span>` : ''}
    </label>`;

  els.content.innerHTML = `
    <div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-bottom:30px">
      <div style="padding:18px 20px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px">
        <div style="font-size:12px;font-weight:700;color:var(--text-tertiary)">지금 로그인한 아이디</div>
        <div style="font-size:24px;font-weight:800;color:var(--text-primary);margin-top:4px">${escapeHtml(me.username || '(알 수 없음)')}
          ${me.isMaster ? '<span style="font-size:11px;font-weight:800;color:#1e40af;background:#dbeafe;border-radius:5px;padding:2px 7px;margin-left:6px;vertical-align:middle">관리자</span>' : ''}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px;line-height:1.6">
          메일함·보내는 계정은 이 아이디로 [📬 메일 계정 관리]에 등록한 메일만 보입니다.
        </div>
      </div>

      <form id="crmPwForm" style="padding:18px 20px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px">
        <div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:12px">🔒 비밀번호 변경</div>
        ${field('crmCurPw', '현재 비밀번호', 'password', '', '')}
        ${field('crmNewPw', '새 비밀번호', 'password', '6자 이상', '')}
        ${field('crmNewPw2', '새 비밀번호 확인', 'password', '한 번 더 입력', '')}
        <button type="submit" class="button primary" style="padding:9px 18px;font-size:13.5px;font-weight:700">비밀번호 바꾸기</button>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:8px">바꾸면 로그아웃됩니다. 새 비밀번호로 다시 로그인하세요.</div>
      </form>

      ${me.isMaster ? '' : `
      <form id="crmIdForm" style="padding:18px 20px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px">
        <div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:12px">🪪 아이디 변경</div>
        ${field('crmNewId', '새 아이디', 'text', '영문 소문자·숫자 3~20자', '등록해 둔 메일 계정은 새 아이디로 그대로 옮겨집니다.')}
        ${field('crmIdCurPw', '현재 비밀번호', 'password', '', '')}
        <button type="submit" class="button secondary" style="padding:9px 18px;font-size:13.5px;font-weight:700">아이디 바꾸기</button>
      </form>`}
    </div>`;

  const submit = async (payload, okMsg) => {
    const r = await fetch('/api/users/me', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then((x) => x.json()).catch((e) => ({ success: false, error: e.message }));
    if (!r || !r.success) { alert((r && r.error) || '바꾸지 못했습니다'); return; }
    alert(okMsg(r));
    window.location.href = '/login';
  };

  document.getElementById('crmPwForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const cur = document.getElementById('crmCurPw').value;
    const pw = document.getElementById('crmNewPw').value;
    const pw2 = document.getElementById('crmNewPw2').value;
    if (!cur || !pw) { alert('현재 비밀번호와 새 비밀번호를 입력하세요.'); return; }
    if (pw.length < 6) { alert('새 비밀번호는 6자 이상이어야 합니다.'); return; }
    if (pw !== pw2) { alert('새 비밀번호 두 칸이 서로 다릅니다.'); return; }
    submit({ currentPassword: cur, newPassword: pw }, () => '✅ 비밀번호를 바꿨습니다.\n새 비밀번호로 다시 로그인하세요.');
  });
  document.getElementById('crmIdForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('crmNewId').value.trim().toLowerCase();
    const cur = document.getElementById('crmIdCurPw').value;
    if (!id || !cur) { alert('새 아이디와 현재 비밀번호를 입력하세요.'); return; }
    if (!/^[a-z0-9._-]{3,20}$/.test(id)) { alert('아이디는 영문 소문자·숫자·._- 로 3~20자입니다.'); return; }
    submit({ currentPassword: cur, newUsername: id }, (r) => `✅ 아이디를 ${r.username} 으로 바꿨습니다.\n새 아이디로 다시 로그인하세요.`);
  });
}

/**
 * 실제로 **메일 끝에 붙어 나가는 서명** — 서버 lib/template-vars.ts buildSignatureBlock 과 같은 모양이어야 한다.
 *   이름, 직함 / (빈 줄) / 회사 / (빈 줄) / A: 주소 / (빈 줄) / M: 전화 / (빈 줄) / 웹사이트
 *
 * 미리보기와 실제로 나가는 메일이 다르면 미리보기를 믿을 수 없다 — 여백·글자 크기까지 서버와 맞춘다.
 * 서명 정보가 하나도 없으면 빈 문자열(서버도 그때는 아무것도 붙이지 않는다).
 */
function accountSignatureHtml(acc) {
  const t = (k) => String((acc && acc[k]) || '').trim();
  const name = t('fromName'); const title = t('senderTitle');
  const company = t('senderCompany'); const email = t('fromAddress');
  const phone = t('senderPhone'); const address = t('senderAddress'); const website = t('senderWebsite');
  if (!name && !title && !company && !email && !phone && !address && !website) return '';
  const normalizeUrl = (u) => (/^https?:\/\//i.test(u) ? u : `http://${u}`);
  const headline = [name, title].filter(Boolean).join(', ');
  const rows = [];
  if (headline) rows.push(`<span style="font-weight:600">${escapeHtml(headline)}</span>`);
  if (company) rows.push(escapeHtml(company));
  if (address) rows.push(`A: ${escapeHtml(address)}`);
  if (phone) rows.push(`M: ${escapeHtml(phone)}`);
  if (email && !address && !phone && !website) {
    rows.push(`E: <a href="mailto:${escapeAttr(email)}" style="color:#2563eb;text-decoration:none">${escapeHtml(email)}</a>`);
  }
  if (website) rows.push(`<a href="${escapeAttr(normalizeUrl(website))}" style="color:#2563eb;text-decoration:none">${escapeHtml(website)}</a>`);
  return `<div style="margin-top:24px;font-size:13px;line-height:1.5;color:#111827">${rows.map((r) => `<div style="margin:0 0 12px">${r}</div>`).join('')}</div>`;
}

/** 서명 미리보기 — 비어 있으면 무엇을 채워야 하는지 알려 준다 (메일 계정 관리 화면용) */
function signaturePreviewHtml(acc) {
  return accountSignatureHtml(acc)
    || '<span style="font-size:11.5px;color:#94a3b8">이름·직함·회사·주소·전화·웹사이트를 적으면 여기 서명이 보입니다</span>';
}

/**
 * 📥 전체 메일함 2달 가져오기 — /api/mail/backfill 을 done 이 올 때까지 이어 부른다.
 *
 * 새 아이디로 처음 로그인하면 자동으로 돈다(startAutoBackfill). 창을 막지 않고 화면 오른쪽 아래에
 * "메일함 가져오는 중 · 37%" 만 띄운다 — 기다리는 동안 다른 화면을 볼 수 있다 (대표님 요청 2026-09-14).
 * 서버가 계정마다 끝냈다고 기록(backfilledAt)하므로 다음 로그인 때 다시 돌지 않고,
 * 중간에 창을 닫으면 서버에 남긴 위치에서 이어 간다.
 */
var _backfillRunning = false;
async function runMailBackfill(accounts, opts = {}) {
  if (_backfillRunning) { if (!opts.silent) alert('이미 메일함을 가져오는 중입니다. 오른쪽 아래 진행 표시를 확인하세요.'); return; }
  const list = (accounts || []).filter((a) => a && a.id);
  if (!list.length) return;
  _backfillRunning = true;
  let cancel = false;

  document.getElementById('backfillPill')?.remove();
  const pill = document.createElement('div');
  pill.id = 'backfillPill';
  pill.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:11000;width:min(320px,calc(100vw - 36px));'
    + 'background:#fff;border:1px solid #bfdbfe;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.18);padding:11px 13px;font-size:12.5px;color:#0f172a';
  pill.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <span class="backfill-spin" style="display:inline-block;width:14px;height:14px;border:2px solid #bfdbfe;border-top-color:#2563eb;border-radius:50%;animation:bfspin .8s linear infinite"></span>
      <b style="flex:1">📥 메일함 2달치 가져오는 중</b>
      <b id="backfillPct" style="color:#2563eb;font-size:14px">0%</b>
      <button type="button" id="backfillStop" title="그만 가져오기 (다음에 이어서 가져옵니다)"
        style="border:none;background:none;color:#94a3b8;font-size:16px;cursor:pointer;line-height:1;padding:0 2px">×</button>
    </div>
    <div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-top:8px"><div id="backfillBar" style="height:100%;width:0;background:#2563eb;transition:width .4s"></div></div>
    <div id="backfillSub" style="font-size:11px;color:#64748b;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">준비 중…</div>
    <style>@keyframes bfspin{to{transform:rotate(360deg)}}</style>`;
  document.body.appendChild(pill);
  const pctEl = pill.querySelector('#backfillPct');
  const barEl = pill.querySelector('#backfillBar');
  const subEl = pill.querySelector('#backfillSub');
  pill.querySelector('#backfillStop').addEventListener('click', () => { cancel = true; subEl.textContent = '멈추는 중… (다음에 이어서 가져옵니다)'; });

  let shown = 0;
  const setPct = (v) => {
    // 뒤로 가지 않게 — 폴더를 새로 셀 때 총량이 늘어 계산값이 잠깐 줄 수 있다
    shown = Math.max(shown, Math.min(99, Math.round(v)));
    pctEl.textContent = `${shown}%`;
    barEl.style.width = `${shown}%`;
  };

  const totals = { inserted: 0, duplicate: 0, matched: 0, errors: [] };
  try {
    for (let i = 0; i < list.length && !cancel; i++) {
      let cursor = null;
      for (let round = 0; round < 300 && !cancel; round++) {
        let r;
        try {
          r = await safeJsonFetch('/api/mail/backfill', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: list[i].id, days: 60, cursor }),
          });
        } catch (e) {
          totals.errors.push(`[${list[i].label}] ${(e && e.message) || e}`);
          break;
        }
        if (!r || !r.success) { totals.errors.push(`[${list[i].label}] ${(r && r.error) || '실패'}`); break; }
        totals.inserted += r.inserted || 0;
        totals.duplicate += r.duplicate || 0;
        totals.matched += r.matched || 0;
        if (r.errors?.length) totals.errors.push(...r.errors.map((x) => `[${list[i].label}] ${x}`));
        if (r.done) { setPct(((i + 1) / list.length) * 100); break; }
        // 진행률 — 폴더 수 기준에 지금 폴더 안의 진행을 더한다
        const c = r.cursor || {};
        const folders = (c.folders || []).length || 1;
        const curFolder = (c.folders || [])[c.folderIndex];
        const pr = (c.progress || {})[curFolder] || { total: 0, done: 0 };
        const inner = pr.total ? pr.done / pr.total : 0;
        const acctPct = (Math.min(c.folderIndex || 0, folders) + inner) / folders;
        setPct(((i + acctPct) / list.length) * 100);
        subEl.textContent = `${list[i].label} · 새로 ${totals.inserted.toLocaleString()}통${curFolder ? ` · ${curFolder === 'INBOX' ? '받은편지함' : curFolder.replace(/^INBOX[./]/, '')}` : ''}`;
        cursor = r.cursor;
      }
    }
  } finally {
    _backfillRunning = false;
  }

  // 끝 — 진행 표시를 완료 문구로 바꿨다가 잠시 뒤 닫는다
  pill.querySelector('.backfill-spin')?.remove();
  pctEl.textContent = cancel ? '멈춤' : '100%';
  barEl.style.width = cancel ? barEl.style.width : '100%';
  barEl.style.background = totals.errors.length ? '#f59e0b' : '#16a34a';
  pill.querySelector('b').textContent = cancel ? '⏸ 메일 가져오기를 멈췄습니다' : '✅ 메일함 가져오기 완료';
  subEl.textContent = `새로 들어온 메일 ${totals.inserted.toLocaleString()}통${totals.matched ? ` · 업체 연결 ${totals.matched}건` : ''}${totals.errors.length ? ` · 오류 ${totals.errors.length}건` : ''}`;
  if (totals.errors.length) { subEl.title = totals.errors.join('\n'); console.warn('[backfill]', totals.errors); }
  pill.querySelector('#backfillStop').onclick = () => pill.remove();
  setTimeout(() => pill.remove(), totals.errors.length ? 15000 : 6000);

  // 메일함·폴더·배지를 새 메일 기준으로 다시 읽는다 (보고 있는 화면도 새로)
  _mailAccountsCache = null;
  _mailGroupsCache = null;
  _mailCountsCache = null;
  loadMailCounts(true);
  if (/^tool-inbox|^tool-deadlines/.test(state.view || '')) { try { invalidateServerPage?.(); } catch { /* 무시 */ } render(); }
}

/**
 * 새 아이디로 처음 로그인했을 때 — 아직 2달치를 안 가져온 내 메일 계정이 있으면 자동으로 시작한다.
 * 관리자(마스터) 계정은 자동으로 돌리지 않는다: 이미 쓰고 있던 메일함이라, 원할 때 [📥 2달 전체]를 누른다.
 */
async function startAutoBackfill() {
  try {
    const me = await fetch('/api/auth/me').then((r) => r.json());
    if (!me || !me.authenticated || me.isMaster) return;
    const r = await safeJsonFetch('/api/mail/accounts');
    const todo = ((r && r.accounts) || []).filter((a) => a.isActive !== false && !a.backfilledAt);
    if (todo.length) runMailBackfill(todo.map((a) => ({ id: a.accountId, label: a.label || a.address })), { silent: true });
  } catch (e) {
    console.warn('[auto-backfill]', e);
  }
}

async function loadSubIds() {
  const subIdTableBody = document.getElementById('subIdTableBody');
  if (!subIdTableBody) return;
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    if (data.success) {
      subIdTableBody.innerHTML = data.data.map(user => `
        <tr>
          <td><strong>${escapeHtml(user.username)}</strong>${user.username === currentUser ? ' <span class="badge" style="background:#dceee9;color:#0f5146">Me</span>' : ''}</td>
          <td style="text-align: center; color: var(--muted);">${new Date(user.createdAt).toISOString().slice(0, 10)}</td>
          <td style="text-align: center;">
            <button class="button ghost" data-delete-user="${escapeAttr(user.username)}" style="color: #9f3333; padding: 4px 8px; border-color: #9f3333;" ${user.username === currentUser ? 'disabled' : ''}>삭제</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error('Failed to load sub users', e);
  }
}

async function deleteLead(id) {
  const lead = getLeads().find((item) => item.id === id);
  const ok = window.confirm("Delete " + (lead?.Company || "this lead") + " from the CRM view?");
  if (!ok) return;

  lead.deleted = true;
  state.selectedId = getLeads()[0]?.id || null;
  renderFilters();
  render();

  if(lead._id) {
    await fetch('/api/leads/' + lead._id, { method: 'DELETE' });
  }
}

// 검증 실패 (archived + not-fit) 리드 전부 삭제
async function deleteAllFailedLeads() {
  const btn = document.getElementById('deleteAllFailedHeroBtn');
  const restore = (label) => {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  };
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 세는 중...'; }

  // 건수는 반드시 서버에서 센다.
  // 예전에는 브라우저 캐시로 세서, 화면에 안 올라온 건이 숫자에서 빠졌다.
  // "3건 삭제" 로 보고 눌렀는데 실제로는 수백 건이 지워질 수 있었다.
  let count = 0;
  try {
    const r = await safeJsonFetch('/api/leads/purge-failed');
    if (!r?.success) throw new Error(r?.error || '조회 실패');
    count = r.count || 0;
  } catch (e) {
    alert('건수 확인 실패: ' + (e.message || 'unknown'));
    restore('🗑 전부 정리');
    return;
  }

  if (!count) {
    alert('정리할 검증 실패 리드가 없습니다.');
    restore('🗑 전부 정리');
    return;
  }

  // 되돌릴 수 있게 바뀌었지만 수백 건이 한 번에 움직이므로 숫자를 직접 입력받는다.
  // 확인창 한 번은 습관적으로 눌러 넘긴다.
  const typed = prompt(
    `검증 실패 ${count.toLocaleString()}건을 목록에서 치웁니다.\n\n` +
    `· 화면 어디에도 보이지 않게 됩니다\n` +
    `· 완전히 지우는 것은 아니라 나중에 되살릴 수 있습니다\n\n` +
    `진행하려면 아래에 ${count} 를 그대로 입력하세요.`,
  );
  if (typed === null) { restore('🗑 전부 정리'); return; }
  if (String(typed).trim() !== String(count)) {
    alert('입력한 숫자가 달라 취소했습니다.');
    restore('🗑 전부 정리');
    return;
  }

  if (btn) btn.textContent = '⏳ 정리 중...';
  try {
    const r = await safeJsonFetch('/api/leads/purge-failed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmCount: count }),
    });
    if (!r?.success) throw new Error(r?.error || '정리 실패');
    alert(
      `✅ ${r.deleted.toLocaleString()}건을 정리했습니다.\n\n` +
      `완전히 지운 것은 아니라 필요하면 되살릴 수 있습니다.`,
    );
    invalidateServerPage();
    loadStageCounts(true);
    await loadLeads({ force: true });
    state.selectedLeadIds.clear();
    renderFilters();
    render();
  } catch (e) {
    alert('정리 실패: ' + (e.message || 'unknown'));
    restore('🗑 전부 정리');
  }
}

/**
 * 직접 검토 시작 — 첫 업체를 팝업으로 열고 거기서 끝까지 넘긴다.
 *
 * 예전 [빠른 검토] 는 분류 탭(리테일 체인·유통사·브랜드…)으로 나눠 보여주는
 * 별도 화면이었다. 이미 AI 가 400여 곳을 걸러낸 뒤라 분류를 또 고르는 건
 * 단계만 하나 늘리는 일이고, 대기열 기준이 readyForOutreach 여서 418곳 중
 * 9곳만 나오고 있었다. 여기서는 목록 순서 그대로 첫 곳을 열어 준다.
 */
/**
 * 직접 검토 시작 — 한 회사씩 카드로 보는 화면으로 간다.
 *
 * 처음에는 상세 팝업을 띄우고 [이전/다음]으로 넘기게 했는데,
 * 팝업은 편집용이라 입력칸이 가득해 "판단만 하는" 화면으로는 무거웠다.
 * 카드 화면은 볼 것만 크게 놓고 버튼 두 개만 둔다.
 *
 * 표에서 회사를 눌러 여는 상세 팝업의 [이전/다음]은 그대로 둔다 —
 * 한 곳만 확인하러 들어간 경우에는 그쪽이 맞다.
 */
function startDirectReview(source, batch) {
  _review.queue = [];      // 화면의 검색·지역 조건으로 새로 받는다
  _review.idx = 0;
  _review.skip = 0;        // 처음부터 — 지난번에 건너뛴 위치를 물고 들어오지 않게
  _review.decided = new Map();
  _review.source = source || '';   // '' = AI 검증 완료 · 'legacy' = 올린 데이터
  _review.batch = batch || '';     // 올린 파일 하나만 볼 때 그 파일
  // 어디서 들어왔는지 기억한다. [← 돌아가기] 는 시작한 그 자리로 되돌려야지,
  // 정해진 한 화면으로 보내면 "내가 보던 데가 아닌데" 가 된다.
  _review.from = state.view;
  state.view = 'tool-review';
  render();
}

/**
 * 검토를 멈추고 들어왔던 화면으로.
 *
 * 판정은 누를 때마다 이미 서버에 저장돼 있어서, 나간다고 잃는 것이 없다.
 * 그래서 확인을 묻지 않는다 — 되돌릴 수 없는 일이 아니면 묻지 않는 편이 낫다.
 */
function exitDirectReview() {
  const back = _review.from
    || (_review.source === 'legacy' ? 'tool-legacy' : 'pipeline-verified');
  _review.from = '';
  const navBtn = document.querySelector(`.nav-item[data-view="${back}"]`);
  if (navBtn) { navBtn.click(); return; }   // 사이드바 표시도 같이 맞춘다
  state.view = back;
  render();
}

/**
 * 검증 완료에 남아 있는 곳을 전부 발송 리스트로.
 *
 * 흐름상 아닌 곳은 이미 [검증 실패]로 빼놓은 뒤라, 남은 것은 다 보낼 곳이다.
 * 그래도 수백 건이 한 번에 움직이므로 정확한 수를 세어 보여주고 확인을 받는다.
 * 화면에서 검색·지역로 좁혀 놨으면 그 범위만 옮긴다 — 12건을 보면서 눌렀는데
 * 418건이 옮겨지면 무엇이 옮겨졌는지 알 수 없다.
 */
async function moveAllToQueue() {
  const btn = document.getElementById('moveAllToQueueBtn');
  const q = (state.query || '').trim();
  const region = state.region && state.region !== 'All' ? state.region : '';

  if (btn) { btn.disabled = true; btn.textContent = '⏳ 세는 중...'; }
  let info;
  try {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (region) p.set('region', region);
    info = await safeJsonFetch(`/api/leads/queue?${p}`);
    if (!info?.success) throw new Error(info?.error || '조회 실패');
  } catch (e) {
    alert('건수 확인 실패: ' + (e.message || 'unknown'));
    if (btn) { btn.disabled = false; btn.textContent = '⇢ 남은 전체 옮기기'; }
    return;
  }

  if (!info.movable) {
    alert('옮길 수 있는 곳이 없습니다.\n(메일 주소가 있는 곳만 옮겨집니다)');
    if (btn) { btn.disabled = false; btn.textContent = '⇢ 남은 전체 옮기기'; }
    return;
  }

  const scope = q || region
    ? `지금 화면 조건(${[q && `검색 "${q}"`, region && region].filter(Boolean).join(' · ')})에 맞는 `
    : '검증 완료에 남아 있는 ';
  const ok = confirm(
    `${scope}${info.movable.toLocaleString()}곳을 발송 리스트로 옮깁니다.\n\n` +
    (info.noEmail ? `메일 주소가 없는 ${info.noEmail.toLocaleString()}곳은 제외됩니다.\n` : '') +
    `\n옮긴 곳은 [발송 관리 → 보낼 메일]에서 보내거나 예약할 수 있습니다.\n` +
    `메일이 지금 나가지는 않습니다.\n\n진행할까요?`,
  );
  if (!ok) { if (btn) { btn.disabled = false; btn.textContent = '⇢ 남은 전체 옮기기'; } return; }

  if (btn) btn.textContent = '⏳ 옮기는 중...';
  try {
    const r = await safeJsonFetch('/api/leads/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, q: q || undefined, region: region || undefined }),
    });
    if (!r?.success) throw new Error(r?.error || '이동 실패');
    state.selectedLeadIds = new Set();
    invalidateServerPage();
    loadStageCounts(true);
    await loadLeads({ force: true });
    alert(
      `📋 ${r.moved.toLocaleString()}곳을 발송 리스트로 옮겼습니다.\n\n` +
      `발송 리스트 총 ${r.queuedTotal.toLocaleString()}곳\n` +
      `검증 완료에 남은 곳 ${r.verifiedTotal.toLocaleString()}곳`,
    );
    render();
  } catch (e) {
    alert('이동 실패: ' + (e.message || 'unknown'));
    if (btn) { btn.disabled = false; btn.textContent = '⇢ 남은 전체 옮기기'; }
  }
}

/**
 * 고른 곳을 발송 리스트(queued)로 옮긴다 — 검증 완료 화면의 주된 행동.
 *
 * 여기서 옮긴 것만 [발송 관리 → 보낼 메일]에 뜬다. 검증만 끝난 것을 전부
 * 발송 대상으로 잡으면 "이제 보내도 된다"고 정하는 단계가 사라진다.
 */
async function moveSelectedToQueue() {
  const ids = [...state.selectedLeadIds];
  if (!ids.length) return;

  // ⚠️ baseLeads.find 로는 못 찾는다.
  // 검증 완료는 목록이 서버 페이지라 그 배열이 비어 있어서, 고른 곳이
  // 하나도 안 잡혀 sendable=0 → "고른 곳에 보낼 수 있는 메일 주소가 없습니다"
  // 로 끝났다. 주소가 멀쩡한데도 그렇게 떴다.
  const picked = ids.map((id) => findLeadForPopup(id)).filter(Boolean);

  // 메일 없는 곳은 옮겨도 못 보낸다 — 미리 알려주고 숫자에서 뺀다
  const noEmail = picked.filter((l) =>
    !l.Email || /^Not found/i.test(l.Email) || !/@/.test(l.Email)).length;
  const sendable = picked.length - noEmail;
  if (!sendable) {
    alert('고른 곳에 보낼 수 있는 메일 주소가 없습니다.');
    return;
  }
  if (!confirm(
    `${sendable}곳을 발송 리스트로 옮깁니다.\n` +
    (noEmail ? `(메일 주소가 없는 ${noEmail}곳은 제외됩니다)\n` : '') +
    `\n옮긴 곳은 [발송 관리 → 보낼 메일]에서 보내거나 예약할 수 있습니다.\n진행할까요?`,
  )) return;

  const btn = document.getElementById('moveToQueueBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 옮기는 중...'; }
  try {
    const r = await safeJsonFetch('/api/leads/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds: ids }),
    });
    if (!r?.success) throw new Error(r?.error || '이동 실패');
    state.selectedLeadIds = new Set();
    invalidateServerPage();
    // ⚠️ 이 줄이 없으면 옮긴 곳이 [검증 성공] 에 그대로 남아 보인다.
    //
    // 표는 서버 페이지라 invalidateServerPage 로 새로 받지만,
    // [검증 성공 541] 탭과 사이드바 배지는 stage-counts 캐시에서 읽는다.
    // 그쪽을 안 비우면 541 이 그대로 떠서 "옮겼는데 왜 그대로지" 가 된다.
    await loadStageCounts(true);
    await loadLeads({ force: true });
    alert(
      `📋 ${r.moved}곳을 발송 리스트로 옮겼습니다.` +
      (r.skipped ? `\n(${r.skipped}곳은 제외 — 메일 없음 또는 이미 옮겨진 곳)` : '') +
      `\n\n[검증 성공] 목록에서 빠지고 [발송 관리 → 보낼 메일] 로 들어갔습니다.` +
      `\n발송 리스트 총 ${r.queuedTotal}곳`,
    );
    render();
  } catch (e) {
    alert('이동 실패: ' + (e.message || 'unknown'));
    if (btn) { btn.disabled = false; btn.textContent = '📨 발송 관리로 이동'; }
  }
}

async function deleteSelectedLeads() {
  const ids = [...state.selectedLeadIds];
  if (!ids.length) return;

  // ⚠️ getLeads()(=baseLeads) 만 보면 안 된다.
  // 검증 완료·검증 실패·답장 받음 같은 화면은 목록이 서버 페이지라 그 배열이
  // 비어 있었고, 그래서 **확인창까지 띄우고 DELETE 는 한 건도 안 나갔다**.
  // 체크만 풀려서 "지웠는데 왜 남아 있지" 가 됐다.
  const targets = ids.map((id) => findLeadForPopup(id)).filter(Boolean);
  if (!targets.length) {
    alert('고른 업체를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    return;
  }

  const ok = window.confirm(
    `고른 ${targets.length}곳을 목록에서 지웁니다.\n\n` +
    `DB 에서 완전히 지우는 것이 아니라 화면에서만 빠집니다.\n진행할까요?`,
  );
  if (!ok) return;

  const results = await Promise.all(targets.map(async (lead) => {
    if (!lead._id) return false;
    try {
      const r = await fetch('/api/leads/' + lead._id, { method: 'DELETE' });
      if (!r.ok) return false;
      lead.deleted = true;
      return true;
    } catch { return false; }
  }));

  const done = results.filter(Boolean).length;
  const failed = results.length - done;

  state.selectedLeadIds.clear();
  state.selectedId = null;
  // 목록은 서버에서 다시 받아야 지운 행이 사라진다.
  // 이게 없으면 30초 캐시가 그대로 다시 그려져 지운 것이 남아 보인다.
  invalidateServerPage();
  await loadStageCounts(true);
  renderFilters();
  render();

  if (failed) alert(`${done}곳을 지웠습니다. ${failed}곳은 지우지 못했습니다.`);
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (raw.edits || raw.customLeads) return raw;
    return { edits: raw, customLeads: [] };
  } catch {
    return { edits: {}, customLeads: [] };
  }
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ edits, customLeads }));
}

function resetEdits() {
  const ok = window.confirm("All local CRM edits will be cleared. Continue?");
  if (!ok) return;
  edits = {};
  customLeads = [];
  localStorage.removeItem(STORAGE_KEY);
  renderFilters();
  render();
}

/**
 * 지금 보고 있는 화면을 그대로 엑셀로 내려받는다.
 *
 * 예전에는 getFilteredLeads() — 브라우저에 올라온 캐시 전체 — 를 내보냈다.
 * 검증 완료 418건을 보면서 눌렀는데 보관함·검증실패까지 섞인 수천 줄이
 * 나왔고, 칸도 화면과 달라 그대로 쓸 수 없었다.
 * 화면이 서버에서 단계별로 받아오므로, 내보내기도 같은 조건으로 서버에서 받는다.
 */
async function exportCsv() {
  const STAGE_OF_VIEW = {
    'pipeline-verified': 'verified',
    'pipeline-contacted': 'queued',      // 발송 관리는 보낼 메일이 기준
    'pipeline-replied': 'replied',
    'pipeline-negotiating': 'negotiating',
    'pipeline-partner': 'partner',
    'pipeline-failed': '__failed',
    'pipeline-archived': 'archived',
  };
  const stage = STAGE_OF_VIEW[state.view] || null;
  const q = (state.query || '').trim();
  const region = state.region && state.region !== 'All' ? state.region : '';

  let rows = [];
  try {
    const p = new URLSearchParams({ limit: '5000', full: '1' });
    if (stage) p.set('stage', stage);
    if (q) p.set('q', q);
    if (region) p.set('region', region);
    const r = await safeJsonFetch(`/api/leads?${p}`);
    if (!r?.success) throw new Error(r?.error || '조회 실패');
    rows = r.data || [];
  } catch (e) {
    alert('내보내기 실패: ' + (e.message || 'unknown'));
    return;
  }

  if (!rows.length) {
    alert('내보낼 것이 없습니다.');
    return;
  }

  // 화면에서 보는 순서·이름으로 칸을 고정한다.
  // 원본 필드를 통째로 쏟으면 내부용 칸(_id·__v·verification 뭉치)까지 나와
  // 엑셀에서 읽기 어렵다. 영문 헤더는 그대로 둔다 — 거래처에 그대로 보내는 파일이다.
  const COLS = [
    ['Company', (l) => l.Company],
    ['Region', (l) => l.Region],
    ['Type', (l) => l.Type],
    ['업종(한국어)', (l) => l.TypeKo],
    ['Email', (l) => l.Email],
    ['Phone', (l) => l.Phone],
    ['Website', (l) => l.WebsiteContact],
    ['Contact', (l) => l.BuyerContact],
    ['Title', (l) => l.Title],
    ['Evidence', (l) => l.Evidence],
    ['근거(한국어)', (l) => l.EvidenceKo],
    ['단계', (l) => (STAGE_STYLE[l.stage] || {}).label || l.stage || ''],
    ['발송횟수', (l) => (l.emailHistory || []).filter((h) => h && h.status === 'sent').length],
    ['마지막발송', (l) => (l.lastEmailSentAt || '').slice(0, 10)],
    ['답장수', (l) => l.inboundCount || 0],
    ['추천점수', (l) => l.recoScore ?? ''],
    ['exportedAt', () => new Date().toISOString()],
  ];

  const csv = [
    COLS.map((c) => csvCell(c[0])).join(','),
    ...rows.map((l) => COLS.map((c) => csvCell(c[1](l))).join(',')),
  ].join('\n');

  // 엑셀이 UTF-8 을 알아보게 BOM 을 붙인다. 없으면 한글이 깨져서 열린다.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const label = (STAGE_STYLE[stage] || {}).label || (stage || '전체');
  const clean = String(label).replace(/[^가-힣A-Za-z0-9]/g, '') || 'leads';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `yogico-${clean}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);

  alert(`✅ ${rows.length.toLocaleString()}건을 내려받았습니다.\n\n${label}${q ? ` · 검색 "${q}"` : ''}${region ? ` · ${region}` : ''}`);
}

// ── CSV Import Modal ────────────────────────────────────────────────────────

let importParsedLeads = [];

function openImportCsvModal() {
  const modal = document.getElementById('importCsvModal');
  if (!modal) return;
  resetImportModal();
  modal.style.display = 'flex';
  delete modal.dataset.userTyped;   // 새로 여는 것이니 "쓰던 내용" 표시를 지운다
  lockBodyScroll();
  // 예제 양식 다운로드 버튼 바인딩 (매번 재바인딩 — 안전)
  const dlBtn = document.getElementById('downloadSampleCsvBtn');
  if (dlBtn) {
    dlBtn.onclick = downloadSampleCsv;
  }
}

// ── 예제 CSV 양식 다운로드 ─────────────────────────────
// 헤더 정의 순서 = 사용자가 참고할 순서
const SAMPLE_CSV_HEADERS = [
  'Company', 'Region', 'Priority', 'Type',
  'BuyerContact', 'Title', 'Email', 'Phone',
  'WebsiteContact', 'LinkedInCompany', 'BrandsChannels', 'Notes', 'Status',
];
const SAMPLE_CSV_ROWS = [
  // 실제 K-beauty B2B 리드 예시 (실존 회사 X)
  ['Acme Beauty Distributors', 'United States', 'A-', 'Distributor',
   'John Smith', 'Head of Buying', 'partnerships@acmebeauty.com', '+1-555-0100',
   'https://acmebeauty.com', 'https://linkedin.com/company/acme-beauty',
   'Sephora, Ulta, Amazon US', '전화 응대 우수. K-beauty 카테고리 신규 진입 관심.', 'New'],
  ['Kruidvat NL', 'Netherlands', 'B', 'Retailer',
   'Anna van der Berg', 'Category Manager', 'buying@kruidvat.nl', '+31-20-5551234',
   'https://www.kruidvat.nl', '',
   'Beauty of Joseon, COSRX (기존 취급)', '유럽 진출 협의 중. 3월에 카탈로그 발송 예정.', 'Qualified'],
  ['Watsons China', 'China', 'A-', 'Retailer',
   'Benjamin Cheung', 'Senior Trading Manager', 'bd_cn@watsons.com.cn', '+86-21-5555-0100',
   'https://www.watsons.com.cn', 'https://linkedin.com/in/benjamin-cheung',
   'Multiple K-beauty brands', '중국 오프라인 3000+ 매장. 대형 리테일러.', 'Contacted'],
];

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadSampleCsv() {
  const lines = [
    SAMPLE_CSV_HEADERS.map(csvEscape).join(','),
    ...SAMPLE_CSV_ROWS.map(row => row.map(csvEscape).join(',')),
  ];
  // Excel 한글 UTF-8 인식용 BOM
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yogico-crm-예제양식.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetImportModal() {
  importParsedLeads = [];
  const step1 = document.getElementById('importStep1');
  const step2 = document.getElementById('importStep2');
  const progress = document.getElementById('importProgress');
  const result = document.getElementById('importResult');
  const submitBtn = document.getElementById('importSubmitBtn');
  const fileInput = document.getElementById('importFileInput');
  if (step1) step1.style.display = '';
  if (step2) step2.style.display = 'none'; syncBodyScrollLock();
  if (progress) progress.style.display = 'none'; syncBodyScrollLock();
  if (result) result.style.display = 'none'; syncBodyScrollLock();
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '가져오기'; }
  if (fileInput) fileInput.value = '';
  // Reset radio
  const radios = document.querySelectorAll('input[name="duplicateAction"]');
  radios.forEach(r => { if (r.value === 'skip') r.checked = true; });
}

function initImportCsvModal() {}

function handleCsvFile(file) {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  const isXlsx = /\.xlsx?$/i.test(file.name);
  if (!isCsv && !isXlsx) {
    alert(
      '❌ 지원되지 않는 파일 형식\n\n' +
      '· CSV (.csv) 파일만 지원합니다.\n' +
      '· Excel (.xlsx) → "다른 이름으로 저장 → CSV UTF-8" 로 변환 후 업로드하세요.\n\n' +
      '💡 "⬇ 예제 양식 다운로드" 버튼으로 형식 확인 가능.'
    );
    return;
  }
  if (isXlsx) {
    alert(
      '❌ Excel 파일 (.xlsx) 은 직접 업로드 불가\n\n' +
      '변환 방법:\n' +
      '1. Excel 에서 파일 열기\n' +
      '2. 파일 → 다른 이름으로 저장\n' +
      '3. 파일 형식: "CSV UTF-8 (쉼표로 분리) (*.csv)" 선택\n' +
      '4. 저장 후 그 CSV 파일 업로드\n\n' +
      '💡 "⬇ 예제 양식 다운로드" 버튼으로 예시 확인 가능.'
    );
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('❌ 파일 크기가 5MB를 초과합니다.\n\n큰 파일은 나눠서 여러 번 업로드하세요.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    // 헤더 검증 먼저 — 오류 시 명확한 안내
    const validation = validateCsvHeaders(text);
    if (!validation.ok) {
      alert(validation.message);
      return;
    }
    const leads = parseCsv(text);
    if (!leads.length) {
      alert(
        '❌ 파싱된 리드가 0건\n\n' +
        '가능한 원인:\n' +
        '· 헤더만 있고 데이터 행이 없음\n' +
        '· 모든 행에서 Company 값이 비어있음\n\n' +
        '💡 "⬇ 예제 양식 다운로드" 버튼으로 올바른 형식 확인.'
      );
      return;
    }
    importParsedLeads = leads;
    showImportPreview(leads);
  };
  reader.readAsText(file, 'UTF-8');
}

// ── CSV 헤더 검증 ─────────────────────────────────
// 필수 컬럼(Company, Region) 있는지 확인 · 인식 안 된 컬럼 리스트 반환
function validateCsvHeaders(csvText) {
  const firstLine = (csvText.split(/\r?\n/)[0] || '').trim();
  if (!firstLine) {
    return {
      ok: false,
      message: '❌ 빈 파일이거나 헤더 라인이 없습니다.\n\n"⬇ 예제 양식 다운로드"로 예시 참고하세요.',
    };
  }
  const headers = splitCsvLine(firstLine).map(h => h.trim());
  if (headers.length < 2) {
    return {
      ok: false,
      message: '❌ 헤더 컬럼이 부족합니다 (' + headers.length + '개).\n\n' +
        'CSV 첫 줄은 쉼표로 구분된 컬럼명이어야 합니다. 예:\n' +
        'Company,Region,Priority,Email,Phone,...\n\n' +
        '"⬇ 예제 양식 다운로드"로 예시 참고하세요.',
    };
  }

  // 필수 컬럼 검사 (case-insensitive)
  const lowerHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, ''));
  const hasCompany = lowerHeaders.some(h => h === 'company' || h === '회사명' || h === '업체명');
  const hasRegion = lowerHeaders.some(h => h === 'region' || h === '지역');
  const missing = [];
  if (!hasCompany) missing.push('Company (회사명)');
  if (!hasRegion) missing.push('Region (지역)');

  if (missing.length > 0) {
    return {
      ok: false,
      message: '❌ 필수 컬럼 누락\n\n' +
        '없는 컬럼:\n' +
        missing.map(m => '  · ' + m).join('\n') + '\n\n' +
        '파일에 있는 컬럼:\n  ' +
        headers.slice(0, 20).join(', ') +
        (headers.length > 20 ? ` ... (${headers.length}개)` : '') + '\n\n' +
        '💡 "⬇ 예제 양식 다운로드" 버튼으로 올바른 양식 참고하세요.',
    };
  }

  // 인식 안 된 컬럼 — 경고만 (실패 X)
  const knownAliases = new Set([
    'company', 'region', 'priority', 'type',
    'buyercontact', 'buyer contact', 'buyer name', 'contact',
    'email', 'phone', 'website', 'websitecontact',
    'brandschannels', 'brands/channels', 'brands',
    'notes', 'note', 'status', 'title',
    'evidence', 'approach', 'sources',
    'linkedincompany', 'linkedin',
    'owner', 'lastcontact', 'last contact',
    'nextfollowup', 'next follow-up', 'follow-up', 'followup',
    'id', 'leadid',
  ]);
  const unknown = headers.filter(h => !knownAliases.has(h.toLowerCase().trim()));
  if (unknown.length > 0 && unknown.length <= 3) {
    console.warn('[CSV import] 인식 안 된 컬럼 (원본 이름 그대로 저장됨):', unknown);
  }

  return { ok: true };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const leads = [];

  const FIELD_MAP = {
    company: 'Company',
    region: 'Region',
    priority: 'Priority',
    type: 'Type',
    buyercontact: 'BuyerContact',
    'buyer contact': 'BuyerContact',
    'buyer name': 'BuyerContact',
    contact: 'BuyerContact',
    email: 'Email',
    phone: 'Phone',
    website: 'WebsiteContact',
    websitecontact: 'WebsiteContact',
    brandschannels: 'BrandsChannels',
    'brands/channels': 'BrandsChannels',
    brands: 'BrandsChannels',
    notes: 'notes',
    note: 'notes',
    status: 'status',
    title: 'Title',
    evidence: 'Evidence',
    approach: 'Approach',
    sources: 'Sources',
    linkedincompany: 'LinkedInCompany',
    linkedin: 'LinkedInCompany',
    owner: 'owner',
    lastcontact: 'lastContact',
    'last contact': 'lastContact',
    nextfollowup: 'nextFollowUp',
    'next follow-up': 'nextFollowUp',
    'follow-up': 'nextFollowUp',
    followup: 'nextFollowUp',
  };

  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (!values.length) continue;

    const obj = {};
    normalizedHeaders.forEach((header, idx) => {
      const field = FIELD_MAP[header] || headers[idx]; // fallback to original header name
      obj[field] = (values[idx] || '').trim();
    });

    if (!obj.Company && !obj.company) continue; // must have company

    // Defaults
    if (!obj.status) obj.status = 'New';

    // Export/Import 왕복 시 원본 leadId 보존:
    //   CSV의 'id' 컬럼 = 원본 leadId → obj.leadId 로 승격.
    //   이렇게 하면 서버가 leadId 기반으로 정확히 dedup 가능해서,
    //   같은 Company+Region 여러 담당자 케이스가 손실되지 않음.
    if (!obj.leadId && obj.id) obj.leadId = obj.id;
    // leadId 완전히 없으면 클라이언트에서 임시 생성하지 않음 — 서버가 새 lead 로 판단하고 새 leadId 부여함
    if (!obj.id && obj.leadId) obj.id = obj.leadId;

    leads.push(obj);
  }
  return leads;
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function showImportPreview(leads) {
  const step1 = document.getElementById('importStep1');
  const step2 = document.getElementById('importStep2');
  const submitBtn = document.getElementById('importSubmitBtn');

  if (step1) step1.style.display = 'none'; syncBodyScrollLock();
  if (step2) step2.style.display = '';
  if (submitBtn) submitBtn.disabled = false;

  _renderPreviewContents(leads);

  // Re-render summary instantly when radio changes
  document.querySelectorAll('input[name="duplicateAction"]').forEach(radio => {
    radio.addEventListener('change', () => _renderPreviewContents(importParsedLeads));
  });
}

function _isDuplicate(lead) {
  const co = (lead.Company || '').trim().toLowerCase();
  const ct = (lead.Region || '').trim().toLowerCase();
  // 서버 페이지로 받은 것까지 봐야 중복이 잡힌다
  return allKnownLeads().some(b =>
    (b.Company || '').trim().toLowerCase() === co &&
    (b.Region || '').trim().toLowerCase() === ct
  );
}

function _renderPreviewContents(leads, activeTab) {
  // ── 1. Classify ──────────────────────────────────────────────────
  const dupes = leads.filter(l => _isDuplicate(l));
  const newLeads = leads.filter(l => !_isDuplicate(l));
  const dupAction = document.querySelector('input[name="duplicateAction"]:checked')?.value || 'skip';

  // ── 2. Summary badges ─────────────────────────────────────────────
  const previewInfo = document.getElementById('importPreviewInfo');
  if (previewInfo) {
    const dupeLabel = dupAction === 'overwrite'
      ? `<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:12px;font-size:13px;font-weight:600">⚠️ 중복 ${dupes.length}건 → 덮어쓰기</span>`
      : `<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:12px;font-size:13px;font-weight:600">⚠️ 중복 ${dupes.length}건 → 건너뜀</span>`;

    previewInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <span style="font-size:15px;font-weight:700">총 ${leads.length}개</span>
        <span style="background:#d4edda;color:#155724;padding:2px 8px;border-radius:12px;font-size:13px;font-weight:600">✅ 신규 ${newLeads.length}건</span>
        ${dupes.length ? dupeLabel : ''}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;" id="importTabBtns">
        <button class="button ${!activeTab || activeTab === 'all' ? '' : 'ghost'}" data-preview-tab="all" type="button" style="font-size:12px;padding:3px 10px">전체 ${leads.length}</button>
        <button class="button ${activeTab === 'new' ? '' : 'ghost'}" data-preview-tab="new" type="button" style="font-size:12px;padding:3px 10px">신규 ${newLeads.length}</button>
        <button class="button ${activeTab === 'dup' ? '' : 'ghost'}" data-preview-tab="dup" type="button" style="font-size:12px;padding:3px 10px;${dupes.length ? '' : 'opacity:.45;pointer-events:none'}">중복 ${dupes.length}</button>
      </div>
    `;

    document.querySelectorAll('[data-preview-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        _renderPreviewContents(leads, btn.dataset.previewTab);
      });
    });
  }

  // ── 3. Determine rows to show ──────────────────────────────────────
  const tab = activeTab || 'all';
  const displayLeads = tab === 'new' ? newLeads : tab === 'dup' ? dupes : leads;

  // ── 4. Table ───────────────────────────────────────────────────────
  const PREVIEW_COLS = ['Company', 'Region', 'Priority', 'Type', 'Email', 'Phone', 'status'];
  const previewHead = document.getElementById('importPreviewHead');
  const previewBody = document.getElementById('importPreviewBody');

  if (previewHead) {
    previewHead.innerHTML = `
      <tr>
        <th style="width:28px"></th>
        ${PREVIEW_COLS.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
      </tr>`;
  }

  if (previewBody) {
    previewBody.innerHTML = displayLeads.slice(0, 15).map(lead => {
      const isDup = _isDuplicate(lead);
      const rowStyle = isDup ? 'background:#fffbeb;' : '';
      const badge = isDup
        ? `<span title="${dupAction === 'overwrite' ? '덮어쓰기' : '건너뜀'}" style="font-size:11px;background:#ffc107;color:#333;border-radius:8px;padding:1px 5px">${dupAction === 'overwrite' ? '↺' : '↷'}</span>`
        : `<span style="font-size:11px;background:#198754;color:#fff;border-radius:8px;padding:1px 5px">NEW</span>`;
      return `
        <tr style="${rowStyle}">
          <td style="text-align:center">${badge}</td>
          ${PREVIEW_COLS.map(c => `<td>${escapeHtml(lead[c] || '')}</td>`).join('')}
        </tr>`;
    }).join('');

    if (displayLeads.length > 15) {
      previewBody.innerHTML += `
        <tr>
          <td colspan="${PREVIEW_COLS.length + 1}" style="text-align:center;color:var(--muted);font-size:13px;padding:10px">
            … 외 ${displayLeads.length - 15}건 더 있음
          </td>
        </tr>`;
    }

    if (!displayLeads.length) {
      previewBody.innerHTML = `
        <tr>
          <td colspan="${PREVIEW_COLS.length + 1}" style="text-align:center;color:var(--muted);padding:20px">
            해당 항목이 없습니다.
          </td>
        </tr>`;
    }
  }
}


// ── Verification flow ─────────────────────────────────────────────
async function openVerifyModal() {
  const modal = document.getElementById('verifyModal');
  if (!modal) return;

  // 기존 진행/결과 초기화
  const progress = document.getElementById('verifyProgress');
  const result = document.getElementById('verifyResult');
  const startBtn = document.getElementById('verifyStartBtn');
  if (progress) progress.style.display = 'none'; syncBodyScrollLock();
  if (result) result.style.display = 'none'; syncBodyScrollLock();
  if (startBtn) { startBtn.disabled = false; startBtn.textContent = '검증 시작'; }

  // 카운트 표시
  const total = baseLeads.length;
  const done = baseLeads.filter(l => l.verification && l.verification.verifiedAt).length;
  const pending = total - done;
  const totalEl = document.getElementById('verifyTotalCount');
  const pendingEl = document.getElementById('verifyPendingCount');
  const doneEl = document.getElementById('verifyDoneCount');
  if (totalEl) totalEl.textContent = total + '개';
  if (pendingEl) pendingEl.textContent = pending + '개';
  if (doneEl) doneEl.textContent = done + '개';

  // AI 정밀 검증 — 의심 케이스 카운트 + 비용 예상
  const aiTarget = baseLeads.filter(l => {
    const v = l.verification;
    if (!v || !v.verifiedAt) return false;          // 룰 기반 검증 끝난 것만
    if (v.aiVerifiedAt) return false;                 // 아직 AI 검증 안 된 것만
    const s = typeof v.score === 'number' ? v.score : 0;
    return s >= 3 && s <= 4;                          // 의심 (3~4점)
  }).length;
  const aiTargetEl = document.getElementById('verifyAITargetCount');
  const aiCostEl = document.getElementById('verifyAICostEstimate');
  if (aiTargetEl) aiTargetEl.textContent = aiTarget;
  if (aiCostEl) {
    const cost = (aiTarget * 0.0005).toFixed(3);
    aiCostEl.textContent = aiTarget > 0 ? `약 $${cost}` : '0건이라 호출 안 함';
  }
  const aiStartBtn = document.getElementById('verifyAIStartBtn');
  const aiProgress = document.getElementById('verifyAIProgress');
  const aiResult = document.getElementById('verifyAIResult');
  if (aiProgress) aiProgress.style.display = 'none'; syncBodyScrollLock();
  if (aiResult) aiResult.style.display = 'none'; syncBodyScrollLock();
  if (aiStartBtn) {
    aiStartBtn.disabled = aiTarget === 0;
    aiStartBtn.textContent = aiTarget === 0
      ? '🧠 AI 검증 — 대상 없음'
      : `🧠 AI 정밀 검증 시작 (${aiTarget}건)`;
    aiStartBtn.style.opacity = aiTarget === 0 ? '0.5' : '1';
  }

  modal.style.display = 'flex';
  delete modal.dataset.userTyped;   // 새로 여는 것이니 "쓰던 내용" 표시를 지운다
  lockBodyScroll();
}

// AI 정밀 검증 — 의심 케이스만 Claude API 로 청크 호출
async function startAIVerification() {
  const startBtn = document.getElementById('verifyAIStartBtn');
  const progress = document.getElementById('verifyAIProgress');
  const progressBar = document.getElementById('verifyAIProgressBar');
  const progressText = document.getElementById('verifyAIProgressText');
  const result = document.getElementById('verifyAIResult');

  const targetCountEl = document.getElementById('verifyAITargetCount');
  const targetCount = parseInt(targetCountEl?.textContent || '0', 10);
  if (targetCount === 0) return;

  const ok = confirm(
    `🧠 AI 정밀 검증 — Claude API 호출\n\n` +
    `대상: 의심 ${targetCount}건\n` +
    `예상 비용: 약 $${(targetCount * 0.0005).toFixed(3)} (Haiku 4.5)\n` +
    `예상 시간: 약 ${Math.ceil(targetCount / 20 * 8)}초\n\n` +
    `진행하시겠습니까?`,
  );
  if (!ok) return;

  if (progress) progress.style.display = '';
  if (result) result.style.display = 'none'; syncBodyScrollLock();
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = '진행 중...'; }

  const CHUNK = 20;
  let processed = 0;
  const tallies = { 'target-fit': 0, maybe: 0, 'not-fit': 0, failed: 0 };

  try {
    while (true) {
      const res = await fetch('/api/leads/verify-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'suspicious', limit: CHUNK }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'AI 검증 실패');

      processed += data.processed;
      for (const r of (data.results || [])) {
        if (r.verdict === 'target-fit') tallies['target-fit']++;
        else if (r.verdict === 'maybe') tallies.maybe++;
        else if (r.verdict === 'not-fit') tallies['not-fit']++;
        else tallies.failed++;
      }

      const pct = Math.min(100, Math.round(processed / targetCount * 100));
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressText) progressText.textContent = `${processed}/${targetCount} 처리 중... (${pct}%)`;

      if (!data.hasMore || data.processed === 0) break;
    }

    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = `${processed}/${processed} 완료`;
    if (result) {
      result.style.display = '';
      result.innerHTML = `
        <strong style="color:#1e1b4b">🎉 AI 정밀 검증 완료</strong><br>
        ✅ 규모 적합 ${tallies['target-fit']}건  ·
        ⚠ 모호 ${tallies.maybe}건  ·
        ❌ 무관 ${tallies['not-fit']}건
        ${tallies.failed > 0 ? `<br><span style="color:#dc2626">⚠ API 호출 실패 ${tallies.failed}건 — 환경변수/네트워크 확인</span>` : ''}
        <br><span style="color:#64748b;font-size:11px">대략 비용: $${(processed * 0.0005).toFixed(3)}</span>
      `;
    }
    if (startBtn) { startBtn.textContent = '✓ 완료'; }

    // 리드 새로고침
    try {
      const r = await fetch('/api/leads');
      const lr = await r.json();
      if (lr.success) {
        baseLeads = lr.data.map(lead => ({ ...lead, id: lead.leadId }));
        renderFilters();
        render();
      }
    } catch {}
  } catch (e) {
    if (result) {
      result.style.display = '';
      result.style.background = '#fee2e2';
      result.style.borderColor = '#fca5a5';
      result.innerHTML = `<strong style="color:#991b1b">오류:</strong> ${e?.message || '네트워크 오류'}`;
    }
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '다시 시도'; }
  }
}

async function startVerification(scope) {
  const progress = document.getElementById('verifyProgress');
  const progressBar = document.getElementById('verifyProgressBar');
  const progressText = document.getElementById('verifyProgressText');
  const result = document.getElementById('verifyResult');
  const resultText = document.getElementById('verifyResultText');
  const startBtn = document.getElementById('verifyStartBtn');

  if (progress) progress.style.display = '';
  if (result) result.style.display = 'none'; syncBodyScrollLock();
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = '검증 중...'; }

  const onlyUnverified = scope !== 'all';
  const CHUNK = 30;

  // 시작 시점 카운트 — 진행률 계산용
  let totalToProcess = 0;
  let processed = 0;
  const tallies = { ok: 0, partial: 0, fail: 0, emailBad: 0, siteBad: 0, phoneBad: 0, liBad: 0 };

  try {
    while (true) {
      const res = await fetch('/api/leads/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyUnverified, limit: CHUNK }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '검증 실패');

      // 첫 응답에서 전체 작업량 계산
      if (totalToProcess === 0) {
        totalToProcess = data.processed + data.remaining;
      }
      processed += data.processed;

      // 결과 집계
      for (const r of (data.results || [])) {
        const score = r.score ?? 0;
        if (score === 4) tallies.ok++;
        else if (score >= 2) tallies.partial++;
        else tallies.fail++;
        if (r.emailValid === false) tallies.emailBad++;
        if (r.websiteAlive === false) tallies.siteBad++;
        if (r.phoneMatch === false) tallies.phoneBad++;
        if (r.linkedinValid === false) tallies.liBad++;
      }

      const pct = totalToProcess > 0 ? Math.min(100, Math.round(processed / totalToProcess * 100)) : 0;
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressText) progressText.textContent = `${processed}/${totalToProcess} 처리 중... (${pct}%)`;

      if (!data.hasMore) break;
    }

    // 완료 표시
    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = `${processed}/${processed} 완료`;
    if (result) result.style.display = '';
    if (resultText) {
      resultText.innerHTML = `
        <strong style="font-size:15px;color:#1b5e20">🎉 검증 완료</strong><br>
        ✅ 모두 통과 ${tallies.ok}건  ·  ⚠ 일부 의심 ${tallies.partial}건  ·  ❌ 다수 무효 ${tallies.fail}건<br>
        <span style="color:#6b7280;font-size:12px">
          이메일 실패 ${tallies.emailBad}  ·  사이트 실패 ${tallies.siteBad}  ·  전화 불일치 ${tallies.phoneBad}  ·  LinkedIn 실패 ${tallies.liBad}
        </span>
      `;
    }
    if (startBtn) { startBtn.textContent = '검증 완료 ✓'; }

    // 리드 새로고침 (verification 결과 반영)
    try {
      const leadsRes = await fetch('/api/leads');
      const leadsResult = await leadsRes.json();
      if (leadsResult.success) {
        baseLeads = leadsResult.data.map(lead => ({ ...lead, id: lead.leadId }));
        renderFilters();
        render();
      }
    } catch {}
  } catch (err) {
    if (result) { result.style.display = ''; result.style.background = '#fff0f0'; result.style.borderColor = '#f5b8b8'; }
    if (resultText) resultText.textContent = '오류: ' + (err?.message || '네트워크 오류');
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '다시 시도'; }
  }
}

async function doImport(leads, duplicateAction) {
  const progress = document.getElementById('importProgress');
  const progressBar = document.getElementById('importProgressBar');
  const progressText = document.getElementById('importProgressText');
  const result = document.getElementById('importResult');
  const resultText = document.getElementById('importResultText');
  const submitBtn = document.getElementById('importSubmitBtn');
  const step2 = document.getElementById('importStep2');

  if (progress) progress.style.display = '';
  if (step2) step2.style.display = 'none'; syncBodyScrollLock();
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '가져오는 중...'; }

  // 전역 progress bar + 풀스크린 블로커 — 모달 안의 진행바와 별개로 화면 상단에서도 진행 중 표시
  startTopProgress();
  showGlobalBlocker(`${leads.length}건 서버에 전송 중...`);

  // Animate progress bar
  let fakeProgress = 0;
  const progressInterval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 5, 85);
    if (progressBar) progressBar.style.width = fakeProgress + '%';
    if (progressText) progressText.textContent = `${Math.round(fakeProgress)}% 처리 중...`;
  }, 150);

  try {
    const res = await fetch('/api/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads, duplicateAction })
    });
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      clearInterval(progressInterval);
      if (progressBar) progressBar.style.width = '100%';
      if (result) { result.style.display = ''; result.style.background = '#fff0f0'; result.style.borderColor = '#f5b8b8'; }
      const snippet = (rawText || '').slice(0, 200);
      if (resultText) resultText.textContent = `서버 응답 오류 (HTTP ${res.status}): ${snippet || '빈 응답'}`;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '다시 시도'; }
      console.error('Import response not JSON:', rawText);
      return;
    }

    clearInterval(progressInterval);
    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = '완료!';

    if (data.success) {
      const s = data.summary;
      if (result) {
        result.style.display = '';
        result.style.background = '#e8f5e9';
        result.style.borderColor = '#a5d6a7';
      }
      if (resultText) {
        const parts = [];
        if (s.inserted) parts.push(`✅ ${s.inserted}개 새로 추가`);
        if (s.updated) parts.push(`🔄 ${s.updated}개 업데이트`);
        if (s.skipped) parts.push(`⏭ ${s.skipped}개 건너뜀`);
        if (s.errors) parts.push(`❌ ${s.errors}개 오류`);
        const detail = parts.length ? '  ·  ' + parts.join('  |  ') : '';
        // Skip 사유 분해 표시 — 데이터 손실 오해 방지 (Export→Import 왕복 시 원본 leadId 중복은 정상 케이스)
        let skipBreakdown = '';
        if (s.skipped && data.skipReasons) {
          const parts2 = [];
          if (data.skipReasons['leadId-duplicate']) {
            parts2.push(`동일 leadId 재업로드 ${data.skipReasons['leadId-duplicate']}건 (Export→Import 정상 케이스)`);
          }
          if (data.skipReasons['company-region-duplicate']) {
            parts2.push(`Company+Region 중복 ${data.skipReasons['company-region-duplicate']}건`);
          }
          if (parts2.length) {
            skipBreakdown = `<div style="margin-top:6px;font-size:12px;color:#555;background:#fff7e6;padding:6px 10px;border-left:3px solid #f59e0b;border-radius:4px">
              ⏭ 건너뛴 사유: ${parts2.join(' · ')}
            </div>`;
          }
        }
        resultText.innerHTML = `<strong style="font-size:15px;color:#1b5e20">🎉 적용완료</strong>${detail}${skipBreakdown}`;
      }
      if (submitBtn) { submitBtn.textContent = '\uc801\uc6a9\uc644\ub8cc \u2713'; submitBtn.disabled = true; }

      // Show quick link to Import History
      if (result) {
        // 이전 import 결과에서 남은 history 링크 제거 (중복 표시 방지)
        result.querySelectorAll('[data-import-history-link]').forEach(el => el.remove());
        const historyLink = document.createElement('div');
        historyLink.dataset.importHistoryLink = 'true';
        historyLink.style.cssText = 'margin-top:10px;';
        historyLink.innerHTML = `
          <button class="button ghost" id="goToImportHistoryBtn" type="button"
            style="font-size:13px;padding:4px 12px">
            📋 Import History에서 확인 / 롤백하기
          </button>
        `;
        result.appendChild(historyLink);
        document.getElementById('goToImportHistoryBtn')?.addEventListener('click', () => {
          // Close modal and navigate to import history view
          document.getElementById('importCsvModal').style.display = 'none'; syncBodyScrollLock();
          resetImportModal();
          state.view = 'importHistory';
          render();
        });
      }

      // Reload leads from server
      try {
        const leadsRes = await fetch('/api/leads');
        const leadsResult = await leadsRes.json();
        if (leadsResult.success) {
          baseLeads = leadsResult.data.map(lead => ({ ...lead, id: lead.leadId }));
          renderFilters();
        }
      } catch(e) { console.error(e); }


    } else {
      if (result) { result.style.display = ''; result.style.background = '#fff0f0'; result.style.borderColor = '#f5b8b8'; }
      if (resultText) resultText.textContent = '오류: ' + (data.error || '가져오기 실패');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '다시 시도'; }
    }
  } catch (err) {
    clearInterval(progressInterval);
    if (result) { result.style.display = ''; result.style.background = '#fff0f0'; result.style.borderColor = '#f5b8b8'; }
    if (resultText) resultText.textContent = '네트워크 오류가 발생했습니다. 다시 시도해주세요.';
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '다시 시도'; }
  } finally {
    // 성공/실패 어느 쪽이든 전역 로딩 인디케이터 정리
    hideGlobalBlocker();
    finishTopProgress();
  }
}

function makeId(lead, index) {
  const raw = `${lead.Region || ""}-${lead.Company || ""}-${index}`;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inferInitialStatus(lead) {
  const memo = [lead.RoleMemo, lead.Sources, lead.ContactStatus].filter(Boolean).join(" ");
  if (/contacted|daily|sent|follow|reply|460\d{2}|45\d{3}/i.test(memo)) return "Contacted";
  return "New";
}

function leadSort(a, b) {
  const favoriteDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
  if (favoriteDiff) return favoriteDiff;
  const contactedDiff = Number(b.status === "Contacted") - Number(a.status === "Contacted");
  if (contactedDiff) return contactedDiff;
  const dueDiff = Boolean(b.nextFollowUp) - Boolean(a.nextFollowUp);
  if (dueDiff) return dueDiff;
  if (a.nextFollowUp && b.nextFollowUp && a.nextFollowUp !== b.nextFollowUp) {
    return a.nextFollowUp.localeCompare(b.nextFollowUp);
  }
  const scoreDiff = buyerScore(b) - buyerScore(a);
  if (scoreDiff) return scoreDiff;
  return String(a.Company).localeCompare(String(b.Company), undefined, { sensitivity: "base" });
}

function hasEmail(lead) {
  return Boolean(lead.Email && !/not found|\\[email protected\\]/i.test(lead.Email));
}

function buyerScore(lead) {
  let score = 40;
  const text = [lead.Type, lead.Evidence, lead.BrandsChannels, lead.Confidence, lead.Priority].join(" ").toLowerCase();
  if (/distributor|importer|wholesale|b2b|official|authorized/.test(text)) score += 25;
  if (/k-beauty|korean|skincare|cosmetics/.test(text)) score += 15;
  if (hasEmail(lead)) score += 10;
  if (lead.BuyerContact || lead.ContactLinkedIn) score += 10;
  return Math.min(score, 100);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Unknown";
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
}

function continentFor(region) {
  const normalized = String(region || "").trim();
  const matchedRegion = Object.keys(REGION_CONTINENTS).find((item) => item.toLowerCase() === normalized.toLowerCase());
  return REGION_CONTINENTS[matchedRegion] || "Other";
}

function optionHtml(values, selected = "All") {
  // 값은 'All' 그대로 두고(서버·필터 로직이 이 값을 본다) 보이는 글자만 한국어로
  return values.map((value) => `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${value === 'All' ? '전체' : escapeHtml(value)}</option>`).join("");
}

function stat(label, value, view = "") {
  if (view) {
    return `
      <button class="stat stat-button" data-stat-view="${escapeAttr(view)}" type="button">
        <strong>${escapeHtml(String(value))}</strong>
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }
  return `<div class="stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

// 검증 버킷용 stat 카드 — 색상 강조 + 클릭 시 검증 필터 적용
function statVerify(label, value, bucket) {
  const colors = ({
    passed:     { bg: '#dcfce7', fg: '#166534', accent: '#22c55e' },
    suspicious: { bg: '#fef3c7', fg: '#92400e', accent: '#f59e0b' },
    invalid:    { bg: '#fee2e2', fg: '#991b1b', accent: '#ef4444' },
    unverified: { bg: '#f1f5f9', fg: '#64748b', accent: '#94a3b8' },
    archived:   { bg: '#f3f4f6', fg: '#6b7280', accent: '#9ca3af' },
    failed:     { bg: '#fee2e2', fg: '#991b1b', accent: '#ef4444' },
  }[bucket]) || { bg: '#f1f5f9', fg: '#64748b', accent: '#94a3b8' };
  const active = state.view === 'leads' && state.verify === bucket ? `box-shadow:0 0 0 2px ${colors.accent} inset;` : '';
  return `
    <button class="stat stat-button" data-verify-bucket="${escapeAttr(bucket)}" type="button"
      style="background:${colors.bg};color:${colors.fg};border-color:${colors.accent};${active}">
      <strong style="color:${colors.fg}">${escapeHtml(String(value))}</strong>
      <span style="color:${colors.fg};opacity:0.85">${escapeHtml(label)}</span>
    </button>
  `;
}

function emptyState(text) {
  return `<div class="empty-detail"><h3>아직 없습니다</h3><p>${escapeHtml(String(text).replace(/리드가 없습니다/g, '업체가 없습니다'))}</p></div>`;
}

function infoBlock(title, body) {
  return `<div class="field-block"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></div>`;
}

function favoriteButton(lead, compact = false) {
  const active = Boolean(lead.favorite);
  const label = active ? "Favorited" : "Favorite";
  const icon = active ? "&#9733;" : "&#9734;";
  const text = compact ? "" : `<span>${label}</span>`;
  return `
    <button
      class="favorite-button ${active ? "active" : ""} ${compact ? "compact" : ""}"
      data-favorite="${escapeAttr(lead.id)}"
      type="button"
      aria-label="${label} major buyer"
      title="${label} major buyer"
    >
      <span aria-hidden="true">${icon}</span>
      ${text}
    </button>
  `;
}

function linkButton(url, label) {
  if (!url) return "";
  return `<a href="${escapeAttr(urlFor(url))}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function emailButton(email) {
  if (!email) return "";
  const first = email.split(/[;,\s]+/).find((part) => part.includes("@"));
  return first ? `<a href="mailto:${escapeAttr(first)}">Email</a>` : "";
}

/**
 * 메일 주소 칸.
 *
 * 검증 완료 541곳 중 224곳은 주소 대신 조사 메모가 들어 있다 —
 * 'Contact form on site' 59, 'Not found publicly' 46, 'DM via Instagram' 22 …
 * 영어 원문을 그대로 두면 대표님 화면에 영어 문장이 줄줄이 보이고, 메일 칸이라
 * 주소인 줄 안다. 주소가 아니면 한국어 회색 표시로 바꾸고 원문은 툴팁으로만 둔다.
 */
function emailCell(email) {
  if (!email) return '<span style="color:var(--text-quaternary);font-size:12px">메일 주소 없음</span>';
  const text = truncate(email, 78);
  const first = email.split(/[;,\s]+/).find((part) => part.includes("@"));
  if (!first) {
    const e = String(email).toLowerCase();
    const label = /instagram|\binsta/.test(e) ? '인스타 DM 으로만 연락'
      : /facebook|messenger/.test(e) ? '페이스북 메시지로만 연락'
      : /whatsapp/.test(e) ? '왓츠앱으로만 연락'
      : /linkedin/.test(e) ? '링크드인으로만 연락'
      : /form|contact page|website/.test(e) ? '사이트 문의폼만 있음'
      : /phone|tel|call/.test(e) ? '전화로만 연락'
      : '메일 주소 없음';
    return `<span title="${escapeAttr(email)}" style="color:var(--text-quaternary);font-size:12px;cursor:help">${label}</span>`;
  }
  return `<a href="mailto:${escapeAttr(first)}">${escapeHtml(text)}</a>`;
}

function phoneButton(phone) {
  if (!phone) return "";
  const first = phone.split(";")[0].trim();
  return first ? `<a href="${escapeAttr(first.startsWith("http") ? first : `tel:${first.replace(/\s/g, "")}`)}">Call</a>` : "";
}

function urlFor(value) {
  const first = String(value).split(";")[0].trim();
  if (!first) return "";
  if (/^https?:\/\//i.test(first)) return first;
  if (/^www\./i.test(first)) return `https://${first}`;
  return first;
}

// 웹사이트를 클릭 가능한 링크로 (short=true 면 도메인만 표기, full URL 은 title 로)
function websiteLinkHtml(website, opts) {
  const raw = (website || '').toString().trim();
  if (!raw) return '';
  const href = urlFor(raw);
  if (!href) return '';
  const short = opts && opts.short === true;
  let label = raw;
  if (short) {
    try {
      label = new URL(/^https?:\/\//i.test(href) ? href : `https://${href}`).hostname.replace(/^www\./, '');
    } catch (_) {
      label = raw.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer noopener" title="${escapeAttr(raw)}" style="color:#2563eb;text-decoration:underline">${escapeHtml(label)} ↗</a>`;
}

function badgeClass(value = "") {
  const normalized = value.toLowerCase();
  if (normalized === "a" || normalized.includes("high")) return "a";
  if (normalized.includes("yogico")) return "yogico";
  if (normalized.includes("user")) return "user-added";
  return "";
}

function truncate(value = "", max = 90) {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function csvCell(value = "") {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function localeSort(a, b) {
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

/* ═══════════════════════════════════════════════════════════════
   앱 시작 — 반드시 파일 맨 아래에서 부른다.

   왜 여기인가:
   이 파일의 최상위 var 43개(_serverPageCache · _popupLeadCache · _inboxState …)는
   선언만 끌어올려지고 **대입은 그 줄에 닿아야 실행된다.** init() 을 파일 위쪽에서
   부르면 그 시점에 43개가 전부 undefined 다.

   실제로 그래서 두 번 터졌다.
     · _regionFacet.list   → renderFilters 에서 TypeError
     · _popupLeadCache.find → "Cannot read properties of undefined" 로
       첫 화면이 통째로 죽었다.

   한 곳씩 방어 코드를 넣는 것은 끝이 없다. 여기서 부르면 43개가 모두 값을
   가진 뒤 시작하므로 이 종류의 사고가 구조적으로 사라진다.

   새 코드를 파일 끝에 덧붙일 때는 이 호출보다 위에 넣을 것.
   ═══════════════════════════════════════════════════════════════ */
init();
