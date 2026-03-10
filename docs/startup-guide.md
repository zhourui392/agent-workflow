# 服务启动说明

> 基于 CLAUDE.md、pyproject.toml、package.json、main.py、vite.config.ts 整理。

## 环境要求

| 项目 | 要求 |
|------|------|
| Python | >= 3.11 |
| Node.js | >= 18 |
| npm | >= 9 |
| Claude Code CLI | 已安装并可用（后端通过 claude-agent-sdk 调用） |

## 一、后端启动

```bash
cd backend

# 1. 创建并激活虚拟环境（首次）
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

# 2. 安装依赖
pip install -e .

# 3. 启动服务
python -m src.main
```

- 默认监听 `0.0.0.0:8000`，开启热重载
- 健康检查：`GET http://localhost:8000/api/health`
- 启动时自动初始化 SQLite 数据库（`backend/data/agent_workflow.db`）并同步定时任务

### 主要 API 路由

| 路径前缀 | 说明 |
|----------|------|
| `/api/workflows` | 工作流 CRUD |
| `/api/executions` | 执行记录查询 |
| `/api/config` | 全局配置管理 |
| `/ws` | WebSocket 实时监控 |

## 二、前端启动

```bash
cd frontend

# 1. 安装依赖
npm install

# 2. 开发模式启动
npm run dev
```

- 默认监听 `http://localhost:5173`
- 已配置代理：`/api` 和 `/ws` 请求自动转发到后端 `localhost:8000`

### 其他前端命令

```bash
npm run build        # 生产构建（含类型检查）
npm run type-check   # 仅 TypeScript 类型检查
npm run preview      # 预览生产构建
```

## 三、完整启动流程（快速参考）

```bash
# 终端 1 - 后端
cd backend
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .
python -m src.main

# 终端 2 - 前端
cd frontend
npm install
npm run dev
```

启动完成后，浏览器访问 `http://localhost:5173` 即可使用。

## 四、全局配置

后端全局配置存储在磁盘目录 `backend/global_config/`，包含：

| 目录 | 说明 |
|------|------|
| `rules/` | 全局规则文件 |
| `mcp/` | MCP 服务器配置 |
| `skills/` | 技能配置 |

也可在前端「全局配置」页面进行管理。

## 五、常见问题

| 问题 | 解决方案 |
|------|---------|
| 后端端口 8000 被占用 | 修改 `backend/src/main.py` 中 `uvicorn.run` 的 `port` 参数 |
| 前端端口 5173 被占用 | 运行 `npm run dev -- --port 3000` 指定其他端口 |
| 数据库不存在 | 后端首次启动会自动创建，无需手动处理 |
| Claude Agent SDK 调用失败 | 确认 Claude Code CLI 已安装且 API Key 配置正确 |
