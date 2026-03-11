# Agent Workflow

AI驱动的多步骤工作流自动化平台 (Electron桌面应用)。通过 UI 配置工作流，每个步骤调用 Claude Agent SDK 执行，支持定时调度和手动触发。

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Electron 28 |
| 语言 | TypeScript 5.3 |
| 前端 | Vue 3 + Vite + Element Plus |
| 数据库 | better-sqlite3 |
| AI SDK | @anthropic-ai/claude-code |
| 调度器 | node-cron |

## 目录结构

```
agent-workflow/
├── src/
│   ├── main/                  # Electron主进程
│   │   ├── index.ts           # 入口
│   │   ├── core/              # 流水线引擎、执行器、模板、配置合并
│   │   ├── ipc/               # IPC处理器 (workflows, executions, config)
│   │   ├── services/          # 业务服务层
│   │   ├── store/             # 数据层 (better-sqlite3)
│   │   └── scheduler/         # node-cron定时任务
│   ├── renderer/              # 前端渲染进程 (Vue)
│   └── preload/               # IPC桥接
├── global_config/             # 全局配置 (rules, MCP, skills)
├── test/                      # 测试套件
├── doc/                       # 设计文档
└── package.json
```

## 核心功能

- **工作流管理** — 创建/编辑多步骤工作流
- **多步骤流水线** — 顺序执行，上下文传递
- **定时调度** — Cron表达式配置
- **实时进度** — IPC事件推送执行日志
- **两层配置** — 全局配置 + 工作流配置自动合并
- **模板变量** — `{{today}}`, `{{inputs.xxx}}`, `{{steps.name.output}}`
- **输出验证** — 每个步骤可配置验证提示词，执行完成后由 LLM 自动判定输出是否符合预期（PASS/FAIL）

## 快速开始

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 开发模式
npm run electron:dev

# 打包
npm run electron:build
```

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
| `execution:progress` | 实时进度事件 |

## 步骤输出验证

每个步骤支持可选的输出验证。启用后，步骤执行完成后系统会将输出和验证提示词一起发给 LLM，由 LLM 判定输出是否符合预期。

**验证提示词写法**：描述期望输出满足的标准即可，例如：

- `输出必须是合法的 JSON 格式，且包含 summary 和 details 字段`
- `翻译结果必须是中文，不能包含未翻译的英文句子，专有名词除外`
- `摘要不超过200字，且覆盖原文的主要观点`

验证失败时，该步骤标记为失败，根据工作流失败策略（stop/skip/retry）决定后续处理。

## 配置合并策略

- **rules (systemPrompt)**: 拼接
- **allowedTools**: 取交集
- **mcpServers**: 取并集
- **skills**: 同名覆盖 (工作流优先)
