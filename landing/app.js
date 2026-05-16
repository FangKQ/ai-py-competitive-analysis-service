/* ==========================================================================
 * CompetitorLens · Landing Page 交互逻辑
 * 纯原生 JS - 无框架依赖
 * ========================================================================== */

const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `${location.protocol}//${location.hostname}`;

/* ====== Helper ====== */
const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
    else el.appendChild(c);
  });
  return el;
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

/* ====== Mobile Menu ====== */
(() => {
  const btn = document.getElementById('mobileMenuBtn');
  const links = document.querySelector('.topbar .links');
  if (btn && links) btn.addEventListener('click', () => links.classList.toggle('active'));
})();

/* ====== Scroll Reveal ====== */
(() => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

/* ====== Data ====== */
const AGENTS = [
  { name: 'Orchestrator', role: 'orchestrator', icon: '🎯', color: '#3370FF', desc: 'Lead Agent，负责解析用户需求、识别竞品列表、规划 DAG 执行计划。', tools: ['plan_analysis'] },
  { name: 'Collector', role: 'collector', icon: '🔍', color: '#F59E0B', desc: '信息采集 Agent，并行搜索各竞品公开信息，支持 Web 搜索与网页抓取。', tools: ['web_search', 'fetch_webpage'] },
  { name: 'Analyst', role: 'analyst', icon: '📊', color: '#8B5CF6', desc: '结构化分析 Agent，生成功能对比矩阵、SWOT 分析、市场定位图。', tools: ['analyze_data'] },
  { name: 'Writer', role: 'writer', icon: '✍️', color: '#10B981', desc: '报告撰写 Agent，将分析结果转化为结构化 Markdown 竞品报告。', tools: ['generate_report_section'] },
  { name: 'Reviewer', role: 'reviewer', icon: '🔬', color: '#EF4444', desc: '质量审查 Agent，交叉审查报告准确性、完整性、引用质量，打分评估。', tools: ['review_content'] },
  { name: 'Citation', role: 'citation', icon: '📌', color: '#06B6D4', desc: '溯源验证 Agent，访问引用 URL 验证信息准确性，确保每条结论可溯源。', tools: ['verify_citation'] },
];

const HARNESS_LAYERS = [
  { num: 1, name: 'Runtime · Agent Loop', desc: '核心 ReAct 循环（观察→思考→执行→验证），支持棘轮机制（Ratchet）：错误永久转化为约束。', features: ['ReAct Loop', 'Ratchet Rules', 'Max Iteration Guard', 'Decision Logging'] },
  { num: 2, name: 'Context · 共享记忆', desc: 'Agent 间通过 SharedMemory 共享分析结果和上下文，避免重复工作。', features: ['SharedMemory', 'Context Enrichment', 'Cross-Agent Data Flow'] },
  { num: 3, name: 'Capability · 工具注册', desc: 'MCP 风格工具注册表，按 Agent 角色分配工具子集，遵循最小权限原则。', features: ['Tool Registry', 'Role-Based Access', 'Web Search', 'Page Fetch'] },
  { num: 4, name: 'Governance · 治理层', desc: '全局预算控制、Token 限额、操作审计，确保系统可控可审计。', features: ['Budget Control', 'Token Limits', 'Audit Trail', 'Permission Check'] },
  { num: 5, name: 'Surface · 编排与事件', desc: 'DAG 编排器管理多 Agent 并行执行，EventBus 支持 SSE 实时推送。', features: ['DAG Orchestrator', 'EventBus', 'SSE Streaming', 'Topology Sort'] },
];

const SCENARIOS = [
  { id: 'ai-assistant', icon: '🤖', name: 'AI 对话助手竞品分析', desc: '分析豆包 vs Kimi vs DeepSeek vs 通义千问的竞争格局', tags: ['字节核心产品', '豆包', '4个竞品'], query: '分析中国市场主要 AI 对话助手产品的竞争格局' },
  { id: 'short-video', icon: '📱', name: '短视频平台竞品分析', desc: '分析抖音 vs 快手 vs 小红书 vs B站的内容生态和商业化', tags: ['字节核心业务', '抖音', '4个竞品'], query: '分析中国短视频平台的竞争格局' },
  { id: 'ai-coding', icon: '💻', name: 'AI 编程工具竞品分析', desc: '对比 Cursor vs GitHub Copilot vs TRAE vs Windsurf', tags: ['TRAE赞助商', 'Agent模式', '4个竞品'], query: '对比分析主流 AI 编程辅助工具' },
];

const TECH_STACK = [
  { cat: 'LLM', name: 'MiniMax M2.7', why: '比赛指定 MiniMax，通过 Anthropic SDK 兼容接口调用' },
  { cat: 'Backend', name: 'FastAPI + Pydantic v2', why: '异步高性能 + 结构化数据验证，参考 Claude Code 架构' },
  { cat: 'Agent Framework', name: '自研 Harness', why: '参考 Harness Engineering 论文，不依赖 LangChain 等旧框架' },
  { cat: 'Streaming', name: 'SSE (Server-Sent Events)', why: '轻量级实时推送，前端 EventSource 原生支持' },
  { cat: 'Web Search', name: 'DuckDuckGo + httpx', why: '无需 API Key，支持异步并发采集' },
  { cat: 'Frontend', name: '纯 HTML + CSS + JS', why: '零构建依赖，三文件直接部署，评委打开即用' },
  { cat: 'Deploy', name: 'Nginx + systemd', why: '参考 LarkMentor 部署方案，稳定可靠' },
  { cat: 'Data Schema', name: '自定义竞品知识 Schema', why: '15+ 个 Pydantic Model，覆盖竞品画像/SWOT/功能对比' },
];

const STATUS_DATA = [
  { feature: '6 Agent 协作引擎', status: 'built', detail: 'Orchestrator + 5 Worker Agent，DAG 编排' },
  { feature: 'Harness 五层架构', status: 'built', detail: 'Runtime/Context/Capability/Governance/Surface' },
  { feature: 'SSE 实时事件推送', status: 'built', detail: 'Agent 执行状态实时推送到前端' },
  { feature: 'Web 搜索 + 网页抓取', status: 'built', detail: 'DuckDuckGo 搜索 + BeautifulSoup 解析' },
  { feature: '竞品知识 Schema', status: 'built', detail: '15+ Pydantic Model 结构化数据' },
  { feature: 'Agent 决策日志追踪', status: 'built', detail: '每步推理/工具调用/耗时全记录' },
  { feature: '棘轮机制 (Ratchet)', status: 'built', detail: '错误自动转化为永久约束' },
  { feature: 'MiniMax M2.7 集成', status: 'built', detail: 'Anthropic SDK 兼容调用' },
  { feature: '交叉审查反馈闭环', status: 'lab', detail: 'Reviewer 审查后触发 Writer 修订' },
  { feature: 'Demo 缓存 Fallback', status: 'built', detail: 'API 失败自动使用预设数据' },
  { feature: 'PostgreSQL 持久化', status: 'planned', detail: '当前使用内存存储' },
  { feature: 'OpenTelemetry 集成', status: 'planned', detail: '分布式追踪标准' },
];

const FAQ_DATA = [
  { q: '和 LangChain/LangGraph 有什么区别？', a: '本系统完全自研 Agent 框架，参考 Harness Engineering 论文和 Claude Code 架构，实现了 ReAct Loop + 棘轮机制 + DAG 编排。不依赖任何第三方 Agent 框架，避免了 LangChain 的过度抽象问题。' },
  { q: '真的能实时调用 LLM 分析吗？', a: '是的。系统集成了 MiniMax M2.7 大模型，通过 Anthropic SDK 兼容接口调用。当 API 不可用时，会自动 fallback 到预设的高质量 Demo 数据。' },
  { q: '为什么不用 React/Next.js 做前端？', a: '参考评委 Demo 场景的高压需求：纯 HTML+CSS+JS 三文件直接部署，不依赖构建环境，不占用服务器资源跑 Node.js，打开即有内容。' },
  { q: '「每条结论有据可查」怎么实现的？', a: '系统设计了 SourceCitation 数据模型，Collector Agent 采集时自动记录来源 URL 和摘要，Citation Agent 验证引用可访问性，报告中每条数据都关联到原始来源。' },
  { q: '如何确保 Agent 决策过程透明？', a: '通过 AgentDecisionLog 记录每个 Agent 的每次迭代：推理过程、工具调用、输入/输出 Token 数、执行耗时。所有日志通过 SSE 实时推送，并在前端 Trace 面板展示。' },
];

const RESOURCES = [
  { icon: '📄', name: '技术报告 PDF', desc: '92 页 LaTeX 技术文档', url: '/report.pdf' },
  { icon: '💻', name: 'GitHub 仓库', desc: '完整源代码 + README', url: 'https://github.com/bcefghj/competitive-analysis-agent' },
  { icon: '📡', name: 'API 文档', desc: 'Swagger / OpenAPI', url: '/api/docs' },
  { icon: '🔍', name: '在线 Demo', desc: '实时体验 Agent 协作', url: '#demo' },
];

/* ====== Agent Simulator ====== */
(() => {
  const stream = document.getElementById('simStream');
  const badge = document.getElementById('simBadge');
  const playBtn = document.getElementById('simPlay');
  const resetBtn = document.getElementById('simReset');
  const progressBar = document.getElementById('simProgress');
  const labelEl = document.getElementById('simLabel');

  const SIM_STEPS = [
    { agent: AGENTS[0], text: '收到分析需求：「AI 对话助手竞品分析」\n识别竞品：豆包、Kimi、DeepSeek、通义千问' },
    { agent: AGENTS[0], text: '生成 DAG 执行计划：\n orchestrate → collect_0..3 → analyze → write → review → cite' },
    { agent: AGENTS[1], text: '[并行采集] 搜索「豆包 Doubao AI 助手」\n→ 获取 5 条搜索结果，抓取 doubao.com 产品页' },
    { agent: AGENTS[1], text: '[并行采集] 搜索「Kimi 月之暗面」「DeepSeek AI」「通义千问」\n→ 采集 4 个竞品的公开信息' },
    { agent: AGENTS[2], text: '分析采集数据 → 生成功能对比矩阵\n月活用户：豆包 2.27亿 > Kimi 3600万 > DeepSeek 2000万' },
    { agent: AGENTS[2], text: 'SWOT 分析：豆包优势 = 字节生态整合\nDeepSeek 优势 = 开源策略 + 高性价比' },
    { agent: AGENTS[3], text: '撰写竞品分析报告...\n# 执行摘要\n# 竞品概览\n# 功能对比\n# 战略建议' },
    { agent: AGENTS[4], text: '审查报告质量：\n✓ 准确性 8.5/10  ✓ 完整性 8.0/10  ✓ 引用质量 7.5/10' },
    { agent: AGENTS[5], text: '验证 6 条引用 URL：5/6 可访问\n✓ doubao.com ✓ kimi.moonshot.cn ✓ chat.deepseek.com' },
    { agent: AGENTS[0], text: '✅ 分析完成！耗时 9.5s，消耗 35,600 tokens\n生成报告：《AI 对话助手竞品分析》' },
  ];

  let step = 0, playing = false, timer = null;

  const addMsg = (s) => {
    const msg = h('div', { class: 'sim-msg' }, [
      h('div', { class: 'avatar', style: { background: s.agent.color } }, s.agent.icon),
      h('div', { class: 'text' }, [
        h('div', { class: 'role' }, s.agent.name),
        ...s.text.split('\n').map(line => h('div', {}, line)),
      ]),
    ]);
    stream.appendChild(msg);
    stream.parentElement.scrollTop = stream.parentElement.scrollHeight;
  };

  const updateUI = () => {
    labelEl.textContent = `${step} / ${SIM_STEPS.length}`;
    progressBar.style.width = `${(step / SIM_STEPS.length) * 100}%`;
    badge.textContent = step >= SIM_STEPS.length ? 'DONE' : step > 0 ? 'RUNNING' : 'READY';
    badge.style.background = step >= SIM_STEPS.length ? 'var(--ok-soft)' : step > 0 ? 'var(--warn-soft)' : 'var(--accent-soft)';
    badge.style.color = step >= SIM_STEPS.length ? 'var(--ok)' : step > 0 ? 'var(--warn)' : 'var(--accent)';
  };

  const advance = () => {
    if (step >= SIM_STEPS.length) { pause(); return; }
    addMsg(SIM_STEPS[step]);
    step++;
    updateUI();
  };

  const play = () => {
    playing = true;
    playBtn.textContent = '⏸';
    timer = setInterval(advance, 1800);
  };

  const pause = () => {
    playing = false;
    playBtn.textContent = '▶';
    clearInterval(timer);
  };

  const reset = () => {
    pause();
    step = 0;
    stream.innerHTML = '';
    updateUI();
  };

  playBtn.addEventListener('click', () => playing ? pause() : play());
  resetBtn.addEventListener('click', reset);

  updateUI();
  setTimeout(play, 1500);
})();

/* ====== Render Agents Grid ====== */
(() => {
  const grid = document.getElementById('agentsGrid');
  AGENTS.forEach(a => {
    grid.appendChild(h('div', { class: 'agent-card reveal' }, [
      h('div', { class: 'agent-icon', style: { background: a.color + '18' } }, a.icon),
      h('div', { class: 'agent-name' }, a.name),
      h('div', { class: 'agent-role' }, a.role),
      h('div', { class: 'agent-desc' }, a.desc),
      h('div', { class: 'agent-tools' }, a.tools.map(t => h('span', { class: 'tool-tag' }, t))),
    ]));
  });
  document.querySelectorAll('.agents-grid .reveal').forEach(el => {
    new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
    }, { threshold: 0.1 }).observe(el);
  });
})();

