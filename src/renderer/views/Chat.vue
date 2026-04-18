<template>
  <div class="chat-page">
    <el-container class="chat-layout">
      <el-aside width="260px" class="chat-sider">
        <div class="sider-header">
          <el-button type="primary" size="small" @click="doNew" :loading="creating" style="flex: 1">
            <el-icon><Plus /></el-icon>
            <span>新对话</span>
          </el-button>
          <el-button size="small" @click="refresh" :icon="Refresh" circle />
        </div>
        <el-scrollbar class="session-list">
          <div
            v-for="s in chat.sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: chat.current?.id === s.id }"
            @click="select(s.id)"
          >
            <div class="session-title">{{ s.title || '新对话' }}</div>
            <div class="session-meta">
              <span class="msg-count">{{ s.messageCount }} 条</span>
              <span class="created">{{ formatTime(s.createdAt) }}</span>
            </div>
            <el-button link size="small" type="danger" class="del-btn" @click.stop="remove(s.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-empty v-if="chat.sessions.length === 0" description="暂无会话" :image-size="60" />
        </el-scrollbar>
      </el-aside>

      <el-main class="chat-main">
        <div class="chat-topbar">
          <div class="workspace-selector" @click="openWorkspaceDialog">
            <el-icon><FolderOpened /></el-icon>
            <span class="path">{{ chat.current?.workingDir || '默认工作目录' }}</span>
          </div>
          <el-select v-model="envKey" placeholder="环境（可选）" clearable size="small" style="width: 140px">
            <el-option label="prod" value="prod" />
            <el-option label="test" value="test" />
          </el-select>
          <span style="flex: 1"></span>
          <span v-if="chat.current?.resumeId" class="resume-id">resumeId: {{ chat.current.resumeId.slice(0, 8) }}…</span>
        </div>

        <div v-if="!chat.current" class="empty-state">
          <el-empty description="正在初始化会话..." />
        </div>
        <template v-else>
          <el-scrollbar ref="scrollRef" class="messages">
            <div
              v-for="(m, i) in chat.parsedMessages"
              :key="i"
              class="message"
              :class="m.role"
            >
              <div v-if="m.role === 'user'" class="bubble user">
                <pre class="text">{{ m.raw }}</pre>
              </div>
              <div v-else-if="m.role === 'assistant'" class="bubble assistant">
                <template v-for="(seg, si) in m.segments" :key="si">
                  <div v-if="seg.type === 'text' || seg.type === 'result'" class="text-segment">{{ seg.content }}</div>
                  <div v-else-if="seg.type === 'tool'" class="tool-block">
                    <div class="tool-header" @click="toggleTool(i, si)">
                      <span class="tool-toggle" :class="{ expanded: isExpanded(i, si) }">▶</span>
                      <span class="tool-label">🔧 {{ seg.name }}</span>
                    </div>
                    <pre v-show="isExpanded(i, si)" class="tool-content">{{ seg.content || '(empty)' }}</pre>
                  </div>
                  <div v-else-if="seg.type === 'tool_result'" class="tool-block result">
                    <div class="tool-header" @click="toggleTool(i, si)">
                      <span class="tool-toggle" :class="{ expanded: isExpanded(i, si) }">▶</span>
                      <span class="tool-label">✅ Tool Result</span>
                    </div>
                    <pre v-show="isExpanded(i, si)" class="tool-content">{{ seg.content }}</pre>
                  </div>
                </template>
              </div>
              <div v-else class="bubble system">
                <pre class="text">{{ m.raw }}</pre>
              </div>
            </div>

            <div v-if="chat.streaming" class="message assistant">
              <div class="bubble assistant streaming">
                <template v-for="(seg, si) in chat.liveSegments" :key="'live-' + si">
                  <div v-if="seg.type === 'text' || seg.type === 'result'" class="text-segment">{{ seg.content }}</div>
                  <div v-else-if="seg.type === 'tool'" class="tool-block">
                    <div class="tool-header" @click="toggleLive(si)">
                      <span class="tool-toggle" :class="{ expanded: liveExpanded.has(si) }">▶</span>
                      <span class="tool-label">🔧 {{ seg.name }}</span>
                    </div>
                    <pre v-show="liveExpanded.has(si)" class="tool-content">{{ seg.content || '(streaming...)' }}</pre>
                  </div>
                  <div v-else-if="seg.type === 'tool_result'" class="tool-block result">
                    <div class="tool-header" @click="toggleLive(si)">
                      <span class="tool-toggle" :class="{ expanded: liveExpanded.has(si) }">▶</span>
                      <span class="tool-label">✅ Tool Result</span>
                    </div>
                    <pre v-show="liveExpanded.has(si)" class="tool-content">{{ seg.content }}</pre>
                  </div>
                </template>
                <div v-if="chat.liveSegments.length === 0" class="loading-dots"><span></span><span></span><span></span></div>
              </div>
            </div>
          </el-scrollbar>

          <div class="input-area">
            <el-input
              v-model="draft"
              type="textarea"
              :rows="3"
              placeholder="输入消息，Enter 发送，Ctrl+Enter 换行"
              :disabled="chat.streaming"
              @keydown.enter.exact.prevent="send"
              @keydown.ctrl.enter.exact.prevent="insertNewline"
            />
            <div class="input-actions">
              <el-button v-if="chat.streaming" type="danger" plain @click="chat.stop()">
                <el-icon><VideoPause /></el-icon>
                <span>停止</span>
              </el-button>
              <el-button type="primary" :loading="chat.streaming" :disabled="!draft.trim()" @click="send">
                <el-icon><Promotion /></el-icon>
                <span>发送</span>
              </el-button>
            </div>
          </div>
        </template>
      </el-main>
    </el-container>

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
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, nextTick, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Folder, Document, FolderOpened, Upload, Plus, Delete,
  Refresh, VideoPause, Promotion
} from '@element-plus/icons-vue';
import { useChatStore } from '../stores/chat';
import type { FileEntry } from '../api/filesystem';
import {
  listRoots, listPath, downloadUrl, uploadFile, deleteFile
} from '../api/filesystem';

