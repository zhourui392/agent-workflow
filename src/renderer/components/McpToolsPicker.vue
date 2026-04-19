<template>
  <div class="mcp-tools-picker">
    <div class="picker-header">
      <span class="picker-hint">
        未勾选的 server 在本步骤不启用；勾选后可选"全部工具"或"指定工具"
      </span>
      <el-button size="small" :loading="loading" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span style="margin-left: 4px">刷新</span>
      </el-button>
    </div>

    <div v-if="loading && !loaded" class="picker-loading">
      <el-skeleton :rows="2" animated />
    </div>

    <div v-else-if="serverNames.length === 0" class="picker-empty">
      未配置 MCP server（~/.claude/.mcp.json 或应用磁盘配置）
    </div>

    <div v-else class="picker-list">
      <div v-for="server in serverNames" :key="server" class="server-row">
        <div class="server-row-head">
          <el-checkbox
            :model-value="isServerEnabled(server)"
            @update:model-value="toggleServer(server, $event as boolean)"
          >
            <span class="server-name">{{ server }}</span>
          </el-checkbox>
          <span v-if="catalog[server]?.error" class="server-error">
            加载失败：{{ catalog[server]!.error }}
          </span>
          <span v-else-if="catalog[server]" class="server-meta">
            共 {{ catalog[server]!.tools.length }} 个工具
          </span>
        </div>

        <div v-if="isServerEnabled(server)" class="server-row-body">
          <el-radio-group
            :model-value="getMode(server)"
            size="small"
            @update:model-value="changeMode(server, $event as 'all' | 'specific')"
          >
            <el-radio-button value="all">全部工具</el-radio-button>
            <el-radio-button value="specific">指定工具</el-radio-button>
          </el-radio-group>

          <div v-if="getMode(server) === 'specific'" class="server-tools-select">
            <el-select
              v-if="catalog[server]?.tools?.length"
              :model-value="getSelectedTools(server)"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              placeholder="选择要启用的工具"
              style="width: 100%"
              @update:model-value="setSelectedTools(server, $event as string[])"
            >
              <el-option
                v-for="tool in catalog[server]!.tools"
                :key="tool.name"
                :label="tool.name"
                :value="tool.name"
              >
                <div class="tool-option">
                  <span>{{ tool.name }}</span>
                  <span v-if="tool.description" class="tool-desc">{{ tool.description }}</span>
                </div>
              </el-option>
            </el-select>
            <el-input
              v-else
              :model-value="getSelectedTools(server).join(',')"
              size="small"
              placeholder="工具列表不可用；手动输入工具名，逗号分隔"
              @update:model-value="setSelectedToolsFromCsv(server, $event)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { listMcpTools, refreshMcpTools, type McpServerToolsDTO } from '@/api/index'

type McpToolsValue = Record<string, string[] | '*'> | undefined

const props = defineProps<{
  modelValue: McpToolsValue
}>()

const emit = defineEmits<{
  'update:modelValue': [value: McpToolsValue]
}>()

const catalog = ref<Record<string, McpServerToolsDTO>>({})
const loading = ref(false)
const loaded = ref(false)

const serverNames = computed(() => {
  const fromCatalog = Object.keys(catalog.value)
  const fromSelection = Object.keys(props.modelValue ?? {})
  return Array.from(new Set([...fromCatalog, ...fromSelection])).sort()
})

onMounted(load)

async function load(force = false) {
  loading.value = true
  try {
    const { data } = force ? await refreshMcpTools().then(r => ({ data: r.data.tools })) : await listMcpTools()
    catalog.value = data
    loaded.value = true
  } catch (err) {
    ElMessage.error(`加载 MCP 工具失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await load(true)
}

function currentMap(): Record<string, string[] | '*'> {
  return { ...(props.modelValue ?? {}) }
}

function emitMap(map: Record<string, string[] | '*'>) {
  emit('update:modelValue', Object.keys(map).length === 0 ? undefined : map)
}

function isServerEnabled(server: string): boolean {
  return props.modelValue ? server in props.modelValue : false
}

function toggleServer(server: string, enabled: boolean) {
  const map = currentMap()
  if (enabled) {
    map[server] = '*'
  } else {
    delete map[server]
  }
  emitMap(map)
}

function getMode(server: string): 'all' | 'specific' {
  const sel = props.modelValue?.[server]
  return sel === '*' ? 'all' : 'specific'
}

function changeMode(server: string, mode: 'all' | 'specific') {
  const map = currentMap()
  if (mode === 'all') {
    map[server] = '*'
  } else {
    const prev = map[server]
    map[server] = Array.isArray(prev) ? prev : []
  }
  emitMap(map)
}

function getSelectedTools(server: string): string[] {
  const sel = props.modelValue?.[server]
  return Array.isArray(sel) ? sel : []
}

function setSelectedTools(server: string, tools: string[]) {
  const map = currentMap()
  map[server] = tools
  emitMap(map)
}

function setSelectedToolsFromCsv(server: string, csv: string) {
  const tools = csv.split(',').map(s => s.trim()).filter(Boolean)
  setSelectedTools(server, tools)
}
</script>

<style scoped>
.mcp-tools-picker { width: 100%; }
.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.picker-hint { font-size: 12px; color: #909399; }
.picker-loading { padding: 8px 0; }
.picker-empty {
  font-size: 12px;
  color: #909399;
  padding: 8px;
  background: #fafafa;
  border-radius: 4px;
}
.picker-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.server-row {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 10px 12px;
  background: #fafbfc;
}
.server-row-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.server-name { font-weight: 500; }
.server-meta { font-size: 12px; color: #909399; }
.server-error { font-size: 12px; color: #f56c6c; }
.server-row-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.server-tools-select { width: 100%; }
.tool-option {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  padding: 4px 0;
}
.tool-desc { font-size: 11px; color: #909399; }
</style>
