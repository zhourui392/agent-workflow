<template>
  <div class="global-config">
    <div class="page-header">
      <h2>全局配置</h2>
      <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
    </div>

    <el-form label-width="120px" v-loading="loading">
      <el-card class="section-card">
        <template #header>System Prompt</template>
        <el-input
          v-model="form.systemPrompt"
          type="textarea"
          :rows="10"
          placeholder="全局 System Prompt，所有工作流都会继承"
        />
      </el-card>

      <el-card class="section-card">
        <template #header>
          <div class="section-header">
            <span>MCP 服务</span>
            <span class="config-source">来自 Claude CLI (~/.claude.json)</span>
          </div>
        </template>
        <div v-if="mcpServers.length === 0" class="empty-hint">
          暂无 MCP 服务配置，请使用 Claude CLI 配置 MCP 服务
        </div>
        <div v-else class="mcp-list">
          <div v-for="server in mcpServers" :key="server.id" class="mcp-item">
            <span class="mcp-name">{{ server.name }}</span>
            <span class="mcp-command">{{ server.command }}</span>
            <el-tag v-if="server.source === 'cli'" size="small" type="info">CLI</el-tag>
          </div>
        </div>
        <div class="form-tip">MCP 服务在 Claude CLI 中配置，可在工作流步骤中选择使用</div>
      </el-card>

      <el-card class="section-card">
        <template #header>
          <div class="section-header">
            <span>Skills</span>
            <span class="config-source">来自 Claude CLI 插件</span>
          </div>
        </template>
        <div v-if="skills.length === 0" class="empty-hint">
          暂无 Skills 配置，请使用 Claude CLI 安装插件
        </div>
        <div v-else class="skills-list">
          <el-tag v-for="skill in skills" :key="skill.id" class="skill-tag">
            {{ skill.name }}
          </el-tag>
        </div>
        <div class="form-tip">Skills 从 Claude CLI 插件自动加载，可在工作流步骤中选择使用</div>
      </el-card>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getConfig, updateConfig, getAllMcpServers, getAllSkills, type McpServerDTO, type SkillDTO } from '@/api/index'

const loading = ref(false)
const saving = ref(false)
const mcpServers = ref<McpServerDTO[]>([])
const skills = ref<SkillDTO[]>([])

const form = reactive({
  systemPrompt: '',
})

async function fetchConfig() {
  loading.value = true
  try {
    const [configRes, mcpRes, skillsRes] = await Promise.all([
      getConfig(),
      getAllMcpServers(),
      getAllSkills()
    ])

    form.systemPrompt = configRes.data.systemPrompt || ''
    mcpServers.value = mcpRes.data || []
    skills.value = skillsRes.data || []
  } catch (e) {
    console.error('Failed to fetch config', e)
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await updateConfig({
      systemPrompt: form.systemPrompt || undefined,
    })
    ElMessage.success('保存成功')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
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
.section-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.config-source { font-size: 12px; color: #909399; font-weight: normal; }
.empty-hint { color: #909399; text-align: center; padding: 20px; }
.form-tip { font-size: 12px; color: #909399; margin-top: 8px; }
.mcp-list { display: flex; flex-direction: column; gap: 8px; }
.mcp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}
.mcp-name { font-weight: 500; }
.mcp-command { color: #606266; font-family: monospace; font-size: 13px; }
.skills-list { display: flex; flex-wrap: wrap; gap: 8px; }
.skill-tag { margin: 0; }
</style>
