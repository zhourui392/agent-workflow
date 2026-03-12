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

## 代码变更规范

### Git 提交前检查

**重要**: 每次执行 `git commit` 前，必须先检查并更新 README.md 文档（如有必要）。

### README.md 同步检查

每次完成代码变更后，必须判断 README.md 是否需要同步更新。需要更新 README 的情况：

- **新增功能**: 添加新的 API 端点、页面、命令等
- **修改架构**: 新增/删除/重命名目录或核心模块
- **变更依赖**: 修改 package.json、requirements.txt 等依赖文件
- **修改配置**: 环境变量、配置文件格式变化
- **修改启动命令**: 开发或生产环境的启动方式变更
- **修改技术栈**: 引入或移除主要框架/库

不需要更新 README 的情况：

- Bug 修复（不影响使用方式）
- 代码重构（不改变外部行为）
- 样式调整
- 测试代码变更
- 注释或文档字符串修改
