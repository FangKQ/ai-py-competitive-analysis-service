#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
@Time    : 2025-06-08
@Author  : AI agent from Team Levi
@File    : providers.py
@Desc    : LLM Provider abstraction layer - unified interface for OpenAI and Anthropic
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import logging
import traceback
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


@dataclass
class ProviderResponse:
    """Unified response from any LLM provider."""

    content: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    finish_reason: str = "stop"
    raw_response: Any = None


@runtime_checkable
class LLMProvider(Protocol):
    """Unified LLM provider interface."""

    provider_name: str

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 8192,
    ) -> ProviderResponse:
        """
        Send a chat request to the LLM.

        :param system_prompt: system-level instruction
        :param messages: conversation messages in unified format
        :param tools: tool definitions (Anthropic-style: name + description + input_schema)
        :param max_tokens: max completion tokens
        :return: unified provider response
        """
        ...


class OpenAIProvider:
    """OpenAI API provider implementation."""

    provider_name: str = "openai"

    def __init__(self, api_key: str, base_url: str, model: str) -> None:
        """
        Initialize OpenAI provider.

        :param api_key: OpenAI API key
        :param base_url: API base URL
        :param model: model identifier
        """
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 8192,
    ) -> ProviderResponse:
        """
        Send chat request via OpenAI API.

        :param system_prompt: system-level instruction
        :param messages: conversation messages
        :param tools: tool definitions
        :param max_tokens: max completion tokens
        :return: unified provider response
        """
        try:
            openai_messages = [{"role": "system", "content": system_prompt}]
            openai_messages.extend(messages)

            kwargs: dict[str, Any] = {
                "model": self.model,
                "messages": openai_messages,
            }

            # GPT-5.5 and o-series models require max_completion_tokens;
            # older models (gpt-4.1, gpt-4o, etc.) use max_tokens.
            # SDK 1.6.x does not have max_completion_tokens as a named param,
            # so we pass it via extra_body for new models.
            if any(tag in self.model for tag in ["gpt-5.5", "o1", "o3", "o4-mini"]):
                kwargs["extra_body"] = {"max_completion_tokens": max_tokens}
            else:
                kwargs["max_tokens"] = max_tokens

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
                kwargs["tools"] = openai_tools

            response = await self.client.chat.completions.create(**kwargs)

            choice = response.choices[0]
            message = choice.message
            usage = response.usage

            tool_calls = []
            if message.tool_calls:
                for tc in message.tool_calls:
                    tool_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "input": json.loads(tc.function.arguments) if tc.function.arguments else {},
                    })

            return ProviderResponse(
                content=message.content or "",
                tool_calls=tool_calls,
                input_tokens=usage.prompt_tokens if usage else 0,
                output_tokens=usage.completion_tokens if usage else 0,
                finish_reason=choice.finish_reason or "stop",
                raw_response=response,
            )

        except Exception as e:
            logger.error(f"OpenAI chat failed: {traceback.format_exc()}")
            raise

    def build_tool_result_message(self, tool_call_id: str, content: str) -> dict:
        """
        Build a tool result message for OpenAI format.

        :param tool_call_id: the tool call ID to respond to
        :param content: tool execution result
        :return: message dict for OpenAI API
        """
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": content,
        }

    def build_assistant_message(self, response: ProviderResponse) -> dict:
        """
        Build an assistant message from provider response for conversation history.

        :param response: the provider response
        :return: message dict for OpenAI API
        """
        msg: dict[str, Any] = {"role": "assistant"}
        if response.content:
            msg["content"] = response.content
        if response.tool_calls:
            msg["tool_calls"] = []
            for tc in response.tool_calls:
                msg["tool_calls"].append({
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["input"], ensure_ascii=False),
                    },
                })
            if "content" not in msg:
                msg["content"] = None
        return msg


