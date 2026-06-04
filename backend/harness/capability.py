"""
Harness Layer 3: Capability - 工具注册与 MCP 风格工具调用

参考：
- Claude Code: 工具极简原则（Vercel 教训：砍 80% 工具后准确率 80%→100%）
- Anthropic multi-agent system: 工具设计与选择是关键
- MCP (Model Context Protocol): 标准化工具接口
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Awaitable

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

ToolFunction = Callable[..., Awaitable[Any]]


class ToolRegistry:
    """MCP 风格工具注册表"""

    def __init__(self):
        self._tools: dict[str, dict] = {}
        self._executors: dict[str, ToolFunction] = {}

    def register(
        self,
        name: str,
        description: str,
        input_schema: dict,
        executor: ToolFunction,
    ) -> None:
        self._tools[name] = {
            "name": name,
            "description": description,
            "input_schema": input_schema,
        }
        self._executors[name] = executor

    def get_tool_definitions(self) -> list[dict]:
        return list(self._tools.values())

    def get_tool_definitions_for_role(self, role: str) -> list[dict]:
        """根据 Agent 角色返回允许的工具子集"""
        role_tool_map = {
            "orchestrator": ["plan_analysis"],
            "collector": ["web_search", "fetch_webpage"],
            "analyst": ["analyze_data"],
            "writer": ["generate_report_section"],
            "reviewer": ["review_content"],
            "citation": ["verify_citation"],
        }
        allowed = role_tool_map.get(role, list(self._tools.keys()))
        return [t for t in self._tools.values() if t["name"] in allowed]

    async def execute(self, name: str, params: dict) -> Any:
        if name not in self._executors:
            raise ValueError(f"Unknown tool: {name}")
        return await self._executors[name](**params)


async def web_search(query: str, max_results: int = 5) -> str:
    """Web 搜索工具 - 优先使用 Tavily API，fallback 到 DuckDuckGo"""
    # Try Tavily first
    tavily_result = await _tavily_search(query, max_results)
    if tavily_result:
        return tavily_result

    # Fallback to DuckDuckGo
    return await _duckduckgo_search(query, max_results)


async def _tavily_search(query: str, max_results: int = 5) -> str | None:
    """Tavily Search API - optimized for LLM consumption"""
    try:
        from config import settings
        api_key = settings.tavily_api_key
        if not api_key:
            return None

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": api_key,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                    "include_answer": False,
                },
            )
            if resp.status_code != 200:
                logger.warning(f"Tavily search returned {resp.status_code}")
                return None

            data = resp.json()
            results = []
            for r in data.get("results", [])[:max_results]:
                results.append({
                    "title": r.get("title", ""),
                    "snippet": r.get("content", "")[:300],
                    "url": r.get("url", ""),
                })
            if results:
                logger.info(f"Tavily search returned {len(results)} results for: {query[:50]}")
                return json.dumps(results, ensure_ascii=False)
            return None
    except Exception as e:
        logger.warning(f"Tavily search failed: {e}")
        return None


async def _duckduckgo_search(query: str, max_results: int = 5) -> str:
    """DuckDuckGo HTML search fallback"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                "https://html.duckduckgo.com/html/",
                params={"q": query},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            soup = BeautifulSoup(resp.text, "html.parser")
            results = []
            for r in soup.select(".result")[:max_results]:
                title_el = r.select_one(".result__title")
                snippet_el = r.select_one(".result__snippet")
                link_el = r.select_one(".result__url")
                if title_el:
                    results.append(
                        {
                            "title": title_el.get_text(strip=True),
                            "snippet": (
                                snippet_el.get_text(strip=True)
                                if snippet_el
                                else ""
                            ),
                            "url": (
                                link_el.get_text(strip=True) if link_el else ""
                            ),
                        }
                    )
            if not results:
                logger.warning(f"DuckDuckGo returned 0 results for: {query}")
            return json.dumps(results, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"DuckDuckGo search failed for '{query}': {e}")
            return json.dumps({"error": str(e), "query": query})


async def fetch_webpage(url: str, max_length: int = 5000) -> str:
    """抓取网页内容"""
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        try:
            resp = await client.get(
                url, headers={"User-Agent": "Mozilla/5.0"}
            )
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            return text[:max_length]
        except Exception as e:
            return f"Error fetching {url}: {e}"


def create_default_tools() -> ToolRegistry:
    """创建默认工具集"""
    registry = ToolRegistry()

    registry.register(
        name="web_search",
        description="Search the web for information about competitors, products, or markets. Returns top search results with titles, snippets, and URLs.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query string",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
        executor=web_search,
    )

    registry.register(
        name="fetch_webpage",
        description="Fetch and extract text content from a specific URL. Useful for reading competitor websites, product pages, or news articles.",
        input_schema={
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch",
                },
                "max_length": {
                    "type": "integer",
                    "description": "Maximum text length to return",
                    "default": 5000,
                },
            },
            "required": ["url"],
        },
        executor=fetch_webpage,
    )

    async def plan_analysis(
        query: str, competitors: list[str] | None = None
    ) -> str:
        return json.dumps(
            {
                "status": "plan_created",
                "query": query,
                "competitors": competitors or [],
            },
            ensure_ascii=False,
        )

    registry.register(
        name="plan_analysis",
        description="Create an analysis plan for a competitive analysis task.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "competitors": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["query"],
        },
        executor=plan_analysis,
    )

    async def analyze_data(data: str, analysis_type: str = "general") -> str:
        return json.dumps(
            {"status": "analysis_ready", "type": analysis_type},
            ensure_ascii=False,
        )

    registry.register(
        name="analyze_data",
        description="Analyze collected data and extract structured insights.",
        input_schema={
            "type": "object",
            "properties": {
                "data": {"type": "string"},
                "analysis_type": {"type": "string", "default": "general"},
            },
            "required": ["data"],
        },
        executor=analyze_data,
    )

    async def generate_report_section(
        section_name: str, content: str
    ) -> str:
        return json.dumps(
            {"status": "section_generated", "section": section_name},
            ensure_ascii=False,
        )

    registry.register(
        name="generate_report_section",
        description="Generate a specific section of the competitive analysis report.",
        input_schema={
            "type": "object",
            "properties": {
                "section_name": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["section_name", "content"],
        },
        executor=generate_report_section,
    )

    async def review_content(content: str, criteria: str = "") -> str:
        return json.dumps(
            {"status": "review_complete", "criteria": criteria},
            ensure_ascii=False,
        )

    registry.register(
        name="review_content",
        description="Review content for accuracy, completeness, and citation quality.",
        input_schema={
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "criteria": {"type": "string", "default": ""},
            },
            "required": ["content"],
        },
        executor=review_content,
    )

    async def verify_citation(url: str, claim: str) -> str:
        content = await fetch_webpage(url, max_length=3000)
        return json.dumps(
            {
                "url": url,
                "claim": claim,
                "page_content_preview": content[:500],
                "status": "verification_data_retrieved",
            },
            ensure_ascii=False,
        )

    registry.register(
        name="verify_citation",
        description="Verify a citation by fetching the source URL and checking if it supports the claimed information.",
        input_schema={
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "claim": {"type": "string"},
            },
            "required": ["url", "claim"],
        },
        executor=verify_citation,
    )

    return registry
