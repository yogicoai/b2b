/* ═══════════════════════════════════════════════════════════════════
   국내판 전용 화면 — 키워드 발굴 3종
   (크롤링 실행 · 키워드 관리 · 카테고리 현황)

   해외판(vercelData)에는 없던 자리다. 해외 바이어는 명단을 엑셀로 받아 올렸지만
   국내 B2B 는 네이버에서 직접 캐야 한다. 캐는 일(크롤링·키워드)과 캔 것을 보는
   일(현황)을 화면으로 갈랐다.

   app.js 에 이어 붙이지 않고 파일을 나눈 이유:
   app.js 는 이미 16,700줄이다. 국내판에서 새로 만드는 것까지 거기 밀어 넣으면
   "해외판에서 물려받은 코드"와 "국내판에서 쓴 코드"를 나중에 구분할 수 없게 된다.
   둘 다 평범한(non-module) 스크립트라 여기 선언한 함수는 전역에 올라가고,
   app.js 의 render() 가 그대로 부른다.
   ═══════════════════════════════════════════════════════════════════ */

const KR_CATEGORIES = [
  { key: 'public', label: '학교·공공기관·복지시설' },
  { key: 'company', label: '기업' },
  { key: 'medical', label: '병·의원' },
  { key: 'resort', label: '리조트·호텔' },
  { key: 'sports', label: '스포츠시설·단체' },
];

const KR_REGIONS = [
  '서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남',
  '광주', '전북', '전남', '대구', '경북', '부산', '울산', '경남', '제주',
];

const KR_STAGE_LABEL = {
  imported: '가져오기',
  'ai-searched': '수집함(미사용)',
  verifying: '검증 대기',
  verified: '검증 완료',
  queued: '발송 리스트',
  contacted: '발송 완료',
  replied: '답장 받음',
  negotiating: '대화 중',
  partner: '파트너 확정',
  archived: '보관함',
  failed: '검증 실패',
};

/** 해외판 화면들이 쓰는 카드 모양을 그대로 따른다 — 같은 앱으로 보여야 한다 */
function krCard(inner, extra) {
  return '<div style="padding:18px 20px;background:var(--bg-surface);border:1px solid var(--border-default);' +
    'border-radius:14px;' + (extra || '') + '">' + inner + '</div>';
}

function krSectionTitle(text, sub) {
  const title = '<div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:' +
    (sub ? '4px' : '12px') + '">' + text + '</div>';
  if (!sub) return title;
  return title + '<div style="font-size:12px;color:var(--text-tertiary);line-height:1.6;margin-bottom:12px">' + sub + '</div>';
}

function krField(label, hint, inner) {
  return '<label style="display:block;margin-bottom:12px">' +
    '<span style="display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">' +
    label + (hint ? ' <span style="font-weight:400;color:var(--text-tertiary)">· ' + hint + '</span>' : '') +
    '</span>' + inner + '</label>';
}

const KR_INPUT_STYLE =
  'width:100%;padding:9px 11px;font-size:14px;border:1px solid var(--border-default);' +
  'border-radius:8px;background:var(--bg-surface);color:var(--text-primary)';

/* ── 크롤링 실행 ─────────────────────────────────────────────────

   한 번 누르면 발굴 → 이메일 추출 → AI 검증까지 끝나고 [AI 검증 완료] 로 떨어진다.
   중간에 사람이 할 판단이 없어서 단계를 쪼개지 않았다.

   화면에서 신경 쓴 두 가지:
   1. 누르기 전에 **얼마나 걸리고 얼마나 드는지** 보여준다. 15분짜리 일을
      아무 예고 없이 시작시키면 안 된다.
   2. 도는 동안 **업체 이름이 하나씩 쌓이는 게 보인다**. 숫자만 올라가면
      멈춘 것처럼 보이고, 실제로 돌고 있는지 확인할 방법이 없다.
   ───────────────────────────────────────────────────────────── */

var _crawlJobId = null;      // 지금 보고 있는 작업
var _crawlTimer = null;      // 진행률 폴링
var _crawlNavigated = false; // 완료 후 한 번만 데려간다 (폴링마다 튕기면 안 된다)

