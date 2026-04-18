/**
 * VerifySkillUseCase
 *
 * 基于已生成的 SkillDraft 发起一次测试会话：
 * - 把草稿包装成标准 Claude plugin 布局（.claude-plugin/plugin.json + skills/<name>/）
 *   放入独立 plugin 目录，再作为 plugin-dir 传给 SDK；否则 CLI 只会把整个目录当成
 *   一个"空 inline plugin"，无法识别其中的 skill
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

const DEFAULT_ALLOWED_TOOLS = ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'Skill'];

const PLUGIN_WRAPPER_PREFIX = 'skill-draft';

function buildVerifySystemPrompt(pluginName: string, skillName: string): string {
  const fqn = `${pluginName}:${skillName}`;
  return `你是一个 Skill 验证助手。

当前挂载了一个待验证的 skill，完整限定名（FQN）为：${fqn}
（plugin 名：${pluginName}；skill 名：${skillName}）

请使用 Skill 工具（按 FQN 或 skill 名）调用这个刚生成的 skill 完成用户的测试请求，并在回复中展示结果。
若该 skill 没有按预期覆盖用户请求，请说明原因（而不是回退到其它同类 skill）。`;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 把 draft 目录包装为 Claude plugin 布局：
 *   <pluginDir>/.claude-plugin/plugin.json
 *   <pluginDir>/skills/<skillName>/...
 * 返回 (pluginDir, pluginName)。
 */
function buildPluginWrapper(
  parentDir: string,
  generationId: string,
  draftDir: string,
  skillName: string
): { pluginDir: string; pluginName: string } {
  const pluginName = `${PLUGIN_WRAPPER_PREFIX}-${generationId.substring(0, 8)}`;
  const pluginDir = path.join(parentDir, 'plugin-wrapper');
  fs.rmSync(pluginDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: pluginName,
        version: '0.0.0',
        description: 'Skill draft under verification (ephemeral)'
      },
      null,
      2
    ),
    'utf-8'
  );
  copyDirRecursive(draftDir, path.join(pluginDir, 'skills', skillName));
  return { pluginDir, pluginName };
}

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

    const { pluginDir, pluginName } = buildPluginWrapper(
      verifyDir,
      generationId,
      draft.draftDir,
      draft.draftName
    );

    const promise = this.runVerification(
      generationId,
      pluginDir,
      pluginName,
      draft.draftName,
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
    pluginName: string,
    skillName: string,
    cwd: string,
    prompt: string,
    model: string | undefined
  ): Promise<void> {
    this.notifier.start(generationId, 'verifying');

    const config: StepMergedConfig = {
      systemPrompt: buildVerifySystemPrompt(pluginName, skillName),
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
