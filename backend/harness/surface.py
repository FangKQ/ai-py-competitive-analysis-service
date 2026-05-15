"""
Harness Layer 5: Surface - DAG 编排 + 事件总线 + 可观测性

参考：
- Google ADK GraphAgent: DAG 有向图编排，节点为 Agent，边为依赖关系
- Anthropic multi-agent: Orchestrator-Worker 模式，Lead Agent 规划 + 子Agent 并行
- OpenTelemetry: 分布式追踪标准
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Awaitable, Optional

from schemas import (
    AgentRole,
    DAGNode,
    DAGPlan,
    TaskStatus,
    AgentDecisionLog,
)

logger = logging.getLogger(__name__)


class Event:
    """事件总线事件"""

    def __init__(
        self,
        event_type: str,
        source: str,
        data: dict | None = None,
    ):
        self.event_id = str(uuid.uuid4())[:8]
        self.event_type = event_type
        self.source = source
        self.data = data or {}
        self.timestamp = datetime.now()


class EventBus:
    """
    事件总线 - Agent 间通信与可观测性

    支持 SSE 实时推送到前端
    """

    def __init__(self):
        self._subscribers: dict[str, list[Callable]] = {}
        self._event_log: list[Event] = []

    def subscribe(self, event_type: str, handler: Callable) -> None:
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)

    def subscribe_all(self, handler: Callable) -> None:
        self.subscribe("*", handler)

    async def publish(self, event: Event) -> None:
        self._event_log.append(event)

        handlers = self._subscribers.get(event.event_type, [])
        handlers += self._subscribers.get("*", [])

        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"Event handler error: {e}")

    def get_events(self, event_type: str | None = None) -> list[dict]:
        events = self._event_log
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        return [
            {
                "event_id": e.event_id,
                "event_type": e.event_type,
                "source": e.source,
                "data": e.data,
                "timestamp": e.timestamp.isoformat(),
            }
            for e in events
        ]


AgentExecutor = Callable[[DAGNode, dict], Awaitable[dict]]


class DAGOrchestrator:
    """
    DAG 编排器 - 管理多 Agent 的有向无环图执行

    实现:
    1. 拓扑排序确定执行顺序
    2. 并行执行无依赖节点
    3. 节点间通过 SharedMemory 传递数据
    4. 审查反馈闭环（Reviewer 可触发回退）
    """

    def __init__(self, event_bus: EventBus | None = None):
        self.event_bus = event_bus or EventBus()
        self.max_review_rounds = 2

    def create_default_dag(self, query: str, competitors: list[str]) -> DAGPlan:
        """为竞品分析任务创建默认 DAG"""
        nodes = []

        nodes.append(
            DAGNode(
                node_id="orchestrate",
                agent_role=AgentRole.ORCHESTRATOR,
                task_description=(
                    f"Plan the competitive analysis for: {query}. "
                    f"Competitors to analyze: {', '.join(competitors)}"
                ),
                dependencies=[],
            )
        )

        for i, comp in enumerate(competitors):
            nodes.append(
                DAGNode(
                    node_id=f"collect_{i}",
                    agent_role=AgentRole.COLLECTOR,
                    task_description=f"Collect public information about: {comp}",
                    dependencies=["orchestrate"],
                )
            )

        collect_ids = [f"collect_{i}" for i in range(len(competitors))]
        nodes.append(
            DAGNode(
                node_id="analyze",
                agent_role=AgentRole.ANALYST,
                task_description=(
                    "Analyze collected data for all competitors. "
                    "Create feature comparison, market positioning, and SWOT."
                ),
                dependencies=collect_ids,
            )
        )

        nodes.append(
            DAGNode(
                node_id="write",
                agent_role=AgentRole.WRITER,
                task_description=(
                    "Write a comprehensive competitive analysis report "
                    "with executive summary, feature comparison, SWOT analysis, "
                    "and strategic recommendations."
                ),
                dependencies=["analyze"],
            )
        )

        nodes.append(
            DAGNode(
                node_id="review",
                agent_role=AgentRole.REVIEWER,
                task_description=(
                    "Review the report for accuracy, completeness, and citation quality. "
                    "Score each dimension and provide specific improvement suggestions."
                ),
                dependencies=["write"],
            )
        )

        nodes.append(
            DAGNode(
                node_id="cite",
                agent_role=AgentRole.CITATION,
                task_description=(
                    "Verify all citations in the report. Ensure every claim "
                    "is properly attributed to a source URL with relevant snippet."
                ),
                dependencies=["review"],
            )
        )

        return DAGPlan(query=query, nodes=nodes)

    async def execute(
        self,
        plan: DAGPlan,
        agent_executor: AgentExecutor,
    ) -> dict[str, Any]:
        """执行 DAG 计划"""
        results: dict[str, Any] = {}
        node_map = {n.node_id: n for n in plan.nodes}
        start_time = time.time()

        await self.event_bus.publish(
            Event("dag_started", "orchestrator", {"plan_id": plan.plan_id})
        )

        while True:
            ready_nodes = [
                n
                for n in plan.nodes
                if n.status == TaskStatus.PENDING
                and all(
                    node_map[dep].status == TaskStatus.COMPLETED
                    for dep in n.dependencies
                )
            ]

            if not ready_nodes:
                all_done = all(
                    n.status in (TaskStatus.COMPLETED, TaskStatus.FAILED)
                    for n in plan.nodes
                )
                if all_done:
                    break
                pending = [
                    n.node_id
                    for n in plan.nodes
                    if n.status == TaskStatus.PENDING
                ]
                if pending:
                    logger.warning(
                        f"Deadlock detected, pending nodes: {pending}"
                    )
                    for nid in pending:
                        node_map[nid].status = TaskStatus.FAILED
                break

            dep_results = {}
            for rn in ready_nodes:
                for dep_id in rn.dependencies:
                    if dep_id in results:
                        dep_results[dep_id] = results[dep_id]

            tasks = []
            for node in ready_nodes:
                node.status = TaskStatus.RUNNING
                node.started_at = datetime.now()
                await self.event_bus.publish(
                    Event(
                        "node_started",
                        node.node_id,
                        {
                            "role": node.agent_role.value,
                            "task": node.task_description[:100],
                        },
                    )
                )
                tasks.append(self._execute_node(node, dep_results, agent_executor))

            node_results = await asyncio.gather(*tasks, return_exceptions=True)

            for node, result in zip(ready_nodes, node_results):
                if isinstance(result, Exception):
                    node.status = TaskStatus.FAILED
                    results[node.node_id] = {"error": str(result)}
                    await self.event_bus.publish(
                        Event(
                            "node_failed",
                            node.node_id,
                            {"error": str(result)},
                        )
                    )
                else:
                    node.status = TaskStatus.COMPLETED
                    node.completed_at = datetime.now()
                    node.output = result
                    results[node.node_id] = result
                    await self.event_bus.publish(
                        Event(
                            "node_completed",
                            node.node_id,
                            {"summary": str(result)[:200]},
                        )
                    )

        total_ms = int((time.time() - start_time) * 1000)
        await self.event_bus.publish(
            Event(
                "dag_completed",
                "orchestrator",
                {"total_ms": total_ms, "results_count": len(results)},
            )
        )

        return results

    async def _execute_node(
        self,
        node: DAGNode,
        dep_results: dict,
        agent_executor: AgentExecutor,
    ) -> dict:
        return await agent_executor(node, dep_results)