const KR_FIND_STATE = {
  found:      { icon: '🔎', label: '수집',        color: 'var(--text-secondary)' },
  'no-email': { icon: '✖',  label: '메일 없음',   color: '#9ca3af' },
  verified:   { icon: '✅', label: '적합',        color: '#166534' },
  rejected:   { icon: '🚫', label: '부적합',      color: '#b91c1c' },
};

async function renderCrawlPage() {
  const categoryOptions = KR_CATEGORIES
    .map((c) => '<option value="' + c.key + '">' + escapeHtml(c.label) + '</option>')
    .join('');

  els.content.innerHTML =
    '<div style="max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-bottom:30px">' +
    krCard(
      krSectionTitle('🔎 크롤링 + AI 검증',
        '전국에서 업체를 찾고, 홈페이지에서 메일 주소를 뽑고, 규모가 맞는지 AI가 가립니다. ' +
        '끝나면 <b>AI 검증 완료</b>에 바로 들어갑니다 — 중간에 확인하실 것은 없습니다.') +

      krField('타깃 카테고리', '',
        '<select id="krCrawlCategory" style="' + KR_INPUT_STYLE + ';max-width:360px">' + categoryOptions + '</select>') +

      krField('키워드', '비워 두면 이 카테고리에 등록된 키워드를 모두 씁니다',
        '<input id="krCrawlKeywords" type="text" autocomplete="off" ' +
        'placeholder="비워 두세요 (직접 넣으려면 쉼표로 구분)" style="' + KR_INPUT_STYLE + '">') +

      // 지역은 고르게 하지 않는다 — 전국을 다 도는 것이 기본이고,
      // 선택지를 두면 매번 같은 선택을 반복하게 만들 뿐이다.
      '<div style="font-size:12px;color:var(--text-tertiary);margin:-4px 0 14px">' +
      '📍 지역은 <b>전국 17개 시·도</b> 전체를 돕니다.</div>' +

      '<div id="krCrawlEstimate" style="margin-bottom:14px"></div>' +

      '<button id="krCrawlRun" class="button primary" style="padding:10px 20px;font-size:14px;font-weight:700">' +
      '확인하고 시작</button>' +
      '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:8px;line-height:1.6">' +
      '시작하면 <b>중간에 멈추지 않습니다</b>. 다른 화면을 보다 오셔도 계속 돌고 있고, ' +
      '이 화면으로 돌아오면 진행 상황이 그대로 보입니다.</div>'
    ) +
    '<div id="krCrawlProgress"></div></div>';

  const catSel = document.getElementById('krCrawlCategory');
  const kwInput = document.getElementById('krCrawlKeywords');
  catSel.addEventListener('change', krLoadEstimate);
  kwInput.addEventListener('change', krLoadEstimate);
  document.getElementById('krCrawlRun').addEventListener('click', krStartCrawl);

  krLoadEstimate();
  krResumeRunningJob();
}

/** 실행 전 예상치 — 돈과 시간이 나가는 일이라 누르기 전에 보여준다 */
async function krLoadEstimate() {
  const box = document.getElementById('krCrawlEstimate');
  if (!box) return;
  const category = document.getElementById('krCrawlCategory').value;
  const keywords = document.getElementById('krCrawlKeywords').value.trim();

  box.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">예상치 계산 중...</div>';

  const q = '/api/crawl?estimate=1&category=' + encodeURIComponent(category) +
    (keywords ? '&keywords=' + encodeURIComponent(keywords) : '');
  const e = await safeJsonFetch(q);
  if (!e || !e.success) { box.innerHTML = ''; return; }

  const row = (label, value, hint) =>
    '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0">' +
    '<span style="font-size:12px;color:var(--text-secondary)">' + label + '</span>' +
    '<span style="font-size:13px;font-weight:700;color:var(--text-primary)">' + value +
    (hint ? ' <span style="font-weight:400;font-size:11px;color:var(--text-tertiary)">' + hint + '</span>' : '') +
    '</span></div>';

  box.innerHTML =
    '<div style="padding:13px 15px;background:var(--bg-surface-alt, var(--bg-surface));' +
    'border:1px solid var(--border-default);border-radius:10px">' +
    '<div style="font-size:11.5px;font-weight:800;color:var(--text-secondary);margin-bottom:6px">' +
    '실행하면 이렇게 됩니다' +
    (e.usingDefaults
      ? ' <span style="font-weight:400;color:var(--text-tertiary)">· 등록된 키워드 ' + e.keywords.length + '개 사용</span>'
      : '') +
    '</div>' +
    row('검색', e.queries.toLocaleString() + '회', '키워드 ' + e.keywords.length + '개 × 전국 ' + e.regions + '개') +
    row('발견 예상', '약 ' + e.found.toLocaleString() + '곳') +
    row('메일 확보 예상', '약 ' + e.withEmail.toLocaleString() + '곳', '나머지는 자동 제외') +
    row('AI 검증', '약 ' + e.aiCount.toLocaleString() + '건', '≈ ' + e.costKrw.toLocaleString() + '원') +
    row('걸리는 시간', '약 ' + e.minutes + '분') +
    '<div style="font-size:10.5px;color:var(--text-quaternary);margin-top:7px;line-height:1.5">' +
    escapeHtml(e.basis) + '. 실제 값은 첫 크롤 뒤 정확해집니다.</div>' +
    '</div>';
}

