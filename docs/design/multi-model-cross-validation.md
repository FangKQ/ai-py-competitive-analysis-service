# 多模型交叉验证设计文档

## 1. 概述

为现有竞品分析 Agent 系统接入 GPT + Claude 两家大模型，对关键分析环节（Analyst、Writer）实施双模型并行执行 + Claude 仲裁融合，以提升报告深度和事实可靠性。

### 1.1 目标

- 分析和撰写环节由 GPT 和 Claude 各独立执行一遍，再由仲裁 Agent（Claude）融合最终结果
- 通过多模型共识机制降低幻觉和捏造风险
- 架构预留 Gemini 扩展位
- 提供开关可退回单模型模式

### 1.2 非目标

- 不接入 Gemini（当前阶段）
- 不做人工介入分歧决策
- 不追求绝对消除幻觉
- 不改变现有 6 个角色的基本定义
- 不做采集和引用验证环节的多模型并行

---

## 2. 架构设计

### 2.1 DAG 执行流程

```
                    ┌─────────────┐
                    │ Orchestrator│ (GPT, 单模型)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Collector  │ (GPT, 单模型)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │                         │
     ┌────────▼────────┐    ┌──────────▼─────────┐
     │  Analyst (GPT)  │    │  Analyst (Claude)  │  ← 并行
     └────────┬────────┘    └──────────┬─────────┘
              │                         │
              └────────────┬────────────┘
                    ┌──────▼──────┐
                    │  Arbiter    │ (Claude, 仲裁融合分析)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │                         │
     ┌────────▼────────┐    ┌──────────▼─────────┐
     │  Writer (GPT)   │    │  Writer (Claude)   │  ← 并行
     └────────┬────────┘    └──────────┬─────────┘
              │                         │
              └────────────┬────────────┘
                    ┌──────▼──────┐
                    │  Arbiter    │ (Claude, 仲裁融合报告)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Reviewer   │ (GPT, 单模型)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Citation   │ (GPT, 单模型)
                    └──────┴──────┘
```

### 2.2 LLM Provider 抽象层

新增 `backend/harness/providers.py`：

```python
class LLMProvider(Protocol):
    provider_name: str  # "openai" | "anthropic"
    
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 8192,
    ) -> ProviderResponse: ...

@dataclass
class ProviderResponse:
    content: str
    tool_calls: list[dict]
    input_tokens: int
    output_tokens: int
    finish_reason: str
    raw_response: Any
```

两个实现：
- `OpenAIProvider` — 包装 `openai.AsyncOpenAI`
- `AnthropicProvider` — 包装 `anthropic.AsyncAnthropic`

### 2.3 Arbiter Agent 仲裁逻辑

Arbiter 有两种工作模式：

**分析仲裁**：接收两份 Analyst JSON 输出，对比融合
- 共识结论 → 直接采纳（置信度高）
- 互补结论 → 有证据则合并
- 冲突结论 → 证据链强度择优（置信度中）
- 无证据孤立结论 → 标记"待验证"

**报告仲裁**：接收两份 Writer Markdown 报告，融合最终版
- 选择结构更优的报告作骨架
- 补充另一份报告中更好的论述和数据
- 确保事实陈述有引用
- 去除无来源支撑的"事实"

### 2.4 DAGNode 扩展

```python
class DAGNode(BaseModel):
    # ... 现有字段
    provider_id: str = "openai"  # 指定使用哪个 Provider
```

### 2.5 AgentRole 扩展

```python
class AgentRole(str, Enum):
    ORCHESTRATOR = "orchestrator"
    COLLECTOR = "collector"
    ANALYST = "analyst"
    WRITER = "writer"
    REVIEWER = "reviewer"
    CITATION = "citation"
    ARBITER = "arbiter"  # 新增
```

---

## 3. 配置

### 3.1 环境变量

```env
# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Multi-model strategy
CROSS_VALIDATION_ENABLED=true
```

### 3.2 开关机制

- `CROSS_VALIDATION_ENABLED=true` → DAG 生成并行分裂+仲裁节点
- `CROSS_VALIDATION_ENABLED=false` → DAG 保持单链路结构（完全兼容）

