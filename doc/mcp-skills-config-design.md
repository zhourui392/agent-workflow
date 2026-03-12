# MCP 和 Skills 配置列表管理技术方案

> 版本: 1.0
> 日期: 2026/03/12
> 作者: zhourui(V33215020)

## 一、需求概述

实现 MCP 和 Skills 的配置列表管理功能：

| 需求项 | 说明 |
|--------|------|
| 配置列表管理 | 独立管理 MCP 和 Skills 配置项，支持增删改查 |
| 全局配置选择 | 在全局配置中选择默认启用的 MCP/Skills |
| 步骤级选择 | 每个工作流步骤可独立选择使用的 MCP/Skills |
| 运行时加载 | 执行时合并全局 + 步骤选择的配置 |

## 二、技术方案

### 2.1 MCP 与 Skills 的 SDK 调用差异

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

### 2.2 存储方案

采用数据库存储配置，Skills 在执行时动态写入工作目录：

| 配置类型 | 存储方式 | 运行时处理 |
|----------|----------|------------|
| MCP | 数据库 `mcp_servers` 表 | 直接传入 SDK `mcpServers` 参数 |
| Skills | 数据库 `skills` 表 | 动态写入工作目录 `.claude/skills/` |
| 全局启用 | 数据库 `global_enabled_configs` 表 | 合并全局 + 步骤选择 |

### 2.3 Skills 动态写入流程

```
步骤执行前:
  1. 清理工作目录 <cwd>/.claude/skills/
  2. 根据步骤配置的 skillIds，从数据库读取 Skill 内容
  3. 写入 SKILL.md 文件到 <cwd>/.claude/skills/<name>/SKILL.md

步骤执行:
  4. SDK 配置 settingSources: ["project"]
  5. SDK 自动发现并加载工作目录下的 Skills

步骤执行后:
  6. 保留 skills 文件（下次执行前会清理）
```

## 三、数据库设计

### 3.1 新增表结构

```sql
-- MCP 服务配置表
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,          -- 服务名称（唯一，用于 SDK）
  description TEXT,                    -- 描述说明
  command TEXT NOT NULL,               -- 执行命令
  args TEXT,                           -- JSON: string[]
  env TEXT,                            -- JSON: Record<string, string>
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 全局启用配置表
CREATE TABLE global_enabled_configs (
  id TEXT PRIMARY KEY,
  config_type TEXT NOT NULL,          -- 'mcp' | 'skill'
  config_id TEXT NOT NULL,            -- 关联的 mcp_servers.id 或 skills.id
  created_at TEXT NOT NULL,
  UNIQUE(config_type, config_id)
);
```

### 3.2 现有表修改

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

> **注意**：移除 `model` 字段，统一使用 Claude Code CLI 的默认模型配置。

## 四、数据模型定义

### 4.1 新增类型 (`src/main/store/models.ts`)

```typescript
/**
 * MCP 服务配置项
 */
interface McpServer {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Skill 配置项
 */
interface Skill {
  id: string;
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建 MCP 服务输入
 */
interface CreateMcpServerInput {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * 创建 Skill 输入
 */
interface CreateSkillInput {
  name: string;
  description?: string;
  allowedTools?: string[];
  content: string;
}
```

## 五、配置合并策略

### 5.1 合并流程

```
┌─────────────────────────────────────────────────────────────┐
│                     运行时配置合并                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  全局启用配置                  步骤配置                       │
│  ┌──────────────┐             ┌──────────────┐              │
│  │enabledMcpIds │             │ mcpServerIds │              │
│  │enabledSkillIds│            │ skillIds     │              │
│  └──────┬───────┘             └──────┬───────┘              │
│         │                            │                       │
│         └────────────┬───────────────┘                       │
│                      ▼                                       │
│              ┌───────────────┐                               │
│              │  取并集 (∪)   │                               │
│              └───────┬───────┘                               │
│                      ▼                                       │
│              ┌───────────────┐                               │
│              │ 从数据库查找  │                               │
│              │ 实际配置内容  │                               │
│              └───────┬───────┘                               │
│                      ▼                                       │
│         ┌────────────┴────────────┐                          │
│         ▼                         ▼                          │
│  ┌─────────────┐          ┌─────────────┐                    │
│  │ MCP: 传入   │          │ Skills: 写入│                    │
│  │ SDK 参数    │          │ 工作目录    │                    │
│  └─────────────┘          └─────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 合并代码逻辑 (`configMerger.ts`)

```typescript
/**
 * 获取步骤的合并后 MCP 配置
 */
async function getStepMcpServers(
  globalEnabledIds: string[],
  stepMcpIds: string[] = []
): Promise<Record<string, McpServerConfig>> {
  // 1. 合并 ID 列表 (全局启用 ∪ 步骤选择)
  const mergedIds = [...new Set([...globalEnabledIds, ...stepMcpIds])];

  // 2. 从数据库查询配置
  const mcpServers = await mcpServerRepository.findByIds(mergedIds);

  // 3. 转换为 SDK 格式
  const result: Record<string, McpServerConfig> = {};
  for (const server of mcpServers) {
    result[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env
    };
  }
  return result;
}

/**
 * 写入步骤的 Skills 到工作目录
 */