async function krStartCrawl() {
  const category = document.getElementById('krCrawlCategory').value;
  const keywords = document.getElementById('krCrawlKeywords').value
    .split(',').map((s) => s.trim()).filter(Boolean);
  const label = (KR_CATEGORIES.find((c) => c.key === category) || {}).label || category;

  if (!confirm(
    '[' + label + '] 크롤링을 시작합니다.\n\n' +
    '전국 17개 시·도를 돌면서 업체를 찾고, 메일 주소를 뽑고, AI가 규모를 가립니다.\n' +
    '시작하면 중간에 멈추지 않습니다.\n\n진행할까요?'
  )) return;

  const btn = document.getElementById('krCrawlRun');
  if (btn) { btn.disabled = true; btn.textContent = '시작하는 중...'; }

  const res = await safeJsonFetch('/api/crawl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, keywords }),
  });

  if (btn) { btn.disabled = false; btn.textContent = '확인하고 시작'; }

  if (!res || !res.success) {
    alert((res && res.error) || '시작하지 못했습니다.');
    if (res && res.jobId) { _crawlJobId = res.jobId; krPollCrawl(); }
    return;
  }
  _crawlJobId = res.jobId;
  _crawlNavigated = false;
  krPollCrawl();
}

/** 화면을 다시 열었을 때 돌고 있던 작업을 되찾는다 */
async function krResumeRunningJob() {
  const res = await safeJsonFetch('/api/crawl');
  if (!res || !res.success || !res.jobs) return;
  const running = res.jobs.find((j) => j.status === 'running') || res.jobs[0];
  if (!running) return;
  _crawlJobId = running.jobId;
  krPollCrawl();
}

function krStopCrawlPolling() {
  if (_crawlTimer) { clearInterval(_crawlTimer); _crawlTimer = null; }
}

async function krPollCrawl() {
  krStopCrawlPolling();
  const tick = async () => {
    if (state.view !== 'tool-crawl' || !_crawlJobId) { krStopCrawlPolling(); return; }
    const res = await safeJsonFetch('/api/crawl?jobId=' + encodeURIComponent(_crawlJobId));
    if (!res || !res.success) { krStopCrawlPolling(); return; }
    krRenderCrawlProgress(res.job);
    if (res.job.status !== 'running') krStopCrawlPolling();
  };
  await tick();
  _crawlTimer = setInterval(tick, 2000);
}

