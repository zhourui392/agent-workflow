# MCP 和 Skills 配置列表管理技术方案

> 版本: 1.2
> 日期: 2026/03/12
> 作者: zhourui(V33215020)
>
> 修订历史:
> - v1.2 (2026/03/12): 改为按需加载模式，enabled 字段仅用于 UI 快速选择
> - v1.1 (2026/03/12): 修复合并策略冲突、简化表设计、解决并发问题、完善错误处理

## 一、需求概述

实现 MCP 和 Skills 的配置列表管理功能：

| 需求项 | 说明 |
|--------|------|
| 配置列表管理 | 独立管理 MCP 和 Skills 配置项，支持增删改查 |
| 全局配置选择 | 在全局配置中选择默认启用的 MCP/Skills |
| 步骤级选择 | 每个工作流步骤可独立选择使用的 MCP/Skills |
| 运行时加载 | 执行时合并全局 + 步骤选择的配置 |

## 二、技术方案

### 2.1 与现有架构的关系

#### 2.1.1 现有配置合并架构

当前系统采用**两层配置合并**：

| 层级 | 存储位置 | 配置内容 |
|------|----------|----------|
| 全局配置 | 磁盘 `global_config/` | rules, mcpServers, skills, settings |
| 工作流配置 | 数据库 `workflows` 表 | rules, mcpServers, skills, limits |

**现有合并策略**（`configMerger.ts`）：
- `rules (systemPrompt)`: 拼接（全局 + 工作流）
- `mcpServers`: 取并集（工作流覆盖同名）
- `skills`: 取并集（工作流覆盖同名）
- `allowedTools`: 取交集（当工作流有 MCP 时）

#### 2.1.2 新方案定位

**决策：按需加载模式**

数据库配置表作为「配置库」，`enabled` 字段仅用于 UI 快速选择，**不自动加载**：

```
┌─────────────────────────────────────────────────────────────────┐
│                    配置层次（按需加载）                           │
├─────────────────────────────────────────────────────────────────┤
│  第一层：磁盘全局配置（自动加载）                                  │
│  └── global_config/rules/, global_config/mcp/, global_config/skills/ │
│                                                                  │
│  第二层：工作流级配置（自动加载）                                  │
│  ├── workflow.mcpServers（YAML 格式）                             │
│  └── workflow.skills（Markdown 内容）                             │
│                                                                  │
│  第三层：步骤引用（按需加载）                                      │
│  ├── step.mcpServerIds → 从 mcp_servers 表加载                    │
│  └── step.skillIds → 从 skills 表加载                             │
│                                                                  │
│  数据库配置库（仅存储，不自动加载）                                 │
│  ├── mcp_servers 表（enabled 用于 UI 快速选择）                    │
│  └── skills 表（enabled 用于 UI 快速选择）                         │
└─────────────────────────────────────────────────────────────────┘
```

**enabled 字段含义**：
- `enabled = 1`：在 UI 下拉列表中标记为「推荐」，方便快速选择
- `enabled = 0`：普通配置项，需要手动搜索选择
- **无论 enabled 值如何，都需要在步骤中显式引用才会加载**

**向后兼容性**：
- 现有工作流的 `mcpServers`/`skills` 字段继续有效
- 数据库配置库提供新的管理方式
- 两种方式可以共存，运行时合并

### 2.2 MCP 与 Skills 的 SDK 调用差异

根据 Claude Agent SDK 的设计：

| 特性 | MCP | Skills |
|------|-----|--------|
| 配置方式 | SDK 参数直接传入 | 文件系统 + settingSources |
| 存储位置 | 可程序化控制 | 必须是文件系统 |
| allowedTools | `mcp__<server>__*` | `Skill` |

**MCP 调用示例：**

```typescript
const options = {
  mcpServers: {
    "playwright": {
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-server-playwright"]
    }
  },
  allowedTools: ["mcp__playwright__*"]
};
```

**Skills 调用示例：**

```typescript
const options = {
  cwd: "/path/to/project",
  settingSources: ["project"],  // 从工作目录加载 Skills
  allowedTools: ["Skill", "Read", "Write"]
};
```

Skills 文件位置：`<cwd>/.claude/skills/<skill-name>/SKILL.md`

### 2.3 存储方案

采用数据库存储配置，Skills 在执行时动态写入工作目录：

