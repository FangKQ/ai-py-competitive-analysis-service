"""
竞品分析 Agent 协作引擎 - 核心入口

整合 6 个专职 Agent + DAG 编排 + Harness 五层，实现
从信息采集到结构化报告输出的全链路自动化。

参考：
- Anthropic multi-agent research: Lead Agent + parallel Subagents + Citation Agent
- Claude Code: Plan-Execute-Verify 模式
- Harness Engineering: 自动化 Harness 进化循环
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any

from anthropic import AsyncAnthropic

from agents.base import BaseAgent
from agents.prompts import (
    ORCHESTRATOR_PROMPT,
    COLLECTOR_PROMPT,
    ANALYST_PROMPT,
    WRITER_PROMPT,
    REVIEWER_PROMPT,
    CITATION_PROMPT,
)
from harness.context import SharedMemory
from harness.capability import ToolRegistry, create_default_tools
from harness.governance import GovernanceLayer
from harness.surface import DAGOrchestrator, EventBus, Event
from schemas import (
    AgentRole,
    AnalysisTask,
    CompetitiveReport,
    CompetitorProfile,
    DAGNode,
    DAGPlan,
    SourceCitation,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class CompetitiveAnalysisEngine:
    """
    竞品分析引擎 - 多 Agent 协作系统核心

    架构: Orchestrator-Worker 模式
    - Orchestrator: 规划分析任务、分解 DAG
    - Collector(s): 并行采集各竞品信息
    - Analyst: 结构化分析与比较
    - Writer: 撰写报告
    - Reviewer: 质量审查（交叉审查闭环）
    - Citation: 溯源验证
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.minimax.io/anthropic",
        model: str = "MiniMax-M2.7",
    ):
        self.client = AsyncAnthropic(api_key=api_key, base_url=base_url)
        self.model = model
        self.shared_memory = SharedMemory()
        self.governance = GovernanceLayer()
        self.event_bus = EventBus()
        self.tools = create_default_tools()
        self.dag_orchestrator = DAGOrchestrator(event_bus=self.event_bus)

        self._agents: dict[str, BaseAgent] = {}

    def _create_agent(self, role: AgentRole, prompt: str) -> BaseAgent:
        agent = BaseAgent(
            role=role,
            system_prompt=prompt,
            client=self.client,
            model=self.model,
            tools=self.tools,
            shared_memory=self.shared_memory,
            governance=self.governance,
            event_bus=self.event_bus,
        )
        self._agents[agent.runtime.agent_id] = agent
        return agent

    async def analyze(self, task: AnalysisTask) -> CompetitiveReport:
        """执行完整的竞品分析流程"""
        start_time = time.time()
        task.status = TaskStatus.RUNNING

        await self.event_bus.publish(
            Event(
                "analysis_started",
                "engine",
                {"task_id": task.task_id, "query": task.query},
            )
        )

        # Phase 1: Orchestrator 规划
        orchestrator = self._create_agent(
            AgentRole.ORCHESTRATOR, ORCHESTRATOR_PROMPT
        )
        plan_result = await orchestrator.execute(
            f"Plan competitive analysis for: {task.query}\n"
            f"Suggested competitors: {', '.join(task.competitors) if task.competitors else 'auto-detect'}\n"
            f"Industry: {task.industry or 'auto-detect'}\n"
            f"Focus areas: {', '.join(task.focus_areas) if task.focus_areas else 'comprehensive'}"
        )

        competitors = task.competitors
        if not competitors:
            try:
                plan_data = json.loads(plan_result.get("result", "{}"))
                competitors = plan_data.get("competitors", [])
            except json.JSONDecodeError:
                competitors = ["Competitor A", "Competitor B", "Competitor C"]

        if not competitors:
            competitors = ["Competitor A", "Competitor B", "Competitor C"]

        self.shared_memory.write(
            "analysis_plan", plan_result.get("result", ""), "orchestrator"
        )

        # Phase 2: Collector 并行采集
        import asyncio

        collect_tasks = []
        for comp in competitors:
            collector = self._create_agent(AgentRole.COLLECTOR, COLLECTOR_PROMPT)
            collect_tasks.append(
                collector.execute(
                    f"Collect comprehensive public information about: {comp}\n"
                    f"Context: This is for a competitive analysis about: {task.query}\n"
                    f"Focus on: company info, products, features, pricing, recent news, market position."
                )
            )

        collect_results = await asyncio.gather(
            *collect_tasks, return_exceptions=True
        )

        all_collected_data = []
        for comp, result in zip(competitors, collect_results):
            if isinstance(result, Exception):
                logger.error(f"Collection failed for {comp}: {result}")
                all_collected_data.append(
                    {"competitor": comp, "error": str(result)}
                )
            else:
                all_collected_data.append(
                    {"competitor": comp, "data": result.get("result", "")}
                )

        self.shared_memory.write(
            "collected_data",
            json.dumps(all_collected_data, ensure_ascii=False)[:10000],
            "collector",
        )

        # Phase 3: Analyst 分析
        analyst = self._create_agent(AgentRole.ANALYST, ANALYST_PROMPT)
        analysis_result = await analyst.execute(
            f"Analyze the following collected competitor data and produce structured insights.\n\n"
            f"Analysis query: {task.query}\n"
            f"Competitors: {', '.join(competitors)}\n\n"
            f"Collected data:\n{json.dumps(all_collected_data, ensure_ascii=False)[:8000]}"
        )
        self.shared_memory.write(
            "analysis_result",
            analysis_result.get("result", ""),
            "analyst",
        )

        # Phase 4: Writer 撰写报告
        writer = self._create_agent(AgentRole.WRITER, WRITER_PROMPT)
        report_result = await writer.execute(
            f"Write a comprehensive competitive analysis report.\n\n"
            f"Query: {task.query}\n"
            f"Competitors: {', '.join(competitors)}\n\n"
            f"Analysis data:\n{analysis_result.get('result', '')[:8000]}"
        )
        self.shared_memory.write(
            "draft_report",
            report_result.get("result", ""),
            "writer",
        )

        # Phase 5: Reviewer 审查
        reviewer = self._create_agent(AgentRole.REVIEWER, REVIEWER_PROMPT)
        review_result = await reviewer.execute(
            f"Review the following competitive analysis report for accuracy, "
            f"completeness, and citation quality.\n\n"
            f"Report:\n{report_result.get('result', '')[:8000]}"
        )
        self.shared_memory.write(
            "review_feedback",
            review_result.get("result", ""),
            "reviewer",
        )

        # Phase 6: Citation 溯源验证
        citation_agent = self._create_agent(AgentRole.CITATION, CITATION_PROMPT)
        citation_result = await citation_agent.execute(
            f"Verify citations in this competitive analysis report.\n\n"
            f"Report:\n{report_result.get('result', '')[:6000]}\n\n"
            f"Available sources:\n{json.dumps(all_collected_data, ensure_ascii=False)[:4000]}"
        )

        # 构建最终报告
        total_ms = int((time.time() - start_time) * 1000)

        all_logs = []
        for agent in self._agents.values():
            all_logs.extend(agent.runtime.decision_logs)

        total_tokens = sum(
            a.runtime.total_input_tokens + a.runtime.total_output_tokens
            for a in self._agents.values()
        )

        report = CompetitiveReport(
            title=f"Competitive Analysis: {task.query}",
            query=task.query,
            executive_summary=report_result.get("result", "")[:2000],
            competitors=[
                CompetitorProfile(name=c) for c in competitors
            ],
            agent_traces=all_logs,
            total_tokens_used=total_tokens,
            total_duration_ms=total_ms,
        )

        task.report = report
        task.status = TaskStatus.COMPLETED

        await self.event_bus.publish(
            Event(
                "analysis_completed",
                "engine",
                {
                    "task_id": task.task_id,
                    "total_ms": total_ms,
                    "total_tokens": total_tokens,
                    "competitors_analyzed": len(competitors),
                },
            )
        )

        return report

    def get_status(self) -> dict:
        """获取引擎状态"""
        return {
            "agents": {
                aid: {
                    "role": a.role.value,
                    "status": a.runtime.status.value,
                    "tokens_in": a.runtime.total_input_tokens,
                    "tokens_out": a.runtime.total_output_tokens,
                    "logs_count": len(a.runtime.decision_logs),
                }
                for aid, a in self._agents.items()
            },
            "governance": self.governance.get_status(),
            "shared_memory_keys": list(self.shared_memory.read_all().keys()),
            "events_count": len(self.event_bus.get_events()),
        }
