/* ==========================================================================
 * CompetitorLens · Demo Page 交互逻辑
 * Tab 切换 / Agent 时间线动画 / 报告渲染 / Markdown 渲染器 / 自定义分析
 * ========================================================================== */

const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `${location.protocol}//${location.hostname}`;

const AGENT_COLORS = {
  Orchestrator: { color: '#3370FF', icon: '🎯' },
  Collector:    { color: '#F59E0B', icon: '🔍' },
  Analyst:      { color: '#8B5CF6', icon: '📊' },
  Writer:       { color: '#10B981', icon: '✍️' },
  Reviewer:     { color: '#EF4444', icon: '🔬' },
  Citation:     { color: '#06B6D4', icon: '📌' },
};

/* ====== Theme Toggle ====== */
(() => {
  const html = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const saved = localStorage.getItem('cl-theme');
  if (saved) html.setAttribute('data-theme', saved);
  else if (matchMedia('(prefers-color-scheme:dark)').matches) html.setAttribute('data-theme', 'dark');

  const update = () => { btn.textContent = html.getAttribute('data-theme') === 'dark' ? '☀' : '☾'; };
  update();
  btn.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('cl-theme', next);
    update();
  });
})();

/* ====== Robust Markdown Renderer ====== */
function renderMarkdown(md) {
  if (!md) return '';

  const lines = md.split('\n');
  const html = [];
  let inTable = false;
  let tableRows = [];
  let inList = false;
  let listType = 'ul';
  let listItems = [];

  const flushTable = () => {
    if (tableRows.length < 2) {
      tableRows.forEach(r => html.push(`<p>${escHtml(r)}</p>`));
      tableRows = [];
      inTable = false;
      return;
    }
    const parseRow = r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const headers = parseRow(tableRows[0]);
    const dataRows = tableRows.slice(2);

    html.push('<table><thead><tr>');
    headers.forEach(h => html.push(`<th>${inlineFormat(h)}</th>`));
    html.push('</tr></thead><tbody>');
    dataRows.forEach(r => {
      const cells = parseRow(r);
      html.push('<tr>');
      cells.forEach((c, i) => html.push(`<td>${inlineFormat(c || '')}</td>`));
      html.push('</tr>');
    });
    html.push('</tbody></table>');
    tableRows = [];
    inTable = false;
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(`<${listType}>`);
    listItems.forEach(item => html.push(`<li>${inlineFormat(item)}</li>`));
    html.push(`</${listType}>`);
    listItems = [];
    inList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (inList) flushList();
      inTable = true;
      tableRows.push(trimmed);
      continue;
    }
    if (inTable) {
      flushTable();
    }

    if (trimmed === '') {
      if (inList) flushList();
      continue;
    }

    if (trimmed.startsWith('# ')) {
      if (inList) flushList();
      html.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) flushList();
      html.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) flushList();
      html.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      if (inList) flushList();
      html.push('<hr>');
      continue;
    }

    if (trimmed.startsWith('> ')) {
      if (inList) flushList();
      html.push(`<blockquote>${inlineFormat(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (inList && listType !== 'ul') flushList();
      inList = true;
      listType = 'ul';
      listItems.push(ulMatch[1]);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (inList && listType !== 'ol') flushList();
      inList = true;
      listType = 'ol';
      listItems.push(olMatch[1]);
      continue;
    }

    if (inList) flushList();
    html.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inTable) flushTable();
  if (inList) flushList();

  return html.join('\n');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/★/g, '<span style="color:var(--warn)">★</span>');
}

/* ====== DOM Helpers ====== */
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) {
    if (typeof html === 'string') e.innerHTML = html;
    else e.appendChild(html);
  }
  return e;
};

/* ====== State ====== */
let currentScenario = null;
let customRunning = false;

/* ====== Tab Switching ====== */
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const id = tab.dataset.id;

    if (id === 'custom') {
      showCustomMode();
    } else {
      loadScenario(id);
    }
  });
});

function showCustomMode() {
  $('customArea').style.display = 'block';
  $('scenarioTitle').textContent = '自定义竞品分析';
  $('scenarioQuery').textContent = '输入任意竞品分析需求，系统将调用 MiniMax M2.7 实时分析';
  $('scenarioTags').innerHTML = '';
  $('reportPlaceholder').style.display = 'flex';
  $('reportContent').style.display = 'none';
  $('reportContent').innerHTML = '';
  resetTimeline();
  resetTrace();
  $('statusBadge').textContent = 'READY';
  $('statusBadge').className = 'panel-badge';
  $('panelStats').innerHTML = '';
}

/* ====== Load Scenario ====== */
async function loadScenario(id) {
  $('customArea').style.display = 'none';
  $('statusBadge').textContent = 'LOADING';
  $('statusBadge').className = 'panel-badge running';

  try {
    const resp = await fetch(`${API_BASE}/api/demos/${id}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    currentScenario = data;
    renderScenario(data);
  } catch (err) {
    console.warn('API unavailable, using fallback:', err);
    renderScenarioFallback(id);
  }
}