function krRenderCrawlProgress(job) {
  const box = document.getElementById('krCrawlProgress');
  if (!box) return;

  // 단계마다 "몇 중 몇"이 다르다. 지금 도는 단계의 것을 보여준다.
  let done = 0, total = 0;
  if (job.phase === '업체 찾는 중')      { done = job.queriesDone;  total = job.queriesTotal; }
  else if (job.phase === '이메일 찾는 중') { done = job.homepageDone; total = job.homepageTotal; }
  else if (job.phase === 'AI 검증 중')    { done = job.aiDone;       total = job.aiTotal; }
  const pct = total ? Math.round((done / total) * 100) : (job.status === 'done' ? 100 : 0);

  const running = job.status === 'running';
  const tone = job.status === 'done' ? '#166534' : job.status === 'running' ? '#3FA6D3' : '#b91c1c';

  const stat = (label, n, color) =>
    '<div style="flex:1;min-width:84px">' +
    '<div style="font-size:11px;font-weight:700;color:var(--text-tertiary)">' + label + '</div>' +
    '<div style="font-size:20px;font-weight:800;margin-top:1px;color:' + (color || 'var(--text-primary)') + '">' +
    (n || 0).toLocaleString() + '</div></div>';

  const feed = (job.recentFinds || []).map((f) => {
    const st = KR_FIND_STATE[f.state] || KR_FIND_STATE.found;
    return '<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;' +
      'border-bottom:1px solid var(--border-subtle, var(--border-default))">' +
      '<span style="flex:none;font-size:12px">' + st.icon + '</span>' +
      '<span style="flex:none;font-size:11px;font-weight:700;color:' + st.color + ';min-width:52px">' +
      st.label + '</span>' +
      '<span style="flex:1;font-size:12.5px;color:var(--text-primary);overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.company || '') + '</span>' +
      (f.region ? '<span style="flex:none;font-size:11px;color:var(--text-tertiary)">' + escapeHtml(f.region) + '</span>' : '') +
      (typeof f.score === 'number'
        ? '<span style="flex:none;font-size:11px;font-weight:800;color:' + st.color + '">' + f.score + '점</span>'
        : '') +
      (f.email ? '<span style="flex:none;font-size:10.5px;font-family:monospace;color:var(--text-tertiary);' +
        'max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.email) + '</span>' : '') +
      '</div>';
  }).join('');

  box.innerHTML = krCard(
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px">' +
    '<div style="font-size:14px;font-weight:800;color:' + tone + '">' +
    (running ? '⏳ ' : job.status === 'done' ? '✅ ' : '⚠️ ') + escapeHtml(job.phase || '') +
    '</div>' +
    '<div style="font-size:11.5px;color:var(--text-tertiary)">' +
    escapeHtml((KR_CATEGORIES.find((c) => c.key === job.category) || {}).label || job.category) +
    (job.costKrw ? ' · AI ' + job.costKrw.toLocaleString() + '원 사용' : '') +
    '</div></div>' +

    '<div style="height:8px;background:var(--border-default);border-radius:99px;overflow:hidden">' +
    '<div style="height:100%;width:' + pct + '%;background:' + tone + ';transition:width .4s"></div></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-top:4px">' +
    '<span>' + (total ? done.toLocaleString() + ' / ' + total.toLocaleString() : '') + '</span>' +
    '<span style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
    escapeHtml(job.currentLabel || '') + '</span></div>' +

    '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px">' +
    stat('발견', job.found) +
    stat('메일 확보', job.withEmail) +
    stat('메일 없음', job.noEmail, '#9ca3af') +
    stat('적합', job.verified, '#166534') +
    stat('부적합', job.failed, '#b91c1c') +
    stat('이미 있던 곳', job.duplicate, 'var(--text-tertiary)') +
    '</div>' +

    (feed
      ? '<div style="margin-top:16px">' +
        '<div style="font-size:11.5px;font-weight:800;color:var(--text-secondary);margin-bottom:5px">' +
        '실시간 수집' + (running ? ' · 계속 쌓입니다' : '') + '</div>' +
        '<div style="max-height:320px;overflow-y:auto">' + feed + '</div></div>'
      : '') +

    ((job.problems || []).length
      ? '<details style="margin-top:14px">' +
        '<summary style="font-size:12px;font-weight:700;color:var(--text-secondary);cursor:pointer">' +
        '건너뛴 항목 ' + job.problems.length + '건</summary>' +
        '<div style="font-size:11px;color:var(--text-tertiary);margin-top:5px;line-height:1.7;max-height:160px;overflow:auto">' +
        job.problems.map((e) => escapeHtml(e)).join('<br>') + '</div></details>'
      : '') +

    (job.status === 'done'
      ? '<div style="margin-top:14px;padding:11px 13px;background:#dcfce7;border-radius:8px;font-size:12.5px;color:#166534">' +
        '적합 <b>' + (job.verified || 0).toLocaleString() + '곳</b>이 [✅ AI 검증 완료]에 추가됐습니다. ' +
        '<b>잠시 후 그 화면으로 넘어갑니다.</b>' +
        '<button type="button" id="krGoVerifiedNow" style="margin-left:8px;font-size:11.5px;font-weight:700;' +
        'padding:3px 10px;border-radius:99px;border:1px solid #16653455;background:#16653412;' +
        'color:#166534;cursor:pointer">지금 보기</button></div>'
      : '')
  );

  // 끝났으면 결과가 있는 곳으로 데려간다. 다 돌려놓고 "이제 어디로 가지"를
  // 다시 찾게 하면 안 된다. 넘어갈 때 **이번에 돌린 분류**를 골라 둔 채로 간다 —
  // 방금 리조트를 캤는데 전체 목록이 열리면 새로 들어온 것이 어디 있는지 안 보인다.
  if (job.status === 'done' && !_crawlNavigated) {
    _crawlNavigated = true;
    const go = () => {
      state.categoryFilter = job.category || null;
      document.querySelector('.nav-item[data-view="pipeline-verified"]')?.click();
    };
    document.getElementById('krGoVerifiedNow')?.addEventListener('click', go);
    // 결과 숫자를 읽을 틈은 준다
    setTimeout(() => { if (state.view === 'tool-crawl') go(); }, 4000);
  }
}

/* ── 키워드 관리 ─────────────────────────────────────────────────── */

async function renderKeywordsPage() {
  els.content.innerHTML = krCard('<div style="color:var(--text-tertiary);font-size:13px">불러오는 중...</div>');

  const data = await safeJsonFetch('/api/keywords');
  // 응답을 기다리는 사이 사용자가 다른 화면으로 옮겼으면 덮어쓰지 않는다
  if (state.view !== 'tool-keywords') return;

  if (!data || !data.success) {
    els.content.innerHTML = krCard('<div style="color:#c0392b">키워드를 불러오지 못했습니다.</div>');
    return;
  }

  const chip = (k) => {
    const border = k.seeded ? 'var(--border-default)' : '#3FA6D3';
    const bg = k.active ? 'var(--bg-surface)' : 'var(--bg-subtle, #f5f5f5)';
    const fg = k.active ? 'var(--text-primary)' : 'var(--text-tertiary)';
    const tail = k.seeded
      ? '<span style="font-size:10.5px;color:var(--text-tertiary)" title="코드에 들어 있는 기본 키워드 — 아직 등록 전">기본</span>'
      : '<span style="font-size:10.5px;color:var(--text-tertiary)">' + (k.foundCount || 0) + '건</span>' +
        '<button type="button" data-kw-del="' + escapeAttr(k.id) + '" title="삭제" ' +
        'style="border:none;background:none;color:var(--text-tertiary);cursor:pointer;font-size:13px;line-height:1;padding:0">×</button>';
    return '<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:12.5px;' +
      'font-weight:600;border:1px solid ' + border + ';border-radius:999px;background:' + bg + ';color:' + fg + '">' +
      escapeHtml(k.keyword) + tail + '</span>';
  };

  const section = (c) => krCard(
    krSectionTitle(escapeHtml(c.label), escapeHtml(c.pitch)) +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">' + c.keywords.map(chip).join('') + '</div>' +
    '<div style="display:flex;gap:6px">' +
    '<input type="text" data-kw-input="' + c.key + '" placeholder="키워드 추가 후 Enter" autocomplete="off" ' +
    'style="flex:1;max-width:320px;padding:8px 11px;font-size:13px;border:1px solid var(--border-default);' +
    'border-radius:8px;background:var(--bg-surface);color:var(--text-primary)">' +
    '<button type="button" class="button secondary" data-kw-add="' + c.key + '" ' +
    'style="padding:8px 14px;font-size:13px;font-weight:700">추가</button></div>');

  els.content.innerHTML =
    '<div style="max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-bottom:30px">' +
    krCard('<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">' +
      '수집이 한 바퀴 돌고 나면 같은 키워드로는 <b>새 업체가 더 안 나옵니다</b>. ' +
      '이미 찾은 곳은 자동으로 걸러지기 때문입니다. 수집량을 늘리려면 여기서 키워드를 계속 추가하세요.</div>') +
    data.categories.map(section).join('') +
    '</div>';

  const addKeyword = async (categoryKey) => {
    const input = els.content.querySelector('[data-kw-input="' + categoryKey + '"]');
    const keyword = (input && input.value || '').trim();
    if (!keyword) return;
    await safeJsonFetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: categoryKey, keyword }),
    });
    renderKeywordsPage();
  };

  els.content.querySelectorAll('[data-kw-add]').forEach((btn) => {
    btn.addEventListener('click', () => addKeyword(btn.dataset.kwAdd));
  });
  els.content.querySelectorAll('[data-kw-input]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addKeyword(input.dataset.kwInput);
    });
  });
  els.content.querySelectorAll('[data-kw-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await safeJsonFetch('/api/keywords?id=' + encodeURIComponent(btn.dataset.kwDel), { method: 'DELETE' });
      renderKeywordsPage();
    });
  });
}

