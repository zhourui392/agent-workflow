# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

AI 驱动的多步骤工作流自动化平台。用户通过 Web 界面配置工作流，每个步骤调用 Claude Agent SDK 执行。支持 cron 定时调度、手动触发、模板变量，以及两层配置合并（全局磁盘文件 + 工作流级别数据库配置）。

## 常用命令

### 后端 (Python / FastAPI)
```bash
cd backend && pip install -e .      # 安装依赖
python -m src.main                   # 启动服务，端口 :8000
```

### 前端 (Vue 3 / Vite)
```bash
cd frontend && npm install           # 安装依赖
npm run dev                          # 开发服务器，端口 :5173
npm run build                        # 生产构建（含类型检查）
npm run type-check                   # 仅 TypeScript 类型检查
```

## 架构

```
backend/src/
  api/          # FastAPI 路由层 (workflows.py, executions.py)
  core/         # 引擎层
    pipeline.py       # 多步骤流水线顺序编排
    executor.py       # 单步执行器 → 调用 Claude Agent SDK
    config_merger.py  # 合并全局配置（磁盘）+ 工作流配置（数据库）
    template.py       # 解析模板变量 {{today}}, {{steps.X.output}} 等
  scheduler/
    cron_manager.py   # APScheduler 定时任务注册/移除
  store/
    models.py         # SQLAlchemy 异步模型 (Workflow, Execution, StepExecution)
    schemas.py        # Pydantic 请求/响应模式
    database.py       # SQLite 异步会话管理
  main.py             # 应用入口，生命周期事件

frontend/src/
  views/        # 页面组件 (WorkflowList/Edit, ExecutionList/Detail, LiveMonitor, GlobalConfig)
  stores/       # Pinia 状态管理 (workflow.ts, execution.ts)
  api/          # Axios 服务层
  router/       # Vue Router 路由配置
```

## 关键设计决策

- **配置合并策略**: rules=拼接, tools=取交集, MCP=取并集, skills=同名覆盖
- **异步执行**: `asyncio.create_task` — API 立即返回，执行在后台运行
- **模板变量**: `{{today}}`, `{{yesterday}}`, `{{now}}`, `{{inputs.xxx}}`, `{{steps.<name>.output}}`
- **步骤失败策略**: stop（停止）/ skip（跳过）/ retry（重试）
- **全局配置存储在磁盘**: `backend/global_config/` (rules/, mcp/, skills/)
- **数据库**: SQLite，通过 aiosqlite 异步访问，文件路径 `backend/data/agent_workflow.db`

## 技术栈

- 后端: FastAPI, SQLAlchemy (异步), APScheduler, claude-code-sdk, structlog, Pydantic
- 前端: Vue 3 (Composition API), TypeScript, Vite, Element Plus, Pinia, Axios
- Python ≥ 3.11