| 配置类型 | 存储方式 | 运行时处理 |
|----------|----------|------------|
| MCP | 数据库 `mcp_servers` 表 | 直接传入 SDK `mcpServers` 参数 |
| Skills | 数据库 `skills` 表 | 动态写入执行专属目录 |
| 全局启用 | `mcp_servers.enabled` / `skills.enabled` 字段 | 合并全局 + 步骤选择 |

### 2.4 Skills 动态写入流程（支持并发）

为避免多个工作流/步骤并发执行时的竞态条件，采用**执行隔离目录**方案：

```
步骤执行前:
  1. 创建执行专属目录: <cwd>/.claude/skills-<executionId>-<stepIndex>/
  2. 根据步骤配置的 skillIds，从数据库读取 Skill 内容
  3. 写入 SKILL.md 文件到专属目录

步骤执行:
  4. SDK 配置 settingSources: ["local"]
  5. 使用执行专属目录作为 skills 根目录

步骤执行后:
  6. 清理执行专属目录
```

**目录结构示例**：
```
<workingDirectory>/
├── .claude/
│   ├── skills-exec123-0/     # 执行 123 的步骤 0
│   │   ├── code-review/
│   │   │   └── SKILL.md
│   │   └── git-commit/
│   │       └── SKILL.md
│   └── skills-exec456-2/     # 执行 456 的步骤 2
│       └── test-writer/
│           └── SKILL.md
```

## 三、数据库设计

### 3.1 新增表结构

简化设计：直接在配置表中添加 `enabled` 字段，无需额外关联表。

```sql
-- MCP 服务配置表
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,          -- 服务名称（唯一，用于 SDK）
  description TEXT,                    -- 描述说明
  command TEXT NOT NULL,               -- 执行命令
  args TEXT,                           -- JSON: string[]
  env TEXT,                            -- JSON: Record<string, string>
  enabled INTEGER NOT NULL DEFAULT 0,  -- 全局启用标记: 0=禁用, 1=启用
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Skills 配置表
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,          -- 技能名称（唯一，作为目录名）
  description TEXT,                    -- 描述说明（YAML frontmatter）
  allowed_tools TEXT,                  -- JSON: string[] (YAML frontmatter)
  content TEXT NOT NULL,               -- Skill 指令内容 (Markdown)
  enabled INTEGER NOT NULL DEFAULT 0,  -- 全局启用标记: 0=禁用, 1=启用
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 索引：加速启用配置查询
CREATE INDEX idx_mcp_servers_enabled ON mcp_servers(enabled);
CREATE INDEX idx_skills_enabled ON skills(enabled);
```

**设计理由**：
- 原方案用 `global_enabled_configs` 关联表，但 IPC 接口分开（`get-enabled-mcp-ids`/`set-enabled-mcp-ids`），查询需要 JOIN
- 简化为 `enabled` 布尔字段后，单表查询即可，减少复杂度

### 3.2 现有表修改

#### 3.2.1 WorkflowStep 扩展

`workflows` 表的 `steps` JSON 字段中，每个步骤新增：

```typescript
interface WorkflowStep {
  name: string;
  prompt: string;
  maxTurns?: number;
  validation?: StepValidation;
  mcpServerIds?: string[];    // 新增：步骤选择的 MCP ID 列表
  skillIds?: string[];        // 新增：步骤选择的 Skill ID 列表
}
```

#### 3.2.2 现有 Workflow 字段保留

**决策：保留现有 `mcpServers`/`skills` 字段**

| 字段 | 保留/移除 | 原因 |
|------|-----------|------|
| `workflow.rules` | 保留 | 工作流级别规则拼接 |
| `workflow.mcpServers` | 保留 | 向后兼容，支持 YAML 格式直接配置 |
| `workflow.skills` | 保留 | 向后兼容，支持内联 Markdown 内容 |
| `workflow.limits` | 保留 | 工作流级别限制 |

**合并优先级**（从低到高）：
1. 磁盘全局配置（`global_config/`）
2. 数据库全局启用（`mcp_servers.enabled = 1`）
3. 工作流级配置（`workflow.mcpServers`）
4. 步骤级引用（`step.mcpServerIds`）

> **注意**：移除步骤的 `model` 字段，统一使用 Claude Code CLI 的默认模型配置。

## 四、数据模型定义

