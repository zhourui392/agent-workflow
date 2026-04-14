# Migration Plan: agent-workflow Electron → Web + agent-web Feature Integration

## Context

agent-workflow 是一个 Electron 桌面应用（TypeScript + Vue 3），核心能力是多步骤工作流自动化（Claude Agent SDK）。agent-web 是一个 Spring Boot Web 服务，提供自由聊天、文件浏览等功能。因 Anthropic 没有 Java Agent SDK，决定反向整合：将 agent-workflow 从 Electron 转为 Web 服务，并把 agent-web 的功能移植进来。

### 为什么不把 agent-workflow 融入 agent-web（Java 侧）？

agent-workflow 的核心价值依赖 Claude Agent SDK（TypeScript）的能力：

- 步骤级工具控制（allowedTools 交集策略）
- 实时结构化事件流（tool_call、tool_result、turn_end 等）
- Token 用量追踪和成本计算
- 技能/规则注入（systemPrompt、skills 合并）

这些通过 CLI 只能拿到部分，工具控制和技能注入完全做不到。因此选择 TypeScript 侧作为主体。

---

## 目标架构

```
agent-workflow/
  src/main/
    server.ts                          # 新入口：Fastify HTTP + WebSocket 服务器
    bootstrap.ts                       # 修改：注入 WebSocketProgressNotifier，返回路由注册函数
    shared/infrastructure/
      logger.ts                        # 新建：替代 electron-log
      database.ts                      # 修改：env-var 路径替代 app.getPath()
    workflow/interface/
      WorkflowRoutes.ts                # 新建：REST 路由（替代 WorkflowIpcHandler）
    execution/interface/
      ExecutionRoutes.ts               # 新建（替代 ExecutionIpcHandler）
    execution/infrastructure/
      WebSocketProgressNotifier.ts     # 新建（替代 ElectronProgressNotifier）
    configuration/interface/
      SkillRoutes.ts                   # 新建（替代 SkillIpcHandler）
      ConfigRoutes.ts                  # 新建（替代 ConfigIpcHandler）
    configuration/infrastructure/
      DiskGlobalConfigRepository.ts    # 修改：env-var 路径替代 app.isPackaged
    chat/                              # 新增限界上下文（移植自 agent-web）
      domain/model/                    # ChatSession, ChatMessage, AgentType
      domain/service/AgentGateway.ts   # 端口接口
      domain/repository/SessionRepository.ts
      application/ChatApplicationService.ts
      infrastructure/CliAgentGateway.ts  # child_process.spawn 执行 CLI
      infrastructure/InMemorySessionRepository.ts
      infrastructure/ChatConfig.ts
      interface/ChatRoutes.ts          # REST + SSE
    filesystem/                        # 新增模块（移植自 agent-web）
      FsConfig.ts                      # 允许的根目录配置
      FsRoutes.ts                      # 文件浏览 REST 路由
  src/renderer/
    api/
      index.ts                         # 重写：window.api → HTTP fetch
      websocket.ts                     # 新建：WebSocket 客户端
      chat.ts                          # 新建：聊天 API
      filesystem.ts                    # 新建：文件系统 API
    views/
      Chat.vue                         # 新建：聊天页面
      FileBrowser.vue                  # 新建：文件浏览器页面
    stores/
      chat.ts                          # 新建：聊天 Pinia store
    router/index.ts                    # 修改：新增路由
    App.vue                            # 修改：新增导航菜单项
```

### 不变的部分（DDD 分层的优势）

- 所有 `domain/`、`application/` 层代码
- SQLite repositories（better-sqlite3 在纯 Node.js 下同样工作）
- Zod 校验 schemas
- 前端 Vue 组件 / stores / views（除 api 层外）
- 228 个测试（domain/application 层无需修改）

---

## Phase 1: 剥离 Electron，转为 Web 服务器

### Step 1.1: 创建 logger 适配器