class AnthropicProvider:
    """Anthropic (Claude) API provider implementation."""

    provider_name: str = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        """
        Initialize Anthropic provider.

        :param api_key: Anthropic API key
        :param model: model identifier (e.g. claude-sonnet-4-20250514)
        """
        import anthropic

        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 8192,
    ) -> ProviderResponse:
        """
        Send chat request via Anthropic API using streaming to avoid timeout.

        :param system_prompt: system-level instruction
        :param messages: conversation messages
        :param tools: tool definitions
        :param max_tokens: max completion tokens
        :return: unified provider response
        """
        try:
            import anthropic

            # Convert messages to Anthropic format
            anthropic_messages = self._convert_messages(messages)

            kwargs: dict[str, Any] = {
                "model": self.model,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": anthropic_messages,
            }

            if tools:
                anthropic_tools = []
                for t in tools:
                    anthropic_tools.append({
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "input_schema": t.get("input_schema", {"type": "object", "properties": {}}),
                    })
                kwargs["tools"] = anthropic_tools

            # Use streaming to avoid 10-minute timeout on long requests
            content = ""
            tool_calls = []
            input_tokens = 0
            output_tokens = 0
            stop_reason = "end_turn"

            # Track tool_use blocks being built incrementally
            current_tool: dict[str, Any] | None = None
            current_tool_json = ""

            async with self.client.messages.stream(**kwargs) as stream:
                async for event in stream:
                    if event.type == "message_start":
                        if hasattr(event, "message") and hasattr(event.message, "usage"):
                            input_tokens = event.message.usage.input_tokens
                    elif event.type == "message_delta":
                        if hasattr(event, "usage") and event.usage:
                            output_tokens = event.usage.output_tokens
                        if hasattr(event, "delta") and hasattr(event.delta, "stop_reason"):
                            stop_reason = event.delta.stop_reason or stop_reason
                    elif event.type == "content_block_start":
                        if hasattr(event, "content_block"):
                            block = event.content_block
                            if block.type == "tool_use":
                                current_tool = {
                                    "id": block.id,
                                    "name": block.name,
                                    "input": {},
                                }
                                current_tool_json = ""
                    elif event.type == "content_block_delta":
                        if hasattr(event, "delta"):
                            delta = event.delta
                            if delta.type == "text_delta":
                                content += delta.text
                            elif delta.type == "input_json_delta":
                                current_tool_json += delta.partial_json
                    elif event.type == "content_block_stop":
                        if current_tool is not None:
                            try:
                                current_tool["input"] = json.loads(current_tool_json) if current_tool_json else {}
                            except json.JSONDecodeError:
                                current_tool["input"] = {}
                            tool_calls.append(current_tool)
                            current_tool = None
                            current_tool_json = ""

            finish_reason = "stop"
            if stop_reason == "tool_use":
                finish_reason = "tool_use"
            elif stop_reason == "end_turn":
                finish_reason = "stop"

            return ProviderResponse(
                content=content,
                tool_calls=tool_calls,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                finish_reason=finish_reason,
                raw_response=None,
            )

        except Exception as e:
            logger.error(f"Anthropic chat failed: {traceback.format_exc()}")
            raise

    def _convert_messages(self, messages: list[dict]) -> list[dict]:
        """
        Convert unified message format to Anthropic format.

        :param messages: messages in unified/OpenAI format
        :return: messages in Anthropic format
        """
        result = []
        for msg in messages:
            role = msg.get("role", "user")

            # Skip system messages (handled separately in Anthropic)
            if role == "system":
                continue

            # Handle tool result messages
            if role == "tool":
                result.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": msg.get("tool_call_id", msg.get("tool_use_id", "")),
                            "content": msg.get("content", ""),
                        }
                    ],
                })
                continue

            # Handle assistant messages with tool calls
            if role == "assistant":
                content_blocks = []
                text_content = msg.get("content")
                if text_content:
                    content_blocks.append({"type": "text", "text": text_content})

                tool_calls = msg.get("tool_calls", [])
                for tc in tool_calls:
                    if isinstance(tc, dict):
                        # OpenAI format tool call
                        func = tc.get("function", {})
                        if func:
                            tc_input = func.get("arguments", "{}")
                            if isinstance(tc_input, str):
                                try:
                                    tc_input = json.loads(tc_input)
                                except json.JSONDecodeError:
                                    tc_input = {}
                            content_blocks.append({
                                "type": "tool_use",
                                "id": tc.get("id", ""),
                                "name": func.get("name", ""),
                                "input": tc_input,
                            })
                        else:
                            # Already in unified format
                            content_blocks.append({
                                "type": "tool_use",
                                "id": tc.get("id", ""),
                                "name": tc.get("name", ""),
                                "input": tc.get("input", {}),
                            })

                if content_blocks:
                    result.append({"role": "assistant", "content": content_blocks})
                else:
                    result.append({"role": "assistant", "content": text_content or ""})
                continue

            # Handle user messages
            result.append({"role": "user", "content": msg.get("content", "")})

        return result

    def build_tool_result_message(self, tool_call_id: str, content: str) -> dict:
        """
        Build a tool result message for Anthropic format.

        :param tool_call_id: the tool use ID to respond to
        :param content: tool execution result
        :return: message dict
        """
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": content,
        }

    def build_assistant_message(self, response: ProviderResponse) -> dict:
        """
        Build an assistant message from provider response for conversation history.

        :param response: the provider response
        :return: message dict
        """
        msg: dict[str, Any] = {"role": "assistant"}
        if response.content and not response.tool_calls:
            msg["content"] = response.content
        elif response.tool_calls:
            msg["content"] = response.content or None
            msg["tool_calls"] = response.tool_calls
        else:
            msg["content"] = response.content
        return msg


def create_openai_provider(api_key: str, base_url: str, model: str) -> OpenAIProvider:
    """
    Factory function for OpenAI provider.

    :param api_key: OpenAI API key
    :param base_url: API base URL
    :param model: model identifier
    :return: configured OpenAIProvider instance
    """
    return OpenAIProvider(api_key=api_key, base_url=base_url, model=model)


def create_anthropic_provider(api_key: str, model: str) -> AnthropicProvider:
    """
    Factory function for Anthropic provider.

    :param api_key: Anthropic API key
    :param model: model identifier
    :return: configured AnthropicProvider instance
    """
    return AnthropicProvider(api_key=api_key, model=model)
