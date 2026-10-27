/* ═══════════════════════════════════════════════════════════════════
   AI 에이전트 연결 화면 (2026-10-27)

     · [🤖 AI 에이전트 연결]   키 만들기·끄기·재발급·삭제, 사용 기록
     · [📨 발송 관리 → 🤖 승인 대기]   AI 가 넣어 둔 답장 초안 목록
     · 회신 상자의 AI 초안 띠   불러오기 · 버리기 (보내기는 원래 [보내기] 그대로)
     · 주소창 ?agentDraft=… · ?mail=…   에이전트가 사람에게 넘기는 링크를 바로 연다

   kr-screens.js 와 같은 이유로 파일을 나눴다 — app.js(17,000줄)에 물려받은 코드와
   새로 쓴 코드가 섞이지 않게. 평범한(non-module) 스크립트라 여기 함수는 전역에 올라가고,
   app.js 가 typeof 로 확인한 뒤 부른다 (로드 순서가 보장되지 않는다).

   ⚠ 이 파일에는 메일을 보내는 코드가 없다. AI 초안도 회신 상자의 [보내기]
     (/api/mail/reply) 하나로만 나간다.
   ═══════════════════════════════════════════════════════════════════ */

var _agentApprovalFilter = 'pending';   // 승인 대기 탭 안의 보기: pending / sent / discarded
var _agentAutoLoadDraftId = null;       // 승인 대기에서 [검토하고 보내기]로 연 초안 — 회신 상자가 열리면 바로 채운다

const AGENT_TOOL_ICON = { claude: '🟠', codex: '🟢', auto: '⏰', other: '🤖' };

function agentEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function agentFmt(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

async function agentJson(url, init) {
  // app.js 의 safeJsonFetch 가 있으면 그쪽을 쓴다 — 세션 만료 안내가 한 곳에서 나가게
  if (typeof safeJsonFetch === 'function') return safeJsonFetch(url, init);
  const r = await fetch(url, init);
  return r.json();
}

function agentCard(inner, extra) {
  return '<div style="padding:18px 20px;background:var(--bg-surface);border:1px solid var(--border-default);' +
    'border-radius:14px;' + (extra || '') + '">' + inner + '</div>';
}

/* ─────────────────────── 🤖 AI 에이전트 연결 (키 관리) ─────────────────────── */

var _agentKeysState = { issued: null, filterKey: '', showAll: false };

async function agentRenderKeysPage() {
  const box = els.content;
  box.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-tertiary)">불러오는 중…</div>';

  let d;
  try {
    const q = _agentKeysState.filterKey ? '?keyId=' + encodeURIComponent(_agentKeysState.filterKey) : '';
    d = await agentJson('/api/agent-keys' + q);
    if (!d || !d.success) throw new Error((d && d.error) || '불러오지 못했습니다');
  } catch (e) {
    box.innerHTML = agentCard('<div style="color:#b91c1c">' + agentEsc(e.message || e) + '</div>');
    return;
  }

  const origin = window.location.origin;
  const iss = _agentKeysState.issued;
  const codeStyle = 'display:block;white-space:pre-wrap;word-break:break-all;font-size:11.5px;' +
    'padding:8px 10px;background:var(--bg-subtle,#f1f5f9);border-radius:8px;margin-top:4px;color:var(--text-primary)';

  const issuedHtml = !iss ? '' : agentCard(
    '<div style="font-size:14px;font-weight:800;color:#92400e">' +
      (iss.rotated ? '🔁 재발급했습니다' : '🔑 키를 만들었습니다') + ' — ' + agentEsc(iss.info.name) +
      ' <span style="font-weight:600">(' + agentEsc(iss.info.toolLabel) + ')</span></div>' +
    '<div style="font-size:12.5px;color:#92400e;margin:6px 0 10px;line-height:1.6">' +
      '이 키는 <b>지금 한 번만</b> 보입니다. 복사해서 연결할 곳에 넣어 두세요. 잃어버리면 [재발급]하면 됩니다.' +
      (iss.rotated ? ' <b>예전 키는 방금 막혔습니다.</b>' : '') + '</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<code id="agentIssuedKey" style="flex:1;min-width:260px;word-break:break-all;font-size:12.5px;padding:9px 11px;' +
        'background:#fff;border:1px solid #fcd34d;border-radius:8px;color:#0f172a">' + agentEsc(iss.key) + '</code>' +
      '<button type="button" id="agentCopyKey" class="button primary" style="padding:8px 14px">복사</button>' +
      '<button type="button" id="agentCloseIssued" class="button ghost" style="padding:8px 14px">닫기</button>' +
    '</div>' +
    '<details style="margin-top:12px;font-size:12.5px;color:var(--text-secondary)" open>' +
      '<summary style="cursor:pointer;font-weight:700">연결 방법</summary>' +
      '<div style="margin-top:8px"><b>Claude Code</b>' +
        '<code style="' + codeStyle + '">claude mcp add --transport http yogibo-b2b ' + agentEsc(origin) +
        '/api/mcp --header "x-assistant-key: ' + agentEsc(iss.key) + '"</code></div>' +
      '<div style="margin-top:10px"><b>Codex</b> (~/.codex/config.toml) — 키는 환경변수 YOGIBO_B2B_KEY 에 넣어 두세요' +
        '<code style="' + codeStyle + '">[mcp_servers.yogibo-b2b]\nurl = "' + agentEsc(origin) + '/api/mcp"\nbearer_token_env_var = "YOGIBO_B2B_KEY"</code></div>' +
      '<div style="margin-top:10px"><b>Claude 웹·데스크톱</b> (설정 → 커넥터 → 커스텀 커넥터 추가) — 헤더를 넣을 수 없어 주소에 키를 붙입니다. ' +
        '<span style="color:#b45309">이 주소는 키와 같으니 남에게 보내지 마세요.</span>' +
        '<code style="' + codeStyle + '">' + agentEsc(origin) + '/api/mcp?key=' + agentEsc(iss.key) + '</code></div>' +
      '<div style="margin-top:10px"><b>REST</b> (아침 자동 실행 등)' +
        '<code style="' + codeStyle + '">curl -H "x-assistant-key: ' + agentEsc(iss.key) + '" ' + agentEsc(origin) + '/api/agent/v1/reply-needed</code></div>' +
    '</details>',
    'border-color:#fcd34d;background:#fffbeb;margin-bottom:14px',
  );

  const toolOpts = (d.tools || []).map((t) =>
    '<option value="' + agentEsc(t.value) + '">' + agentEsc(t.label) + '</option>').join('');

  const keys = d.keys || [];
  const keyRows = keys.map((k) => {
    const mine = k.owner === d.user;
    return '<tr style="border-top:1px solid var(--border-default);' + (k.enabled ? '' : 'opacity:.55') + '">' +
      '<td style="padding:10px 8px;font-weight:700">' + (AGENT_TOOL_ICON[k.tool] || '🤖') + ' ' + agentEsc(k.name) +
        (d.isMaster && !mine ? '<div style="font-size:11px;font-weight:400;color:var(--text-tertiary)">아이디 ' + agentEsc(k.owner) + '</div>' : '') + '</td>' +
      '<td style="padding:10px 8px">' + agentEsc(k.toolLabel) + '</td>' +
      '<td style="padding:10px 8px"><code style="font-size:12px">' + agentEsc(k.hint) + '</code></td>' +
      '<td style="padding:10px 8px;font-size:12px;color:var(--text-tertiary)">읽기 · 초안 저장</td>' +
      '<td style="padding:10px 8px"><span style="font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:99px;' +
        (k.enabled ? 'background:#dcfce7;color:#166534' : 'background:#f1f5f9;color:#64748b') + '">' + (k.enabled ? '켜짐' : '꺼짐') + '</span></td>' +
      '<td style="padding:10px 8px;font-size:12px;color:var(--text-tertiary);line-height:1.6">' +
        (k.lastUsedAt ? agentFmt(k.lastUsedAt) + ' · ' + (k.lastUsedVia === 'mcp' ? 'MCP' : 'REST') + ' · ' + (k.useCount || 0).toLocaleString() + '회' : '아직 없음') +
        '<div>만든 날 ' + agentFmt(k.createdAt) + (k.rotatedAt ? ' · 재발급 ' + agentFmt(k.rotatedAt) : '') + '</div></td>' +
      '<td style="padding:10px 8px;white-space:nowrap;font-size:12.5px">' +
        '<button type="button" class="agent-key-act" data-act="toggle" data-id="' + agentEsc(k.id) + '" data-on="' + (k.enabled ? '1' : '0') + '" ' +
          'style="background:none;border:none;color:#1d4ed8;cursor:pointer;font-weight:700">' + (k.enabled ? '끄기' : '켜기') + '</button>' +
        (mine ? ' · <button type="button" class="agent-key-act" data-act="rotate" data-id="' + agentEsc(k.id) + '" data-name="' + agentEsc(k.name) + '" ' +
          'style="background:none;border:none;color:#1d4ed8;cursor:pointer;font-weight:700">재발급</button>' : '') +
        ' · <button type="button" class="agent-key-act" data-act="delete" data-id="' + agentEsc(k.id) + '" data-name="' + agentEsc(k.name) + '" ' +
          'style="background:none;border:none;color:#b91c1c;cursor:pointer;font-weight:700">삭제</button>' +
      '</td></tr>';
  }).join('');

  const audit = d.audit || [];
  const shown = _agentKeysState.showAll ? audit : audit.slice(0, 20);
  const auditRows = shown.map((a) => {
    const target = a.target && /^[0-9a-f]{24}$/i.test(a.target)
      ? '<a href="#" class="agent-open-mail" data-id="' + agentEsc(a.target) + '" style="color:#1d4ed8">메일 열기</a>'
      : '<span style="color:var(--text-tertiary)">' + agentEsc(a.target ? String(a.target).slice(0, 18) : '-') + '</span>';
    return '<tr style="border-top:1px solid var(--border-default)">' +
      '<td style="padding:8px;font-size:12px;color:var(--text-tertiary);white-space:nowrap">' + agentFmt(a.at) + '</td>' +
      '<td style="padding:8px;font-size:12px">' + (a.keyName ? agentEsc(a.keyName) : '<span style="color:var(--text-tertiary)">알 수 없는 키</span>') + '</td>' +
      '<td style="padding:8px;font-size:12px;color:var(--text-tertiary)">' + (a.via === 'mcp' ? 'MCP' : 'REST') + '</td>' +
      '<td style="padding:8px;font-size:12px">' + agentEsc(a.actionLabel) + '</td>' +
      '<td style="padding:8px;font-size:12px">' + target + '</td>' +
      '<td style="padding:8px;font-size:12px;color:' + (a.ok ? '#166534' : '#b91c1c') + '">' + (a.ok ? '성공' : '실패 ' + agentEsc(a.status)) +
        (a.error ? '<div style="color:var(--text-tertiary);max-width:280px">' + agentEsc(a.error) + '</div>' : '') + '</td></tr>';
  }).join('');

  const keyFilterOpts = '<option value="">모든 키</option>' + keys.map((k) =>
    '<option value="' + agentEsc(k.id) + '"' + (k.id === _agentKeysState.filterKey ? ' selected' : '') + '>' + agentEsc(k.name) + '</option>').join('');

  box.innerHTML =
    '<div style="max-width:1100px;margin:0 auto">' +
    agentCard(
      '<div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:6px">이 키로 할 수 있는 일</div>' +
      '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.8">' +
        'Claude·Codex·아침 자동 실행이 이 앱에 붙을 때 쓰는 키입니다. <b>로그인 비밀번호와는 따로</b>입니다.<br>' +
        '키로는 <b>메일 읽기와 답장 초안 저장만</b> 됩니다. 발송·삭제·설정 변경은 키로 할 수 없고, ' +
        '초안은 <b>[📨 발송 관리 → 🤖 승인 대기]</b>에 들어가 사람이 회신 상자에서 확인하고 [보내기]를 눌러야 나갑니다.<br>' +
        '키는 <b>만든 아이디(' + agentEsc(d.user) + ')의 메일함</b>만 봅니다. 도구마다 키를 따로 만들어 두면 기록에서 누가 무엇을 했는지 구분되고, 하나만 끄거나 재발급할 수 있습니다.' +
      '</div>',
      'margin-bottom:14px',
    ) +
    issuedHtml +
    agentCard(
      '<div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:10px">🔑 키</div>' +
      '<form id="agentNewKeyForm" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
        '<input id="agentNewKeyName" type="text" maxlength="40" placeholder="키 이름  예) Claude — 노트북" ' +
          'style="flex:2;min-width:220px;padding:9px 11px;border:1px solid var(--border-default);border-radius:8px;font-size:13px;background:var(--bg-surface);color:var(--text-primary)">' +
        '<select id="agentNewKeyTool" style="padding:9px 11px;border:1px solid var(--border-default);border-radius:8px;font-size:13px;background:var(--bg-surface);color:var(--text-primary)">' + toolOpts + '</select>' +
        '<button type="submit" class="button primary" style="padding:9px 16px">새 키 만들기</button>' +
      '</form>' +
      (keys.length
        ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
            '<thead><tr style="text-align:left;font-size:11.5px;color:var(--text-tertiary)">' +
            '<th style="padding:6px 8px">이름</th><th style="padding:6px 8px">도구</th><th style="padding:6px 8px">키</th>' +
            '<th style="padding:6px 8px">권한</th><th style="padding:6px 8px">상태</th><th style="padding:6px 8px">마지막 사용</th><th></th></tr></thead>' +
            '<tbody>' + keyRows + '</tbody></table></div>'
        : '<div style="font-size:12.5px;color:var(--text-tertiary)">아직 만든 키가 없습니다.</div>') +
      '<div id="agentKeyMsg" style="font-size:12.5px;margin-top:8px"></div>',
      'margin-bottom:14px',
    ) +
    agentCard(
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<div style="font-size:15px;font-weight:800;color:var(--text-primary)">🧾 사용 기록 ' +
          '<span style="font-size:12px;font-weight:400;color:var(--text-tertiary)">· 최근 100건 · 180일 보관 · 읽은 것도 남습니다</span></div>' +
        '<select id="agentAuditKey" style="padding:7px 10px;border:1px solid var(--border-default);border-radius:8px;font-size:12.5px;background:var(--bg-surface);color:var(--text-primary)">' + keyFilterOpts + '</select>' +
      '</div>' +
      (audit.length
        ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
            '<thead><tr style="text-align:left;font-size:11.5px;color:var(--text-tertiary)">' +
            '<th style="padding:6px 8px">시각</th><th style="padding:6px 8px">키</th><th style="padding:6px 8px">경로</th>' +
            '<th style="padding:6px 8px">동작</th><th style="padding:6px 8px">대상</th><th style="padding:6px 8px">결과</th></tr></thead>' +
            '<tbody>' + auditRows + '</tbody></table></div>' +
          (audit.length > 20
            ? '<button type="button" id="agentAuditMore" style="margin-top:8px;background:none;border:none;color:#1d4ed8;cursor:pointer;font-size:12.5px;font-weight:700">' +
                (_agentKeysState.showAll ? '최근 20건만 보기' : '나머지 ' + (audit.length - 20) + '건 더 보기') + '</button>'
            : '')
        : '<div style="font-size:12.5px;color:var(--text-tertiary)">아직 기록이 없습니다.</div>'),
    ) +
    '</div>';

  const msg = document.getElementById('agentKeyMsg');
  const fail = (e) => { if (msg) msg.innerHTML = '<span style="color:#b91c1c">' + agentEsc(e.message || e) + '</span>'; };

  document.getElementById('agentCopyKey')?.addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(iss.key);
      e.currentTarget.textContent = '복사됨';
    } catch { e.currentTarget.textContent = '직접 선택해 복사하세요'; }
  });
  document.getElementById('agentCloseIssued')?.addEventListener('click', () => {
    _agentKeysState.issued = null;
    agentRenderKeysPage();
  });

  document.getElementById('agentNewKeyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('agentNewKeyName')?.value || '').trim();
    const tool = document.getElementById('agentNewKeyTool')?.value || 'other';
    if (!name) { fail(new Error('키 이름을 적어 주세요. 예) Claude — 노트북')); return; }
    try {
      const r = await agentJson('/api/agent-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, tool }),
      });
      if (!r.success) throw new Error(r.error || '발급 실패');
      _agentKeysState.issued = { key: r.key, info: r.info, rotated: false };
      agentRenderKeysPage();
    } catch (err) { fail(err); }
  });

  box.querySelectorAll('.agent-key-act').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.id;
    try {
      if (b.dataset.act === 'toggle') {
        const r = await agentJson('/api/agent-keys/' + encodeURIComponent(id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: b.dataset.on !== '1' }),
        });
        if (!r.success) throw new Error(r.error || '변경 실패');
      }
      if (b.dataset.act === 'rotate') {
        if (!confirm("'" + b.dataset.name + "' 키를 재발급할까요?\n\n지금 쓰고 있는 키는 바로 막히고, 새 키로 바꿔 넣어야 다시 연결됩니다.")) return;
        const r = await agentJson('/api/agent-keys/' + encodeURIComponent(id) + '/rotate', { method: 'POST' });
        if (!r.success) throw new Error(r.error || '재발급 실패');
        _agentKeysState.issued = { key: r.key, info: r.info, rotated: true };
      }
      if (b.dataset.act === 'delete') {
        if (!confirm("'" + b.dataset.name + "' 키를 삭제할까요?\n\n이 키로는 더 이상 연결할 수 없습니다. 사용 기록과 이미 넣어 둔 초안은 남습니다.")) return;
        const r = await agentJson('/api/agent-keys/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.success) throw new Error(r.error || '삭제 실패');
        if (_agentKeysState.filterKey === id) _agentKeysState.filterKey = '';
      }
      agentRenderKeysPage();
    } catch (err) { fail(err); }
  }));

  document.getElementById('agentAuditKey')?.addEventListener('change', (e) => {
    _agentKeysState.filterKey = e.target.value;
    _agentKeysState.showAll = false;
    agentRenderKeysPage();
  });
  document.getElementById('agentAuditMore')?.addEventListener('click', () => {
    _agentKeysState.showAll = !_agentKeysState.showAll;
    agentRenderKeysPage();
  });
  box.querySelectorAll('.agent-open-mail').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof openMailDetailModal === 'function') openMailDetailModal(a.dataset.id);
  }));
}

