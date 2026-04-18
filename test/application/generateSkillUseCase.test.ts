/**
 * GenerateSkillUseCase 单元测试
 *
 * 编排 skill-creator 生成会话：执行 SDK → 抓取 JSON 结果 → 扫描工作目录 → 暂存草稿。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { vi } from 'vitest';
import { GenerateSkillUseCase } from '../../src/main/configuration/application/GenerateSkillUseCase';
import {
  createMockStepExecutor,
  createMockSkillDraftStore,
  createMockSkillGenerationNotifier,
  createMockSkillCreatorLocator
} from '../fixtures';

describe('GenerateSkillUseCase', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-uc-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeRealSkillCreatorDir(): string {
    const dir = path.join(tmpRoot, 'skill-creator');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: skill-creator\n---\nStub', 'utf-8');
    return dir;
  }

  function buildUseCase(opts: {
    creatorDir?: string | null;
    executorSideEffect?: (workDir: string) => void;
    executorOutputText?: string;
    executorSuccess?: boolean;
    executorError?: string;
  } = {}) {
    const executor = createMockStepExecutor();
    const notifier = createMockSkillGenerationNotifier();
    const store = createMockSkillDraftStore();
    const creatorDir = opts.creatorDir === null
      ? null
      : (opts.creatorDir ?? makeRealSkillCreatorDir());
    const locator = createMockSkillCreatorLocator(creatorDir);

    (executor.execute as ReturnType<typeof vi.fn>).mockImplementation(async (_prompt: string, config: { workingDirectory?: string }) => {
      if (opts.executorSideEffect && config.workingDirectory) {
        opts.executorSideEffect(config.workingDirectory);
      }
      if (opts.executorSuccess === false) {
        return { success: false, outputText: '', tokensUsed: 0, errorMessage: opts.executorError ?? 'fail' };
      }
      return { success: true, outputText: opts.executorOutputText ?? '', tokensUsed: 100 };
    });

    const useCase = new GenerateSkillUseCase(executor, locator, store, notifier, tmpRoot);
    return { useCase, executor, notifier, store, locator };
  }

  function validSkillMd(name = 'hello-skill') {
    return `---\nname: ${name}\ndescription: A sample skill\nallowed-tools: Read, Write\n---\n\n# Body`;
  }

  it('成功路径：广播 start/step/done、暂存 generated 状态', async () => {
    const { useCase, notifier, store } = buildUseCase({
      executorSideEffect: (workDir) => {
        const skillDir = path.join(workDir, 'hello-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), validSkillMd(), 'utf-8');
      },
      executorOutputText: '好的\n\n```skill-result\n{"name":"hello-skill","suggestedTests":["say hello","greet alice"]}\n```'
    });

    const { generationId } = await useCase.start('make a hello skill');
    await useCase.waitForCompletion(generationId);

    expect(notifier.start).toHaveBeenCalledWith(generationId, 'generating');
    expect(notifier.done).toHaveBeenCalledOnce();
    const doneCall = (notifier.done as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(doneCall[0]).toBe(generationId);
    expect(doneCall[1]).toBe('generating');
    expect(doneCall[2]).toMatchObject({
      draftName: 'hello-skill',
      suggestedTests: ['say hello', 'greet alice']
    });

    const draft = store.get(generationId);
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe('generated');
    expect(draft!.draftName).toBe('hello-skill');
    expect(draft!.suggestedTests).toEqual(['say hello', 'greet alice']);
    expect(draft!.draftDir).toBeDefined();
    expect(fs.existsSync(path.join(draft!.draftDir!, 'SKILL.md'))).toBe(true);
  });

  it('skill-creator 未安装时 start() 抛错', async () => {
    const { useCase } = buildUseCase({ creatorDir: null });
    await expect(useCase.start('hi')).rejects.toThrow(/skill-creator/);
  });

  it('executor 失败 → 草稿 status=failed、notifier.error 被调用', async () => {
    const { useCase, notifier, store } = buildUseCase({
      executorSuccess: false,
      executorError: 'SDK boom'
    });

    const { generationId } = await useCase.start('x');
    await useCase.waitForCompletion(generationId);

    const draft = store.get(generationId);
    expect(draft!.status).toBe('failed');
    expect(draft!.errorMessage).toContain('SDK boom');
    expect(notifier.error).toHaveBeenCalledOnce();
    expect(notifier.done).not.toHaveBeenCalled();
  });

  it('工作目录未产生子目录 → 失败', async () => {
    const { useCase, notifier, store } = buildUseCase({
      executorOutputText: '```skill-result\n{"name":"x","suggestedTests":["t"]}\n```'
    });

    const { generationId } = await useCase.start('x');
    await useCase.waitForCompletion(generationId);

    const draft = store.get(generationId);
    expect(draft!.status).toBe('failed');
    expect(draft!.errorMessage).toMatch(/SKILL\.md/);
    expect(notifier.error).toHaveBeenCalledOnce();
  });

  it('无 skill-result JSON 时使用 fallback suggestedTests 且仍按 draft 名称保存', async () => {
    const { useCase, store } = buildUseCase({
      executorSideEffect: (workDir) => {
        const skillDir = path.join(workDir, 'no-json-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), validSkillMd('no-json-skill'), 'utf-8');
      },
      executorOutputText: '（没有 JSON）'
    });

    const { generationId } = await useCase.start('x');
    await useCase.waitForCompletion(generationId);

    const draft = store.get(generationId);
    expect(draft!.status).toBe('generated');
    expect(draft!.draftName).toBe('no-json-skill');
    expect(draft!.suggestedTests.length).toBeGreaterThan(0);
  });

  it('工作目录根使用 tmpRoot 子目录', async () => {
    const { useCase, store } = buildUseCase({
      executorSideEffect: (workDir) => {
        const skillDir = path.join(workDir, 'hello-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), validSkillMd(), 'utf-8');
      },
      executorOutputText: '```skill-result\n{"name":"hello-skill","suggestedTests":["t"]}\n```'
    });

    const { generationId } = await useCase.start('x');
    await useCase.waitForCompletion(generationId);

    const draft = store.get(generationId);
    expect(draft!.workDir.startsWith(tmpRoot)).toBe(true);
  });

  it('executor 接收到 StepMergedConfig 且包含 plugin-dir 指向 skill-creator 父目录', async () => {
    const { useCase, executor } = buildUseCase({
      executorSideEffect: (workDir) => {
        const skillDir = path.join(workDir, 'hello');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), validSkillMd('hello'), 'utf-8');
      },
      executorOutputText: '```skill-result\n{"name":"hello","suggestedTests":["t"]}\n```'
    });

    const { generationId } = await useCase.start('x');
    await useCase.waitForCompletion(generationId);

    const executeCall = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    const config = executeCall[1];
    expect(config.skillsDir).toBeDefined();
    // plugin-dir 下必须有 skill-creator 子目录
    expect(fs.existsSync(path.join(config.skillsDir as string, 'skill-creator', 'SKILL.md'))).toBe(true);
  });
});