**新建** `src/main/shared/infrastructure/logger.ts`

导出与 electron-log 相同的接口（`info`, `warn`, `error`, `debug`），内部用 `console` 实现（或可选 pino）。

**修改** 13 个文件，将 `import log from 'electron-log'` 改为 `import { log } from '../shared/infrastructure/logger'`（路径按实际调整）：

| 文件 | 上下文 |
|---|---|
| `bootstrap.ts` | 组合根 |
| `shared/infrastructure/database.ts` | 数据库 |
| `shared/infrastructure/safeJson.ts` | JSON 工具 |
| `configuration/infrastructure/CliConfigLoader.ts` | 配置 |
| `configuration/infrastructure/DiskGlobalConfigRepository.ts` | 配置 |
| `configuration/infrastructure/GlobalConfigCache.ts` | 配置 |
| `configuration/infrastructure/SkillFileWriter.ts` | 配置 |
| `configuration/domain/service/ConfigMergeService.ts` | 配置 |
| `execution/infrastructure/ClaudeAgentExecutor.ts` | 执行 |
| `execution/infrastructure/OutputHandler.ts` | 执行 |
| `scheduling/application/CronSyncUseCase.ts` | 调度 |
| `scheduling/infrastructure/NodeCronScheduler.ts` | 调度 |
| `workflow/application/WorkflowApplicationService.ts` | 工作流 |

### Step 1.2: 去除 database.ts 的 Electron 依赖

**修改** `src/main/shared/infrastructure/database.ts`

```typescript
// 之前
import { app } from 'electron';
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'agent_workflow.db');
}

// 之后
function getDatabasePath(): string {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'agent_workflow.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dbPath;
}
```

### Step 1.3: 去除 DiskGlobalConfigRepository 的 Electron 依赖

**修改** `src/main/configuration/infrastructure/DiskGlobalConfigRepository.ts`

```typescript
// 之前
import { app } from 'electron';
function getGlobalConfigPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'global_config');
  return path.join(__dirname, '..', '..', '..', '..', 'global_config');
}

// 之后
function getGlobalConfigPath(): string {
  return process.env.GLOBAL_CONFIG_PATH || path.join(process.cwd(), 'global_config');
}
```

### Step 1.4: 创建 WebSocketProgressNotifier

**新建** `src/main/execution/infrastructure/WebSocketProgressNotifier.ts`

实现 `ProgressNotifier` 接口（与 `ElectronProgressNotifier` 完全相同的方法签名），构造函数接收广播回调：

```typescript
import type { ProgressNotifier } from '../domain/service/PipelineOrchestrator';
import type { ExecutionProgressEvent } from '../domain/model/ExecutionResult';
import type { StepEvent } from '../domain/model/StepEvent';

export class WebSocketProgressNotifier implements ProgressNotifier {
  constructor(private broadcastFn: (event: ExecutionProgressEvent) => void) {}

  broadcast(event: ExecutionProgressEvent): void {
    this.broadcastFn(event);
  }

  broadcastStepStart(executionId: string, stepIndex: number): void {
    this.broadcast({ executionId, stepIndex, status: 'running' });
  }

  broadcastStepEvent(executionId: string, stepIndex: number, event: StepEvent): void {
    this.broadcast({ executionId, stepIndex, status: 'running', event });
  }

  broadcastStepResult(
    executionId: string, stepIndex: number, success: boolean,
    outputText?: string, tokensUsed?: number, errorMessage?: string
  ): void {
    this.broadcast({
      executionId, stepIndex,
      status: success ? 'success' : 'failed',
      outputText, tokensUsed, errorMessage
    });
  }
}
```

### Step 1.5: 创建 REST 路由（替代 4 个 IPC Handler）

每个 Routes 文件提取对应 IpcHandler 的逻辑，只改传输方式（IPC → HTTP）。

**新建** `src/main/workflow/interface/WorkflowRoutes.ts`

