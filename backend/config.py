"""
竞品分析 Agent 协作系统 - 配置管理

参考：Harness Engineering Layer 4 (Governance) - 集中化配置管理
"""
from __future__ import annotations

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    minimax_api_key: str = Field(default="", env="MINIMAX_API_KEY")
    minimax_base_url: str = Field(
        default="https://api.minimax.io/anthropic", env="MINIMAX_BASE_URL"
    )
    minimax_model: str = Field(default="MiniMax-M2.7", env="MINIMAX_MODEL")

    # Model layering: heavy tasks use large model, light tasks use mini
    model_large: str = Field(default="gpt-5.5-2026-04-23", env="MODEL_LARGE")
    model_small: str = Field(default="gpt-4.1-mini", env="MODEL_SMALL")

    # Anthropic (Claude)
    anthropic_api_key: str = Field(default="", env="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-opus-4-8", env="ANTHROPIC_MODEL")

    # Multi-model strategy
    cross_validation_enabled: bool = Field(
        default=True, env="CROSS_VALIDATION_ENABLED",
    )

    # Tavily Search API
    tavily_api_key: str = Field(default="", env="TAVILY_API_KEY")

    # Dev mode: limit search to save API quota
    dev_max_search_results: int = Field(default=5, env="DEV_MAX_SEARCH_RESULTS")
    dev_max_search_calls: int = Field(default=10, env="DEV_MAX_SEARCH_CALLS")

    database_url: str = Field(
        default="sqlite+aiosqlite:///./data/competitive_analysis.db",
        env="DATABASE_URL",
    )
    redis_url: str = Field(
        default="redis://localhost:6379/0", env="REDIS_URL"
    )

    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173,http://101.37.125.37,http://101.37.125.37:8000",
        env="CORS_ORIGINS",
    )

    max_tokens_per_agent: int = Field(default=8192)
    max_agent_iterations: int = Field(default=20)
    max_concurrent_agents: int = Field(default=5)

    data_dir: Path = Field(default=Path("./data"))

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
