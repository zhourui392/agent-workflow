# Agent Workflow System — 技术方案

> 版本: v1.0 | 日期: 2026-03-08

## 1. 项目概述

### 1.1 目标
构建一个个人效率 Agent 系统，通过 Web 页面配置和管理工作流。每个工作流定义 prompt、MCP、skills、rules，支持定时调度和手动触发，支持启用/停用。底层基于 Claude Agent SDK，每个步骤 = 一次 Agent SDK 会话。

### 1.2 核心特性
- **工作流管理**: Web 页面表单式配置，支持 CRUD + 启用/停用
- **多步骤 Pipeline**: 简化版，每步是一次 Agent SDK 调用，前步输出自动传入下步
- **两层配置**: 全局 rules/MCP/skills + 工作流级覆盖，按策略合并
- **定时调度**: Cron 表达式定时触发，无人值守自动执行
- **实时监控**: WebSocket 推送执行日志和进度
- **执行历史**: 完整的执行记录、步骤详情、token 用量追踪

### 1.3 已确认的技术决策

| 决策项 | 选择 | 理由 |
|-------|------|------|
| 核心运行时 | Claude Agent SDK (Python) | 原生支持 tools/MCP/permissions，不需自己写 agent loop |
| 工作流形态 | 简化多步骤 | 每步是一次 SDK 调用，for 循环串联，复杂度极低 |
| 后端框架 | FastAPI | 异步支持好，WebSocket 原生支持 |
| 前端框架 | Vue 3 + Vite + Element Plus | 轻量易上手，适合管理后台 |
| 数据库 | SQLite + SQLAlchemy | 零运维，适合单机个人工具 |
| 调度器 | APScheduler | 轻量，进程内调度 |
| 目标定位 | 个人效率工具 | 不需多用户、高可用、RBAC |

---

## 2. 系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────┐
│                  Vue 3 + Vite 前端                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────────┐   │
│  │ 工作流配置  │ │ 执行历史    │ │ 实时监控       │   │
│  │ (表单CRUD  │ │ /日志查看   │ │ (WebSocket)    │   │
│  │ +启用/停用) │ │            │ │                │   │
│  └────────────┘ └────────────┘ └────────────────┘   │
└────────────────────────┬────────────────────────────┘
                         │ REST API + WebSocket
