/**
 * Configuration 应用服务层单元测试
 *
 * 仅覆盖有业务逻辑的方法：跨源合并（listAll）和缓存失效（updateConfig）。
 * 纯仓储委托方法（list/get/create/update/setEnabled/remove）由类型系统保证正确性，不做测试。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillApplicationService } from '../../src/main/configuration/application/SkillApplicationService';
import { GlobalConfigApplicationService } from '../../src/main/configuration/application/GlobalConfigApplicationService';
import type { CliConfigLoader } from '../../src/main/configuration/infrastructure/CliConfigLoader';
import type { DiskGlobalConfigRepository } from '../../src/main/configuration/infrastructure/DiskGlobalConfigRepository';
import type { GlobalConfigCacheImpl } from '../../src/main/configuration/infrastructure/GlobalConfigCache';
import {
  createMockSkillRepository,
  createTestSkill
} from '../fixtures';

// ═══════════════════════════════════════════════════════════════════
// SkillApplicationService
// ═══════════════════════════════════════════════════════════════════

describe('SkillApplicationService', () => {
  let repo: ReturnType<typeof createMockSkillRepository>;
  let cliConfigLoader: CliConfigLoader;
  let service: SkillApplicationService;

  beforeEach(() => {
    repo = createMockSkillRepository();
    cliConfigLoader = {
      loadClaudeCliSkills: vi.fn(() => ({})),
      loadClaudeCliSkillsWithDetails: vi.fn(() => []),
    } as unknown as CliConfigLoader;
    service = new SkillApplicationService(repo, cliConfigLoader);
  });

  describe('listAll', () => {
    it('merges DB skills with CLI skills, deduplicates by name', () => {
      const dbSkill = createTestSkill({ name: 'shared-skill' });
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue([dbSkill]);
      (cliConfigLoader.loadClaudeCliSkillsWithDetails as ReturnType<typeof vi.fn>).mockReturnValue([
        { name: 'shared-skill', content: 'cli version', description: 'CLI' },   // duplicate
        { name: 'cli-only-skill', content: 'cli content', description: 'CLI only skill', allowedTools: ['Bash'] },
      ]);

      const result = service.listAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(dbSkill);
      expect(result[1]).toMatchObject({
        id: 'cli:cli-only-skill',
        name: 'cli-only-skill',
        content: 'cli content',
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
        { name: 'cli-skill', content: 'content' },
      ]);

      const result = service.listAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'cli-skill', source: 'cli' });
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
