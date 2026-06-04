<div align="center">

# 🔍 CompetitorLens

### AI-Driven Competitive Analysis Multi-Agent System

**6 Agents · DAG Orchestration · Harness 5-Layer Architecture · Full Traceability**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12+-3776AB.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000.svg)](https://nextjs.org)

</div>

---

## 📖 Overview

**CompetitorLens** is an intelligent competitive analysis system powered by multi-agent collaboration. The system coordinates 6 specialized agents working together to automate the entire pipeline — from public information collection to structured competitive report generation.

### Core Pain Points Solved

| Traditional Approach | CompetitorLens |
|---------------------|----------------|
| ❌ Information scattered across 10+ platforms | ✅ Collector Agent auto-collects in parallel |
| ❌ Manual compilation takes days | ✅ 6 Agents collaborate, complete in minutes |
| ❌ Conclusions lack citations, unverifiable | ✅ Citation Agent verifies each reference |
| ❌ Analysis quality depends on individual skill | ✅ Reviewer Agent multi-dimensional scoring |
| ❌ Process is a black box | ✅ Agent decision logs tracked in real-time |

### Key Features

- 🎯 **6 Specialized Agents** — Orchestrator / Collector / Analyst / Writer / Reviewer / Citation
- 📐 **DAG Task Orchestration** — Directed acyclic graph task flow, parallel collection + serial analysis
- ⚙️ **Harness 5-Layer Architecture** — Based on [Harness Engineering](https://arxiv.org/pdf/2604.21003) paper
- 🔗 **Full Traceability** — Each conclusion annotated with source URL, Citation Agent independently verifies
- 👁️ **Observable** — Agent decision logs tracked in real-time via SSE streaming
- 🔧 **Ratchet Mechanism** — Errors permanently converted to constraints, preventing repeated mistakes

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Frontend (Next.js + Landing Page)                │
│  ┌────────────┐ ┌─────────────┐ ┌─────────┐ ┌───────────────┐  │
│  │ Agent DAG  │ │ Live Demo   │ │ Traces  │ │ Report View   │  │
│  └────────────┘ └─────────────┘ └─────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│              API Layer (FastAPI + SSE Real-time Streaming)        │
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
│                                              [Reviewer] ← Review │
│                                                    │     Loop    │
│                                              [Citation] → Verify │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                Harness 5-Layer Infrastructure                     │
│  L1 Runtime  │ L2 Context │ L3 Capability │ L4 Governance│ L5 DAG│
│  (ReAct Loop)│ (SharedMem)│ (Tool Reg.)   │ (Budget/Audit)│(Event)│
└─────────────────────────────────────────────────────────────────┘
```

### Architecture References

| Reference | Key Takeaway |
|-----------|-------------|
| [Anthropic Multi-Agent Research](https://www.anthropic.com/engineering/multi-agent-research-system) | Orchestrator-Worker pattern, Lead Agent + parallel Subagents |
| [Harness Engineering](https://arxiv.org/pdf/2604.21003) | Agent = Model + Harness paradigm, 5-layer model, Ratchet mechanism |
| [Google ADK GraphAgent](https://github.com/google/adk-python) | DAG graph orchestration, topological sort + parallel execution |

---

## 🚀 Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+ (for frontend)
- MiniMax API Key ([apply here](https://platform.minimax.io))

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/bcefghj/competitive-analysis-agent.git
cd competitive-analysis-agent

# 2. Configure environment variables
cp backend/.env.example backend/.env
# Edit .env and fill in your MiniMax API Key

# 3. Install backend dependencies
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 4. Start backend
uvicorn main:app --reload --port 8000

# 5. Install and start frontend (optional)
cd ../frontend
npm install && npm run dev

# 6. Or simply open the Landing Page
# Open landing/index.html in your browser
```

### Docker Deployment

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Makefile Commands

```bash
make help          # Show all available commands
make install       # Install all dependencies
make dev-backend   # Start backend dev server
make dev-frontend  # Start frontend dev server
make build         # Build Docker images
make deploy        # Deploy with Docker Compose
make test          # Run tests
make lint          # Run linters
make clean         # Clean build artifacts
```

---

## 📁 Project Structure

```
competitive-analysis-agent/
├── backend/
│   ├── agents/             # 6 Agent implementations
│   │   ├── __init__.py     # CompetitiveAnalysisEngine core engine
│   │   ├── base.py         # BaseAgent (integrates Harness 5 layers)
│   │   └── prompts.py      # System prompts for all 6 Agents
│   ├── harness/            # Harness 5-Layer Architecture
│   │   ├── runtime.py      # L1: ReAct Loop + Ratchet mechanism
│   │   ├── context.py      # L2: SharedMemory
│   │   ├── capability.py   # L3: MCP-style tool registry
│   │   ├── governance.py   # L4: Budget/Token governance + audit
│   │   └── surface.py      # L5: DAG orchestration + EventBus
│   ├── schemas/            # Competitive knowledge Schema (15+ Models)
│   ├── api/                # FastAPI routes
│   ├── export/             # Report export (PDF)
│   ├── examples/           # Pre-built demo cached data
│   ├── config.py           # Configuration (pydantic-settings)
│   ├── main.py             # FastAPI entry point
│   └── requirements.txt    # Python dependencies
├── frontend/               # Next.js dashboard
│   ├── app/                # App router pages
│   ├── components/         # React components (DAG, Report, Trace)
│   └── lib/                # API client utilities
├── landing/                # Static landing page + Demo
│   ├── index.html          # Project introduction (12-section narrative)
│   ├── demo.html           # Interactive demo page
│   ├── style.css           # Landing page styles
│   ├── demo.css            # Demo page styles
│   ├── app.js              # Agent simulator
│   └── demo.js             # Real-time analysis + Markdown renderer
├── docs/
│   ├── design/             # Architecture design documents
│   └── report/             # LaTeX technical report (50+ pages)
├── docker-compose.yml      # Multi-service orchestration
├── nginx.conf              # Nginx reverse proxy config
├── Makefile                # Development shortcuts
└── README.md
```

---

## 📝 API Reference

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | Create competitive analysis task |
| GET | `/api/tasks/{id}` | Get task status and report |
| GET | `/api/tasks/{id}/report` | Get full Markdown report |
| GET | `/api/tasks/{id}/traces` | Get Agent decision trace logs |
| GET | `/api/tasks/{id}/events` | SSE real-time event stream |
| GET | `/api/demos` | List pre-built demo scenarios |
| GET | `/api/health` | Health check |

### Example Usage

```bash
# Create an analysis task
curl -X POST http://localhost:8000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"query": "Analyze the AI assistant market competitive landscape"}'

# Get task result
curl http://localhost:8000/api/tasks/{task_id}
```

---

## 🛠️ Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| LLM | MiniMax M2.7 | Anthropic SDK compatible interface |
| Backend | FastAPI + Pydantic v2 | Async high-performance + structured data validation |
| Agent Framework | Custom Harness | Based on Harness Engineering paper, zero LangChain dependency |
| Tools | httpx + BeautifulSoup | Web search + page scraping, MCP-style registration |
| Real-time | SSE (Server-Sent Events) | Lightweight, native EventSource support |
| Frontend | Next.js 15 + React 19 | Dashboard with DAG visualization |
| Landing | Pure HTML + CSS + JS | Zero-build, direct deployment |
| Data Models | 15+ Pydantic Models | Custom competitive knowledge schema |
| Deployment | Docker + Nginx | Containerized, reverse proxy |

---

## ✅ Status

| Feature | Status | Notes |
|---------|--------|-------|
| 6-Agent Collaboration Engine | ✅ Built | Orchestrator + 5 Worker Agents |
| Harness 5-Layer Architecture | ✅ Built | Runtime/Context/Capability/Governance/Surface |
| SSE Real-time Event Streaming | ✅ Built | Agent execution status pushed in real-time |
| Web Search + Scraping | ✅ Built | DuckDuckGo + BeautifulSoup |
| Competitive Knowledge Schema | ✅ Built | 15+ Pydantic Models |
| Agent Decision Log Tracing | ✅ Built | Every step of reasoning/tool calls recorded |
| Ratchet Mechanism | ✅ Built | Error → constraint auto-conversion |
| Demo Fallback | ✅ Built | API failure auto-fallback to cached data |
| Cross-review Feedback Loop | 🧪 Lab | Reviewer → Writer revision cycle |
| PostgreSQL Persistence | 📋 Planned | Currently using in-memory storage |

---

## 📄 Technical Report

A comprehensive 50+ page LaTeX technical report covering:

- System architecture design and technology selection
- Multi-Agent collaboration mechanism analysis
- Harness Engineering 5-layer model implementation
- Competitive knowledge schema design
- Experimental evaluation and ablation studies
- Deployment architecture

See [`docs/report/main.tex`](docs/report/main.tex) for the source.

---

## 📜 License

[MIT License](LICENSE)

---

<div align="center">

**CompetitorLens** — AI-Driven Competitive Analysis Multi-Agent System

Built with FastAPI + Next.js + Harness Engineering

</div>
