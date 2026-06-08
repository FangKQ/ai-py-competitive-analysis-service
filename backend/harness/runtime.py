#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
@Time    : 2025-06-03
@Author  : Competitive Analysis Agent Team
@File    : runtime.py
@Desc    : Harness Layer 1: Runtime - Agent Loop state machine + error recovery + ratchet

Reference:
- Claude Code ReAct Loop: observe → think → act → verify → loop
- Harness Engineering (arxiv 2604.21003): Worker Agent execution + ratchet constraints
- Anthropic "Building Effective Agents": Agent = while loop + LLM + tools
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import json
import time
import uuid
import logging
from datetime import datetime
from typing import Any, Optional, Union

from harness.providers import LLMProvider, OpenAIProvider, AnthropicProvider, ProviderResponse

from schemas import (
    AgentDecisionLog,
    AgentRole,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class RatchetRule:
    """Ratchet rule - permanently convert errors into constraints to prevent repeated mistakes."""

    def __init__(self, trigger: str, constraint: str):
        self.trigger = trigger
        self.constraint = constraint
        self.created_at = datetime.now()
        self.trigger_count = 0


class AgentRuntime:
    """
    Agent Loop Runtime - Core ReAct cycle

    Implements Claude Code style Agent Loop:
    1. Observe: collect current state and context
    2. Think: LLM reasons about next step
    3. Act: execute tool calls
    4. Verify: check result quality
    5. Loop / Exit
    """

    def __init__(
        self,
        agent_id: str | None = None,
        role: AgentRole = AgentRole.ORCHESTRATOR,
        provider: Union[OpenAIProvider, AnthropicProvider, None] = None,
        client: Any = None,
        model: str = "gpt-5.5-2026-04-23",
        max_iterations: int = 20,
        max_tokens: int = 8192,
    ):
        """
        Initialize AgentRuntime.

        :param agent_id: unique agent identifier
        :param role: agent role enum
        :param provider: LLM provider instance (preferred)
        :param client: legacy AsyncOpenAI client (backward compatibility)
        :param model: model identifier (used with legacy client)
        :param max_iterations: maximum ReAct loop iterations
        :param max_tokens: max completion tokens per call
        """
        self.agent_id = agent_id or f"{role.value}_{uuid.uuid4().hex[:6]}"
        self.role = role
        self.model = model
        self.max_iterations = max_iterations
        self.max_tokens = max_tokens

        # Support both new Provider interface and legacy client
        if provider is not None:
            self.provider = provider
        elif client is not None:
            # Legacy path: wrap AsyncOpenAI client in OpenAIProvider
            from harness.providers import OpenAIProvider
            self.provider = OpenAIProvider(
                api_key=client.api_key or "",
                base_url=str(client.base_url) if client.base_url else "https://api.openai.com/v1",
                model=model,
            )
            # Reuse the existing client instance
            self.provider.client = client
        else:
            self.provider = None

        self.status = TaskStatus.PENDING
        self.ratchet_rules: list[RatchetRule] = []
        self.decision_logs: list[AgentDecisionLog] = []
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    def add_ratchet_rule(self, trigger: str, constraint: str) -> None:
        """
        Ratchet: convert error patterns into permanent constraints.

        :param trigger: error pattern that triggered this rule
        :param constraint: constraint text to inject into prompt
        """
        rule = RatchetRule(trigger=trigger, constraint=constraint)
        self.ratchet_rules.append(rule)
        logger.info(
            f"[{self.agent_id}] Ratchet rule added: {trigger} → {constraint}"
        )

    def get_ratchet_constraints(self) -> str:
        """
        Get all ratchet constraints as prompt text.

        :return: formatted constraint string
        """
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
        Execute Agent Loop - ReAct cycle.

        :param system_prompt: system prompt for the agent
        :param user_message: user/task message
        :param tools: tool definitions
        :param tool_executor: async callable for tool execution
        :param on_tool_call: optional async callback(tool_name, input, output, status)
        :return: dict with keys: result, decision_logs, tokens_used, etc.
        """
        if self.provider is None:
            raise RuntimeError("No LLM provider configured for AgentRuntime")

        self.status = TaskStatus.RUNNING
        self._tool_call_results: list[dict] = []

        full_system_prompt = system_prompt + self.get_ratchet_constraints()
        messages = [{"role": "user", "content": user_message}]

        iteration = 0
        final_result = None

        while iteration < self.max_iterations:
            iteration += 1
            start_time = time.time()

            try:
                response = await self.provider.chat(
                    system_prompt=full_system_prompt,
                    messages=messages,
                    tools=tools,
                    max_tokens=self.max_tokens,
                )

                duration_ms = int((time.time() - start_time) * 1000)
                self.total_input_tokens += response.input_tokens
                self.total_output_tokens += response.output_tokens

                has_tool_use = bool(response.tool_calls)

                log_entry = AgentDecisionLog(
                    agent_id=self.agent_id,
                    agent_role=self.role,
                    action=f"iteration_{iteration}",
                    reasoning=response.content[:2000],
                    tool_calls=response.tool_calls,
                    input_tokens=response.input_tokens,
                    output_tokens=response.output_tokens,
                    duration_ms=duration_ms,
                    result_summary=(
                        f"{'tool_use' if has_tool_use else 'text_response'}"
                        f" | finish={response.finish_reason}"
                    ),
                )
                self.decision_logs.append(log_entry)

                if not has_tool_use:
                    final_result = response.content
                    self.status = TaskStatus.COMPLETED
                    break

                # Append assistant message with tool calls to conversation
                assistant_msg = self.provider.build_assistant_message(response)
                messages.append(assistant_msg)

                # Execute tool calls and append results
                for tc in response.tool_calls:
                    tc_name = tc["name"]
                    tc_args = tc["input"]
                    tc_id = tc["id"]

                    if tool_executor:
                        try:
                            result = await tool_executor(tc_name, tc_args)
                            result_str = str(result)
                            tool_msg = self.provider.build_tool_result_message(tc_id, result_str)
                            messages.append(tool_msg)

                            if on_tool_call:
                                await on_tool_call(
                                    tc_name,
                                    str(tc_args)[:200],
                                    result_str[:200],
                                    "success",
                                )
                            self._tool_call_results.append({
                                "tool": tc_name,
                                "input": str(tc_args)[:200],
                                "output_summary": result_str[:200],
                                "status": "success",
                            })
                        except Exception as e:
                            error_msg = f"Tool error: {e}"
                            tool_msg = self.provider.build_tool_result_message(tc_id, error_msg)
                            messages.append(tool_msg)

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
                        tool_msg = self.provider.build_tool_result_message(tc_id, "Tool execution not available")
                        messages.append(tool_msg)

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
            # If iterations exhausted but we have tool results, do a final
            # summarization call without tools to force a text response
            if self._tool_call_results and final_result is None:
                try:
                    summary_messages = messages + [
                        {
                            "role": "user",
                            "content": (
                                "Based on all the tool results above, "
                                "please provide your final comprehensive response now. "
                                "Do not call any more tools."
                            ),
                        }
                    ]
                    summary_resp = await self.provider.chat(
                        system_prompt=full_system_prompt,
                        messages=summary_messages,
                        tools=None,
                        max_tokens=self.max_tokens,
                    )
                    if summary_resp.content:
                        final_result = summary_resp.content
                        self.status = TaskStatus.COMPLETED
                        self.total_input_tokens += summary_resp.input_tokens
                        self.total_output_tokens += summary_resp.output_tokens
                except Exception as e:
                    logger.warning(f"[{self.agent_id}] Final summary call failed: {e}")

            if self.status != TaskStatus.COMPLETED:
                self.status = TaskStatus.FAILED

        # Final safety net: if status is COMPLETED but result is empty
        if self.status == TaskStatus.COMPLETED and not final_result and self._tool_call_results:
            try:
                summary_messages = messages + [
                    {
                        "role": "user",
                        "content": (
                            "You have completed all tool calls. Now synthesize "
                            "the collected information into a clear, structured response. "
                            "Do not call any tools."
                        ),
                    }
                ]
                summary_resp = await self.provider.chat(
                    system_prompt=full_system_prompt,
                    messages=summary_messages,
                    tools=None,
                    max_tokens=self.max_tokens,
                )
                if summary_resp.content:
                    final_result = summary_resp.content
                    self.total_input_tokens += summary_resp.input_tokens
                    self.total_output_tokens += summary_resp.output_tokens
            except Exception as e:
                logger.warning(f"[{self.agent_id}] Safety-net summary call failed: {e}")
                final_result = "\n\n".join(
                    f"[{r['tool']}] {r['output_summary']}"
                    for r in self._tool_call_results
                )

        return {
            "result": final_result or "",
            "decision_logs": self.decision_logs,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "iterations": iteration,
            "status": self.status.value,
        }