### 4.1 新增类型 (`src/main/store/models.ts`)

```typescript
/**
 * MCP 服务配置项
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface McpServer {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;           // 全局启用标记
  createdAt: string;
  updatedAt: string;
}

/**
 * Skill 配置项
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface Skill {
  id: string;
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
  enabled: boolean;           // 全局启用标记
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建 MCP 服务输入
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface CreateMcpServerInput {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

/**
 * 创建 Skill 输入
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface CreateSkillInput {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
  enabled?: boolean;
}
```

## 五、配置合并策略

### 5.1 合并流程

**四层配置合并**（叠加现有架构）：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            运行时配置合并                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐│
│  │ 磁盘全局配置  │   │ 数据库全局   │   │ 工作流配置   │   │ 步骤引用   ││
│  │ global_config│   │ enabled=1    │   │ mcpServers   │   │ mcpServerIds││
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬─────┘│
│         │                  │                  │                  │       │
│         └──────────────────┴──────────────────┴──────────────────┘       │
│                                     │                                     │
│                                     ▼                                     │
│                            ┌───────────────┐                              │
│                            │  取并集 (∪)   │                              │
│                            │  同名后者覆盖  │                              │
│                            └───────┬───────┘                              │
│                                    ▼                                      │
│                            ┌───────────────┐                              │
│                            │ 校验配置有效性 │                              │
│                            │ 过滤无效引用   │                              │
│                            └───────┬───────┘                              │
│                                    ▼                                      │
│                   ┌────────────────┴────────────────┐                     │
│                   ▼                                 ▼                     │
│            ┌─────────────┐                  ┌─────────────┐               │
│            │ MCP: 传入   │                  │ Skills: 写入│               │
│            │ SDK 参数    │                  │ 隔离目录    │               │
│            └─────────────┘                  └─────────────┘               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 合并优先级说明

| 配置来源 | 优先级 | 说明 |
|----------|--------|------|
| 磁盘全局 `global_config/mcp/` | 最低 | 基础配置，可被覆盖 |
| 数据库 `mcp_servers.enabled=1` | 低 | 全局启用的数据库配置 |
| 工作流 `workflow.mcpServers` | 中 | 工作流级别覆盖 |
| 步骤 `step.mcpServerIds` | 最高 | 步骤级别精确控制 |

**同名配置处理**：
- MCP: 后者覆盖前者（同 name 的配置）
- Skills: 后者覆盖前者（同 name 的配置）

### 5.3 合并代码逻辑 (`configMerger.ts`)

```typescript
/**
 * 合并步骤的 MCP 配置
 *
 * @param diskConfig 磁盘全局配置
 * @param workflowConfig 工作流配置
 * @param stepMcpIds 步骤引用的 MCP ID 列表
 * @returns 合并后的 MCP 配置
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
async function mergeStepMcpServers(
  diskConfig: Record<string, McpServerConfig>,
  workflowConfig: Record<string, McpServerConfig> | undefined,
  stepMcpIds: string[] = []
): Promise<Record<string, McpServerConfig>> {
  const result: Record<string, McpServerConfig> = {};

  // 第一层：磁盘全局配置
  Object.assign(result, diskConfig);

  // 第二层：数据库全局启用
  const enabledServers = await mcpServerRepository.findEnabled();
  for (const server of enabledServers) {
    result[server.name] = buildMcpServerConfig(server);
  }

  // 第三层：工作流配置（覆盖同名）
  if (workflowConfig) {
    Object.assign(result, workflowConfig);
  }

  // 第四层：步骤引用（覆盖同名）
  if (stepMcpIds.length > 0) {
    const stepServers = await mcpServerRepository.findByIds(stepMcpIds);
    for (const server of stepServers) {
      result[server.name] = buildMcpServerConfig(server);
    }
  }

  return result;
}

/**
 * 写入步骤的 Skills 到隔离目录
 *
 * @param workingDirectory 工作目录
 * @param executionId 执行 ID（用于目录隔离）
 * @param stepIndex 步骤索引
 * @param diskSkills 磁盘全局 Skills
 * @param workflowSkills 工作流 Skills
 * @param stepSkillIds 步骤引用的 Skill ID 列表
 * @returns 隔离目录路径
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
async function writeStepSkills(
  workingDirectory: string,
  executionId: string,
  stepIndex: number,
  diskSkills: Record<string, string>,
  workflowSkills: Record<string, string> | undefined,
  stepSkillIds: string[] = []
): Promise<string> {
  // 创建隔离目录
  const skillsDir = path.join(
    workingDirectory,
    '.claude',
    `skills-${executionId}-${stepIndex}`
  );
  await fs.mkdir(skillsDir, { recursive: true });

  // 合并 Skills（后者覆盖前者）
  const mergedSkills: Map<string, SkillContent> = new Map();

  // 第一层：磁盘全局 Skills
  for (const [name, content] of Object.entries(diskSkills)) {
    mergedSkills.set(name, { name, content });
  }

  // 第二层：数据库全局启用
  const enabledSkills = await skillRepository.findEnabled();
  for (const skill of enabledSkills) {
    mergedSkills.set(skill.name, skill);
  }

  // 第三层：工作流 Skills
  if (workflowSkills) {
    for (const [name, content] of Object.entries(workflowSkills)) {
      mergedSkills.set(name, { name, content });
    }
  }

  // 第四层：步骤引用
  if (stepSkillIds.length > 0) {
    const stepSkills = await skillRepository.findByIds(stepSkillIds);
    for (const skill of stepSkills) {
      mergedSkills.set(skill.name, skill);
    }
  }

  // 写入文件
  for (const skill of mergedSkills.values()) {
    await writeSkillFile(skillsDir, skill);
  }

  return skillsDir;
}

/**
 * 清理步骤执行的 Skills 隔离目录
 *
 * @param skillsDir 隔离目录路径
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
async function cleanupStepSkills(skillsDir: string): Promise<void> {
  try {
    await fs.rm(skillsDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('清理 Skills 目录失败', { skillsDir, error });
  }
}
```