/* ─────────────────────── 📨 발송 관리 → 🤖 승인 대기 ─────────────────────── */

/** 발송 관리가 한 번에 부르는 목록 — 실패해도 발송 관리 화면은 그대로 열려야 한다 */
async function agentLoadApprovalDrafts() {
  try {
    const r = await agentJson('/api/agent-drafts?status=' + encodeURIComponent(_agentApprovalFilter === 'pending' ? 'pending' : _agentApprovalFilter));
    return r && r.success ? { items: r.items || [], pending: r.pending || 0 } : { items: [], pending: 0, error: (r && r.error) || '' };
  } catch (e) {
    return { items: [], pending: 0, error: String(e.message || e) };
  }
}

/** 원 메일이 지금 어떤 상태인지 — 웹메일에서 이미 답했으면 보내기 전에 알아야 한다 */
function agentMailNowNote(n) {
  if (!n) return '';
  if (n.missing) return '원 메일을 찾을 수 없습니다.';
  if (n.trashed) return '원 메일이 휴지통에 있습니다.';
  if (n.status === 'replied') return '원 메일은 이미 답변완료입니다' + (n.repliedOutside ? ' (웹메일·휴대폰에서 회신)' : '') + ' — 또 보낼 필요가 있는지 확인하세요.';
  return '';
}

