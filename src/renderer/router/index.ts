import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'WorkflowList',
      component: () => import('@/views/WorkflowList.vue'),
    },
    {
      path: '/workflows/new',
      name: 'WorkflowCreate',
      component: () => import('@/views/WorkflowEdit.vue'),
    },
    {
      path: '/workflows/:id',
      name: 'WorkflowEdit',
      component: () => import('@/views/WorkflowEdit.vue'),
    },
    {
      path: '/executions',
      name: 'ExecutionList',
      component: () => import('@/views/ExecutionList.vue'),
    },
    {
      path: '/executions/:id',
      name: 'ExecutionDetail',
      component: () => import('@/views/ExecutionDetail.vue'),
    },
    {
      path: '/monitor',
      name: 'LiveMonitor',
      component: () => import('@/views/LiveMonitor.vue'),
    },
    {
      path: '/settings',
      name: 'GlobalConfig',
      component: () => import('@/views/GlobalConfig.vue'),
    },
    {
      path: '/skills',
      name: 'SkillList',
      component: () => import('@/views/SkillList.vue'),
    },
  ],
})

export default router