## 六、SKILL.md 文件格式

根据 Claude Code Skills 标准规范，生成的 SKILL.md 格式如下：

```yaml
---
name: code-review
description: 代码审查技能，用于质量和安全审查
allowed-tools: Read, Grep, Glob
---

当审查代码时，请遵循以下步骤：

1. 检查代码风格一致性
2. 查找潜在的安全漏洞
3. 评估代码可读性
...
```

### YAML Frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 否 | 技能名称，默认使用目录名 |
| `description` | 推荐 | 技能描述，Claude 用于判断何时使用 |
| `allowed-tools` | 否 | 允许使用的工具列表 |

## 七、API 设计

### 7.1 IPC 接口

**MCP 服务管理：**

| 频道名 | 参数 | 返回值 |
|--------|------|--------|
| `mcp-servers:list` | - | `McpServer[]` |
| `mcp-servers:get` | `id` | `McpServer` |
| `mcp-servers:create` | `CreateMcpServerInput` | `McpServer` |
| `mcp-servers:update` | `id, UpdateMcpServerInput` | `McpServer` |
| `mcp-servers:delete` | `id` | `void` |
| `mcp-servers:set-enabled` | `id, enabled: boolean` | `McpServer` |

**Skills 管理：**

| 频道名 | 参数 | 返回值 |
|--------|------|--------|
| `skills:list` | - | `Skill[]` |
| `skills:get` | `id` | `Skill` |
| `skills:create` | `CreateSkillInput` | `Skill` |
| `skills:update` | `id, UpdateSkillInput` | `Skill` |
| `skills:delete` | `id` | `void` |
| `skills:set-enabled` | `id, enabled: boolean` | `Skill` |

> **简化说明**：移除原设计的 `config:get-enabled-mcp-ids` 等接口，改为在 `mcp-servers:list` 返回的数据中包含 `enabled` 字段，前端直接过滤即可。

## 八、前端 UI 设计

### 8.1 全局配置页面 (`GlobalConfig.vue`)

