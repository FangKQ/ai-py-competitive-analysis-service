"""
Harness Layer 1: Runtime - Agent Loop 状态机 + 错误恢复 + 棘轮机制

参考：
- Claude Code ReAct Loop: 观察→思考→执行→验证→循环
- Harness Engineering (arxiv 2604.21003): Worker Agent 执行 + 棘轮约束
- Anthropic "Building Effective Agents": Agent = while loop + LLM + tools
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
import logging
from datetime import datetime
from typing import Any, Optional

from openai import AsyncOpenAI

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
        client: AsyncOpenAI | None = None,
        model: str = "gpt-5.5-2026-04-23",
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
        on_tool_call: Any = None,
    ) -> dict:
        """
        执行 Agent Loop - ReAct 循环 (OpenAI Chat Completions API)

        Args:
            on_tool_call: Optional async callback(tool_name, input, output, status)
                          called in real-time after each tool execution.

        Returns:
            dict with keys: result, decision_logs, tokens_used
        """
        self.status = TaskStatus.RUNNING
        self._tool_call_results: list[dict] = []
        messages = [
            {"role": "system", "content": system_prompt + self.get_ratchet_constraints()},
            {"role": "user", "content": user_message},
        ]

        # Convert Anthropic-style tool defs to OpenAI function calling format
        openai_tools = None
        if tools:
            openai_tools = []
            for t in tools:
                openai_tools.append({
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
                    },
                })

        iteration = 0
        final_result = None

        while iteration < self.max_iterations:
            iteration += 1
            start_time = time.time()

            try:
                kwargs: dict[str, Any] = {
                    "model": self.model,
                    "max_completion_tokens": self.max_tokens,
                    "messages": messages,
                }
                if openai_tools:
                    kwargs["tools"] = openai_tools

                response = await self.client.chat.completions.create(**kwargs)

                duration_ms = int((time.time() - start_time) * 1000)
                usage = response.usage
                input_tokens = usage.prompt_tokens if usage else 0
                output_tokens = usage.completion_tokens if usage else 0
                self.total_input_tokens += input_tokens
                self.total_output_tokens += output_tokens

                choice = response.choices[0]
                message = choice.message
                finish_reason = choice.finish_reason

                tool_calls = []
                text_content = message.content or ""
                has_tool_use = bool(message.tool_calls)

                if message.tool_calls:
                    for tc in message.tool_calls:
                        tool_calls.append({
                            "id": tc.id,
                            "name": tc.function.name,
                            "input": json.loads(tc.function.arguments) if tc.function.arguments else {},
                        })

                log_entry = AgentDecisionLog(
                    agent_id=self.agent_id,
                    agent_role=self.role,
                    action=f"iteration_{iteration}",
                    reasoning=text_content[:2000],
                    tool_calls=tool_calls,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    duration_ms=duration_ms,
                    result_summary=(
                        f"{'tool_use' if has_tool_use else 'text_response'}"
                        f" | finish={finish_reason}"
                    ),
                )
                self.decision_logs.append(log_entry)

                if not has_tool_use or finish_reason == "stop":
                    final_result = text_content
                    self.status = TaskStatus.COMPLETED
                    break

                # Append assistant message with tool calls
                messages.append(message.model_dump())

                # Execute tool calls and append results
                for tc in message.tool_calls:
                    tc_name = tc.function.name
                    tc_args = json.loads(tc.function.arguments) if tc.function.arguments else {}

                    if tool_executor:
                        try:
                            result = await tool_executor(tc_name, tc_args)
                            result_str = str(result)
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": result_str,
                            })
                            # Real-time callback for tool call success
                            if on_tool_call:
                                await on_tool_call(
                                    tc_name,
                                    str(tc_args)[:200],
                                    result_str[:200],
                                    "success",
                                )
                            # Track in tool_call_results
                            self._tool_call_results.append({
                                "tool": tc_name,
                                "input": str(tc_args)[:200],
                                "output_summary": result_str[:200],
                                "status": "success",
                            })
                        except Exception as e:
                            error_msg = f"Tool error: {e}"
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": error_msg,
                            })
                            # Real-time callback for tool call failure
                            if on_tool_call:
                                await on_tool_call(
                                    tc_name,
                                    str(tc_args)[:200],
                                    error_msg[:200],
                                    "failed",
                                )
                            self._tool_call_results.append({
                                "tool": tc_name,
                                "input": str(tc_args)[:200],
                                "output_summary": error_msg[:200],
                                "status": "failed",
                            })
                            self.add_ratchet_rule(
                                trigger=f"Tool '{tc_name}' failed: {e}",
                                constraint=(
                                    f"When using tool '{tc_name}', "
                                    f"be aware it may fail. Handle gracefully."
                                ),
                            )
                    else:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": "Tool execution not available",
                        })

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
