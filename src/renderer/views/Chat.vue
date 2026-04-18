<template>
  <div class="chat-page">
    <el-container class="chat-layout">
      <el-aside width="280px" class="chat-sider">
        <div class="sider-header">
          <el-button type="primary" size="small" @click="openCreateDialog">新建会话</el-button>
          <el-button size="small" @click="refresh">刷新</el-button>
        </div>
        <el-scrollbar class="session-list">
          <div
            v-for="s in chat.sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: chat.current?.id === s.id }"
            @click="select(s.id)"
          >
            <div class="session-title">{{ s.title || (s.id.slice(0, 8)) }}</div>
            <div class="session-meta">
              <el-tag size="small" :type="s.agentType === 'claude' ? 'primary' : 'success'">{{ s.agentType }}</el-tag>
              <span class="msg-count">{{ s.messageCount }} msgs</span>
            </div>
            <div class="session-dir">{{ s.workingDir }}</div>
            <el-button link size="small" type="danger" @click.stop="remove(s.id)">删除</el-button>
          </div>
          <el-empty v-if="chat.sessions.length === 0" description="暂无会话" />
        </el-scrollbar>
      </el-aside>

      <el-main class="chat-main">
        <div class="chat-topbar">
          <div class="workspace-selector" @click="openWorkspaceDialog">
            <el-icon><FolderOpened /></el-icon>
            <span class="path">{{ chat.current?.workingDir || '选择工作目录' }}</span>
            <el-icon><ArrowDown /></el-icon>
          </div>
          <el-select v-model="envKey" placeholder="环境（可选）" clearable size="small" style="width: 140px">
            <el-option label="prod" value="prod" />
            <el-option label="test" value="test" />
          </el-select>
          <span style="flex: 1"></span>
          <el-tag v-if="chat.current?.agentType" :type="chat.current.agentType === 'claude' ? 'primary' : 'success'">
            {{ chat.current.agentType }}
          </el-tag>
          <span v-if="chat.current?.resumeId" class="resume-id">resumeId: {{ chat.current.resumeId }}</span>
        </div>

        <div v-if="!chat.current" class="empty-state">
          <el-empty description="请选择或创建一个会话" />
        </div>
        <template v-else>
          <el-scrollbar ref="scrollRef" class="messages">
            <div
              v-for="(m, i) in chat.current.messages"
              :key="i"
              class="message"
              :class="m.role"
            >
              <div class="role-tag">{{ m.role }}</div>
              <pre class="content">{{ m.content }}</pre>
            </div>
            <div v-if="chat.streaming" class="message assistant streaming">
              <div class="role-tag">assistant (streaming)</div>
              <pre class="content">{{ chat.liveChunks.join('\n') }}</pre>
            </div>
          </el-scrollbar>

          <div class="input-area">
            <el-input
              v-model="draft"
              type="textarea"
              :rows="3"
              placeholder="输入消息，Ctrl+Enter 发送"
              @keydown.ctrl.enter.prevent="send"
            />
            <el-button type="primary" :disabled="chat.streaming || !draft.trim()" @click="send">发送</el-button>
            <el-button v-if="chat.streaming" type="danger" @click="chat.stop()">停止</el-button>
          </div>
        </template>
      </el-main>
    </el-container>

    <el-dialog v-model="showCreateDialog" title="新建聊天会话" width="520px">
      <el-form label-width="90px">
        <el-form-item label="Agent">
          <el-radio-group v-model="newAgentType">
            <el-radio-button label="claude">Claude</el-radio-button>
            <el-radio-button label="codex">Codex</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="工作目录">
          <el-input v-model="newWorkingDir" placeholder="/home/user/project">
            <template #append>
              <el-button @click="openWorkspaceDialog">选择</el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showWorkspaceDialog" title="工作空间" width="640px">
      <el-form label-position="top" size="default">
        <el-form-item label="根路径">
          <el-select v-model="fsRoot" placeholder="选择根路径" style="width: 100%" @change="onRootChange">
            <el-option v-for="r in fsRoots" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="当前路径">
          <el-input v-model="fsPath" readonly>
            <template #prefix><el-icon><FolderOpened /></el-icon></template>
            <template #append>
              <el-button :disabled="!canGoUp" @click="goUp">上级</el-button>
              <el-button @click="reloadFs">刷新</el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <el-scrollbar height="320px" v-loading="fsLoading">
        <div
          v-for="item in fsEntries"
          :key="item.path"
          class="fs-item"
          @click="item.dir ? enter(item) : null"
        >
          <el-icon v-if="item.dir"><Folder /></el-icon>
          <el-icon v-else><Document /></el-icon>
          <span class="fs-name">{{ item.name }}</span>
          <span v-if="!item.dir" class="fs-size">{{ formatSize(item.size) }}</span>
          <span class="fs-time">{{ formatTime(item.lastModified) }}</span>
          <span class="fs-actions" v-if="!item.dir" @click.stop>
            <el-button link size="small" @click="download(item)">下载</el-button>
            <el-button link size="small" type="danger" @click="removeFile(item)">删除</el-button>
          </span>
        </div>
        <el-empty v-if="fsEntries.length === 0 && !fsLoading" description="空目录" :image-size="60" />
      </el-scrollbar>

      <div class="ws-footer">
        <el-upload
          :show-file-list="false"
          :before-upload="handleUpload"
          :disabled="!fsPath"
        >
          <el-button type="primary" :disabled="!fsPath">
            <el-icon><Upload /></el-icon>
            <span>上传文件</span>
          </el-button>
        </el-upload>
        <el-button @click="useAsWorkingDir" :disabled="!fsPath" type="success">
          用此目录新建会话
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, nextTick, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Folder, Document, FolderOpened, ArrowDown, Upload } from '@element-plus/icons-vue';
import { useChatStore } from '../stores/chat';
import type { AgentType } from '../api/chat';
import type { FileEntry } from '../api/filesystem';
import {
  listRoots, listPath, downloadUrl, uploadFile, deleteFile
} from '../api/filesystem';

