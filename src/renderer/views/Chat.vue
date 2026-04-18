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
          <div v-if="envs.length > 0" class="env-switcher">
            <span class="env-switcher-label">环境</span>
            <el-radio-group v-model="envKey" size="small" class="env-radio-group">
              <el-radio-button value="">无</el-radio-button>
              <el-radio-button
                v-for="e in envs"
                :key="e.key"
                :value="e.key"
                class="env-option"
                :class="`env-option-${e.key}`"
              >{{ e.label || e.key }}</el-radio-button>
            </el-radio-group>
            <el-tooltip raw-content content="环境选择使用注入限制提示词<br/>生产环境只能根据日志定位问题" placement="bottom">
              <span class="env-help-mark">?</span>
            </el-tooltip>
          </div>
          <div class="workspace-selector" @click="openWorkspaceDialog">
            <el-icon><FolderOpened /></el-icon>
            <span class="path">{{ chat.current?.workingDir || '默认工作目录' }}</span>
          </div>

          <el-popover
            v-if="envKey === 'test' && chat.current"
            trigger="click"
            :width="420"
            placement="bottom-start"
          >
            <template #reference>
              <el-tag type="success" style="cursor: pointer; flex-shrink: 0">
                🌿 {{ currentBranch || '选择分支' }}
              </el-tag>
            </template>
            <div style="display: flex; gap: 8px; align-items: center">
              <el-select
                v-model="selectedBranch"
                filterable
                allow-create
                default-first-option
                clearable
                size="small"
                placeholder="选择或输入分支名"
                style="flex: 1"
                :teleported="false"
              >
                <el-option v-for="b in savedBranches" :key="b" :label="b" :value="b" />
              </el-select>
              <el-button
                type="primary"
                size="small"
                :loading="switching"
                :disabled="!selectedBranch"
                @click="doSwitchBranch"
              >切换</el-button>
              <el-button
                size="small"
                :loading="updating"
                :disabled="!currentBranch"
                @click="doUpdateBranch"
              >更新</el-button>
            </div>
            <div v-if="savedBranches.length > 0" style="margin-top: 10px">
              <el-tag
                v-for="b in savedBranches"
                :key="b"
                closable
                size="small"
                :type="b === currentBranch ? 'success' : 'info'"
                style="margin: 2px; cursor: pointer"
                @close="doRemoveSavedBranch(b)"
                @click="selectedBranch = b"
              >{{ b }}</el-tag>
            </div>
            <div v-if="switchResultCreated.length > 0" class="wt-result">
              <div v-for="r in switchResultCreated" :key="'sw-' + r.name">
                <span v-if="r.created" style="color:#67c23a">✅</span>
                <span v-else-if="r.existed" style="color:#909399">◎</span>
                <span v-else style="color:#f56c6c">✗</span>
                {{ r.name }}
                <span v-if="r.existed" style="color:#909399">(已存在)</span>
                <span v-if="r.actualBranch && r.actualBranch !== currentBranch" style="color:#e6a23c">
                  (当前在 {{ r.actualBranch || 'detached' }})
                </span>
                <span v-if="r.reason && !r.created && !r.existed" style="color:#f56c6c">{{ r.reason }}</span>
              </div>
            </div>
            <div v-if="updateResult.length > 0" class="wt-result">
              <div v-for="r in updateResult" :key="'up-' + r.name">
                <span v-if="r.updated" style="color:#67c23a">✅</span>
                <span v-else-if="r.skipped" style="color:#909399">◎</span>
                <span v-else style="color:#f56c6c">✗</span>
                {{ r.name }}
                <span style="color:#909399">{{ r.reason }}</span>
              </div>
            </div>
          </el-popover>

          <span style="flex: 1"></span>
          <el-popover trigger="click" :width="400" placement="bottom-end">
            <template #reference>
              <el-button size="small" plain>
                <el-icon><QuestionFilled /></el-icon>
                <span>使用说明</span>
              </el-button>
            </template>
            <div class="usage-guide">
              <div class="guide-heading">快速开始</div>
              <ol>
                <li>（可选）点击顶部<b>工作目录</b>，选择项目根路径</li>
                <li>（可选）切换<b>环境</b>：测试 / 生产会注入对应约束提示词</li>
                <li>测试环境下可点击 🌿 <b>分支标签</b> 切换或更新 worktree</li>
                <li>在底部输入框提问，<el-tag size="small" effect="plain">Enter</el-tag> 发送，<el-tag size="small" effect="plain">Ctrl+Enter</el-tag> 换行</li>
              </ol>
              <div class="guide-heading">输入技巧</div>
              <ul>
                <li><b>清除上下文</b>：开启新一轮对话但保留会话</li>
                <li><b>停止</b>：中断当前 AI 回答</li>
              </ul>
              <div class="guide-heading">侧边栏</div>
              <ul>
                <li>点击 <b>新对话</b> 开启新会话；点击会话项切换；🗑 <b>删除</b></li>
              </ul>
              <div class="guide-heading">其他</div>
              <ul>
                <li><b>分享</b>：导出当前会话</li>
                <li><b>工作空间</b>弹窗支持 上传 / 下载 / 删除 文件</li>
              </ul>
            </div>
          </el-popover>
          <el-button
            v-if="chat.current"
            size="small"
            :loading="sharing"
            @click="doShare"
          >
            <el-icon><Share /></el-icon>
            <span>分享</span>
          </el-button>
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
                <pre class="text">{{ m.content }}</pre>
              </div>
              <div v-else-if="m.role === 'assistant'" class="bubble assistant">
                <ChatAssistantRenderer :events="m.events" :output-text="m.content" />
              </div>
              <div v-else class="bubble system">
                <pre class="text">{{ m.content }}</pre>
              </div>
            </div>

            <div v-if="chat.streaming" class="message assistant">
              <div class="bubble assistant streaming">
                <ChatAssistantRenderer v-if="hasRenderableLiveEvents" :events="chat.liveEvents" />
                <div v-else class="loading-dots"><span></span><span></span><span></span></div>
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
              <el-button
                plain
                size="small"
                :disabled="!chat.current || chat.streaming"
                @click="doClearContext"
              >
                <el-icon><Delete /></el-icon>
                <span>清除上下文</span>
              </el-button>
              <span style="flex: 1"></span>
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
          <span v-if="item.name !== '..'" class="fs-time">{{ formatTime(item.lastModified) }}</span>
          <span class="fs-actions" v-if="!item.dir && item.name !== '..'" @click.stop>
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
import { computed, onMounted, ref, nextTick, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Folder, Document, FolderOpened, Upload, Plus, Delete,
  Refresh, VideoPause, Promotion, Share, QuestionFilled
} from '@element-plus/icons-vue';
import ChatAssistantRenderer from '../components/ChatAssistantRenderer.vue';
import { useChatStore } from '../stores/chat';
import { shareSession, getChatConfig, type EnvOption } from '../api/chat';
import {
  switchBranch as apiSwitchBranch,
  updateBranch as apiUpdateBranch,
  removeBranch as apiRemoveBranch,
  type RepoStatus
} from '../api/worktree';
import type { FileEntry } from '../api/filesystem';
import {
  listRoots, listPath, downloadUrl, uploadFile, deleteFile
} from '../api/filesystem';

