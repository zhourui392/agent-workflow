# 阶段1：稳定性修复 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 stability issues that cause silent failures and poor user experience: Pinia stores swallow errors, LiveMonitor logs grow unbounded, template variables resolve silently.

**Architecture:** Minimal, targeted fixes to existing files. No new modules or architectural changes. Each fix is independent and can be committed separately.

**Tech Stack:** Vue 3 (Composition API), Pinia, TypeScript, electron-log

---

## Chunk 1: Stability Fixes

### Task 1: Pinia Stores 暴露错误状态

Pinia stores 的 `fetchWorkflows` / `fetchExecutions` 等方法只有 `try/finally`，没有 `catch`。错误直接冒泡到组件层，但组件也没有统一处理。用户看到的是空白页面而非错误提示。

**Files:**
- Modify: `src/renderer/stores/workflow.ts`
- Modify: `src/renderer/stores/execution.ts`

- [ ] **Step 1: 修改 workflow store，添加 error ref 并在 catch 中捕获**

```typescript
// src/renderer/stores/workflow.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow, runWorkflow } from '@/api/workflows'
import type { WorkflowData } from '@/api/workflows'

export const useWorkflowStore = defineStore('workflow', () => {
  const workflows = ref<WorkflowData[]>([])
  const currentWorkflow = ref<WorkflowData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchWorkflows() {
    loading.value = true
    error.value = null
    try {
      const { data } = await listWorkflows()
      workflows.value = data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = '加载工作流列表失败: ' + message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchWorkflow(id: string) {
    loading.value = true
    error.value = null
    try {
      const { data } = await getWorkflow(id)
      currentWorkflow.value = data
      return data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = '加载工作流详情失败: ' + message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function saveWorkflow(workflowData: Partial<WorkflowData>) {
    if (workflowData.id) {
      const { data } = await updateWorkflow(workflowData.id, workflowData)
      return data
    } else {
      const { data } = await createWorkflow(workflowData)
      return data
    }
  }

  async function removeWorkflow(id: string) {
    await deleteWorkflow(id)
    workflows.value = workflows.value.filter((w: WorkflowData) => w.id !== id)
  }

  async function toggle(id: string) {
    const { data } = await toggleWorkflow(id)
    const idx = workflows.value.findIndex((w: WorkflowData) => w.id === id)
    if (idx >= 0 && data) workflows.value[idx] = data
    return data
  }

  async function run(id: string) {
    const { data } = await runWorkflow(id)
    return data.execution_id
  }

  return { workflows, currentWorkflow, loading, error, fetchWorkflows, fetchWorkflow, saveWorkflow, removeWorkflow, toggle, run }
})
```

- [ ] **Step 2: 修改 execution store，添加 error ref 并在 catch 中捕获**

```typescript
// src/renderer/stores/execution.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listExecutions, getExecution } from '@/api/executions'
import type { ExecutionData } from '@/api/executions'

export const useExecutionStore = defineStore('execution', () => {
  const executions = ref<ExecutionData[]>([])
  const currentExecution = ref<ExecutionData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchExecutions(params?: { workflow_id?: string; status?: string }) {
    loading.value = true
    error.value = null
    try {
      const { data } = await listExecutions(params)
      executions.value = data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = '加载执行记录失败: ' + message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchExecution(id: string) {
    loading.value = true
    error.value = null
    try {
      const { data } = await getExecution(id)
      currentExecution.value = data
      return data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = '加载执行详情失败: ' + message
      throw e
    } finally {
      loading.value = false
    }
  }

  return { executions, currentExecution, loading, error, fetchExecutions, fetchExecution }
})
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/renderer/stores/workflow.ts src/renderer/stores/execution.ts
git commit -m "fix: expose error state in Pinia stores for user-visible feedback"
```

---

### Task 2: LiveMonitor 日志数组设置上限

`LiveMonitor.vue` 的 `logs` 数组每次收到事件就 push，长时间运行后内存无限增长。需要设置上限，超过时丢弃最早的日志。

**Files:**
- Modify: `src/renderer/views/LiveMonitor.vue:175`

- [ ] **Step 1: 在 logs.push 处添加上限检查**

修改 `handleProgressEvent` 函数（约第 159-176 行），在 push 之后检查长度：

```typescript
// 在第 62 行附近，定义常量
const MAX_LOG_ENTRIES = 2000

// 修改第 175 行附近的 push 逻辑
logs.value.push({ type: logType, time, message })
if (logs.value.length > MAX_LOG_ENTRIES) {
  logs.value = logs.value.slice(-MAX_LOG_ENTRIES)
}
```

同时在 `selectExecution` 函数中已有 `logs.value = []`（第 79 行），这已正确处理切换执行时的清理。

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/renderer/views/LiveMonitor.vue
git commit -m "fix: cap LiveMonitor log entries at 2000 to prevent memory growth"
```

---

### Task 3: 模板变量解析添加未解析变量告警

`pipeline.ts:148` 调用 `renderTemplate()` 时，如果 `{{steps.unknown.output}}` 找不到值，函数静默返回原字符串 `{{steps.unknown.output}}`。`template.ts` 已有 `validateTemplate()` 函数但从未被调用。应在 pipeline 执行时调用它并记录告警日志。

**Files:**
- Modify: `src/main/core/pipeline.ts:148` (调用 `validateTemplate` 并记录告警)

- [ ] **Step 1: 在 pipeline.ts 的 import 中添加 validateTemplate**

修改第 20 行：

```typescript
import { renderTemplate, validateTemplate, type TemplateContext } from './template';
```

- [ ] **Step 2: 在 renderTemplate 调用前添加验证逻辑**

在第 148 行 `const renderedPrompt = renderTemplate(step.prompt, context);` 之前插入：

```typescript
      const unresolvedVariables = validateTemplate(step.prompt, context);
      if (unresolvedVariables.length > 0) {
        log.warn(
          `Step "${step.name}" has unresolved template variables: ${unresolvedVariables.join(', ')}`
        );
      }
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/main/core/pipeline.ts
git commit -m "fix: log warning when template variables cannot be resolved"
```
