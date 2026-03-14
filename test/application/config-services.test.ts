/**
 * Configuration 应用服务层单元测试
 *
 * 覆盖 McpServerApplicationService、SkillApplicationService、GlobalConfigApplicationService
 * 的仓储委托与跨源合并逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServerApplicationService } from '../../src/main/configuration/application/McpServerApplicationService';
import { SkillApplicationService } from '../../src/main/configuration/application/SkillApplicationService';
import { GlobalConfigApplicationService } from '../../src/main/configuration/application/GlobalConfigApplicationService';
import type { McpServerRepository } from '../../src/main/configuration/domain/repository/McpServerRepository';
import type { SkillRepository } from '../../src/main/configuration/domain/repository/SkillRepository';
import type { CliConfigLoader } from '../../src/main/configuration/infrastructure/CliConfigLoader';
import type { DiskGlobalConfigRepository } from '../../src/main/configuration/infrastructure/DiskGlobalConfigRepository';
import type { GlobalConfigCacheImpl } from '../../src/main/configuration/infrastructure/GlobalConfigCache';
import {
  createMockMcpServerRepository,
  createMockSkillRepository,
  createTestMcpServer,
  createTestSkill
} from '../fixtures';

// ═══════════════════════════════════════════════════════════════════
// McpServerApplicationService
// ═══════════════════════════════════════════════════════════════════

describe('McpServerApplicationService', () => {
  let repo: ReturnType<typeof createMockMcpServerRepository>;
  let cliConfigLoader: CliConfigLoader;
  let service: McpServerApplicationService;

  beforeEach(() => {
    repo = createMockMcpServerRepository();
    cliConfigLoader = {
      loadClaudeCliMcpServers: vi.fn(() => ({})),
      loadClaudeCliSkills: vi.fn(() => ({})),
      loadClaudeCliSkillsWithDetails: vi.fn(() => []),
    } as unknown as CliConfigLoader;
    service = new McpServerApplicationService(repo, cliConfigLoader);
  });

  describe('list', () => {
    it('delegates to repo.findAll', () => {
      const servers = [createTestMcpServer()];
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue(servers);

      expect(service.list()).toBe(servers);
      expect(repo.findAll).toHaveBeenCalledOnce();
    });
  });

  describe('get', () => {
    it('delegates to repo.findById', () => {
      const server = createTestMcpServer();
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(server);

      expect(service.get('mcp-001')).toBe(server);
      expect(repo.findById).toHaveBeenCalledWith('mcp-001');
    });
  });

  describe('create', () => {
    it('delegates to repo.create', () => {
      const input = { name: 'new-server', command: 'npx new-server' };
      service.create(input);

      expect(repo.create).toHaveBeenCalledWith(input);
    });
  });

  describe('update', () => {
    it('delegates to repo.update', () => {
      const data = { name: 'updated' };
      service.update('mcp-001', data);

      expect(repo.update).toHaveBeenCalledWith('mcp-001', data);
    });
  });

  describe('setEnabled', () => {
    it('delegates to repo.setEnabled', () => {
      service.setEnabled('mcp-001', false);

      expect(repo.setEnabled).toHaveBeenCalledWith('mcp-001', false);
    });
  });

  describe('remove', () => {
    it('delegates to repo.remove', () => {
      service.remove('mcp-001');

      expect(repo.remove).toHaveBeenCalledWith('mcp-001');
    });
  });

  describe('listAll', () => {
    it('merges DB servers with CLI servers, deduplicates by name', () => {
      const dbServer = createTestMcpServer({ name: 'shared-server' });
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue([dbServer]);
      (cliConfigLoader.loadClaudeCliMcpServers as ReturnType<typeof vi.fn>).mockReturnValue({
        'shared-server': { command: 'npx shared' },       // duplicate — should be skipped
        'cli-only-server': { command: 'npx cli-only', args: ['--flag'] },
      });

      const result = service.listAll();

      // DB server kept, CLI duplicate skipped, CLI-only added
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(dbServer);
      expect(result[1]).toMatchObject({
        id: 'cli:cli-only-server',
        name: 'cli-only-server',
        command: 'npx cli-only',
        args: ['--flag'],
        source: 'cli',
        enabled: true,
      });
    });

    it('returns only DB servers when CLI has no servers', () => {
      const dbServer = createTestMcpServer();
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue([dbServer]);

      const result = service.listAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(dbServer);
    });

    it('returns only CLI servers when DB is empty', () => {
      (cliConfigLoader.loadClaudeCliMcpServers as ReturnType<typeof vi.fn>).mockReturnValue({
        'cli-server': { command: 'npx cli' },
      });

      const result = service.listAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'cli-server', source: 'cli' });
    });
  });
});

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
      loadClaudeCliMcpServers: vi.fn(() => ({})),
      loadClaudeCliSkills: vi.fn(() => ({})),
      loadClaudeCliSkillsWithDetails: vi.fn(() => []),
    } as unknown as CliConfigLoader;
    service = new SkillApplicationService(repo, cliConfigLoader);
  });

  describe('list', () => {
    it('delegates to repo.findAll', () => {
      const skills = [createTestSkill()];
      (repo.findAll as ReturnType<typeof vi.fn>).mockReturnValue(skills);

      expect(service.list()).toBe(skills);
      expect(repo.findAll).toHaveBeenCalledOnce();
    });
  });

  describe('get', () => {
    it('delegates to repo.findById', () => {
      const skill = createTestSkill();
      (repo.findById as ReturnType<typeof vi.fn>).mockReturnValue(skill);

      expect(service.get('skill-001')).toBe(skill);
      expect(repo.findById).toHaveBeenCalledWith('skill-001');
    });
  });

  describe('create', () => {
    it('delegates to repo.create', () => {
      const input = { name: 'new-skill', content: 'skill content' };
      service.create(input);

      expect(repo.create).toHaveBeenCalledWith(input);
    });
  });

  describe('update', () => {
    it('delegates to repo.update', () => {
      const data = { content: 'updated content' };
      service.update('skill-001', data);

      expect(repo.update).toHaveBeenCalledWith('skill-001', data);
    });
  });

  describe('setEnabled', () => {
    it('delegates to repo.setEnabled', () => {
      service.setEnabled('skill-001', true);

      expect(repo.setEnabled).toHaveBeenCalledWith('skill-001', true);
    });
  });

  describe('remove', () => {
    it('delegates to repo.remove', () => {
      service.remove('skill-001');

      expect(repo.remove).toHaveBeenCalledWith('skill-001');
    });
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
      loadCliMcpServers: vi.fn(() => ({})),
      loadCliSkills: vi.fn(() => ({})),
      loadDiskConfig: vi.fn(() => ({})),
    } as unknown as GlobalConfigCacheImpl;

    service = new GlobalConfigApplicationService(diskConfigRepo, configCache);
  });

  describe('getConfig', () => {
    it('delegates to diskConfigRepo.getConfig', () => {
      const result = service.getConfig();

      expect(diskConfigRepo.getConfig).toHaveBeenCalledOnce();
      expect(result).toEqual({ systemPrompt: 'global prompt', defaultModel: 'claude-3' });
    });
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