function agentOutboxApprovalHtml(data) {
  const items = (data && data.items) || [];
  const chip = (key, label) => {
    const on = _agentApprovalFilter === key;
    return '<button type="button" class="agent-approval-filter" data-filter="' + key + '" ' +
      'style="font-size:12px;font-weight:700;padding:5px 12px;border-radius:99px;cursor:pointer;' +
      'border:1px solid ' + (on ? '#7c3aed' : 'var(--border-default)') + ';background:' + (on ? '#7c3aed14' : 'var(--bg-surface)') + ';' +
      'color:' + (on ? '#6d28d9' : 'var(--text-secondary)') + '">' + label + '</button>';
  };

  const head =
    '<div style="padding:12px 14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;font-size:12.5px;color:#5b21b6;line-height:1.7;margin-bottom:12px">' +
      '<b>🤖 AI 에이전트가 넣어 둔 답장 초안</b>입니다. <b>여기서는 메일이 나가지 않습니다</b> — ' +
      '[검토하고 보내기]를 누르면 그 메일의 회신 상자에 초안이 채워지고, 내용을 확인한 뒤 [보내기]를 눌러야 발송됩니다. ' +
      '키 관리와 사용 기록은 <a href="#" id="agentGoKeys" style="color:#6d28d9;font-weight:700">[🤖 AI 에이전트 연결]</a>에 있습니다.' +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">' +
      chip('pending', '승인 대기') + chip('sent', '발송 완료') + chip('discarded', '버림') +
    '</div>' +
    (data && data.error ? '<div style="color:#b91c1c;font-size:12.5px;margin-bottom:10px">' + agentEsc(data.error) + '</div>' : '');

  if (!items.length) {
    return head + agentCard('<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">' +
      (_agentApprovalFilter === 'pending' ? '승인 대기 중인 AI 초안이 없습니다.' : '해당하는 초안이 없습니다.') + '</div>');
  }

  const rows = items.map((d) => {
    const note = d.status === 'pending' ? agentMailNowNote(d.mailNow) : '';
    const who = (d.mail.company || d.mail.group) ? '[' + agentEsc(d.mail.company || d.mail.group) + '] ' : '';
    const statusChip = d.status === 'pending'
      ? '<span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:#fef3c7;color:#92400e">승인 대기</span>'
      : d.status === 'sent'
        ? '<span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:#dcfce7;color:#166534">발송 완료</span>'
        : '<span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:#f1f5f9;color:#64748b">버림</span>';
    let actions = '';
    if (d.status === 'pending') {
      actions = '<button type="button" class="agent-draft-review button primary" data-id="' + agentEsc(d.id) + '" data-mail="' + agentEsc(d.inboundMailId) + '" style="padding:7px 14px;font-size:12.5px">검토하고 보내기</button>' +
        '<button type="button" class="agent-draft-status button ghost" data-id="' + agentEsc(d.id) + '" data-status="discarded" style="padding:7px 12px;font-size:12.5px">버리기</button>';
    } else if (d.status === 'discarded') {
      actions = '<span style="font-size:12px;color:var(--text-tertiary)">버린 시각 ' + agentFmt(d.discardedAt) + '</span>' +
        '<button type="button" class="agent-draft-status button ghost" data-id="' + agentEsc(d.id) + '" data-status="pending" style="padding:7px 12px;font-size:12.5px">승인 대기로 되돌리기</button>';
    } else {
      actions = '<span style="font-size:12px;color:var(--text-tertiary)">' + agentFmt(d.sentAt) + ' 발송 → ' + agentEsc(d.sentTo || d.to) +
        (d.editedBeforeSend === true ? ' · 사람이 고쳐서 보냄' : d.editedBeforeSend === false ? ' · 초안 그대로 보냄' : '') + '</span>';
    }
    return agentCard(
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
        '<span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:#ede9fe;color:#5b21b6">' +
          (AGENT_TOOL_ICON[d.agent.tool] || '🤖') + ' AI 초안 · ' + agentEsc(d.agent.toolLabel) + '</span>' +
        statusChip +
        '<span style="font-size:11.5px;color:var(--text-tertiary)">' + agentEsc(d.agent.keyName) +
          (d.agent.client ? ' · ' + agentEsc(d.agent.client) : '') + ' · ' + agentFmt(d.updatedAt) +
          (d.revision > 1 ? ' · ' + (d.revision - 1) + '번 고침' : '') + '</span>' +
      '</div>' +
      '<div style="font-size:11.5px;color:var(--text-tertiary)">원 메일 · ' + who + agentEsc(d.mail.from.name || d.mail.from.address) + ' · ' + agentFmt(d.mail.date) + '</div>' +
      '<a href="#" class="agent-open-mail" data-id="' + agentEsc(d.inboundMailId) + '" style="font-size:14px;font-weight:700;color:var(--text-primary)">' + agentEsc(d.mail.subject || '(제목 없음)') + '</a>' +
      '<div style="font-size:12.5px;margin-top:8px;line-height:1.7">' +
        '<div><span style="color:var(--text-tertiary)">받는 사람</span> ' + agentEsc(d.to) +
          (d.cc ? ' <span style="color:var(--text-tertiary)">· 참조 ' + agentEsc(d.cc) + '</span>' : '') + '</div>' +
        '<div><span style="color:var(--text-tertiary)">제목</span> ' + agentEsc(d.subject) + '</div>' +
      '</div>' +
      '<div style="font-size:12.5px;color:var(--text-secondary);white-space:pre-wrap;max-height:84px;overflow:hidden;margin-top:6px;' +
        'padding:8px 10px;background:var(--bg-subtle,#f8fafc);border-radius:8px">' + agentEsc(d.bodyPreview || d.body || '') + '</div>' +
      (d.notes ? '<div style="font-size:12px;margin-top:6px;color:#b45309">발송 전 확인 · ' + agentEsc(d.notes) + '</div>' : '') +
      (note ? '<div style="font-size:12px;margin-top:6px;color:#b91c1c">⚠ ' + agentEsc(note) + '</div>' : '') +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">' + actions + '</div>',
      'margin-bottom:10px',
    );
  }).join('');

  return head + rows;
}

