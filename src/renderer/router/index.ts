import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/chat',
      name: 'Chat',
      component: () => import('@/views/Chat.vue'),
    },
    {
      path: '/',
      component: () => import('@/layouts/WorkflowLayout.vue'),
      children: [
        { path: '', name: 'WorkflowList', component: () => import('@/views/WorkflowList.vue') },
        { path: 'executions', name: 'ExecutionList', component: () => import('@/views/ExecutionList.vue') },
        { path: 'executions/:id', name: 'ExecutionDetail', component: () => import('@/views/ExecutionDetail.vue') },
        { path: 'settings', name: 'GlobalConfig', component: () => import('@/views/GlobalConfig.vue') },
        { path: 'skills', name: 'SkillList', component: () => import('@/views/SkillList.vue') },
      ],
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
  ],
})

export default router
