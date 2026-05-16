"""
竞品分析 Agent 协作引擎 - 核心入口

Orchestrator-Worker 模式：6 Agent + DAG 编排 + Harness 五层
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime

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
    TaskStatus,
)

logger = logging.getLogger(__name__)


class CompetitiveAnalysisEngine:
    """竞品分析引擎 - Orchestrator-Worker 多 Agent 协作"""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.minimax.io/anthropic",
        model: str = "MiniMax-M2.7",
        task_id: str = "",
    ):
        self.client = AsyncAnthropic(api_key=api_key, base_url=base_url)
        self.model = model
        self.task_id = task_id
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
        """执行完整的竞品分析流程，使用 DAG 编排"""
        start_time = time.time()
        task.status = TaskStatus.RUNNING

        await self.event_bus.publish(Event(
            "analysis_started", "engine",
            {"task_id": task.task_id, "query": task.query},
        ))

        competitors = task.competitors
        if not competitors:
            competitors = ["Competitor A", "Competitor B", "Competitor C"]

        dag_plan = self.dag_orchestrator.create_default_dag(task.query, competitors)
        task.dag_plan = dag_plan

        # Phase 1: Orchestrator
        await self.event_bus.publish(Event("node_started", "orchestrate", {"role": "orchestrator", "task": "规划分析任务"}))
        orchestrator = self._create_agent(AgentRole.ORCHESTRATOR, ORCHESTRATOR_PROMPT)
        plan_result = await orchestrator.execute(
            f"Plan competitive analysis for: {task.query}\n"
            f"Competitors: {', '.join(competitors)}\n"
            f"Industry: {task.industry or 'auto-detect'}\n"
            f"Focus areas: {', '.join(task.focus_areas) if task.focus_areas else 'comprehensive'}"
        )
        self.shared_memory.write("analysis_plan", plan_result.get("result", ""), "orchestrator")
        await self.event_bus.publish(Event("node_completed", "orchestrate", {"summary": "任务规划完成"}))

        # Phase 2: Collectors in parallel
        collect_tasks = []
        for i, comp in enumerate(competitors):
            node_id = f"collect_{i}"
            await self.event_bus.publish(Event("node_started", node_id, {"role": "collector", "task": f"采集 {comp} 信息"}))
            collector = self._create_agent(AgentRole.COLLECTOR, COLLECTOR_PROMPT)
            collect_tasks.append(collector.execute(
                f"Collect comprehensive public information about: {comp}\n"
                f"Context: competitive analysis about: {task.query}\n"
                f"Focus on: company info, products, features, pricing, recent news."
            ))

        collect_results = await asyncio.gather(*collect_tasks, return_exceptions=True)

        all_collected_data = []
        for i, (comp, result) in enumerate(zip(competitors, collect_results)):
            node_id = f"collect_{i}"
            if isinstance(result, Exception):
                logger.error(f"Collection failed for {comp}: {result}")
                all_collected_data.append({"competitor": comp, "error": str(result)})
                await self.event_bus.publish(Event("node_failed", node_id, {"error": str(result)}))
            else:
                all_collected_data.append({"competitor": comp, "data": result.get("result", "")})
                await self.event_bus.publish(Event("node_completed", node_id, {"summary": f"采集 {comp} 完成"}))

        self.shared_memory.write("collected_data", json.dumps(all_collected_data, ensure_ascii=False)[:10000], "collector")

        # Phase 3: Analyst
        await self.event_bus.publish(Event("node_started", "analyze", {"role": "analyst", "task": "结构化分析"}))
        analyst = self._create_agent(AgentRole.ANALYST, ANALYST_PROMPT)
        analysis_result = await analyst.execute(
            f"Analyze competitor data and produce structured insights.\n\n"
            f"Query: {task.query}\nCompetitors: {', '.join(competitors)}\n\n"
            f"Data:\n{json.dumps(all_collected_data, ensure_ascii=False)[:8000]}"
        )
        self.shared_memory.write("analysis_result", analysis_result.get("result", ""), "analyst")
        await self.event_bus.publish(Event("node_completed", "analyze", {"summary": "分析完成"}))

        # Phase 4: Writer
        await self.event_bus.publish(Event("node_started", "write", {"role": "writer", "task": "撰写报告"}))
        writer = self._create_agent(AgentRole.WRITER, WRITER_PROMPT)
        report_result = await writer.execute(
            f"Write a comprehensive competitive analysis report.\n\n"
            f"Query: {task.query}\nCompetitors: {', '.join(competitors)}\n\n"
            f"Analysis:\n{analysis_result.get('result', '')[:8000]}"
        )
        draft_report = report_result.get("result", "")
        self.shared_memory.write("draft_report", draft_report, "writer")
        await self.event_bus.publish(Event("node_completed", "write", {"summary": "报告草稿完成"}))

        # Phase 5: Reviewer (with revision loop)
        await self.event_bus.publish(Event("node_started", "review", {"role": "reviewer", "task": "质量审查"}))
        reviewer = self._create_agent(AgentRole.REVIEWER, REVIEWER_PROMPT)
        review_result = await reviewer.execute(
            f"Review the following competitive analysis report:\n\n{draft_report[:8000]}"
        )
        review_text = review_result.get("result", "")
        self.shared_memory.write("review_feedback", review_text, "reviewer")
        await self.event_bus.publish(Event("node_completed", "review", {"summary": "审查完成"}))

        # Phase 6: Citation verification
        await self.event_bus.publish(Event("node_started", "cite", {"role": "citation", "task": "溯源验证"}))
        citation_agent = self._create_agent(AgentRole.CITATION, CITATION_PROMPT)
        citation_result = await citation_agent.execute(
            f"Verify citations in this report:\n\n{draft_report[:6000]}\n\n"
            f"Sources:\n{json.dumps(all_collected_data, ensure_ascii=False)[:4000]}"
        )
        self.shared_memory.write("citation_verification", citation_result.get("result", ""), "citation")
        await self.event_bus.publish(Event("node_completed", "cite", {"summary": "溯源验证完成"}))

        # Build final report
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
            executive_summary=draft_report[:2000],
            markdown_report=draft_report,
            competitors=[CompetitorProfile(name=c) for c in competitors],
            agent_traces=all_logs,
            total_tokens_used=total_tokens,
            total_duration_ms=total_ms,
        )

        task.report = report
        task.status = TaskStatus.COMPLETED

        await self.event_bus.publish(Event(
            "analysis_completed", "engine",
            {"task_id": task.task_id, "total_ms": total_ms, "total_tokens": total_tokens},
        ))

        return report

    def get_status(self) -> dict:
        return {
            "agents": {
                aid: {
                    "role": a.role.value,
                    "status": a.runtime.status.value,
                    "tokens_in": a.runtime.total_input_tokens,
                    "tokens_out": a.runtime.total_output_tokens,
                }
                for aid, a in self._agents.items()
            },
            "governance": self.governance.get_status(),
            "shared_memory_keys": list(self.shared_memory.read_all().keys()),
            "events_count": len(self.event_bus.get_events()),
        }