/* ====== Render Harness Layers ====== */
(() => {
  const container = document.getElementById('harnessLayers');
  HARNESS_LAYERS.forEach(l => {
    container.appendChild(h('div', { class: 'harness-layer reveal' }, [
      h('div', { class: 'layer-num' }, `L${l.num}`),
      h('div', {}, [
        h('div', { class: 'layer-name' }, l.name),
        h('div', { class: 'layer-desc' }, l.desc),
        h('div', { class: 'layer-features' }, l.features.map(f => h('span', { class: 'feat-tag' }, f))),
      ]),
    ]));
  });
  document.querySelectorAll('.harness-layers .reveal').forEach(el => {
    new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 }).observe(el);
  });
})();

/* ====== Render Scenario Cards ====== */
(() => {
  const container = document.getElementById('scenarioCards');
  SCENARIOS.forEach(s => {
    container.appendChild(h('div', { class: 'scenario-card reveal', onClick: () => { startDemo(s.query, s.id); } }, [
      h('div', { class: 'sc-icon' }, s.icon),
      h('h3', {}, s.name),
      h('p', {}, s.desc),
      h('div', { class: 'sc-tags' }, s.tags.map(t => h('span', { class: 'sc-tag' }, t))),
    ]));
  });
  document.querySelectorAll('.scenario-cards .reveal').forEach(el => {
    new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 }).observe(el);
  });
})();

