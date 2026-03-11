# Agent Workflow - Electron Desktop Application

AI驱动的多步骤工作流自动化平台的桌面客户端版本。

## 技术栈

- **运行时**: Electron 28
- **语言**: TypeScript 5.3
- **前端**: Vue 3 + Vite
- **数据库**: better-sqlite3
- **AI SDK**: @anthropic-ai/claude-code
- **调度器**: node-cron

## 目录结构

```
electron-app/
├── src/
│   ├── main/                      # Electron主进程
│   │   ├── index.ts               # 主进程入口
│   │   ├── ipc/                   # IPC处理器
│   │   │   ├── workflows.ts       # 工作流CRUD
│   │   │   ├── executions.ts      # 执行历史
│   │   │   └── config.ts          # 全局配置
│   │   ├── core/                  # 核心引擎
│   │   │   ├── executor.ts        # Claude Agent SDK调用
│   │   │   ├── pipeline.ts        # 多步骤流水线
│   │   │   ├── configMerger.ts    # 配置合并
│   │   │   ├── template.ts        # 模板变量渲染
│   │   │   └── outputHandler.ts   # 输出处理
│   │   ├── store/                 # 数据层
│   │   │   ├── database.ts        # better-sqlite3连接
│   │   │   ├── models.ts          # 类型定义
│   │   │   └── repositories/      # 数据访问层
│   │   ├── scheduler/
│   │   │   └── cronManager.ts     # 定时任务
│   │   └── services/              # 业务服务
│   ├── renderer/                  # 前端渲染进程
│   │   └── api/index.ts           # API适配层
│   └── preload/
│       └── index.ts               # IPC桥接
├── global_config/                 # 全局配置
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── vite.config.ts
└── electron-builder.json
```

## 快速开始

### 安装依赖

```bash
cd electron-app
npm install
```

### 开发模式

```bash
npm run electron:dev
```

### 构建发布包

```bash
npm run electron:build
```

## API兼容性

| 原HTTP API | Electron IPC |
|------------|--------------|
| `GET /api/workflows` | `workflows:list` |
| `POST /api/workflows` | `workflows:create` |
| `GET /api/workflows/:id` | `workflows:get` |
| `PUT /api/workflows/:id` | `workflows:update` |
| `DELETE /api/workflows/:id` | `workflows:delete` |
| `PATCH /api/workflows/:id/toggle` | `workflows:toggle` |
| `POST /api/workflows/:id/run` | `workflows:run` |
| `GET /api/executions` | `executions:list` |
| `GET /api/executions/:id` | `executions:get` |
| `GET /api/config` | `config:get` |
| `PUT /api/config` | `config:update` |
| `WS /ws/executions/:id` | `execution:progress` 事件 |

## 前端迁移

前端代码只需将API调用从axios改为使用`window.api`：

```typescript
// 原有axios方式
// const { data } = await axios.get('/api/workflows');

// Electron IPC方式
import { getWorkflows } from '@api';
const { data } = await getWorkflows();
```

## Claude Agent SDK TypeScript用法

```typescript
import { query } from '@anthropic-ai/claude-code';

const q = query({
  prompt: '执行任务',
  options: {
    model: 'claude-opus-4-6',
    systemPrompt: '你是一个助手...',
    allowedTools: ['Read', 'Edit', 'Bash'],
    maxTurns: 30,
    permissionMode: 'acceptEdits'
  }
});

for await (const msg of q) {
  if (msg.type === 'assistant') {
    console.log(msg.message.content);
  }
  if (msg.type === 'result') {
    console.log('完成');
  }
}
```

## 配置合并策略

- **rules (systemPrompt)**: 拼接
- **allowedTools**: 取交集
- **mcpServers**: 取并集
- **skills**: 同名覆盖 (工作流优先)
