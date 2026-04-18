/**
 * Configuration 应用服务层单元测试
 *
 * 仅覆盖有业务逻辑的方法：跨源合并（listAll）和缓存失效（updateConfig）。
 * 纯仓储委托方法（list/get/create/update/setEnabled/remove）由类型系统保证正确性，不做测试。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SkillApplicationService,
  SkillDraftNotFoundError,
  SkillDraftStateError,
  SkillNameConflictError
} from '../../src/main/configuration/application/SkillApplicationService';
import { GlobalConfigApplicationService } from '../../src/main/configuration/application/GlobalConfigApplicationService';
import type { CliConfigLoader } from '../../src/main/configuration/infrastructure/CliConfigLoader';
import type { DiskGlobalConfigRepository } from '../../src/main/configuration/infrastructure/DiskGlobalConfigRepository';
import type { GlobalConfigCacheImpl } from '../../src/main/configuration/infrastructure/GlobalConfigCache';
import type { SkillDraft } from '../../src/main/configuration/domain/model/SkillDraft';
import {
  createMockSkillRepository,
  createMockSkillDraftStore,
  createTestSkill
} from '../fixtures';

// ═══════════════════════════════════════════════════════════════════
// SkillApplicationService
// ═══════════════════════════════════════════════════════════════════

describe('SkillApplicationService', () => {
  let repo: ReturnType<typeof createMockSkillRepository>;
  let cliConfigLoader: CliConfigLoader;
  let draftStore: ReturnType<typeof createMockSkillDraftStore>;
  let tmpRoot: string;
  let service: SkillApplicationService;

  beforeEach(() => {
    repo = createMockSkillRepository();
    cliConfigLoader = {
      loadClaudeCliSkills: vi.fn(() => ({})),
      loadClaudeCliSkillsWithDetails: vi.fn(() => []),
    } as unknown as CliConfigLoader;
    draftStore = createMockSkillDraftStore();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-svc-'));
    service = new SkillApplicationService(repo, cliConfigLoader, draftStore, tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('listAll', () => {
    it('merges DB skills with CLI skills, deduplicates by name', () => {
      const dbSkill = createTestSkill({ name: 'shared-skill' });
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue([dbSkill]);
      (cliConfigLoader.loadClaudeCliSkillsWithDetails as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'shared-skill', dirPath: '/cli/shared', description: 'CLI' },   // duplicate
        { name: 'cli-only-skill', dirPath: '/cli/cli-only', description: 'CLI only skill', allowedTools: ['Bash'] },
      ]);

      const result = service.listAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(dbSkill);
      expect(result[1]).toMatchObject({
        id: 'cli:cli-only-skill',
        name: 'cli-only-skill',
        dirPath: '/cli/cli-only',
        description: 'CLI only skill',
        allowedTools: ['Bash'],
        source: 'cli',
        enabled: true,
      });
    });

    it('returns only DB skills when CLI has none', () => {
      const dbSkill = createTestSkill();
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue([dbSkill]);

      const result = service.listAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(dbSkill);
    });

    it('returns only CLI skills when DB is empty', () => {
      (cliConfigLoader.loadClaudeCliSkillsWithDetails as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'cli-skill', dirPath: '/cli/cli-skill' },
      ]);

      const result = service.listAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'cli-skill', source: 'cli', dirPath: '/cli/cli-skill' });
    });
  });

  describe('saveFromDraft / cancelDraft', () => {
    function prepareGeneratedDraft(generationId: string, name: string): SkillDraft {
      const sessionRoot = path.join(tmpRoot, `skill-gen-${generationId}`);
      const workDir = path.join(sessionRoot, 'work');
      const draftDir = path.join(workDir, name);
      fs.mkdirSync(draftDir, { recursive: true });
      fs.writeFileSync(path.join(draftDir, 'SKILL.md'), `---\nname: ${name}\n---\nbody`, 'utf-8');

      const verifyDir = path.join(tmpRoot, `skill-verify-${generationId}`);
      fs.mkdirSync(verifyDir, { recursive: true });

      const draft: SkillDraft = {
        generationId,
        status: 'generated',
        workDir,
        draftDir,
        draftName: name,
        suggestedTests: ['t'],
        createdAt: '2026-04-18T00:00:00Z',
        updatedAt: '2026-04-18T00:00:00Z'
      };
      draftStore.put(draft);
      return draft;
    }

    it('saveFromDraft 成功：调用 repo.create 并清理 tmp + draft', () => {
      const draft = prepareGeneratedDraft('g1', 'hello-skill');
      const created = createTestSkill({ name: 'hello-skill' });
      (repo.findByName as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (repo.create as ReturnType<typeof vi.fn>).mockReturnValue(created);

      const result = service.saveFromDraft('g1', { enabled: false });

      expect(result).toBe(created);
      expect(repo.create).toHaveBeenCalledWith({
        name: 'hello-skill',
        sourceDir: draft.draftDir,
        enabled: false
      });
      expect(fs.existsSync(path.dirname(draft.workDir))).toBe(false);
      expect(fs.existsSync(path.join(tmpRoot, 'skill-verify-g1'))).toBe(false);
      expect(draftStore.get('g1')).toBeNull();
    });

    it('saveFromDraft 默认 enabled=true', () => {
      prepareGeneratedDraft('g2', 'x');
      (repo.findByName as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (repo.create as ReturnType<typeof vi.fn>).mockReturnValue(createTestSkill({ name: 'x' }));

      service.saveFromDraft('g2', {});

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('saveFromDraft 草稿不存在 → 抛 SkillDraftNotFoundError', () => {
      expect(() => service.saveFromDraft('missing', {})).toThrow(SkillDraftNotFoundError);
    });

    it('saveFromDraft 状态非 generated → 抛 SkillDraftStateError', () => {
      const draft = prepareGeneratedDraft('g3', 'x');
      draftStore.put({ ...draft, status: 'generating' });
      expect(() => service.saveFromDraft('g3', {})).toThrow(SkillDraftStateError);
    });

    it('saveFromDraft 名称冲突 → 抛 SkillNameConflictError 且不清理', () => {
      const draft = prepareGeneratedDraft('g4', 'dup');
      (repo.findByName as ReturnType<typeof vi.fn>).mockReturnValue(createTestSkill({ name: 'dup' }));

      expect(() => service.saveFromDraft('g4', {})).toThrow(SkillNameConflictError);
      expect(repo.create).not.toHaveBeenCalled();
      expect(fs.existsSync(path.dirname(draft.workDir))).toBe(true);
      expect(draftStore.get('g4')).not.toBeNull();
    });

    it('cancelDraft 删除 tmp + draft', () => {
      const draft = prepareGeneratedDraft('g5', 'x');
      const result = service.cancelDraft('g5');
      expect(result).toBe(true);
      expect(fs.existsSync(path.dirname(draft.workDir))).toBe(false);
      expect(fs.existsSync(path.join(tmpRoot, 'skill-verify-g5'))).toBe(false);
      expect(draftStore.get('g5')).toBeNull();
    });

    it('cancelDraft 草稿不存在 → 返回 false', () => {
      expect(service.cancelDraft('missing')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// GlobalConfigApplicationService
// ═══════════════════════════════════════════════════════════════════

describe('GlobalConfigApplicationService', () => {
  let diskConfigRepo: DiskGlobalConfigRepository;
  let configCache: GlobalConfigCacheImpl;
  let service: GlobalConfigApplicationService;

  beforeEach(() => {
    diskConfigRepo = {
      getConfig: vi.fn(() => ({
        systemPrompt: 'global prompt',
        defaultModel: 'claude-3',
      })),
      updateConfig: vi.fn(),
    } as unknown as DiskGlobalConfigRepository;

    configCache = {
      invalidate: vi.fn(),
      loadCliSkills: vi.fn(() => ({})),
      loadDiskConfig: vi.fn(() => ({})),
    } as unknown as GlobalConfigCacheImpl;

    service = new GlobalConfigApplicationService(diskConfigRepo, configCache);
  });

  describe('updateConfig', () => {
    it('delegates to diskConfigRepo.updateConfig and invalidates cache', () => {
      const data = { systemPrompt: 'new prompt' };
      service.updateConfig(data);

      expect(diskConfigRepo.updateConfig).toHaveBeenCalledWith(data);
      expect(configCache.invalidate).toHaveBeenCalledOnce();
    });
  });
});