/** 승인 대기 탭의 버튼들 — rerender 는 발송 관리 전체를 다시 그리는 함수 */
function agentBindOutboxApproval(rerender) {
  document.querySelectorAll('.agent-approval-filter').forEach((b) => b.addEventListener('click', () => {
    _agentApprovalFilter = b.dataset.filter;
    rerender();
  }));
  document.getElementById('agentGoKeys')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.nav-item[data-view="tool-agent-keys"]')?.click();
  });
  document.querySelectorAll('.agent-draft-review').forEach((b) => b.addEventListener('click', () => {
    agentOpenDraftForReview(b.dataset.id, b.dataset.mail);
  }));
  document.querySelectorAll('.agent-draft-status').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.status === 'discarded' && !confirm("이 AI 초안을 버릴까요?\n'버림' 에서 되살릴 수 있습니다.")) return;
    b.disabled = true;
    try {
      const r = await agentJson('/api/agent-drafts/' + encodeURIComponent(b.dataset.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: b.dataset.status }),
      });
      if (!r.success) throw new Error(r.error || '변경 실패');
      rerender();
    } catch (e) {
      alert(e.message || e);
      b.disabled = false;
    }
  }));
  document.querySelectorAll('#outboxBody .agent-open-mail').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof openMailDetailModal === 'function') openMailDetailModal(a.dataset.id);
  }));
}

