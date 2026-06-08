#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
@Time    : 2025-06-03
@Author  : Competitive Analysis Agent Team
@File    : base.py
@Desc    : Agent base class - unified interface for all specialist Agents

Reference:
- Claude Code architecture: Lead Agent + Specialist Agents + Shared Task System
- Harness Engineering: Agent = Model + Harness
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import logging
from typing import Any, Optional, Union

from harness.providers import OpenAIProvider, AnthropicProvider
from harness.runtime import AgentRuntime
from harness.context import SharedMemory
from harness.capability import ToolRegistry
from harness.governance import GovernanceLayer
from harness.surface import EventBus, Event
from schemas import AgentRole, AgentDecisionLog

logger = logging.getLogger(__name__)


class BaseAgent:
    """Agent base class - integrates Harness five layers."""

    def __init__(
        self,
        role: AgentRole,
        system_prompt: str,
        provider: Union[OpenAIProvider, AnthropicProvider, None] = None,
        client: Any = None,
        model: str = "gpt-4o-mini",
        tools: ToolRegistry | None = None,
        shared_memory: SharedMemory | None = None,
        governance: GovernanceLayer | None = None,
        event_bus: EventBus | None = None,
        node_id: str = "",
        enabled_tools: list[str] | None = None,
    ):
        """
        Initialize BaseAgent.

        :param role: agent role enum
        :param system_prompt: system prompt for this agent
        :param provider: LLM provider (preferred)
        :param client: legacy AsyncOpenAI client (backward compatibility)
        :param model: model identifier (used with legacy client)
        :param tools: tool registry
        :param shared_memory: shared memory for inter-agent communication
        :param governance: governance layer for permissions and budgets
        :param event_bus: event bus for observability
        :param node_id: DAG node identifier
        :param enabled_tools: list of enabled tool names for this agent
        """
        self.role = role
        self.system_prompt = system_prompt
        self.provider = provider
        self.model = model
        self.tools = tools
        self.shared_memory = shared_memory or SharedMemory()
        self.governance = governance or GovernanceLayer()
        self.event_bus = event_bus or EventBus()
        self.node_id = node_id
        self.enabled_tools = enabled_tools

        self.runtime = AgentRuntime(
            role=role,
            provider=provider,
            client=client,
            model=model,
        )

    async def execute(
        self, task_description: str, context: dict | None = None
    ) -> dict:
        """
        Execute Agent task.

        :param task_description: task description
        :param context: optional additional context
        :return: execution result dict
        """
        enriched_prompt = self._build_prompt(context)

        tool_defs = None
        tool_executor = None
        self._collected_urls: list[dict] = []

        if self.tools:
            if self.enabled_tools is not None:
                tool_defs = [
                    t for t in self.tools.get_tool_definitions()
                    if t["name"] in self.enabled_tools
                ]
            else:
                tool_defs = self.tools.get_tool_definitions_for_role(self.role.value)
            if not tool_defs:
                tool_defs = None
            else:
                async def _executor(name: str, params: dict) -> Any:
                    if self.governance:
                        if not self.governance.permissions.check_tool_access(
                            self.role, name
                        ):
                            return f"Permission denied: {self.role.value} cannot use {name}"
                    result = await self.tools.execute(name, params)
                    if name == "web_search":
                        self._extract_urls_from_search(result)
                    elif name == "fetch_webpage":
                        url = params.get("url", "")
                        if url:
                            self._collected_urls.append({"url": url, "title": url, "snippet": ""})
                    return result

                tool_executor = _executor

        await self.event_bus.publish(
            Event(
                "agent_started",
                self.runtime.agent_id,
                {"role": self.role.value, "task": task_description[:200]},
            )
        )

        async def _on_tool_call(
            tool_name: str, tool_input: str, tool_output: str, status: str
        ) -> None:
            await self.event_bus.publish(
                Event(
                    "tool_call",
                    self.node_id or self.runtime.agent_id,
                    {
                        "role": self.role.value,
                        "tool": tool_name,
                        "input": tool_input,
                        "output_summary": tool_output,
                        "status": status,
                    },
                )
            )

        result = await self.runtime.run(
            system_prompt=enriched_prompt,
            user_message=task_description,
            tools=tool_defs,
            tool_executor=tool_executor,
            on_tool_call=_on_tool_call,
        )

        if self.governance:
            self.governance.record_agent_action(
                agent_id=self.runtime.agent_id,
                role=self.role,
                action="task_completed",
                tokens_in=result.get("total_input_tokens", 0),
                tokens_out=result.get("total_output_tokens", 0),
                details={"iterations": result.get("iterations", 0)},
            )

        if self.shared_memory:
            self.shared_memory.write(
                f"{self.role.value}_result",
                result.get("result", ""),
                self.runtime.agent_id,
            )

        await self.event_bus.publish(
            Event(
                "agent_completed",
                self.runtime.agent_id,
                {
                    "role": self.role.value,
                    "status": result.get("status", "unknown"),
                    "tokens": (
                        result.get("total_input_tokens", 0)
                        + result.get("total_output_tokens", 0)
                    ),
                },
            )
        )

        if hasattr(self, "_collected_urls") and self._collected_urls:
            result["collected_urls"] = self._collected_urls

        return result

    def _extract_urls_from_search(self, search_result: str) -> None:
        """
        Extract URLs from web_search JSON result and store for citation chain.

        :param search_result: JSON string from web_search tool
        """
        try:
            data = json.loads(search_result)
            if isinstance(data, list):
                for item in data:
                    url = item.get("url", "")
                    if url and not url.startswith("Error"):
                        self._collected_urls.append({
                            "url": url if url.startswith("http") else f"https://{url}",
                            "title": item.get("title", ""),
                            "snippet": item.get("snippet", "")[:150],
                        })
        except (json.JSONDecodeError, TypeError):
            pass

    def _build_prompt(self, context: dict | None = None) -> str:
        """
        Build enriched system prompt.

        :param context: optional additional context
        :return: full system prompt string
        """
        parts = [self.system_prompt]

        if self.shared_memory:
            mem_context = self.shared_memory.to_context_string()
            if mem_context and mem_context != "[No shared data available yet]":
                parts.append(
                    f"\n\n## Shared Context from Other Agents\n{mem_context}"
                )

        if context:
            parts.append(
                f"\n\n## Additional Context\n{json.dumps(context, ensure_ascii=False, indent=2)}"
            )

        return "\n".join(parts)