### 3.3 模型列表扩展

```python
AVAILABLE_MODELS = [
    {"id": "gpt-5.5-2026-04-23", "name": "GPT-5.5", "provider": "openai"},
    {"id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "provider": "openai"},
    {"id": "gpt-4.1", "name": "GPT-4.1", "provider": "openai"},
    {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "anthropic"},
]
```

### 3.4 Arbiter 默认配置

```python
"arbiter": {
    "display_name": "仲裁官",
    "model": "claude-sonnet-4-20250514",
    "token_budget": 32768,
    "enabled_tools": [],
}
```

---

## 4. 文件变更清单

### 新增文件

| 文件 | 职责 |
|------|------|
| `backend/harness/providers.py` | LLMProvider Protocol + OpenAIProvider + AnthropicProvider |
| `backend/agents/arbiter.py` | Arbiter Agent 仲裁逻辑 + 专用 Prompt |

### 修改文件

| 文件 | 变更内容 |
|------|---------|
| `backend/harness/runtime.py` | 接收 LLMProvider 替代 AsyncOpenAI |
| `backend/harness/surface.py` | DAG 支持并行分裂+仲裁节点生成 |
| `backend/agents/base.py` | 接收 provider 而非 client |
| `backend/agents/config_store.py` | 模型列表加 Claude；默认配置加 arbiter |
| `backend/agents/prompts.py` | 新增 ARBITER_ANALYSIS_PROMPT 和 ARBITER_REPORT_PROMPT |
| `backend/schemas/__init__.py` | AgentRole 加 ARBITER；DAGNode 加 provider_id |
| `backend/config.py` | 新增 anthropic 相关配置 |
| `backend/.env.example` | 新增 Anthropic 环境变量示例 |
| `backend/agents/__init__.py` | Engine 根据 provider_id 选择 Provider |
| `backend/api/agents.py` | 测试端点支持 Anthropic；models 接口含 provider 字段 |
| `backend/requirements.txt` | 新增 anthropic>=0.52.0 |

---

## 5. Decision Log

| # | 决策 | 备选方案 | 选择理由 |
|---|------|---------|---------|
| 1 | 混合模式：关键环节双模型并行+仲裁，轻量环节单模型 | 全部并行 / 分工不交叉 | 质量收益集中在分析和撰写，采集和验证是工具驱动 |
| 2 | 仲裁 Agent 融合 | 多数投票 / 人工决策 | 语义级融合比硬投票更细腻；全自动不打断流程 |
| 3 | Claude 固定做仲裁 | GPT / 可配置 / 第四方模型 | Claude 长文本理解和推理强 |
| 4 | 先 GPT + Claude，预留 Gemini | 三家齐上 | Gemini API 当前不可用 |
| 5 | Anthropic 官方 SDK 直连 | OpenAI 兼容模式 | 原生支持 Claude 特性 |
| 6 | Provider 抽象层 + DAG 节点扩展 | Runtime 内置多模型策略 | 架构清晰、可观测、可测试 |
| 7 | 新增 ARBITER 角色 | 复用 REVIEWER | 职责不同，分离更清晰 |
| 8 | CROSS_VALIDATION_ENABLED 开关 | 无开关 | 方便调试对比和降级容灾 |
| 9 | Arbiter 不使用工具 | 给 Arbiter 加搜索 | 仲裁基于现有证据，不引入新信息源 |
| 10 | Analyst/Writer 双模型，其余单模型 | 全部双模型 | YAGNI，工具驱动环节无增益 |

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API 成本翻倍 | 分析+撰写环节调用量 ×2 + 仲裁 | CROSS_VALIDATION_ENABLED 开关可退回单模型 |
| 仲裁质量依赖 Prompt 调优 | 融合结果可能不如预期 | 事件总线记录仲裁决策过程，便于迭代 prompt |
| Anthropic API 不可用 | 整个交叉验证链路中断 | 开关关闭后自动退回单模型 GPT 模式 |
| 总耗时增加 | 并行+仲裁多一轮 LLM 调用 | 关键环节已并行，仲裁是单次调用，总增时可控 |
