# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

AI 驱动的多步骤工作流自动化平台（**BS 架构：Fastify + Vue 3**）。用户通过浏览器 UI 配置工作流，每个步骤调用 Claude Agent SDK（@anthropic-ai/claude-code）执行。支持 cron 定时调度、手动触发、模板变量，以及多层配置合并（Claude CLI 全局配置 + 应用磁盘配置 + 工作流/步骤级配置）。

前后端通过 REST API（`/api/*`）+ WebSocket（`/ws/executions`）通信。

## 常用命令

```bash
npm install                                  # 安装依赖
npm run dev                                  # 并发启动后端（3000）+ 前端 Vite（5173）
npm run dev:server                           # 仅后端：tsx watch src/main/server.ts
npm run dev:client                           # 仅前端：vite 开发服务器（5173）
npm run build                                # 全量构建（main + renderer）
npm run build:main                           # 仅编译后端：tsc -p tsconfig.main.json
npm run build:renderer                       # 仅构建前端：vite build
npm start                                    # 生产启动：node dist/main/server.js
npm run type-check                           # 全量类型检查
npm test                                     # 运行测试（vitest run）
npm run test:watch                           # 测试监听模式
```

**端口 / 环境变量**：

- 后端 HTTP：`PORT`（默认 `3000`），`HOST`（默认 `0.0.0.0`）
- 前端 dev server：`5173`，通过 Vite proxy 将 `/api` 和 `/ws` 转发到 `http://localhost:3000`
- 数据库路径：`DB_PATH`（默认 `<cwd>/data/agent_workflow.db`）
- 生产模式下，Fastify 直接托管 `dist/renderer/` 静态资源（SPA fallback 到 `index.html`）

## 架构（DDD 四层架构）

后端（`src/main/`）采用 DDD 四层架构，按限界上下文划分目录：

```
src/main/
  server.ts                             # Web 服务入口：Fastify + CORS + WS + 静态托管
  bootstrap.ts                          # 组合根：依赖组装（唯一知道所有具体实现的地方）

  shared/                               # 跨上下文共享
    domain/                             # Entity/ValueObject 基类
    infrastructure/                     # database.ts, logger.ts, safeJson.ts
    interface/                          # Zod schemas, validateInput

  workflow/                             # 工作流限界上下文
    domain/model/                       # Workflow 聚合根, WorkflowStep/Input/Limits/Output 值对象
    domain/repository/                  # WorkflowRepository 接口
    application/                        # WorkflowApplicationService（CRUD + toggle + run）
    infrastructure/                     # SqliteWorkflowRepository
    interface/                          # WorkflowRoutes（Fastify REST 路由）

  execution/                            # 执行限界上下文
    domain/model/                       # Execution 聚合根, StepExecution 实体, StepEvent 值对象
    domain/repository/                  # ExecutionRepository 接口
    domain/service/                     # TemplateEngine, PipelineOrchestrator（含 StepExecutor/ProgressNotifier/OutputProcessor 接口）
    application/                        # ExecutePipelineUseCase, QueryExecutionUseCase
    infrastructure/                     # SqliteExecutionRepository, ClaudeAgentExecutor, WebSocketProgressNotifier, OutputHandler, WorkflowLoaderAdapter
    interface/                          # ExecutionRoutes

  configuration/                        # 配置限界上下文
    domain/model/                       # Skill 实体, GlobalConfig/MergedConfig/StepMergedConfig 值对象
    domain/repository/                  # SkillRepository 接口
    domain/service/                     # ConfigMergeService（三层合并规则）
    application/                        # Skill/GlobalConfig ApplicationService
    infrastructure/                     # SqliteSkillRepository, CliConfigLoader, DiskGlobalConfigRepository, SkillFileWriter, GlobalConfigCache
    interface/                          # SkillRoutes, ConfigRoutes

  scheduling/                           # 调度限界上下文
    domain/service/                     # SchedulerService 接口
    application/                        # CronSyncUseCase
    infrastructure/                     # NodeCronScheduler

  chat/                                 # 聊天限界上下文（移植自 agent-web）
    domain/ application/ infrastructure/ interface/

  filesystem/                           # 文件系统访问（工作区文件树、上传、路径安全）
    FsConfig.ts, FsRoutes.ts, pathSafety.ts

  types.ts                              # 公共类型重导出（供前端 api 层使用）

src/renderer/                           # 前端（Vue 3 + Vite + Element Plus + Pinia）
global_config/                          # 应用全局配置（rules/, skills/）
data/                                   # 默认 SQLite 数据目录
```