```
┌─────────────────────────────────────────────────────────────┐
│  全局配置                                                    │
├─────────────────────────────────────────────────────────────┤
│  [基本设置] [MCP 服务] [Skills]                              │
├─────────────────────────────────────────────────────────────┤
│  MCP 服务管理                                    [+ 新增]    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ☑ │ playwright   │ 浏览器自动化      │ [编辑] [删除]    ││
│  │ ☑ │ filesystem   │ 文件系统访问      │ [编辑] [删除]    ││
│  │ ☐ │ github       │ GitHub API       │ [编辑] [删除]    ││
│  └─────────────────────────────────────────────────────────┘│
│  * 勾选 = 全局启用，所有工作流步骤默认使用                     │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 工作流步骤配置 (`WorkflowEdit.vue`)

```
┌─────────────────────────────────────────────────────────────┐
│  步骤配置                                                    │
├─────────────────────────────────────────────────────────────┤
│  步骤名称: [代码审查                    ]                    │
│  Prompt:   [请审查以下代码...           ]                    │
│                                                              │
│  MCP 服务:                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 全局已启用: playwright, filesystem                       ││
│  │ 额外启用:   ☐ github                                     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Skills:                                                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 全局已启用: code-review                                  ││
│  │ 额外启用:   ☑ git-commit  ☐ test-writer                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

> **注意**：移除模型选择，统一使用 Claude Code CLI 的默认模型配置。

## 九、allowedTools 拼接逻辑

### 9.1 现有逻辑

当前 `executor.ts` 中的 `getValidMcpServers()` 会自动生成 MCP 的 allowedTools：

```typescript
// 现有逻辑（executor.ts 第 77-101 行）
function getValidMcpServers(mcpServers) {
  // 只做有效性校验，不生成 allowedTools
}

// 调用时手动添加
allowedTools: [...baseTools, ...mcpNames.map(n => `mcp__${n}__*`)]
```

### 9.2 新方案的 allowedTools 合并

**合并规则**：

```typescript
/**
 * 生成步骤的 allowedTools 列表
 *
 * @param baseAllowedTools 基础工具列表（来自全局/工作流配置）
 * @param mcpServers 合并后的 MCP 配置
 * @param hasSkills 是否有 Skills
 * @returns 完整的 allowedTools 列表
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
function buildAllowedTools(
  baseAllowedTools: string[] | undefined,
  mcpServers: Record<string, McpServerConfig>,
  hasSkills: boolean
): string[] {
  const result: string[] = [];

  // 1. 基础工具（来自配置）
  if (baseAllowedTools) {
    result.push(...baseAllowedTools);
  }

  // 2. MCP 工具（自动生成通配符）
  for (const serverName of Object.keys(mcpServers)) {
    const mcpPattern = `mcp__${serverName}__*`;
    if (!result.includes(mcpPattern)) {
      result.push(mcpPattern);
    }
  }

  // 3. Skill 工具（如果有 Skills）
  if (hasSkills && !result.includes('Skill')) {
    result.push('Skill');
  }

  return result;
}
```

**示例**：

| 输入 | 输出 allowedTools |
|------|-------------------|
| baseTools: `['Read', 'Write']`<br>mcpServers: `{playwright: ..., github: ...}`<br>hasSkills: true | `['Read', 'Write', 'mcp__playwright__*', 'mcp__github__*', 'Skill']` |

## 十、错误处理设计

### 10.1 MCP 服务启动失败

```typescript
/**
 * MCP 服务启动结果
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
interface McpServerStartResult {
  name: string;
  status: 'connected' | 'failed' | 'timeout';
  error?: string;
}

/**
 * 处理 MCP 服务启动失败
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
async function handleMcpServerFailures(
  servers: McpServerStartResult[],
  onEvent?: (event: StepEvent) => void
): Promise<void> {
  const failed = servers.filter(s => s.status !== 'connected');

  if (failed.length === 0) {
    return;
  }

  // 记录警告日志
  for (const server of failed) {
    logger.warn('MCP 服务启动失败', {
      name: server.name,
      status: server.status,
      error: server.error
    });
  }

  // 发送事件通知
  onEvent?.({
    type: 'mcp_server_warning',
    servers: failed
  });

  // 策略：警告但不阻断执行（MCP 是可选增强）
  // 如需阻断，可在此抛出异常
}
```

### 10.2 Skills 文件写入失败

```typescript
/**
 * Skills 写入失败处理
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
async function writeSkillFile(
  skillsDir: string,
  skill: Skill
): Promise<void> {
  const skillDir = path.join(skillsDir, skill.name);

  try {
    await fs.mkdir(skillDir, { recursive: true });

    const content = buildSkillContent(skill);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
  } catch (error) {
    // Skills 写入失败时记录错误并抛出
    // 因为 Skills 是步骤明确要求的，写入失败应阻断执行
    logger.error('Skill 文件写入失败', {
      skillName: skill.name,
      skillsDir,
      error: error instanceof Error ? error.message : String(error)
    });

    throw new SkillWriteError(
      `无法写入 Skill "${skill.name}": ${error instanceof Error ? error.message : String(error)}`,
      skill.name
    );
  }
}
```