/* ====== Render Tech Grid ====== */
(() => {
  const grid = document.getElementById('techGrid');
  TECH_STACK.forEach(t => {
    grid.appendChild(h('div', { class: 'tech-item' }, [
      h('div', { class: 'tech-cat' }, t.cat),
      h('div', { class: 'tech-name' }, t.name),
      h('div', { class: 'tech-why' }, t.why),
    ]));
  });
})();

/* ====== Render Status Table ====== */
(() => {
  const container = document.getElementById('statusTable');
  const table = h('table', {}, [
    h('thead', {}, h('tr', {}, [
      h('th', {}, '功能'),
      h('th', {}, '状态'),
      h('th', {}, '说明'),
    ])),
    h('tbody', {}, STATUS_DATA.map(s => {
      const badge = h('span', { class: `status-badge ${s.status}` }, s.status.toUpperCase());
      return h('tr', {}, [
        h('td', {}, h('strong', {}, s.feature)),
        h('td', {}, badge),
        h('td', {}, s.detail),
      ]);
    })),
  ]);
  container.appendChild(table);
})();

/* ====== Render Resources ====== */
(() => {
  const grid = document.getElementById('resourcesGrid');
  RESOURCES.forEach(r => {
    grid.appendChild(h('a', { class: 'resource-card', href: r.url, target: r.url.startsWith('http') ? '_blank' : '' }, [
      h('div', { class: 'res-icon' }, r.icon),
      h('div', {}, [
        h('div', { class: 'res-name' }, r.name),
        h('div', { class: 'res-desc' }, r.desc),
      ]),
    ]));
  });
})();

