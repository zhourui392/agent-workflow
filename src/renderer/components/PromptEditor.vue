<template>
  <div class="prompt-editor" ref="containerRef">
    <el-input
      ref="inputRef"
      type="textarea"
      :model-value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      @input="handleInput"
      @keydown="handleKeydown"
      @blur="handleBlur"
    />
    <div
      v-if="showPanel"
      class="suggestion-panel"
      :style="panelStyle"
    >
      <div
        v-for="(item, idx) in filteredSuggestions"
        :key="item.value"
        class="suggestion-item"
        :class="{ active: idx === activeIndex }"
        @mousedown.prevent="selectSuggestion(item)"
      >
        <span class="suggestion-label">{{ item.value }}</span>
        <span class="suggestion-type">{{ item.type }}</span>
      </div>
      <div v-if="filteredSuggestions.length === 0" class="suggestion-empty">无匹配变量</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'

interface SuggestionItem {
  value: string
  type: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  rows?: number
  placeholder?: string
  workflowInputs?: { name: string }[]
  priorSteps?: { name: string }[]
}>(), {
  rows: 4,
  placeholder: '步骤提示词，支持 {{today}}, {{steps.prev_step.output}} 等模板变量'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputRef = ref<any>(null)
const containerRef = ref<HTMLElement>()
const showPanel = ref(false)
const activeIndex = ref(0)
const triggerPosition = ref(0)
const filterText = ref('')

const panelStyle = ref<Record<string, string>>({})

const allSuggestions = computed<SuggestionItem[]>(() => {
  const items: SuggestionItem[] = []

  if (props.workflowInputs) {
    for (const input of props.workflowInputs) {
      items.push({ value: `inputs.${input.name}`, type: '输入参数' })
    }
  }

  if (props.priorSteps) {
    for (const step of props.priorSteps) {
      items.push({ value: `steps.${step.name}.output`, type: '步骤输出' })
    }
  }

  return items
})

const filteredSuggestions = computed(() => {
  if (!filterText.value) return allSuggestions.value
  const lower = filterText.value.toLowerCase()
  return allSuggestions.value.filter(s => s.value.toLowerCase().includes(lower))
})

function getTextarea(): HTMLTextAreaElement | null {
  return inputRef.value?.$el?.querySelector('textarea') || inputRef.value?.textarea || null
}

function handleInput(value: string) {
  emit('update:modelValue', value)
  nextTick(() => checkTrigger(value))
}

function checkTrigger(value: string) {
  const textarea = getTextarea()
  if (!textarea) return

  const cursorPos = textarea.selectionStart
  const textBefore = value.substring(0, cursorPos)

  // Find last {{ that isn't closed
  const lastOpen = textBefore.lastIndexOf('{{')
  if (lastOpen === -1) {
    showPanel.value = false
    return
  }

  const afterOpen = textBefore.substring(lastOpen + 2)
  // If there's a }} after the {{, it's already closed
  if (afterOpen.includes('}}')) {
    showPanel.value = false
    return
  }

  triggerPosition.value = lastOpen
  filterText.value = afterOpen.trim()
  activeIndex.value = 0
  showPanel.value = true

  // Position the panel below the textarea
  if (containerRef.value) {
    panelStyle.value = {
      top: `${textarea.offsetHeight + 4}px`,
      left: '0px'
    }
  }
}

function selectSuggestion(item: SuggestionItem) {
  const textarea = getTextarea()
  if (!textarea) return

  const value = props.modelValue
  const cursorPos = textarea.selectionStart
  const beforeTrigger = value.substring(0, triggerPosition.value)
  const afterCursor = value.substring(cursorPos)

  const newValue = `${beforeTrigger}{{${item.value}}}${afterCursor}`
  emit('update:modelValue', newValue)
  showPanel.value = false

  nextTick(() => {
    const newPos = triggerPosition.value + item.value.length + 4 // {{ + value + }}
    textarea.focus()
    textarea.setSelectionRange(newPos, newPos)
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (!showPanel.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filteredSuggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter' && filteredSuggestions.value.length > 0) {
    e.preventDefault()
    selectSuggestion(filteredSuggestions.value[activeIndex.value])
  } else if (e.key === 'Escape') {
    showPanel.value = false
  }
}

function handleBlur() {
  // Delay to allow click on suggestion to register
  setTimeout(() => { showPanel.value = false }, 200)
}
</script>

<style scoped>
.prompt-editor {
  position: relative;
  width: 100%;
}
.suggestion-panel {
  position: absolute;
  z-index: 2000;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  min-width: 280px;
}
.suggestion-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.suggestion-item:hover,
.suggestion-item.active {
  background: #f5f7fa;
}
.suggestion-label {
  font-family: monospace;
  color: #303133;
}
.suggestion-type {
  font-size: 11px;
  color: #909399;
  margin-left: 16px;
}
.suggestion-empty {
  padding: 8px 12px;
  color: #909399;
  font-size: 13px;
  text-align: center;
}
</style>