| IPC Channel | HTTP Method | Path |
|---|---|---|
| `workflows:list` | GET | `/api/workflows` |
| `workflows:get` | GET | `/api/workflows/:id` |
| `workflows:create` | POST | `/api/workflows` |
| `workflows:update` | PUT | `/api/workflows/:id` |
| `workflows:delete` | DELETE | `/api/workflows/:id` |
| `workflows:toggle` | POST | `/api/workflows/:id/toggle` |
| `workflows:clone` | POST | `/api/workflows/:id/clone` |
| `workflows:run` | POST | `/api/workflows/:id/run` |

**新建** `src/main/execution/interface/ExecutionRoutes.ts`

| IPC Channel | HTTP Method | Path |
|---|---|---|
| `executions:list` | GET | `/api/executions` (query: workflowId, status, limit, offset) |
| `executions:get` | GET | `/api/executions/:id` |
| `executions:children` | GET | `/api/executions/:id/children` |
| `executions:cancel` | POST | `/api/executions/:id/cancel` |
| `executions:retry` | POST | `/api/executions/:id/retry` |

**新建** `src/main/configuration/interface/SkillRoutes.ts`

| IPC Channel | HTTP Method | Path |
|---|---|---|
| `skills:list` | GET | `/api/skills` |
| `skills:list-all` | GET | `/api/skills/all` |
| `skills:get` | GET | `/api/skills/:id` |
| `skills:create` | POST | `/api/skills` |
| `skills:update` | PUT | `/api/skills/:id` |
| `skills:delete` | DELETE | `/api/skills/:id` |
| `skills:set-enabled` | PATCH | `/api/skills/:id/enabled` |

**新建** `src/main/configuration/interface/ConfigRoutes.ts`

| IPC Channel | HTTP Method | Path |
|---|---|---|
| `config:get` | GET | `/api/config` |
| `config:update` | PUT | `/api/config` |

### Step 1.6: 创建 Web 服务器入口

**新建** `src/main/server.ts`

职责：
1. `delete process.env.CLAUDECODE`（保留嵌套会话保护）
2. 创建 Fastify 实例
3. 注册插件：`@fastify/cors`, `@fastify/static`, `@fastify/websocket`, `@fastify/multipart`
4. 创建 WebSocket 广播函数（维护 `Set<WebSocket>`，连接时加入，断开时移除）
5. 注册 WebSocket 路由：`GET /ws/executions`
6. 创建 `WebSocketProgressNotifier(broadcastFn)`
7. 调用 `bootstrap(progressNotifier)` → 返回 `AppContext`
8. 调用 `appContext.registerRoutes(fastify)`
9. 静态文件：`dist/renderer/`（生产）或 proxy 到 `localhost:5173`（开发）
10. `appContext.syncCron()`
11. `fastify.listen({ port: PORT, host: '0.0.0.0' })`
12. 优雅退出：`SIGINT`/`SIGTERM` → `appContext.cleanup()`

### Step 1.7: 修改 bootstrap.ts

- 删除 `import log from 'electron-log'`，改用新 logger
- 删除 `ElectronProgressNotifier` 导入和实例化
- 函数签名改为 `bootstrap(progressNotifier: ProgressNotifier): AppContext`
- `AppContext` 接口：`registerIpc` → `registerRoutes(fastify: FastifyInstance)`
- 创建 4 个 Routes 实例替代 4 个 IpcHandler

```typescript
export interface AppContext {
  registerRoutes: (fastify: FastifyInstance) => void;
  syncCron: () => void;
  stopCron: () => void;
  cleanup: () => void;
}

export function bootstrap(progressNotifier: ProgressNotifier): AppContext {
  // ... 与原有相同的依赖组装，但使用传入的 progressNotifier ...

  const workflowRoutes = new WorkflowRoutes(workflowAppService);
  const executionRoutes = new ExecutionRoutes(queryExecutionUseCase, cancelExecutionUseCase, retryExecutionUseCase);
  const skillRoutes = new SkillRoutes(skillAppService);
  const configRoutes = new ConfigRoutes(globalConfigAppService);

  return {
    registerRoutes: (fastify) => {
      workflowRoutes.register(fastify);
      executionRoutes.register(fastify);
      skillRoutes.register(fastify);
      configRoutes.register(fastify);
    },
    // syncCron, stopCron, cleanup 不变
  };
}
```