/* ── 카테고리 현황 ───────────────────────────────────────────────── */

async function renderCategoriesPage() {
  els.content.innerHTML = krCard('<div style="color:var(--text-tertiary);font-size:13px">집계 중...</div>');

  const data = await safeJsonFetch('/api/categories');
  if (state.view !== 'tool-categories') return;

  if (!data || !data.success) {
    els.content.innerHTML = krCard('<div style="color:#c0392b">집계를 불러오지 못했습니다.</div>');
    return;
  }

  // 11개 단계를 다 세우면 표가 가로로 넘친다. 사람이 실제로 보는 단계만 남긴다.
  const shown = ['ai-searched', 'verifying', 'verified', 'queued', 'contacted', 'replied', 'partner'];

  const head =
    '<tr style="border-bottom:2px solid var(--border-default)">' +
    '<th style="text-align:left;padding:8px 10px;font-weight:800;color:var(--text-secondary);white-space:nowrap">카테고리</th>' +
    shown.map((st) =>
      '<th style="text-align:right;padding:8px 10px;font-weight:700;color:var(--text-tertiary);white-space:nowrap">' +
      (KR_STAGE_LABEL[st] || st) + '</th>').join('') +
    '<th style="text-align:right;padding:8px 10px;font-weight:800;color:var(--text-secondary)">합계</th></tr>';

  const rows = data.categories.map((c) =>
    '<tr style="border-bottom:1px solid var(--border-default)">' +
    '<td style="padding:10px;font-weight:700;color:var(--text-primary);white-space:nowrap">' + escapeHtml(c.label) + '</td>' +
    shown.map((st) => {
      const n = c.byStage[st] || 0;
      return '<td style="text-align:right;padding:10px;color:' +
        (n ? 'var(--text-primary)' : 'var(--text-tertiary)') + '">' + (n || '·') + '</td>';
    }).join('') +
    '<td style="text-align:right;padding:10px;font-weight:800;color:var(--text-primary)">' + c.total + '</td></tr>'
  ).join('');

  const uncategorized = data.uncategorized
    ? '<div style="font-size:12px;color:var(--text-tertiary);margin-top:12px">' +
      '카테고리가 없는 리드 ' + data.uncategorized + '건 — 엑셀로 올렸거나 손으로 넣은 곳입니다.</div>'
    : '';

  els.content.innerHTML =
    '<div style="max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-bottom:30px">' +
    krCard(
      krSectionTitle('📊 카테고리 현황',
        '타깃 5분류가 각각 어디까지 갔는지. 숫자를 보면 어느 쪽에 키워드를 더 부어야 할지 보입니다.') +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' + uncategorized
    ) + '</div>';
}

