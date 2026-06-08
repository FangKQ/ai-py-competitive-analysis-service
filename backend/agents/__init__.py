"""
竞品分析 Agent 协作引擎 - 核心入口

报告生成：Orchestrator-Worker 模式 + DAG 编排 + Harness 五层
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime

from openai import AsyncOpenAI

from agents.base import BaseAgent
from agents.prompts import (
    ORCHESTRATOR_PROMPT,
    COLLECTOR_INDUSTRY_PROMPT,
    COLLECTOR_CUSTOMER_PROMPT,
    COLLECTOR_COMPETITOR_PROMPT,
    ANALYST_PROMPT,
    WRITER_PROMPT,
    REVIEWER_PROMPT,
    CITATION_PROMPT,
    ARBITER_ANALYSIS_PROMPT,
    ARBITER_REPORT_PROMPT,
)
from agents.arbiter import ArbiterAgent
from harness.context import SharedMemory
from harness.capability import ToolRegistry, create_default_tools
from harness.governance import GovernanceLayer
from harness.providers import OpenAIProvider, AnthropicProvider, create_openai_provider, create_anthropic_provider
from harness.surface import DAGOrchestrator, EventBus, Event
from schemas import (
    AgentRole,
    AnalysisTask,
    CompetitiveReport,
    CompetitorProfile,
    DAGNode,
    DAGPlan,
    ReportDepth,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class CompetitiveAnalysisEngine:
    """竞品分析引擎 - 竞品报告生成"""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        model: str = "gpt-5.5-2026-04-23",
        model_large: str = "",
        model_small: str = "",
        task_id: str = "",
        anthropic_api_key: str = "",
        anthropic_model: str = "claude-sonnet-4-20250514",
        cross_validation_enabled: bool = False,
    ):
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.model_large = model_large or model
        self.model_small = model_small or model
        self.task_id = task_id
        self.cross_validation_enabled = cross_validation_enabled
        self.shared_memory = SharedMemory()
        self.governance = GovernanceLayer()
        self.event_bus = EventBus()
        self.tools = create_default_tools()
        self.dag_orchestrator = DAGOrchestrator(event_bus=self.event_bus)
        self._agents: dict[str, BaseAgent] = {}

        # Provider instances
        self.openai_provider = create_openai_provider(
            api_key=api_key,
            base_url=base_url,
            model=self.model_large,
        )
        self.openai_provider_small = create_openai_provider(
            api_key=api_key,
            base_url=base_url,
            model=self.model_small,
        )

        # Anthropic provider (for cross-validation and arbiter)
        self.anthropic_provider = None
        if anthropic_api_key and cross_validation_enabled:
            self.anthropic_provider = create_anthropic_provider(
                api_key=anthropic_api_key,
                model=anthropic_model,
            )

    def _create_agent(self, role: AgentRole, prompt: str, node_id: str = "", provider_id: str = "openai") -> BaseAgent:
        """Create an agent with the given role and system prompt.

        Uses model layering: Analyst/Writer use large model for deep reasoning,
        other roles use small model for speed and cost efficiency.
        If user config is available (from DB snapshot), override defaults.

        :param role: agent role
        :param prompt: system prompt
        :param node_id: DAG node identifier
        :param provider_id: which provider to use (openai | anthropic)
        :return: configured BaseAgent instance
        """
        role_key = role.value
        enabled_tools: list[str] | None = None

        # Check if we have a user config snapshot for this role
        if hasattr(self, "_config_snapshot") and role_key in self._config_snapshot:
            cfg = self._config_snapshot[role_key]
            model = cfg.get("model", self.model_small)
            prompt = cfg.get("system_prompt", prompt)
            enabled_tools = cfg.get("enabled_tools")
        else:
            # Fallback: model layering based on role
            heavy_roles = {AgentRole.ANALYST, AgentRole.WRITER}
            model = self.model_large if role in heavy_roles else self.model_small

        # Select provider based on provider_id
        provider = None
        if provider_id == "anthropic" and self.anthropic_provider:
            provider = self.anthropic_provider
        else:
            # Default to OpenAI
            heavy_roles = {AgentRole.ANALYST, AgentRole.WRITER}
            if role in heavy_roles:
                provider = self.openai_provider
            else:
                provider = self.openai_provider_small

        agent = BaseAgent(
            role=role,
            system_prompt=prompt,
            provider=provider,
            model=model,
            tools=self.tools,
            shared_memory=self.shared_memory,
            governance=self.governance,
            event_bus=self.event_bus,
            node_id=node_id,
            enabled_tools=enabled_tools,
        )
        self._agents[agent.runtime.agent_id] = agent
        return agent

    async def _publish_node_trace(
        self, node_id: str, label: str, agent: BaseAgent
    ) -> None:
        """Publish a node_trace event with reasoning, tool calls, tokens, duration."""
        logs = agent.runtime.decision_logs
        total_duration_ms = sum(log.duration_ms for log in logs)

        # Use actual tracked tool call results (with real status)
        tool_calls = getattr(agent.runtime, "_tool_call_results", [])

        # Build human-readable reasoning (not raw JSON)
        reasoning = self._build_readable_reasoning(agent, logs)

        await self.event_bus.publish(Event(
            "node_trace", node_id,
            {
                "role": agent.role.value,
                "label": label,
                "reasoning": reasoning,
                "tool_calls": tool_calls[:20],
                "input_tokens": agent.runtime.total_input_tokens,
                "output_tokens": agent.runtime.total_output_tokens,
                "duration_ms": total_duration_ms,
            },
        ))

    def _build_readable_reasoning(
        self, agent: BaseAgent, logs: list
    ) -> str:
        """Convert raw agent output into human-readable reasoning summary."""
        if not logs:
            return ""

        # Get the full final result from shared memory if available
        last_reasoning = ""
        for log in reversed(logs):
            if log.reasoning:
                last_reasoning = log.reasoning
                break

        if not last_reasoning:
            return ""

        # If it looks like JSON, parse and format as readable text
        stripped = last_reasoning.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            # Try to find complete JSON
            try:
                start = stripped.find("{")
                end = stripped.rfind("}") + 1
                if start >= 0 and end > start:
                    data = json.loads(stripped[start:end])
                    return self._json_to_readable(data, agent.role.value)
            except json.JSONDecodeError:
                pass
            # If JSON parse fails, extract readable parts manually
            return self._extract_readable_from_partial(stripped, agent.role.value)

        # For Analyst/Writer, extract 【思考过程】 section if present
        if agent.role.value in ("analyst", "writer"):
            thinking = self._extract_thinking_section(stripped)
            if thinking:
                return thinking
            # Fallback: if no thinking section marker, show first 300 chars of output
            return stripped[:300]

        # For other roles with plain text reasoning
        return last_reasoning[:300]

    def _extract_thinking_section(self, text: str) -> str:
        """Extract 【思考过程】 content from agent output."""
        marker_start = "【思考过程】"
        marker_end = "【正式输出】"

        start_idx = text.find(marker_start)
        if start_idx == -1:
            return ""

        content_start = start_idx + len(marker_start)
        end_idx = text.find(marker_end, content_start)

        if end_idx == -1:
            # No end marker, take next 300 chars
            thinking = text[content_start:content_start + 300].strip()
        else:
            thinking = text[content_start:end_idx].strip()

        return thinking

    def _strip_thinking_section(self, text: str) -> str:
        """Remove 【思考过程】...【正式输出】 prefix from output, keep only the content."""
        marker_end = "【正式输出】"
        end_idx = text.find(marker_end)
        if end_idx != -1:
            return text[end_idx + len(marker_end):].strip()
        # If no marker, check if it starts with 【思考过程】 and try to find the real content
        marker_start = "【思考过程】"
        if text.strip().startswith(marker_start):
            # Look for JSON start or markdown heading as content start
            for delimiter in ["{", "# "]:
                d_idx = text.find(delimiter, len(marker_start))
                if d_idx != -1:
                    return text[d_idx:].strip()
        return text

    def _extract_readable_from_partial(self, text: str, role: str) -> str:
        """Extract readable info from partial/invalid JSON text."""
        import re
        parts = []

        # Extract key-value pairs like "analysis_title": "xxx"
        for match in re.finditer(r'"(\w+)":\s*"([^"]+)"', text):
            key, value = match.groups()
            readable_keys = {
                "analysis_title": "报告标题",
                "granularity": "分析粒度",
                "target": "分析目标",
                "industry": "所属行业",
            }
            if key in readable_keys:
                if key == "granularity":
                    value = "产品级" if value == "product" else "行业级"
                parts.append(f"{readable_keys[key]}：{value}")

        # Extract arrays like "competitors": ["a", "b"]
        comp_match = re.search(r'"competitors":\s*\[([^\]]+)\]', text)
        if comp_match:
            comps = re.findall(r'"([^"]+)"', comp_match.group(1))
            if comps:
                parts.append(f"识别竞品：{', '.join(comps)}")

        return "\n".join(parts) if parts else ""

    def _json_to_readable(self, data: dict, role: str) -> str:
        """Convert structured JSON output to human-readable text."""
        parts = []

        if role == "orchestrator":
            if "analysis_title" in data:
                parts.append(f"报告标题：{data['analysis_title']}")
            if "granularity" in data:
                g = "产品级" if data["granularity"] == "product" else "行业级"
                parts.append(f"分析粒度：{g}")
            if "competitors" in data:
                parts.append(f"识别竞品：{', '.join(data['competitors'])}")
            if "industry" in data:
                parts.append(f"所属行业：{data['industry']}")
            if "self_profile" in data:
                sp = data["self_profile"]
                if isinstance(sp, dict) and sp.get("core_capabilities"):
                    parts.append(f"核心能力：{', '.join(sp['core_capabilities'][:3])}")

        elif role == "collector":
            if "dimension" in data:
                parts.append(f"采集维度：{data['dimension']}")
            sources = data.get("sources", [])
            if sources:
                parts.append(f"获取 {len(sources)} 条来源")
                for s in sources[:3]:
                    if isinstance(s, dict):
                        parts.append(f"  • {s.get('title', s.get('url', ''))}")

        elif role == "reviewer":
            if "overall_score" in data:
                parts.append(f"总体评分：{data['overall_score']}/10")
            if "approved" in data:
                parts.append(f"审查结果：{'通过' if data['approved'] else '未通过'}")
            issues = data.get("issues", [])
            if issues:
                parts.append(f"发现 {len(issues)} 个问题：")
                for issue in issues[:5]:
                    if isinstance(issue, dict):
                        severity = issue.get("severity", "")
                        desc = issue.get("description", "")
                        location = issue.get("location", "")
                        parts.append(f"  • [{severity}] {desc}" + (f"（{location}）" if location else ""))
                    elif isinstance(issue, str):
                        parts.append(f"  • {issue}")
            suggestions = data.get("suggestions", [])
            if suggestions:
                parts.append("改进建议：")
                for s in suggestions[:3]:
                    parts.append(f"  • {s}")

        # Generic fallback for other roles
        if not parts:
            # Extract first few meaningful string values
            for k, v in list(data.items())[:5]:
                if isinstance(v, str) and v:
                    parts.append(f"{k}：{v[:100]}")
                elif isinstance(v, list) and v:
                    parts.append(f"{k}：{len(v)} 项")

        return "\n".join(parts) if parts else str(data)[:300]

    async def analyze(self, task: AnalysisTask) -> CompetitiveReport:
        """Execute the full Five Looks Three Defines analysis pipeline."""
        start_time = time.time()
        task.status = TaskStatus.RUNNING

        # Snapshot agent configs from DB at task start
        try:
            from agents.config_store import config_store
            all_configs = await config_store.get_all()
            self._config_snapshot = {cfg["role"]: cfg for cfg in all_configs}
        except Exception:
            self._config_snapshot = {}

        await self.event_bus.publish(Event(
            "analysis_started", "engine",
            {"task_id": task.task_id, "query": task.query},
        ))

        competitors = task.competitors
        report_depth = task.report_depth.value if task.report_depth else "standard"
        self_description = task.self_description or ""

        # ─── Phase 1: Orchestrator - Parse input & plan collection tasks ───
        await self.event_bus.publish(Event(
            "node_started", "orchestrate",
            {"role": "orchestrator", "task": "解析需求 + 规划采集任务"},
        ))
        orchestrator = self._create_agent(AgentRole.ORCHESTRATOR, ORCHESTRATOR_PROMPT, "orchestrate")
        plan_result = await orchestrator.execute(
            f"请规划竞品分析任务。\n\n"
            f"分析目标: {task.query}\n"
            f"自身情况: {self_description}\n"
            f"指定竞品: {', '.join(competitors) if competitors else '未指定，请自动识别'}\n"
            f"行业: {task.industry or '自动判断'}\n"
            f"关注维度: {', '.join(task.focus_areas) if task.focus_areas else '全面覆盖'}\n"
            f"报告篇幅: {report_depth}"
        )
        plan_text = plan_result.get("result", "")
        self.shared_memory.write("analysis_plan", plan_text, "orchestrator")
        self.shared_memory.write("self_description", self_description, "orchestrator")
        self.shared_memory.write("report_depth", report_depth, "orchestrator")

        # Try to extract competitors from plan if not user-specified
        if not competitors:
            competitors = self._extract_competitors_from_plan(plan_text)
        if not competitors:
            competitors = ["Competitor A", "Competitor B", "Competitor C"]

        await self.event_bus.publish(Event(
            "node_completed", "orchestrate",
            {"summary": f"规划完成，识别 {len(competitors)} 个竞品"},
        ))
        await self._publish_node_trace("orchestrate", "编排器", orchestrator)

        # ─── Publish dag_plan event for frontend dynamic rendering ────────
        dag_nodes = [
            {"id": "orchestrate", "role": "orchestrator", "label": "编排器"},
            {"id": "collect_industry", "role": "collector", "label": "行业/趋势采集"},
            {"id": "collect_customer", "role": "collector", "label": "市场/客户采集"},
        ]
        for i, comp in enumerate(competitors):
            dag_nodes.append({
                "id": f"collect_competitor_{i}",
                "role": "collector",
                "label": comp,
            })
        if self.cross_validation_enabled and self.anthropic_provider:
            dag_nodes.extend([
                {"id": "analyze_gpt", "role": "analyst", "label": "分析师(GPT)"},
                {"id": "analyze_claude", "role": "analyst", "label": "分析师(Claude)"},
                {"id": "arbiter_analysis", "role": "arbiter", "label": "仲裁官(分析)"},
                {"id": "writer_gpt", "role": "writer", "label": "撰写者(GPT)"},
                {"id": "writer_claude", "role": "writer", "label": "撰写者(Claude)"},
                {"id": "arbiter_report", "role": "arbiter", "label": "仲裁官(报告)"},
                {"id": "cite", "role": "citation", "label": "引用器"},
                {"id": "review", "role": "reviewer", "label": "审核员"},
            ])
        else:
            dag_nodes.extend([
                {"id": "analyze", "role": "analyst", "label": "分析师"},
                {"id": "write", "role": "writer", "label": "撰写者"},
                {"id": "cite", "role": "citation", "label": "引用器"},
                {"id": "review", "role": "reviewer", "label": "审核员"},
            ])
        await self.event_bus.publish(Event(
            "dag_plan", "engine", {"nodes": dag_nodes}
        ))

        # ─── Phase 2: Collectors in parallel (by dimension) ───────────────
        collect_tasks = []
        collector_meta = []
        collector_agents = []

        # 2a: Industry/Trends Collector
        await self.event_bus.publish(Event(
            "node_started", "collect_industry",
            {"role": "collector", "task": "采集行业/趋势数据"},
        ))
        industry_collector = self._create_agent(
            AgentRole.COLLECTOR, COLLECTOR_INDUSTRY_PROMPT, "collect_industry"
        )
        collect_tasks.append(industry_collector.execute(
            f"请采集以下行业的趋势数据。\n\n"
            f"分析目标: {task.query}\n"
            f"行业: {task.industry or '根据分析目标判断'}\n"
            f"采集维度: 市场规模、增长率、技术趋势、政策环境、生命周期阶段"
        ))
        collector_meta.append(("collect_industry", "行业/趋势采集"))
        collector_agents.append(industry_collector)

        # 2b: Market/Customer Collector
        await self.event_bus.publish(Event(
            "node_started", "collect_customer",
            {"role": "collector", "task": "采集市场/客户数据"},
        ))
        customer_collector = self._create_agent(
            AgentRole.COLLECTOR, COLLECTOR_CUSTOMER_PROMPT, "collect_customer"
        )
        collect_tasks.append(customer_collector.execute(
            f"请采集目标市场的客户数据。\n\n"
            f"分析目标: {task.query}\n"
            f"行业: {task.industry or '根据分析目标判断'}\n"
            f"采集维度: 客户画像、需求痛点、决策因素、未满足需求"
        ))
        collector_meta.append(("collect_customer", "市场/客户采集"))
        collector_agents.append(customer_collector)

        # 2c: Competitor Collectors (one per competitor, parallel)
        for i, comp in enumerate(competitors):
            node_id = f"collect_competitor_{i}"
            await self.event_bus.publish(Event(
                "node_started", node_id,
                {"role": "collector", "task": f"采集竞品 {comp} 信息"},
            ))
            comp_collector = self._create_agent(
                AgentRole.COLLECTOR, COLLECTOR_COMPETITOR_PROMPT, node_id
            )
            collect_tasks.append(comp_collector.execute(
                f"请采集以下竞品的公开信息。\n\n"
                f"竞品名称: {comp}\n"
                f"分析背景: {task.query}\n"
                f"采集维度: 公司信息、产品功能、定价策略、近期动态、市场定位"
            ))
            collector_meta.append((node_id, comp))
            collector_agents.append(comp_collector)

        # Execute all collectors in parallel
        collect_results = await asyncio.gather(*collect_tasks, return_exceptions=True)

        # Process results
        collected_data: dict = {
            "industry": None,
            "customers": None,
            "competitors": [],
        }
        all_collected_urls: list[dict] = []

        for idx, (result, (node_id, label)) in enumerate(
            zip(collect_results, collector_meta)
        ):
            agent = collector_agents[idx]
            if isinstance(result, Exception):
                logger.error(f"Collection failed for {label}: {result}")
                await self.event_bus.publish(Event(
                    "node_failed", node_id, {"error": str(result)}
                ))
                if "industry" in node_id:
                    collected_data["industry"] = {"error": str(result)}
                elif "customer" in node_id:
                    collected_data["customers"] = {"error": str(result)}
                else:
                    collected_data["competitors"].append(
                        {"name": label, "error": str(result)}
                    )
            else:
                result_text = result.get("result", "")
                # Collect URLs from this agent's tool calls
                urls = result.get("collected_urls", [])
                all_collected_urls.extend(urls)
                await self.event_bus.publish(Event(
                    "node_completed", node_id, {"summary": f"{label} 采集完成"}
                ))
                await self._publish_node_trace(node_id, label, agent)
                if "industry" in node_id:
                    collected_data["industry"] = result_text
                elif "customer" in node_id:
                    collected_data["customers"] = result_text
                else:
                    collected_data["competitors"].append(
                        {"name": label, "data": result_text}
                    )

        # Store collected URLs in shared memory for Analyst/Writer
        collected_data["all_sources"] = all_collected_urls[:30]

        collected_json = json.dumps(collected_data, ensure_ascii=False, default=str)
        self.shared_memory.write("collected_data", collected_json[:12000], "collector")

        # ─── Phase 3: Analyst - Five Looks + Three Defines ────────────────
        await self.event_bus.publish(Event(
            "node_started", "analyze",
            {"role": "analyst", "task": "结构化分析"},
        ))

        # Build sources reference for citation chain
        sources_ref = json.dumps(
            collected_data.get("all_sources", [])[:20],
            ensure_ascii=False,
        )
        analyst_task_msg = (
            f"请基于以下数据完成结构化分析。\n\n"
            f"【分析目标】{task.query}\n"
            f"【竞品列表】{', '.join(competitors)}\n"
            f"【自身情况】{self_description}\n"
            f"【报告篇幅】{report_depth}\n\n"
            f"【行业数据】\n{collected_data.get('industry', '无数据')}\n\n"
            f"【客户数据】\n{collected_data.get('customers', '无数据')}\n\n"
            f"【竞品数据】\n{json.dumps(collected_data.get('competitors', []), ensure_ascii=False, default=str)[:6000]}\n\n"
            f"【可用引用来源 - 请在 evidence 中使用这些真实 URL】\n{sources_ref}"
        )

        if self.cross_validation_enabled and self.anthropic_provider:
            # Parallel dual-model analysis + arbiter
            analyst_gpt = self._create_agent(AgentRole.ANALYST, ANALYST_PROMPT, "analyze_gpt", "openai")
            analyst_claude = self._create_agent(AgentRole.ANALYST, ANALYST_PROMPT, "analyze_claude", "anthropic")

            await self.event_bus.publish(Event(
                "node_started", "analyze_gpt",
                {"role": "analyst", "task": "GPT 结构化分析"},
            ))
            await self.event_bus.publish(Event(
                "node_started", "analyze_claude",
                {"role": "analyst", "task": "Claude 结构化分析"},
            ))

            gpt_result, claude_result = await asyncio.gather(
                analyst_gpt.execute(analyst_task_msg),
                analyst_claude.execute(analyst_task_msg),
                return_exceptions=True,
            )

            gpt_text = gpt_result.get("result", "") if isinstance(gpt_result, dict) else ""
            claude_text = claude_result.get("result", "") if isinstance(claude_result, dict) else ""

            # Log results for debugging
            if isinstance(gpt_result, dict):
                logger.info(f"GPT Analyst: status={gpt_result.get('status')}, result_len={len(gpt_text)}, iterations={gpt_result.get('iterations')}")
            if isinstance(claude_result, dict):
                logger.info(f"Claude Analyst: status={claude_result.get('status')}, result_len={len(claude_text)}, iterations={claude_result.get('iterations')}")

            # Handle failures gracefully
            if isinstance(gpt_result, Exception):
                logger.error(f"GPT Analyst failed: {gpt_result}")
                gpt_text = ""
                await self.event_bus.publish(Event("node_failed", "analyze_gpt", {"error": str(gpt_result)}))
            elif isinstance(gpt_result, dict) and gpt_result.get("status") == "failed":
                logger.error(f"GPT Analyst returned failed status")
                gpt_text = ""
                await self.event_bus.publish(Event("node_failed", "analyze_gpt", {"error": "agent returned failed status"}))
            if isinstance(claude_result, Exception):
                logger.error(f"Claude Analyst failed: {claude_result}")
                claude_text = ""
                await self.event_bus.publish(Event("node_failed", "analyze_claude", {"error": str(claude_result)}))
            elif isinstance(claude_result, dict) and claude_result.get("status") == "failed":
                logger.error(f"Claude Analyst returned failed status")
                claude_text = ""
                await self.event_bus.publish(Event("node_failed", "analyze_claude", {"error": "agent returned failed status"}))

            # If both failed, fallback to single model
            if not gpt_text and not claude_text:
                logger.warning("Both analysts failed, falling back to single-model")
                await self.event_bus.publish(Event("node_failed", "analyze_gpt", {"error": "fallback triggered"}))
                await self.event_bus.publish(Event("node_failed", "analyze_claude", {"error": "fallback triggered"}))
                analyst_fallback = self._create_agent(AgentRole.ANALYST, ANALYST_PROMPT, "analyze", "openai")
                fallback_result = await analyst_fallback.execute(analyst_task_msg)
                analysis_text = fallback_result.get("result", "")
                analysis_text = self._strip_thinking_section(analysis_text)
                await self._publish_node_trace("analyze", "分析师(fallback)", analyst_fallback)
            elif not claude_text:
                # Only GPT succeeded, skip arbiter
                analysis_text = gpt_text
                await self.event_bus.publish(Event("node_completed", "analyze_gpt", {"summary": "GPT 分析完成"}))
                await self._publish_node_trace("analyze_gpt", "分析师(GPT)", analyst_gpt)
                # Mark arbiter as skipped
                await self.event_bus.publish(Event("node_completed", "arbiter_analysis", {"summary": "仲裁跳过(仅GPT成功)"}))
            elif not gpt_text:
                # Only Claude succeeded, skip arbiter
                analysis_text = claude_text
                await self.event_bus.publish(Event("node_completed", "analyze_claude", {"summary": "Claude 分析完成"}))
                await self._publish_node_trace("analyze_claude", "分析师(Claude)", analyst_claude)
                # Mark arbiter as skipped
                await self.event_bus.publish(Event("node_completed", "arbiter_analysis", {"summary": "仲裁跳过(仅Claude成功)"}))
            else:
                # Both succeeded - run arbiter
                gpt_text = self._strip_thinking_section(gpt_text)
                claude_text = self._strip_thinking_section(claude_text)

                await self.event_bus.publish(Event("node_completed", "analyze_gpt", {"summary": "GPT 分析完成"}))
                await self.event_bus.publish(Event("node_completed", "analyze_claude", {"summary": "Claude 分析完成"}))
                await self._publish_node_trace("analyze_gpt", "分析师(GPT)", analyst_gpt)
                await self._publish_node_trace("analyze_claude", "分析师(Claude)", analyst_claude)

                # Arbiter fusion
                await self.event_bus.publish(Event(
                    "node_started", "arbiter_analysis",
                    {"role": "arbiter", "task": "仲裁融合分析结果"},
                ))
                arbiter = ArbiterAgent(
                    provider=self.anthropic_provider,
                    system_prompt=ARBITER_ANALYSIS_PROMPT,
                    event_bus=self.event_bus,
                    node_id="arbiter_analysis",
                )
                arbiter_result = await arbiter.execute(
                    result_a=gpt_text,
                    result_b=claude_text,
                    label_a="GPT",
                    label_b="Claude",
                )
                analysis_text = arbiter_result.get("result", "")
                logger.info(
                    f"Arbiter analysis result: status={arbiter_result.get('status')}, "
                    f"result_len={len(analysis_text)}"
                )
                # Publish trace for arbiter
                await self.event_bus.publish(Event(
                    "node_trace", "arbiter_analysis",
                    {
                        "role": "arbiter",
                        "label": "仲裁官(分析)",
                        "reasoning": analysis_text[:500] if analysis_text else "仲裁结果为空",
                        "tool_calls": [],
                        "input_tokens": arbiter_result.get("total_input_tokens", 0),
                        "output_tokens": arbiter_result.get("total_output_tokens", 0),
                        "duration_ms": 0,
                    },
                ))
                await self.event_bus.publish(Event(
                    "node_completed", "arbiter_analysis",
                    {"summary": "仲裁融合分析完成"},
                ))
        else:
            # Single model path
            analyst = self._create_agent(AgentRole.ANALYST, ANALYST_PROMPT, "analyze")
            analysis_result = await analyst.execute(analyst_task_msg)
            analysis_text = analysis_result.get("result", "")
            analysis_text = self._strip_thinking_section(analysis_text)
            await self._publish_node_trace("analyze", "分析师", analyst)

        self.shared_memory.write("analysis_result", analysis_text, "analyst")
        await self.event_bus.publish(Event(
            "node_completed", "analyze", {"summary": "结构化分析完成"}
        ))

        # ─── Phase 4: Writer - Generate report ────────────────────────────
        await self.event_bus.publish(Event(
            "node_started", "write",
            {"role": "writer", "task": "撰写竞品报告"},
        ))

        writer_task_msg = (
            f"请基于以下分析结果撰写竞品报告。\n\n"
            f"【分析目标】{task.query}\n"
            f"【报告篇幅】{report_depth}\n"
            f"【自身情况】{self_description}\n\n"
            f"【分析结果】\n{analysis_text[:10000]}"
        )

        if self.cross_validation_enabled and self.anthropic_provider:
            # Parallel dual-model writing + arbiter
            writer_gpt = self._create_agent(AgentRole.WRITER, WRITER_PROMPT, "writer_gpt", "openai")
            writer_claude = self._create_agent(AgentRole.WRITER, WRITER_PROMPT, "writer_claude", "anthropic")

            await self.event_bus.publish(Event(
                "node_started", "writer_gpt",
                {"role": "writer", "task": "GPT 撰写报告"},
            ))
            await self.event_bus.publish(Event(
                "node_started", "writer_claude",
                {"role": "writer", "task": "Claude 撰写报告"},
            ))

            gpt_report, claude_report = await asyncio.gather(
                writer_gpt.execute(writer_task_msg),
                writer_claude.execute(writer_task_msg),
                return_exceptions=True,
            )

            gpt_report_text = gpt_report.get("result", "") if isinstance(gpt_report, dict) else ""
            claude_report_text = claude_report.get("result", "") if isinstance(claude_report, dict) else ""

            # Handle failures gracefully
            if isinstance(gpt_report, Exception):
                logger.error(f"GPT Writer failed: {gpt_report}")
                gpt_report_text = ""
                await self.event_bus.publish(Event("node_failed", "writer_gpt", {"error": str(gpt_report)}))
            if isinstance(claude_report, Exception):
                logger.error(f"Claude Writer failed: {claude_report}")
                claude_report_text = ""
                await self.event_bus.publish(Event("node_failed", "writer_claude", {"error": str(claude_report)}))

            # Fallback logic
            if not gpt_report_text and not claude_report_text:
                logger.warning("Both writers failed, falling back to single-model")
                await self.event_bus.publish(Event("node_failed", "writer_gpt", {"error": "fallback triggered"}))
                await self.event_bus.publish(Event("node_failed", "writer_claude", {"error": "fallback triggered"}))
                writer_fallback = self._create_agent(AgentRole.WRITER, WRITER_PROMPT, "write", "openai")
                fallback_result = await writer_fallback.execute(writer_task_msg)
                draft_report = fallback_result.get("result", "")
                draft_report = self._strip_thinking_section(draft_report)
                await self._publish_node_trace("write", "撰写者(fallback)", writer_fallback)
            elif not claude_report_text:
                # Only GPT succeeded
                draft_report = self._strip_thinking_section(gpt_report_text)
                await self.event_bus.publish(Event("node_completed", "writer_gpt", {"summary": "GPT 报告完成"}))
                await self._publish_node_trace("writer_gpt", "撰写者(GPT)", writer_gpt)
                await self.event_bus.publish(Event("node_completed", "arbiter_report", {"summary": "仲裁跳过(仅GPT成功)"}))
            elif not gpt_report_text:
                # Only Claude succeeded
                draft_report = self._strip_thinking_section(claude_report_text)
                await self.event_bus.publish(Event("node_completed", "writer_claude", {"summary": "Claude 报告完成"}))
                await self._publish_node_trace("writer_claude", "撰写者(Claude)", writer_claude)
                await self.event_bus.publish(Event("node_completed", "arbiter_report", {"summary": "仲裁跳过(仅Claude成功)"}))
            else:
                # Both succeeded - run arbiter
                gpt_report_text = self._strip_thinking_section(gpt_report_text)
                claude_report_text = self._strip_thinking_section(claude_report_text)

                await self.event_bus.publish(Event("node_completed", "writer_gpt", {"summary": "GPT 报告完成"}))
                await self.event_bus.publish(Event("node_completed", "writer_claude", {"summary": "Claude 报告完成"}))
                await self._publish_node_trace("writer_gpt", "撰写者(GPT)", writer_gpt)
                await self._publish_node_trace("writer_claude", "撰写者(Claude)", writer_claude)

                # Arbiter fusion for report
                await self.event_bus.publish(Event(
                    "node_started", "arbiter_report",
                    {"role": "arbiter", "task": "仲裁融合报告"},
                ))
                report_arbiter = ArbiterAgent(
                    provider=self.anthropic_provider,
                    system_prompt=ARBITER_REPORT_PROMPT,
                    event_bus=self.event_bus,
                    node_id="arbiter_report",
                )
                arbiter_report_result = await report_arbiter.execute(
                    result_a=gpt_report_text,
                    result_b=claude_report_text,
                    label_a="GPT Writer",
                    label_b="Claude Writer",
                )
                draft_report = arbiter_report_result.get("result", "")
                logger.info(
                    f"Arbiter report result: status={arbiter_report_result.get('status')}, "
                    f"result_len={len(draft_report)}, "
                    f"tokens_in={arbiter_report_result.get('total_input_tokens', 0)}, "
                    f"tokens_out={arbiter_report_result.get('total_output_tokens', 0)}"
                )

                # Fallback: if arbiter produced empty result, use the longer report
                if not draft_report.strip():
                    logger.warning("Arbiter report returned empty, using longer individual report as fallback")
                    draft_report = gpt_report_text if len(gpt_report_text) >= len(claude_report_text) else claude_report_text
                # Publish trace for arbiter
                await self.event_bus.publish(Event(
                    "node_trace", "arbiter_report",
                    {
                        "role": "arbiter",
                        "label": "仲裁官(报告)",
                        "reasoning": draft_report[:500] if draft_report else "仲裁结果为空",
                        "tool_calls": [],
                        "input_tokens": arbiter_report_result.get("total_input_tokens", 0),
                        "output_tokens": arbiter_report_result.get("total_output_tokens", 0),
                        "duration_ms": 0,
                    },
                ))
                await self.event_bus.publish(Event(
                    "node_completed", "arbiter_report",
                    {"summary": "仲裁融合报告完成"},
                ))
        else:
            # Single model path
            writer = self._create_agent(AgentRole.WRITER, WRITER_PROMPT, "write")
            report_result = await writer.execute(writer_task_msg)
            draft_report = report_result.get("result", "")
            draft_report = self._strip_thinking_section(draft_report)
            await self._publish_node_trace("write", "撰写者", writer)

        self.shared_memory.write("draft_report", draft_report, "writer")
        await self.event_bus.publish(Event(
            "node_completed", "write", {"summary": "报告草稿完成"}
        ))

        # ─── Phase 5: Citation verification ───────────────────────────────
        await self.event_bus.publish(Event(
            "node_started", "cite",
            {"role": "citation", "task": "引用溯源验证"},
        ))
        citation_agent = self._create_agent(AgentRole.CITATION, CITATION_PROMPT, "cite")
        citation_result = await citation_agent.execute(
            f"请验证以下报告中的引用。\n\n"
            f"【报告正文】\n{draft_report[:8000]}"
        )
        self.shared_memory.write(
            "citation_verification",
            citation_result.get("result", ""),
            "citation",
        )
        await self.event_bus.publish(Event(
            "node_completed", "cite", {"summary": "引用溯源验证完成"}
        ))
        await self._publish_node_trace("cite", "引用器", citation_agent)

        # ─── Phase 6: Reviewer (final quality gate) ───────────────────────
        await self.event_bus.publish(Event(
            "node_started", "review",
            {"role": "reviewer", "task": "质量审查"},
        ))
        reviewer = self._create_agent(AgentRole.REVIEWER, REVIEWER_PROMPT, "review")
        review_result = await reviewer.execute(
            f"请审查以下竞品报告。\n\n"
            f"【报告篇幅要求】{report_depth}\n"
            f"【用户自身描述】{self_description[:500]}\n\n"
            f"【报告正文】\n{draft_report[:10000]}"
        )
        review_text = review_result.get("result", "")
        self.shared_memory.write("review_feedback", review_text, "reviewer")
        await self.event_bus.publish(Event(
            "node_completed", "review", {"summary": "质量审查完成"}
        ))
        await self._publish_node_trace("review", "审核员", reviewer)

        # ─── Build final report ───────────────────────────────────────────
        total_ms = int((time.time() - start_time) * 1000)
        all_logs = []
        for agent in self._agents.values():
            all_logs.extend(agent.runtime.decision_logs)
        total_tokens = sum(
            a.runtime.total_input_tokens + a.runtime.total_output_tokens
            for a in self._agents.values()
        )

        report = CompetitiveReport(
            title=f"{task.query} 竞争分析报告",
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

    def _extract_competitors_from_plan(self, plan_text: str) -> list[str]:
        """Try to extract competitor names from Orchestrator JSON output."""
        try:
            # Find JSON in the plan text
            start = plan_text.find("{")
            end = plan_text.rfind("}") + 1
            if start >= 0 and end > start:
                plan_data = json.loads(plan_text[start:end])
                competitors = plan_data.get("competitors", [])
                if isinstance(competitors, list) and competitors:
                    return competitors
        except (json.JSONDecodeError, KeyError):
            pass
        return []

    def get_status(self) -> dict:
        """Get current engine status."""
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