┌────────────────────────┴────────────────────────────┐
│                  FastAPI 后端                          │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │  API Layer   │  │  Scheduler  │  │ WebSocket Hub│ │
│  │  (CRUD +     │  │ (APScheduler│  │ (实时推送     │ │
│  │   触发执行)   │  │  cron管理)  │  │  日志/状态)  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘ │
│         └────────────────┼─────────────────┘         │
│                  ┌───────┴───────┐                    │
│                  │Pipeline Engine│                    │
│                  │ (步骤编排执行) │                    │
│                  └───────┬───────┘                    │
│     ┌──────────┬─────────┼─────────┬──────────┐      │
│     │Config    │Step     │MCP      │Skill     │      │
│     │Merger    │Executor │Manager  │Loader    │      │
│     │(两层合并) │(SDK调用) │(连接管理)│(加载)    │      │
│     └──────────┴─────────┴─────────┴──────────┘      │
│                  ┌───────────────┐                    │
│                  │   SQLite DB   │                    │
│                  └───────────────┘                    │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│ Claude Agent SDK │  ← 每步调用一次
└──────────────────┘
```

### 2.2 核心模块职责

| 模块 | 文件 | 职责 |
|-----|------|------|
| **API Layer** | `src/api/*.py` | FastAPI 路由：工作流 CRUD、启用/停用、触发执行、查询历史 |
| **WebSocket Hub** | `src/api/ws.py` | 管理 WebSocket 连接，实时推送执行日志和状态变更 |
| **Pipeline Engine** | `src/core/pipeline.py` | for 循环串联步骤，管理步骤间数据传递，处理失败策略 |
| **Step Executor** | `src/core/executor.py` | 单步执行：合并配置 → 渲染 prompt → 调用 Agent SDK → 收集输出 |
| **Config Merger** | `src/core/config_merger.py` | 全局配置（磁盘） + 工作流配置（DB）按策略合并 |
| **Template Engine** | `src/core/template.py` | 模板变量解析：`{{today}}`、`{{steps.xxx.output}}` 等 |
| **Cron Manager** | `src/scheduler/cron_manager.py` | APScheduler 驱动，根据 DB 中 enabled 状态注册/移除 cron job |
| **MCP Manager** | `src/mcp/manager.py` | MCP 服务连接/断开/健康检查，按工作流隔离 |
| **Skill Loader** | `src/skills/loader.py` | 扫描 skills/ 目录，解析 SKILL.md，注册为可用工具 |
| **Store** | `src/store/*.py` | SQLAlchemy 模型 + SQLite 读写 |

---

## 3. 核心设计

### 3.1 单步执行（核心逻辑）

每一步 = 一次 Claude Agent SDK 的 `query()` 调用：

```python
from claude_code_sdk import query, ClaudeCodeOptions

async def execute_step(step_config, context, merged_config):
    """单步执行：直接调用 Claude Agent SDK"""

    # 1. 合并 rules（全局 + 工作流 + 步骤级）
    system_prompt = merge_rules(
        merged_config.global_rules,
        step_config.rules
    )

    # 2. 渲染 prompt 模板（注入上一步输出、变量等）
    prompt = render_template(step_config.prompt, context)

    # 3. 合并工具权限
    allowed_tools = merge_tools(merged_config.tools, step_config.tools)

    # 4. 合并 MCP 服务
    mcp_servers = merge_mcp(merged_config.mcp, step_config.mcp)

    # 5. 调用 Agent SDK
    result_text = ""
    async for message in query(
        prompt=prompt,
        options=ClaudeCodeOptions(
            system_prompt=system_prompt,
            allowed_tools=allowed_tools,
            mcp_servers=mcp_servers,
            max_turns=step_config.max_turns or 30,
            permission_mode="full_auto",  # 无人值守模式
        )
    ):
        if message.type == "text":
            result_text += message.text
            # 实时推送到 WebSocket
            await ws_broadcast(execution_id, message.text)

    return StepResult(output=result_text, tokens_used=...)
```

### 3.2 Pipeline 执行

```python
async def execute_workflow(workflow, trigger_type="manual"):
    """多步串联执行"""
    execution = create_execution(workflow, trigger_type)
    context = {"inputs": resolve_inputs(workflow.inputs)}

    for i, step in enumerate(workflow.steps):
        update_execution_progress(execution, current_step=i)
        await ws_broadcast(execution.id, {
            "type": "step_start",
            "step": i,
            "name": step.name
        })

        try:
            result = await execute_step(step, context, merged_config)
            context[f"step_{step.name}"] = result.output
            save_step_execution(execution.id, i, step, result)

        except TokenBudgetExceeded:
            mark_execution_failed(execution, "Token budget exceeded")
            break
        except TimeoutError:
            mark_execution_failed(execution, "Execution timeout")
            break
        except Exception as e:
            if workflow.on_failure == "stop":
                mark_execution_failed(execution, str(e))
                break
            elif workflow.on_failure == "skip":
                continue

    mark_execution_completed(execution)
    await handle_output(workflow.output, context)
    return execution
```

### 3.3 两层配置合并策略

```
全局配置（磁盘文件）          工作流配置（DB）
├── rules/system.md    ──┐     ├── rules       ──┐
├── mcp/servers.yaml   ──┤     ├── mcp_servers ──┤
└── skills/*.md        ──┘     └── skills      ──┘
                         │                        │
                         └────── 合并引擎 ─────────┘
                                   │
                              合并后的配置
```

| 配置类型 | 合并策略 | 说明 |
|---------|---------|------|
| Rules (System Prompt) | **拼接** | 全局在前 + 工作流在后，用分隔符连接 |
| 工具白名单 (allowed_tools) | **取交集** | 工作流只能在全局范围内收紧，不能放宽 |
| MCP 服务 | **取并集** | 全局 + 工作流各自的 MCP 服务都可用 |
| Skills | **同名覆盖** | 工作流级同名 Skill 覆盖全局，不同名的保留 |

### 3.4 启用/停用机制

```
启用工作流:
  1. DB: workflow.enabled = true
  2. 如果有 cron → APScheduler 注册 cron job
  3. cron job 触发时 → 调用 execute_workflow()

停用工作流:
  1. DB: workflow.enabled = false
  2. APScheduler 移除该工作流的 cron job
  3. 不影响正在运行的执行（已触发的继续完成）

应用启动时:
  1. 扫描所有 enabled=true 且 schedule 非空的工作流
  2. 注册到 APScheduler
```

### 3.5 成本与安全控制

| 控制项 | 默认值 | 说明 |
|-------|-------|------|
| max_tokens | 100,000 | 单次执行的 token 上限（所有步骤合计） |
| max_duration | 30 分钟 | 单次执行最大时长 |
| max_turns | 30 | 单步最大 agent 轮次 |
| max_retries | 2 | 步骤失败重试次数 |
| permission_mode | full_auto | 定时任务无人值守，全自动模式 |

### 3.6 模板变量

工作流的 inputs 和步骤 prompt 支持模板变量：

| 变量 | 示例 | 说明 |
|-----|------|------|
| `{{today}}` | 2026-03-08 | 当前日期 |
| `{{yesterday}}` | 2026-03-07 | 昨天日期 |
| `{{now}}` | 2026-03-08 14:30:00 | 当前时间 |
| `{{inputs.xxx}}` | - | 工作流输入参数 |
| `{{steps.step_name.output}}` | - | 前序步骤的输出 |

---

## 4. 数据模型

### 4.1 数据库表

```sql
-- 工作流定义（Web 页面表单 → DB）
CREATE TABLE workflows (
    id          TEXT PRIMARY KEY,        -- UUID
    name        TEXT NOT NULL UNIQUE,    -- 工作流名称
    description TEXT,                    -- 描述
    enabled     BOOLEAN DEFAULT true,   -- 启用/停用
    schedule    TEXT,                    -- cron 表达式，null = 仅手动触发
    inputs      JSON,                   -- 输入参数定义 [{name, type, default, required}]
    steps       JSON,                   -- 步骤列表 [{name, prompt, tools, mcp, rules, model, max_turns}]
    rules       JSON,                   -- 工作流级 rules {system_prompt, permissions}
    mcp_servers JSON,                   -- 工作流级 MCP [{name, command, args, env}]
    skills      JSON,                   -- 工作流级 skills [{name, content}]
    limits      JSON,                   -- {max_tokens, max_duration, max_retries}
    output      JSON,                   -- {file_path, notify: {type, url}}
    on_failure  TEXT DEFAULT 'stop',    -- stop / skip / retry
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 执行记录
CREATE TABLE executions (
    id            TEXT PRIMARY KEY,
    workflow_id   TEXT NOT NULL,
    workflow_name TEXT NOT NULL,          -- 冗余存储，便于查询
    trigger_type  TEXT NOT NULL,          -- manual / scheduled
    status        TEXT NOT NULL,          -- pending / running / success / failed / timeout
    started_at    DATETIME,
    finished_at   DATETIME,
    current_step  INTEGER DEFAULT 0,
    total_steps   INTEGER NOT NULL,
    total_tokens  INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
);

-- 步骤执行详情
CREATE TABLE step_executions (
    id              TEXT PRIMARY KEY,
    execution_id    TEXT NOT NULL,
    step_index      INTEGER NOT NULL,
    step_name       TEXT NOT NULL,
    status          TEXT NOT NULL,        -- pending / running / success / failed / skipped
    started_at      DATETIME,
    finished_at     DATETIME,
    prompt_rendered TEXT,                  -- 模板渲染后的实际 prompt
    output_text     TEXT,                  -- Agent SDK 返回的输出
    tokens_used     INTEGER DEFAULT 0,
    model_used      TEXT,
    error_message   TEXT,
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);
```

### 4.2 Steps JSON 结构

```json
[
  {
    "name": "collect-changes",
    "prompt": "查看仓库自 {{inputs.since}} 以来的所有变更",
    "tools": ["bash", "read", "glob", "grep"],
    "model": "claude-sonnet-4-6",
    "max_turns": 20,
    "rules": null,
    "mcp": null
  },
  {
    "name": "review-code",
    "prompt": "对以下变更进行代码审查:\n{{steps.collect-changes.output}}",
    "tools": ["bash", "read"],
    "model": "claude-opus-4-6",
    "max_turns": 30,
    "rules": "严格检查安全漏洞和性能问题",
    "mcp": null
  }
]
```

---

## 5. API 设计

### 5.1 工作流管理

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | `/api/workflows` | 工作流列表（含 enabled 状态） |
| POST | `/api/workflows` | 创建工作流 |
| GET | `/api/workflows/{id}` | 工作流详情 |
| PUT | `/api/workflows/{id}` | 更新工作流 |
| DELETE | `/api/workflows/{id}` | 删除工作流 |
| PATCH | `/api/workflows/{id}/toggle` | 启用/停用切换 |
| POST | `/api/workflows/{id}/run` | 手动触发执行 |

### 5.2 执行管理

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | `/api/executions` | 执行历史列表（支持 `?workflow_id=` 过滤） |
| GET | `/api/executions/{id}` | 执行详情（含步骤明细） |

### 5.3 全局配置

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | `/api/config` | 获取全局配置（rules、MCP、skills、defaults） |
| PUT | `/api/config` | 更新全局配置 |

### 5.4 实时监控

| 协议 | 路径 | 说明 |
|-----|------|------|
| WebSocket | `/ws/executions/{id}` | 订阅执行实时日志流 |

### 5.5 请求/响应示例

**创建工作流 POST /api/workflows**
```json
{
  "name": "daily-code-review",
  "description": "每日代码审查报告",
  "enabled": true,
  "schedule": "0 9 * * 1-5",
  "inputs": [
    {"name": "repo_path", "type": "string", "default": "/path/to/repo"},
    {"name": "since", "type": "string", "default": "{{yesterday}}"}
  ],
  "steps": [
    {
      "name": "collect-changes",
      "prompt": "查看 {{inputs.repo_path}} 仓库自 {{inputs.since}} 以来的提交",
      "tools": ["bash", "read", "glob"],
      "model": "claude-sonnet-4-6"
    },
    {
      "name": "review",
      "prompt": "审查以下变更:\n{{steps.collect-changes.output}}",
      "tools": ["read"],
      "model": "claude-opus-4-6"
    }
  ],
  "rules": {
    "system_prompt": "你是代码审查专家，重点关注安全和性能",
    "permissions": {"allowed_tools": ["bash", "read", "glob", "write"]}
  },
  "limits": {"max_tokens": 200000, "max_duration": "30m"},
  "output": {"file": "reports/review-{{today}}.md"},
  "on_failure": "stop"
}
```

**启用/停用 PATCH /api/workflows/{id}/toggle**
```json
// Response
{"id": "xxx", "enabled": false, "schedule_status": "unregistered"}
```

---

## 6. 前端页面设计

### 6.1 页面清单

| 页面 | 路由 | 核心功能 |
|-----|------|---------|
| 工作流列表 | `/` | 卡片/表格展示，每行：名称、描述、cron、上次执行状态、**启用/停用 Switch**、编辑、手动运行、删除 |
| 工作流编辑 | `/workflows/:id` | 分区表单：① 基本信息 → ② 步骤编辑器（可增删拖拽排序）→ ③ 调度配置 → ④ Rules/MCP/Skills → ⑤ 成本控制 → ⑥ 输出配置 |
| 新建工作流 | `/workflows/new` | 同编辑页面，空表单 |
| 执行历史 | `/executions` | 表格：工作流名、触发方式(manual/scheduled badge)、状态 badge、耗时、token 用量、操作(查看详情) |
| 执行详情 | `/executions/:id` | 步骤时间线（每步可展开看 rendered prompt 和 output）+ 顶部汇总（总耗时、总 tokens、状态） |
| 实时监控 | `/monitor` | 正在运行的执行列表 + 点击进入实时日志流（WebSocket 推送） |
| 全局配置 | `/settings` | Rules 文本编辑器、MCP 服务列表管理、Skills 列表管理、默认模型/预算设置 |

### 6.2 关键组件

| 组件 | 说明 |
|-----|------|
| `StepEditor.vue` | 步骤列表编辑器，支持增删、拖拽排序，每步可配置 name/prompt/tools/model |
| `CronInput.vue` | Cron 表达式输入，下方显示人类可读的执行描述（"每工作日早上 9:00"） |
| `LogViewer.vue` | 日志流展示组件，支持 WebSocket 实时追加 + 滚动到底部 |
| `RulesEditor.vue` | System Prompt 编辑器（Markdown 文本域）+ 权限配置 |
| `McpSelector.vue` | MCP 服务选择/配置组件 |

---

## 7. 项目结构

```
agent-workflow/
├── docs/
│   └── tech-spec.md                    # 本文档
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── workflows.py            # 工作流 CRUD + 启用/停用 + 手动触发
│   │   │   ├── executions.py           # 执行历史查询
│   │   │   ├── config.py               # 全局配置 API
│   │   │   └── ws.py                   # WebSocket 实时推送
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── executor.py             # 单步执行（调 Claude Agent SDK）
│   │   │   ├── pipeline.py             # Pipeline 编排（for 循环）
│   │   │   ├── config_merger.py        # 两层配置合并引擎
│   │   │   └── template.py             # 模板变量解析
│   │   ├── scheduler/
│   │   │   ├── __init__.py
│   │   │   └── cron_manager.py         # APScheduler cron 注册/移除
│   │   ├── mcp/
│   │   │   ├── __init__.py
│   │   │   └── manager.py              # MCP 服务连接管理
│   │   ├── skills/
│   │   │   ├── __init__.py
│   │   │   └── loader.py               # SKILL.md 解析与注册
│   │   ├── store/
│   │   │   ├── __init__.py
│   │   │   ├── models.py               # SQLAlchemy ORM 模型
│   │   │   └── database.py             # SQLite 连接 + session 管理
│   │   └── main.py                     # FastAPI 应用入口
│   ├── global_config/                   # 全局配置文件（磁盘）
│   │   ├── rules/
│   │   │   └── system.md               # 全局 System Prompt
│   │   ├── mcp/
│   │   │   └── servers.yaml            # 全局 MCP 服务配置
│   │   └── skills/
│   │       └── *.md                    # 全局 Skills（SKILL.md 格式）
│   ├── data/
│   │   └── agent_workflow.db           # SQLite 数据库文件
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── views/
│   │   │   ├── WorkflowList.vue
│   │   │   ├── WorkflowEdit.vue
│   │   │   ├── ExecutionList.vue
│   │   │   ├── ExecutionDetail.vue
│   │   │   ├── LiveMonitor.vue
│   │   │   └── GlobalConfig.vue
│   │   ├── components/
│   │   │   ├── StepEditor.vue
│   │   │   ├── CronInput.vue
│   │   │   ├── LogViewer.vue
│   │   │   ├── RulesEditor.vue
│   │   │   └── McpSelector.vue
│   │   ├── api/
│   │   │   └── index.ts                # axios 封装
│   │   ├── stores/
│   │   │   ├── workflow.ts             # Pinia workflow store
│   │   │   └── execution.ts            # Pinia execution store
│   │   ├── router/
│   │   │   └── index.ts
│   │   ├── App.vue
│   │   └── main.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── README.md
```

---

## 8. 技术选型

| 组件 | 选择 | 版本 | 理由 |
|-----|------|------|------|
| Agent Runtime | claude-code-sdk | latest | 核心依赖，原生 tools/MCP/permissions |
| 后端框架 | FastAPI | 0.100+ | 异步、WebSocket、自动文档 |
| ORM | SQLAlchemy | 2.0+ | Python 标准 ORM，async 支持 |
| 数据库 | SQLite | 3.x | 零运维，单文件，够用 |
| 调度 | APScheduler | 4.x | 进程内轻量调度 |
| 前端框架 | Vue 3 | 3.4+ | Composition API，轻量 |
| 构建工具 | Vite | 5.x | 快速 HMR |
| UI 库 | Element Plus | 2.x | Vue 3 主流 UI 库 |
| 状态管理 | Pinia | 2.x | Vue 3 官方推荐 |
| HTTP 客户端 | Axios | 1.x | 前端请求封装 |
| 日志 | structlog | latest | 结构化 JSON 日志 |

---

## 9. 实现路线

### P0 — 核心可运行
1. **后端骨架**: FastAPI + SQLite + SQLAlchemy 模型 + DB 迁移
2. **工作流 CRUD API**: 完整 REST API + 启用/停用 toggle
3. **单步执行器**: 调用 `claude_code_sdk.query()`，收集输出
4. **Pipeline 引擎**: for 循环串联步骤，前步输出传入下步 context
5. **两层配置合并**: 全局（磁盘文件）+ 工作流（DB）合并
6. **APScheduler 调度**: 启动时扫描 enabled 工作流注册 cron
7. **成本保护**: token 计数 + 执行超时
8. **前端**: 工作流列表（启用/停用 Switch）+ 表单编辑 + 手动触发按钮
9. **执行历史**: 列表页 + 详情页（步骤展开）

### P1 — 实用增强
- WebSocket 实时执行监控
- 模板变量引擎（`{{today}}`、`{{steps.xxx.output}}`）
- MCP 服务集成
- Skills 文件扫描加载
- Webhook 通知
- 全局配置管理页

### P2 — 高级功能
- 步骤失败策略（stop / skip / retry）
- 多模型支持（步骤级选择）
- 工作流导入/导出（JSON）
- 执行统计 Dashboard（token 趋势、成功率图表）
- 条件步骤（`when` 表达式）

---

## 10. 验证方案

| # | 测试场景 | 验证内容 |
|---|---------|---------|
| 1 | 创建单步工作流 | 页面表单创建 → 保存到 DB → 列表展示 |
| 2 | 手动触发执行 | 点击运行 → Agent SDK 调用 → 输出记录到 step_executions |
| 3 | 查看执行历史 | 执行完成后 → 历史列表显示 → 详情页展示步骤输出 |
| 4 | 定时调度 | 配置 cron + 启用 → APScheduler 自动触发 → 执行记录生成 |
| 5 | 启用/停用 | 停用 → cron 移除 → 不再自动执行；启用 → cron 恢复 |
| 6 | 多步骤传递 | 2 步工作流 → 步骤 2 的 prompt 引用步骤 1 的输出 → 验证渲染正确 |
| 7 | 成本控制 | 设置极低 token 预算 → 验证超限自动终止 |
| 8 | 两层配置 | 全局设置工具白名单 → 工作流收紧 → 验证实际可用工具是交集 |
| 9 | WebSocket 监控 | 触发执行 → 前端实时看到日志流和进度更新 |

---

## 11. 待定决策项

以下项已给出建议值，实现时可按需调整：

| 项 | 建议值 | 说明 |
|---|-------|------|
| 步骤间数据传递 | 全量传递输出文本 | 通过 `{{steps.xxx.output}}` 引用 |
| 步骤间上下文 | 独立会话 | 每步独立 SDK 调用，不共享对话历史 |
| 默认失败策略 | stop | 某步失败则终止整个 Pipeline |
| 默认 token 预算 | 100K | 单次执行所有步骤合计 |
| 默认超时 | 30 分钟 | 单次执行总时长 |
| 默认 max_turns | 30 | 单步 Agent 最大轮次 |
