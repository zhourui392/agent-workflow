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
    <el-form-item label="Prompt">
      <el-input :model-value="step.prompt" @update:model-value="updateField('prompt', $event)" type="textarea" :rows="4"
        placeholder="步骤提示词，支持 {{today}}, {{steps.prev_step.output}} 等模板变量" />
    </el-form-item>
    <el-form-item label="最大轮次">
      <el-input-number :model-value="step.max_turns" @update:model-value="updateField('max_turns', $event)" :min="1" :max="100" />
    </el-form-item>
    <el-form-item label="输出验证">
      <el-switch :model-value="step.validation_enabled" @update:model-value="updateField('validation_enabled', $event)" />
      <span class="form-tip" style="margin-left: 8px;">启用后将通过 LLM 验证步骤输出是否符合预期</span>
    </el-form-item>
    <el-form-item v-if="step.validation_enabled" label="验证提示词">
      <el-input :model-value="step.validation_prompt" @update:model-value="updateField('validation_prompt', $event)" type="textarea" :rows="3"
        placeholder="描述期望的输出标准，如：输出必须包含JSON格式的分析结果，且包含 summary 和 details 字段" />
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
  </div>
</template>

<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'
import type { SkillData } from '@/api/skills'

/**
 * 步骤表单数据结构
 */
export interface StepFormData {
  name: string
  prompt: string
  max_turns: number
  validation_enabled: boolean
  validation_prompt: string
  skill_ids: string[]
}

const props = defineProps<{
  step: StepFormData
  index: number
  skills: SkillData[]
  disableRemove: boolean
}>()

const emit = defineEmits<{
  'update:step': [step: StepFormData]
  'remove': []
}>()

/**
 * 更新步骤的单个字段，触发整体更新事件
 *
 * @param field 字段名
 * @param value 新值
 */
function updateField(field: keyof StepFormData, value: unknown) {
  emit('update:step', { ...props.step, [field]: value })
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
</style>
