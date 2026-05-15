"""
Harness Layer 2: Context - 记忆管理 + 上下文压缩 + 知识 Schema

参考：
- Anthropic multi-agent research system: 子Agent通过文件系统输出以减少"电话游戏"效应
- Claude Code: 长会话中摘要已完成的工作阶段并存储到外部记忆
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional


class ContextWindow:
    """上下文窗口管理 - 防止 token 溢出"""

    def __init__(self, max_tokens: int = 100_000):
        self.max_tokens = max_tokens
        self.entries: list[dict[str, Any]] = []

    def add(self, role: str, content: str, metadata: dict | None = None) -> None:
        entry = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {},
        }
        self.entries.append(entry)
        self._compress_if_needed()

    def _compress_if_needed(self) -> None:
        """简易压缩：若预估 token 超限，保留最新条目并摘要旧内容"""
        estimated_tokens = sum(len(e["content"]) // 3 for e in self.entries)
        if estimated_tokens <= self.max_tokens:
            return

        keep_recent = max(3, len(self.entries) // 3)
        old_entries = self.entries[:-keep_recent]
        summary_parts = []
        for e in old_entries:
            preview = e["content"][:200]
            summary_parts.append(f"[{e['role']}] {preview}...")

        summary = {
            "role": "system",
            "content": (
                "[Compressed context summary]\n" + "\n".join(summary_parts)
            ),
            "timestamp": datetime.now().isoformat(),
            "metadata": {"compressed": True, "original_count": len(old_entries)},
        }
        self.entries = [summary] + self.entries[-keep_recent:]

    def to_messages(self) -> list[dict]:
        return [
            {"role": e["role"], "content": e["content"]} for e in self.entries
        ]

    def get_full_context(self) -> str:
        return "\n\n".join(
            f"[{e['role']}]: {e['content']}" for e in self.entries
        )


class SharedMemory:
    """
    Agent 间共享记忆 - 黑板模式

    参考 Google ADK State 模式: Agent 通过显式共享 State 读写协作
    """

    def __init__(self):
        self._store: dict[str, Any] = {}
        self._history: list[dict] = []

    def write(self, key: str, value: Any, agent_id: str) -> None:
        self._store[key] = value
        self._history.append(
            {
                "action": "write",
                "key": key,
                "agent_id": agent_id,
                "timestamp": datetime.now().isoformat(),
            }
        )

    def read(self, key: str, default: Any = None) -> Any:
        return self._store.get(key, default)

    def read_all(self) -> dict[str, Any]:
        return dict(self._store)

    def get_history(self) -> list[dict]:
        return list(self._history)

    def to_context_string(self) -> str:
        """将共享记忆序列化为上下文字符串，供 Agent prompt 注入"""
        if not self._store:
            return "[No shared data available yet]"
        parts = []
        for k, v in self._store.items():
            if isinstance(v, (dict, list)):
                val_str = json.dumps(v, ensure_ascii=False, indent=2)[:2000]
            else:
                val_str = str(v)[:2000]
            parts.append(f"### {k}\n{val_str}")
        return "\n\n".join(parts)
