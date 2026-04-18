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

function buildSkillCreatorSystemPrompt(workDir: string): string {
  return `你是一个 Skill 创建助手。

工作目录（cwd，绝对路径，必须严格使用此前缀）：
${workDir}

流程：
1) 在上述 cwd 下创建一个新 skill 子目录，子目录名必须小写字母/数字/连字符。
2) 子目录至少包含 SKILL.md（YAML frontmatter：name/description/可选 allowed-tools）。
3) 需要时在子目录下创建 scripts/、references/、assets/ 等辅助资源。
4) 使用 skill-creator skill 的最佳实践。
5) 全部完成后，必须在回复末尾输出如下元数据代码块（不得缺失）：

\`\`\`skill-result
{"name": "<子目录名（= frontmatter.name）>", "suggestedTests": ["<一个简短的测试 prompt>", "<另一个 prompt>"]}
\`\`\`

硬性约束：
- **所有写入路径必须以上述 cwd 绝对路径作为前缀**。禁止使用任何不以该前缀开头的绝对路径（例如擅自拼装 \`/tmp/...\`、\`C:\\tmp\\...\` 等）——Windows 下 POSIX 形式的绝对路径会被解析到错误的驱动器根目录，导致文件落盘错位。
- 禁止运行、执行、验证任何脚本或命令（不要 dry-run、import 测试、语法检查、curl 探活等）。该阶段只写文件；真正的调用验证在随后的"验证阶段"由独立会话完成。
- 不要把 SKILL.md 的内容塞进回复中，文件写到磁盘即可。
- 创建完全部文件后立即输出 \`skill-result\` 代码块并结束，不要做事后总结或追加解释。
- 轮次预算有限（约 20 轮），请合理规划，避免反复读写同一文件。`;
}

const DEFAULT_ALLOWED_TOOLS = ['Read', 'Write', 'Glob', 'Grep', 'Skill'];

const DEFAULT_MAX_TURNS = 20;

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

/**
 * 计算 POSIX-mirror 兜底路径。
 *
 * Windows 下 Claude CLI 若把 /tmp/... 形式绝对路径交给 Node `path.resolve`，
 * 会被解析到 `<当前驱动>:\tmp\...`，与真实的 `%TEMP%\agent-workflow-skill-gen\...` 错位。
 * 这里按 primaryWorkDir 的结构反推出"mirror"路径，用于兜底查找与回搬。
 */
function computePosixMirrorWorkDir(primaryWorkDir: string): string | null {
  const sessionDir = path.basename(path.dirname(primaryWorkDir));
  const tmpRootBase = path.basename(path.dirname(path.dirname(primaryWorkDir)));
  if (!sessionDir || !tmpRootBase) return null;
  const root = path.parse(primaryWorkDir).root;
  const mirror = path.join(root, 'tmp', tmpRootBase, sessionDir, 'work');
  if (path.resolve(mirror) === path.resolve(primaryWorkDir)) return null;
  return mirror;
}

/**
 * 定位生成的 skill 子目录：先查 primary，再查 POSIX-mirror 兜底。
 * 返回实际落盘目录（primary 或 mirror）与子目录名，找不到返回 null。
 */
function locateGeneratedSkill(
  primaryWorkDir: string
): { dir: string; subdir: string; isFallback: boolean } | null {
  const primary = findSkillSubdir(primaryWorkDir);
  if (primary) return { dir: primaryWorkDir, subdir: primary, isFallback: false };

  const mirror = computePosixMirrorWorkDir(primaryWorkDir);
  if (!mirror) return null;
  const mirrorMatch = findSkillSubdir(mirror);
  if (mirrorMatch) return { dir: mirror, subdir: mirrorMatch, isFallback: true };

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
      systemPrompt: buildSkillCreatorSystemPrompt(workDir),
      allowedTools: DEFAULT_ALLOWED_TOOLS,
      maxTurns: DEFAULT_MAX_TURNS,
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

      const located = locateGeneratedSkill(workDir);
      if (!located) {
        this.failDraft(generationId, workDir, '未在工作目录中找到包含 SKILL.md 的子目录');
        return;
      }

      if (located.isFallback) {
        log.warn('skill 生成命中 POSIX-mirror 兜底，搬回 primary workDir', {
          generationId,
          mirror: located.dir,
          primary: workDir
        });
        copyDirRecursive(located.dir, workDir);
        try {
          fs.rmSync(path.dirname(located.dir), { recursive: true, force: true });
        } catch (error) {
          log.warn('清理 POSIX-mirror 失败（可忽略）', { generationId, error });
        }
      }

      const draftDir = path.join(workDir, located.subdir);
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
