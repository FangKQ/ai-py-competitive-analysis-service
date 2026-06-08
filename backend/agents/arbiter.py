#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
@Time    : 2025-06-08
@Author  : AI agent from Team Levi
@File    : arbiter.py
@Desc    : Arbiter Agent - multi-model cross-validation and result fusion
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
import traceback
from typing import Any

from harness.providers import AnthropicProvider, ProviderResponse
from harness.surface import Event, EventBus
from schemas import AgentRole

logger = logging.getLogger(__name__)


class ArbiterAgent:
    """
    Arbiter Agent - fuses results from multiple models via Claude.

    Two modes:
    - Analysis arbitration: fuses two Analyst JSON outputs
    - Report arbitration: fuses two Writer Markdown outputs
    """

    def __init__(
        self,
        provider: AnthropicProvider,
        system_prompt: str,
        event_bus: EventBus | None = None,
        node_id: str = "",
        max_tokens: int = 32768,
    ) -> None:
        """
        Initialize Arbiter Agent.

        :param provider: Anthropic provider for Claude
        :param system_prompt: arbitration system prompt
        :param event_bus: event bus for observability
        :param node_id: DAG node identifier
        :param max_tokens: max output tokens
        """
        self.provider = provider
        self.system_prompt = system_prompt
        self.event_bus = event_bus or EventBus()
        self.node_id = node_id
        self.max_tokens = max_tokens
        self.role = AgentRole.ARBITER

    async def execute(
        self,
        result_a: str,
        result_b: str,
        label_a: str = "GPT",
        label_b: str = "Claude",
        context: dict | None = None,
    ) -> dict[str, Any]:
        """
        Execute arbitration by comparing and fusing two model outputs.

        :param result_a: first model output (text/JSON)
        :param result_b: second model output (text/JSON)
        :param label_a: label for first model
        :param label_b: label for second model
        :param context: optional additional context
        :return: dict with fused result and metadata
        """
        await self.event_bus.publish(
            Event(
                "arbiter_started",
                self.node_id,
                {
                    "role": self.role.value,
                    "label_a": label_a,
                    "label_b": label_b,
                    "input_a_length": len(result_a),
                    "input_b_length": len(result_b),
                },
            )
        )

        # Build the arbitration input
        user_message = self._build_arbitration_input(
            result_a, result_b, label_a, label_b, context
        )

        try:
            response: ProviderResponse = await self.provider.chat(
                system_prompt=self.system_prompt,
                messages=[{"role": "user", "content": user_message}],
                tools=None,
                max_tokens=self.max_tokens,
            )

            await self.event_bus.publish(
                Event(
                    "arbiter_completed",
                    self.node_id,
                    {
                        "role": self.role.value,
                        "output_length": len(response.content),
                        "input_tokens": response.input_tokens,
                        "output_tokens": response.output_tokens,
                    },
                )
            )

            return {
                "result": response.content,
                "status": "completed",
                "total_input_tokens": response.input_tokens,
                "total_output_tokens": response.output_tokens,
                "arbitration_metadata": {
                    "label_a": label_a,
                    "label_b": label_b,
                    "input_a_length": len(result_a),
                    "input_b_length": len(result_b),
                    "output_length": len(response.content),
                },
            }

        except Exception as e:
            logger.error(
                f"Arbiter execution failed, node_id={self.node_id}: {traceback.format_exc()}"
            )
            await self.event_bus.publish(
                Event(
                    "arbiter_failed",
                    self.node_id,
                    {"error": str(e)},
                )
            )
            return {
                "result": "",
                "status": "failed",
                "error": str(e),
                "total_input_tokens": 0,
                "total_output_tokens": 0,
            }

    def _build_arbitration_input(
        self,
        result_a: str,
        result_b: str,
        label_a: str,
        label_b: str,
        context: dict | None = None,
    ) -> str:
        """
        Build the user message for arbitration.

        :param result_a: first model output
        :param result_b: second model output
        :param label_a: label for first model
        :param label_b: label for second model
        :param context: optional context
        :return: formatted user message
        """
        parts = []

        if context:
            import json
            parts.append(f"## Additional Context\n{json.dumps(context, ensure_ascii=False, indent=2)}\n")

        parts.append(f"## {label_a} Analyst Output\n{result_a}\n")
        parts.append(f"## {label_b} Analyst Output\n{result_b}\n")

        parts.append(
            "## Instructions\n"
            "Please compare, validate, and fuse the above two outputs according to your arbitration principles. "
            "Output the final fused result."
        )

        return "\n".join(parts)
