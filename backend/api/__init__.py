"""
FastAPI API 路由 - 任务管理 + Agent 执行 + SSE 流式 + 溯源查询
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from agents import CompetitiveAnalysisEngine
from config import settings
from schemas import AnalysisTask, TaskStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["analysis"])

_tasks: dict[str, AnalysisTask] = {}
_engine: CompetitiveAnalysisEngine | None = None


def get_engine() -> CompetitiveAnalysisEngine:
    global _engine
    if _engine is None:
        _engine = CompetitiveAnalysisEngine(
            api_key=settings.minimax_api_key,
            base_url=settings.minimax_base_url,
            model=settings.minimax_model,
        )
    return _engine


class CreateTaskRequest(BaseModel):
    query: str = Field(description="竞品分析需求描述")
    competitors: list[str] = Field(default_factory=list, description="竞品列表")
    industry: str = Field(default="", description="行业")
    focus_areas: list[str] = Field(default_factory=list, description="分析焦点")


class TaskResponse(BaseModel):
    task_id: str
    status: str
    query: str
    competitors: list[str]
    created_at: str


@router.post("/tasks", response_model=TaskResponse)
async def create_task(req: CreateTaskRequest):
    """创建竞品分析任务"""
    task = AnalysisTask(
        query=req.query,
        competitors=req.competitors,
        industry=req.industry,
        focus_areas=req.focus_areas,
    )
    _tasks[task.task_id] = task

    asyncio.create_task(_run_analysis(task.task_id))

    return TaskResponse(
        task_id=task.task_id,
        status=task.status.value,
        query=task.query,
        competitors=task.competitors,
        created_at=task.created_at.isoformat(),
    )


async def _run_analysis(task_id: str) -> None:
    """后台执行分析任务"""
    task = _tasks.get(task_id)
    if not task:
        return
    try:
        engine = get_engine()
        await engine.analyze(task)
    except Exception as e:
        logger.error(f"Analysis failed for {task_id}: {e}")
        task.status = TaskStatus.FAILED


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """获取任务状态"""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    result = {
        "task_id": task.task_id,
        "status": task.status.value,
        "query": task.query,
        "competitors": task.competitors,
        "created_at": task.created_at.isoformat(),
    }

    if task.report:
        result["report"] = {
            "title": task.report.title,
            "executive_summary": task.report.executive_summary,
            "competitors": [c.model_dump() for c in task.report.competitors],
            "total_tokens_used": task.report.total_tokens_used,
            "total_duration_ms": task.report.total_duration_ms,
            "citations_count": len(task.report.all_citations),
            "traces_count": len(task.report.agent_traces),
        }

    return result


@router.get("/tasks/{task_id}/report")
async def get_report(task_id: str):
    """获取完整竞品报告"""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.report:
        raise HTTPException(status_code=404, detail="Report not ready yet")

    return task.report.model_dump()


@router.get("/tasks/{task_id}/traces")
async def get_traces(task_id: str):
    """获取 Agent 决策追踪日志 - 可观测性核心"""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.report:
        return {"traces": []}

    return {
        "traces": [t.model_dump() for t in task.report.agent_traces],
        "total_count": len(task.report.agent_traces),
    }


@router.get("/tasks/{task_id}/events")
async def stream_events(task_id: str):
    """SSE 事件流 - 实时推送 Agent 执行状态"""

    async def event_generator() -> AsyncGenerator[dict, None]:
        engine = get_engine()
        last_count = 0
        while True:
            events = engine.event_bus.get_events()
            new_events = events[last_count:]
            last_count = len(events)

            for evt in new_events:
                yield {
                    "event": evt["event_type"],
                    "data": json.dumps(evt, ensure_ascii=False),
                }

            task = _tasks.get(task_id)
            if task and task.status in (
                TaskStatus.COMPLETED,
                TaskStatus.FAILED,
            ):
                yield {
                    "event": "done",
                    "data": json.dumps(
                        {"status": task.status.value}, ensure_ascii=False
                    ),
                }
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@router.get("/tasks")
async def list_tasks():
    """列出所有任务"""
    return {
        "tasks": [
            {
                "task_id": t.task_id,
                "status": t.status.value,
                "query": t.query,
                "created_at": t.created_at.isoformat(),
            }
            for t in _tasks.values()
        ]
    }


@router.get("/demos")
async def get_demos():
    """获取预置 Demo 场景列表"""
    from examples import DEMO_SCENARIOS

    return {
        "demos": [
            {
                "id": d["id"],
                "name": d["name"],
                "query": d["query"],
                "competitors": d["competitors"],
                "industry": d["industry"],
                "focus_areas": d["focus_areas"],
                "description": d["description"],
                "has_cached_report": "cached_report" in d,
            }
            for d in DEMO_SCENARIOS
        ]
    }


@router.get("/demos/{demo_id}")
async def get_demo_report(demo_id: str):
    """获取 Demo 缓存报告"""
    from examples import DEMO_SCENARIOS

    for d in DEMO_SCENARIOS:
        if d["id"] == demo_id:
            return {
                "scenario": {
                    "id": d["id"],
                    "name": d["name"],
                    "query": d["query"],
                    "competitors": d["competitors"],
                },
                "cached_report": d.get("cached_report"),
            }
    raise HTTPException(status_code=404, detail="Demo not found")


@router.get("/engine/status")
async def get_engine_status():
    """获取引擎状态"""
    engine = get_engine()
    return engine.get_status()


@router.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