const chat = useChatStore();

const showCreateDialog = ref(false);
const newAgentType = ref<AgentType>('claude');
const newWorkingDir = ref('');
const draft = ref('');
const envKey = ref<string | undefined>(undefined);
const scrollRef = ref<{ setScrollTop: (v: number) => void; wrapRef?: HTMLElement } | null>(null);

const showWorkspaceDialog = ref(false);
const fsRoots = ref<string[]>([]);
const fsRoot = ref<string>('');
const fsPath = ref<string>('');
const fsEntries = ref<FileEntry[]>([]);
const fsLoading = ref(false);

const canGoUp = computed(() => fsPath.value && fsPath.value !== fsRoot.value);

async function refresh(): Promise<void> {
  try { await chat.refreshList(); } catch (e) { ElMessage.error('刷新失败'); }
}

async function select(id: string): Promise<void> {
  try { await chat.loadSession(id); } catch (e) { ElMessage.error('加载失败'); }
}

async function remove(id: string): Promise<void> {
  try { await chat.removeSession(id); ElMessage.success('已删除'); }
  catch (e) { ElMessage.error('删除失败'); }
}

function openCreateDialog(): void {
  newWorkingDir.value = fsPath.value || '';
  showCreateDialog.value = true;
}

async function doCreate(): Promise<void> {
  if (!newWorkingDir.value.trim()) { ElMessage.warning('请填写工作目录'); return; }
  try {
    await chat.createSession(newAgentType.value, newWorkingDir.value.trim());
    showCreateDialog.value = false;
    newWorkingDir.value = '';
  } catch (e) { ElMessage.error('创建失败'); }
}

function send(): void {
  if (!draft.value.trim() || chat.streaming) return;
  const msg = draft.value;
  draft.value = '';
  chat.sendMessage(msg, envKey.value);
}

async function openWorkspaceDialog(): Promise<void> {
  showWorkspaceDialog.value = true;
  if (fsRoots.value.length === 0) await loadRoots();
}