/** [검토하고 보내기] — 그 메일을 열고, 회신 상자가 뜨면 초안을 채운다 (agentDecorateReplyBox) */
function agentOpenDraftForReview(draftId, inboundMailId) {
  _agentAutoLoadDraftId = draftId;
  if (typeof openMailDetailModal === 'function') openMailDetailModal(inboundMailId);
}

/* ─────────────────────── 회신 상자 — AI 초안 띠 ─────────────────────── */

/**
 * 회신 상자에 이 메일의 승인 대기 초안을 띄운다. app.js bindConversationReply 가 부른다.
 * [불러오기]를 누르거나 승인 대기에서 열고 들어왔으면 초안을 본문·제목·참조 칸에 채운다.
 * 채운 뒤에도 보내는 길은 원래 [보내기] 하나다 — 보낼 때 agentReplyExtras() 가 초안 id 를 함께 싣는다.
 */
async function agentDecorateReplyBox(root) {
  const sendBtn = root && root.querySelector('#convReplySend');
  const inboundId = sendBtn && sendBtn.dataset.inboundId;
  if (!inboundId) return;

  let items = [];
  try {
    const r = await agentJson('/api/agent-drafts?status=pending&withBody=true&inboundMailId=' + encodeURIComponent(inboundId));
    items = (r && r.success && r.items) || [];
  } catch { return; }

  const auto = _agentAutoLoadDraftId;
  _agentAutoLoadDraftId = null;
  if (!items.length) {
    if (auto) {
      const msg = root.querySelector('#convReplyMsg');
      if (msg) msg.innerHTML = '<span style="color:#b45309">불러올 AI 초안이 없습니다 — 이미 보냈거나 버린 초안입니다.</span>';
    }
    return;
  }

  // 띠는 회신 상자 맨 위(↩ 회신 줄 아래)에 둔다
  const host = sendBtn.closest('div[style*="padding:14px 18px 18px"]') || root;
  let band = root.querySelector('#agentDraftBand');
  if (!band) {
    band = document.createElement('div');
    band.id = 'agentDraftBand';
    const first = host.firstElementChild;
    if (first && first.nextSibling) host.insertBefore(band, first.nextSibling);
    else host.prepend(band);
  }
  band.innerHTML = items.map((d) =>
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:9px 12px;margin-bottom:8px;' +
      'background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;font-size:12.5px;color:#5b21b6">' +
      '<b>' + (AGENT_TOOL_ICON[d.agent.tool] || '🤖') + ' AI 초안 · ' + agentEsc(d.agent.toolLabel) + '</b>' +
      '<span style="color:#7c3aed">승인 대기 · ' + agentEsc(d.agent.keyName) + ' · ' + agentFmt(d.updatedAt) + '</span>' +
      '<span style="flex:1"></span>' +
      '<button type="button" class="agent-band-load" data-id="' + agentEsc(d.id) + '" ' +
        'style="padding:5px 11px;font-size:12px;font-weight:800;border:1px solid #7c3aed;border-radius:7px;background:#fff;color:#6d28d9;cursor:pointer">불러오기</button>' +
      '<button type="button" class="agent-band-discard" data-id="' + agentEsc(d.id) + '" ' +
        'style="padding:5px 11px;font-size:12px;font-weight:700;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#475569;cursor:pointer">버리기</button>' +
    '</div>').join('');

  band.querySelectorAll('.agent-band-load').forEach((b) => b.addEventListener('click', () => {
    const d = items.find((x) => x.id === b.dataset.id);
    if (d) agentLoadDraftIntoReply(root, d);
  }));
  band.querySelectorAll('.agent-band-discard').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm("이 AI 초안을 버릴까요?\n[발송 관리 → 승인 대기 → 버림]에서 되살릴 수 있습니다.")) return;
    try {
      const r = await agentJson('/api/agent-drafts/' + encodeURIComponent(b.dataset.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'discarded' }),
      });
      if (!r.success) throw new Error(r.error || '변경 실패');
      if (root.dataset.agentDraftId === b.dataset.id) agentClearDraft(root);
      agentDecorateReplyBox(root);
    } catch (e) { alert(e.message || e); }
  }));

  const want = auto && items.find((x) => x.id === auto);
  if (want) agentLoadDraftIntoReply(root, want);
}

