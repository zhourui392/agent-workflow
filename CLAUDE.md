# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

AI 驱动的多步骤工作流自动化平台（Electron 桌面应用）。用户通过 UI 配置工作流，每个步骤调用 Claude Agent SDK（@anthropic-ai/claude-code）执行。支持 cron 定时调度、手动触发、模板变量，以及多层配置合并（Claude CLI 全局配置 + 应用磁盘配置 + 工作流配置 + 步骤级按需引用）。

## 常用命令

```bash
npm install                          # 安装依赖
npx tsc -p tsconfig.main.json       # 编译主进程 + preload
npm run electron:dev                 # 开发模式（Vite + Electron）
npm run dev                          # 仅启动 Vite 前端开发服务器，端口 :5173
npm run electron:build               # 生产打包
npm test                             # 运行测试
```

**注意**:
- `electron:dev` 依赖 `concurrently`、`wait-on`，首次运行前确保已安装。
- Electron 原生模块（better-sqlite3）需要匹配 Electron 版本编译，可用 `npx electron-rebuild -f -w better-sqlite3` 重建。
- **启动失败排查**: 若 Electron 窗口未弹出且日志报 `Could not locate the bindings file`，说明 better-sqlite3 未针对当前 Electron 版本编译，需先执行 `npx electron-rebuild -f -w better-sqlite3` 再启动。

## 架构（DDD 四层架构）

后端（`src/main/`）采用 DDD 四层架构，按限界上下文划分目录：

```
src/main/
  index.ts                              # 应用入口，窗口管理
  bootstrap.ts                          # 组合根：依赖组装（唯一知道所有具体实现的地方）

  shared/                               # 跨上下文共享
    domain/                             # Entity/ValueObject 基类
    infrastructure/                     # database.ts, safeJson.ts
    interface/                          # Zod schemas, validateInput

  workflow/                             # 工作流限界上下文
    domain/model/                       # Workflow 聚合根, WorkflowStep/Input/Limits/Output 值对象
    domain/repository/                  # WorkflowRepository 接口
    application/                        # WorkflowApplicationService（CRUD + toggle + run）
    infrastructure/                     # SqliteWorkflowRepository
    interface/                          # WorkflowIpcHandler

  execution/                            # 执行限界上下文
    domain/model/                       # Execution 聚合根, StepExecution 实体, StepEvent 值对象
    domain/repository/                  # ExecutionRepository 接口
    domain/service/                     # TemplateEngine, PipelineOrchestrator (含 StepExecutor/ProgressNotifier/OutputProcessor 接口)
    application/                        # ExecutePipelineUseCase, QueryExecutionUseCase
    infrastructure/                     # SqliteExecutionRepository, ClaudeAgentExecutor, ElectronProgressNotifier, OutputHandler
    interface/                          # ExecutionIpcHandler

  configuration/                        # 配置限界上下文
    domain/model/                       # McpServer/Skill 实体, GlobalConfig/MergedConfig/StepMergedConfig 值对象
    domain/repository/                  # McpServerRepository, SkillRepository 接口
    domain/service/                     # ConfigMergeService（四层合并规则）
    application/                        # McpServer/Skill/GlobalConfig ApplicationService
    infrastructure/                     # Sqlite*Repository, CliConfigLoader, DiskGlobalConfigRepository, SkillFileWriter, GlobalConfigCache
    interface/                          # McpServer/Skill/Config IpcHandler

  scheduling/                           # 调度限界上下文
    domain/service/                     # SchedulerService 接口
    application/                        # CronSyncUseCase
    infrastructure/                     # NodeCronScheduler

  types.ts                                # 公共类型重导出（供 renderer/preload 使用）

src/renderer/                           # 前端渲染进程（Vue 3）
src/preload/                            # Electron preload 脚本
global_config/                          # 应用全局配置（rules/, mcp/, skills/）
```

### DDD 分层规则

- **Interface（接口层）**：IPC 处理器，参数校验，DTO 转换
- **Application（应用层）**：用例编排，事务控制，禁止业务逻辑
- **Domain（领域层）**：核心业务规则，不依赖任何外层（通过接口注入基础设施）
- **Infrastructure（基础设施层）**：技术实现（SQLite、Claude SDK、文件系统、Electron IPC 广播）

