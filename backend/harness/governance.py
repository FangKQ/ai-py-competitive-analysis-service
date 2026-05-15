"""
Harness Layer 4: Governance - 权限控制 + 审计日志 + Token 预算

参考：
- Claude Agent SDK: hooks 系统用于生命周期控制（pre-tool, post-response, error handling）
- Harness Engineering: 权限边界阻止工具默认执行
- Anthropic "Building Effective Agents": 可观测系统自我解释
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Any, Optional

from schemas import AgentDecisionLog, AgentRole

logger = logging.getLogger(__name__)


class TokenBudget:
    """Token 预算管理 - 防止 Agent 无限消耗"""

    def __init__(self, max_input: int = 500_000, max_output: int = 100_000):
        self.max_input = max_input
        self.max_output = max_output
        self.used_input = 0
        self.used_output = 0

    def consume(self, input_tokens: int, output_tokens: int) -> bool:
        """消耗 token，返回是否超预算"""
        self.used_input += input_tokens
        self.used_output += output_tokens
        return self.is_over_budget()

    def is_over_budget(self) -> bool:
        return (
            self.used_input > self.max_input
            or self.used_output > self.max_output
        )

    @property
    def remaining_input(self) -> int:
        return max(0, self.max_input - self.used_input)

    @property
    def remaining_output(self) -> int:
        return max(0, self.max_output - self.used_output)

    def to_dict(self) -> dict:
        return {
            "max_input": self.max_input,
            "max_output": self.max_output,
            "used_input": self.used_input,
            "used_output": self.used_output,
            "remaining_input": self.remaining_input,
            "remaining_output": self.remaining_output,
        }


class AuditLog:
    """审计日志 - 完全透明的决策记录"""

    def __init__(self):
        self._entries: list[dict] = []

    def record(
        self,
        agent_id: str,
        agent_role: AgentRole,
        event_type: str,
        details: dict | None = None,
    ) -> None:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "agent_id": agent_id,
            "agent_role": agent_role.value,
            "event_type": event_type,
            "details": details or {},
        }
        self._entries.append(entry)
        logger.info(
            f"[AUDIT] {agent_id} ({agent_role.value}): {event_type}"
        )

    def get_entries(
        self,
        agent_id: str | None = None,
        event_type: str | None = None,
    ) -> list[dict]:
        entries = self._entries
        if agent_id:
            entries = [e for e in entries if e["agent_id"] == agent_id]
        if event_type:
            entries = [e for e in entries if e["event_type"] == event_type]
        return entries

    def get_all(self) -> list[dict]:
        return list(self._entries)

    def to_json(self) -> str:
        return json.dumps(self._entries, ensure_ascii=False, indent=2)


class PermissionGuard:
    """权限守卫 - 控制 Agent 可以执行的操作"""

    DEFAULT_PERMISSIONS = {
        AgentRole.ORCHESTRATOR: {
            "can_create_subagents": True,
            "can_access_tools": ["plan_analysis"],
            "can_write_report": False,
        },
        AgentRole.COLLECTOR: {
            "can_create_subagents": False,
            "can_access_tools": ["web_search", "fetch_webpage"],
            "can_write_report": False,
        },
        AgentRole.ANALYST: {
            "can_create_subagents": False,
            "can_access_tools": ["analyze_data", "web_search"],
            "can_write_report": False,
        },
        AgentRole.WRITER: {
            "can_create_subagents": False,
            "can_access_tools": ["generate_report_section"],
            "can_write_report": True,
        },
        AgentRole.REVIEWER: {
            "can_create_subagents": False,
            "can_access_tools": ["review_content", "web_search"],
            "can_write_report": False,
        },
        AgentRole.CITATION: {
            "can_create_subagents": False,
            "can_access_tools": ["verify_citation", "fetch_webpage"],
            "can_write_report": False,
        },
    }

    def __init__(self):
        self.permissions = dict(self.DEFAULT_PERMISSIONS)

    def check_tool_access(self, role: AgentRole, tool_name: str) -> bool:
        perms = self.permissions.get(role, {})
        allowed = perms.get("can_access_tools", [])
        return tool_name in allowed

    def check_subagent_creation(self, role: AgentRole) -> bool:
        perms = self.permissions.get(role, {})
        return perms.get("can_create_subagents", False)


class GovernanceLayer:
    """治理层整合"""

    def __init__(
        self,
        max_input_tokens: int = 500_000,
        max_output_tokens: int = 100_000,
    ):
        self.budget = TokenBudget(max_input_tokens, max_output_tokens)
        self.audit = AuditLog()
        self.permissions = PermissionGuard()
        self.start_time = time.time()

    def record_agent_action(
        self,
        agent_id: str,
        role: AgentRole,
        action: str,
        tokens_in: int = 0,
        tokens_out: int = 0,
        details: dict | None = None,
    ) -> None:
        self.budget.consume(tokens_in, tokens_out)
        self.audit.record(
            agent_id=agent_id,
            agent_role=role,
            event_type=action,
            details={
                **(details or {}),
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "budget_remaining_in": self.budget.remaining_input,
                "budget_remaining_out": self.budget.remaining_output,
            },
        )

    def get_status(self) -> dict:
        return {
            "budget": self.budget.to_dict(),
            "elapsed_seconds": int(time.time() - self.start_time),
            "total_audit_entries": len(self.audit.get_all()),
        }