### Step 1.8: 更新 package.json

**删除依赖**：`electron`, `electron-builder`, `electron-log`, `wait-on`

**新增依赖**：
```json
{
  "fastify": "^4.28.0",
  "@fastify/cors": "^9.0.0",
  "@fastify/static": "^7.0.0",
  "@fastify/websocket": "^10.0.0",
  "@fastify/multipart": "^8.0.0",
  "ws": "^8.16.0"
}
```

**新增开发依赖**：
```json
{
  "tsx": "^4.7.0",
  "@types/ws": "^8.5.10"
}
```

**更新 scripts**：
```json
{
  "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
  "dev:server": "tsx watch src/main/server.ts",
  "dev:client": "vite",
  "build": "tsc -p tsconfig.main.json && vite build",
  "start": "node dist/main/server.js",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**删除**：`"build"` 字段（electron-builder 配置）和 `"main"` 字段。

### Step 1.9: 更新构建配置

**修改** `tsconfig.main.json`：
- `include`：移除 `src/preload/**/*.ts`
- 考虑 `module` 调整为 `Node16`（因 `@anthropic-ai/claude-code` 是 ESM）

**修改** `vite.config.ts`：
```typescript
server: {
  port: 5173,
  proxy: {
    '/api': 'http://localhost:3000',
    '/ws': { target: 'ws://localhost:3000', ws: true }
  }
}
```

**删除** `electron-builder.json`

### Step 1.10: 更新测试配置

**修改** `vitest.config.ts`：
- 移除 `electron` mock alias
- 移除 `electron-log` alias（所有文件已改用新 logger）

**删除** `test/__mocks__/electron.ts`、`test/__mocks__/electron-log.ts`

---

## Phase 2: 前端 API 层适配

### Step 2.1: 重写 `src/renderer/api/index.ts`

将 `window.api.xxx()` IPC 调用替换为 `axios` HTTP 调用：

```typescript
import axios from 'axios';

// 之前
export function getWorkflows() {
  return wrapResponse(window.api.getWorkflows());
}

// 之后
export function getWorkflows() {
  return axios.get<WorkflowDTO[]>('/api/workflows');
}
```

- 删除 `toPlain()`（HTTP JSON 序列化天然处理）
- axios 返回格式已经是 `{ data, status }`，与原有 `AxiosLikeResponse` 兼容
- 前端其他模块无需修改

### Step 2.2: 新建 `src/renderer/api/websocket.ts`

WebSocket 客户端，替代 `window.api.onExecutionProgress()`：

```typescript
let ws: WebSocket | null = null;
const listeners = new Set<(event: ExecutionProgressEvent) => void>();

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws/executions`);
  ws.onmessage = (e) => {
    const event = JSON.parse(e.data);
    listeners.forEach(cb => cb(event));
  };
  ws.onclose = () => setTimeout(connect, 3000); // 自动重连
}

export function subscribeExecutionProgress(
  callback: (event: ExecutionProgressEvent) => void
): () => void {
  if (!ws) connect();
  listeners.add(callback);
  return () => listeners.delete(callback);
}
```

### Step 2.3: 删除 Electron 相关文件