/** 초안을 회신 상자에 채운다 — 본문은 평문이라 줄바꿈을 <br> 로 바꿔 넣는다 */
function agentLoadDraftIntoReply(root, d) {
  const ta = root.querySelector('#convReplyBody');
  if (ta && ta.innerText.trim() && root.dataset.agentDraftId !== d.id
      && !confirm('회신 상자에 이미 쓴 내용이 있습니다. AI 초안으로 바꿀까요?')) return;
  if (ta) ta.innerHTML = agentEsc(d.body || '').split('\n').join('<br>');
  root.dataset.agentDraftId = d.id;

  // 제목·참조 칸 — 회신 상자에는 원래 없던 칸이라 AI 초안을 불러왔을 때만 띄운다
  let fields = root.querySelector('#agentDraftFields');
  if (!fields) {
    fields = document.createElement('div');
    fields.id = 'agentDraftFields';
    const band = root.querySelector('#agentDraftBand');
    if (band) band.after(fields);
  }
  const inp = 'flex:1;min-width:220px;padding:7px 10px;font-size:12.5px;border:1px solid #c4b5fd;border-radius:7px;background:#fff;color:#0f172a';
  fields.innerHTML =
    '<div style="padding:9px 12px;margin-bottom:8px;border:1px dashed #c4b5fd;border-radius:8px;background:#faf5ff">' +
      '<div style="font-size:11.5px;font-weight:800;color:#6d28d9;margin-bottom:6px">' +
        (AGENT_TOOL_ICON[d.agent.tool] || '🤖') + ' AI 초안을 불러왔습니다 · ' + agentEsc(d.agent.toolLabel) + ' (' + agentEsc(d.agent.keyName) + ')' +
        ' <span style="font-weight:400;color:#7c3aed">— 고친 뒤 [보내기]를 눌러야 나갑니다</span></div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
        '<span style="font-size:12px;color:#64748b;width:48px">받는 사람</span>' +
        '<span style="font-size:12.5px;color:#0f172a">' + agentEsc(d.to) + '</span></div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
        '<span style="font-size:12px;color:#64748b;width:48px">참조</span>' +
        '<input id="agentReplyCc" type="text" value="' + agentEsc(d.cc || '') + '" placeholder="비워 두어도 됩니다 · 여러 명은 쉼표" style="' + inp + '"></div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<span style="font-size:12px;color:#64748b;width:48px">제목</span>' +
        '<input id="agentReplySubject" type="text" value="' + agentEsc(d.subject || '') + '" style="' + inp + '"></div>' +
      '<div style="margin-top:6px;text-align:right">' +
        '<button type="button" id="agentDraftUnload" style="background:none;border:none;color:#6d28d9;cursor:pointer;font-size:11.5px;font-weight:700">초안 내리기 (승인 대기로 둠)</button></div>' +
    '</div>';
  fields.querySelector('#agentDraftUnload')?.addEventListener('click', () => {
    agentClearDraft(root);
    if (ta) ta.innerHTML = '';
  });

  // 확인할 것은 한글 대역본 칸에 — 발송되지 않는 자리라 거기 두면 섞여 나갈 일이 없다
  const koBox = root.querySelector('#convDraftKo');
  if (koBox) {
    koBox.innerHTML =
      '<div style="font-size:10.5px;font-weight:800;color:#64748b;margin-bottom:6px">🤖 AI 초안 메모 <span style="font-weight:400">· 검토용 · 발송되지 않음</span></div>' +
      (d.notes
        ? '<div style="color:#b45309;white-space:pre-wrap"><b>발송 전 확인</b> · ' + agentEsc(d.notes) + '</div>'
        : '<div style="color:#94a3b8">에이전트가 남긴 확인 사항이 없습니다.</div>') +
      (agentMailNowNote(d.mailNow) ? '<div style="margin-top:8px;color:#b91c1c">⚠ ' + agentEsc(agentMailNowNote(d.mailNow)) + '</div>' : '');
    koBox.removeAttribute('hidden');
  }
  const msg = root.querySelector('#convReplyMsg');
  if (msg) msg.innerHTML = '<span style="color:#6d28d9">🤖 AI 초안을 채웠습니다 — 확인하고 고친 뒤 [보내기]</span>';
  ta?.focus();
}

