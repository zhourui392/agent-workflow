/**
 * GenerateSkillUseCase
 *
 * 编排 skill-creator 会话的完整生命周期：
 * 1. 定位 skill-creator 源目录（未安装则快速失败）
 * 2. 准备临时 work/plugin 目录并把 skill-creator 复制到 plugin 下
 * 3. 启动 ClaudeAgentExecutor.execute，把 stream 事件转发给 WS 通知器
 * 4. 执行完成后扫描 work 目录寻找 skill 子目录，解析 SKILL.md frontmatter
 * 5. 抓取 assistant 文本尾部的 ```skill-result {...}``` JSON，提取 suggestedTests
 * 6. 把 SkillDraft 暂存到 SkillDraftStore，广播 generation_done；失败时广播 error
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import log from '../../shared/infrastructure/logger';
import type { StepExecutor } from '../../execution/domain/service/PipelineOrchestrator';
import type { StepEvent } from '../../execution/domain/model/StepEvent';
import type { StepMergedConfig } from '../domain/model';
import type { SkillDraftStore } from '../domain/repository/SkillDraftStore';
import type { SkillDraft } from '../domain/model/SkillDraft';
import type { SkillCreatorLocator } from '../domain/service/SkillCreatorLocator';
import type { SkillGenerationNotifier } from '../domain/service/SkillGenerationNotifier';
import { parseSkillMd, SkillDraftParseError } from '../domain/service/SkillDraftParser';
import { extractGenerationResult } from '../domain/service/GenerationResultExtractor';

const SKILL_CREATOR_SYSTEM_PROMPT = `你是一个 Skill 创建助手。

流程：
1) 在当前工作目录（cwd）下创建一个新 skill 子目录，子目录名必须小写字母/数字/连字符。
2) 子目录至少包含 SKILL.md（YAML frontmatter：name/description/可选 allowed-tools）。
3) 需要时在子目录下创建 scripts/、references/、assets/ 等辅助资源。
4) 使用 skill-creator skill 的最佳实践。
5) 全部完成后，必须在回复末尾输出如下元数据代码块（不得缺失）：

\`\`\`skill-result
{"name": "<子目录名（= frontmatter.name）>", "suggestedTests": ["<一个简短的测试 prompt>", "<另一个 prompt>"]}
\`\`\`

不要把 SKILL.md 的内容塞进回复中，文件写到磁盘即可。`;

const DEFAULT_ALLOWED_TOOLS = ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'Skill'];

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

function findSkillSubdir(workDir: string): string | null {
  if (!fs.existsSync(workDir)) return null;
  const entries = fs.readdirSync(workDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const mdPath = path.join(workDir, entry.name, 'SKILL.md');
    if (fs.existsSync(mdPath)) return entry.name;
  }
  return null;
}

export class GenerateSkillUseCase {
  private readonly runningPromises = new Map<string, Promise<void>>();

  constructor(
    private readonly executor: StepExecutor,
    private readonly skillCreatorLocator: SkillCreatorLocator,
    private readonly draftStore: SkillDraftStore,
    private readonly notifier: SkillGenerationNotifier,
    private readonly tmpRoot: string,
    private readonly defaultModel?: string
  ) {}

  /**
   * 启动一次生成会话；同步完成准备工作后立即返回 generationId，
   * 真正的 SDK 会话在后台异步推进。
   */
  async start(prompt: string, model?: string): Promise<{ generationId: string }> {
    const skillCreatorDir = this.skillCreatorLocator.locate();
    if (!skillCreatorDir) {
      throw new Error('skill-creator skill 未安装；请先执行 `claude plugin install skill-creator`');
    }
    if (!fs.existsSync(path.join(skillCreatorDir, 'SKILL.md'))) {
      throw new Error(`定位到的 skill-creator 目录无效：${skillCreatorDir}`);
    }

    const generationId = uuidv4();
    const sessionRoot = path.join(this.tmpRoot, `skill-gen-${generationId}`);
    const workDir = path.join(sessionRoot, 'work');
    const pluginDir = path.join(sessionRoot, 'plugin');

    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(pluginDir, { recursive: true });
    copyDirRecursive(skillCreatorDir, path.join(pluginDir, 'skill-creator'));

    const now = new Date().toISOString();
    const initial: SkillDraft = {
      generationId,
      status: 'generating',
      workDir,
      suggestedTests: [],
      createdAt: now,
      updatedAt: now
    };
    this.draftStore.put(initial);

    const promise = this.runGeneration(generationId, prompt, model ?? this.defaultModel, workDir, pluginDir)
      .catch(err => {
        log.error('skill generation unexpected failure', { generationId, err });
      })
      .finally(() => {
        this.runningPromises.delete(generationId);
      });
    this.runningPromises.set(generationId, promise);

    return { generationId };
  }

  /**
   * 测试辅助：等待后台会话完成
   */
  async waitForCompletion(generationId: string): Promise<void> {
    const promise = this.runningPromises.get(generationId);
    if (promise) await promise;
  }

  private async runGeneration(
    generationId: string,
    userPrompt: string,
    model: string | undefined,
    workDir: string,
    pluginDir: string
  ): Promise<void> {
    this.notifier.start(generationId, 'generating');

    const config: StepMergedConfig = {
      systemPrompt: SKILL_CREATOR_SYSTEM_PROMPT,
      allowedTools: DEFAULT_ALLOWED_TOOLS,
      workingDirectory: workDir,
      skillsDir: pluginDir,
      hasSkills: true,
      ...(model ? { model } : {})
    };

    const onEvent = (event: StepEvent) => {
      try { this.notifier.step(generationId, 'generating', event); }
      catch (e) { log.warn('notifier.step failed', e); }
    };

    try {
      const result = await this.executor.execute(userPrompt, config, onEvent);

      if (!result.success) {
        this.failDraft(generationId, workDir, result.errorMessage ?? 'skill generation failed');
        return;
      }

      const subdirName = findSkillSubdir(workDir);
      if (!subdirName) {
        this.failDraft(generationId, workDir, '未在工作目录中找到包含 SKILL.md 的子目录');
        return;
      }

      const draftDir = path.join(workDir, subdirName);
      const md = fs.readFileSync(path.join(draftDir, 'SKILL.md'), 'utf-8');

      let draftName: string;
      try {
        draftName = parseSkillMd(md).name;
      } catch (err) {
        if (err instanceof SkillDraftParseError) {
          this.failDraft(generationId, workDir, `SKILL.md frontmatter 无效：${err.message}`);
          return;
        }
        throw err;
      }

      const { suggestedTests } = extractGenerationResult(result.outputText);

      const now = new Date().toISOString();
      const generated: SkillDraft = {
        generationId,
        status: 'generated',
        workDir,
        draftDir,
        draftName,
        suggestedTests,
        createdAt: this.draftStore.get(generationId)?.createdAt ?? now,
        updatedAt: now
      };
      this.draftStore.put(generated);

      this.notifier.done(generationId, 'generating', {
        draftName,
        draftDir,
        suggestedTests
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.failDraft(generationId, workDir, message);
    }
  }

  private failDraft(generationId: string, workDir: string, message: string): void {
    const now = new Date().toISOString();
    const previous = this.draftStore.get(generationId);
    this.draftStore.put({
      generationId,
      status: 'failed',
      workDir,
      suggestedTests: [],
      errorMessage: message,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    });
    this.notifier.error(generationId, 'generating', message);
  }
}