async function writeStepSkills(
  workingDirectory: string,
  globalEnabledIds: string[],
  stepSkillIds: string[] = []
): Promise<void> {
  // 1. 合并 ID 列表
  const mergedIds = [...new Set([...globalEnabledIds, ...stepSkillIds])];

  // 2. 清理现有 skills 目录
  const skillsDir = path.join(workingDirectory, '.claude', 'skills');
  await fs.rm(skillsDir, { recursive: true, force: true });

  // 3. 从数据库查询并写入
  const skills = await skillRepository.findByIds(mergedIds);
  for (const skill of skills) {
    const skillDir = path.join(skillsDir, skill.name);
    await fs.mkdir(skillDir, { recursive: true });

    // 生成 SKILL.md 内容
    const frontmatter = generateFrontmatter(skill);
    const content = `---\n${frontmatter}---\n\n${skill.content}`;

    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
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

**Skills 管理：**

| 频道名 | 参数 | 返回值 |
|--------|------|--------|
| `skills:list` | - | `Skill[]` |
| `skills:get` | `id` | `Skill` |
| `skills:create` | `CreateSkillInput` | `Skill` |
| `skills:update` | `id, UpdateSkillInput` | `Skill` |
| `skills:delete` | `id` | `void` |

**全局启用配置：**

| 频道名 | 参数 | 返回值 |
|--------|------|--------|
| `config:get-enabled-mcp-ids` | - | `string[]` |
| `config:set-enabled-mcp-ids` | `ids: string[]` | `void` |
| `config:get-enabled-skill-ids` | - | `string[]` |
| `config:set-enabled-skill-ids` | `ids: string[]` | `void` |

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

## 九、执行器修改 (`executor.ts`)

### 9.1 修改 executeStep 函数

```typescript
export async function executeStep(
  prompt: string,
  config: MergedConfig,
  mcpServers: Record<string, McpServerConfig>,  // 新增
  skills: Skill[],                               // 新增
  onEvent?: (event: StepEvent) => void
): Promise<StepResult> {
  const workingDirectory = config.workingDirectory || process.cwd();

  // 1. 写入 Skills 到工作目录
  await writeSkillsToWorkspace(workingDirectory, skills);

  // 2. 构建 SDK 参数（不指定 model，使用 CLI 默认配置）
  const queryOptions = {
    customSystemPrompt: config.systemPrompt,
    allowedTools: [...(config.allowedTools || []), 'Skill'],
    mcpServers: mcpServers,
    settingSources: ['project'],  // 启用项目级 Skills
    maxTurns: config.maxTurns || 30,
    permissionMode: 'acceptEdits',
    cwd: workingDirectory
    // 注意：不设置 model 参数，使用 Claude Code CLI 默认模型
  };

  // 3. 执行
  // ...
}

async function writeSkillsToWorkspace(
  workingDirectory: string,
  skills: Skill[]
): Promise<void> {
  const skillsDir = path.join(workingDirectory, '.claude', 'skills');

  // 清理现有目录
  await fs.rm(skillsDir, { recursive: true, force: true });

  // 写入每个 skill
  for (const skill of skills) {
    const skillDir = path.join(skillsDir, skill.name);
    await fs.mkdir(skillDir, { recursive: true });

    const frontmatter = [
      `name: ${skill.name}`,
      skill.description ? `description: ${skill.description}` : '',
      skill.allowedTools?.length ? `allowed-tools: ${skill.allowedTools.join(', ')}` : ''
    ].filter(Boolean).join('\n');

    const content = `---\n${frontmatter}\n---\n\n${skill.content}`;
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
  }
}
```

## 十、文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/store/models.ts` | 修改 | 新增 McpServer, Skill 类型定义 |
| `src/main/store/database.ts` | 修改 | 新增 mcp_servers, skills, global_enabled_configs 表 |
| `src/main/store/repositories/mcpServerRepository.ts` | 新增 | MCP 数据库 CRUD |
| `src/main/store/repositories/skillRepository.ts` | 新增 | Skill 数据库 CRUD |
| `src/main/store/repositories/globalConfigRepository.ts` | 新增 | 全局启用配置管理 |
| `src/main/store/repositories/index.ts` | 修改 | 导出新 Repository |
| `src/main/core/configMerger.ts` | 修改 | 实现合并逻辑 |
| `src/main/core/executor.ts` | 修改 | 支持 MCP/Skills 参数，写入 Skills 文件 |
| `src/main/core/pipeline.ts` | 修改 | 调用合并逻辑，传递 MCP/Skills |
| `src/main/ipc/mcpServers.ts` | 新增 | MCP IPC 处理器 |
| `src/main/ipc/skills.ts` | 新增 | Skills IPC 处理器 |
| `src/main/ipc/index.ts` | 修改 | 注册新 IPC 处理器 |
| `src/preload/index.ts` | 修改 | 暴露新 IPC 频道 |
| `src/renderer/api/mcpServers.ts` | 新增 | MCP API 调用 |
| `src/renderer/api/skills.ts` | 新增 | Skills API 调用 |
| `src/renderer/api/index.ts` | 修改 | 导出新 API |
| `src/renderer/views/GlobalConfig.vue` | 修改 | 新增 MCP/Skills Tab |
| `src/renderer/views/WorkflowEdit.vue` | 修改 | 步骤中添加 MCP/Skills 选择器 |

## 十一、实现顺序

1. **数据层**
   - 修改 `models.ts` 添加类型定义
   - 修改 `database.ts` 新增表结构
   - 新增 Repository 文件

2. **核心层**
   - 修改 `configMerger.ts` 实现合并逻辑
   - 修改 `executor.ts` 支持 Skills 写入
   - 修改 `pipeline.ts` 调用合并逻辑

3. **IPC 层**
   - 新增 IPC 处理器
   - 修改 `preload/index.ts`

4. **前端**
   - 新增 API 调用
   - 修改 `GlobalConfig.vue`
   - 修改 `WorkflowEdit.vue`

## 十二、参考资料

- [Claude Agent SDK TypeScript 开发指南](./claude-agent-sdk-typescript-guide.md)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
