<template>
  <div class="workflow-layout">
    <div class="tabs-bar">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="工作流列表" name="/workflows" />
        <el-tab-pane label="执行历史" name="/workflows/executions" />
        <el-tab-pane label="全局配置" name="/workflows/settings" />
        <el-tab-pane label="Skills" name="/workflows/skills" />
      </el-tabs>
    </div>
    <div class="layout-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeTab = computed({
  get: () => {
    const p = route.path
    if (p.startsWith('/workflows/executions')) return '/workflows/executions'
    if (p.startsWith('/workflows/settings')) return '/workflows/settings'
    if (p.startsWith('/workflows/skills')) return '/workflows/skills'
    return '/workflows'
  },
  set: () => {}
})

function onTabChange(name: string | number): void {
  const target = String(name)
  if (route.path !== target) router.push(target)
}
</script>

<style scoped>
.workflow-layout { height: 100%; display: flex; flex-direction: column; }
.tabs-bar {
  background: #fff; padding: 0 16px; border-bottom: 1px solid #ebeef5;
}
.tabs-bar :deep(.el-tabs__header) { margin: 0; }
.tabs-bar :deep(.el-tabs__nav-wrap::after) { display: none; }
.layout-content { flex: 1; overflow: auto; padding: 16px; }
</style>
