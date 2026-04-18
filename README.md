# Agent Workflow

AI驱动的多步骤工作流自动化平台 (Electron桌面应用)。通过 UI 配置工作流，每个步骤调用 Claude Agent SDK 执行，支持定时调度和手动触发。

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Electron 28 |
| 语言 | TypeScript 5.9 |
| 前端 | Vue 3 + Vite + Element Plus |
| 数据库 | better-sqlite3 |
| AI SDK | @anthropic-ai/claude-code |
| 调度器 | node-cron |

## 目录结构

后端采用 **DDD 四层架构**（Interface → Application → Domain → Infrastructure），按限界上下文划分：

```
agent-workflow/
├── src/
│   ├── main/                        # Electron 主进程
│   │   ├── index.ts                 # 应用入口，窗口管理
│   │   ├── bootstrap.ts             # 组合根：依赖组装
│   │   ├── types.ts                 # 公共类型重导出
│   │   ├── shared/                  # 跨上下文共享（Entity 基类, database, schemas）
│   │   ├── workflow/                # 工作流上下文（Workflow 聚合根, CRUD, IPC）
│   │   ├── execution/              # 执行上下文（Pipeline, Executor, TemplateEngine）
│   │   ├── configuration/          # 配置上下文（Skill/GlobalConfig, 三层合并）
│   │   └── scheduling/             # 调度上下文（node-cron 定时任务）
│   ├── renderer/                    # 前端渲染进程 (Vue 3)
│   └── preload/                     # IPC 桥接
├── global_config/                   # 全局配置 (rules, skills)
├── test/                            # 测试套件 (Vitest, 228 tests)
├── doc/                             # 设计文档
└── package.json
```

每个限界上下文内部统一按 `domain/` → `application/` → `infrastructure/` → `interface/` 分层。

## 核心功能

- **工作流管理** — 创建/编辑多步骤工作流
- **多步骤流水线** — 顺序执行，上下文传递
- **定时调度** — Cron表达式配置
- **实时进度** — IPC事件推送执行日志，支持细粒度流式事件（工具调用、工具结果、文本回复等），执行中增量持久化到数据库
- **Skills 管理** — 支持自定义 Skills，工作流步骤级按需引用
- **Claude CLI 集成** — 自动读取 Claude Code CLI 全局配置（`~/.claude/skills/`、`~/.claude/plugins/` 中的 Skills）
- **三层配置合并** — Claude CLI 全局配置 → 应用磁盘配置 → 工作流/步骤级配置
- **子工作流 & ForEach 循环** — 步骤可引用其他工作流作为子工作流执行，支持 ForEach 遍历数组串行执行，子执行记录在父执行详情页内联分层展示
- **数据拆分步骤** — 支持 static/template/AI 三种模式将数据拆分为数组，供后续 ForEach 步骤使用
- **模板变量** — `{{today}}`, `{{inputs.xxx}}`, `{{steps.name.output}}`
- **输出验证** — 每个步骤可配置验证提示词，执行完成后由 LLM 自动判定输出是否符合预期（PASS/FAIL）

## 快速开始

```bash
# 安装依赖
npm install

# 重建 Electron 原生模块（better-sqlite3）
npx electron-rebuild -f -w better-sqlite3

# 编译主进程 + preload
npx tsc -p tsconfig.main.json

# 开发模式（Vite + Electron 同时启动）
npm run electron:dev

# 仅启动前端开发服务器
npm run dev

# 运行测试
npm test

# 生产打包
npm run electron:build
```

> **注意**: 从 Claude Code 终端启动时，应用会自动清除 `CLAUDECODE` 环境变量以避免嵌套会话检测。数据库文件存储在系统应用数据目录（Windows: `%APPDATA%/agent-workflow/`，macOS: `~/Library/Application Support/agent-workflow/`）。

## IPC API

| IPC Channel | 说明 |
|-------------|------|
| `workflows:list` | 获取工作流列表 |
| `workflows:create` | 创建工作流 |
| `workflows:get` | 获取工作流详情 |
| `workflows:update` | 更新工作流 |
| `workflows:delete` | 删除工作流 |
| `workflows:toggle` | 切换启用状态 |
| `workflows:run` | 手动触发执行 |
| `executions:list` | 执行历史 |
| `executions:get` | 执行详情 |
| `executions:children` | 子执行记录（含步骤详情） |
| `executions:cancel` | 取消执行 |
| `config:get` | 获取全局配置 |
| `config:update` | 更新全局配置 |
| `skills:list` | Skills 列表（仅数据库） |
| `skills:list-all` | Skills 列表（数据库 + Claude CLI） |
| `skills:generate` | 触发 AI 生成 Skill（`POST /api/skills/generate`） |
| `skills:generate:get` | 查询生成草稿状态（`GET /api/skills/generate/:id`） |
| `skills:generate:verify` | 对已生成草稿发起测试会话（`POST /api/skills/generate/:id/verify`） |
| `skills:generate:save` | 保存草稿为正式 Skill（`POST /api/skills/generate/:id/save`） |
| `skills:generate:cancel` | 放弃草稿并清理临时目录（`POST /api/skills/generate/:id/cancel`） |
| `skills:delete` | 删除 Skill |
| `skills:set-enabled` | 设置 Skill 启用状态 |
| `execution:progress` | 实时进度事件（WebSocket `/ws/executions`，详见下方"实时事件通道"） |

## 运行时输入参数

工作流支持定义输入参数，运行时由用户填写，步骤 Prompt 中通过 `{{inputs.xxx}}` 引用。

