/**
 * Agent CLI 网关（端口接口）
 *
 * 抽象对 Claude / Codex CLI 的子进程调用。基础设施实现负责：
 * - 根据 AgentType 选择命令和参数
 * - 将用户消息（可选附加环境前缀）写入 stdin
 * - 逐行读取 stdout，通过 onChunk 回调推送
 * - 超时看门狗 + 进程追踪
 */

import type { AgentType } from '../model/AgentType';

export interface RunStreamRequest {
  sessionId: string;
  agentType: AgentType;
  workingDir: string;
  message: string;
  resumeId?: string;
  env?: string;
  onChunk: (chunk: string) => void;
  onExit: (code: number) => void;
  onError?: (error: Error) => void;
}

export interface AgentGateway {
  /**
   * 启动一次流式对话。runStream 立即返回；stdout 行通过 onChunk 异步推送，
   * 进程退出时触发 onExit，异常时触发 onError（若未传入则合并到 onExit）。
   */
  runStream(req: RunStreamRequest): void;

  /**
   * 强制终止指定 session 对应的正在运行进程。若没有正在运行的进程则 no-op。
   */
  stopStream(sessionId: string): boolean;

  /**
   * 判断指定 session 是否有正在运行的进程
   */
  isRunning(sessionId: string): boolean;
}
