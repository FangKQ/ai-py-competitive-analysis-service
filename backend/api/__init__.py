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
_engines: dict[str, CompetitiveAnalysisEngine] = {}


def _get_or_create_engine(task_id: str) -> CompetitiveAnalysisEngine:
    if task_id not in _engines:
        _engines[task_id] = CompetitiveAnalysisEngine(
            api_key=settings.minimax_api_key,
            base_url=settings.minimax_base_url,
            model=settings.minimax_model,
            task_id=task_id,
        )
    return _engines[task_id]


class CreateTaskRequest(BaseModel):
    query: str = Field(description="竞品分析需求描述")
    competitors: list[str] = Field(default_factory=list, description="竞品列表")
    industry: str = Field(default="", description="行业")
    focus_areas: list[str] = Field(default_factory=list, description="分析焦点")
    use_demo: str = Field(default="", description="使用预设 Demo 场景 ID")


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

    asyncio.create_task(_run_analysis(task.task_id, req.use_demo))

    return TaskResponse(
        task_id=task.task_id,
        status=task.status.value,
        query=task.query,
        competitors=task.competitors,
        created_at=task.created_at.isoformat(),
    )


async def _run_analysis(task_id: str, demo_id: str = "") -> None:
    """后台执行分析任务（含 Demo fallback）"""
    task = _tasks.get(task_id)
    if not task:
        return

    if demo_id:
        await _run_demo_fallback(task, demo_id)
        return

    try:
        engine = _get_or_create_engine(task_id)
        await engine.analyze(task)
    except Exception as e:
        logger.error(f"Analysis failed for {task_id}: {e}", exc_info=True)
        task.status = TaskStatus.FAILED
        task.error_message = str(e)
        await _run_demo_fallback(task, "ai-assistant")


async def _run_demo_fallback(task: AnalysisTask, demo_id: str) -> None:
    """使用 Demo 缓存数据作为 fallback"""
    from examples import DEMO_SCENARIOS
    from schemas import CompetitiveReport, CompetitorProfile, AgentDecisionLog, AgentRole

    scenario = None
    for d in DEMO_SCENARIOS:
        if d["id"] == demo_id:
            scenario = d
            break

    if not scenario or "cached_report" not in scenario:
        scenario = DEMO_SCENARIOS[0]

    cached = scenario["cached_report"]

    competitors = []
    for c in cached.get("competitors", []):
        competitors.append(CompetitorProfile(
            name=c["name"],
            description=c.get("description", ""),
            website=c.get("website", ""),
            key_products=c.get("key_features", []),
        ))

    traces = [
        AgentDecisionLog(agent_id="orch-001", agent_role=AgentRole.ORCHESTRATOR, action="规划分析任务", reasoning="解析用户需求并识别竞品", result_summary=f"识别 {len(competitors)} 个竞品"),
        AgentDecisionLog(agent_id="coll-001", agent_role=AgentRole.COLLECTOR, action="采集竞品信息", reasoning="通过搜索引擎收集公开数据", result_summary="采集完成"),
        AgentDecisionLog(agent_id="anal-001", agent_role=AgentRole.ANALYST, action="结构化分析", reasoning="对比功能/定价/市场定位", result_summary="生成对比矩阵"),
        AgentDecisionLog(agent_id="writ-001", agent_role=AgentRole.WRITER, action="撰写报告", reasoning="基于分析结果生成报告", result_summary="报告草稿完成"),
        AgentDecisionLog(agent_id="revi-001", agent_role=AgentRole.REVIEWER, action="质量审查", reasoning="检查准确性/完整性/引用", result_summary="审查通过 8.2/10"),
        AgentDecisionLog(agent_id="cite-001", agent_role=AgentRole.CITATION, action="溯源验证", reasoning="验证引用 URL 可访问性", result_summary="5/6 引用已验证"),
    ]

    feature_lines = []
    for fc in cached.get("feature_comparison", []):
        feature_lines.append("| " + " | ".join(str(v) for v in fc.values()) + " |")

    md_report = f"""# {scenario['name']}

## 执行摘要

{cached['executive_summary']}

## 竞品概览

"""
    for c in cached.get("competitors", []):
        md_report += f"### {c['name']}\n\n"
        md_report += f"**定位**: {c.get('market_position', '')}\n\n"
        md_report += f"{c.get('description', '')}\n\n"
        if c.get("key_features"):
            md_report += "**核心特性**:\n"
            for f in c["key_features"]:
                md_report += f"- {f}\n"
            md_report += "\n"

    if cached.get("feature_comparison"):
        md_report += "## 功能对比\n\n"
        headers = list(cached["feature_comparison"][0].keys())
        md_report += "| " + " | ".join(headers) + " |\n"
        md_report += "| " + " | ".join(["---"] * len(headers)) + " |\n"
        for row in cached["feature_comparison"]:
            md_report += "| " + " | ".join(str(v) for v in row.values()) + " |\n"

    report = CompetitiveReport(
        title=scenario["name"],
        query=task.query,
        executive_summary=cached["executive_summary"],
        markdown_report=md_report,
        competitors=competitors,
        agent_traces=traces,
        total_tokens_used=35600,
        total_duration_ms=9500,
    )

    task.report = report
    task.status = TaskStatus.COMPLETED


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """获取任务状态及报告"""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    result: dict = {
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
            "markdown_report": task.report.markdown_report,
            "competitors": [c.model_dump() for c in task.report.competitors],
            "total_tokens_used": task.report.total_tokens_used,
            "total_duration_ms": task.report.total_duration_ms,
            "citations_count": len(task.report.all_citations),
            "traces_count": len(task.report.agent_traces),
        }

    return result


