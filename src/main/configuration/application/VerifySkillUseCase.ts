/**
 * VerifySkillUseCase
 *
 * 基于已生成的 SkillDraft 发起一次测试会话：
 * - plugin-dir 指向 draft.workDir（其下有 draftName/ 子目录，可被 Claude CLI 挂载）
 * - cwd 指向独立 tmp（每次验证清空）
 * - 通过 SkillGenerationNotifier 广播 phase='verifying' 的 start/step/done/error
 */

import * as fs from 'fs';
import * as path from 'path';
import log from '../../shared/infrastructure/logger';
import type { StepExecutor } from '../../execution/domain/service/PipelineOrchestrator';
import type { StepEvent } from '../../execution/domain/model/StepEvent';
import type { StepMergedConfig } from '../domain/model';
import type { SkillDraftStore } from '../domain/repository/SkillDraftStore';
import type { SkillGenerationNotifier } from '../domain/service/SkillGenerationNotifier';

const VERIFY_SYSTEM_PROMPT = `你是一个 Skill 验证助手。请使用 Skill 工具调用已经挂载的 skill 完成用户的测试请求，并在回复中展示结果。`;

const DEFAULT_ALLOWED_TOOLS = ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'Skill'];

export class VerifySkillUseCase {
  private readonly runningPromises = new Map<string, Promise<void>>();

  constructor(
    private readonly executor: StepExecutor,
    private readonly draftStore: SkillDraftStore,
    private readonly notifier: SkillGenerationNotifier,
    private readonly tmpRoot: string,
    private readonly defaultModel?: string
  ) {}

  async start(generationId: string, testPrompt: string, model?: string): Promise<void> {
    const draft = this.draftStore.get(generationId);
    if (!draft) {
      throw new Error(`generationId 不存在: ${generationId}`);
    }
    if (draft.status !== 'generated') {
      throw new Error(`草稿状态非 generated，无法验证：${draft.status}`);
    }
    if (!draft.draftDir || !draft.draftName) {
      throw new Error('草稿缺少 draftDir/draftName');
    }

    const verifyDir = path.join(this.tmpRoot, `skill-verify-${generationId}`);
    fs.rmSync(verifyDir, { recursive: true, force: true });
    fs.mkdirSync(verifyDir, { recursive: true });

    const promise = this.runVerification(
      generationId,
      draft.workDir,
      verifyDir,
      testPrompt,
      model ?? this.defaultModel
    )
      .catch(err => {
        log.error('skill verify unexpected failure', { generationId, err });
      })
      .finally(() => {
        this.runningPromises.delete(generationId);
      });
    this.runningPromises.set(generationId, promise);
  }

  async waitForCompletion(generationId: string): Promise<void> {
    const promise = this.runningPromises.get(generationId);
    if (promise) await promise;
  }

  private async runVerification(
    generationId: string,
    pluginDir: string,
    cwd: string,
    prompt: string,
    model: string | undefined
  ): Promise<void> {
    this.notifier.start(generationId, 'verifying');

    const config: StepMergedConfig = {
      systemPrompt: VERIFY_SYSTEM_PROMPT,
      allowedTools: DEFAULT_ALLOWED_TOOLS,
      workingDirectory: cwd,
      skillsDir: pluginDir,
      hasSkills: true,
      ...(model ? { model } : {})
    };

    const onEvent = (event: StepEvent) => {
      try { this.notifier.step(generationId, 'verifying', event); }
      catch (e) { log.warn('notifier.step failed', e); }
    };

    try {
      const result = await this.executor.execute(prompt, config, onEvent);
      if (!result.success) {
        this.notifier.error(
          generationId,
          'verifying',
          result.errorMessage ?? 'skill verification failed'
        );
        return;
      }
      this.notifier.done(generationId, 'verifying', {
        resultText: result.outputText,
        tokensUsed: result.tokensUsed
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.notifier.error(generationId, 'verifying', message);
    }
  }
}
