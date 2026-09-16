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
  'ai-searched': '수집함',
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

/* ── 크롤링 실행 ─────────────────────────────────────────────────── */

async function renderCrawlPage() {
  const categoryOptions = KR_CATEGORIES
    .map((c) => '<option value="' + c.key + '">' + escapeHtml(c.label) + '</option>')
    .join('');

  const regionChips = KR_REGIONS.map((r) =>
    '<button type="button" class="kr-region-chip" data-region="' + r + '" ' +
    'style="padding:5px 12px;font-size:12.5px;font-weight:600;border:1px solid var(--border-default);' +
    'border-radius:999px;background:var(--bg-surface);color:var(--text-secondary);cursor:pointer">' + r + '</button>'
  ).join('');

  els.content.innerHTML =
    '<div style="max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-bottom:30px">' +
    krCard(
      krSectionTitle('🔎 크롤링 실행',
        '카테고리와 지역을 고르면 네이버에서 업체를 찾고, 홈페이지에 들어가 이메일을 뽑아옵니다. ' +
        '수집된 곳은 <b>수집함</b>으로 들어가며, 규모가 맞는지는 그다음 단계(AI 검증)에서 가립니다.') +

      krField('타깃 카테고리', '',
        '<select id="krCrawlCategory" style="' + KR_INPUT_STYLE + ';max-width:360px">' + categoryOptions + '</select>') +

      krField('키워드', '비우면 등록된 키워드 전부',
        '<input id="krCrawlKeywords" type="text" autocomplete="off" ' +
        'placeholder="예: 리조트, 호텔 키즈존 (쉼표로 구분)" style="' + KR_INPUT_STYLE + '">') +

      '<div style="margin-bottom:12px">' +
      '<span style="display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">' +
      '지역 <span style="font-weight:400;color:var(--text-tertiary)">· 아무것도 안 고르면 전국</span></span>' +
      '<div id="krRegionChips" style="display:flex;flex-wrap:wrap;gap:6px">' + regionChips + '</div></div>' +

      '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:13px;color:var(--text-secondary)">' +
      '<input id="krCrawlHomepage" type="checkbox" checked> 홈페이지까지 들어가서 이메일 찾기 ' +
      '<span style="color:var(--text-tertiary)">(느립니다 · 업체당 수 초)</span></label>' +

      '<button id="krCrawlRun" class="button primary" style="padding:9px 18px;font-size:13.5px;font-weight:700">크롤링 시작</button>' +
      '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:8px;line-height:1.6">' +
      '이 화면은 <b>맛보기용</b>입니다 — 한 번에 최대 10개 조합(키워드 × 지역)만 돕니다. ' +
      '전국 대량 수집은 터미널에서 <code>npm run crawl:all</code> 로 돌리세요.</div>'
    ) +
    '<div id="krCrawlResult"></div></div>';

  // 고른 지역 — 칩을 눌러 켜고 끈다
  const picked = new Set();
  els.content.querySelectorAll('.kr-region-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.region;
      const on = picked.has(r);
      if (on) picked.delete(r); else picked.add(r);
      btn.style.background = on ? 'var(--bg-surface)' : '#3FA6D3';
      btn.style.color = on ? 'var(--text-secondary)' : '#fff';
      btn.style.borderColor = on ? 'var(--border-default)' : '#3FA6D3';
    });
  });

  const runBtn = document.getElementById('krCrawlRun');
  if (runBtn) runBtn.addEventListener('click', () => krRunCrawl(picked));
}

async function krRunCrawl(pickedRegions) {
  const category = document.getElementById('krCrawlCategory').value;
  const keywords = document.getElementById('krCrawlKeywords').value
    .split(',').map((s) => s.trim()).filter(Boolean);
  const withHomepage = document.getElementById('krCrawlHomepage').checked;
  const box = document.getElementById('krCrawlResult');

  showGlobalBlocker('네이버에서 업체를 찾는 중... (홈페이지까지 보면 몇 분 걸립니다)');
  try {
    const res = await safeJsonFetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        keywords,
        regions: Array.from(pickedRegions),
        withHomepage,
        maxQueries: 10,
      }),
    });

    if (!res || !res.success) {
      box.innerHTML = krCard(
        '<div style="color:#c0392b;font-size:13.5px;font-weight:700">크롤링 실패</div>' +
        '<div style="font-size:12.5px;color:var(--text-secondary);margin-top:6px">' +
        escapeHtml((res && res.error) || '알 수 없는 오류') + '</div>');
      return;
    }

    const stat = (label, n, hint) =>
      '<div style="flex:1;min-width:92px">' +
      '<div style="font-size:11px;font-weight:700;color:var(--text-tertiary)">' + label + '</div>' +
      '<div style="font-size:22px;font-weight:800;color:var(--text-primary);margin-top:2px">' + n + '</div>' +
      (hint ? '<div style="font-size:11px;color:var(--text-tertiary)">' + hint + '</div>' : '') +
      '</div>';

    const errorBlock = (res.errors && res.errors.length)
      ? '<details style="margin-top:14px">' +
        '<summary style="font-size:12.5px;font-weight:700;color:var(--text-secondary);cursor:pointer">' +
        '건너뛴 항목 ' + res.errors.length + '건</summary>' +
        '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px;line-height:1.7;max-height:200px;overflow:auto">' +
        res.errors.map((e) => escapeHtml(e)).join('<br>') + '</div></details>'
      : '';

    box.innerHTML = krCard(
      krSectionTitle('수집 결과') +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      stat('검색 조합', res.queries) +
      stat('찾은 곳', res.found) +
      stat('신규 등록', res.inserted, '수집함으로 들어감') +
      stat('이미 있던 곳', res.duplicate) +
      stat('이메일 확보', res.withEmail) +
      '</div>' + errorBlock +
      '<div style="font-size:12px;color:var(--text-tertiary);margin-top:14px">' +
      '새로 들어온 곳은 왼쪽 <b>🧲 수집함</b>에서 확인하세요.</div>');
  } finally {
    hideGlobalBlocker();
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
