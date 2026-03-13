# 阶段2：架构重构设计文档

## 目标

将 `configMerger.ts`（886行）拆分为4个职责清晰的模块，将 `WorkflowEdit.vue`（308行）抽取 StepEditor 子组件。

## configMerger.ts 拆分

### 文件结构

```
src/main/core/config/
  ├─ fileUtils.ts         # readFileOrNull, parseYamlFile, getGlobalConfigPath
  ├─ cliConfigLoader.ts   # CLI配置加载（MCP服务、技能扫描）
  ├─ skillManager.ts      # 技能文件扫描/解析/写入/清理
  ├─ mcpServerBuilder.ts  # MCP服务配置构建与合并
  └─ configMerger.ts      # 全局配置加载、合并逻辑、步骤配置编排
```

### 函数归属

| 模块 | 导出函数 | 内部函数 |
|------|---------|---------|
| fileUtils | readFileOrNull, parseYamlFile, getGlobalConfigPath | - |
| cliConfigLoader | loadClaudeCliMcpServers, loadClaudeCliSkills, loadClaudeCliSkillsWithDetails | getClaudeCliConfigPath, getClaudeCliPluginsPath, scanSkillsDirectory, parseSkillContent |
| skillManager | writeStepSkills, cleanupStepSkills | toSafeDirectoryName, buildSkillFileContent, writeSkillFile |
| mcpServerBuilder | mergeStepMcpServers | buildMcpServerConfig |
| configMerger | loadGlobalConfig, mergeConfig, getStepConfig, buildStepMergedConfig, validateConfigReferences, handleDanglingReferences, buildAllowedTools | - |

### 依赖方向

```
configMerger → cliConfigLoader, skillManager, mcpServerBuilder, fileUtils
cliConfigLoader → fileUtils
skillManager → fileUtils (仅用于 readFileOrNull)
mcpServerBuilder → (仅依赖 repositories)
```

### 外部影响

- `pipeline.ts`: import 路径从 `./configMerger` 改为 `./config/configMerger`
- `executor.ts`: 同上
- 所有导出函数签名不变，仅位置迁移

## WorkflowEdit.vue 拆分

### 组件结构

- `WorkflowEdit.vue`（~200行）：主组件，保留页头、基本信息、调度、规则、限制、保存逻辑
- `StepEditor.vue`（~120行）：单步骤编辑器，接收 props 展示步骤配置

### StepEditor 接口

```typescript
// Props
interface StepEditorProps {
  step: StepFormData
  index: number
  mcpServers: McpServerData[]
  skills: SkillData[]
}

// Emits
'update:step': (step: StepFormData) => void
'remove': () => void
```

### 父组件调用

```vue
<StepEditor
  v-for="(step, idx) in form.steps"
  :key="idx"
  :step="step"
  :index="idx"
  :mcpServers="mcpServerList"
  :skills="skillList"
  @update:step="form.steps[idx] = $event"
  @remove="removeStep(idx)"
/>
```