/* ── 리드 목록 위 카테고리 탭 ─────────────────────────────────────

   국내판의 1차 축은 카테고리다. 해외판은 이 자리에 A/B/C 등급 카드를 뒀지만
   (지금은 꺼져 있다), 국내는 "지금 학교 건을 보고 있나 병원 건을 보고 있나"가
   먼저다 — 보낼 메일 양식이 카테고리마다 다르기 때문이다.

   숫자는 **지금 보고 있는 단계 안에서만** 센다. 전체 건수를 띄우면
   [기업 244]를 눌렀는데 목록에 12건만 나오는 화면이 된다.
   ───────────────────────────────────────────────────────────── */

async function renderCategoryTabs(serverStage) {
  const containerId = 'krCategoryTabs';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    const banner = document.getElementById('stageBannerContainer');
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(container, banner.nextSibling);
    } else if (els.content && els.content.parentNode) {
      els.content.parentNode.insertBefore(container, els.content);
    }
  }

  let data;
  try {
    data = await safeJsonFetch('/api/leads/category-counts?stage=' + encodeURIComponent(serverStage || ''));
  } catch {
    container.innerHTML = '';
    return;
  }
  if (!data || !data.success) { container.innerHTML = ''; return; }

  const cur = state.categoryFilter || null;
  const tab = (key, label, n) => {
    const active = cur === key;
    const dim = n === 0 && !active;
    return '<button type="button" class="kr-cat-tab" data-cat="' + (key || '') + '" ' +
      (dim ? 'disabled ' : '') +
      'style="padding:7px 14px;font-size:13px;font-weight:700;border-radius:999px;cursor:' +
      (dim ? 'default' : 'pointer') + ';transition:all .15s;' +
      'border:1px solid ' + (active ? '#3FA6D3' : 'var(--border-default)') + ';' +
      'background:' + (active ? '#3FA6D3' : 'var(--bg-surface)') + ';' +
      'color:' + (active ? '#fff' : dim ? 'var(--text-tertiary)' : 'var(--text-secondary)') + ';' +
      'opacity:' + (dim ? '.5' : '1') + '">' +
      escapeHtml(label) +
      '<span style="margin-left:6px;font-weight:800;opacity:' + (active ? '.95' : '.7') + '">' +
      n.toLocaleString() + '</span></button>';
  };

  container.innerHTML =
    '<div style="margin-top:10px;padding:10px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:12px">' +
    '<div style="font-size:11px;color:var(--text-secondary);font-weight:700;margin-bottom:8px">' +
    '🏷 타깃 카테고리 — 눌러서 나눠 보기' +
    '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' +
    tab('', '전체', data.total) +
    data.categories.map((c) => tab(c.key, c.label, c.n)).join('') +
    (data.uncategorized ? tab('__none', '미분류', data.uncategorized) : '') +
    '</div></div>';

  container.querySelectorAll('.kr-cat-tab').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.cat || null;
      state.categoryFilter = key || null;
      resetPagination();
      _serverPageCache = null;
      render();
    });
  });
}