### 跨上下文交互

```
WorkflowApplicationService → SchedulerService（调度）, PipelinePort（执行）
ExecutePipelineUseCase      → ConfigMergeService（配置合并）
CronSyncUseCase             → WorkflowRepository, PipelinePort
```

## 关键设计决策

- **配置合并策略**: rules=拼接, allowedTools=取交集, MCP=按需加载取并集, skills=同名覆盖
- **执行模型**: 主进程异步执行，IPC 事件实时推送进度到渲染进程
- **模板变量**: `{{today}}`, `{{yesterday}}`, `{{now}}`, `{{inputs.xxx}}`, `{{steps.<name>.output}}`
- **步骤失败策略**: stop（停止）/ skip（跳过）/ retry（重试）
- **全局配置存储在磁盘**: `global_config/` (rules/, mcp/, skills/)
- **数据库**: SQLite (better-sqlite3 同步)，路径 `%APPDATA%/agent-workflow/agent_workflow.db`（macOS: `~/Library/Application Support/agent-workflow/`）
- **嵌套会话保护**: 主进程启动时清除 `CLAUDECODE` 环境变量，防止从 Claude Code 终端启动时子进程被拒绝
- **IPC 数据序列化**: `contextBridge` 在 preload 函数执行前就对参数做 structured clone，因此 `toPlain`（JSON 序列化）必须放在渲染进程侧（`src/renderer/api/index.ts`），不能放在 preload 中。Vue reactive Proxy 无法被 structured clone，必须在跨 contextBridge 之前剥离

## 技术栈

- 运行时: Electron 28, TypeScript 5
- 前端: Vue 3 (Composition API), Vite, Element Plus, Pinia
- 数据库: better-sqlite3
- AI SDK: @anthropic-ai/claude-code
- 调度器: node-cron

## TDD 开发流程

本项目采用 TDD（测试驱动开发）模式。所有业务逻辑变更必须遵循 **红 → 绿 → 重构** 循环。

### 核心原则

1. **先写失败测试**，再写实现代码
2. **领域层零基础设施依赖** — domain/ 下的测试不需要 Electron、SQLite 或文件系统
3. **通过接口注入依赖** — 测试使用 `test/fixtures/` 中的 mock 工厂替换基础设施

### 测试命令

```bash
npm test                                            # 运行全部单元测试 + 应用服务测试
npx vitest run test/domain-models.test.ts           # 仅运行领域模型测试
npx vitest run test/application/                    # 仅运行应用服务测试
npx vitest run test/repositories/                   # Repository 集成测试（需 npm rebuild better-sqlite3）
npx vitest --watch                                  # 监听模式（TDD 推荐）
```

### 测试结构

```
test/
  fixtures/                    # 可复用的测试夹具（mock 工厂 + 数据工厂）
    workflow.fixtures.ts       # createTestWorkflow(), createMockWorkflowRepository()
    execution.fixtures.ts      # createTestExecution(), createMockExecutionRepository()
    configuration.fixtures.ts  # createTestMcpServer(), createMockSkillRepository(), ...
    service.fixtures.ts        # createMockStepExecutor(), createMockConfigMergeService(), ...
    index.ts                   # 统一导出
  helpers/
    testDatabase.ts            # createTestDatabase() — 内存 SQLite（Repository 集成测试用）
  application/                 # 应用服务层测试
  repositories/                # Repository 集成测试（依赖 better-sqlite3 原生模块）
  domain-models.test.ts        # 领域模型行为测试（状态机、不变量）
  pipeline.test.ts             # PipelineOrchestrator 编排测试
  template.test.ts             # TemplateEngine 模板渲染测试
  configMerger.test.ts         # ConfigMergeService 合并规则测试
  executor.test.ts             # ClaudeAgentExecutor 工具函数测试
  ipc-validation.test.ts       # Zod schema 校验测试
  safeJson.test.ts             # JSON 解析工具测试
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
2. **类型检查** — 执行 `npx tsc -p tsconfig.main.json --noEmit`，确保编译无错误
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
