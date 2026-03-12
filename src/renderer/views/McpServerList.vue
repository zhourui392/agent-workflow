<template>
  <div class="mcp-server-list">
    <div class="page-header">
      <h2>MCP 服务管理</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">新建</el-button>
    </div>

    <el-table :data="servers" v-loading="loading" stripe>
      <el-table-column prop="name" label="名称" width="180" />
      <el-table-column prop="command" label="命令" width="150" />
      <el-table-column label="参数" min-width="200">
        <template #default="{ row }">
          <span class="args-text">{{ formatArgs(row.args) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
      <el-table-column label="全局启用" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            v-model="row.enabled"
            @change="(val: boolean) => handleToggleEnabled(row, val)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="center">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="handleEdit(row)" />
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(row)" />
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑 MCP 服务' : '新建 MCP 服务'"
      width="600px"
    >
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="服务名称（唯一标识）" />
        </el-form-item>
        <el-form-item label="命令" prop="command">
          <el-input v-model="form.command" placeholder="如 npx, python, node" />
        </el-form-item>
        <el-form-item label="参数">
          <el-input v-model="form.argsStr" placeholder="逗号分隔，如 -m, mcp_server" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选描述" />
        </el-form-item>
        <el-form-item label="环境变量">
          <div class="env-list">
            <div v-for="(env, index) in form.envList" :key="index" class="env-item">
              <el-input v-model="env.key" placeholder="变量名" style="width: 40%;" />
              <span class="env-eq">=</span>
              <el-input v-model="env.value" placeholder="变量值" style="width: 45%;" />
              <el-button :icon="Delete" size="small" @click="removeEnv(index)" />
            </div>
            <el-button size="small" :icon="Plus" @click="addEnv">添加环境变量</el-button>
          </div>
        </el-form-item>
        <el-form-item label="全局启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import {
  listMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  setMcpServerEnabled,
  type McpServerData
} from '@/api/mcpServers'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref('')
const formRef = ref<FormInstance>()

const servers = ref<McpServerData[]>([])

interface EnvItem {
  key: string
  value: string
}

const form = reactive({
  name: '',
  command: '',
  argsStr: '',
  description: '',
  envList: [] as EnvItem[],
  enabled: false
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  command: [{ required: true, message: '请输入命令', trigger: 'blur' }]
}

function formatArgs(args: string[] | null): string {
  return args?.join(' ') || '-'
}

function resetForm() {
  form.name = ''
  form.command = ''
  form.argsStr = ''
  form.description = ''
  form.envList = []
  form.enabled = false
  editingId.value = ''
}

function addEnv() {
  form.envList.push({ key: '', value: '' })
}

function removeEnv(index: number) {
  form.envList.splice(index, 1)
}

async function fetchServers() {
  loading.value = true
  try {
    const res = await listMcpServers()
    servers.value = res.data
  } catch (e) {
    console.error('Failed to fetch MCP servers', e)
  } finally {
    loading.value = false
  }
}

function handleCreate() {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

function handleEdit(row: McpServerData) {
  resetForm()
  isEdit.value = true
  editingId.value = row.id
  form.name = row.name
  form.command = row.command
  form.argsStr = row.args?.join(', ') || ''
  form.description = row.description || ''
  form.enabled = row.enabled
  if (row.env) {
    form.envList = Object.entries(row.env).map(([key, value]) => ({ key, value }))
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const args = form.argsStr ? form.argsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined
    const env: Record<string, string> = {}
    for (const item of form.envList) {
      if (item.key.trim()) {
        env[item.key.trim()] = item.value
      }
    }

    const data = {
      name: form.name,
      command: form.command,
      args,
      description: form.description || undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      enabled: form.enabled
    }

    if (isEdit.value) {
      await updateMcpServer(editingId.value, data)
      ElMessage.success('更新成功')
    } else {
      await createMcpServer(data)
      ElMessage.success('创建成功')
    }

    dialogVisible.value = false
    fetchServers()
  } catch (e: any) {
    ElMessage.error('操作失败: ' + (e.message || e))
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: McpServerData) {
  try {
    await ElMessageBox.confirm(`确定删除 MCP 服务 "${row.name}" 吗？`, '确认删除', {
      type: 'warning'
    })
    await deleteMcpServer(row.id)
    ElMessage.success('删除成功')
    fetchServers()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败: ' + (e.message || e))
    }
  }
}

async function handleToggleEnabled(row: McpServerData, enabled: boolean) {
  try {
    await setMcpServerEnabled(row.id, enabled)
    ElMessage.success(enabled ? '已启用' : '已禁用')
  } catch (e: any) {
    row.enabled = !enabled
    ElMessage.error('操作失败: ' + (e.message || e))
  }
}

onMounted(fetchServers)
</script>

<style scoped>
.mcp-server-list {
  padding: 20px;
  max-width: 1200px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.args-text {
  font-family: monospace;
  color: #606266;
}

.env-list {
  width: 100%;
}

.env-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.env-eq {
  color: #909399;
}
</style>
