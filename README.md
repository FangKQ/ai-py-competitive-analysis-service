<div align="center">

# 🔍 CompetitorAI

### AI-Driven Multi-Agent Competitive Analysis System

**7 Agents · Dual-Model Cross-Validation · DAG Orchestration · Full Traceability**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136+-009688.svg)](https://fastapi.tiangolo.com)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000.svg)](https://nextjs.org)

</div>

---

## Overview

**CompetitorAI** is an intelligent competitive analysis system powered by multi-agent collaboration. It coordinates 7 specialized agents (Orchestrator, Collector, Analyst, Writer, Arbiter, Citation Verifier, Reviewer) to automate the full pipeline from public information gathering to strategic competitive report generation.

Key highlights:

- **Dual-Model Cross-Validation** — Analysis and writing run in parallel on GPT-5.5 and Claude Opus 4.8, with an Arbiter agent fusing the best results
- **Five Looks & Three Defines Methodology** — Industry / Market / Competition / Self / Opportunities + Control Points / Objectives / Strategy
- **Full Observability** — Real-time DAG progress, timeline-based decision logs, and transparent agent reasoning
- **Citation Tracing** — Every factual claim is annotated with source URLs, independently verified by the Citation agent

---

## Architecture

```
User submits analysis request
        │
        ▼
┌─────────────┐
│ Orchestrator │ → Parse requirements, plan collection tasks, identify competitors
└──────┬──────┘
       │ parallel
       ▼
┌──────────────────────────────────────┐
│ Collectors ×N (Industry/Customer/Comp)│ → Web search + page scraping
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────┐
│ Analyst (GPT) ║ Analyst (Claude) │ → Dual-model structured analysis
└──────────────────┬───────────────┘
                   │
                   ▼
┌───────────────────────┐
│ Arbiter (Analysis)     │ → Consensus adoption, conflict resolution, hallucination rejection
└───────────┬───────────┘
            │
            ▼
┌──────────────────────────────────┐
│ Writer (GPT)  ║  Writer (Claude) │ → Dual-model report generation
└──────────────────┬───────────────┘
                   │
                   ▼
┌───────────────────────┐
│ Arbiter (Report)       │ → Chapter-by-chapter fusion, style unification
└───────────┬───────────┘
            │
            ▼
┌────────────┐     ┌──────────┐
│  Citation   │ →  │ Reviewer  │ → Quality scoring, pass/fail gate
└────────────┘     └──────────┘
                        │
                        ▼
                 Final Competitive Report
```

---

## Features

| Feature | Description |
|---------|-------------|
| Multi-Agent DAG Collaboration | 7 agents orchestrated via DAG topology with parallel/serial execution |
| Dual-Model Cross-Validation | GPT + Claude run in parallel, Arbiter fuses optimal output |
| Real-Time Visualization | DAG progress graph + timeline decision logs via SSE streaming |
| Agent Workshop | Online configuration of each agent's model and system prompt |
| History & Persistence | All tasks persisted to SQLite, with full report retrieval and PDF export |
| Task Resume | Navigate away and return — active tasks auto-detected with one-click resume |
| PDF Export | One-click PDF generation with Chinese filename support |
| Inline Demo | Auto-playing pipeline demo on the homepage |

---

## Quick Start

See [Deployment Guide](docs/部署与配置教程.md) for detailed instructions.

### Requirements

- Python 3.10+
- Node.js 18+

### Start Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Project Structure

```
├── backend/
│   ├── agents/             # Agent engine (orchestration, collection, analysis, writing, arbitration)
│   │   ├── __init__.py     # CompetitiveAnalysisEngine core
│   │   ├── base.py         # BaseAgent (integrates Harness 5 layers)
│   │   ├── arbiter.py      # Arbiter Agent
│   │   ├── config_store.py # Agent config persistence (SQLite)
│   │   └── prompts.py      # System prompts for all agents
│   ├── api/                # FastAPI routes (task management + agent config)
│   ├── harness/            # Harness 5-Layer Architecture
│   │   ├── runtime.py      # L1: ReAct Loop + Ratchet mechanism
│   │   ├── context.py      # L2: SharedMemory
│   │   ├── capability.py   # L3: Tool registry (search, scrape)
│   │   ├── governance.py   # L4: Budget/Token governance
│   │   ├── providers.py    # LLM Providers (OpenAI + Anthropic)
│   │   └── surface.py      # L5: DAG orchestration + EventBus
│   ├── data/               # SQLite persistence (config + history)
│   ├── export/             # PDF export (weasyprint)
│   ├── config.py           # Configuration (pydantic-settings)
│   └── main.py             # FastAPI entry point
├── frontend/               # Next.js 15 frontend
│   ├── app/                # Pages (home, agent workshop)
│   ├── components/         # UI components (DAG, TracePanel, Report, History)
│   └── lib/                # API client, React Context
├── docs/                   # Documentation
└── landing/                # Static landing page
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | Create competitive analysis task |
| GET | `/api/tasks/{id}/events` | SSE real-time event stream |
| GET | `/api/tasks/{id}/report` | Get full Markdown report |
| GET | `/api/tasks/{id}/export/pdf` | Export report as PDF |
| GET | `/api/history` | List task history |
| GET | `/api/history/{id}` | Get history detail with full report |
| GET | `/api/agents` | List agent configurations |
| PUT | `/api/agents/{role}` | Update agent config (model, prompt) |
| POST | `/api/agents/{role}/test` | Test agent with custom input |

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| LLM | GPT-5.5 + Claude Opus 4.8 | Dual-model cross-validation |
| Backend | FastAPI + Pydantic v2 | Async high-performance + structured validation |
| Agent Framework | Custom Harness 5-Layer | Zero LangChain dependency |
| Search | Tavily API | LLM-optimized search results |
| Real-time | SSE (Server-Sent Events) | Lightweight unidirectional push |
| Frontend | Next.js 15 + React 19 + TailwindCSS 4 | DAG visualization + timeline tracing |
| Persistence | SQLite (aiosqlite) | Config + task history |
| PDF | weasyprint | Markdown → HTML → PDF |
| Deployment | Docker + Nginx | Containerized deployment |

---

## License

[MIT License](LICENSE)

---

<div align="center">

**CompetitorAI** — AI-Driven Multi-Agent Competitive Analysis System

</div>