function renderScenario(data) {
  const s = data.scenario;
  const cached = data.cached_report || {};
  const md = data.markdown_report || cached.markdown_report || '';
  const traces = data.trace_data || cached.trace_data || [];

  $('scenarioTitle').textContent = s.name;
  $('scenarioQuery').textContent = s.query;

  const tagsEl = $('scenarioTags');
  tagsEl.innerHTML = '';
  (s.focus_areas || []).forEach(t => {
    const tag = el('span', 'sb-tag', t);
    tagsEl.appendChild(tag);
  });

  if (md) {
    $('reportPlaceholder').style.display = 'none';
    $('reportContent').style.display = 'block';
    $('reportContent').innerHTML = renderMarkdown(md);

    const totalTokens = traces.reduce((sum, t) => sum + (t.tokens || 0), 0);
    const statsHtml = `
      <div class="report-stats">
        <div class="rs-item"><span class="rs-label">Tokens</span><span class="rs-value">${totalTokens.toLocaleString()}</span></div>
        <div class="rs-item"><span class="rs-label">竞品数</span><span class="rs-value">${(cached.competitors || []).length}</span></div>
        <div class="rs-item"><span class="rs-label">Agent 步骤</span><span class="rs-value">${traces.length}</span></div>
        <div class="rs-item"><span class="rs-label">引用验证</span><span class="rs-value">✓</span></div>
      </div>
    `;
    $('reportContent').insertAdjacentHTML('beforeend', statsHtml);
  }

  renderTimeline(traces);
  renderTrace(traces);

  $('statusBadge').textContent = 'DONE';
  $('statusBadge').className = 'panel-badge done';

  const totalTokens = traces.reduce((sum, t) => sum + (t.tokens || 0), 0);
  const totalTime = traces.reduce((sum, t) => sum + parseFloat(t.duration || '0'), 0);
  $('panelStats').innerHTML = `
    <div class="ps-item"><span class="ps-label">Total Tokens</span><span class="ps-value">${totalTokens.toLocaleString()}</span></div>
    <div class="ps-item"><span class="ps-label">Total Time</span><span class="ps-value">${totalTime.toFixed(1)}s</span></div>
    <div class="ps-item"><span class="ps-label">Agents</span><span class="ps-value">6</span></div>
  `;
}

/* ====== Fallback data for offline mode ====== */
function renderScenarioFallback(id) {
  const fallbackData = {
    'ai-assistant': { name: 'AI 对话助手竞品分析', query: '分析中国市场主要 AI 对话助手产品的竞争格局' },
    'short-video': { name: '短视频平台竞品分析', query: '分析中国短视频平台的竞争格局' },
    'ai-coding': { name: 'AI 编程工具竞品分析', query: '对比分析主流 AI 编程辅助工具' },
  };
  const info = fallbackData[id] || fallbackData['ai-assistant'];

  $('scenarioTitle').textContent = info.name;
  $('scenarioQuery').textContent = '(离线模式) ' + info.query;
  $('scenarioTags').innerHTML = '<span class="sb-tag">离线数据</span>';
  $('reportPlaceholder').style.display = 'none';
  $('reportContent').style.display = 'block';
  $('reportContent').innerHTML = '<p style="color:var(--fg3)">无法连接后端 API，请确认服务器运行中。</p>';
  $('statusBadge').textContent = 'OFFLINE';
  $('statusBadge').className = 'panel-badge';
}