function clearCategoryTabs() {
  const c = document.getElementById('krCategoryTabs');
  if (c && c.parentNode) c.parentNode.removeChild(c);
}

/* ── 발송 관리 안의 카테고리 분류 ─────────────────────────────────

   [보낼 메일] · [예약 발송] · [발송 완료] 각각 안에서 다시 카테고리로 나눈다.

   왜 필요한가: 보낼 메일 224곳이 한 덩어리로 보이면 "전체 발송" 말고 할 수 있는
   일이 없다. 그런데 나가는 문구는 카테고리마다 다르므로, 실제로는 리조트 139곳을
   리조트 양식으로 한 번, 스포츠 45곳을 스포츠 양식으로 한 번 보내는 일이 된다.
   화면이 그 단위로 갈라져 있어야 "지금 무엇을 보내는 중인지"가 분명해진다.
   ───────────────────────────────────────────────────────────── */

/**
 * 분류 선택은 화면마다 따로 들지 않는다 — state.categoryFilter 하나만 본다.
 *
 * 예전에는 목록 탭이 state.categoryFilter, 발송 관리가 _outboxCategory 로 갈려 있었다.
 * 그래서 [검증 완료]에서 리조트를 골라 놓고 [발송 관리]로 넘어가면 다시 '전체'가 됐고,
 * 리조트만 보내려던 사람이 224곳 전체를 보게 됐다. 화면을 옮겨도 "지금 무엇을
 * 보고 있는지"는 그대로여야 한다.
 */
Object.defineProperty(window, '_outboxCategory', {
  get() { return state.categoryFilter || null; },
  set(v) { state.categoryFilter = v || null; },
});

/** 리드든 예약이든 카테고리를 꺼낸다 (예약은 리드를 거쳐서 찾는다) */
function krCategoryOf(item, leadLookup) {
  if (!item) return '';
  if (item.category) return item.category;
  if (item.leadId && leadLookup) {
    const l = leadLookup.get(item.leadId);
    if (l && l.category) return l.category;
  }
  return '';
}

/**
 * 지금 탭에 있는 항목들을 카테고리로 센 뒤 칩 줄을 그린다.
 * 숫자가 0인 카테고리는 흐리게 두되 없애지는 않는다 — 자리가 사라지면
 * "원래 없는 분류인가" 와 "이 탭에 없는 것뿐인가" 가 구분되지 않는다.
 */
