#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
@Time    : 2025-06-04
@Author  : Competitive Analysis Agent Team
@File    : api/agents.py
@Desc    : Agent configuration management API routes
"""
from __future__ import annotations

import logging
import time
import traceback
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.config_store import (
    config_store,
    AVAILABLE_MODELS,
    AVAILABLE_TOOLS,
    DEFAULT_CONFIGS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agent-config"])


class AgentConfigUpdate(BaseModel):
    """Request body for updating agent configuration."""
    display_name: Optional[str] = None
    model: Optional[str] = None
    model_b: Optional[str] = None
    system_prompt: Optional[str] = None
    system_prompt_b: Optional[str] = None
    token_budget: Optional[int] = None
    enabled_tools: Optional[list[str]] = None


class AgentTestRequest(BaseModel):
    """Request body for testing an agent.

    Supports sending current (unsaved) configuration for preview testing.
    If config fields are provided, they override the saved configuration.
    """
    message: str = Field(description="Test message to send to the agent")
    model: Optional[str] = Field(default=None, description="Override model for testing")
    system_prompt: Optional[str] = Field(default=None, description="Override system prompt for testing")
    token_budget: Optional[int] = Field(default=None, description="Override token budget for testing")
    enabled_tools: Optional[list[str]] = Field(default=None, description="Override enabled tools for testing")


class ToolCallRecord(BaseModel):
    """Record of a single tool call during test execution."""
    tool: str
    input: str
    output_summary: str
    status: str


@router.get("")
async def list_agents():
    """Get all agent configurations."""
    configs = await config_store.get_all()
    return {"agents": configs}


@router.get("/models")
async def list_models():
    """Get available models."""
    return {"models": AVAILABLE_MODELS}


@router.get("/tools")
async def list_tools():
    """Get available tools."""
    return {"tools": AVAILABLE_TOOLS}


@router.get("/{role}")
async def get_agent(role: str):
    """Get a single agent's configuration."""
    _validate_role(role)
    config = await config_store.get_by_role(role)
    if not config:
        raise HTTPException(status_code=404, detail=f"Agent config not found for role: {role}")
    return config


@router.put("/{role}")
async def update_agent(role: str, body: AgentConfigUpdate):
    """Update an agent's configuration (partial update)."""
    _validate_role(role)

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate model
    if "model" in updates:
        valid_model_ids = [m["id"] for m in AVAILABLE_MODELS]
        if updates["model"] not in valid_model_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model. Must be one of: {valid_model_ids}",
            )

    # Validate model_b (can be None to disable cross-validation for this role)
    if "model_b" in updates and updates["model_b"] is not None:
        valid_model_ids = [m["id"] for m in AVAILABLE_MODELS]
        if updates["model_b"] not in valid_model_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model_b. Must be one of: {valid_model_ids}",
            )

    # Validate token_budget
    if "token_budget" in updates:
        if not (1024 <= updates["token_budget"] <= 32768):
            raise HTTPException(
                status_code=400,
                detail="token_budget must be between 1024 and 32768",
            )

    # Validate system_prompt
    if "system_prompt" in updates:
        if not updates["system_prompt"].strip():
            raise HTTPException(status_code=400, detail="system_prompt cannot be empty")
        if len(updates["system_prompt"]) > 20000:
            raise HTTPException(
                status_code=400,
                detail="system_prompt cannot exceed 20000 characters",
            )

    # Validate enabled_tools
    if "enabled_tools" in updates:
        valid_tool_ids = [t["id"] for t in AVAILABLE_TOOLS]
        for tool_id in updates["enabled_tools"]:
            if tool_id not in valid_tool_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid tool: {tool_id}. Must be one of: {valid_tool_ids}",
                )

    try:
        result = await config_store.update(role, updates)
        return result
    except Exception as e:
        logger.error(f"Failed to update agent {role}: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to update configuration")


@router.post("/{role}/reset")
async def reset_agent(role: str):
    """Reset an agent's configuration to system defaults."""
    _validate_role(role)
    result = await config_store.reset(role)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to reset configuration")
    return result


@router.post("/{role}/test")
async def test_agent(role: str, body: AgentTestRequest):
    """Test an agent with full AgentRuntime loop (ReAct cycle with tool calls).

    Uses the current (possibly unsaved) configuration from the request body
    so users can preview changes before saving.
    """
    _validate_role(role)

    config = await config_store.get_by_role(role)
    if not config:
        raise HTTPException(status_code=404, detail=f"Agent config not found for role: {role}")

    # Override saved config with request body values (preview mode)
    test_model = body.model or config["model"]
    test_prompt = body.system_prompt if body.system_prompt is not None else config["system_prompt"]
    test_budget = body.token_budget or config["token_budget"]
    test_tools = body.enabled_tools if body.enabled_tools is not None else config.get("enabled_tools", [])

    try:
        from config import settings
        from harness.capability import create_default_tools
        from harness.providers import create_openai_provider, create_anthropic_provider
        from harness.runtime import AgentRuntime
        from schemas import AgentRole

        # Determine provider based on model
        model_info = None
        for m in AVAILABLE_MODELS:
            if m["id"] == test_model:
                model_info = m
                break

        provider_type = model_info.get("provider", "openai") if model_info else "openai"

        if provider_type == "anthropic":
            if not settings.anthropic_api_key:
                raise HTTPException(status_code=400, detail="Anthropic API key not configured")
            provider = create_anthropic_provider(
                api_key=settings.anthropic_api_key,
                model=test_model,
            )
        else:
            provider = create_openai_provider(
                api_key=settings.minimax_api_key,
                base_url=settings.minimax_base_url,
                model=test_model,
            )

        # Create tool registry and filter by enabled tools
        registry = create_default_tools()
        all_tool_defs = registry.get_tool_definitions()
        filtered_tools = [t for t in all_tool_defs if t["name"] in test_tools] if test_tools else []

        # Map role string to AgentRole enum
        agent_role = AgentRole(role)

        # Create runtime with limited iterations for testing
        runtime = AgentRuntime(
            agent_id=f"test_{role}",
            role=agent_role,
            provider=provider,
            model=test_model,
            max_iterations=8,
            max_tokens=min(test_budget, 4096),
        )

        # Run the full agent loop
        result = await runtime.run(
            system_prompt=test_prompt,
            user_message=body.message,
            tools=filtered_tools if filtered_tools else None,
            tool_executor=registry.execute if filtered_tools else None,
        )

        # Extract tool call records from runtime
        tool_calls_log = getattr(runtime, "_tool_call_results", [])

        return {
            "response": result.get("result", ""),
            "tokens_used": result.get("total_input_tokens", 0) + result.get("total_output_tokens", 0),
            "input_tokens": result.get("total_input_tokens", 0),
            "output_tokens": result.get("total_output_tokens", 0),
            "duration_ms": sum(
                log.duration_ms for log in result.get("decision_logs", [])
            ),
            "iterations": result.get("iterations", 0),
            "model": test_model,
            "status": result.get("status", "unknown"),
            "tool_calls": tool_calls_log,
            "config_used": {
                "model": test_model,
                "system_prompt_length": len(test_prompt),
                "token_budget": test_budget,
                "enabled_tools": test_tools,
            },
        }

    except Exception as e:
        logger.error(f"Agent test failed for {role}: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Test failed: {str(e)}",
        )


def _validate_role(role: str) -> None:
    """Validate that role is one of the 6 fixed roles."""
    valid_roles = list(DEFAULT_CONFIGS.keys())
    if role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {role}. Must be one of: {valid_roles}",
        )
