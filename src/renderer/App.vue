<template>
  <el-container class="app-container" direction="vertical">
    <el-header v-if="!isPublic" class="app-header">
      <div class="logo">
        <span>Agent Workflow</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        mode="horizontal"
        class="app-menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/">
          <el-icon><ChatDotRound /></el-icon>
          <span>Q&amp;A</span>
        </el-menu-item>
        <el-menu-item index="/workflows">
          <el-icon><List /></el-icon>
          <span>工作流列表</span>
        </el-menu-item>
      </el-menu>
    </el-header>

    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { List, ChatDotRound } from '@element-plus/icons-vue'

const route = useRoute()

const activeMenu = computed(() => {
  if (route.path.startsWith('/workflows')) return '/workflows'
  return '/'
})

const isPublic = computed(() => route.meta?.public === true)
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
}

.app-container {
  height: 100vh;
}

.app-header {
  background-color: #304156;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 60px;
  border-bottom: 1px solid #1f2d3d;
}

.logo {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin-right: 32px;
  white-space: nowrap;
}

.app-menu {
  flex: 1;
  border-bottom: none !important;
}

.app-menu.el-menu--horizontal > .el-menu-item {
  border-bottom: 2px solid transparent !important;
}

.app-menu.el-menu--horizontal > .el-menu-item.is-active {
  border-bottom: 2px solid #409eff !important;
  background-color: transparent !important;
}

.app-main {
  background-color: #f0f2f5;
  padding: 0;
  overflow: auto;
}
</style>