async function loadRoots(): Promise<void> {
  try {
    const resp = await listRoots();
    fsRoots.value = resp.data.roots;
    if (fsRoots.value.length && !fsRoot.value) {
      fsRoot.value = fsRoots.value[0];
      fsPath.value = fsRoots.value[0];
      await reloadFs();
    }
  } catch (e) { ElMessage.error('获取根目录失败'); }
}

async function reloadFs(): Promise<void> {
  if (!fsPath.value) return;
  fsLoading.value = true;
  try {
    const resp = await listPath(fsPath.value);
    fsEntries.value = resp.data;
  } catch (e) { ElMessage.error('列目录失败'); }
  finally { fsLoading.value = false; }
}

async function onRootChange(val: string): Promise<void> {
  fsPath.value = val;
  await reloadFs();
}

async function enter(row: FileEntry): Promise<void> {
  fsPath.value = row.path;
  await reloadFs();
}

function goUp(): void {
  const parts = fsPath.value.split('/').filter(Boolean);
  parts.pop();
  const parent = '/' + parts.join('/');
  if (parent.startsWith(fsRoot.value) || parent === fsRoot.value) {
    fsPath.value = parent || fsRoot.value;
    void reloadFs();
  }
}

function download(row: FileEntry): void {
  window.open(downloadUrl(row.path), '_blank');
}

async function removeFile(row: FileEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.name}?`, '提示', { type: 'warning' });
    await deleteFile(row.path);
    ElMessage.success('已删除');
    await reloadFs();
  } catch (e) { /* cancel or error */ }
}

async function handleUpload(file: File): Promise<boolean> {
  try {
    await uploadFile(fsPath.value, file);
    ElMessage.success('上传成功');
    await reloadFs();
  } catch (e) { ElMessage.error('上传失败'); }
  return false;
}

function useAsWorkingDir(): void {
  newWorkingDir.value = fsPath.value;
  showWorkspaceDialog.value = false;
  showCreateDialog.value = true;
}

function formatSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

watch(() => chat.liveChunks.length, () => {
  nextTick(() => {
    const el = scrollRef.value?.wrapRef;
    if (el) el.scrollTop = el.scrollHeight;
  });
});

onMounted(() => { void refresh(); });
</script>

<style scoped>
.chat-page { height: calc(100vh - 140px); }
.chat-layout { height: 100%; background: #fff; }
.chat-sider { border-right: 1px solid #ebeef5; display: flex; flex-direction: column; }
.sider-header { padding: 12px; border-bottom: 1px solid #ebeef5; }
.session-list { flex: 1; }
.session-item { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.session-item:hover { background: #f5f7fa; }
.session-item.active { background: #ecf5ff; }
.session-title { font-weight: 500; }
.session-meta { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; color: #909399; }
.session-dir { font-size: 11px; color: #c0c4cc; word-break: break-all; }
.chat-main { display: flex; flex-direction: column; padding: 0; }
.chat-topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid #ebeef5; background: #fafafa;
}
.workspace-selector {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border: 1px solid #dcdfe6; border-radius: 4px;
  cursor: pointer; background: #fff; max-width: 420px;
}
.workspace-selector:hover { border-color: #409eff; }
.workspace-selector .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.resume-id { font-size: 12px; color: #909399; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }
.messages { flex: 1; padding: 16px; }
.message { margin-bottom: 16px; padding: 12px; border-radius: 6px; }
.message.user { background: #ecf5ff; }
.message.assistant { background: #f5f7fa; }
.message.streaming { border: 1px dashed #409eff; }
.role-tag { font-size: 11px; color: #909399; margin-bottom: 4px; text-transform: uppercase; }
.content { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, monospace; font-size: 13px; }
.input-area { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #ebeef5; align-items: flex-end; }
.input-area .el-input { flex: 1; }

.fs-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid #f5f7fa; cursor: pointer;
}
.fs-item:hover { background: #f5f7fa; }
.fs-name { flex: 1; font-size: 13px; }
.fs-size { color: #909399; font-size: 12px; width: 80px; text-align: right; }
.fs-time { color: #c0c4cc; font-size: 12px; width: 160px; text-align: right; }
.fs-actions { display: inline-flex; gap: 4px; }
.ws-footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; }
</style>
