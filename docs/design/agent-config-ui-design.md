# Agent 配置管理功能设计文档

## 1. 概述

为现有 6 个固定角色的 Agent（Orchestrator/Collector/Analyst/Writer/Reviewer/Citation）开发面向最终用户的可视化配置管理功能。用户通过前端 UI 调整每个 Agent 的行为参数，无需修改代码。

### 1.1 目标

- 用户可配置每个 Agent 的：模型选择、角色 prompt/指令、任务总 token 预算、可用工具列表
- 配置持久化到 SQLite 数据库
- 修改 prompt 后可实时预览测试单个 Agent 的输出效果
- 与现有任务执行流程解耦，配置变更不影响正在执行的任务

### 1.2 非目标

- 不做用户认证（当前为单用户版本）
- 不做 Agent 角色增删（6 个角色固定）
- 不做自定义工具注册（从预置列表勾选）
- 不做配置版本历史
- 不做多套配置方案切换
- 不做配置导入导出

---

## 2. 数据模型

SQLite 单表 `agent_configs`:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| role | TEXT UNIQUE | 角色标识（orchestrator/collector/analyst/writer/reviewer/citation） |
| display_name | TEXT | 显示名称（编排器/采集器/分析师/撰写者/审核员/引用器） |
| model | TEXT | 选用的模型（如 gpt-5.5、gpt-4.1-mini） |
| system_prompt | TEXT | 角色 prompt 指令 |
| token_budget | INTEGER | 每次任务该 Agent 的总 token 预算 |
| enabled_tools | TEXT (JSON array) | 可用工具列表，如 `["web_search", "fetch_webpage"]` |
| updated_at | TIMESTAMP | 最后修改时间 |

启动时如果表为空，自动 seed 当前 6 个 Agent 的默认值（从 prompts.py 和 config.py 取）。

---

## 3. 后端 API

新增路由模块 `backend/api/agents.py`，挂载前缀 `/api/agents`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | 返回 6 个 Agent 的完整配置列表 |
| GET | `/api/agents/{role}` | 返回单个 Agent 配置 |
| PUT | `/api/agents/{role}` | 更新单个 Agent 配置（partial update） |
| POST | `/api/agents/{role}/reset` | 重置为系统默认值 |
| POST | `/api/agents/{role}/test` | 预览测试：发送消息，用当前配置调用 LLM，返回输出 |
| GET | `/api/agents/models` | 返回可选模型列表 |
| GET | `/api/agents/tools` | 返回预置工具列表（id + name + description） |

### 3.1 测试端点设计

- 请求体：`{ "message": "用户输入的测试消息" }`
- 用该 Agent 当前的 model + system_prompt 发一次 LLM 调用
- 不走 DAG，不调用工具，纯粹测试 prompt 效果
- Token 上限 = 该 Agent 配置的 token_budget
- 返回：`{ "response": "LLM 输出", "tokens_used": 123, "duration_ms": 450 }`

---

## 4. 前端页面

新增 `/agents` 路由页面，顶部导航增加"Agent 工坊"入口。

### 4.1 布局

```
┌─────────────────────────────────────────────────────┐
│  Header  [首页] [Agent 工坊] (active)                │
├────────────┬────────────────────────────────────────┤
│            │                                         │
│  角色列表   │  配置编辑面板                            │
│            │                                         │
│ ┌────────┐ │  角色名称 + 模型下拉选择                 │
│ │编排器 ●│ │  Token 预算输入框                        │
│ │采集器  │ │  System Prompt 多行编辑器（可拖拽调高）    │
│ │分析师  │ │  可用工具 checkbox 列表                   │
│ │撰写者  │ │  [重置默认] [保存] 按钮                  │
│ │审核员  │ │                                         │
│ │引用器  │ │  预览测试区域                            │
│ └────────┘ │  输入框 + 发送按钮                       │
│            │  输出展示 + token/耗时统计                │
├────────────┴────────────────────────────────────────┤
```

