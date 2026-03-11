# Python后端迁移Node.js设计方案 (Electron桌面应用)

## Context

将Python后端服务迁移到Node.js，目标是构建**Electron桌面应用**。前端Vue 3应用将通过Electron的IPC机制与Node.js后端通信，数据本地存储，无需独立服务。保持与现有前端API完全兼容，数据库全新开始。

---

## 1. Claude Agent SDK TypeScript用法总结

### 1.1 安装
```bash
npm install @anthropic-ai/claude-code
```

### 1.2 核心API - V1 `query()` 函数

```typescript
import { query } from "@anthropic-ai/claude-code";

const q = query({
  prompt: "执行任务",
  options: {
    model: "claude-opus-4-6",
    cwd: "/path/to/project",
    systemPrompt: "你是一个助手...",
    allowedTools: ["Read", "Edit", "Bash"],
    mcpServers: { /* MCP配置 */ },
    maxTurns: 30,
    permissionMode: "acceptEdits"
  }
});

// 流式处理消息
for await (const msg of q) {
  switch (msg.type) {
    case "assistant":
      const text = msg.message.content
        .filter(b => b.type === "text")
        .map(b => b.text).join("");
      console.log(text);
      break;
    case "result":
      console.log("Token使用:", msg.total_cost_usd);
      break;
  }
}
```

### 1.3 关键配置项

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `model` | string | Claude模型名 |
| `cwd` | string | 工作目录 |
| `systemPrompt` | string | 系统提示词 |
| `allowedTools` | string[] | 允许的工具列表 |
| `mcpServers` | Record | MCP服务器配置 |
| `maxTurns` | number | 最大轮次 |
| `maxBudgetUsd` | number | 预算上限(USD) |
| `permissionMode` | PermissionMode | 权限模式 |

### 1.4 权限模式
- `default`: 标准权限行为
- `acceptEdits`: 自动接受文件编辑
- `bypassPermissions`: 绕过所有权限
- `plan`: 规划模式
- `dontAsk`: 不询问，未预批准则拒绝

### 1.5 消息类型

| 类型 | 描述 |
|:----|:----|
| `SDKAssistantMessage` | 助手响应 |
| `SDKUserMessage` | 用户输入 |
| `SDKResultMessage` | 最终结果（成功或错误） |
| `SDKSystemMessage` | 系统初始化消息 |
| `SDKPartialAssistantMessage` | 流式部分消息 |
| `SDKToolProgressMessage` | 工具执行进度 |

### 1.6 MCP服务器集成

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-code";
import { z } from "zod";

// 创建自定义 MCP 工具
const weatherTool = tool(
  "get_weather",
  "获取天气信息",
  { city: z.string() },
  async (args) => {
    return { content: [{ type: "text", text: `${args.city} 天气晴朗` }] };
  }
);

// 创建 SDK MCP 服务器
const mcpServer = createSdkMcpServer({
  name: "my-server",
  tools: [weatherTool]
});

const q = query({
  prompt: "北京天气如何？",
  options: {
    mcpServers: {
      "my-server": mcpServer
    }
  }
});
```

---

## 2. 技术栈映射 (Electron场景)

| Python技术 | Node.js替代方案 | 说明 |
|------------|-----------------|------|
| FastAPI | Electron IPC | 前端通过ipcRenderer调用main进程 |
| SQLAlchemy | better-sqlite3 | 同步SQLite，Electron友好 |
| APScheduler | node-cron | 轻量级cron调度 |
| Pydantic | Zod / TypeScript | 类型校验 |
| structlog | electron-log | Electron日志方案 |
| httpx | axios | HTTP客户端 |
| WebSocket | Electron IPC事件 | 实时更新通过IPC推送 |

---

## 3. 目录结构设计 (Electron架构)

```
electron-app/
├── src/
│   ├── main/                      # Electron主进程
│   │   ├── index.ts               # 主进程入口
│   │   ├── ipc/                   # IPC处理器 (替代HTTP API)
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
│   │       ├── workflowService.ts
│   │       └── executionService.ts
│   ├── renderer/                  # 前端 (现有Vue代码)
│   │   └── ...                    # 复用frontend/src
│   └── preload/
│       └── index.ts               # IPC桥接
├── data/                          # 本地数据目录
│   └── agent_workflow.db
├── global_config/                 # 复用现有配置
├── package.json
├── electron-builder.json
└── tsconfig.json
```

---

## 4. 核心模块迁移设计

### 4.1 executor.ts - Claude Agent SDK集成

```typescript
// src/main/core/executor.ts
import { query } from "@anthropic-ai/claude-code";

interface StepResult {
  success: boolean;
  outputText: string;
  tokensUsed: number;
  errorMessage?: string;
}