### DDD 分层规则

- **Interface（接口层）**：Fastify 路由（`*Routes.ts`），参数校验（Zod），DTO 转换
- **Application（应用层）**：用例编排，事务控制，禁止业务逻辑
- **Domain（领域层）**：核心业务规则，不依赖任何外层（通过接口注入基础设施）
- **Infrastructure（基础设施层）**：技术实现（SQLite、Claude SDK、文件系统、WebSocket 广播）

### 跨上下文交互

```
WorkflowApplicationService → SchedulerService（调度）, PipelinePort（执行）
ExecutePipelineUseCase      → ConfigMergeService（配置合并）
CronSyncUseCase             → WorkflowRepository, PipelinePort
```

### 前后端通信

- **REST**：前端 `src/renderer/api/` 调用 `/api/*`（axios），路由在各上下文的 `interface/*Routes.ts` 注册
- **WebSocket**：`/ws/executions` 单通道广播执行进度事件；客户端连接池在 `server.ts` 中维护，`WebSocketProgressNotifier` 通过 `broadcast()` 推送

## 关键设计决策

- **配置合并策略**: rules=拼接, allowedTools=取交集, skills=同名覆盖
- **执行模型**: 后端异步执行，通过 WebSocket 实时推送进度到前端
- **实时事件流处理（重要）**: 步骤执行过程中产生的流式事件（text、tool_call、turn_end 等）需要同时满足实时展示和持久化两个需求，修改相关代码时务必遵循以下规则：
  - **后端 — 所有 `onEvent` 回调**必须同时做三件事：①收集到 `collectedEvents` 数组；②通过 `broadcastStepEvent`（WS 广播）发出；③在 `turn_end` 事件时增量保存 `eventsJson` 到数据库（防止页面重进后丢失执行中的事件）。涉及 `runStep`、`runForEachStep`、`runDataSplitStep` 三个路径
  - **后端 — 子执行广播**必须携带 `parentExecutionId`、`parentStepIndex`、`iterationIndex`，否则父页面无法捕获子执行的生命周期事件
  - **前端 — 事件获取优先级**：`getStepEvents` / `getChildStepEvents` 必须优先返回 `liveEvents`（实时最新），仅在无 live 数据时 fallback 到 DB 事件。反过来会导致实时更新被 DB 旧数据覆盖
  - **前端 — 页面加载种子化**：`fetchExecutionData` / `fetchChildExecutions` 加载数据后，必须将正在运行步骤的 DB 事件种子化到 `liveEvents` / `liveChildEvents`，保证页面重进后已有事件不丢失且新事件继续追加
  - **前端 — 子执行 ID 追踪**：通过 `knownChildExecMap`（子执行 ID → parentStepIndex）匹配无 `parentExecutionId` 的流式事件（来自 `runStep` 内部的 `broadcastStepEvent`）
  - **执行历史列表**：`findAll` / `count` 查询需排除子执行（`parent_execution_id IS NULL`），子执行只在父执行详情页内联展示
- **模板变量**: `{{today}}`, `{{yesterday}}`, `{{now}}`, `{{inputs.xxx}}`, `{{steps.<name>.output}}`
- **步骤失败策略**: stop（停止）/ skip（跳过）/ retry（重试）
- **全局配置存储在磁盘**: `global_config/` (rules/, skills/)
- **数据库**: SQLite (better-sqlite3 同步)，默认路径 `<cwd>/data/agent_workflow.db`，可通过 `DB_PATH` 覆盖
- **嵌套会话保护**: `server.ts` 启动时清除 `CLAUDECODE` 环境变量，防止从 Claude Code 终端启动时子进程被拒绝
- **前端请求序列化**: Vue reactive Proxy 无法被 axios 正确序列化的场景（如嵌套对象），在 `src/renderer/api/` 层做 `toPlain`（JSON 深拷贝）剥离

## 技术栈

- 运行时: Node.js 20+, TypeScript 5
- Web 框架: Fastify 4（`@fastify/cors`、`@fastify/static`、`@fastify/websocket`、`@fastify/multipart`）
- 前端: Vue 3 (Composition API), Vite, Element Plus, Pinia, Vue Router
- 数据库: better-sqlite3（同步）
- AI SDK: @anthropic-ai/claude-code
- 调度器: node-cron
- 开发工具: tsx（后端热重载）, concurrently（并发启动）

## TDD 开发流程

