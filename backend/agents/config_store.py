#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
@Time    : 2025-06-04
@Author  : Competitive Analysis Agent Team
@File    : config_store.py
@Desc    : Agent configuration persistence layer (SQLite)
"""
from __future__ import annotations

import json
import logging
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import aiosqlite

from schemas import AgentRole

logger = logging.getLogger(__name__)

# Default DB path
_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "agent_configs.db"

# Available models in the system
AVAILABLE_MODELS = [
    {"id": "gpt-5.5-2026-04-23", "name": "GPT-5.5", "provider": "openai", "description": "Most capable model for deep reasoning"},
    {"id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "provider": "openai", "description": "Fast and cost-efficient"},
    {"id": "gpt-4.1", "name": "GPT-4.1", "provider": "openai", "description": "Balanced performance and speed"},
    {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "anthropic", "description": "Strong reasoning and long-context understanding"},
]

# Available tools in the system
AVAILABLE_TOOLS = [
    {"id": "web_search", "name": "Web Search", "description": "Search the web for information"},
    {"id": "fetch_webpage", "name": "Fetch Webpage", "description": "Extract text content from a URL"},
    {"id": "plan_analysis", "name": "Plan Analysis", "description": "Create an analysis plan"},
    {"id": "analyze_data", "name": "Analyze Data", "description": "Analyze collected data"},
    {"id": "generate_report_section", "name": "Generate Report", "description": "Generate report sections"},
    {"id": "review_content", "name": "Review Content", "description": "Review content quality"},
    {"id": "verify_citation", "name": "Verify Citation", "description": "Verify citation URLs"},
]

# Default configurations for each agent role
DEFAULT_CONFIGS: dict[str, dict[str, Any]] = {
    "orchestrator": {
        "display_name": "编排器",
        "model": "gpt-4.1-mini",
        "token_budget": 8192,
        "enabled_tools": ["plan_analysis"],
    },
    "collector": {
        "display_name": "采集器",
        "model": "gpt-4.1-mini",
        "token_budget": 8192,
        "enabled_tools": ["web_search", "fetch_webpage"],
    },
    "analyst": {
        "display_name": "分析师",
        "model": "gpt-5.5-2026-04-23",
        "token_budget": 16384,
        "enabled_tools": ["analyze_data", "web_search"],
    },
    "writer": {
        "display_name": "撰写者",
        "model": "gpt-5.5-2026-04-23",
        "token_budget": 16384,
        "enabled_tools": ["generate_report_section"],
    },
    "reviewer": {
        "display_name": "审核员",
        "model": "gpt-4.1-mini",
        "token_budget": 8192,
        "enabled_tools": ["review_content", "web_search"],
    },
    "citation": {
        "display_name": "引用器",
        "model": "gpt-4.1-mini",
        "token_budget": 8192,
        "enabled_tools": ["verify_citation", "fetch_webpage"],
    },
    "arbiter": {
        "display_name": "仲裁官",
        "model": "claude-sonnet-4-20250514",
        "token_budget": 32768,
        "enabled_tools": [],
    },
}


def get_default_prompt(role: str) -> str:
    """Get the default system prompt for a role from prompts.py."""
    from agents.prompts import (
        ORCHESTRATOR_PROMPT,
        COLLECTOR_INDUSTRY_PROMPT,
        ANALYST_PROMPT,
        WRITER_PROMPT,
        REVIEWER_PROMPT,
        CITATION_PROMPT,
        ARBITER_ANALYSIS_PROMPT,
    )
    prompt_map = {
        "orchestrator": ORCHESTRATOR_PROMPT,
        "collector": COLLECTOR_INDUSTRY_PROMPT,
        "analyst": ANALYST_PROMPT,
        "writer": WRITER_PROMPT,
        "reviewer": REVIEWER_PROMPT,
        "citation": CITATION_PROMPT,
        "arbiter": ARBITER_ANALYSIS_PROMPT,
    }
    return prompt_map.get(role, "")


class AgentConfigStore:
    """SQLite-based agent configuration store."""

    def __init__(self, db_path: Path | str | None = None):
        self.db_path = str(db_path or _DB_PATH)

    async def init_db(self) -> None:
        """Create table and seed defaults if empty."""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS agent_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT UNIQUE NOT NULL,
                    display_name TEXT NOT NULL,
                    model TEXT NOT NULL,
                    system_prompt TEXT NOT NULL,
                    token_budget INTEGER NOT NULL DEFAULT 8192,
                    enabled_tools TEXT NOT NULL DEFAULT '[]',
                    updated_at TEXT NOT NULL
                )
            """)
            await db.commit()

            # Seed defaults if table is empty
            cursor = await db.execute("SELECT COUNT(*) FROM agent_configs")
            row = await cursor.fetchone()
            if row[0] == 0:
                await self._seed_defaults(db)

    async def _seed_defaults(self, db: aiosqlite.Connection) -> None:
        """Insert default configurations for all 6 roles."""
        now = datetime.now().isoformat()
        for role, config in DEFAULT_CONFIGS.items():
            prompt = get_default_prompt(role)
            await db.execute(
                """INSERT INTO agent_configs (role, display_name, model, system_prompt, token_budget, enabled_tools, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    role,
                    config["display_name"],
                    config["model"],
                    prompt,
                    config["token_budget"],
                    json.dumps(config["enabled_tools"]),
                    now,
                ),
            )
        await db.commit()
        logger.info("Seeded default agent configurations")

    async def get_all(self) -> list[dict[str, Any]]:
        """Get all agent configurations."""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute("SELECT * FROM agent_configs ORDER BY id")
                rows = await cursor.fetchall()
                return [self._row_to_dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get configs: {traceback.format_exc()}")
            return self._get_fallback_configs()

    async def get_by_role(self, role: str) -> Optional[dict[str, Any]]:
        """Get configuration for a specific role."""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute(
                    "SELECT * FROM agent_configs WHERE role = ?", (role,)
                )
                row = await cursor.fetchone()
                if row:
                    return self._row_to_dict(row)
                return None
        except Exception as e:
            logger.error(f"Failed to get config for {role}: {traceback.format_exc()}")
            return self._get_fallback_config(role)

    async def update(self, role: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Update configuration for a specific role (partial update)."""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # Build SET clause dynamically
                allowed_fields = {"display_name", "model", "system_prompt", "token_budget", "enabled_tools"}
                set_parts = []
                values = []
                for field, value in updates.items():
                    if field in allowed_fields:
                        if field == "enabled_tools" and isinstance(value, list):
                            value = json.dumps(value)
                        set_parts.append(f"{field} = ?")
                        values.append(value)

                if not set_parts:
                    return await self.get_by_role(role)

                set_parts.append("updated_at = ?")
                values.append(datetime.now().isoformat())
                values.append(role)

                await db.execute(
                    f"UPDATE agent_configs SET {', '.join(set_parts)} WHERE role = ?",
                    values,
                )
                await db.commit()
                return await self.get_by_role(role)
        except Exception as e:
            logger.error(f"Failed to update config for {role}: {traceback.format_exc()}")
            raise

    async def reset(self, role: str) -> Optional[dict[str, Any]]:
        """Reset a role's configuration to defaults."""
        config = DEFAULT_CONFIGS.get(role)
        if not config:
            return None

        prompt = get_default_prompt(role)
        updates = {
            "display_name": config["display_name"],
            "model": config["model"],
            "system_prompt": prompt,
            "token_budget": config["token_budget"],
            "enabled_tools": config["enabled_tools"],
        }
        return await self.update(role, updates)

    def _row_to_dict(self, row: aiosqlite.Row) -> dict[str, Any]:
        """Convert a DB row to a dictionary."""
        d = dict(row)
        if "enabled_tools" in d and isinstance(d["enabled_tools"], str):
            try:
                d["enabled_tools"] = json.loads(d["enabled_tools"])
            except json.JSONDecodeError:
                d["enabled_tools"] = []
        return d

    def _get_fallback_configs(self) -> list[dict[str, Any]]:
        """Return default configs when DB is unavailable."""
        results = []
        for role, config in DEFAULT_CONFIGS.items():
            results.append({
                "id": 0,
                "role": role,
                "display_name": config["display_name"],
                "model": config["model"],
                "system_prompt": get_default_prompt(role),
                "token_budget": config["token_budget"],
                "enabled_tools": config["enabled_tools"],
                "updated_at": "",
            })
        return results

    def _get_fallback_config(self, role: str) -> Optional[dict[str, Any]]:
        """Return default config for a role when DB is unavailable."""
        config = DEFAULT_CONFIGS.get(role)
        if not config:
            return None
        return {
            "id": 0,
            "role": role,
            "display_name": config["display_name"],
            "model": config["model"],
            "system_prompt": get_default_prompt(role),
            "token_budget": config["token_budget"],
            "enabled_tools": config["enabled_tools"],
            "updated_at": "",
        }


# Singleton instance
config_store = AgentConfigStore()