| 删除文件 | 替代 |
|---|---|
| `src/preload/index.ts` | 不再需要 |
| `src/main/index.ts` | 被 `server.ts` 替代 |
| `src/main/execution/infrastructure/ElectronProgressNotifier.ts` | 被 `WebSocketProgressNotifier` 替代 |
| `src/main/workflow/interface/WorkflowIpcHandler.ts` | 被 `WorkflowRoutes` 替代 |
| `src/main/execution/interface/ExecutionIpcHandler.ts` | 被 `ExecutionRoutes` 替代 |
| `src/main/configuration/interface/SkillIpcHandler.ts` | 被 `SkillRoutes` 替代 |
| `src/main/configuration/interface/ConfigIpcHandler.ts` | 被 `ConfigRoutes` 替代 |

---

## Phase 3: 新增 Chat 限界上下文（移植 agent-web）

### Step 3.1: Domain 层

**新建** `src/main/chat/domain/model/ChatSession.ts`
- 属性：`id: string`, `agentType: AgentType`, `workingDir: string`, `createdAt: Date`, `messages: ChatMessage[]`
- 方法：`addMessage(role: MessageRole, content: string): void`

**新建** `src/main/chat/domain/model/ChatMessage.ts`
- 值对象：`role: 'user' | 'agent' | 'system'`, `content: string`, `timestamp: Date`

**新建** `src/main/chat/domain/model/AgentType.ts`
- 枚举：`CLAUDE`, `CODEX`

**新建** `src/main/chat/domain/service/AgentGateway.ts`（端口接口）

```typescript
export interface AgentGateway {
  runStream(
    type: AgentType,
    workingDir: string,
    message: string,
    sessionId: string,
    resumeId?: string,
    env?: string,
    onChunk?: (chunk: string) => void,
    onExit?: (code: number) => void
  ): Promise<void>;

  stopStream(sessionId: string): void;
}
```

**新建** `src/main/chat/domain/repository/SessionRepository.ts`

```typescript
export interface SessionRepository {
  save(session: ChatSession): void;
  find(id: string): ChatSession | null;
}
```

### Step 3.2: Infrastructure 层

**新建** `src/main/chat/infrastructure/CliAgentGateway.ts`

移植自 agent-web 的 `AgentCliGateway.java`，改用 Node.js `child_process.spawn`：

- 根据 `AgentType` 选择 CLI 命令和参数
- Claude：`--resume <resumeId>` 支持
- stdin 消息写入 + 环境约束注入（`[环境约束: 当前为生产环境]`）
- 超时看门狗（`setTimeout` + `process.kill()`）
- `Map<string, ChildProcess>` 进程追踪
- 逐行读取 stdout，调用 `onChunk` 回调

**新建** `src/main/chat/infrastructure/InMemorySessionRepository.ts`
- `Map<string, ChatSession>` 实现

**新建** `src/main/chat/infrastructure/ChatConfig.ts`
- 环境变量读取：`CLAUDE_CLI_CMD`（默认 `claude`）、`CODEX_CLI_CMD`（默认 `codex`）、`CHAT_TIMEOUT_SECONDS`（默认 0 = 无超时）
- Claude 默认参数：`['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']`
- Codex 默认参数：`['exec', '--skip-git-repo-check', '--full-auto']`

### Step 3.3: Application 层

**新建** `src/main/chat/application/ChatApplicationService.ts`

```typescript
export class ChatApplicationService {
  constructor(
    private sessionRepo: SessionRepository,
    private agentGateway: AgentGateway
  ) {}

  startSession(agentType: AgentType, workingDir: string): ChatSession { ... }

  async streamMessage(
    sessionId: string,
    message: string,
    resumeId?: string,
    env?: string,
    onChunk?: (chunk: string) => void,
    onExit?: (code: number) => void
  ): Promise<void> { ... }

  stopSession(sessionId: string): void { ... }
}
```

### Step 3.4: Interface 层

**新建** `src/main/chat/interface/ChatRoutes.ts`

| HTTP Method | Path | 描述 |
|---|---|---|
| POST | `/api/chat/sessions` | 创建会话；body: `{ agentType, workingDir }` |
| GET | `/api/chat/sessions/:id/stream` | SSE 流式消息；query: `message`, `resumeId?`, `env?` |
| POST | `/api/chat/sessions/:id/stop` | 停止执行 |

