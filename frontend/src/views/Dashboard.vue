<template>
  <div class="dashboard">
    <div class="page-header">
      <h2>执行统计</h2>
      <el-select v-model="days" @change="fetchStats" style="width: 150px">
        <el-option label="最近 7 天" :value="7" />
        <el-option label="最近 14 天" :value="14" />
        <el-option label="最近 30 天" :value="30" />
        <el-option label="最近 90 天" :value="90" />
      </el-select>
    </div>

    <!-- Summary Cards -->
    <el-row :gutter="20" class="summary-row">
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-value">{{ summary.total_executions }}</div>
          <div class="summary-label">总执行次数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card success">
          <div class="summary-value">{{ summary.success_count }}</div>
          <div class="summary-label">成功</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card danger">
          <div class="summary-value">{{ summary.failed_count }}</div>
          <div class="summary-label">失败</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="summary-card warning">
          <div class="summary-value">{{ summary.success_rate }}%</div>
          <div class="summary-label">成功率</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="summary-row">
      <el-col :span="24">
        <el-card shadow="hover" class="summary-card info">
          <div class="summary-value">{{ formatTokens(summary.total_tokens) }}</div>
          <div class="summary-label">总 Token 用量</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Execution Count Chart -->
    <el-card class="chart-card">
      <template #header>执行趋势</template>
      <v-chart :option="executionChartOption" style="height: 350px" autoresize />
    </el-card>

    <!-- Token Usage Chart -->
    <el-card class="chart-card">
      <template #header>Token 用量趋势</template>
      <v-chart :option="tokenChartOption" style="height: 350px" autoresize />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { getExecutionStats } from '@/api/executions'
import type { DailyStats, StatsResponse } from '@/api/executions'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent])

const days = ref(30)
const daily = ref<DailyStats[]>([])
const summary = ref<StatsResponse['summary']>({
  total_executions: 0,
  success_count: 0,
  failed_count: 0,
  total_tokens: 0,
  success_rate: 0,
})

async function fetchStats() {
  try {
    const { data } = await getExecutionStats({ days: days.value })
    daily.value = data.daily
    summary.value = data.summary
  } catch {
    // ignore
  }
}

onMounted(fetchStats)

function formatTokens(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

const executionChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['成功', '失败', '总计'] },
  grid: { left: 50, right: 30, bottom: 30 },
  xAxis: { type: 'category', data: daily.value.map(d => d.date.slice(5)) },
  yAxis: { type: 'value', minInterval: 1 },
  series: [
    { name: '总计', type: 'bar', data: daily.value.map(d => d.total), itemStyle: { color: '#909399' }, barMaxWidth: 20 },
    { name: '成功', type: 'line', data: daily.value.map(d => d.success), smooth: true, itemStyle: { color: '#67c23a' } },
    { name: '失败', type: 'line', data: daily.value.map(d => d.failed), smooth: true, itemStyle: { color: '#f56c6c' } },
  ],
}))

const tokenChartOption = computed(() => ({
  tooltip: { trigger: 'axis', formatter: (params: any) => {
    const p = params[0]
    return `${p.axisValue}<br/>${p.seriesName}: ${formatTokens(p.value)}`
  }},
  grid: { left: 60, right: 30, bottom: 30 },
  xAxis: { type: 'category', data: daily.value.map(d => d.date.slice(5)) },
  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatTokens(v) } },
  series: [
    { name: 'Token 用量', type: 'bar', data: daily.value.map(d => d.total_tokens), itemStyle: { color: '#409eff' }, barMaxWidth: 20 },
  ],
}))
</script>

<style scoped>
.dashboard { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.summary-row { margin-bottom: 20px; }
.summary-card { text-align: center; }
.summary-value { font-size: 28px; font-weight: bold; color: #303133; }
.summary-label { font-size: 14px; color: #909399; margin-top: 4px; }
.summary-card.success .summary-value { color: #67c23a; }
.summary-card.danger .summary-value { color: #f56c6c; }
.summary-card.warning .summary-value { color: #e6a23c; }
.summary-card.info .summary-value { color: #409eff; }
.chart-card { margin-bottom: 20px; }
</style>
