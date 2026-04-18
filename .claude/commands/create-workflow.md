# 通过 SQLite 直接写表创建工作流

你是 agent-workflow 平台的数据库操作助手。用户需要通过直接写入 SQLite 数据库来创建工作流，而不是通过 UI。

## 使用参数

$ARGUMENTS

## 数据库位置

根据操作系统：
- **macOS**: `~/Library/Application Support/agent-workflow/agent_workflow.db`
- **Linux**: `~/.config/agent-workflow/agent_workflow.db`
- **Windows**: `%APPDATA%/agent-workflow/agent_workflow.db`

用以下命令确定实际路径：
```bash
# macOS/Linux
find ~/Library/Application\ Support/agent-workflow ~/.config/agent-workflow -name "agent_workflow.db" 2>/dev/null
```

## workflows 表结构

```sql
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,                              -- UUID v4
  name TEXT NOT NULL,                               -- 工作流名称
  enabled INTEGER DEFAULT 1,                        -- 0=禁用, 1=启用
  schedule TEXT,                                    -- cron 表达式, 如 '0 9 * * 1-5'
  inputs TEXT,                                      -- JSON: WorkflowInput[]
  steps TEXT NOT NULL,                              -- JSON: WorkflowStep[] (至少一个)
  rules TEXT,                                       -- 系统提示词(markdown 纯文本，非 JSON)
  skills TEXT,                                      -- JSON: Record<string, string> (skillId → skillName)
  limits TEXT,                                      -- JSON: { maxTurns?: number, timeoutMs?: number }
  output TEXT,                                      -- JSON: { file?: {...}, webhook?: {...} }
  working_directory TEXT,                            -- Agent 执行的工作目录
  on_failure TEXT DEFAULT 'stop',                   -- 'stop' | 'skip' | 'retry'
  retry_config TEXT,                                -- JSON: { maxAttempts?: number, delayMs?: number }
  created_at TEXT DEFAULT (datetime('now')),         -- ISO 8601
  updated_at TEXT DEFAULT (datetime('now'))          -- ISO 8601
);
```

## steps 字段 JSON 格式

steps 是一个 JSON 数组，每个元素是以下四种步骤类型之一：

### 1. Agent 步骤（默认类型）

调用 Claude Agent 执行提示词。

```json
{
  "type": "agent",
  "name": "步骤名称（必须唯一）",
  "prompt": "发送给 Claude 的提示词，支持模板变量",
  "model": "覆盖全局默认模型（可选，不填则使用 global_config/settings.yaml 中的 default_model）",
  "maxTurns": 999,
  "onFailure": "stop",
  "retryConfig": { "maxAttempts": 3, "delayMs": 1000 },
  "validation": {
    "prompt": "LLM 验证提示词（可选）",
    "rules": [
      { "type": "contains", "value": "期望包含的文本" },
      { "type": "regex", "pattern": "正则表达式" }
    ]
  },
  "skillIds": ["skill-uuid-1"]
}
```

最小形式（type 可省略，默认 agent）：
```json
{ "name": "唯一步骤名", "prompt": "提示词内容" }
```

### 2. ForEach 循环步骤

遍历数组，对每个元素执行 Agent 调用。

```json
{
  "type": "forEach",
  "name": "步骤名称",
  "prompt": "处理 {{item}} 的提示词",
  "iterateOver": "{{steps.数据步骤名.output}}",
  "itemVariable": "item"
}
```

### 3. Data Split 数据拆分步骤

将数据拆分为数组，供下游 forEach 消费。三种模式：

```json
// static 模式 — 固定 JSON 数组
{ "type": "dataSplit", "name": "步骤名", "mode": "static", "staticData": "[\"a\",\"b\",\"c\"]" }

// template 模式 — 引用上游步骤输出
{ "type": "dataSplit", "name": "步骤名", "mode": "template", "templateExpr": "{{steps.xxx.output}}" }

// ai 模式 — 由 Claude 拆分内容
{ "type": "dataSplit", "name": "步骤名", "mode": "ai", "aiInput": "待拆分内容", "aiPrompt": "可选的拆分指令" }
```

### 4. SubWorkflow 子工作流步骤

调用另一个工作流作为子步骤。

```json
{
  "type": "subWorkflow",
  "name": "步骤名称",
  "workflowId": "目标工作流的UUID",
  "inputMapping": { "子工作流输入名": "{{steps.xxx.output}}" },
  "forEach": { "iterateOver": "{{steps.xxx.output}}", "itemVariable": "item" }
}
```

## inputs 字段 JSON 格式

```json
[
  { "name": "repo_url", "type": "string", "required": true, "description": "Git 仓库地址" },
  { "name": "max_files", "type": "number", "required": false, "default": 10 },
  { "name": "dry_run", "type": "boolean", "required": false, "default": false }
]
```

type 仅支持: `string` | `number` | `boolean`

## output 字段 JSON 格式

```json
{
  "file": { "path": "/tmp/result.md", "format": "markdown" },
  "webhook": { "url": "https://hooks.example.com/notify", "method": "POST", "headers": { "Authorization": "Bearer xxx" }, "timeoutMs": 5000 }
}
```

format 仅支持: `text` | `json` | `markdown`

## 模板变量

在 prompt 中可使用以下模板变量：
- `{{inputs.xxx}}` — 引用工作流输入参数
- `{{steps.<步骤名>.output}}` — 引用前序步骤的输出
- `{{today}}` — 当天日期 YYYY-MM-DD
- `{{yesterday}}` — 昨天日期
- `{{now}}` — 当前时间 ISO 8601

## 操作流程

1. **确定数据库路径** — 执行上述查找命令
2. **生成 UUID** — 用 `uuidgen` 或 `python3 -c "import uuid; print(uuid.uuid4())"`
3. **构造 INSERT 语句** — 根据用户需求组装 SQL
4. **执行写入** — 用 `sqlite3` 命令行工具执行
5. **验证结果** — 查询确认写入成功

## INSERT 模板

```sql
INSERT INTO workflows (id, name, enabled, schedule, inputs, steps, rules, skills, limits, output, working_directory, on_failure, retry_config, created_at, updated_at)
VALUES (
  '<uuid>',
  '<工作流名称>',
  1,
  NULL,
  NULL,
  '<steps JSON 数组>',
  NULL,
  NULL,
  NULL,
  NULL,
  '<工作目录或 NULL>',
  'stop',
  NULL,
  datetime('now'),
  datetime('now')
);
```

## 注意事项

- `id` 必须是合法的 UUID v4
- `steps` 中每个步骤的 `name` 必须在工作流内唯一
- `steps` 至少包含一个步骤
- Agent 步骤的 `prompt` 不能为空
- JSON 字符串中的单引号需要转义为 `''`（SQLite 语法）
- 写入后如果 Electron 应用正在运行，需要刷新页面才能看到新工作流
- 如果设置了 `schedule`，需要重启应用或触发 cron 同步才能生效
- `skills` 字段的 key 必须是 skills 表中已存在的 skill ID