### 10.3 悬挂引用处理

当 `step.mcpServerIds` 或 `step.skillIds` 引用的 ID 在数据库中不存在时：

```typescript
/**
 * 校验配置引用有效性
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
interface ReferenceValidationResult {
  valid: boolean;
  missingMcpIds: string[];
  missingSkillIds: string[];
}

async function validateConfigReferences(
  mcpServerIds: string[],
  skillIds: string[]
): Promise<ReferenceValidationResult> {
  const missingMcpIds: string[] = [];
  const missingSkillIds: string[] = [];

  // 检查 MCP 引用
  if (mcpServerIds.length > 0) {
    const foundServers = await mcpServerRepository.findByIds(mcpServerIds);
    const foundIds = new Set(foundServers.map(s => s.id));
    for (const id of mcpServerIds) {
      if (!foundIds.has(id)) {
        missingMcpIds.push(id);
      }
    }
  }

  // 检查 Skill 引用
  if (skillIds.length > 0) {
    const foundSkills = await skillRepository.findByIds(skillIds);
    const foundIds = new Set(foundSkills.map(s => s.id));
    for (const id of skillIds) {
      if (!foundIds.has(id)) {
        missingSkillIds.push(id);
      }
    }
  }

  return {
    valid: missingMcpIds.length === 0 && missingSkillIds.length === 0,
    missingMcpIds,
    missingSkillIds
  };
}

/**
 * 处理悬挂引用
 *
 * 策略：警告并跳过无效引用，不阻断执行
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
function handleDanglingReferences(
  result: ReferenceValidationResult,
  onEvent?: (event: StepEvent) => void
): void {
  if (result.valid) {
    return;
  }

  if (result.missingMcpIds.length > 0) {
    logger.warn('MCP 配置引用不存在', { ids: result.missingMcpIds });
    onEvent?.({
      type: 'config_warning',
      message: `MCP 配置不存在: ${result.missingMcpIds.join(', ')}`
    });
  }

  if (result.missingSkillIds.length > 0) {
    logger.warn('Skill 配置引用不存在', { ids: result.missingSkillIds });
    onEvent?.({
      type: 'config_warning',
      message: `Skill 配置不存在: ${result.missingSkillIds.join(', ')}`
    });
  }
}
```

### 10.4 错误处理策略汇总

| 错误类型 | 处理策略 | 原因 |
|----------|----------|------|
| MCP 服务启动失败 | 警告，继续执行 | MCP 是可选增强，不应阻断核心流程 |
| MCP 服务启动超时 | 警告，继续执行 | 同上 |
| Skills 目录创建失败 | 抛出异常，阻断执行 | 权限/磁盘问题，需人工介入 |
| Skills 文件写入失败 | 抛出异常，阻断执行 | 同上 |
| MCP ID 引用不存在 | 警告，跳过该引用 | 配置可能被删除，不影响其他配置 |
| Skill ID 引用不存在 | 警告，跳过该引用 | 同上 |

### 11.1 修改 executeStep 函数

```typescript
/**
 * 步骤执行上下文
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
interface StepExecutionContext {
  prompt: string;
  config: MergedConfig;
  executionId: string;
  stepIndex: number;
  mcpServers: Record<string, McpServerConfig>;
  skillsDir: string;
  hasSkills: boolean;
}

/**
 * 执行单个步骤
 *
 * @param context 步骤执行上下文
 * @param onEvent 事件回调
 * @returns 步骤执行结果
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export async function executeStep(
  context: StepExecutionContext,
  onEvent?: (event: StepEvent) => void
): Promise<StepResult> {
  const { prompt, config, mcpServers, skillsDir, hasSkills } = context;
  const workingDirectory = config.workingDirectory || process.cwd();

  try {
    // 构建 allowedTools
    const allowedTools = buildAllowedTools(
      config.allowedTools,
      mcpServers,
      hasSkills
    );

    // 构建 SDK 参数
    const queryOptions = {
      customSystemPrompt: config.systemPrompt,
      allowedTools,
      mcpServers: getValidMcpServers(mcpServers),
      settingSources: hasSkills ? ['local'] : [],
      skillsDir: hasSkills ? skillsDir : undefined,
      maxTurns: config.maxTurns || 30,
      permissionMode: 'acceptEdits',
      cwd: workingDirectory
    };

    // 执行
    const result = await executeQuery(prompt, queryOptions, onEvent);
    return result;
  } finally {
    // 清理 Skills 隔离目录
    if (hasSkills) {
      await cleanupStepSkills(skillsDir);
    }
  }
}
```