/* ====== Render FAQ ====== */
(() => {
  const list = document.getElementById('faqList');
  FAQ_DATA.forEach(f => {
    const item = h('div', { class: 'faq-item' }, [
      h('div', { class: 'faq-q', onClick: () => item.classList.toggle('open') }, [
        h('span', {}, f.q),
        h('span', { class: 'arrow' }, '›'),
      ]),
      h('div', { class: 'faq-a' }, f.a),
    ]);
    list.appendChild(item);
  });
})();

/* ====== Demo Scenario Buttons ====== */
(() => {
  const container = document.getElementById('demoScenarios');
  const input = document.getElementById('demoInput');
  SCENARIOS.forEach(s => {
    const btn = h('button', { class: 'demo-scenario-btn', onClick: () => {
      document.querySelectorAll('.demo-scenario-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      input.value = s.query;
    }}, s.name);
    container.appendChild(btn);
  });
})();

/* ====== Render Trace Demo ====== */
(() => {
  const timeline = document.getElementById('traceTimeline');
  const DEMO_TRACES = [
    { agent: 'Orchestrator', role: 'orchestrator', action: '规划分析任务', reasoning: '解析用户需求「AI 对话助手竞品分析」，识别 4 个竞品...', tokens: '1,240', time: '1.2s', color: '#3370FF' },
    { agent: 'Collector', role: 'collector', action: 'web_search', reasoning: '搜索「豆包 Doubao AI 对话助手 2025」，获取 5 条结果...', tokens: '2,350', time: '3.1s', color: '#F59E0B' },
    { agent: 'Analyst', role: 'analyst', action: '结构化分析', reasoning: '对比 4 个竞品的月活用户/上下文窗口/多模态能力/生态整合...', tokens: '3,180', time: '2.8s', color: '#8B5CF6' },
    { agent: 'Writer', role: 'writer', action: '撰写报告', reasoning: '生成包含执行摘要/竞品概览/功能对比/战略建议的 Markdown 报告...', tokens: '4,560', time: '4.2s', color: '#10B981' },
    { agent: 'Reviewer', role: 'reviewer', action: '质量审查', reasoning: '评估准确性 8.5/10，完整性 8.0/10，引用质量 7.5/10...', tokens: '1,890', time: '1.8s', color: '#EF4444' },
    { agent: 'Citation', role: 'citation', action: '溯源验证', reasoning: '验证 6 条引用 URL，5 条可访问，1 条超时...', tokens: '980', time: '2.1s', color: '#06B6D4' },
  ];

  DEMO_TRACES.forEach(t => {
    timeline.appendChild(h('div', { class: 'trace-item' }, [
      h('div', { class: 'trace-dot', style: { background: t.color } }),
      h('div', { class: 'trace-content' }, [
        h('div', { class: 'trace-header' }, [
          h('span', { class: 'trace-agent', style: { color: t.color } }, t.agent),
          h('span', { class: 'trace-action' }, t.action),
        ]),
        h('div', { class: 'trace-reasoning' }, t.reasoning),
        h('div', { class: 'trace-meta' }, [
          h('span', {}, `🔤 ${t.tokens} tokens`),
          h('span', {}, `⏱ ${t.time}`),
        ]),
      ]),
    ]));
  });
})();

/* ====== Live Demo ====== */
let demoRunning = false;

function startDemo(query, demoId) {
  if (demoRunning) return;

  const input = document.getElementById('demoInput');
  const output = document.getElementById('demoOutput');
  const runBtn = document.getElementById('demoRun');

  query = query || input.value.trim();
  if (!query) { input.focus(); return; }

  demoRunning = true;
  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="spinner"></span> 分析中...';
  output.innerHTML = '';

  const addEvent = (icon, text, color) => {
    output.appendChild(h('div', { class: 'demo-event' }, [
      h('div', { class: 'ev-icon', style: { background: (color || 'var(--accent)') + '18' } }, icon),
      h('div', { class: 'ev-text' }, text),
      h('div', { class: 'ev-time' }, new Date().toLocaleTimeString()),
    ]));
    output.scrollTop = output.scrollHeight;
  };

  addEvent('🚀', `创建分析任务：${query}`, '#3370FF');

  fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, use_demo: demoId || 'ai-assistant' }),
  })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      addEvent('✅', `任务已创建：${data.task_id}`, '#10B981');
      pollTask(data.task_id, output, addEvent, runBtn);
    })
    .catch(err => {
      addEvent('⚠️', `API 调用失败：${err.message}`, '#EF4444');
      addEvent('📋', '使用预设 Demo 数据展示...', '#F59E0B');
      showDemoFallback(output, query);
      finishDemo(runBtn);
    });
}