function krOutboxCategoryBarHtml(items, leadLookup) {
  const counts = {};
  let none = 0;
  for (const it of items) {
    const c = krCategoryOf(it, leadLookup);
    if (!c) { none++; continue; }
    counts[c] = (counts[c] || 0) + 1;
  }

  const chip = (key, label, n) => {
    const on = (_outboxCategory || '') === (key || '');
    const dim = n === 0 && !on;
    return '<button type="button" class="kr-outbox-cat" data-cat="' + (key || '') + '"' +
      (dim ? ' disabled' : '') +
      ' style="padding:6px 13px;font-size:12.5px;font-weight:700;border-radius:999px;' +
      'cursor:' + (dim ? 'default' : 'pointer') + ';transition:all .15s;' +
      'border:1px solid ' + (on ? '#3FA6D3' : 'var(--border-default)') + ';' +
      'background:' + (on ? '#3FA6D3' : 'var(--bg-surface)') + ';' +
      'color:' + (on ? '#fff' : dim ? 'var(--text-tertiary)' : 'var(--text-secondary)') + ';' +
      'opacity:' + (dim ? '.45' : '1') + '">' +
      escapeHtml(label) + '<span style="margin-left:6px;font-weight:800">' + n.toLocaleString() + '</span>' +
      '</button>';
  };

  return '<div style="padding:10px 12px;margin-bottom:12px;background:var(--bg-surface);' +
    'border:1px solid var(--border-default);border-radius:10px">' +
    '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:7px">' +
    '🏷 분류별로 나눠서 보냅니다 — 분류마다 나가는 문구가 다릅니다' +
    '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' +
    chip('', '전체', items.length) +
    KR_CATEGORIES.map((c) => chip(c.key, c.label, counts[c.key] || 0)).join('') +
    (none ? chip('__none', '미분류', none) : '') +
    '</div></div>';
}

/** 칩 클릭 연결 — 다시 그리는 일은 호출자가 넘긴 함수가 한다 */
function krBindOutboxCategoryBar(rerender) {
  document.querySelectorAll('.kr-outbox-cat').forEach((b) => {
    b.addEventListener('click', () => {
      const key = b.dataset.cat || null;
      _outboxCategory = key || null;
      rerender();
    });
  });
}

/** 지금 고른 분류로 거른다 */
function krFilterByCategory(items, leadLookup) {
  if (!_outboxCategory) return items;
  if (_outboxCategory === '__none') return items.filter((i) => !krCategoryOf(i, leadLookup));
  return items.filter((i) => krCategoryOf(i, leadLookup) === _outboxCategory);
}

/** 지금 고른 분류의 이름 (버튼 문구에 쓴다) */
function krCurrentCategoryLabel() {
  if (!_outboxCategory) return '';
  if (_outboxCategory === '__none') return '미분류';
  const c = KR_CATEGORIES.find((x) => x.key === _outboxCategory);
  return c ? c.label : '';
}

/** 목록 행에 붙이는 분류 배지 — 어느 화면에서 보든 같은 색·같은 말로 보여야 한다 */
const KR_CATEGORY_STYLE = {
  public:  { bg: '#e0f2fe', fg: '#075985', short: '학교·공공' },
  company: { bg: '#ede9fe', fg: '#5b21b6', short: '기업' },
  medical: { bg: '#dcfce7', fg: '#166534', short: '병·의원' },
  resort:  { bg: '#fef3c7', fg: '#92400e', short: '리조트·호텔' },
  sports:  { bg: '#ffe4e6', fg: '#9f1239', short: '스포츠' },
};

function krCategoryBadge(category) {
  const st = KR_CATEGORY_STYLE[category];
  if (!st) {
    return '<span style="font-size:11px;color:var(--text-quaternary)">미분류</span>';
  }
  const full = (KR_CATEGORIES.find((c) => c.key === category) || {}).label || st.short;
  return '<span title="' + escapeAttr(full) + '" style="display:inline-block;padding:2px 8px;' +
    'font-size:11px;font-weight:700;border-radius:999px;white-space:nowrap;' +
    'background:' + st.bg + ';color:' + st.fg + '">' + escapeHtml(st.short) + '</span>';
}
