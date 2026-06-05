"""
竞品分析 Agent 协作系统 - FastAPI 应用入口
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

from config import settings
from api import router as api_router

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s | %(name)-25s | %(levelname)-7s | %(message)s",
)

app = FastAPI(
    title="竞品分析 Agent 协作系统",
    description=(
        "AI-driven Competitive Analysis Agent Collaboration System. "
        "多 Agent 协同完成从信息采集到结构化报告输出的全链路竞品分析。"
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Agent config routes
from api.agents import router as agents_router
app.include_router(agents_router)

data_dir = settings.data_dir
data_dir.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    from agents.config_store import config_store
    await config_store.init_db()

# Mount landing page static files at /landing only (avoid root catch-all)
landing_dir = Path(__file__).resolve().parent.parent / "landing"
if landing_dir.is_dir():
    app.mount("/landing", StaticFiles(directory=str(landing_dir), html=True), name="landing")


@app.get("/")
async def root():
    return {
        "name": "竞品分析 Agent 协作系统",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
        "landing": "/landing",
    }
