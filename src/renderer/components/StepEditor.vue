<template>
  <div class="step-item">
    <div class="step-header">
      <span class="step-number">步骤 {{ index + 1 }}</span>
      <el-button size="small" type="danger" text @click="$emit('remove')" :disabled="disableRemove">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
    <el-form-item label="步骤名称">
      <el-input :model-value="step.name" @update:model-value="updateField('name', $event)" placeholder="如: analyze_code" />
    </el-form-item>
    <el-form-item label="步骤类型">
      <el-radio-group :model-value="step.step_type || 'agent'" @update:model-value="onStepTypeChange($event as StepType)">
        <el-radio-button value="agent">Agent 步骤</el-radio-button>
        <el-radio-button value="forEach">ForEach 循环</el-radio-button>
        <el-radio-button value="subWorkflow">子工作流</el-radio-button>
        <el-radio-button value="dataSplit">数据拆分</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <!-- Agent 步骤表单 -->
    <template v-if="!step.step_type || step.step_type === 'agent'">
      <el-form-item label="Prompt">
        <PromptEditor
          :model-value="step.prompt"
          @update:model-value="updateField('prompt', $event)"
          :rows="4"
          :workflow-inputs="workflowInputs"
          :prior-steps="priorSteps"
        />
      </el-form-item>
      <el-form-item label="最大轮次">
        <el-input-number :model-value="step.max_turns" @update:model-value="updateField('max_turns', $event)" :min="1" :max="9999" />
      </el-form-item>
      <el-form-item label="输出验证">
        <el-switch :model-value="step.validation_enabled" @update:model-value="updateField('validation_enabled', $event)" />
        <span class="form-tip" style="margin-left: 8px;">启用后将通过 LLM 验证步骤输出是否符合预期</span>
      </el-form-item>
      <el-form-item v-if="step.validation_enabled" label="验证提示词">
        <el-input :model-value="step.validation_prompt" @update:model-value="updateField('validation_prompt', $event)" type="textarea" :rows="3"
          placeholder="描述期望的输出标准，如：输出必须包含JSON格式的分析结果，且包含 summary 和 details 字段" />
      </el-form-item>
      <el-form-item v-if="step.validation_enabled" label="验证规则">
        <div class="validation-rules">
          <div v-for="(rule, rIdx) in step.validation_rules" :key="rIdx" class="rule-row">
            <el-select :model-value="rule.type" @update:model-value="updateRule(rIdx, 'type', $event)" size="small" style="width: 120px">
              <el-option label="包含" value="contains" />
              <el-option label="正则" value="regex" />
            </el-select>
            <el-input
              v-if="rule.type === 'contains'"
              :model-value="rule.value"
              @update:model-value="updateRule(rIdx, 'value', $event)"
              size="small"
              placeholder="输出应包含的文本"
              style="flex: 1"
            />
            <el-input
              v-else
              :model-value="rule.pattern"
              @update:model-value="updateRule(rIdx, 'pattern', $event)"
              size="small"
              placeholder="正则表达式"
              style="flex: 1"
            />
            <el-button size="small" type="danger" text @click="removeRule(rIdx)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button size="small" @click="addRule">+ 添加规则</el-button>
          <div class="form-tip">快速规则验证（无 LLM 调用成本），优先于验证提示词执行</div>
        </div>
      </el-form-item>
      <el-form-item label="Skills">
        <el-select
          :model-value="step.skill_ids"
          @update:model-value="updateField('skill_ids', $event)"
          multiple
          filterable
          placeholder="选择此步骤使用的 Skills"
          style="width: 100%"
        >
          <el-option
            v-for="skill in skills"
            :key="skill.id"
            :label="skill.name"
            :value="skill.id"
          >
            <span>{{ skill.name }}</span>
            <span v-if="skill.source === 'cli'" class="cli-tag">CLI</span>
            <span v-if="skill.description" class="option-desc">{{ skill.description }}</span>
          </el-option>
        </el-select>
        <div class="form-tip">选择此步骤需要使用的 Skills（如代码审查、测试生成等）</div>
      </el-form-item>
    </template>

    <!-- 子工作流步骤表单 -->
    <template v-else-if="step.step_type === 'subWorkflow'">
      <el-form-item label="子工作流" required>
        <el-select
          :model-value="step.workflow_id"
          @update:model-value="updateField('workflow_id', $event)"
          filterable
          placeholder="选择要调用的工作流"
          style="width: 100%"
        >
          <el-option
            v-for="wf in availableWorkflows"
            :key="wf.id"
            :label="wf.name"
            :value="wf.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="输入映射">
        <div class="input-mapping">
          <div v-for="(val, key) in (step.input_mapping || {})" :key="key" class="mapping-row">
            <el-input :model-value="key" disabled size="small" style="width: 140px" />
            <span style="margin: 0 8px">=</span>
            <el-input :model-value="val" @update:model-value="updateInputMapping(key as string, $event)" size="small" style="flex: 1"
              placeholder="模板表达式，如 {{inputs.xxx}}" />
            <el-button size="small" type="danger" text @click="removeInputMapping(key as string)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div class="mapping-row">
            <el-input v-model="newMappingKey" size="small" style="width: 140px" placeholder="参数名" />
            <span style="margin: 0 8px">=</span>
            <el-input v-model="newMappingValue" size="small" style="flex: 1" placeholder="模板表达式" />
            <el-button size="small" type="primary" text @click="addInputMapping" :disabled="!newMappingKey">
              <el-icon><Plus /></el-icon>
            </el-button>
          </div>
          <div class="form-tip">将当前工作流的变量映射为子工作流的输入参数</div>
        </div>
      </el-form-item>
      <el-form-item label="循环执行">
        <el-switch :model-value="step.for_each_enabled" @update:model-value="onForEachToggle($event)" />
        <span class="form-tip" style="margin-left: 8px;">对列表中每个元素执行一次子工作流</span>
      </el-form-item>
      <template v-if="step.for_each_enabled">
        <el-form-item label="数据源">
          <el-input :model-value="step.for_each_iterate_over" @update:model-value="updateField('for_each_iterate_over', $event)"
            placeholder="模板表达式，如 {{steps.拆分.output}}" />
          <div class="form-tip">应解析为 JSON 数组</div>
        </el-form-item>
        <el-form-item label="迭代变量名">
          <el-input :model-value="step.for_each_item_variable" @update:model-value="updateField('for_each_item_variable', $event)"
            placeholder="如: task" style="width: 200px" />
          <div class="form-tip" v-text="'子工作流可通过 {{inputs.变量名}} 引用当前迭代元素'"></div>
        </el-form-item>
      </template>
    </template>

    <!-- ForEach 循环步骤表单 -->
    <template v-else-if="step.step_type === 'forEach'">
      <el-form-item label="数据源" required>
        <el-input :model-value="step.for_each_iterate_over" @update:model-value="updateField('for_each_iterate_over', $event)"
          placeholder="模板表达式，如 {{steps.拆分.output}}" />
        <div class="form-tip">应解析为 JSON 数组，每个元素将作为一次迭代的输入</div>
      </el-form-item>
      <el-form-item label="迭代变量名" required>
        <el-input :model-value="step.for_each_item_variable" @update:model-value="updateField('for_each_item_variable', $event)"
          placeholder="如: item" style="width: 200px" />
        <div class="form-tip" v-text="'提示词中通过 {{inputs.变量名}} 引用当前迭代元素'"></div>
      </el-form-item>
      <el-form-item label="Prompt" required>
        <PromptEditor
          :model-value="step.prompt"
          @update:model-value="updateField('prompt', $event)"
          :rows="4"
          :workflow-inputs="workflowInputs"
          :prior-steps="priorSteps"
        />
      </el-form-item>
      <el-form-item label="最大轮次">
        <el-input-number :model-value="step.max_turns" @update:model-value="updateField('max_turns', $event)" :min="1" :max="9999" />
      </el-form-item>
      <el-form-item label="Skills">
        <el-select
          :model-value="step.skill_ids"
          @update:model-value="updateField('skill_ids', $event)"
          multiple
          filterable
          placeholder="选择此步骤使用的 Skills"
          style="width: 100%"
        >
          <el-option
            v-for="skill in skills"
            :key="skill.id"
            :label="skill.name"
            :value="skill.id"
          >
            <span>{{ skill.name }}</span>
            <span v-if="skill.source === 'cli'" class="cli-tag">CLI</span>
            <span v-if="skill.description" class="option-desc">{{ skill.description }}</span>
          </el-option>
        </el-select>
      </el-form-item>
    </template>

    <!-- 数据拆分步骤表单 -->
    <template v-else-if="step.step_type === 'dataSplit'">
      <el-form-item label="拆分模式">
        <el-radio-group :model-value="step.data_split_mode || 'static'" @update:model-value="updateField('data_split_mode', $event)">
          <el-radio-button value="static">静态数组</el-radio-button>
          <el-radio-button value="template">模板引用</el-radio-button>
          <el-radio-button value="ai">AI 拆分</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- 静态模式 -->
      <el-form-item v-if="!step.data_split_mode || step.data_split_mode === 'static'" label="JSON 数组">
        <el-input :model-value="step.data_split_static" @update:model-value="updateField('data_split_static', $event)"
          type="textarea" :rows="3" placeholder='["任务1", "任务2", "任务3"]' />
        <div class="form-tip">输入合法的 JSON 数组，每个元素将作为 ForEach 的迭代项</div>
      </el-form-item>

      <!-- 模板模式 -->
      <el-form-item v-else-if="step.data_split_mode === 'template'" label="模板表达式">
        <el-input :model-value="step.data_split_template" @update:model-value="updateField('data_split_template', $event)"
          placeholder="如 {{steps.获取列表.output}}" />
        <div class="form-tip">引用上游步骤输出，结果必须为 JSON 数组</div>
      </el-form-item>

      <!-- AI 模式 -->
      <template v-else-if="step.data_split_mode === 'ai'">
        <el-form-item label="待拆分内容">
          <PromptEditor
            :model-value="step.data_split_ai_input || ''"
            @update:model-value="updateField('data_split_ai_input', $event)"
            :rows="3"
            :workflow-inputs="workflowInputs"
            :prior-steps="priorSteps"
          />
          <div class="form-tip">支持模板表达式引用上游输出</div>
        </el-form-item>
        <el-form-item label="拆分提示词">
          <el-input :model-value="step.data_split_ai_prompt" @update:model-value="updateField('data_split_ai_prompt', $event)"
            type="textarea" :rows="2" placeholder="可选，默认自动生成拆分指令" />
          <div class="form-tip">自定义拆分策略，留空使用默认提示词</div>
        </el-form-item>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { SkillData } from '@/api/skills'
