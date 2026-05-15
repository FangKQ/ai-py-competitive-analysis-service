"""
Agent 基类 - 所有专职 Agent 的统一接口

参考：
- Claude Code 架构: Lead Agent + Specialist Agents + Shared Task System
- Harness Engineering: Agent = Model + Harness
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from anthropic import AsyncAnthropic

from harness.runtime import AgentRuntime
from harness.context import SharedMemory
from harness.capability import ToolRegistry
from harness.governance import GovernanceLayer
from harness.surface import EventBus, Event
from schemas import AgentRole, AgentDecisionLog

logger = logging.getLogger(__name__)


class BaseAgent:
    """Agent 基类 - 整合 Harness 五层"""

    def __init__(
        self,
        role: AgentRole,
        system_prompt: str,
        client: AsyncAnthropic,
        model: str = "MiniMax-M2.7",
        tools: ToolRegistry | None = None,
        shared_memory: SharedMemory | None = None,
        governance: GovernanceLayer | None = None,
        event_bus: EventBus | None = None,
    ):
        self.role = role
        self.system_prompt = system_prompt
        self.client = client
        self.model = model
        self.tools = tools
        self.shared_memory = shared_memory or SharedMemory()
        self.governance = governance or GovernanceLayer()
        self.event_bus = event_bus or EventBus()

        self.runtime = AgentRuntime(
            role=role,
            client=client,
            model=model,
        )

    async def execute(
        self, task_description: str, context: dict | None = None
    ) -> dict:
        """执行 Agent 任务"""
        enriched_prompt = self._build_prompt(context)

        tool_defs = None
        tool_executor = None
        if self.tools:
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
                    return await self.tools.execute(name, params)

                tool_executor = _executor

        await self.event_bus.publish(
            Event(
                "agent_started",
                self.runtime.agent_id,
                {"role": self.role.value, "task": task_description[:200]},
            )
        )

        result = await self.runtime.run(
            system_prompt=enriched_prompt,
            user_message=task_description,
            tools=tool_defs,
            tool_executor=tool_executor,
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

        return result

    def _build_prompt(self, context: dict | None = None) -> str:
        """构建增强后的系统提示"""
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