/* ====== Agent Timeline Animation ====== */
function renderTimeline(traces) {
  const wrap = $('timelineWrap');
  wrap.innerHTML = '';

  if (!traces || traces.length === 0) {
    wrap.innerHTML = '<div class="timeline-placeholder"><div class="tp-icon">🎯</div><p>暂无 Agent 执行数据</p></div>';
    return;
  }

  traces.forEach((t, i) => {
    const agentInfo = AGENT_COLORS[t.agent] || { color: '#999', icon: '⚙️' };

    const item = el('div', 'tl-item');
    item.style.animationDelay = `${i * 0.3}s`;

    item.innerHTML = `
      <div class="tl-dot ${i === traces.length - 1 ? '' : ''}" style="background:${agentInfo.color}18; color:${agentInfo.color}">
        ${agentInfo.icon}
      </div>
      <div class="tl-body">
        <div class="tl-agent" style="color:${agentInfo.color}">${t.agent}</div>
        <div class="tl-action">${t.action}</div>
        <div class="tl-reasoning">${t.reasoning}</div>
        <div class="tl-meta">
          <span>🔤 ${(t.tokens || 0).toLocaleString()} tokens</span>
          <span>⏱ ${t.duration || '-'}</span>
        </div>
      </div>
    `;
    wrap.appendChild(item);
  });
}

function resetTimeline() {
  $('timelineWrap').innerHTML = '<div class="timeline-placeholder"><div class="tp-icon">🎯</div><p>选择场景查看 Agent 协作过程</p></div>';
}

/* ====== Trace Panel ====== */
function renderTrace(traces) {
  const list = $('traceList');
  list.innerHTML = '';

  if (!traces || traces.length === 0) return;

  traces.forEach((t, i) => {
    const agentInfo = AGENT_COLORS[t.agent] || { color: '#999', icon: '⚙️' };
    const item = el('div', 'tr-item');
    item.style.animationDelay = `${i * 0.1}s`;
    item.innerHTML = `
      <div class="tr-agent">
        <span class="tr-agent-dot" style="background:${agentInfo.color}"></span>
        ${t.agent}
      </div>
      <div class="tr-action">${t.action}</div>
      <div class="tr-reasoning" title="${(t.reasoning || '').replace(/"/g, '&quot;')}">${t.reasoning || ''}</div>
      <div class="tr-tokens">${(t.tokens || 0).toLocaleString()}</div>
      <div class="tr-time">${t.duration || '-'}</div>
    `;
    list.appendChild(item);
  });
}

function resetTrace() {
  $('traceList').innerHTML = '';
}

$('traceToggle').addEventListener('click', () => {
  $('tracePanel').classList.toggle('open');
});

/* ====== Custom Analysis (Real API) ====== */
$('customRun').addEventListener('click', startCustomAnalysis);
$('customInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') startCustomAnalysis();
});