本项目采用 TDD（测试驱动开发）模式。所有业务逻辑变更必须遵循 **红 → 绿 → 重构** 循环。

### 核心原则

1. **先写失败测试**，再写实现代码
2. **领域层零基础设施依赖** — domain/ 下的测试不需要 Fastify、SQLite 或文件系统
3. **通过接口注入依赖** — 测试使用 `test/fixtures/` 中的 mock 工厂替换基础设施

### 测试命令

```bash
npm test                                            # 运行全部测试
npx vitest run test/domain-models.test.ts           # 仅运行领域模型测试
npx vitest run test/application/                    # 仅运行应用服务测试
npx vitest run test/repositories/                   # Repository 集成测试
npx vitest --watch                                  # 监听模式（TDD 推荐）
```

### 测试结构

```
test/
  fixtures/                    # 可复用的测试夹具（mock 工厂 + 数据工厂）
    workflow.fixtures.ts       # createTestWorkflow(), createMockWorkflowRepository()
    execution.fixtures.ts      # createTestExecution(), createMockExecutionRepository()
    configuration.fixtures.ts  # createMockSkillRepository(), ...
    service.fixtures.ts        # createMockStepExecutor(), createMockConfigMergeService(), ...
    index.ts                   # 统一导出
  helpers/
    testDatabase.ts            # createTestDatabase() — 内存 SQLite（Repository 集成测试用）
  application/                 # 应用服务层测试
  repositories/                # Repository 集成测试
  chat/                        # 聊天上下文测试
  filesystem/                  # 文件系统访问测试
  domain-models.test.ts        # 领域模型行为测试（状态机、不变量）
  pipeline.test.ts             # PipelineOrchestrator 编排测试
  template.test.ts             # TemplateEngine 模板渲染测试
  configMerger.test.ts         # ConfigMergeService 合并规则测试
  executor.test.ts             # ClaudeAgentExecutor 工具函数测试
  api-adapters.test.ts         # 前端 api 适配器测试
  contract.test.ts             # 前后端契约测试
  ipc-validation.test.ts       # Zod schema 校验测试
  cancellation-registry.test.ts, mcpLoader.test.ts, rule-validator.test.ts
```

### 按层编写测试的指引

| 层 | 测试方式 | 依赖 | 示例 |
|----|---------|------|------|
| **Domain Model** | 直接实例化，测试行为方法 | 无 | `createTestWorkflow().validate()` |
| **Domain Service** | 构造函数注入 mock | fixtures | `new PipelineOrchestrator(mockRepo, mockExecutor, ...)` |
| **Application Service** | 构造函数注入 mock | fixtures | `new WorkflowApplicationService(mockRepo, mockScheduler, mockPipeline)` |
| **Repository** | 内存 SQLite | testDatabase | `new SqliteWorkflowRepository(createTestDatabase())` |
| **Infrastructure** | 根据需要 mock 外部依赖 | vi.mock | Claude SDK、文件系统等 |

### 新增功能的 TDD 步骤

1. **在 `domain/model/` 或 `domain/service/` 中定义接口/类型**
2. **写测试** — 用 fixtures 创建 mock，验证预期行为
3. **运行测试确认失败**（红）
4. **实现最小代码使测试通过**（绿）
5. **重构** — 消除重复，保持测试绿色
6. **如需基础设施** — 在 `infrastructure/` 中实现接口，在 `bootstrap.ts` 中注入

### 领域模型不变量

测试应覆盖以下聚合根行为：

**Workflow**：
- `validate()` — 名称非空、至少一个步骤、步骤名唯一、提示词非空、limits 正数
- `isSchedulable` — enabled && schedule 非空
- `toggle()` / `enable()` / `disable()` — 状态切换

**Execution**：
- 状态机 — `pending → running → success|failed`，非法转换抛出错误
- `addTokens()` — 累加，负数抛错
- `advanceStep()` — 推进，负数抛错
- `exceedsTokenLimit()` — 限制检查

## 代码变更规范

### Git 提交前检查

**重要**: 每次执行 `git commit` 前，必须按顺序完成以下检查：

1. **运行测试** — 执行 `npm test`，确保全部通过。业务逻辑变更必须附带对应测试（TDD 红→绿→重构）
2. **类型检查** — 执行 `npm run type-check`（或 `npx tsc -p tsconfig.main.json --noEmit` 针对后端），确保编译无错误
3. **检查 README.md** — 判断是否需要同步更新（见下方规则）

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
