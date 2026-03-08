# Agent Workflow System — 任务拆解清单

> 基于 tech-spec.md 拆解 | 日期: 2026-03-08

---

## P0 — 核心可运行

### Task-01: 项目初始化
- [ ] 01.1 创建 backend/ 目录结构（src/api、src/core、src/scheduler、src/mcp、src/skills、src/store）
- [ ] 01.2 初始化 pyproject.toml，添加依赖（fastapi, uvicorn, sqlalchemy, aiosqlite, apscheduler, claude-code-sdk, structlog, pydantic）
- [ ] 01.3 创建 frontend/ 目录，`npm create vue@latest`，安装依赖（element-plus, axios, pinia, vue-router）
- [ ] 01.4 配置 vite.config.ts（proxy 到后端 8000 端口）
- [ ] 01.5 创建 global_config/ 目录结构（rules/、mcp/、skills/）+ 示例文件
- [ ] 01.6 创建 data/ 目录用于存放 SQLite 数据库文件

**验收**: 前后端都能启动，访问到空白页面 + 空 API

---

### Task-02: 数据库模型
- [ ] 02.1 实现 `src/store/database.py` — SQLite 连接管理（async engine + session factory）
- [ ] 02.2 实现 `src/store/models.py` — SQLAlchemy ORM 模型
  - Workflow 模型（id, name, description, enabled, schedule, inputs, steps, rules, mcp_servers, skills, limits, output, on_failure, created_at, updated_at）
  - Execution 模型（id, workflow_id, workflow_name, trigger_type, status, started_at, finished_at, current_step, total_steps, total_tokens, error_message）
  - StepExecution 模型（id, execution_id, step_index, step_name, status, started_at, finished_at, prompt_rendered, output_text, tokens_used, model_used, error_message）
- [ ] 02.3 实现自动建表逻辑（app startup 时 create_all）
- [ ] 02.4 编写 Pydantic schemas（CreateWorkflow, UpdateWorkflow, WorkflowResponse, ExecutionResponse, StepExecutionResponse）

**验收**: 应用启动后自动创建 SQLite 数据库和表

---

### Task-03: 工作流 CRUD API
- [ ] 03.1 实现 `GET /api/workflows` — 列表查询（返回所有工作流，含 enabled 状态）
- [ ] 03.2 实现 `POST /api/workflows` — 创建工作流（校验 name 唯一、steps 非空）
- [ ] 03.3 实现 `GET /api/workflows/{id}` — 工作流详情
- [ ] 03.4 实现 `PUT /api/workflows/{id}` — 更新工作流
- [ ] 03.5 实现 `DELETE /api/workflows/{id}` — 删除工作流（同时移除 cron job）
- [ ] 03.6 实现 `PATCH /api/workflows/{id}/toggle` — 启用/停用切换
  - enabled → disabled: 从 APScheduler 移除 cron
  - disabled → enabled: 如果有 schedule，注册到 APScheduler
- [ ] 03.7 实现 `POST /api/workflows/{id}/run` — 手动触发执行（异步，立即返回 execution_id）
- [ ] 03.8 注册路由到 FastAPI app

**验收**: 用 curl/httpie 测试全部 7 个接口正常工作

---

### Task-04: 单步执行器
- [ ] 04.1 实现 `src/core/executor.py` — `execute_step()` 函数
  - 接收: step_config, context, merged_config
  - 调用 `claude_code_sdk.query()` 流式获取结果
  - 收集 output_text 和 tokens_used
  - 返回 StepResult(output, tokens_used, model_used)
- [ ] 04.2 实现 token 计数（从 SDK 响应中提取 usage）
- [ ] 04.3 实现超时保护（asyncio.wait_for + max_duration）
- [ ] 04.4 实现 token 预算检查（累计超限时抛 TokenBudgetExceeded）
- [ ] 04.5 错误处理：SDK 调用异常 → 包装为 StepResult(failed=True, error=...)

**验收**: 直接调用 execute_step()，传入简单 prompt，能拿到 Claude 的回复

---