### 定义输入参数

在工作流编辑页，"输入参数"卡片中添加参数，每个参数包含：

| 字段 | 说明 |
|------|------|
| 参数名 | 在模板中引用的名称，如 `name` 对应 `{{inputs.name}}` |
| 类型 | `string` / `number` / `boolean` |
| 必填 | 运行时是否强制填写 |
| 默认值 | 未填写时的默认值 |
| 描述 | 参数用途说明，运行弹窗中显示为 placeholder |

### 运行时填写

- **有输入参数的工作流**：点击"运行"后弹出参数填写弹窗，填写后确认触发执行
- **无输入参数的工作流**：点击"运行"直接触发执行（行为不变）

### 示例

定义两个输入参数：

| 参数名 | 类型 | 必填 | 默认值 |
|--------|------|------|--------|
| `repo_url` | string | 是 | — |
| `max_files` | number | 否 | 10 |

步骤 Prompt 中引用：

```
请分析仓库 {{inputs.repo_url}} 中的代码，最多分析 {{inputs.max_files}} 个文件。
```

## 步骤输出验证

每个步骤支持可选的输出验证。启用后，步骤执行完成后系统会将输出和验证提示词一起发给 LLM，由 LLM 判定输出是否符合预期。

**验证提示词写法**：描述期望输出满足的标准即可，例如：

- `输出必须是合法的 JSON 格式，且包含 summary 和 details 字段`
- `翻译结果必须是中文，不能包含未翻译的英文句子，专有名词除外`
- `摘要不超过200字，且覆盖原文的主要观点`

验证失败时，该步骤标记为失败，根据工作流失败策略（stop/skip/retry）决定后续处理。

## 步骤流式事件

每个步骤执行过程中会产生结构化的流式事件，支持实时监控和历史回放：

| 事件类型 | 说明 |
|----------|------|
| `init` | 初始化，包含模型、工具列表 |
| `text` | AI文本回复 |
| `tool_call` | 工具调用（含工具名、输入参数） |
| `tool_result` | 工具执行结果 |
| `turn_end` | 一轮对话结束 |
| `result` | 最终结果（含token用量、耗时、费用） |
| `error` | 执行错误 |

事件在执行过程中通过 IPC 实时推送到前端，每个 turn 结束时增量持久化到数据库，确保页面重进后执行过程不丢失。子执行（子工作流/ForEach 迭代）的事件同样支持实时推送和持久化，在父执行详情页内联展示。

## Skills 配置来源

系统支持从多个来源加载 Skills：

| 来源 | 说明 |
|------|------|
| **磁盘** | `global_config/skills/{name}/` 目录；每个子目录至少包含一份 `SKILL.md`，可选 `scripts/ references/ assets/` |
| **Claude CLI** | 自动读取 `~/.claude/skills/`、`~/.claude/plugins/` 中的 Skills |

数据库只保留 `id/name/dir_path/enabled/时间戳` 元数据；`description/allowed-tools` 在加载时从 SKILL.md frontmatter 懒解析。在工作流步骤配置中，可以从合并后的列表中按需选择所需的 Skills。

### 通过 AI 生成 Skill

Skills 管理页点击「新建」将打开三步向导：

1. **描述需求** — 用自然语言说明 Skill 应做什么。
2. **AI 生成** — 后端调用 `skill-creator` skill 生成 `SKILL.md` 与可选资源到临时目录；生成过程通过 WebSocket 实时回流到 UI。
3. **测试验证** — 用建议 prompt 触发一次实际调用，观察输出；通过后保存到 `global_config/skills/{name}/` 并写入 DB。

所有临时目录（`{SKILL_GENERATION_TMP_DIR}/skill-gen-*` / `skill-verify-*`）在保存、取消或进程启动时被自动清理。

要求：Claude CLI 已安装 `skill-creator`（默认从 `SKILL_CREATOR_DIR` → `~/.claude/skills/skill-creator` → `~/.claude/plugins/.../skills/skill-creator` 依次探测）。

## 配置合并策略

- **rules (systemPrompt)**: 拼接
- **allowedTools**: 取交集
- **skills**: 按需加载（步骤引用的，同名覆盖；value 为 skill 源目录绝对路径）

## 实时事件通道

所有实时事件共用 WebSocket 端点 `/ws/executions`。客户端按消息的 `kind` 字段区分通道：

| kind | 说明 |
|------|------|
| （缺省 / `execution`） | 工作流执行进度事件（step 流式、状态切换、tokens 用量） |
| `skill-generation` | Skill 生成/验证会话事件；按 `phase`（`generating`/`verifying`）和 `type`（`start`/`step`/`generation_done`/`verification_done`/`error`）细分 |

前端通过 `subscribeExecutionProgress` / `subscribeSkillGeneration` 两个 API 分别订阅；同一底层连接，不会互相干扰。

## 环境变量

| 名称 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端 HTTP 端口 | `3000` |
| `HOST` | 后端监听地址 | `0.0.0.0` |
| `DB_PATH` | SQLite 数据库路径 | `<cwd>/data/agent_workflow.db` |
| `GLOBAL_CONFIG_PATH` | 应用磁盘全局配置根目录 | `<cwd>/global_config` |
| `SKILL_GENERATION_TMP_DIR` | Skill 生成/验证临时目录根 | `{os.tmpdir}/agent-workflow-skill-gen` |
| `SKILL_CREATOR_DIR` | 指定 `skill-creator` skill 路径，覆盖默认探测 | （未设置则按 `~/.claude/skills/` / `~/.claude/plugins/` 顺序查找） |