import type { WorkflowDTO } from '@/api/index'
import PromptEditor from './PromptEditor.vue'

export type StepType = 'agent' | 'subWorkflow' | 'dataSplit' | 'forEach'

/**
 * 步骤表单数据结构
 */
export interface ValidationRuleData {
  type: 'regex' | 'contains'
  pattern?: string
  value?: string
}

export interface StepFormData {
  name: string
  prompt: string
  max_turns: number
  validation_enabled: boolean
  validation_prompt: string
  validation_rules: ValidationRuleData[]
  skill_ids: string[]
  // 步骤类型
  step_type?: StepType
  workflow_id?: string
  input_mapping?: Record<string, string>
  for_each_enabled?: boolean
  for_each_iterate_over?: string
  for_each_item_variable?: string
  // 数据拆分字段
  data_split_mode?: 'static' | 'template' | 'ai'
  data_split_static?: string
  data_split_template?: string
  data_split_ai_input?: string
  data_split_ai_prompt?: string
}

const props = defineProps<{
  step: StepFormData
  index: number
  skills: SkillData[]
  disableRemove: boolean
  workflowInputs?: { name: string }[]
  priorSteps?: { name: string }[]
  availableWorkflows?: WorkflowDTO[]
}>()

const emit = defineEmits<{
  'update:step': [step: StepFormData]
  'remove': []
}>()