### 4.2 交互

- 左侧列表点击切换右侧面板，高亮当前编辑的角色
- 保存时调 PUT，成功后 toast 提示
- 重置调 POST reset，弹确认框
- 预览区域调 POST test，展示结果 + token 消耗 + 耗时
- Prompt 编辑框可拖拽调整高度

---

## 5. 引擎集成

修改 `CompetitiveAnalysisEngine._create_agent` 方法：

```
执行流程:
1. 创建任务 → 初始化 Engine
2. Engine 调用 config_store.get_all_configs()
3. 对每个角色：
   - 有 DB 配置 → 用 DB 的 model/prompt/token_budget/tools
   - 无 DB 配置 → fallback 到 prompts.py 默认值
4. 构建 Agent 实例时传入配置
5. Runtime 层的 token 治理读取该 Agent 的 token_budget
6. Capability 层的工具注册根据 enabled_tools 过滤
```

关键原则：
- config_store 在引擎中只读查询
- 任务开始时一次性 snapshot 配置，执行过程中不因配置变更而改变行为
- DB 不可用时全部 fallback 到默认值，不阻塞任务执行

---

## 6. 输入校验与错误处理

### 输入校验
- `model` 必须在系统已注册模型列表中（否则 400）
- `token_budget` 范围：1024 ~ 32768
- `system_prompt` 不能为空，最大长度 20000 字符
- `enabled_tools` 中的每个 tool_id 必须在预置工具列表中

### 容错
- DB 连接失败 → 日志 error，API 返回默认配置（只读降级）
- LLM 调用失败（测试时）→ 返回具体错误信息给前端展示
- 保存时乐观更新，前端先展示成功，失败回滚 UI 状态

---

## 7. 文件变更清单

### 新增文件
- `backend/agents/config_store.py` — DB 读写 + seed 逻辑
- `backend/api/agents.py` — Agent 配置 CRUD + 测试路由
- `frontend/app/agents/page.tsx` — Agent 工坊页面
- `frontend/components/AgentConfigPanel.tsx` — 配置编辑面板组件
- `frontend/components/AgentTestPanel.tsx` — 预览测试组件

### 修改文件
- `backend/main.py` — 注册新路由，启动时初始化 DB
- `backend/api/__init__.py` — 导入新路由
- `backend/agents/__init__.py` — Engine 读取 DB 配置
- `frontend/components/Header.tsx` — 导航增加"Agent 工坊"入口

---

## 8. Decision Log

| # | 决策 | 备选方案 | 选择理由 |
|---|------|---------|---------|
| 1 | 面向最终用户的可视化 UI 配置 | 配置文件 / 两者兼有 | 用户是非开发者，需要直观操作 |
| 2 | 单用户版本，暂不做认证 | JWT / OAuth / localStorage UUID | 降低复杂度，认证后续扩展 |
| 3 | 6 个角色固定，用户只改参数 | 可增删 Agent / 完全自定义 | 控制复杂度，保持 DAG 流程稳定 |
| 4 | 预置工具列表勾选 | 用户自定义工具注册 | 先做简单的，自定义后面扩展 |
| 5 | 系统已接入模型列表（GPT 系列） | 用户自带 API Key | 安全可控，模型管理集中 |
| 6 | SQLite 持久化 | 内存 / 文件 | 项目已有 aiosqlite 依赖，结构化查询方便 |
| 7 | 独立 Agent 管理页面 | 嵌入任务创建流程 | 职责分离，UI 不臃肿 |
| 8 | 每 Agent 每任务总 token 预算 | 单次 max_tokens / 两者 | 粒度够用，简单直接 |
| 9 | 预览测试 token 上限 = Agent 自身 token_budget | 硬编码 2048/4096 | 与用户配置一致，直觉合理 |
| 10 | Option A 轻量表单页 | 画布式 / 对话式 | 开发量小，用户理解成本低 |