export async function executeStep(
  prompt: string,
  config: MergedConfig,
  onProgress?: (text: string) => void
): Promise<StepResult> {
  let outputText = "";
  let tokensUsed = 0;

  try {
    const q = query({
      prompt,
      options: {
        model: config.model || "claude-sonnet-4-20250514",
        systemPrompt: config.systemPrompt,
        allowedTools: config.allowedTools,
        mcpServers: config.mcpServers,
        maxTurns: config.maxTurns || 30,
        permissionMode: "acceptEdits",
        cwd: process.cwd()
      }
    });

    for await (const msg of q) {
      if (msg.type === "assistant") {
        const text = extractText(msg.message.content);
        outputText += text;
        onProgress?.(text);
      }
      if (msg.type === "result") {
        tokensUsed = msg.usage?.total_tokens || 0;
      }
    }

    return { success: true, outputText, tokensUsed };
  } catch (error) {
    return {
      success: false,
      outputText,
      tokensUsed,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}
```

### 4.2 pipeline.ts - 流水线编排

```typescript
// src/main/core/pipeline.ts
export async function executePipeline(
  workflow: Workflow,
  inputs: Record<string, any>,
  onStepComplete?: (stepIndex: number, result: StepResult) => void
): Promise<ExecutionResult> {
  const context: Record<string, any> = { inputs };
  let totalTokens = 0;

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const renderedPrompt = renderTemplate(step.prompt, context);

    const result = await executeStep(renderedPrompt, mergedConfig);

    context[`steps.${step.name}.output`] = result.outputText;
    totalTokens += result.tokensUsed;

    onStepComplete?.(i, result);

    if (!result.success) {
      if (workflow.onFailure === "stop") break;
      if (workflow.onFailure === "retry") {
        // 重试逻辑
      }
    }
  }

  return { success: true, totalTokens, outputs: context };
}
```

### 4.3 configMerger.ts - 配置合并

```typescript
// src/main/core/configMerger.ts
export function mergeConfig(
  globalConfig: GlobalConfig,
  workflowConfig: WorkflowConfig
): MergedConfig {
  return {
    // rules: 拼接
    systemPrompt: [
      globalConfig.systemPrompt,
      workflowConfig.rules
    ].filter(Boolean).join("\n\n"),

    // tools: 取交集
    allowedTools: workflowConfig.allowedTools?.length
      ? globalConfig.allowedTools.filter(t => workflowConfig.allowedTools.includes(t))
      : globalConfig.allowedTools,

    // MCP: 取并集
    mcpServers: {
      ...globalConfig.mcpServers,
      ...workflowConfig.mcpServers
    },

    // skills: 同名覆盖
    skills: {
      ...globalConfig.skills,
      ...workflowConfig.skills
    }
  };
}
```

### 4.4 数据库 - better-sqlite3 (Electron友好)

```typescript
// src/main/store/database.ts
import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

const dbPath = path.join(app.getPath("userData"), "agent_workflow.db");
export const db = new Database(dbPath);

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    schedule TEXT,
    inputs TEXT,
    steps TEXT NOT NULL,
    rules TEXT,
    mcp_servers TEXT,
    skills TEXT,
    limits TEXT,
    output TEXT,
    on_failure TEXT DEFAULT 'stop',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    current_step INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
  );

  CREATE TABLE IF NOT EXISTS step_executions (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    prompt_rendered TEXT,
    output_text TEXT,
    tokens_used INTEGER DEFAULT 0,
    model_used TEXT,
    error_message TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    FOREIGN KEY (execution_id) REFERENCES executions(id)
  );
`);
```

### 4.5 定时任务 - node-cron

```typescript
// src/main/scheduler/cronManager.ts
import cron from "node-cron";

const jobs = new Map<string, cron.ScheduledTask>();

export function registerWorkflow(workflow: Workflow) {
  if (!workflow.schedule || !workflow.enabled) return;

  const task = cron.schedule(workflow.schedule, async () => {
    await executePipeline(workflow, {});
  });

  jobs.set(workflow.id, task);
}

export function unregisterWorkflow(workflowId: string) {
  const task = jobs.get(workflowId);
  if (task) {
    task.stop();
    jobs.delete(workflowId);
  }
}
```

---

## 5. Electron IPC层设计 (替代HTTP API)

### 5.1 Preload脚本 (API桥接)

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  // Workflows
  getWorkflows: () => ipcRenderer.invoke("workflows:list"),
  getWorkflow: (id: string) => ipcRenderer.invoke("workflows:get", id),
  createWorkflow: (data: any) => ipcRenderer.invoke("workflows:create", data),
  updateWorkflow: (id: string, data: any) => ipcRenderer.invoke("workflows:update", id, data),
  deleteWorkflow: (id: string) => ipcRenderer.invoke("workflows:delete", id),
  toggleWorkflow: (id: string) => ipcRenderer.invoke("workflows:toggle", id),
  runWorkflow: (id: string, inputs?: any) => ipcRenderer.invoke("workflows:run", id, inputs),

  // Executions
  getExecutions: (params?: any) => ipcRenderer.invoke("executions:list", params),
  getExecution: (id: string) => ipcRenderer.invoke("executions:get", id),

  // Config
  getConfig: () => ipcRenderer.invoke("config:get"),
  updateConfig: (data: any) => ipcRenderer.invoke("config:update", data),

  // 实时更新监听 (替代WebSocket)
  onExecutionProgress: (callback: (data: any) => void) => {
    ipcRenderer.on("execution:progress", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("execution:progress");
  }
});
```

### 5.2 IPC处理器 (主进程)

```typescript
// src/main/ipc/workflows.ts
import { ipcMain } from "electron";
import { workflowService } from "../services/workflowService";