async function startCustomAnalysis() {
  if (customRunning) return;

  const query = $('customInput').value.trim();
  if (!query) { $('customInput').focus(); return; }

  customRunning = true;
  const btn = $('customRun');
  btn.querySelector('.btn-text').textContent = '分析中...';
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  btn.disabled = true;

  $('statusBadge').textContent = 'RUNNING';
  $('statusBadge').className = 'panel-badge running';
  $('reportPlaceholder').style.display = 'none';
  $('reportContent').style.display = 'block';
  $('reportContent').innerHTML = '';

  const eventsDiv = el('div', 'live-events');
  $('reportContent').appendChild(eventsDiv);

  const addEvent = (icon, text, bg) => {
    const ev = el('div', 'live-event');
    ev.innerHTML = `
      <div class="le-icon" style="background:${bg || 'var(--accent-soft)'}">${icon}</div>
      <div class="le-text">${text}</div>
      <div class="le-time">${new Date().toLocaleTimeString()}</div>
    `;
    eventsDiv.appendChild(ev);
    $('reportArea').scrollTop = $('reportArea').scrollHeight;
  };

  addEvent('🚀', `创建分析任务：${query}`, 'var(--accent-soft)');

  resetTimeline();
  const simTraces = [
    { agent: 'Orchestrator', action: '解析需求', reasoning: `分析用户需求「${query.slice(0, 30)}...」，规划 DAG 执行计划`, tokens: 0, duration: '-' },
  ];
  renderTimeline(simTraces);

  try {
    const resp = await fetch(`${API_BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, use_demo: '' }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    addEvent('✅', `任务已创建：${data.task_id}`, 'var(--ok-soft)');
    await pollCustomTask(data.task_id, eventsDiv, addEvent);
  } catch (err) {
    addEvent('⚠️', `API 调用失败：${err.message}，使用演示数据`, 'var(--bad-soft)');
    await fallbackCustom(eventsDiv, addEvent);
  }

  finishCustom();
}

async function pollCustomTask(taskId, eventsDiv, addEvent) {
  let attempts = 0;
  const maxAttempts = 90;

  while (attempts < maxAttempts) {
    attempts++;
    await sleep(2000);

    try {
      const resp = await fetch(`${API_BASE}/api/tasks/${taskId}`);
      const data = await resp.json();

      if (data.status === 'completed' && data.report) {
        addEvent('📊', '报告生成完成！', 'var(--ok-soft)');
        eventsDiv.remove();

        $('reportContent').innerHTML = renderMarkdown(
          data.report.markdown_report || data.report.executive_summary || ''
        );

        const statsHtml = `
          <div class="report-stats">
            <div class="rs-item"><span class="rs-label">Tokens</span><span class="rs-value">${(data.report.total_tokens_used || 0).toLocaleString()}</span></div>
            <div class="rs-item"><span class="rs-label">竞品数</span><span class="rs-value">${(data.report.competitors || []).length}</span></div>
            <div class="rs-item"><span class="rs-label">耗时</span><span class="rs-value">${((data.report.total_duration_ms || 0) / 1000).toFixed(1)}s</span></div>
          </div>
        `;
        $('reportContent').insertAdjacentHTML('beforeend', statsHtml);
        $('statusBadge').textContent = 'DONE';
        $('statusBadge').className = 'panel-badge done';
        return;
      }

      if (data.status === 'failed') {
        addEvent('❌', '任务执行失败，使用演示数据', 'var(--bad-soft)');
        await fallbackCustom(eventsDiv, addEvent);
        return;
      }

      if (attempts % 3 === 0) {
        addEvent('⏳', `执行中... (${data.status})`, 'var(--warn-soft)');
      }
    } catch {
      break;
    }
  }

  addEvent('⏱', '等待超时，使用演示数据', 'var(--warn-soft)');
  await fallbackCustom(eventsDiv, addEvent);
}

async function fallbackCustom(eventsDiv, addEvent) {
  try {
    const resp = await fetch(`${API_BASE}/api/demos/ai-assistant`);
    if (resp.ok) {
      const data = await resp.json();
      addEvent('📋', '加载演示报告数据...', 'var(--accent-soft)');
      await sleep(500);
      eventsDiv.remove();

      const md = data.markdown_report || (data.cached_report && data.cached_report.markdown_report) || '';
      const traces = data.trace_data || (data.cached_report && data.cached_report.trace_data) || [];
      $('reportContent').innerHTML = renderMarkdown(md);
      renderTimeline(traces);
      renderTrace(traces);
      $('statusBadge').textContent = 'DEMO';
      $('statusBadge').className = 'panel-badge done';
      return;
    }
  } catch {}

  eventsDiv.remove();
  $('reportContent').innerHTML = '<p style="color:var(--fg3)">无法连接后端，请确认服务器运行中。</p>';
  $('statusBadge').textContent = 'OFFLINE';
  $('statusBadge').className = 'panel-badge';
}

function finishCustom() {
  customRunning = false;
  const btn = $('customRun');
  btn.querySelector('.btn-text').textContent = '开始分析';
  btn.querySelector('.btn-spinner').style.display = 'none';
  btn.disabled = false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ====== Auto-load from URL hash or first scenario ====== */
(() => {
  const hash = location.hash.replace('#', '');
  const validIds = ['ai-assistant', 'short-video', 'ai-coding', 'custom'];
  const targetId = validIds.includes(hash) ? hash : 'ai-assistant';

  document.querySelectorAll('.nav-tab').forEach(tab => {
    if (tab.dataset.id === targetId) {
      tab.click();
    }
  });
})();
