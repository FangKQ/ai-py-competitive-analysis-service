<div align="center">

# 🔍 CompetitorLens

### AI 驱动的竞品分析 Agent 协作系统

**6 Agent 协同 · DAG 任务编排 · Harness 五层架构 · 全程溯源可观测**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12+-3776AB.svg)](https://python.org)
[![MiniMax M2.7](https://img.shields.io/badge/Model-MiniMax_M2.7-FF6B35.svg)](https://platform.minimax.io)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)

[🌐 项目介绍](http://101.37.125.37) · [🔍 在线 Demo](http://101.37.125.37/demo.html) · [📄 技术报告 PDF](http://101.37.125.37/report.pdf) · [📡 API 文档](http://101.37.125.37/docs)

</div>

---

## 🏆 比赛信息

| 项目 | 信息 |
|------|------|
| **赛事** | 2026 字节 AI 全栈挑战赛 |
| **课题** | 课题三：AI 驱动的竞品分析 Agent 协作系统 |
| **参赛者** | 戴尚好 |
| **学校** | 中国科学技术大学 |
| **GitHub** | [bcefghj](https://github.com/bcefghj) |
| **邮箱** | bcefghj@163.com |
| **个人主页** | [bcefghj.github.io](https://bcefghj.github.io/) |

---

## 📖 项目简介

**CompetitorLens** 是一个基于多 Agent 协作的智能竞品分析系统。系统通过 6 个专职 Agent 协同工作，自动完成从公开信息采集到结构化竞品报告输出的全链路分析。

### 解决的核心痛点

| 传统竞品分析 | CompetitorLens |
|-------------|----------------|
| ❌ 信息分散在 10+ 平台 | ✅ Collector Agent 自动并行采集 |
| ❌ 人工整理耗时数天 | ✅ 6 Agent 协作数分钟完成 |
| ❌ 结论无溯源，不可验证 | ✅ Citation Agent 逐条验证引用 |
| ❌ 分析质量依赖个人经验 | ✅ Reviewer Agent 多维评分审查 |
| ❌ 过程黑箱，不透明 | ✅ Agent 决策日志实时可追踪 |

### 核心特性

- 🎯 **6 个专职 Agent** — Orchestrator / Collector / Analyst / Writer / Reviewer / Citation
- 📐 **DAG 式任务编排** — 有向无环图驱动的任务流转，支持并行采集与串行分析
- ⚙️ **Harness 五层架构** — 参考 [Harness Engineering](https://arxiv.org/pdf/2604.21003) 论文
- 🔗 **全程溯源** — 每条结论标注来源 URL，Citation Agent 独立验证
- 👁️ **完全可观测** — Agent 决策日志实时追踪，SSE 流式推送
- 🔧 **棘轮机制 (Ratchet)** — 错误永久转化为约束，防止重复犯错

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│              Landing Page (纯 HTML + CSS + JS)                    │
│  ┌────────────┐ ┌─────────────┐ ┌─────────┐ ┌───────────────┐  │
│  │ Agent 模拟器│ │ Live Demo   │ │ Traces  │ │ 报告展示      │  │
│  └────────────┘ └─────────────┘ └─────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│              API 层 (FastAPI + SSE 实时流式)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐                                                │
│   │ Orchestrator │──┬──→ [Collector A] ──┐                       │
│   │  (Lead Agent)│  │                    │                       │
│   └─────────────┘  ├──→ [Collector B] ──┤                       │
│                     └──→ [Collector C] ──┤                       │
│                                          ▼                       │
│                                    [Analyst] ──→ [Writer]        │
│                                                    │             │
│                                              [Reviewer] ←─ 审查  │
│                                                    │     闭环    │
│                                              [Citation] ─→ 溯源  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                  Harness 五层工程化基础设施                        │
│  L1 Runtime  │ L2 Context │ L3 Capability │ L4 Governance│ L5 DAG│
│  (ReAct Loop)│ (SharedMem)│ (Tool Reg.)   │ (Budget/Audit)│(Event)│
└─────────────────────────────────────────────────────────────────┘
```

### 架构参考标杆

| 标杆 | 参考要点 |
|------|---------|
| [Anthropic Multi-Agent Research](https://www.anthropic.com/engineering/multi-agent-research-system) | Orchestrator-Worker 模式，Lead Agent + 并行 Subagent |
| [Claude Code Architecture](https://medium.com/@devikanekkalapu7/inside-claude-codes-multi-agent-architecture-17cc162d5d7c) | ReAct Loop + Specialist Agents + Shared Task System |
| [Harness Engineering](https://arxiv.org/pdf/2604.21003) | Agent = Model + Harness 范式，五层模型，棘轮机制 |
| [Google ADK GraphAgent](https://github.com/google/adk-python) | DAG 有向图编排，拓扑排序 + 并行执行 |

---

## 🚀 快速开始

### 环境要求

- Python 3.12+
- MiniMax API Key（[申请地址](https://platform.minimax.io)）

### 本地开发

```bash
# 1. 克隆项目
git clone https://github.com/bcefghj/competitive-analysis-agent.git
cd competitive-analysis-agent

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env 填入 MiniMax API Key

# 3. 安装后端依赖
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 4. 启动后端
uvicorn main:app --reload --port 8000

# 5. 打开 Landing Page
# 直接浏览器打开 landing/index.html
# 或用 python -m http.server 8080 -d ../landing
```

### 服务器部署

```bash
# 上传文件
scp -r backend landing nginx.conf root@your-server:/opt/competitive-analysis-agent/

# 在服务器上
cd /opt/competitive-analysis-agent/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 配置 Nginx
cp nginx.conf /etc/nginx/sites-available/competitive-analysis
ln -s /etc/nginx/sites-available/competitive-analysis /etc/nginx/sites-enabled/
systemctl restart nginx

# 启动后端
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 📊 Demo 场景

三个场景均与字节业务直接关联，均有**预跑的完整分析报告**，点击即开：

| 场景 | 竞品 | 字节关联 | Demo 链接 |
|------|------|---------|----------|
| 🤖 **AI 对话助手** | 豆包 vs Kimi vs DeepSeek vs 通义千问 | 字节核心 AI 产品 | [查看报告](http://101.37.125.37/demo.html#ai-assistant) |
| 📱 **短视频平台** | 抖音 vs 快手 vs 小红书 vs B站 | 字节核心业务 | [查看报告](http://101.37.125.37/demo.html#short-video) |
| 💻 **AI 编程工具** | Cursor vs Copilot vs TRAE vs Windsurf | 比赛赞助商 TRAE | [查看报告](http://101.37.125.37/demo.html#ai-coding) |

**评委在线使用**：也可点击 [自定义分析](http://101.37.125.37/demo.html#custom) 输入任意竞品分析需求，系统将调用 MiniMax M2.7 实时分析。

---

## 🛠️ 技术栈

| 层级 | 技术 | 选型依据 |
|------|------|---------|
| LLM | MiniMax M2.7 | 比赛指定，Anthropic SDK 兼容接口 |
| 后端 | FastAPI + Pydantic v2 | 异步高性能 + 结构化数据验证 |
| Agent Framework | 自研 Harness 框架 | 参考 Harness Engineering 论文，不依赖 LangChain |
| 工具层 | httpx + BeautifulSoup | Web 搜索 + 网页抓取，MCP 风格注册 |
| 实时推送 | SSE (Server-Sent Events) | 轻量级，前端 EventSource 原生支持 |
| 前端 | 纯 HTML + CSS + JS | 零构建依赖，三文件直接部署 |
| 数据模型 | 15+ Pydantic Models | 自定义竞品知识 Schema |
| 部署 | Nginx + systemd | 稳定可靠，参考 LarkMentor 部署方案 |

---

## 📁 项目结构

```
competitive-analysis-agent/
├── backend/
│   ├── agents/             # 6 个 Agent 实现
│   │   ├── __init__.py     # CompetitiveAnalysisEngine 核心引擎
│   │   ├── base.py         # BaseAgent 基类（整合 Harness 五层）
│   │   └── prompts.py      # 6 个 Agent 的 System Prompt
│   ├── harness/            # Harness 五层架构
│   │   ├── runtime.py      # L1: ReAct Loop + 棘轮机制 (Ratchet)
│   │   ├── context.py      # L2: SharedMemory 共享记忆
│   │   ├── capability.py   # L3: MCP 风格工具注册表
│   │   ├── governance.py   # L4: Budget/Token 治理 + 审计
│   │   └── surface.py      # L5: DAG 编排 + EventBus
│   ├── schemas/            # 竞品知识 Schema (15+ Models)
│   ├── api/                # FastAPI 路由
│   ├── examples/           # 预置 Demo 缓存数据
│   ├── config.py           # 配置管理 (pydantic-settings)
│   ├── main.py             # FastAPI 入口
│   └── requirements.txt    # Python 依赖
├── landing/                # 项目介绍 + Demo 交互页
│   ├── index.html          # 12 章节叙事弧（介绍页）
│   ├── demo.html           # 独立 Demo 体验页（双面板）
│   ├── style.css           # 介绍页样式（双主题 + 动画）
│   ├── demo.css            # Demo 页样式（Agent 时间线 + 报告渲染）
│   ├── app.js              # 介绍页 JS（Agent 模拟器）
│   └── demo.js             # Demo 页 JS（Markdown 渲染器 + 实时分析）
├── docs/report/            # LaTeX 技术报告
│   └── main.tex            # 50+ 页技术文档
├── examples/               # 预置 Demo 场景数据
├── nginx.conf              # Nginx 部署配置
└── README.md
```

---

## 📝 API 文档

在线文档: [http://101.37.125.37/docs](http://101.37.125.37/docs)

### 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tasks` | 创建竞品分析任务 |
| GET | `/api/tasks/{id}` | 获取任务状态与报告 |
| GET | `/api/tasks/{id}/report` | 获取完整 Markdown 报告 |
| GET | `/api/tasks/{id}/traces` | 获取 Agent 决策追踪日志 |
| GET | `/api/tasks/{id}/events` | SSE 实时事件流 |
| GET | `/api/demos` | 预置 Demo 场景列表 |
| GET | `/api/health` | 健康检查 |

### 快速体验

```bash
# 创建分析任务
curl -X POST http://101.37.125.37/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"query": "分析 AI 对话助手市场竞争格局", "use_demo": "ai-assistant"}'

# 查看结果
curl http://101.37.125.37/api/tasks/{task_id}
```

---

## ✅ Honest Status

| 功能 | 状态 | 说明 |
|------|------|------|
| 6 Agent 协作引擎 | ✅ Built | Orchestrator + 5 Worker Agent |
| Harness 五层架构 | ✅ Built | Runtime/Context/Capability/Governance/Surface |
| SSE 实时事件推送 | ✅ Built | Agent 执行状态实时推送 |
| Web 搜索 + 网页抓取 | ✅ Built | DuckDuckGo + BeautifulSoup |
| 竞品知识 Schema | ✅ Built | 15+ Pydantic Model |
| Agent 决策日志追踪 | ✅ Built | 每步推理/工具调用全记录 |
| 棘轮机制 (Ratchet) | ✅ Built | 错误→约束自动转化 |
| MiniMax M2.7 集成 | ✅ Built | Anthropic SDK 兼容调用 |
| Demo Fallback | ✅ Built | API 失败自动使用缓存数据 |
| 交叉审查反馈闭环 | 🧪 Lab | Reviewer → Writer 修订循环 |
| PostgreSQL 持久化 | 📋 Planned | 当前使用内存存储 |

---

## 📄 技术报告

完整的 50+ 页 LaTeX 技术报告，涵盖：

- 系统架构设计与技术选型论证
- 多 Agent 协作机制深度分析
- Harness Engineering 五层模型实现
- 竞品知识 Schema 设计
- 实验评估与消融实验
- 部署架构与运维
- 与字节业务结合分析

📥 [下载 PDF](http://101.37.125.37/report.pdf)

---

## 📜 License

[MIT License](LICENSE)

---

<div align="center">

**CompetitorLens** — AI 驱动的竞品分析 Agent 协作系统

Built by 戴尚好 · 中国科学技术大学 · 2026 字节 AI 全栈挑战赛

Powered by MiniMax M2.7 + FastAPI + Harness Engineering

</div>