export function registerWorkflowHandlers() {
  ipcMain.handle("workflows:list", () => workflowService.list());
  ipcMain.handle("workflows:get", (_, id) => workflowService.get(id));
  ipcMain.handle("workflows:create", (_, data) => workflowService.create(data));
  ipcMain.handle("workflows:update", (_, id, data) => workflowService.update(id, data));
  ipcMain.handle("workflows:delete", (_, id) => workflowService.delete(id));
  ipcMain.handle("workflows:toggle", (_, id) => workflowService.toggle(id));
  ipcMain.handle("workflows:run", (_, id, inputs) => workflowService.run(id, inputs));
}
```

### 5.3 前端适配层

```typescript
// renderer/src/api/index.ts
// 前端API调用方式保持不变，仅底层实现从axios改为IPC

// 原有axios方式 (保留类型兼容)
// export const getWorkflows = () => axios.get("/api/workflows");

// Electron IPC方式
export const getWorkflows = () => window.api.getWorkflows();
export const getWorkflow = (id: string) => window.api.getWorkflow(id);
export const createWorkflow = (data: any) => window.api.createWorkflow(data);
// ...其他API同理
```

---

## 6. 迁移实施步骤

### 阶段1: Electron项目初始化
1. 创建`electron-app/`目录
2. 初始化Electron + Vue + TypeScript项目结构
3. 安装依赖: `electron`, `@anthropic-ai/claude-code`, `better-sqlite3`, `node-cron`, `zod`

### 阶段2: 数据层迁移
1. 实现better-sqlite3数据库初始化
2. 创建Repository层 (CRUD操作)
3. 定义TypeScript类型 (与现有Pydantic schema对齐)

### 阶段3: 核心引擎迁移
1. 实现`executor.ts` - Claude Agent SDK TypeScript调用
2. 实现`template.ts` - 模板变量渲染
3. 实现`configMerger.ts` - 配置合并
4. 实现`pipeline.ts` - 流水线编排

### 阶段4: IPC层实现
1. 实现Preload脚本 (API桥接)
2. 实现IPC处理器 (workflows/executions/config)
3. 实现实时进度推送 (替代WebSocket)

### 阶段5: 前端适配
1. 创建API适配层 (axios → IPC)
2. 将现有Vue代码复制到renderer目录
3. 测试所有功能

### 阶段6: 调度器与打包
1. 实现`cronManager.ts`
2. 配置electron-builder
3. 打包测试

---

## 7. 验证方案

1. **单元测试**: Vitest测试core模块 (executor, pipeline, template)
2. **IPC测试**: 验证所有IPC通道正常工作
3. **功能测试**:
   - 创建/编辑/删除工作流
   - 手动触发执行
   - 实时查看执行进度
   - 定时任务触发
4. **打包测试**: 在目标平台测试打包后的应用

---

## 8. API兼容性映射

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

---

## 9. 已实现文件清单

```
electron-app/
├── package.json                                    # 项目配置
├── tsconfig.json                                   # TypeScript配置 (渲染进程)
├── tsconfig.main.json                              # TypeScript配置 (主进程)
├── vite.config.ts                                  # Vite构建配置
├── electron-builder.json                           # Electron打包配置
├── src/main/
│   ├── index.ts                                    # 主进程入口
│   ├── core/
│   │   ├── index.ts                                # 核心模块导出
│   │   ├── executor.ts                             # Claude Agent SDK调用
│   │   ├── pipeline.ts                             # 多步骤流水线
│   │   ├── template.ts                             # 模板变量渲染
│   │   ├── configMerger.ts                         # 配置合并
│   │   └── outputHandler.ts                        # 输出处理
│   ├── store/
│   │   ├── database.ts                             # 数据库连接
│   │   ├── models.ts                               # 类型定义
│   │   └── repositories/
│   │       ├── index.ts                            # Repository导出
│   │       ├── workflowRepository.ts               # 工作流CRUD
│   │       └── executionRepository.ts              # 执行记录CRUD
│   ├── scheduler/
│   │   └── cronManager.ts                          # 定时任务管理
│   ├── services/
│   │   ├── index.ts                                # 服务导出
│   │   ├── workflowService.ts                      # 工作流业务逻辑
│   │   ├── executionService.ts                     # 执行业务逻辑
│   │   └── configService.ts                        # 配置业务逻辑
│   └── ipc/
│       ├── index.ts                                # IPC注册入口
│       ├── workflows.ts                            # 工作流IPC处理器
│       ├── executions.ts                           # 执行记录IPC处理器
│       └── config.ts                               # 配置IPC处理器
├── src/preload/
│   └── index.ts                                    # Preload脚本
└── src/renderer/
    └── api/
        └── index.ts                                # 前端API适配层
```