## 十二、文件改动清单

### 12.1 后端改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/store/models.ts` | 修改 | 新增 McpServer, Skill, WorkflowStep 扩展 |
| `src/main/store/database.ts` | 修改 | 新增 mcp_servers, skills 表（含 enabled 字段） |
| `src/main/store/repositories/mcpServerRepository.ts` | 新增 | MCP 数据库 CRUD + findEnabled() |
| `src/main/store/repositories/skillRepository.ts` | 新增 | Skill 数据库 CRUD + findEnabled() |
| `src/main/store/repositories/index.ts` | 修改 | 导出新 Repository |
| `src/main/core/configMerger.ts` | 修改 | 四层合并逻辑 + 隔离目录支持 |
| `src/main/core/executor.ts` | 修改 | 新上下文结构 + allowedTools 生成 + 错误处理 |
| `src/main/core/pipeline.ts` | 修改 | 调用新合并逻辑 + 传递 executionId |
| `src/main/core/errors.ts` | 新增 | SkillWriteError 等自定义错误 |
| `src/main/ipc/mcpServers.ts` | 新增 | MCP IPC 处理器 |
| `src/main/ipc/skills.ts` | 新增 | Skills IPC 处理器 |
| `src/main/ipc/index.ts` | 修改 | 注册新 IPC 处理器 |
| `src/preload/index.ts` | 修改 | 暴露新 IPC 频道 |

### 12.2 前端改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/types/workflow.ts` | 修改 | WorkflowStep 新增 mcpServerIds/skillIds |
| `src/renderer/types/config.ts` | 新增 | McpServer, Skill 前端类型定义 |
| `src/renderer/api/mcpServers.ts` | 新增 | MCP API 调用 |
| `src/renderer/api/skills.ts` | 新增 | Skills API 调用 |
| `src/renderer/api/workflows.ts` | 修改 | dataToCreateRequest/workflowToData 转换扩展 |
| `src/renderer/api/index.ts` | 修改 | 导出新 API |
| `src/renderer/stores/config.ts` | 新增 | MCP/Skills Pinia Store |
| `src/renderer/views/GlobalConfig.vue` | 修改 | 新增 MCP/Skills Tab |
| `src/renderer/views/WorkflowEdit.vue` | 修改 | 步骤中添加 MCP/Skills 选择器 |
| `src/renderer/components/McpServerForm.vue` | 新增 | MCP 配置表单组件 |
| `src/renderer/components/SkillForm.vue` | 新增 | Skill 配置表单组件 |
| `src/renderer/components/StepConfigSelector.vue` | 新增 | 步骤 MCP/Skills 选择组件 |

## 十三、前端类型定义与 API 转换

### 13.1 前端类型定义 (`src/renderer/types/`)

```typescript
// config.ts
/**
 * MCP 服务配置（前端）
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface McpServerData {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[] | null;
  env: Record<string, string> | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Skill 配置（前端）
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface SkillData {
  id: string;
  name: string;
  description: string | null;
  allowed_tools: string[] | null;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// workflow.ts（扩展）
/**
 * 工作流步骤（扩展）
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
export interface WorkflowStepData {
  name: string;
  prompt: string;
  max_turns?: number;
  validation?: StepValidationData;
  mcp_server_ids?: string[];    // 新增
  skill_ids?: string[];         // 新增
}
```

### 13.2 API 转换层修改 (`src/renderer/api/workflows.ts`)