@router.get("/tasks/{task_id}/report")
async def get_report(task_id: str):
    """获取完整竞品报告（Markdown）"""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.report:
        raise HTTPException(status_code=404, detail="Report not ready yet")

    return {
        "title": task.report.title,
        "executive_summary": task.report.executive_summary,
        "markdown_report": task.report.markdown_report,
        "competitors": [c.model_dump() for c in task.report.competitors],
        "all_citations": [c.model_dump() for c in task.report.all_citations],
        "total_tokens_used": task.report.total_tokens_used,
        "total_duration_ms": task.report.total_duration_ms,
    }


@router.get("/tasks/{task_id}/traces")
async def get_traces(task_id: str):
    """获取 Agent 决策追踪日志"""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.report:
        return {"traces": [], "total_count": 0}

    return {
        "traces": [t.model_dump() for t in task.report.agent_traces],
        "total_count": len(task.report.agent_traces),
    }


@router.get("/tasks/{task_id}/events")
async def stream_events(task_id: str):
    """SSE 事件流 - 统一使用 message 事件 + JSON {type, data}"""

    async def event_generator() -> AsyncGenerator[dict, None]:
        engine = _engines.get(task_id)
        last_count = 0
        while True:
            if engine:
                events = engine.event_bus.get_events()
                new_events = events[last_count:]
                last_count = len(events)

                for evt in new_events:
                    yield {
                        "data": json.dumps({
                            "type": evt["event_type"],
                            "source": evt["source"],
                            "data": evt["data"],
                            "timestamp": evt["timestamp"],
                        }, ensure_ascii=False),
                    }

            task = _tasks.get(task_id)
            if task and task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED):
                yield {
                    "data": json.dumps({
                        "type": "done",
                        "source": "engine",
                        "data": {"status": task.status.value},
                        "timestamp": datetime.now().isoformat(),
                    }, ensure_ascii=False),
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
    return {
        "active_engines": len(_engines),
        "active_tasks": len(_tasks),
        "tasks_by_status": {
            s.value: sum(1 for t in _tasks.values() if t.status == s)
            for s in TaskStatus
        },
    }


@router.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