function agentClearDraft(root) {
  delete root.dataset.agentDraftId;
  root.querySelector('#agentDraftFields')?.remove();
}

/**
 * [보내기]·[미리보기]가 서버에 함께 실어 보낼 값 — AI 초안을 불러왔을 때만.
 * agentDraftId 가 있으면 서버가 발송 뒤 그 초안을 '발송 완료' 로 닫는다(실제로 나갔을 때만).
 */
function agentReplyExtras(root) {
  const id = root && root.dataset.agentDraftId;
  if (!id) return {};
  const cc = (root.querySelector('#agentReplyCc')?.value || '').trim();
  const subject = (root.querySelector('#agentReplySubject')?.value || '').trim();
  return { agentDraftId: id, cc: cc || undefined, subject: subject || undefined };
}

/* ─────────────────────── 주소창 링크 — ?agentDraft=… · ?mail=… ─────────────────────── */

/**
 * 에이전트가 사람에게 넘기는 링크를 바로 연다 (lib/agent/api.ts mailUrl · draftUrl).
 * app.js 가 다 뜬 뒤에 열어야 해서 준비될 때까지 잠깐 기다린다. 연 뒤에는 주소창에서 지운다 —
 * 새로고침할 때마다 같은 메일이 다시 열리면 안 된다.
 */
(function agentHandleDeepLink() {
  let sp;
  try { sp = new URLSearchParams(window.location.search); } catch { return; }
  const draftId = sp.get('agentDraft');
  const mailId = sp.get('mail');
  if (!draftId && !mailId) return;

  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    const ready = typeof openMailDetailModal === 'function' && document.querySelector('.nav-item[data-view="pipeline-contacted"]');
    if (!ready && tries < 60) return;
    clearInterval(timer);
    if (!ready) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('agentDraft');
      url.searchParams.delete('mail');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch { /* 주소를 못 지워도 여는 데는 지장이 없다 */ }

    if (draftId) {
      try {
        const r = await agentJson('/api/agent-drafts/' + encodeURIComponent(draftId));
        if (!r || !r.success) throw new Error((r && r.error) || '초안을 찾을 수 없습니다');
        if (typeof _outboxTab !== 'undefined') _outboxTab = 'approval';
        _agentApprovalFilter = r.draft.status === 'pending' ? 'pending' : r.draft.status;
        document.querySelector('.nav-item[data-view="pipeline-contacted"]')?.click();
        if (r.draft.status === 'pending') setTimeout(() => agentOpenDraftForReview(r.draft.id, r.draft.inboundMailId), 600);
      } catch (e) {
        alert('AI 초안을 열지 못했습니다 — ' + (e.message || e));
      }
    } else if (/^[0-9a-f]{24}$/i.test(mailId)) {
      openMailDetailModal(mailId);
    }
  }, 300);
})();
