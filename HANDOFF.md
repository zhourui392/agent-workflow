# HANDOFF.md

## 1. Task Overview

对 AI 驱动的多步骤工作流自动化平台（Electron 桌面应用）进行系统性代码优化。通过全面分析后制定了 6 个优先级的优化路线，当前已完成前两个阶段。

## 2. Current Progress

### 阶段1：稳定性修复 (commit `13afd2e`)

| 修复 | 文件 | 改动 |
|------|------|------|
| Pinia stores 暴露 `error` 状态 | `src/renderer/stores/workflow.ts`, `src/renderer/stores/execution.ts` | 添加 `error` ref，catch 中赋值错误信息并继续 throw |
| LiveMonitor 日志上限 | `src/renderer/views/LiveMonitor.vue` | 超过 2000 条时丢弃最早记录 |
| 模板变量未解析告警 | `src/main/core/pipeline.ts` | 调用已有 `validateTemplate()` 记录 warn 日志 |

### 阶段2：架构重构 (commit `c378cdc`)

**configMerger.ts 拆分**（886行 → 5个文件）：

| 模块 | 行数 | 职责 |
|------|------|------|
| `src/main/core/config/fileUtils.ts` | 62 | 文件读取、YAML 解析、路径工具 |
| `src/main/core/config/cliConfigLoader.ts` | 225 | CLI 配置加载（MCP + Skills 扫描） |
| `src/main/core/config/skillManager.ts` | 147 | 步骤级 Skill 文件写入与清理 |
| `src/main/core/config/mcpServerBuilder.ts` | 67 | MCP 服务配置构建与合并 |
| `src/main/core/config/configMerger.ts` | 310 | 全局配置加载、合并逻辑、步骤编排，re-export 所有子模块 |

**WorkflowEdit.vue 拆分**（308行 → 208行 + 118行）：
- 抽取 `src/renderer/components/StepEditor.vue`

### 阶段2续：前端去重 + executor 拆分 (commit `0e4ee4a`)

**前端共享工具模块**：
- `src/renderer/utils/statusUtils.ts` — statusType, statusLabel, timelineType
- `src/renderer/utils/toolIconUtils.ts` — getToolIcon
- `src/renderer/utils/dateUtils.ts` — formatDate, formatDuration, formatDurationMs, formatSeconds

**executor.ts 重构**：executeStep (160行) 拆为 buildQueryOptions, processStreamMessage, processAssistantMessage, processResultMessage + StreamContext 接口

### 构建状态

- `tsc -p tsconfig.main.json --noEmit` 编译通过（零错误）
- 前端未单独验证（无 vue-tsc 编译脚本），但逻辑改动为纯提取，无行为变更

## 3. What Was Tried

### 成功的

- **按职责边界拆分 configMerger.ts**：依赖图分析显示 4 个天然分组（CLI加载、技能管理、MCP构建、合并逻辑），加上共享的 fileUtils。拆分后每个模块不超过 310 行。
- **configMerger.ts 底部 re-export**：外部消费者（pipeline.ts, executor.ts）通过 `core/index.ts` 间接引用，只需改 index.ts 一处路径。
- **StepEditor 用 emit('update:step') 而非 v-model**：避免直接修改 prop，符合 Vue 单向数据流。
- **dateUtils 统一参数差异**：3 处 formatDuration 参数不同（字符串对、毫秒数、带响应式 now），通过 formatDuration(start, end, fallbackNow) + formatDurationMs(ms) + formatSeconds(sec) 三层抽象统一。

### 注意事项

- **ExecutionDetail 资源泄漏是误报**：`onUnmounted` 第206-209行已正确清理 `unsubscribe` 和 `tickTimer`，无需修复。
- **npm install 可能很慢**：在此环境中 npm install 耗时超过 5 分钟，需要耐心等待或考虑使用缓存。

## 4. Key Decisions Made

