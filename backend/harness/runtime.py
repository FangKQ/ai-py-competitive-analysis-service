"""
Harness Layer 1: Runtime - Agent Loop 状态机 + 错误恢复 + 棘轮机制

参考：
- Claude Code ReAct Loop: 观察→思考→执行→验证→循环
- Harness Engineering (arxiv 2604.21003): Worker Agent 执行 + 棘轮约束
- Anthropic "Building Effective Agents": Agent = while loop + LLM + tools
"""
from __future__ import annotations

import asyncio
import time
import uuid
import logging
from datetime import datetime
from typing import Any, Optional

from anthropic import AsyncAnthropic

from schemas import (
    AgentDecisionLog,
    AgentRole,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class RatchetRule:
    """棘轮规则 - 错误永久转化为约束，防止重复犯错"""

    def __init__(self, trigger: str, constraint: str):
        self.trigger = trigger
        self.constraint = constraint
        self.created_at = datetime.now()
        self.trigger_count = 0


class AgentRuntime:
    """
    Agent Loop 运行时 - 核心 ReAct 循环

    实现 Claude Code 风格的 Agent Loop:
    1. Observe: 收集当前状态与上下文
    2. Think: LLM 推理下一步
    3. Act: 执行工具调用
    4. Verify: 检查结果质量
    5. Loop / Exit
    """

    def __init__(
        self,
        agent_id: str | None = None,
        role: AgentRole = AgentRole.ORCHESTRATOR,
        client: AsyncAnthropic | None = None,
        model: str = "MiniMax-M2.7",
        max_iterations: int = 20,
        max_tokens: int = 8192,
    ):
        self.agent_id = agent_id or f"{role.value}_{uuid.uuid4().hex[:6]}"
        self.role = role
        self.client = client
        self.model = model
        self.max_iterations = max_iterations
        self.max_tokens = max_tokens

        self.status = TaskStatus.PENDING
        self.ratchet_rules: list[RatchetRule] = []
        self.decision_logs: list[AgentDecisionLog] = []
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    def add_ratchet_rule(self, trigger: str, constraint: str) -> None:
        """棘轮：将错误模式转化为永久约束"""
        rule = RatchetRule(trigger=trigger, constraint=constraint)
        self.ratchet_rules.append(rule)
        logger.info(
            f"[{self.agent_id}] Ratchet rule added: {trigger} → {constraint}"
        )

    def get_ratchet_constraints(self) -> str:
        """获取所有棘轮约束的提示文本"""
        if not self.ratchet_rules:
            return ""
        constraints = "\n".join(
            f"- CONSTRAINT: {r.constraint} (triggered by: {r.trigger})"
            for r in self.ratchet_rules
        )
        return (
            f"\n\n## Active Constraints (learned from past errors)\n{constraints}\n"
        )

    async def run(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict] | None = None,
        tool_executor: Any = None,
    ) -> dict:
        """
        执行 Agent Loop - ReAct 循环

        Returns:
            dict with keys: result, decision_logs, tokens_used
        """
        self.status = TaskStatus.RUNNING
        messages = [{"role": "user", "content": user_message}]

        full_system = system_prompt + self.get_ratchet_constraints()

        iteration = 0
        final_result = None

        while iteration < self.max_iterations:
            iteration += 1
            start_time = time.time()

            try:
                kwargs: dict[str, Any] = {
                    "model": self.model,
                    "max_tokens": self.max_tokens,
                    "system": full_system,
                    "messages": messages,
                }
                if tools:
                    kwargs["tools"] = tools

                response = await self.client.messages.create(**kwargs)

                duration_ms = int((time.time() - start_time) * 1000)
                input_tokens = response.usage.input_tokens
                output_tokens = response.usage.output_tokens
                self.total_input_tokens += input_tokens
                self.total_output_tokens += output_tokens

                tool_calls = []
                text_parts = []
                has_tool_use = False

                for block in response.content:
                    if block.type == "text":
                        text_parts.append(block.text)
                    elif block.type == "tool_use":
                        has_tool_use = True
                        tool_calls.append(
                            {
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            }
                        )

                log_entry = AgentDecisionLog(
                    agent_id=self.agent_id,
                    agent_role=self.role,
                    action=f"iteration_{iteration}",
                    reasoning="\n".join(text_parts)[:500],
                    tool_calls=tool_calls,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    duration_ms=duration_ms,
                    result_summary=(
                        f"{'tool_use' if has_tool_use else 'text_response'}"
                        f" | stop={response.stop_reason}"
                    ),
                )
                self.decision_logs.append(log_entry)

                if not has_tool_use or response.stop_reason == "end_turn":
                    final_result = "\n".join(text_parts)
                    self.status = TaskStatus.COMPLETED
                    break

                messages.append({"role": "assistant", "content": response.content})

                tool_results = []
                for tc in tool_calls:
                    if tool_executor:
                        try:
                            result = await tool_executor(tc["name"], tc["input"])
                            tool_results.append(
                                {
                                    "type": "tool_result",
                                    "tool_use_id": tc["id"],
                                    "content": str(result),
                                }
                            )
                        except Exception as e:
                            error_msg = f"Tool error: {e}"
                            tool_results.append(
                                {
                                    "type": "tool_result",
                                    "tool_use_id": tc["id"],
                                    "content": error_msg,
                                    "is_error": True,
                                }
                            )
                            self.add_ratchet_rule(
                                trigger=f"Tool '{tc['name']}' failed: {e}",
                                constraint=(
                                    f"When using tool '{tc['name']}', "
                                    f"be aware it may fail. Handle gracefully."
                                ),
                            )
                    else:
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": tc["id"],
                                "content": "Tool execution not available",
                                "is_error": True,
                            }
                        )

                messages.append({"role": "user", "content": tool_results})

            except Exception as e:
                logger.error(
                    f"[{self.agent_id}] Error in iteration {iteration}: {e}"
                )
                self.decision_logs.append(
                    AgentDecisionLog(
                        agent_id=self.agent_id,
                        agent_role=self.role,
                        action=f"error_iteration_{iteration}",
                        reasoning=str(e),
                        duration_ms=int((time.time() - start_time) * 1000),
                        error=str(e),
                    )
                )
                self.add_ratchet_rule(
                    trigger=f"Runtime error: {e}",
                    constraint="Check inputs more carefully before API calls.",
                )
                if iteration >= 3:
                    self.status = TaskStatus.FAILED
                    break

        if self.status != TaskStatus.COMPLETED:
            self.status = TaskStatus.FAILED

        return {
            "result": final_result or "",
            "decision_logs": self.decision_logs,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "iterations": iteration,
            "status": self.status.value,
        }
