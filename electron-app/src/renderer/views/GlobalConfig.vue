<template>
  <div class="global-config">
    <div class="page-header">
      <h2>全局配置</h2>
      <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
    </div>

    <el-form label-width="120px" v-loading="loading">
      <el-card class="section-card">
        <template #header>默认设置</template>
        <el-form-item label="默认模型">
          <el-select v-model="form.default_model" clearable placeholder="使用环境变量或 SDK 默认值" style="width: 100%;">
            <el-option-group label="Claude 4">
              <el-option label="claude-sonnet-4-20250514" value="claude-sonnet-4-20250514" />
              <el-option label="claude-opus-4-20250514" value="claude-opus-4-20250514" />
              <el-option label="claude-haiku-4-20250506" value="claude-haiku-4-20250506" />
            </el-option-group>
            <el-option-group label="Claude 3.5">
              <el-option label="claude-3-5-sonnet-20241022" value="claude-3-5-sonnet-20241022" />
              <el-option label="claude-3-5-haiku-20241022" value="claude-3-5-haiku-20241022" />
            </el-option-group>
          </el-select>
          <div class="form-tip">优先级: 步骤级模型 > 全局默认模型 > 环境变量 ANTHROPIC_MODEL</div>
        </el-form-item>
      </el-card>

      <el-card class="section-card">
        <template #header>System Prompt</template>
        <el-input
          v-model="form.system_prompt"
          type="textarea"
          :rows="10"
          placeholder="全局 System Prompt，所有工作流都会继承"
        />
      </el-card>

      <el-card class="section-card">
        <template #header>
          <div class="section-header">
            <span>MCP 服务</span>
            <el-button size="small" :icon="Plus" @click="addMcpServer">添加</el-button>
          </div>
        </template>
        <div v-if="form.mcp_servers.length === 0" class="empty-hint">
          暂无 MCP 服务配置
        </div>
        <div v-for="(server, index) in form.mcp_servers" :key="index" class="mcp-item">
          <el-row :gutter="12" align="middle">
            <el-col :span="6">
              <el-input v-model="server.name" placeholder="服务名称" />
            </el-col>
            <el-col :span="7">
              <el-input v-model="server.command" placeholder="命令 (如 npx)" />
            </el-col>
            <el-col :span="8">
              <el-input v-model="server.argsStr" placeholder="参数 (逗号分隔)" />
            </el-col>
            <el-col :span="3">
              <el-button :icon="Delete" type="danger" plain @click="removeMcpServer(index)" />
            </el-col>
          </el-row>
        </div>
      </el-card>

      <el-card class="section-card">
        <template #header>Skills</template>
        <div v-if="form.skills.length === 0" class="empty-hint">
          暂无 Skills 配置（在 global_config/skills/ 目录添加 .md 文件）
        </div>
        <el-collapse v-else>
          <el-collapse-item v-for="skill in form.skills" :key="skill.name" :title="skill.name">
            <pre class="skill-content">{{ skill.content }}</pre>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import axios from 'axios'

const loading = ref(false)
const saving = ref(false)

interface McpServer {
  name: string
  command: string
  args?: string[]
  argsStr?: string
}

const form = reactive({
  system_prompt: '',
  mcp_servers: [] as McpServer[],
  skills: [] as { name: string; content: string }[],
  default_model: '' as string,
})

async function fetchConfig() {
  loading.value = true
  try {
    const res = await axios.get('/api/config')
    form.system_prompt = res.data.system_prompt || ''
    form.mcp_servers = (res.data.mcp_servers || []).map((s: McpServer) => ({
      ...s,
      argsStr: (s.args || []).join(', '),
    }))
    form.skills = res.data.skills || []
    form.default_model = res.data.default_model || ''
  } catch (e) {
    console.error('Failed to fetch config', e)
  } finally {
    loading.value = false
  }
}

function addMcpServer() {
  form.mcp_servers.push({ name: '', command: '', argsStr: '' })
}

function removeMcpServer(index: number) {
  form.mcp_servers.splice(index, 1)
}

async function handleSave() {
  saving.value = true
  try {
    const payload = {
      system_prompt: form.system_prompt,
      mcp_servers: form.mcp_servers.map((s) => ({
        name: s.name,
        command: s.command,
        args: s.argsStr ? s.argsStr.split(',').map((a) => a.trim()) : [],
      })),
      default_model: form.default_model || null,
    }
    await axios.put('/api/config', payload)
    ElMessage.success('保存成功')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    saving.value = false
  }
}

onMounted(fetchConfig)
</script>

<style scoped>
.global-config { padding: 20px; max-width: 900px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.section-card { margin-bottom: 20px; }
.section-header { display: flex; justify-content: space-between; align-items: center; }
.empty-hint { color: #909399; text-align: center; padding: 20px; }
.mcp-item { margin-bottom: 12px; }
.skill-content { background: #f5f7fa; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 13px; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; }
</style>