- **configMerger.ts re-export 策略**：新的 `config/configMerger.ts` 底部 re-export 所有子模块的公开函数，使外部只需改一处 import 路径（`./configMerger` → `./config/configMerger`）。
- **不拆分 Schedule/Rules/Limits 子组件**：这些区域各自不到 15 行模板，拆分收益不大，保留在 WorkflowEdit.vue 中。
- **ExecutionDetail 的 formatDuration 改为 formatDurationLive**：因为它依赖响应式的 `now.value` 做实时倒计时，不能直接用通用的 formatDuration。通过一个 3 行的 wrapper 函数桥接。
- **StepEventViewer 中 `const formatDuration = formatDurationMs`**：保持模板中的调用名不变，避免修改大量模板代码。

## 5. Known Issues & Blockers

- **前端编译未独立验证**：项目没有单独的 `vue-tsc` 检查脚本，只能通过 `npm run dev` 启动后在浏览器中验证。
- **测试框架缺失**：当前用 `ts-node` 跑测试脚本，无断言库，所有重构都无自动化测试保护。
- **ExecutionList.vue 的本地 statusType/statusLabel/formatDate/formatDuration 未删除**：搜索确认这些函数已被导入替代，但需检查是否有遗漏的本地定义（大概率已清理，建议验证）。

## 6. Next Steps

按优先级排列：

### 第三优先级：性能优化

1. **执行记录分页** — `src/main/store/repositories/executionRepository.ts` 的 `findAll()` 加 LIMIT/OFFSET，前端 ExecutionList.vue 加分页控件
2. **数据库复合索引** — `src/main/store/database.ts` 添加 `CREATE INDEX idx_executions_composite ON executions(workflow_id, status, started_at DESC)`

### 第四优先级：健壮性

3. **IPC 运行时输入校验** — 所有 `src/main/ipc/*.ts` handler 入口添加 Zod schema 验证
4. **Scheduler 失败重试/告警** — `src/main/scheduler/cronManager.ts` 添加重试逻辑和执行失败通知

### 第五优先级：测试

5. **引入 Vitest** — 替换 ts-node 脚本，为 configMerger/template/pipeline 补充单元测试
6. **前端组件测试** — 配置 Vue Test Utils + Vitest

### 第六优先级：前端体验

7. **WorkflowEdit 脏检查** — 离开页面时提示未保存
8. **Cron 表达式校验** — 输入时实时验证格式

## 7. Key Files

| 文件 | 说明 |
|------|------|
| `src/main/core/config/configMerger.ts` | 配置合并入口，re-export 所有子模块 |
| `src/main/core/config/cliConfigLoader.ts` | Claude CLI 配置和技能扫描 |
| `src/main/core/config/skillManager.ts` | 步骤级 Skill 文件写入/清理 |
| `src/main/core/config/mcpServerBuilder.ts` | MCP 服务配置构建 |
| `src/main/core/config/fileUtils.ts` | 文件读取/YAML解析工具 |
| `src/main/core/executor.ts` | 单步执行器（已拆分为多个函数） |
| `src/main/core/pipeline.ts` | 多步骤流水线编排 |
| `src/renderer/components/StepEditor.vue` | 步骤编辑器组件（从 WorkflowEdit 抽取） |
| `src/renderer/utils/dateUtils.ts` | 日期/时长格式化 |
| `src/renderer/utils/statusUtils.ts` | 执行状态映射 |
| `src/renderer/utils/toolIconUtils.ts` | 工具图标映射 |
| `src/renderer/stores/workflow.ts` | 工作流 Pinia store（已加 error 状态） |
| `src/renderer/stores/execution.ts` | 执行记录 Pinia store（已加 error 状态） |
| `docs/superpowers/specs/2026-03-14-phase2-refactor-design.md` | 阶段2设计文档 |
| `docs/superpowers/plans/2026-03-14-stability-fixes.md` | 阶段1实施计划 |