const newMappingKey = ref('')
const newMappingValue = ref('')

function updateField(field: keyof StepFormData, value: unknown) {
  emit('update:step', { ...props.step, [field]: value })
}

function onStepTypeChange(type: StepType) {
  emit('update:step', { ...props.step, step_type: type })
}

function onForEachToggle(enabled: boolean) {
  emit('update:step', {
    ...props.step,
    for_each_enabled: enabled,
    for_each_iterate_over: enabled ? props.step.for_each_iterate_over || '' : undefined,
    for_each_item_variable: enabled ? props.step.for_each_item_variable || '' : undefined
  })
}

function addInputMapping() {
  if (!newMappingKey.value) return
  const mapping = { ...(props.step.input_mapping || {}), [newMappingKey.value]: newMappingValue.value }
  emit('update:step', { ...props.step, input_mapping: mapping })
  newMappingKey.value = ''
  newMappingValue.value = ''
}

function updateInputMapping(key: string, value: string) {
  const mapping = { ...(props.step.input_mapping || {}), [key]: value }
  emit('update:step', { ...props.step, input_mapping: mapping })
}

function removeInputMapping(key: string) {
  const mapping = { ...(props.step.input_mapping || {}) }
  delete mapping[key]
  emit('update:step', { ...props.step, input_mapping: mapping })
}

function addRule() {
  const rules = [...(props.step.validation_rules || []), { type: 'contains' as const, value: '' }]
  emit('update:step', { ...props.step, validation_rules: rules })
}

function removeRule(index: number) {
  const rules = [...(props.step.validation_rules || [])]
  rules.splice(index, 1)
  emit('update:step', { ...props.step, validation_rules: rules })
}

function updateRule(index: number, field: string, value: unknown) {
  const rules = [...(props.step.validation_rules || [])]
  rules[index] = { ...rules[index], [field]: value }
  emit('update:step', { ...props.step, validation_rules: rules })
}
</script>

<style scoped>
.step-item { padding: 10px 0; }
.step-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.step-number { font-weight: bold; color: #409eff; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; }
.cli-tag {
  margin-left: 8px;
  padding: 0 6px;
  font-size: 11px;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 4px;
}
.option-desc {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
.validation-rules {
  width: 100%;
}
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.input-mapping { width: 100%; }
.mapping-row {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-bottom: 8px;
}
</style>