const chat = useChatStore();

const draft = ref('');
const envKey = ref<string | undefined>(undefined);
const scrollRef = ref<{ setScrollTop: (v: number) => void; wrapRef?: HTMLElement } | null>(null);
const creating = ref(false);

// tool 折叠状态：key = messageIndex:segIndex
const expandedTools = reactive<Record<string, boolean>>({});
function toolKey(mi: number, si: number): string { return `${mi}:${si}`; }
function isExpanded(mi: number, si: number): boolean { return !!expandedTools[toolKey(mi, si)]; }
function toggleTool(mi: number, si: number): void {
  const k = toolKey(mi, si);
  expandedTools[k] = !expandedTools[k];
}
const liveExpanded = reactive(new Set<number>());
function toggleLive(si: number): void {
  if (liveExpanded.has(si)) liveExpanded.delete(si); else liveExpanded.add(si);
}

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
  try {
    await ElMessageBox.confirm('确认删除该会话?', '提示', { type: 'warning' });
    await chat.removeSession(id);
    ElMessage.success('已删除');
    if (!chat.current) await chat.ensureCurrent();
  } catch (e) { /* canceled */ }
}

async function doNew(): Promise<void> {
  creating.value = true;
  try {
    await chat.createSession();
  } catch (e) { ElMessage.error('创建失败'); }
  finally { creating.value = false; }
}

function send(): void {
  if (!draft.value.trim() || chat.streaming) return;
  const msg = draft.value;
  draft.value = '';
  chat.sendMessage(msg, envKey.value);
}

function insertNewline(): void {
  draft.value += '\n';
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

function formatSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function formatTime(ms: number | string): string {
  return new Date(ms).toLocaleString();
}

watch(() => chat.liveSegments.length, () => {
  nextTick(() => {
    const el = scrollRef.value?.wrapRef;
    if (el) el.scrollTop = el.scrollHeight;
  });
});

watch(() => chat.parsedMessages.length, () => {
  nextTick(() => {
    const el = scrollRef.value?.wrapRef;
    if (el) el.scrollTop = el.scrollHeight;
  });
});

onMounted(() => { void chat.ensureCurrent(); });
</script>

<style scoped>
.chat-page { height: calc(100vh - 60px); }
.chat-layout { height: 100%; background: #fff; }

.chat-sider { border-right: 1px solid #ebeef5; display: flex; flex-direction: column; background: #fafbfc; }
.sider-header { padding: 12px; border-bottom: 1px solid #ebeef5; display: flex; gap: 8px; }
.session-list { flex: 1; }
.session-item { position: relative; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.session-item:hover { background: #f0f2f5; }
.session-item.active { background: #ecf5ff; }
.session-title {
  font-weight: 500; font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding-right: 24px;
}
.session-meta { display: flex; gap: 8px; margin-top: 4px; font-size: 11px; color: #909399; }
.del-btn { position: absolute; top: 8px; right: 6px; opacity: 0; transition: opacity .15s; }
.session-item:hover .del-btn { opacity: 1; }

.chat-main { display: flex; flex-direction: column; padding: 0; background: #fff; }
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
.message { margin-bottom: 14px; display: flex; }
.message.user { justify-content: flex-end; }
.message.assistant { justify-content: flex-start; }
.message.system { justify-content: center; }

.bubble { max-width: 80%; padding: 10px 14px; border-radius: 8px; line-height: 1.6; font-size: 14px; }
.bubble.user { background: #409eff; color: #fff; }
.bubble.user .text { color: #fff; }
.bubble.assistant { background: #f5f7fa; color: #303133; }
.bubble.system { background: #fdf6ec; color: #b88230; font-size: 12px; }
.bubble.streaming { border: 1px dashed #409eff; min-width: 120px; }

.text { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 14px; }
.text-segment { white-space: pre-wrap; word-break: break-word; margin: 4px 0; }

.tool-block { margin: 8px 0; border: 1px solid #e4e7ed; border-radius: 6px; background: #fafbfc; overflow: hidden; }
.tool-block.result { background: #f0f9eb; border-color: #d9ecc8; }
.tool-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; user-select: none; font-size: 12px; color: #606266; }
.tool-header:hover { background: rgba(64, 158, 255, 0.06); }
.tool-toggle { font-size: 10px; transition: transform .15s; display: inline-block; }
.tool-toggle.expanded { transform: rotate(90deg); }
.tool-label { font-weight: 500; }
.tool-content { margin: 0; padding: 8px 12px; background: #272822; color: #f8f8f2; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow-y: auto; }

.loading-dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.loading-dots span { width: 6px; height: 6px; border-radius: 50%; background: #409eff; animation: dot 1.2s infinite; }
.loading-dots span:nth-child(2) { animation-delay: .2s; }
.loading-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes dot { 0%, 80%, 100% { opacity: .3; } 40% { opacity: 1; } }

.input-area { padding: 12px 16px; border-top: 1px solid #ebeef5; background: #fafafa; }
.input-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

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