### Task-05: Pipeline 引擎
- [ ] 05.1 实现 `src/core/pipeline.py` — `execute_workflow()` 函数
  - 创建 Execution 记录（status=running）
  - for 循环遍历 steps
  - 每步创建 StepExecution 记录
  - 前步输出存入 context[f"step_{name}"]
  - 步骤失败时根据 on_failure 决定 stop/skip
  - 最终更新 Execution 状态和统计
- [ ] 05.2 步骤间上下文传递：构建 context dict，包含 inputs + 已完成步骤的 output
- [ ] 05.3 实时更新 Execution.current_step 字段
- [ ] 05.4 异步执行：手动触发时用 `asyncio.create_task()` 在后台执行

**验收**: 创建 2 步工作流 → 手动触发 → 步骤 2 能引用步骤 1 的输出

---

### Task-06: 两层配置合并
- [ ] 06.1 实现 `src/core/config_merger.py`
  - `merge_rules()`: 全局 system.md + 工作流 rules.system_prompt 拼接
  - `merge_tools()`: 全局 allowed_tools ∩ 工作流 allowed_tools（取交集）
  - `merge_mcp()`: 全局 MCP ∪ 工作流 MCP（取并集）
  - `merge_skills()`: 同名覆盖，不同名保留
- [ ] 06.2 实现全局配置加载（从 global_config/ 磁盘目录读取）
  - 读取 rules/system.md → 全局 system_prompt
  - 读取 mcp/servers.yaml → 全局 MCP 列表
  - 扫描 skills/*.md → 全局 skills 列表
- [ ] 06.3 Pipeline 执行前调用合并，生成 merged_config 传入 executor

**验收**: 全局设工具白名单 [bash,read,write] → 工作流设 [bash,read] → 实际可用 [bash,read]

---

### Task-07: 定时调度
- [ ] 07.1 实现 `src/scheduler/cron_manager.py`
  - `init_scheduler()`: 创建 APScheduler 实例
  - `register_workflow(workflow)`: 解析 cron → 添加 job
  - `unregister_workflow(workflow_id)`: 移除 job
  - `sync_all()`: 启动时扫描 DB，注册所有 enabled + has schedule 的工作流
- [ ] 07.2 cron job 回调：调用 `execute_workflow(workflow, trigger_type="scheduled")`
- [ ] 07.3 FastAPI lifespan 中启动 scheduler + 调用 sync_all()
- [ ] 07.4 工作流 CRUD 时同步更新 scheduler（创建/更新/删除/toggle 时）

**验收**: 创建 enabled 工作流 + cron 每分钟 → 观察自动执行 → 停用后不再执行

---

### Task-08: 执行历史 API
- [ ] 08.1 实现 `GET /api/executions` — 列表查询（支持 workflow_id 过滤、分页、排序）
- [ ] 08.2 实现 `GET /api/executions/{id}` — 详情查询（join step_executions）
- [ ] 08.3 注册路由

**验收**: 触发几次执行后 → API 返回正确的历史记录和步骤详情

---

### Task-09: 前端 — 工作流列表页
- [ ] 09.1 配置 Vue Router（路由表）
- [ ] 09.2 配置 Pinia store（workflow store + execution store）
- [ ] 09.3 封装 axios API 层（`api/workflows.ts`, `api/executions.ts`）
- [ ] 09.4 实现 `WorkflowList.vue`
  - 表格/卡片展示所有工作流
  - 列: 名称、描述、cron（人类可读）、上次执行状态 badge、启用/停用 Switch
  - 操作: 编辑、手动运行、删除
  - 右上角"新建工作流"按钮
- [ ] 09.5 启用/停用 Switch 调用 PATCH toggle API
- [ ] 09.6 手动运行按钮调用 POST run API，显示 loading + 跳转到执行详情

**验收**: 页面展示工作流列表，启用/停用 Switch 工作正常，能手动触发

---

### Task-10: 前端 — 工作流编辑页
- [ ] 10.1 实现 `WorkflowEdit.vue` — 分区表单
  - 区域 1: 基本信息（name, description）
  - 区域 2: 步骤列表（StepEditor 组件）
  - 区域 3: 调度配置（CronInput + enabled switch）
  - 区域 4: Rules 配置（system_prompt 文本域 + 工具白名单多选）
  - 区域 5: MCP 配置（JSON 编辑器或表单）
  - 区域 6: 成本控制（max_tokens, max_duration 输入）
  - 区域 7: 输出配置（file path, webhook url）
  - 保存按钮 → 调用 POST/PUT API
- [ ] 10.2 实现 `StepEditor.vue` — 步骤列表编辑器
  - 可增加/删除步骤
  - 可拖拽排序
  - 每步: name 输入框、prompt 文本域、tools 多选、model 下拉
- [ ] 10.3 实现 `CronInput.vue`
  - Cron 表达式输入框
  - 下方显示人类可读描述（"每工作日早上 9:00"）
- [ ] 10.4 编辑模式: 路由进入时加载工作流详情填充表单
- [ ] 10.5 新建模式: 空表单 + 合理默认值

**验收**: 能新建工作流（填写表单 → 保存 → 列表出现）+ 能编辑已有工作流

---

### Task-11: 前端 — 执行历史页
- [ ] 11.1 实现 `ExecutionList.vue`
  - 表格: 工作流名、触发方式 badge(manual/scheduled)、状态 badge(色码)、开始时间、耗时、token 用量
  - 支持按工作流名筛选
  - 点击行跳转详情
- [ ] 11.2 实现 `ExecutionDetail.vue`
  - 顶部汇总: 状态、总耗时、总 tokens、触发方式
  - 步骤时间线: 每步 name + 状态 badge + 耗时
  - 每步可展开: 显示 rendered prompt + output_text
  - 失败步骤高亮 + 显示 error_message

**验收**: 执行完成后 → 历史列表显示 → 点击进入详情 → 看到每步输出

---

## P1 — 实用增强

### Task-12: WebSocket 实时监控
- [ ] 12.1 实现 `src/api/ws.py` — WebSocket 端点 `/ws/executions/{id}`
  - 连接管理（多客户端订阅同一执行）
  - 消息类型: step_start, step_output, step_complete, execution_complete, error
- [ ] 12.2 Pipeline 引擎中接入 ws_broadcast（每步开始/输出/完成时推送）
- [ ] 12.3 实现 `LiveMonitor.vue`
  - 左侧: 正在运行的执行列表（轮询 GET /api/executions?status=running）
  - 右侧: 选中后通过 WebSocket 实时显示日志流
- [ ] 12.4 实现 `LogViewer.vue` — WebSocket 日志流组件
  - 自动滚动到底部
  - 支持暂停滚动（用户向上翻阅时）
  - 步骤分隔标记

**验收**: 触发执行 → 监控页实时看到日志流 → 步骤切换时有分隔

---

### Task-13: 模板变量引擎
- [ ] 13.1 实现 `src/core/template.py`
  - 内置变量: `{{today}}`, `{{yesterday}}`, `{{now}}`, `{{date}}`, `{{time}}`
  - 输入变量: `{{inputs.xxx}}`
  - 步骤引用: `{{steps.step_name.output}}`
  - 使用 Jinja2 或简单正则替换
- [ ] 13.2 Pipeline 执行时，每步 prompt 先渲染模板再传给 executor
- [ ] 13.3 工作流 inputs 的 default 值也支持模板变量

**验收**: 配置 prompt 含 `{{today}}` → 执行时渲染为实际日期

---

### Task-14: MCP 服务集成
- [ ] 14.1 实现 `src/mcp/manager.py`
  - 解析 MCP 配置（command, args, env）
  - 转换为 Agent SDK 的 mcp_servers 格式
  - 按工作流隔离连接
- [ ] 14.2 全局 MCP 从 global_config/mcp/servers.yaml 加载
- [ ] 14.3 工作流级 MCP 从 DB workflows.mcp_servers 加载
- [ ] 14.4 config_merger 中合并 MCP（取并集）

**验收**: 全局配 1 个 MCP + 工作流配 1 个 → 执行时两个都可用

---

### Task-15: Skills 加载
- [ ] 15.1 实现 `src/skills/loader.py`
  - 扫描 global_config/skills/*.md
  - 解析 SKILL.md 格式（YAML frontmatter + body）
  - 转换为 Agent SDK 可用的 skill 配置
- [ ] 15.2 工作流级 skills 从 DB 加载
- [ ] 15.3 合并逻辑: 同名覆盖，不同名保留

**验收**: 全局 skill + 工作流同名 skill → 工作流级生效

---

### Task-16: Webhook 通知
- [ ] 16.1 实现输出处理模块
  - 结果写文件（根据 output.file 配置）
  - Webhook POST 请求（根据 output.notify 配置）
  - 发送: workflow_name, status, summary, duration, tokens
- [ ] 16.2 Pipeline 执行完成后调用输出处理

**验收**: 配置 webhook url → 执行完成后收到 POST 请求

---

### Task-17: 全局配置管理页
- [ ] 17.1 实现 `GET/PUT /api/config` — 全局配置 API
  - 读取/更新 global_config/ 目录下的文件
- [ ] 17.2 实现 `GlobalConfig.vue`
  - Rules 编辑器（Markdown 文本域，编辑 system.md）
  - MCP 服务管理（列表 + 增删改）
  - Skills 管理（列表展示 + 上传新 skill）
  - 默认值设置（默认模型、默认 token 预算）

**验收**: 页面修改全局 system prompt → 新执行的工作流使用更新后的 prompt

---

## P2 — 高级功能

### Task-18: 步骤失败策略
- [ ] 18.1 Pipeline 引擎支持 on_failure: stop / skip / retry
- [ ] 18.2 retry: 指数退避重试，max_retries 次
- [ ] 18.3 skip: 标记步骤为 skipped，继续下一步

### Task-19: 多模型支持
- [ ] 19.1 步骤级 model 字段传入 Agent SDK
- [ ] 19.2 前端步骤编辑器增加模型下拉选择

### Task-20: 工作流导入/导出
- [ ] 20.1 `GET /api/workflows/{id}/export` — 导出为 JSON
- [ ] 20.2 `POST /api/workflows/import` — 从 JSON 导入
- [ ] 20.3 前端增加导入/导出按钮

### Task-21: 执行统计 Dashboard
- [ ] 21.1 统计 API: 按日/周汇总 token 用量、执行次数、成功率
- [ ] 21.2 前端图表: 趋势折线图（echarts / chart.js）

### Task-22: 条件步骤
- [ ] 22.1 步骤增加 `when` 字段（表达式）
- [ ] 22.2 Pipeline 引擎在执行步骤前评估 when 条件
- [ ] 22.3 条件不满足时跳过步骤

---

## 依赖关系

```
Task-01 (项目初始化)
  ├── Task-02 (数据库模型)
  │     ├── Task-03 (工作流 CRUD API)
  │     │     ├── Task-09 (前端-列表页)
  │     │     └── Task-10 (前端-编辑页)
  │     └── Task-08 (执行历史 API)
  │           └── Task-11 (前端-历史页)
  ├── Task-04 (单步执行器)
  │     └── Task-05 (Pipeline 引擎)
  │           ├── Task-07 (定时调度)
  │           ├── Task-12 (WebSocket 监控)
  │           └── Task-16 (Webhook 通知)
  └── Task-06 (配置合并)
        ├── Task-14 (MCP 集成)
        └── Task-15 (Skills 加载)

独立可并行:
  Task-13 (模板引擎) — 仅依赖 Task-05
  Task-17 (全局配置页) — 仅依赖 Task-06
```

## 建议执行顺序

**第一批（后端骨架）**: Task-01 → Task-02 → Task-03 + Task-04 并行
**第二批（核心引擎）**: Task-05 → Task-06 → Task-07
**第三批（前端）**: Task-09 → Task-10 → Task-11（可与第二批并行）
**第四批（增强）**: Task-08 → Task-12 + Task-13 + Task-14 + Task-15 并行
**第五批（收尾）**: Task-16 → Task-17
**第六批（高级）**: Task-18 ~ Task-22 按需