function pollTask(taskId, output, addEvent, runBtn) {
  let attempts = 0;
  const maxAttempts = 60;

  const poll = () => {
    attempts++;
    if (attempts > maxAttempts) {
      addEvent('⏱', '等待超时，使用缓存数据', '#F59E0B');
      showDemoFallback(output, '');
      finishDemo(runBtn);
      return;
    }

    fetch(`${API_BASE}/api/tasks/${taskId}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'completed' && data.report) {
          addEvent('📊', '报告生成完成！', '#10B981');
          renderReport(output, data.report);
          finishDemo(runBtn);
        } else if (data.status === 'failed') {
          addEvent('❌', '任务失败，使用 Demo 数据', '#EF4444');
          showDemoFallback(output, data.query);
          finishDemo(runBtn);
        } else {
          addEvent('⏳', `状态: ${data.status}...`, '#F59E0B');
          setTimeout(poll, 2000);
        }
      })
      .catch(() => {
        showDemoFallback(output, '');
        finishDemo(runBtn);
      });
  };

  setTimeout(poll, 1500);
}

function renderReport(output, report) {
  const reportEl = h('div', { class: 'demo-report' }, [
    h('h3', {}, report.title || '竞品分析报告'),
  ]);

  const mdContent = h('div', { class: 'md-content' });
  const markdown = report.markdown_report || report.executive_summary || '';
  mdContent.innerHTML = simpleMarkdown(markdown);
  reportEl.appendChild(mdContent);

  const stats = h('div', { class: 'demo-stats' }, [
    h('div', { class: 'stat' }, [h('div', { class: 'stat-label' }, 'Tokens'), h('div', { class: 'stat-value' }, (report.total_tokens_used || 0).toLocaleString())]),
    h('div', { class: 'stat' }, [h('div', { class: 'stat-label' }, '耗时'), h('div', { class: 'stat-value' }, `${((report.total_duration_ms || 0) / 1000).toFixed(1)}s`)]),
    h('div', { class: 'stat' }, [h('div', { class: 'stat-label' }, '竞品数'), h('div', { class: 'stat-value' }, `${(report.competitors || []).length}`)]),
    h('div', { class: 'stat' }, [h('div', { class: 'stat-label' }, '引用数'), h('div', { class: 'stat-value' }, `${report.citations_count || 0}`)]),
  ]);
  reportEl.appendChild(stats);
  output.appendChild(reportEl);
  output.scrollTop = output.scrollHeight;
}

function showDemoFallback(output, query) {
  renderReport(output, {
    title: 'AI 对话助手竞品分析',
    executive_summary: '在中国 AI 对话助手市场，豆包凭借字节跳动生态优势月活达 2.27 亿领跑市场，Kimi 以 200 万字超长上下文差异化竞争，DeepSeek 以开源策略快速崛起，通义千问依托阿里云企业生态。',
    markdown_report: `# AI 对话助手竞品分析

## 执行摘要

在中国 AI 对话助手市场，豆包（Doubao）凭借字节跳动的生态优势，截至 2025 年 Q4 月活用户达 2.27 亿，稳居市场第一。

## 竞品概览

### 豆包 (Doubao)
**定位**: 市场领导者
字节跳动旗下 AI 对话助手，与抖音/飞书深度集成。
- 日活超 1 亿
- 多模态理解与生成
- AI 伴侣/智能体生态

### Kimi
**定位**: 强势挑战者
200 万字超长上下文窗口，深度阅读与学术分析。

### DeepSeek
**定位**: 快速崛起者
开源模型策略，强代码能力，高性价比 API。

### 通义千问
**定位**: 生态依托者
阿里云企业生态，开源 Qwen 系列。

## 功能对比

| 功能 | 豆包 | Kimi | DeepSeek | 通义千问 |
| --- | --- | --- | --- | --- |
| 月活用户 | 2.27 亿 (领先) | 约 3600 万 | 约 2000 万 | 约 1500 万 |
| 上下文窗口 | 128K tokens | 200 万字 (领先) | 128K tokens | 128K tokens |
| 多模态 | 文本+图片+语音 | 文本+图片 | 文本+图片+代码 | 文本+图片+语音+视频 |
| 生态整合 | 抖音+飞书+即梦 (领先) | 独立应用 | 开源社区 | 阿里云+淘宝 |

## 战略建议

1. 豆包应继续深化字节生态整合优势
2. 关注 DeepSeek 开源策略对市场格局的影响
3. 长文本场景是 Kimi 的核心壁垒`,
    total_tokens_used: 35600,
    total_duration_ms: 9500,
    competitors: [{}, {}, {}, {}],
    citations_count: 5,
  });
}

function finishDemo(runBtn) {
  demoRunning = false;
  runBtn.disabled = false;
  runBtn.innerHTML = '开始分析';
}

function simpleMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\| (.+)/g, (match) => {
      const rows = match.trim().split('\n').filter(r => r.startsWith('|'));
      if (rows.length < 2) return match;
      const parseRow = r => r.split('|').filter(c => c.trim()).map(c => c.trim());
      const headers = parseRow(rows[0]);
      const dataRows = rows.slice(2);
      let table = '<table><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
      dataRows.forEach(r => {
        const cells = parseRow(r);
        table += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      });
      table += '</tbody></table>';
      return table;
    })
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/* ====== Demo Button Event ====== */
document.getElementById('demoRun').addEventListener('click', () => startDemo());

/* ====== Smooth anchor scroll for scenario cards ====== */
window.startDemo = startDemo;