**SSE 协议**（与 agent-web 一致）：

```
event: chunk
data: <JSON line from CLI process>

event: exit
data: <exit code>

event: error
data: <error message>
```

实现方式：Fastify 的 `reply.raw` 写入 SSE 事件流。

### Step 3.5: 注入到 bootstrap.ts

在 `bootstrap()` 中创建 Chat 上下文实例：

```typescript
const chatConfig = new ChatConfig();
const sessionRepo = new InMemorySessionRepository();
const agentGateway = new CliAgentGateway(chatConfig);
const chatAppService = new ChatApplicationService(sessionRepo, agentGateway);
const chatRoutes = new ChatRoutes(chatAppService);
```

在 `registerRoutes` 中注册：`chatRoutes.register(fastify)`。

---

## Phase 4: 新增 FileSystem 模块（移植 agent-web）

### Step 4.1: 配置

**新建** `src/main/filesystem/FsConfig.ts`

```typescript
export class FsConfig {
  readonly roots: string[];

  constructor() {
    const envRoots = process.env.FS_ROOTS;
    this.roots = envRoots
      ? envRoots.split(',').map(r => r.trim())
      : [process.cwd()];
  }
}
```

### Step 4.2: 路由

**新建** `src/main/filesystem/FsRoutes.ts`

| HTTP Method | Path | 描述 |
|---|---|---|
| GET | `/api/fs/roots` | 列出允许的根目录 |
| GET | `/api/fs/list` | 列出目录内容；query: `path` |
| POST | `/api/fs/upload` | 上传文件；multipart: `path` + `file` |
| GET | `/api/fs/download` | 下载文件；query: `path` |
| DELETE | `/api/fs/delete` | 删除文件；query: `path` |

**安全措施**（移植自 agent-web 的 `FsController.java`）：
- `path.normalize()` + `path.resolve()` 归一化路径
- 校验归一化后的路径以允许的根目录之一开头
- 不允许删除目录，仅删除文件

**响应格式**（与 agent-web 一致）：

```json
[
  { "name": "src", "path": "/home/user/project/src", "dir": true, "size": 4096, "lastModified": 1234567890 },
  { "name": "file.txt", "path": "/home/user/project/file.txt", "dir": false, "size": 1024, "lastModified": 1234567890 }
]
```

---

## Phase 5: 前端新增页面

### Step 5.1: Chat 页面

**新建** `src/renderer/views/Chat.vue`
- 左侧面板：Agent 类型选择、工作目录输入/选择、环境切换（prod/test）
- 主区域：消息列表（user/agent/system 消息区分展示）
- 底部：消息输入框（Enter 发送，Ctrl+Enter 换行）
- 功能：SSE 流式接收 + Markdown 渲染 + 工具调用折叠展示 + Resume ID 自动提取与回传

**新建** `src/renderer/api/chat.ts` — HTTP + EventSource 封装
**新建** `src/renderer/stores/chat.ts` — Pinia store（会话列表、消息、流式状态）

### Step 5.2: FileBrowser 页面

**新建** `src/renderer/views/FileBrowser.vue`
- 根目录下拉选择
- 目录树导航 + 面包屑路径
- 文件列表（名称、大小、修改时间）
- 操作：上传文件、下载文件、删除文件

**新建** `src/renderer/api/filesystem.ts` — HTTP 封装

### Step 5.3: 路由和导航

**修改** `src/renderer/router/index.ts`：
```typescript
{ path: '/chat', name: 'Chat', component: () => import('@/views/Chat.vue') },
{ path: '/files', name: 'FileBrowser', component: () => import('@/views/FileBrowser.vue') },
```

**修改** `src/renderer/App.vue`：侧边栏新增「对话」和「文件」菜单项。

---

## 删除清单

