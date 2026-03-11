# Agent Workflow

个人效率自动化平台 —— 通过 Web 界面配置和管理 AI 驱动的多步骤工作流。每个步骤调用 Claude Agent SDK 执行任务，支持手动触发和定时调度，完整记录执行历史。

适用场景：每日代码审查报告、自动化文档生成、批量数据处理等。

## 技术栈

| 部署模式 | 技术栈 |
|----------|--------|
| Web 服务 | Python · FastAPI · SQLAlchemy (SQLite) · APScheduler · Claude Agent SDK |
| 桌面应用 | Electron · Node.js · TypeScript · better-sqlite3 · node-cron · Claude Code SDK |
| 前端 | Vue 3 · TypeScript · Vite · Element Plus · Pinia |

## 项目结构

```
agent-workflow/
├── backend/                # Python Web 后端
│   ├── src/
│   │   ├── api/            # REST 接口 (workflows, executions)
│   │   ├── core/           # 流水线引擎、执行器、配置合并、模板
│   │   ├── scheduler/      # APScheduler 定时任务
│   │   ├── store/          # SQLAlchemy 模型 & 数据库
│   │   └── main.py         # FastAPI 入口
│   ├── global_config/      # 全局配置 (rules, MCP, skills)
│   └── data/               # SQLite 数据文件
├── frontend/               # Vue 前端 (Web 模式)
│   ├── src/
│   │   ├── views/          # 页面组件
│   │   ├── api/            # Axios API 封装
│   │   ├── stores/         # Pinia 状态管理
│   │   └── router/         # 路由
│   └── package.json
├── electron-app/           # Electron 桌面应用
│   ├── src/
│   │   ├── main/           # 主进程 (Node.js)
│   │   │   ├── core/       # 流水线引擎、执行器、配置合并
│   │   │   ├── ipc/        # IPC 处理器
│   │   │   ├── scheduler/  # node-cron 定时任务
│   │   │   ├── services/   # 业务逻辑层
│   │   │   └── store/      # better-sqlite3 数据层
│   │   ├── preload/        # Preload 脚本
│   │   └── renderer/       # 渲染进程 (Vue)
│   ├── test/               # 测试套件
│   └── package.json
└── doc/                    # 设计文档
```

## 核心功能

- **工作流管理** — 通过表单创建/编辑多步骤工作流，支持启用/禁用
- **多步骤流水线** — 步骤顺序执行，前一步输出自动传递给下一步
- **定时调度** — Cron 表达式配置，支持手动触发
- **实时监控** — WebSocket 推送执行日志，实时查看进度
- **两层配置** — 全局配置 (磁盘) + 工作流配置 (数据库)，自动合并
- **执行历史** — 完整记录每次执行的步骤详情、Token 用量、耗时
- **模板变量** — 支持 `{{today}}`、`{{inputs.xxx}}`、`{{steps.step_name.output}}` 等

## 快速开始

### 方式一：Web 服务模式

**后端**
```bash
cd backend
pip install -e .
python -m src.main
# 运行在 http://localhost:8000
```

**前端**
```bash
cd frontend
npm install
npm run dev
# 运行在 http://localhost:5173
```

### 方式二：Electron 桌面应用

```bash
cd electron-app
npm install

# 运行测试
npm test

# 开发模式
npm run electron:dev

# 打包
npm run electron:build
```

## API 概览

### Web 模式 (HTTP API)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflows` | 工作流列表 |
| POST | `/api/workflows` | 创建工作流 |
| PUT | `/api/workflows/{id}` | 更新工作流 |
| DELETE | `/api/workflows/{id}` | 删除工作流 |
| POST | `/api/workflows/{id}/run` | 手动触发执行 |
| GET | `/api/executions` | 执行历史 |
| GET | `/api/executions/{id}` | 执行详情 |
| WS | `/ws/executions/{id}` | 实时日志流 |

### Electron 模式 (IPC API)

| IPC Channel | 说明 |
|-------------|------|
| `workflows:list` | 获取工作流列表 |
| `workflows:create` | 创建工作流 |
| `workflows:update` | 更新工作流 |
| `workflows:delete` | 删除工作流 |
| `workflows:run` | 手动触发执行 |
| `executions:list` | 执行历史 |
| `executions:get` | 执行详情 |
| `execution:progress` | 实时进度事件 |
