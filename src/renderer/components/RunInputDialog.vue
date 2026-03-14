<template>
  <el-dialog v-model="visible" title="运行参数" width="500px" @close="handleClose">
    <el-form :model="formData" label-width="120px">
      <el-form-item
        v-for="input in inputs"
        :key="input.name"
        :label="input.name"
        :required="input.required"
      >
        <template v-if="input.type === 'boolean'">
          <el-switch v-model="formData[input.name]" />
        </template>
        <template v-else-if="input.type === 'number'">
          <el-input-number v-model="formData[input.name]" :placeholder="input.description" />
        </template>
        <template v-else>
          <el-input v-model="formData[input.name]" :placeholder="input.description" />
        </template>
        <div v-if="input.description" class="input-desc">{{ input.description }}</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleConfirm">运行</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

export interface InputDefinition {
  name: string
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  default?: string | number | boolean
  description?: string
}

const props = defineProps<{
  modelValue: boolean
  inputs: InputDefinition[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [values: Record<string, unknown>]
}>()

const visible = ref(props.modelValue)
const formData = ref<Record<string, any>>({})

watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:modelValue', val) })

watch(() => props.inputs, (inputs) => {
  const data: Record<string, any> = {}
  for (const input of inputs) {
    if (input.default !== undefined) {
      data[input.name] = input.default
    } else if (input.type === 'boolean') {
      data[input.name] = false
    } else if (input.type === 'number') {
      data[input.name] = undefined
    } else {
      data[input.name] = ''
    }
  }
  formData.value = data
}, { immediate: true })

function handleClose() {
  visible.value = false
}

function handleConfirm() {
  // Validate required fields
  for (const input of props.inputs) {
    if (input.required) {
      const val = formData.value[input.name]
      if (val === undefined || val === null || val === '') {
        return
      }
    }
  }
  emit('confirm', { ...formData.value })
  visible.value = false
}
</script>

<style scoped>
.input-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