| 文件 | 原因 |
|---|---|
| `src/main/index.ts` | Electron 入口，被 `server.ts` 替代 |
| `src/preload/index.ts` | Electron preload，不再需要 |
| `src/main/execution/infrastructure/ElectronProgressNotifier.ts` | 被 `WebSocketProgressNotifier` 替代 |
| `src/main/workflow/interface/WorkflowIpcHandler.ts` | 被 `WorkflowRoutes` 替代 |
| `src/main/execution/interface/ExecutionIpcHandler.ts` | 被 `ExecutionRoutes` 替代 |
| `src/main/configuration/interface/SkillIpcHandler.ts` | 被 `SkillRoutes` 替代 |
| `src/main/configuration/interface/ConfigIpcHandler.ts` | 被 `ConfigRoutes` 替代 |
| `electron-builder.json` | Electron 打包配置 |
| `test/__mocks__/electron.ts` | Electron mock |
| `test/__mocks__/electron-log.ts` | electron-log mock |

---

## 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| ESM/CJS 模块互操作 | `@anthropic-ai/claude-code` 是 ESM，当前用 CommonJS | 调整 `tsconfig.main.json` 的 `module` 为 `Node16`；`ClaudeAgentExecutor` 已有 dynamic import hack |
| `better-sqlite3` 原生模块 | 去掉 Electron 后不再需要 `electron-rebuild` | 标准 `npm rebuild better-sqlite3` 即可 |
| 前端 API 层重构 | `src/renderer/api/index.ts` 是所有前端通信的咽喉 | axios 返回格式与原 `AxiosLikeResponse` 兼容，子模块无需改动 |
| WebSocket 连接时序 | 页面加载时 WS 可能未建立，错过首批事件 | 前端已有 DB 事件种子化机制（页面加载时从 DB 补充） |

---

## 部署方式

### 开发模式

```bash
npm install
npm run dev
# 后端: tsx watch src/main/server.ts → http://localhost:3000
# 前端: vite → http://localhost:5173 (proxy /api, /ws → :3000)
```

### 生产模式

```bash
npm run build
# 编译后端 → dist/main/
# 编译前端 → dist/renderer/

DB_PATH=./data/agent_workflow.db \
GLOBAL_CONFIG_PATH=./global_config \
FS_ROOTS=/home/user/projects,/tmp \
CLAUDE_CLI_CMD=claude \
PORT=3000 \
node dist/main/server.js
```

服务器同时：
- 提供 REST API（`/api/*`）
- 提供 WebSocket（`/ws/executions`）
- 托管前端静态文件（`dist/renderer/`）

---

## Verification

### Phase 1 验证（Electron → Web）

```bash
# 1. 编译通过
npx tsc -p tsconfig.main.json --noEmit

# 2. 全部测试通过
npm test

# 3. 服务器启动
npm run dev:server
# 确认 http://localhost:3000 可访问

# 4. 前端连接
npm run dev:client
# 确认 http://localhost:5173 能正常加载，API 代理到后端

# 5. 核心功能验证
# - 创建/编辑/删除工作流
# - 执行工作流，WebSocket 实时事件可收
# - Cron 调度正常
# - 技能/配置 CRUD
```

### Phase 3-4 验证（新功能）

```bash
# 6. Chat 功能
# - POST /api/chat/sessions → 返回 sessionId
# - GET /api/chat/sessions/:id/stream?message=hello → 收到 SSE chunk/exit 事件
# - POST /api/chat/sessions/:id/stop → 进程终止

# 7. 文件浏览
# - GET /api/fs/roots → 返回配置的根目录
# - GET /api/fs/list?path=/tmp → 返回目录列表
# - 上传/下载/删除正常
```

### Phase 5 验证（前端 + 全量构建）

```bash
# 8. 全量构建
npm run build && npm start
# 确认生产模式下所有功能正常
# - 工作流管理/执行
# - 聊天功能
# - 文件浏览器
```
