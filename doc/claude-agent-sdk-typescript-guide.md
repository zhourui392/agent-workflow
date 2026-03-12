# Claude Agent SDK TypeScript 开发指南

> 基于官方文档整理，版本: 2026年3月
>
> 官方文档: https://platform.claude.com/docs/en/agent-sdk/overview

## 目录

1. [概述](#1-概述)
2. [快速开始](#2-快速开始)
3. [核心API](#3-核心api)
4. [配置选项](#4-配置选项)
5. [消息类型](#5-消息类型)
6. [内置工具](#6-内置工具)
7. [权限管理](#7-权限管理)
8. [会话管理](#8-会话管理)
9. [MCP集成](#9-mcp集成)
10. [Hooks机制](#10-hooks机制)
11. [子Agent](#11-子agent)
12. [结构化输出](#12-结构化输出)
13. [沙箱配置](#13-沙箱配置)
14. [最佳实践](#14-最佳实践)
15. [常见问题](#15-常见问题)

---

## 1. 概述

### 1.1 什么是 Claude Agent SDK

Claude Agent SDK 是 Anthropic 官方提供的 SDK，用于构建能够自主执行任务的 AI Agent。它提供了与 Claude Code CLI 相同的工具、Agent 循环和上下文管理能力，可在 TypeScript 和 Python 中编程使用。

**核心特性:**
- **内置工具**: 开箱即用的文件读写、命令执行、代码搜索等工具
- **自动化工具执行**: Claude 直接执行工具，无需手动实现工具循环
- **MCP 协议支持**: 连接数据库、浏览器、API 等外部系统
- **会话管理**: 支持多轮对话、会话恢复和分支
- **Hooks 机制**: 在关键执行点插入自定义逻辑
- **结构化输出**: 返回符合 JSON Schema 的类型安全数据

### 1.2 与其他 Claude 工具的对比

| 使用场景 | 推荐工具 |
|:---------|:---------|
| 交互式开发 | Claude Code CLI |
| CI/CD 流水线 | Agent SDK |
| 自定义应用 | Agent SDK |
| 一次性任务 | Claude Code CLI |
| 生产环境自动化 | Agent SDK |

### 1.3 SDK 命名变更

> **注意**: Claude Code SDK 已更名为 Claude Agent SDK。包名从 `@anthropic-ai/claude-code` 变更为 `@anthropic-ai/claude-agent-sdk`。

---

## 2. 快速开始

### 2.1 安装

```bash
npm install @anthropic-ai/claude-agent-sdk
```

### 2.2 设置 API Key

```bash
export ANTHROPIC_API_KEY=your-api-key
```

**支持的认证方式:**
- **Anthropic API**: 设置 `ANTHROPIC_API_KEY` 环境变量
- **Amazon Bedrock**: 设置 `CLAUDE_CODE_USE_BEDROCK=1` 并配置 AWS 凭证
- **Google Vertex AI**: 设置 `CLAUDE_CODE_USE_VERTEX=1` 并配置 GCP 凭证
- **Microsoft Azure**: 设置 `CLAUDE_CODE_USE_FOUNDRY=1` 并配置 Azure 凭证

### 2.3 第一个 Agent

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// 创建 Agent 循环，流式处理消息
for await (const message of query({
  prompt: "查找 utils.py 中的 bug 并修复",
  options: {
    allowedTools: ["Read", "Edit", "Glob"],  // 允许使用的工具
    permissionMode: "acceptEdits"             // 自动批准文件编辑
  }
})) {
  // 打印人类可读的输出
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("text" in block) {
        console.log(block.text);       // Claude 的推理过程
      } else if ("name" in block) {
        console.log(`工具: ${block.name}`);  // 正在调用的工具
      }
    }
  } else if (message.type === "result") {
    console.log(`完成: ${message.subtype}`);  // 最终结果
  }
}
```

### 2.4 运行

```bash
npx tsx agent.ts
```

---

## 3. 核心API

### 3.1 query() 函数

`query()` 是与 Claude 交互的主要函数，创建一个异步生成器来流式传输消息。

```typescript
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

**参数说明:**

| 参数 | 类型 | 描述 |
|:-----|:-----|:-----|
| `prompt` | `string \| AsyncIterable<SDKUserMessage>` | 输入提示词或异步迭代器（流式模式） |
| `options` | `Options` | 可选配置对象 |

**返回值:**

返回 `Query` 对象，扩展了 `AsyncGenerator<SDKMessage, void>`，包含以下方法：

| 方法 | 描述 |
|:-----|:-----|
| `interrupt()` | 中断查询（仅流式输入模式） |
| `rewindFiles(userMessageId, options?)` | 恢复文件到指定消息时的状态 |
| `setPermissionMode(mode)` | 动态更改权限模式 |
| `setModel(model)` | 动态更改模型 |
| `initializationResult()` | 获取完整初始化结果 |
| `supportedCommands()` | 获取可用的斜杠命令 |
| `supportedModels()` | 获取可用的模型 |
| `supportedAgents()` | 获取可用的子 Agent |
| `mcpServerStatus()` | 获取 MCP 服务器状态 |
| `accountInfo()` | 获取账户信息 |
| `setMcpServers(servers)` | 动态替换 MCP 服务器 |
| `streamInput(stream)` | 流式输入消息 |
| `stopTask(taskId)` | 停止后台任务 |
| `close()` | 关闭查询并终止底层进程 |

### 3.2 tool() 函数

创建类型安全的 MCP 工具定义。

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const weatherTool = tool(
  "get_weather",                          // 工具名称
  "获取指定城市的天气信息",                  // 工具描述
  { city: z.string() },                   // Zod schema 定义输入参数
  async (args) => {                       // 处理函数
    return {
      content: [{ type: "text", text: `${args.city} 天气晴朗` }]
    };
  },
  { annotations: { readOnly: true } }     // 可选：MCP 工具注解
);
```

### 3.3 createSdkMcpServer() 函数

创建与应用同进程运行的 MCP 服务器实例。

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const mcpServer = createSdkMcpServer({
  name: "my-server",
  version: "1.0.0",
  tools: [weatherTool]
});

// 在 query 中使用
for await (const message of query({
  prompt: "北京天气如何？",
  options: {
    mcpServers: {
      "my-server": mcpServer
    }
  }
})) {
  // 处理消息
}
```

### 3.4 会话管理函数

```typescript
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

// 列出会话
const sessions = await listSessions({
  dir: "/path/to/project",
  limit: 10
});

// 获取会话消息
const messages = await getSessionMessages(sessions[0].sessionId, {
  dir: "/path/to/project",
  limit: 20
});
```

---

## 4. 配置选项

### 4.1 完整配置选项

| 选项 | 类型 | 默认值 | 描述 |
|:-----|:-----|:-------|:-----|
| `model` | `string` | CLI默认 | 使用的 Claude 模型 |
| `cwd` | `string` | `process.cwd()` | 工作目录 |
| `systemPrompt` | `string \| {type, preset, append?}` | undefined | 系统提示词配置 |
| `allowedTools` | `string[]` | `[]` | 自动批准的工具列表 |
| `disallowedTools` | `string[]` | `[]` | 禁止使用的工具列表 |
| `permissionMode` | `PermissionMode` | `'default'` | 权限模式 |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | MCP 服务器配置 |
| `maxTurns` | `number` | undefined | 最大 Agent 轮次 |
| `maxBudgetUsd` | `number` | undefined | 预算上限（美元） |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | `{}` | Hook 回调配置 |
| `agents` | `Record<string, AgentDefinition>` | undefined | 子 Agent 定义 |
| `resume` | `string` | undefined | 要恢复的会话 ID |
| `continue` | `boolean` | `false` | 继续最近的会话 |
| `forkSession` | `boolean` | `false` | 分叉会话 |
| `outputFormat` | `{type, schema}` | undefined | 结构化输出格式 |
| `thinking` | `ThinkingConfig` | `{type: 'adaptive'}` | 思考行为配置 |
| `effort` | `'low' \| 'medium' \| 'high' \| 'max'` | `'high'` | 响应努力程度 |
| `sandbox` | `SandboxSettings` | undefined | 沙箱配置 |
| `includePartialMessages` | `boolean` | `false` | 包含部分消息事件 |
| `debug` | `boolean` | `false` | 启用调试模式 |
| `settingSources` | `SettingSource[]` | `[]` | 加载的设置来源 |
| `plugins` | `SdkPluginConfig[]` | `[]` | 插件配置 |
| `betas` | `SdkBeta[]` | `[]` | 启用的 Beta 功能 |

### 4.2 权限模式

```typescript
type PermissionMode =
  | "default"           // 标准权限行为
  | "acceptEdits"       // 自动接受文件编辑
  | "bypassPermissions" // 绕过所有权限检查
  | "plan"              // 规划模式，不执行
  | "dontAsk";          // 不询问，未预批准则拒绝
```

### 4.3 思考配置

```typescript
type ThinkingConfig =
  | { type: "adaptive" }                    // 模型自行决定何时及如何推理
  | { type: "enabled"; budgetTokens?: number } // 固定思考 Token 预算
  | { type: "disabled" };                   // 禁用扩展思考
```

### 4.4 设置来源

```typescript
type SettingSource = "user" | "project" | "local";
```

| 值 | 描述 | 位置 |
|:---|:-----|:-----|
| `'user'` | 全局用户设置 | `~/.claude/settings.json` |
| `'project'` | 共享项目设置（版本控制） | `.claude/settings.json` |
| `'local'` | 本地项目设置（gitignore） | `.claude/settings.local.json` |

---

## 5. 消息类型

### 5.1 SDKMessage 联合类型

```typescript
type SDKMessage =
  | SDKAssistantMessage      // 助手响应
  | SDKUserMessage           // 用户输入
  | SDKResultMessage         // 最终结果
  | SDKSystemMessage         // 系统初始化消息
  | SDKPartialAssistantMessage // 流式部分消息
  | SDKToolProgressMessage   // 工具执行进度
  | SDKTaskNotificationMessage // 后台任务通知
  | SDKHookStartedMessage    // Hook 开始
  | SDKHookProgressMessage   // Hook 进度
  | SDKHookResponseMessage   // Hook 响应
  // ... 更多类型
```

### 5.2 SDKAssistantMessage

```typescript
type SDKAssistantMessage = {
  type: "assistant";
  uuid: UUID;
  session_id: string;
  message: BetaMessage;           // Anthropic SDK 的消息类型
  parent_tool_use_id: string | null;
  error?: SDKAssistantMessageError;
};
```

### 5.3 SDKResultMessage

```typescript
type SDKResultMessage =
  | {
      type: "result";
      subtype: "success";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      result: string;
      total_cost_usd: number;
      usage: NonNullableUsage;
      structured_output?: unknown;    // 结构化输出
    }
  | {
      type: "result";
      subtype: "error_max_turns" | "error_during_execution" | "error_max_budget_usd" | "error_max_structured_output_retries";
      // ... 错误相关字段
      errors: string[];
    };
```

### 5.4 SDKSystemMessage

```typescript
type SDKSystemMessage = {
  type: "system";
  subtype: "init";
  uuid: UUID;
  session_id: string;
  agents?: string[];
  claude_code_version: string;
  cwd: string;
  tools: string[];
  mcp_servers: { name: string; status: string; }[];
  model: string;
  permissionMode: PermissionMode;
  // ... 更多字段
};
```

---

## 6. 内置工具

### 6.1 工具列表

| 工具 | 功能 |
|:-----|:-----|
| **Read** | 读取文件（文本、图片、PDF、Jupyter Notebook） |
| **Write** | 创建新文件 |
| **Edit** | 精确编辑现有文件 |
| **Bash** | 运行终端命令、脚本、git 操作 |
| **Glob** | 按模式查找文件（`**/*.ts`, `src/**/*.py`） |
| **Grep** | 使用正则搜索文件内容 |
| **WebSearch** | 搜索网络获取当前信息 |
| **WebFetch** | 获取并解析网页内容 |
| **Agent** | 启动子 Agent 处理复杂任务 |
| **AskUserQuestion** | 向用户提问获取澄清 |
| **TodoWrite** | 管理任务列表 |
| **NotebookEdit** | 编辑 Jupyter Notebook 单元格 |

### 6.2 工具输入类型示例

**Bash:**
```typescript
type BashInput = {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
};
```

**Edit:**
```typescript
type FileEditInput = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};
```

**Grep:**
```typescript
type GrepInput = {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  "-i"?: boolean;        // 忽略大小写
  "-n"?: boolean;        // 显示行号
  "-B"?: number;         // 前置上下文行数
  "-A"?: number;         // 后置上下文行数
  multiline?: boolean;   // 多行匹配
};
```

---

## 7. 权限管理

### 7.1 权限评估流程

1. **Hooks** - 首先执行 Hook，可以允许、拒绝或继续
2. **Deny 规则** - 检查 `disallowedTools`，匹配则阻止
3. **权限模式** - 应用当前权限模式
4. **Allow 规则** - 检查 `allowedTools`，匹配则批准
5. **canUseTool 回调** - 调用自定义权限函数

### 7.2 配置示例

```typescript
// 只读 Agent
const options = {
  allowedTools: ["Read", "Glob", "Grep"],
  permissionMode: "dontAsk"  // 未列出的工具直接拒绝
};

// 全自动 Agent（谨慎使用）
const options = {
  permissionMode: "bypassPermissions",
  disallowedTools: ["rm", "git push --force"]  // 仍可禁止特定工具
};

// 文件编辑 Agent
const options = {
  allowedTools: ["Read", "Edit", "Write", "Glob"],
  permissionMode: "acceptEdits"  // 自动接受文件编辑
};
```

### 7.3 自定义权限处理

```typescript
const options = {
  permissionMode: "default",
  canUseTool: async (toolName, input, context) => {
    // 自定义权限逻辑
    if (toolName === "Bash" && input.command.includes("rm")) {
      return {
        behavior: "deny",
        message: "不允许删除操作"
      };
    }

    return {
      behavior: "allow",
      updatedInput: input
    };
  }
};
```

---

## 8. 会话管理

### 8.1 会话选项

| 选项 | 用途 |
|:-----|:-----|
| `continue: true` | 继续当前目录最近的会话 |
| `resume: sessionId` | 恢复指定会话 |
| `forkSession: true` | 分叉会话（保留原会话不变） |
| `persistSession: false` | 不持久化会话到磁盘 |

### 8.2 多轮对话

```typescript
// 第一轮：分析代码
let sessionId: string | undefined;

for await (const message of query({
  prompt: "分析 auth 模块",
  options: { allowedTools: ["Read", "Glob"] }
})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}

// 第二轮：基于分析结果继续
for await (const message of query({
  prompt: "现在重构它使用 JWT",
  options: {
    resume: sessionId,
    allowedTools: ["Read", "Edit", "Write"]
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

### 8.3 使用 continue 简化

```typescript
// 第一轮
for await (const message of query({
  prompt: "分析 auth 模块",
  options: { allowedTools: ["Read", "Glob"] }
})) {
  // 处理消息
}

// 第二轮：自动继续最近会话
for await (const message of query({
  prompt: "现在重构它",
  options: {
    continue: true,  // 自动找到并恢复最近会话
    allowedTools: ["Read", "Edit", "Write"]
  }
})) {
  // 处理消息
}
```

---

## 9. MCP集成

### 9.1 MCP 服务器类型

**stdio 服务器（本地进程）:**
```typescript
const options = {
  mcpServers: {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN
      }
    }
  },
  allowedTools: ["mcp__github__*"]
};
```

**HTTP/SSE 服务器（远程）:**
```typescript
const options = {
  mcpServers: {
    "remote-api": {
      type: "sse",
      url: "https://api.example.com/mcp/sse",
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`
      }
    }
  },
  allowedTools: ["mcp__remote-api__*"]
};
```

**SDK 服务器（进程内）:**
```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const myTool = tool(
  "my_tool",
  "我的自定义工具",
  { input: z.string() },
  async (args) => ({
    content: [{ type: "text", text: `处理: ${args.input}` }]
  })
);

const mcpServer = createSdkMcpServer({
  name: "my-server",
  tools: [myTool]
});

const options = {
  mcpServers: {
    "my-server": mcpServer
  },
  allowedTools: ["mcp__my-server__*"]
};
```

### 9.2 工具命名约定

MCP 工具遵循命名模式：`mcp__<server-name>__<tool-name>`

示例：
- `mcp__github__list_issues`
- `mcp__postgres__query`
- `mcp__playwright__browser_click`

### 9.3 MCP 工具搜索

当 MCP 工具较多时，可启用工具搜索以减少上下文占用：

```typescript
const options = {
  mcpServers: { /* ... */ },
  env: {
    ENABLE_TOOL_SEARCH: "auto:5"  // 工具定义超过 5% 上下文时启用
  }
};
```

---

## 10. Hooks机制

### 10.1 可用 Hook 事件

| Hook 事件 | 触发时机 | 用例 |
|:----------|:---------|:-----|
| `PreToolUse` | 工具调用前（可阻止或修改） | 阻止危险命令 |
| `PostToolUse` | 工具执行后 | 记录文件变更到审计日志 |
| `PostToolUseFailure` | 工具执行失败 | 处理或记录错误 |
| `UserPromptSubmit` | 用户提交提示词 | 注入额外上下文 |
| `Stop` | Agent 执行停止 | 保存会话状态 |
| `SubagentStart` | 子 Agent 初始化 | 跟踪并行任务 |
| `SubagentStop` | 子 Agent 完成 | 聚合并行结果 |
| `SessionStart` | 会话初始化 | 初始化日志和遥测 |
| `SessionEnd` | 会话终止 | 清理临时资源 |
| `Notification` | Agent 状态消息 | 发送通知到 Slack |
| `PermissionRequest` | 权限请求 | 自定义权限处理 |

### 10.2 配置 Hook

```typescript
import { query, HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

// 定义 Hook 回调
const protectEnvFiles: HookCallback = async (input, toolUseID, { signal }) => {
  const preInput = input as PreToolUseHookInput;
  const toolInput = preInput.tool_input as Record<string, unknown>;
  const filePath = toolInput?.file_path as string;
  const fileName = filePath?.split("/").pop();

  // 阻止修改 .env 文件
  if (fileName === ".env") {
    return {
      hookSpecificOutput: {
        hookEventName: preInput.hook_event_name,
        permissionDecision: "deny",
        permissionDecisionReason: "不能修改 .env 文件"
      }
    };
  }

  return {};  // 允许操作
};

// 使用 Hook
for await (const message of query({
  prompt: "更新配置",
  options: {
    hooks: {
      PreToolUse: [{ matcher: "Write|Edit", hooks: [protectEnvFiles] }]
    }
  }
})) {
  // 处理消息
}
```

### 10.3 Hook 匹配器

```typescript
const options = {
  hooks: {
    PreToolUse: [
      // 匹配文件修改工具
      { matcher: "Write|Edit|Delete", hooks: [fileSecurityHook] },

      // 匹配所有 MCP 工具
      { matcher: "^mcp__", hooks: [mcpAuditHook] },

      // 匹配所有工具（无 matcher）
      { hooks: [globalLogger] }
    ]
  }
};
```

### 10.4 修改工具输入

```typescript
const redirectToSandbox: HookCallback = async (input, toolUseID, { signal }) => {
  if (input.hook_event_name !== "PreToolUse") return {};

  const preInput = input as PreToolUseHookInput;
  const toolInput = preInput.tool_input as Record<string, unknown>;

  if (preInput.tool_name === "Write") {
    const originalPath = toolInput.file_path as string;
    return {
      hookSpecificOutput: {
        hookEventName: preInput.hook_event_name,
        permissionDecision: "allow",
        updatedInput: {
          ...toolInput,
          file_path: `/sandbox${originalPath}`  // 重定向到沙箱
        }
      }
    };
  }
  return {};
};
```

---

## 11. 子Agent

### 11.1 定义子 Agent

```typescript
const options = {
  allowedTools: ["Read", "Glob", "Grep", "Agent"],
  agents: {
    "code-reviewer": {
      description: "代码审查专家，用于质量和安全审查",
      prompt: "分析代码质量并提出改进建议",
      tools: ["Read", "Glob", "Grep"],
      model: "sonnet"  // 可选：sonnet, opus, haiku, inherit
    },
    "test-writer": {
      description: "测试编写专家",
      prompt: "为代码编写全面的单元测试",
      tools: ["Read", "Write", "Edit", "Bash"],
      maxTurns: 10
    }
  }
};

for await (const message of query({
  prompt: "使用 code-reviewer agent 审查这个代码库",
  options
})) {
  // 处理消息
}
```

### 11.2 AgentDefinition 配置

```typescript
type AgentDefinition = {
  description: string;              // 何时使用此 Agent 的描述
  prompt: string;                   // Agent 的系统提示词
  tools?: string[];                 // 允许的工具列表
  disallowedTools?: string[];       // 禁止的工具列表
  model?: "sonnet" | "opus" | "haiku" | "inherit";  // 模型选择
  mcpServers?: AgentMcpServerSpec[];  // MCP 服务器配置
  skills?: string[];                // 预加载的技能
  maxTurns?: number;                // 最大轮次
};
```

---

## 12. 结构化输出

### 12.1 使用 JSON Schema

```typescript
const schema = {
  type: "object",
  properties: {
    company_name: { type: "string" },
    founded_year: { type: "number" },
    headquarters: { type: "string" }
  },
  required: ["company_name"]
};

for await (const message of query({
  prompt: "研究 Anthropic 并提供公司关键信息",
  options: {
    outputFormat: {
      type: "json_schema",
      schema: schema
    }
  }
})) {
  if (message.type === "result" && message.structured_output) {
    console.log(message.structured_output);
    // { company_name: "Anthropic", founded_year: 2021, headquarters: "San Francisco" }
  }
}
```

### 12.2 使用 Zod（类型安全）

```typescript
import { z } from "zod";

// 定义 Zod schema
const FeaturePlan = z.object({
  feature_name: z.string(),
  summary: z.string(),
  steps: z.array(z.object({
    step_number: z.number(),
    description: z.string(),
    estimated_complexity: z.enum(["low", "medium", "high"])
  })),
  risks: z.array(z.string())
});

type FeaturePlan = z.infer<typeof FeaturePlan>;

// 转换为 JSON Schema
const schema = z.toJSONSchema(FeaturePlan);

for await (const message of query({
  prompt: "规划如何为 React 应用添加暗色模式支持",
  options: {
    outputFormat: {
      type: "json_schema",
      schema: schema
    }
  }
})) {
  if (message.type === "result" && message.structured_output) {
    // 验证并获取完全类型化的结果
    const parsed = FeaturePlan.safeParse(message.structured_output);
    if (parsed.success) {
      const plan: FeaturePlan = parsed.data;
      console.log(`功能: ${plan.feature_name}`);
      plan.steps.forEach(step => {
        console.log(`${step.step_number}. [${step.estimated_complexity}] ${step.description}`);
      });
    }
  }
}
```

---

## 13. 沙箱配置

### 13.1 SandboxSettings

```typescript
type SandboxSettings = {
  enabled?: boolean;                    // 启用沙箱模式
  autoAllowBashIfSandboxed?: boolean;   // 沙箱启用时自动批准 bash 命令
  excludedCommands?: string[];          // 绕过沙箱的命令列表
  allowUnsandboxedCommands?: boolean;   // 允许模型请求非沙箱执行
  network?: SandboxNetworkConfig;       // 网络配置
  filesystem?: SandboxFilesystemConfig; // 文件系统配置
};
```

### 13.2 网络配置

```typescript
type SandboxNetworkConfig = {
  allowedDomains?: string[];            // 允许访问的域名
  allowManagedDomainsOnly?: boolean;    // 仅限 allowedDomains 中的域名
  allowLocalBinding?: boolean;          // 允许绑定本地端口
  allowUnixSockets?: string[];          // 允许的 Unix socket 路径
  httpProxyPort?: number;               // HTTP 代理端口
  socksProxyPort?: number;              // SOCKS 代理端口
};
```

### 13.3 文件系统配置

```typescript
type SandboxFilesystemConfig = {
  allowWrite?: string[];    // 允许写入的路径模式
  denyWrite?: string[];     // 禁止写入的路径模式
  denyRead?: string[];      // 禁止读取的路径模式
};
```

### 13.4 使用示例

```typescript
const options = {
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    network: {
      allowLocalBinding: true,
      allowedDomains: ["api.example.com"]
    },
    filesystem: {
      allowWrite: ["/tmp/*", "./output/*"],
      denyWrite: [".env", "*.key"]
    }
  }
};
```

---

## 14. 最佳实践

### 14.1 工具选择策略

```typescript
// 只读分析 Agent
const readOnlyOptions = {
  allowedTools: ["Read", "Glob", "Grep"],
  permissionMode: "dontAsk"
};

// 代码修改 Agent
const codeEditOptions = {
  allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
  permissionMode: "acceptEdits"
};

// 全功能自动化 Agent
const fullAutoOptions = {
  allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  permissionMode: "acceptEdits",
  disallowedTools: ["rm -rf", "git push --force"]  // 禁止危险操作
};
```

### 14.2 错误处理

```typescript
for await (const message of query({
  prompt: "执行任务",
  options
})) {
  // 检查 MCP 服务器连接状态
  if (message.type === "system" && message.subtype === "init") {
    const failedServers = message.mcp_servers.filter(s => s.status !== "connected");
    if (failedServers.length > 0) {
      console.warn("连接失败的服务器:", failedServers);
    }
  }

  // 处理结果
  if (message.type === "result") {
    switch (message.subtype) {
      case "success":
        console.log("成功:", message.result);
        break;
      case "error_max_turns":
        console.error("达到最大轮次限制");
        break;
      case "error_max_budget_usd":
        console.error("超出预算限制");
        break;
      case "error_during_execution":
        console.error("执行错误:", message.errors);
        break;
    }
  }
}
```

### 14.3 资源管理

```typescript
// 使用 AbortController 取消长时间运行的任务
const abortController = new AbortController();

// 设置超时
setTimeout(() => abortController.abort(), 60000);

const options = {
  abortController,
  maxTurns: 50,
  maxBudgetUsd: 1.0
};

try {
  for await (const message of query({ prompt: "长时间任务", options })) {
    // 处理消息
  }
} catch (error) {
  if (error instanceof AbortError) {
    console.log("任务被取消");
  }
}
```

### 14.4 日志和调试

```typescript
const options = {
  debug: true,                          // 启用调试模式
  debugFile: "./debug.log",             // 写入调试日志到文件
  includePartialMessages: true,         // 包含流式部分消息
  stderr: (data) => console.error(data) // 处理 stderr 输出
};
```

---

## 15. 常见问题

### 15.1 API Key 未找到

确保设置了 `ANTHROPIC_API_KEY` 环境变量：

```bash
export ANTHROPIC_API_KEY=your-api-key
```

或在 `.env` 文件中设置。

### 15.2 MCP 服务器连接失败

检查 `init` 消息中的服务器状态：

```typescript
if (message.type === "system" && message.subtype === "init") {
  for (const server of message.mcp_servers) {
    if (server.status === "failed") {
      console.error(`服务器 ${server.name} 连接失败`);
    }
  }
}
```

常见原因：
- 环境变量缺失
- 服务器未安装（对于 npx 命令）
- 连接字符串无效
- 网络问题

### 15.3 工具未被调用

确保已授权工具使用：

```typescript
const options = {
  allowedTools: ["mcp__servername__*"],  // 必须授权 MCP 工具
  // 或者
  permissionMode: "acceptEdits"          // 更改权限模式
};
```

### 15.4 会话恢复失败

会话文件存储在 `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`。确保：
- `cwd` 路径匹配
- 会话文件存在于当前机器

### 15.5 Hook 未触发

- 确认 Hook 事件名称正确且大小写匹配
- 检查 matcher 模式是否匹配工具名称
- 确保 Hook 在正确的事件类型下配置

---

## 参考资源

- **官方文档**: https://platform.claude.com/docs/en/agent-sdk/overview
- **TypeScript SDK 参考**: https://platform.claude.com/docs/en/agent-sdk/typescript
- **GitHub 仓库**: https://github.com/anthropics/claude-agent-sdk-typescript
- **MCP 服务器目录**: https://github.com/modelcontextprotocol/servers
- **示例代码**: https://github.com/anthropics/claude-agent-sdk-demos

---

> 本文档基于 Claude Agent SDK 官方文档整理，如有更新请参考官方文档。
