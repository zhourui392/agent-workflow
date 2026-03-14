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
├── test/                            # 测试套件 (Vitest, 154 tests)
├── doc/                             # 设计文档
└── package.json
```

每个限界上下文内部统一按 `domain/` → `application/` → `infrastructure/` → `interface/` 分层。

## 核心功能

- **工作流管理** — 创建/编辑多步骤工作流
- **多步骤流水线** — 顺序执行，上下文传递
- **定时调度** — Cron表达式配置
- **实时进度** — IPC事件推送执行日志，支持细粒度流式事件（工具调用、工具结果、文本回复等）
- **Skills 管理** — 支持自定义 Skills，工作流步骤级按需引用
- **Claude CLI 集成** — 自动读取 Claude Code CLI 全局配置（`~/.claude/skills/`、`~/.claude/plugins/` 中的 Skills）
- **三层配置合并** — Claude CLI 全局配置 → 应用磁盘配置 → 工作流/步骤级配置
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
| `config:get` | 获取全局配置 |
| `config:update` | 更新全局配置 |
| `skills:list` | Skills 列表（仅数据库） |
| `skills:list-all` | Skills 列表（数据库 + Claude CLI） |
| `skills:create` | 创建 Skill |
| `skills:update` | 更新 Skill |
| `skills:delete` | 删除 Skill |
| `skills:set-enabled` | 设置 Skill 启用状态 |
| `execution:progress` | 实时进度事件 |

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

事件在执行过程中通过 IPC 实时推送到前端，同时持久化到数据库供历史查看。

## Skills 配置来源

系统支持从多个来源加载 Skills：

| 来源 | 说明 |
|------|------|
| **数据库** | 通过 UI 创建的自定义配置 |
| **Claude CLI** | 自动读取 `~/.claude/skills/`、`~/.claude/plugins/` 中的 Skills |

在工作流步骤配置中，可以从合并后的列表中按需选择所需的 Skills。

## 配置合并策略

- **rules (systemPrompt)**: 拼接
- **allowedTools**: 取交集
- **skills**: 按需加载（步骤引用的，同名覆盖）
