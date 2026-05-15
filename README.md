<div align="center">

# 🔍 CompetitorScope

### AI 驱动的竞品分析 Agent 协作系统

**多 Agent 协同 · DAG 任务编排 · 全程溯源可观测**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12+-3776AB.svg)](https://python.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://typescriptlang.org)
[![MiniMax M2.7](https://img.shields.io/badge/Model-MiniMax_M2.7-FF6B35.svg)](https://platform.minimax.io)

[在线 Demo](http://101.37.125.37) · [技术报告 PDF](docs/report/report.pdf) · [API 文档](http://101.37.125.37:8000/docs)

</div>

---

## 📖 项目简介

**CompetitorScope** 是一个基于多 Agent 协作的智能竞品分析系统，模拟真实的数字调研小组，通过 6 个专职 Agent 的协同，自动完成从公开信息采集到结构化竞品报告输出的全链路工作。

本项目为 **字节 AI 全栈挑战赛 2026** 课题三「AI 驱动的竞品分析 Agent 协作系统」的参赛作品。

### 核心亮点

- 🎯 **6 个专职 Agent** — Orchestrator / Collector / Analyst / Writer / Reviewer / Citation，各司其职
- 📐 **DAG 式任务编排** — 有向无环图驱动的任务流转，支持并行采集与串行分析
- 🔄 **交叉审查闭环** — Reviewer Agent 多维评分，未达标自动触发修订循环
- 🔗 **全程溯源** — 每条结论标注来源 URL，Citation Agent 独立验证引用有效性
- 👁️ **完全可观测** — Agent 决策日志实时追踪，SSE 流式推送执行状态
- ⚙️ **Harness 五层架构** — Runtime / Context / Capability / Governance / Surface

---

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    用户界面 (React 19 + TypeScript)                │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────┐  │
│  │ 任务创建面板 │ │ DAG 可视化   │ │ Trace 面板│ │ 报告展示   │  │
│  └─────────────┘ └──────────────┘ └───────────┘ └────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                    API 层 (FastAPI + SSE 流式)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐                                                │
│   │ Orchestrator │──┬──→ [Collector A] ──┐                       │
│   │  (Lead Agent)│  │                    │                       │
│   └─────────────┘  └──→ [Collector B] ──┤                       │
│                                          ▼                       │
│                                    [Analyst] ──→ [Writer]        │
│                                                    │             │
│                                              [Reviewer] ←──┐    │
│                                                    │        │    │
│                                              [Citation] ────┘    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                  Harness 五层基础设施                              │
│  L1 Runtime │ L2 Context │ L3 Capability │ L4 Governance │ L5 DAG│
└──────────────────────────────────────────────────────────────────┘
```

### 架构参考

| 标杆 | 参考要点 |
|------|---------|
| [Anthropic 多 Agent 研究系统](https://www.anthropic.com/engineering/multi-agent-research-system) | Orchestrator-Worker 模式，Lead Agent + 并行 Subagent |
| [Claude Code 架构](https://medium.com/@devikanekkalapu7/inside-claude-codes-multi-agent-architecture-17cc162d5d7c) | Lead Agent + Specialist Agents + Shared Task System |
| [Harness Engineering](https://arxiv.org/pdf/2604.21003) | Agent = Model + Harness，五层模型，棘轮机制 |
| [Google ADK GraphAgent](https://github.com/google/adk-python) | DAG 有向图编排，节点生命周期回调 |
| [TradingAgents](https://github.com/TradingAgents-AI/TradingAgents) | 多 Agent 金融分析框架（61K Stars） |

---

## 🚀 快速开始

### 环境要求

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose（生产部署）

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
pip install -r requirements.txt

# 4. 启动后端
uvicorn main:app --reload --port 8000

# 5. 安装前端依赖（新终端）
cd frontend
npm install

# 6. 启动前端
npm run dev
```

### Docker 一键部署

```bash
# 配置环境变量
cp backend/.env.example backend/.env

# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f
```

---

## 📊 Demo 场景

| 场景 | 竞品 | 关联 |
|------|------|------|
| 🤖 AI 对话助手 | 豆包 vs Kimi vs DeepSeek vs 通义千问 | 字节核心业务 |
| 📱 短视频平台 | 抖音 vs 快手 vs 小红书 vs B站 | 字节核心业务 |
| 💻 AI 编程工具 | Cursor vs Copilot vs TRAE vs Windsurf | 比赛赞助商 TRAE |

---

## 🛠️ 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| LLM | MiniMax M2.7 | 大语言模型驱动（Anthropic SDK 兼容接口） |
| 后端 | Python 3.12 + FastAPI | API 服务 + SSE 流式 |
| Agent | 自研 Agent Loop | ReAct 循环 + 棘轮机制（参考 Claude Code） |
| Schema | Pydantic v2 | 竞品知识 Schema 类型安全 |
| 前端 | Next.js 14 + React 19 + TypeScript | 用户界面 |
| 可视化 | React Flow + Recharts | DAG 可视化 + 数据图表 |
| 可观测性 | OpenTelemetry | Agent 决策追踪 |
| 部署 | Docker Compose + Nginx | 一键部署 |

---

## 📁 项目结构

```
competitive-analysis-agent/
├── backend/
│   ├── agents/          # 6 个 Agent 实现
│   ├── harness/         # Harness 五层架构
│   │   ├── runtime.py   # L1: Agent Loop + 棘轮机制
│   │   ├── context.py   # L2: 记忆管理 + 上下文压缩
│   │   ├── capability.py# L3: 工具注册 + MCP 风格调用
│   │   ├── governance.py# L4: 权限 + 审计 + Token 预算
│   │   └── surface.py   # L5: DAG 编排 + 事件总线
│   ├── schemas/         # 竞品知识 Schema
│   ├── api/             # FastAPI 路由
│   └── main.py          # 应用入口
├── frontend/            # Next.js 前端
├── landing/             # 项目介绍网页
├── docs/report/         # LaTeX 技术报告
├── examples/            # 预置 Demo 数据
├── docker-compose.yml   # 一键部署
└── Makefile             # 常用命令
```

---

## 📝 API 文档

启动后端后访问: `http://localhost:8000/docs`

### 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tasks` | 创建竞品分析任务 |
| GET | `/api/tasks/{id}` | 获取任务状态 |
| GET | `/api/tasks/{id}/report` | 获取完整报告 |
| GET | `/api/tasks/{id}/traces` | 获取 Agent 决策追踪 |
| GET | `/api/tasks/{id}/events` | SSE 实时事件流 |

---

## 📄 技术报告

完整的 50+ 页技术报告详见 [`docs/report/`](docs/report/)，涵盖：

- 系统架构设计与技术选型论证
- 多 Agent 协作机制深度分析
- Harness Engineering 五层模型实现
- 实验评估与性能对比
- 与字节业务结合分析

---

## 📜 License

[MIT License](LICENSE)

---

<div align="center">

**CompetitorScope** — 让竞品分析像组建研究团队一样简单

Powered by MiniMax M2.7 · Built for 字节 AI 全栈挑战赛 2026

</div>
