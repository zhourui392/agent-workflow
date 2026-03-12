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

**注意**: `electron:dev` 依赖 `concurrently`、`wait-on`，首次运行前确保已安装。Electron 原生模块（better-sqlite3）需要匹配 Electron 版本编译，可用 `npx electron-rebuild -f -w better-sqlite3` 重建。

## 架构

```
src/
  main/                   # Electron 主进程
    index.ts              # 应用入口，窗口管理，生命周期事件
    core/
      pipeline.ts         # 多步骤流水线顺序编排
      executor.ts         # 单步执行器 → 调用 Claude Agent SDK
      configMerger.ts     # 四层配置合并（CLI → 磁盘 → 工作流 → 步骤）
      template.ts         # 解析模板变量 {{today}}, {{steps.X.output}} 等
      outputHandler.ts    # 执行结果输出处理
    ipc/                  # IPC 处理器（workflows, executions, config, mcp-servers, skills）
    services/             # 业务服务层
    store/
      database.ts         # better-sqlite3 同步数据库
      models.ts           # 类型定义
      repositories/       # 数据访问层（workflowRepository, executionRepository 等）
    scheduler/
      cronManager.ts      # node-cron 定时任务注册/移除
  renderer/               # 前端渲染进程（Vue 3）
    views/                # 页面组件 (WorkflowList/Edit, ExecutionList/Detail, GlobalConfig)
    stores/               # Pinia 状态管理 (workflow.ts, execution.ts)
    api/                  # IPC 适配层（模拟 axios 风格接口）
    router/               # Vue Router 路由配置
  preload/                # Electron preload 脚本，通过 contextBridge 暴露 IPC API
global_config/            # 应用全局配置（rules/, mcp/, skills/）
```

## 关键设计决策

- **配置合并策略**: rules=拼接, allowedTools=取交集, MCP=按需加载取并集, skills=同名覆盖
- **执行模型**: 主进程异步执行，IPC 事件实时推送进度到渲染进程
- **模板变量**: `{{today}}`, `{{yesterday}}`, `{{now}}`, `{{inputs.xxx}}`, `{{steps.<name>.output}}`
- **步骤失败策略**: stop（停止）/ skip（跳过）/ retry（重试）
- **全局配置存储在磁盘**: `global_config/` (rules/, mcp/, skills/)
- **数据库**: SQLite (better-sqlite3 同步)，路径 `%APPDATA%/agent-workflow/agent_workflow.db`（macOS: `~/Library/Application Support/agent-workflow/`）
- **嵌套会话保护**: 主进程启动时清除 `CLAUDECODE` 环境变量，防止从 Claude Code 终端启动时子进程被拒绝

## 技术栈

- 运行时: Electron 28, TypeScript 5
- 前端: Vue 3 (Composition API), Vite, Element Plus, Pinia
- 数据库: better-sqlite3
- AI SDK: @anthropic-ai/claude-code
- 调度器: node-cron

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