```typescript
/**
 * 将前端 WorkflowStepData 转换为后端 WorkflowStep
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
function stepDataToRequest(step: WorkflowStepData): WorkflowStep {
  return {
    name: step.name,
    prompt: step.prompt,
    maxTurns: step.max_turns,
    validation: step.validation ? validationDataToRequest(step.validation) : undefined,
    mcpServerIds: step.mcp_server_ids,    // 新增：转换 snake_case → camelCase
    skillIds: step.skill_ids              // 新增：转换 snake_case → camelCase
  };
}

/**
 * 将后端 WorkflowStep 转换为前端 WorkflowStepData
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */
function stepToStepData(step: WorkflowStep): WorkflowStepData {
  return {
    name: step.name,
    prompt: step.prompt,
    max_turns: step.maxTurns,
    validation: step.validation ? validationToData(step.validation) : undefined,
    mcp_server_ids: step.mcpServerIds,    // 新增：转换 camelCase → snake_case
    skill_ids: step.skillIds              // 新增：转换 camelCase → snake_case
  };
}
```

## 十四、实现顺序

### 阶段一：数据层
1. 修改 `models.ts` 添加类型定义
2. 修改 `database.ts` 新增表结构（含 enabled 字段）
3. 新增 Repository 文件（含 findEnabled 方法）

### 阶段二：核心层
1. 新增 `errors.ts` 自定义错误类型
2. 修改 `configMerger.ts` 实现四层合并逻辑
3. 修改 `executor.ts` 支持新上下文结构 + 错误处理
4. 修改 `pipeline.ts` 调用合并逻辑 + 传递 executionId

### 阶段三：IPC 层
1. 新增 MCP/Skills IPC 处理器
2. 修改 `preload/index.ts` 暴露频道

### 阶段四：前端类型与 API
1. 新增 `types/config.ts` 类型定义
2. 修改 `types/workflow.ts` 步骤类型扩展
3. 新增 `api/mcpServers.ts` 和 `api/skills.ts`
4. 修改 `api/workflows.ts` 转换层

### 阶段五：前端 UI
1. 新增 Pinia Store
2. 修改 `GlobalConfig.vue` 新增 Tab
3. 新增表单组件
4. 修改 `WorkflowEdit.vue` 步骤配置

## 十五、参考资料

- [Claude Agent SDK TypeScript 开发指南](./claude-agent-sdk-typescript-guide.md)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)

---

## 附录 A：设计决策记录

### A.1 为什么保留现有 Workflow 字段？

**问题**：新方案是否应该完全替换 `workflow.mcpServers`/`workflow.skills` 字段？

**决策**：保留，采用叠加模式。

**原因**：
1. **向后兼容**：现有工作流数据无需迁移
2. **灵活性**：支持两种配置方式共存
3. **简洁性**：简单工作流可直接内联配置，无需先创建数据库记录

### A.2 为什么用 enabled 字段而非关联表？

**问题**：原方案用 `global_enabled_configs` 关联表，是否合理？

**决策**：简化为 `enabled` 布尔字段。

**原因**：
1. **查询简化**：`SELECT * FROM mcp_servers WHERE enabled = 1` vs `SELECT * FROM mcp_servers m JOIN global_enabled_configs g ON m.id = g.config_id WHERE g.config_type = 'mcp'`
2. **事务简化**：更新启用状态无需跨表操作
3. **IPC 设计**：原 IPC 已经分开（`get-enabled-mcp-ids`/`get-enabled-skill-ids`），关联表的通用性未被利用

### A.3 为什么用隔离目录而非清理重写？

**问题**：Skills 写入时如何处理并发？

**决策**：使用 `skills-<executionId>-<stepIndex>/` 隔离目录。

**原因**：
1. **并发安全**：多个执行互不干扰
2. **无需锁**：不需要文件锁或串行执行
3. **可追溯**：执行期间可查看当前使用的 Skills
4. **清理可控**：执行完成后清理，失败时保留用于调试

**备选方案**（未采用）：
- 串行执行：影响性能
- 文件锁：实现复杂，死锁风险
- 共享目录 + 原子替换：无法支持不同步骤使用不同 Skills

### A.4 MCP 启动失败为什么不阻断执行？

**问题**：MCP 服务启动失败时应该如何处理？

**决策**：警告但不阻断执行。

**原因**：
1. **MCP 是增强**：核心功能不依赖 MCP
2. **部分可用**：一个 MCP 失败不影响其他 MCP
3. **超时常见**：网络问题导致的超时是暂时性的
4. **用户感知**：通过事件通知用户，让用户决定是否中止

**例外**：如果工作流明确要求某 MCP 必须可用（未来可扩展 `required: true` 字段），则阻断执行。