const chat = useChatStore();

const hasRenderableLiveEvents = computed(() =>
  chat.liveEvents.some(e => e.type === 'text' || e.type === 'tool_call' || e.type === 'tool_result')
);

const draft = ref('');
const envs = ref<EnvOption[]>([]);
const envKey = ref<string>('');
const scrollRef = ref<{ setScrollTop: (v: number) => void; wrapRef?: HTMLElement } | null>(null);
const creating = ref(false);
const sharing = ref(false);

// === Worktree 状态 ===
interface WorktreeState { originalWorkingDir: string; currentBranch: string; worktreePath: string }
const LS_BRANCHES = 'agent_saved_branches';
const LS_WORKTREE = 'agent_worktree_state';

const savedBranches = ref<string[]>(loadSavedBranches());
const selectedBranch = ref<string>('');
const switching = ref(false);
const updating = ref(false);
const switchResultCreated = ref<RepoStatus[]>([]);
const updateResult = ref<RepoStatus[]>([]);

function loadSavedBranches(): string[] {
  try {
    const raw = localStorage.getItem(LS_BRANCHES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistSavedBranches(): void {
  localStorage.setItem(LS_BRANCHES, JSON.stringify(savedBranches.value));
}

function loadAllState(): Record<string, WorktreeState> {
  try {
    const raw = localStorage.getItem(LS_WORKTREE);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveSessionState(sessionId: string, state: WorktreeState | null): void {
  const all = loadAllState();
  if (state) all[sessionId] = state; else delete all[sessionId];
  localStorage.setItem(LS_WORKTREE, JSON.stringify(all));
}
function getSessionState(sessionId: string): WorktreeState | null {
  const all = loadAllState();
  return all[sessionId] ?? null;
}

const currentBranch = computed<string>(() => {
  const id = chat.current?.id;
  if (!id) return '';
  return getSessionState(id)?.currentBranch ?? '';
});

async function doSwitchBranch(): Promise<void> {
  if (!chat.current || !selectedBranch.value) return;
  const sid = chat.current.id;
  const branch = selectedBranch.value.trim();
  const existing = getSessionState(sid);
  const workspace = existing?.originalWorkingDir ?? chat.current.workingDir;
  switching.value = true;
  switchResultCreated.value = [];
  updateResult.value = [];
  try {
    const resp = await apiSwitchBranch(workspace, branch);
    // 展示创建/已存在/失败：所有与目标分支相关或失败的结果都显示
    switchResultCreated.value = resp.data.repos.filter(
      r => r.created || r.existed || (!r.created && !r.existed && r.reason)
    );
    saveSessionState(sid, {
      originalWorkingDir: workspace,
      currentBranch: branch,
      worktreePath: resp.data.worktreePath
    });
    if (!savedBranches.value.includes(branch)) {
      savedBranches.value.push(branch);
      persistSavedBranches();
    }
    await chat.changeWorkingDir(resp.data.worktreePath);
    // 切换成功 = 已在目标分支（新建 or 之前已建好）
    const onBranch = resp.data.repos.filter(r => r.actualBranch === branch).length;
    const newlyCreated = resp.data.repos.filter(r => r.created && r.actualBranch === branch).length;
    const failed = resp.data.repos.filter(r => !r.created && !r.existed && r.reason).length;
    const msg = `已切换到 ${branch}：${onBranch} 个服务在目标分支` +
      (newlyCreated > 0 ? `（新建 ${newlyCreated}）` : '') +
      (failed > 0 ? `，${failed} 个失败` : '');
    if (failed > 0) ElMessage.warning(msg);
    else ElMessage.success(msg);
  } catch (e) {
    ElMessage.error('切换失败');
  } finally {
    switching.value = false;
  }
}

async function doUpdateBranch(): Promise<void> {
  if (!chat.current) return;
  const sid = chat.current.id;
  const state = getSessionState(sid);
  if (!state) return;
  updating.value = true;
  updateResult.value = [];
  switchResultCreated.value = [];
  try {
    const resp = await apiUpdateBranch(state.originalWorkingDir, state.currentBranch);
    updateResult.value = resp.data.repos;
    const ok = resp.data.repos.filter(r => r.updated).length;
    const failed = resp.data.repos.filter(r => !r.updated && !r.skipped).length;
    if (failed === 0) ElMessage.success(`已更新 ${ok} 个服务`);
    else ElMessage.warning(`成功 ${ok}，失败 ${failed}`);
  } catch (e) {
    ElMessage.error('更新失败');
  } finally {
    updating.value = false;
  }
}

async function doClearBranch(): Promise<void> {
  if (!chat.current) return;
  const sid = chat.current.id;
  const state = getSessionState(sid);
  if (!state) return;
  try {
    saveSessionState(sid, null);
    selectedBranch.value = '';
    switchResultCreated.value = [];
    updateResult.value = [];
    await chat.changeWorkingDir(state.originalWorkingDir);
    ElMessage.success('已还原工作目录');
  } catch (e) {
    ElMessage.error('还原失败');
  }
}

async function doRemoveSavedBranch(branch: string): Promise<void> {
  if (!chat.current) return;
  const state = getSessionState(chat.current.id);
  const workspace = state?.originalWorkingDir ?? chat.current.workingDir;
  try {
    await apiRemoveBranch(workspace, branch);
    ElMessage.success(`已清理分支 ${branch} 的 worktree`);
  } catch {
    ElMessage.warning('清理 worktree 失败，已移除标签');
  }
  savedBranches.value = savedBranches.value.filter(b => b !== branch);
  persistSavedBranches();
  if (state && state.currentBranch === branch) {
    await doClearBranch();
  } else if (selectedBranch.value === branch) {
    selectedBranch.value = '';
  }
}

async function doShare(): Promise<void> {
  if (!chat.current) return;
  sharing.value = true;
  try {
    const resp = await shareSession(chat.current.id);
    const url = `${window.location.origin}/share/${resp.data.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      ElMessage.success('分享链接已复制到剪贴板');
    } catch {
      ElMessageBox.alert(url, '分享链接', { confirmButtonText: '关闭' });
    }
  } catch (e) {
    ElMessage.error('分享失败');
  } finally {
    sharing.value = false;
  }
}


const showWorkspaceDialog = ref(false);
const fsRoots = ref<string[]>([]);
const fsRoot = ref<string>('');
const fsPath = ref<string>('');
const fsEntries = ref<FileEntry[]>([]);
const fsLoading = ref(false);

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
  try { await chat.createSession(); }
  catch (e) { ElMessage.error('创建失败'); }
  finally { creating.value = false; }
}

function send(): void {
  if (!draft.value.trim() || chat.streaming) return;
  const msg = draft.value;
  draft.value = '';
  chat.sendMessage(msg, envKey.value || undefined);
}

function insertNewline(): void { draft.value += '\n'; }

async function doClearContext(): Promise<void> {
  if (!chat.current) return;
  try {
    await chat.clearContext();
    ElMessage.success('上下文已清除');
  } catch (e) {
    ElMessage.error('清除失败');
  }
}

async function openWorkspaceDialog(): Promise<void> {
  showWorkspaceDialog.value = true;
  if (fsRoots.value.length === 0) await loadRoots();
  await syncDialogToCurrentWorkingDir();
}

function isUnderPath(child: string, parent: string): boolean {
  if (child === parent) return true;
  const norm = (s: string): string => s.replace(/\\/g, '/').replace(/\/+$/, '');
  const c = norm(child);
  const p = norm(parent);
  return c === p || c.startsWith(p + '/');
}

async function syncDialogToCurrentWorkingDir(): Promise<void> {
  const cwd = chat.current?.workingDir;
  if (!cwd) return;
  const match = fsRoots.value.find(r => isUnderPath(cwd, r));
  if (match && match !== fsRoot.value) fsRoot.value = match;
  if (cwd !== fsPath.value) {
    fsPath.value = cwd;
    await reloadFs();
  }
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

function formatTime(ms: number | string): string { return new Date(ms).toLocaleString(); }

watch(() => chat.liveEvents.length, () => {
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

// 环境切换 ⇄ 工作目录联动：test 用 worktree 路径，非 test 还原到 originalWorkingDir
watch(envKey, async (next, prev) => {
  if (next === prev) return;
  if (!chat.current) return;
  const state = getSessionState(chat.current.id);
  if (!state) return;
  const target = next === 'test' ? state.worktreePath : state.originalWorkingDir;
  if (!target || target === chat.current.workingDir) return;
  await chat.changeWorkingDir(target);
});

async function loadEnvConfig(): Promise<void> {
  try {
    const resp = await getChatConfig();
    envs.value = resp.data.envs || [];
    // 默认选中 test（若存在），否则回退到无
    if (!envKey.value && envs.value.some(e => e.key === 'test')) {
      envKey.value = 'test';
    }
    if (envKey.value && !envs.value.some(e => e.key === envKey.value)) {
      envKey.value = '';
    }
  } catch {
    envs.value = [];
  }
}

onMounted(() => {
  void chat.ensureCurrent();
  void loadEnvConfig();
});
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

.env-switcher {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 8px 4px 10px; border-radius: 6px;
  background: #fff; border: 1px solid #dcdfe6;
}
.env-switcher-label {
  font-size: 12px; font-weight: 600; color: #606266; letter-spacing: 0.3px;
}
.env-radio-group :deep(.el-radio-button__inner) {
  padding: 6px 14px; font-size: 12px; font-weight: 600;
}
.env-radio-group :deep(.env-option-test.is-active .el-radio-button__inner),
.env-radio-group :deep(.env-option-test .el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #67c23a; border-color: #67c23a; box-shadow: -1px 0 0 0 #67c23a;
}
.env-radio-group :deep(.env-option-prod.is-active .el-radio-button__inner),
.env-radio-group :deep(.env-option-prod .el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #f56c6c; border-color: #f56c6c; box-shadow: -1px 0 0 0 #f56c6c;
}
.env-help-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  border: 1.5px solid #909399; color: #909399;
  font-size: 12px; font-weight: bold; cursor: pointer; user-select: none; flex-shrink: 0;
}

.usage-guide { font-size: 13px; line-height: 1.7; max-height: 70vh; overflow-y: auto; }
.usage-guide .guide-heading { font-weight: 600; color: #303133; margin-bottom: 6px; }
.usage-guide ol, .usage-guide ul { padding-left: 20px; margin: 0 0 10px; }
.usage-guide ul:last-child, .usage-guide ol:last-child { margin-bottom: 0; }

.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }
.messages { flex: 1; padding: 16px; }
.message { margin-bottom: 14px; display: flex; }
.message.user { justify-content: flex-end; }
.message.assistant { justify-content: flex-start; }
.message.system { justify-content: center; }

.bubble { max-width: 85%; padding: 10px 14px; border-radius: 8px; line-height: 1.6; font-size: 14px; }
.bubble.user { background: #409eff; color: #fff; }
.bubble.user .text { color: #fff; }
.bubble.assistant { background: #f5f7fa; color: #303133; }
.bubble.system { background: #fdf6ec; color: #b88230; font-size: 12px; }
.bubble.streaming { border: 1px dashed #409eff; min-width: 120px; }

.text { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 14px; }
.text-segment { margin: 4px 0; }
.text-segment.markdown :deep(p) { margin: 6px 0; }
.text-segment.markdown :deep(pre) {
  background: #272822; color: #f8f8f2; padding: 10px 12px; border-radius: 4px;
  overflow-x: auto; font-size: 12px; margin: 8px 0;
}
.text-segment.markdown :deep(code) {
  background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px;
  font-family: ui-monospace, monospace; font-size: 12.5px;
}
.text-segment.markdown :deep(pre code) { background: transparent; padding: 0; color: inherit; font-size: 12px; }
.text-segment.markdown :deep(ul), .text-segment.markdown :deep(ol) { padding-left: 22px; margin: 6px 0; }
.text-segment.markdown :deep(blockquote) {
  border-left: 3px solid #dcdfe6; padding-left: 10px; color: #606266; margin: 6px 0;
}
.text-segment.markdown :deep(h1),
.text-segment.markdown :deep(h2),
.text-segment.markdown :deep(h3) { margin: 10px 0 6px; font-weight: 600; }
.text-segment.markdown :deep(table) { border-collapse: collapse; margin: 8px 0; }
.text-segment.markdown :deep(th),
.text-segment.markdown :deep(td) { border: 1px solid #dcdfe6; padding: 4px 8px; }

.tool-block { margin: 8px 0; border: 1px solid #e4e7ed; border-radius: 6px; background: #fafbfc; overflow: hidden; }
.tool-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; user-select: none; font-size: 12px; color: #606266; }
.tool-header:hover { background: rgba(64, 158, 255, 0.06); }
.tool-toggle { font-size: 10px; transition: transform .15s; display: inline-block; }
.tool-toggle.expanded { transform: rotate(90deg); }
.tool-label { font-weight: 500; }
.tool-content { margin: 0; padding: 8px 12px; background: #272822; color: #f8f8f2; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 360px; overflow-y: auto; }

.loading-dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.loading-dots span { width: 6px; height: 6px; border-radius: 50%; background: #409eff; animation: dot 1.2s infinite; }
.loading-dots span:nth-child(2) { animation-delay: .2s; }
.loading-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes dot { 0%, 80%, 100% { opacity: .3; } 40% { opacity: 1; } }

.input-area { padding: 12px 16px; border-top: 1px solid #ebeef5; background: #fafafa; }
.wt-result { margin-top: 10px; font-size: 12px; color: #606266; max-height: 200px; overflow-y: auto; }
.wt-result > div { padding: 2px 0; }
.input-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }

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
