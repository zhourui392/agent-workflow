<template>
  <div class="fs-page">
    <el-card>
      <div class="toolbar">
        <el-select v-model="currentRoot" placeholder="选择根目录" style="width: 260px" @change="onRootChange">
          <el-option v-for="r in roots" :key="r" :label="r" :value="r" />
        </el-select>
        <el-button :disabled="!canGoUp" @click="goUp">上级</el-button>
        <el-button @click="reload">刷新</el-button>
        <el-upload
          :show-file-list="false"
          :before-upload="handleUpload"
          :disabled="!currentPath"
        >
          <el-button type="primary" :disabled="!currentPath">上传文件</el-button>
        </el-upload>
      </div>

      <div class="breadcrumb">
        <span class="label">当前路径:</span>
        <code>{{ currentPath || '未选择' }}</code>
      </div>

      <el-table :data="entries" v-loading="loading" empty-text="空目录">
        <el-table-column label="名称" min-width="260">
          <template #default="{ row }">
            <el-icon v-if="row.dir"><Folder /></el-icon>
            <el-icon v-else><Document /></el-icon>
            <a v-if="row.dir" href="#" class="name-link" @click.prevent="enter(row)">{{ row.name }}</a>
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ row.dir ? '目录' : '文件' }}</template>
        </el-table-column>
        <el-table-column label="大小" width="120">
          <template #default="{ row }">{{ row.dir ? '-' : formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="修改时间" width="200">
          <template #default="{ row }">{{ formatTime(row.lastModified) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <template v-if="!row.dir">
              <el-button size="small" link @click="download(row)">下载</el-button>
              <el-button size="small" link type="danger" @click="remove(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Folder, Document } from '@element-plus/icons-vue';
import type { FileEntry } from '../api/filesystem';
import {
  listRoots, listPath, downloadUrl, uploadFile, deleteFile
} from '../api/filesystem';

const roots = ref<string[]>([]);
const currentRoot = ref<string>('');
const currentPath = ref<string>('');
const entries = ref<FileEntry[]>([]);
const loading = ref(false);

const canGoUp = computed(() => currentPath.value && currentPath.value !== currentRoot.value);

async function loadRoots(): Promise<void> {
  try {
    const resp = await listRoots();
    roots.value = resp.data.roots;
    if (roots.value.length && !currentRoot.value) {
      currentRoot.value = roots.value[0];
      currentPath.value = roots.value[0];
      await reload();
    }
  } catch (e) { ElMessage.error('获取根目录失败'); }
}

async function reload(): Promise<void> {
  if (!currentPath.value) return;
  loading.value = true;
  try {
    const resp = await listPath(currentPath.value);
    entries.value = resp.data;
  } catch (e) { ElMessage.error('列目录失败'); }
  finally { loading.value = false; }
}

async function onRootChange(val: string): Promise<void> {
  currentPath.value = val;
  await reload();
}

async function enter(row: FileEntry): Promise<void> {
  currentPath.value = row.path;
  await reload();
}

function goUp(): void {
  const parts = currentPath.value.split('/').filter(Boolean);
  parts.pop();
  const parent = '/' + parts.join('/');
  if (parent.startsWith(currentRoot.value) || parent === currentRoot.value) {
    currentPath.value = parent || currentRoot.value;
    void reload();
  }
}

function download(row: FileEntry): void {
  window.open(downloadUrl(row.path), '_blank');
}

async function remove(row: FileEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.name}?`, '提示', { type: 'warning' });
    await deleteFile(row.path);
    ElMessage.success('已删除');
    await reload();
  } catch (e) { /* cancel or error */ }
}

async function handleUpload(file: File): Promise<boolean> {
  try {
    await uploadFile(currentPath.value, file);
    ElMessage.success('上传成功');
    await reload();
  } catch (e) { ElMessage.error('上传失败'); }
  return false; // 阻止默认上传
}

function formatSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

onMounted(() => { void loadRoots(); });
</script>

<style scoped>
.fs-page { padding: 0; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.breadcrumb { margin-bottom: 16px; font-size: 13px; }
.breadcrumb .label { color: #909399; margin-right: 8px; }
.breadcrumb code { background: #f5f7fa; padding: 2px 8px; border-radius: 4px; }
.name-link { margin-left: 6px; color: #409eff; text-decoration: none; }
.name-link:hover { text-decoration: underline; }
</style>
