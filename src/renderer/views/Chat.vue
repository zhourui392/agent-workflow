<template>
  <div class="chat-page">
    <el-container class="chat-layout">
      <el-aside width="280px" class="chat-sider">
        <div class="sider-header">
          <el-button type="primary" size="small" @click="showCreateDialog = true">新建会话</el-button>
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
        <div v-if="!chat.current" class="empty-state">
          <el-empty description="请选择或创建一个会话" />
        </div>
        <template v-else>
          <div class="chat-header">
            <h3>{{ chat.current.workingDir }}</h3>
            <div>
              <el-tag :type="chat.current.agentType === 'claude' ? 'primary' : 'success'">{{ chat.current.agentType }}</el-tag>
              <span v-if="chat.current.resumeId" class="resume-id">resumeId: {{ chat.current.resumeId }}</span>
            </div>
          </div>

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
            <el-select v-model="envKey" placeholder="环境（可选）" clearable size="small" style="width: 160px">
              <el-option label="prod" value="prod" />
              <el-option label="test" value="test" />
            </el-select>
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

    <el-dialog v-model="showCreateDialog" title="新建聊天会话" width="480px">
      <el-form label-width="90px">
        <el-form-item label="Agent">
          <el-radio-group v-model="newAgentType">
            <el-radio-button label="claude">Claude</el-radio-button>
            <el-radio-button label="codex">Codex</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="工作目录">
          <el-input v-model="newWorkingDir" placeholder="/home/user/project" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, nextTick, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useChatStore } from '../stores/chat';
import type { AgentType } from '../api/chat';

const chat = useChatStore();

const showCreateDialog = ref(false);
const newAgentType = ref<AgentType>('claude');
const newWorkingDir = ref('');
const draft = ref('');
const envKey = ref<string | undefined>(undefined);
const scrollRef = ref<{ setScrollTop: (v: number) => void; wrapRef?: HTMLElement } | null>(null);

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
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }
.chat-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #ebeef5; }
.chat-header h3 { margin: 0; }
.resume-id { margin-left: 12px; font-size: 12px; color: #909399; }
.messages { flex: 1; padding: 16px; }
.message { margin-bottom: 16px; padding: 12px; border-radius: 6px; }
.message.user { background: #ecf5ff; }
.message.assistant { background: #f5f7fa; }
.message.streaming { border: 1px dashed #409eff; }
.role-tag { font-size: 11px; color: #909399; margin-bottom: 4px; text-transform: uppercase; }
.content { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, monospace; font-size: 13px; }
.input-area { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #ebeef5; align-items: flex-end; }
.input-area .el-input { flex: 1; }
</style>
