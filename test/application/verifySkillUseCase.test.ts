/**
 * VerifySkillUseCase 单元测试
 *
 * 用 draft.workDir 作为 plugin-dir，让 SDK 能加载刚生成的 skill。
 * 每次验证用独立 tmp cwd；通过 notifier 广播 phase='verifying' 的 start/step/done/error。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VerifySkillUseCase } from '../../src/main/configuration/application/VerifySkillUseCase';
import type { SkillDraft } from '../../src/main/configuration/domain/model/SkillDraft';
import {
  createMockStepExecutor,
  createMockSkillDraftStore,
  createMockSkillGenerationNotifier
} from '../fixtures';

describe('VerifySkillUseCase', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-uc-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeGeneratedDraft(): SkillDraft {
    const workDir = path.join(tmpRoot, 'gen-work');
    const draftDir = path.join(workDir, 'hello-skill');
    fs.mkdirSync(draftDir, { recursive: true });
    fs.writeFileSync(
      path.join(draftDir, 'SKILL.md'),
      '---\nname: hello-skill\ndescription: test\n---\n# Body',
      'utf-8'
    );
    return {
      generationId: 'gen-001',
      status: 'generated',
      workDir,
      draftDir,
      draftName: 'hello-skill',
      suggestedTests: ['say hello'],
      createdAt: '2026-04-18T00:00:00Z',
      updatedAt: '2026-04-18T00:00:00Z'
    };
  }

  function buildUseCase() {
    const executor = createMockStepExecutor();
    const notifier = createMockSkillGenerationNotifier();
    const store = createMockSkillDraftStore();
    const useCase = new VerifySkillUseCase(executor, store, notifier, tmpRoot);
    return { useCase, executor, notifier, store };
  }

  it('draft 不存在 → start() 抛错', async () => {
    const { useCase } = buildUseCase();
    await expect(useCase.start('nope', 'hi')).rejects.toThrow(/generationId/);
  });

  it('draft 状态非 generated → start() 抛错', async () => {
    const { useCase, store } = buildUseCase();
    const draft = makeGeneratedDraft();
    store.put({ ...draft, status: 'generating' });
    await expect(useCase.start(draft.generationId, 'hi')).rejects.toThrow(/generated/);
  });

  it('成功路径：广播 start/done、执行参数包含 workDir 作 plugin-dir', async () => {
    const { useCase, executor, notifier, store } = buildUseCase();
    const draft = makeGeneratedDraft();
    store.put(draft);

    (executor.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      outputText: 'Hello, Alice!',
      tokensUsed: 42
    });

    await useCase.start(draft.generationId, '打招呼给 alice');
    await useCase.waitForCompletion(draft.generationId);

    expect(notifier.start).toHaveBeenCalledWith(draft.generationId, 'verifying');
    expect(notifier.done).toHaveBeenCalledOnce();
    const doneCall = (notifier.done as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(doneCall[1]).toBe('verifying');
    expect(doneCall[2]).toMatchObject({ resultText: 'Hello, Alice!' });

    const executeCall = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    const config = executeCall[1];
    expect(config.hasSkills).toBe(true);
    expect(config.workingDirectory).toContain(`skill-verify-${draft.generationId}`);
    expect(config.workingDirectory).toMatch(new RegExp(`^${tmpRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

    // skillsDir 必须是"plugin 包装目录"，而不是 draft.workDir
    expect(config.skillsDir).not.toBe(draft.workDir);
    expect(fs.existsSync(path.join(config.skillsDir as string, '.claude-plugin', 'plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(config.skillsDir as string, 'skills', draft.draftName!, 'SKILL.md'))).toBe(true);

    // plugin.json 中必须有 name 字段，供 CLI 作为 plugin 命名空间
    const pluginJson = JSON.parse(
      fs.readFileSync(path.join(config.skillsDir as string, '.claude-plugin', 'plugin.json'), 'utf-8')
    );
    expect(typeof pluginJson.name).toBe('string');
    expect(pluginJson.name.length).toBeGreaterThan(0);

    // system prompt 要告诉 agent 完整限定名（<pluginName>:<skillName>）
    expect(config.systemPrompt).toContain(`${pluginJson.name}:${draft.draftName}`);
  });

  it('executor 失败 → 广播 error，不广播 done', async () => {
    const { useCase, executor, notifier, store } = buildUseCase();
    const draft = makeGeneratedDraft();
    store.put(draft);

    (executor.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      outputText: '',
      tokensUsed: 0,
      errorMessage: 'agent crashed'
    });

    await useCase.start(draft.generationId, 'hi');
    await useCase.waitForCompletion(draft.generationId);

    expect(notifier.error).toHaveBeenCalledOnce();
    const errCall = (notifier.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(errCall[1]).toBe('verifying');
    expect(errCall[2]).toContain('agent crashed');
    expect(notifier.done).not.toHaveBeenCalled();
  });

  it('executor 抛异常 → 广播 error', async () => {
    const { useCase, executor, notifier, store } = buildUseCase();
    const draft = makeGeneratedDraft();
    store.put(draft);

    (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));

    await useCase.start(draft.generationId, 'hi');
    await useCase.waitForCompletion(draft.generationId);

    expect(notifier.error).toHaveBeenCalledOnce();
    expect((notifier.error as ReturnType<typeof vi.fn>).mock.calls[0][2]).toContain('boom');
  });

  it('重复调用会清空并重建 verify cwd', async () => {
    const { useCase, executor, store } = buildUseCase();
    const draft = makeGeneratedDraft();
    store.put(draft);

    const verifyDir = path.join(tmpRoot, `skill-verify-${draft.generationId}`);

    let firstCwd: string | undefined;
    (executor.execute as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_p, cfg) => {
      firstCwd = cfg.workingDirectory;
      fs.writeFileSync(path.join(cfg.workingDirectory, 'leftover.txt'), 'old');
      return { success: true, outputText: 'ok', tokensUsed: 1 };
    });
    await useCase.start(draft.generationId, 'a');
    await useCase.waitForCompletion(draft.generationId);

    expect(firstCwd).toBe(verifyDir);
    expect(fs.existsSync(path.join(verifyDir, 'leftover.txt'))).toBe(true);

    (executor.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      outputText: 'ok2',
      tokensUsed: 1
    });
    await useCase.start(draft.generationId, 'b');
    await useCase.waitForCompletion(draft.generationId);

    expect(fs.existsSync(path.join(verifyDir, 'leftover.txt'))).toBe(false);
  });

  it('step 事件被转发给 notifier.step', async () => {
    const { useCase, executor, notifier, store } = buildUseCase();
    const draft = makeGeneratedDraft();
    store.put(draft);

    (executor.execute as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_p, _cfg, onEvent) => {
      onEvent?.({ type: 'text', text: 'thinking...' });
      return { success: true, outputText: 'done', tokensUsed: 1 };
    });

    await useCase.start(draft.generationId, 'hi');
    await useCase.waitForCompletion(draft.generationId);

    expect(notifier.step).toHaveBeenCalled();
    const stepCall = (notifier.step as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(stepCall[1]).toBe('verifying');
    expect(stepCall[2]).toMatchObject({ type: 'text' });
  });
});
