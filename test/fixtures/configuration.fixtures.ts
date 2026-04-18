/**
 * Configuration 测试数据工厂
 *
 * 提供创建 Skill 领域对象及相关 Repository/Service mock 的工厂函数。
 */

import { vi } from 'vitest';
import { Skill } from '../../src/main/configuration/domain/model';
import type { SkillRepository } from '../../src/main/configuration/domain/repository/SkillRepository';
import type { SkillDraftStore } from '../../src/main/configuration/domain/repository/SkillDraftStore';
import type { GlobalConfigProvider, SkillFileWriter } from '../../src/main/configuration/domain/service/ConfigMergeService';
import type { SkillGenerationNotifier } from '../../src/main/configuration/domain/service/SkillGenerationNotifier';
import type { SkillCreatorLocator } from '../../src/main/configuration/domain/service/SkillCreatorLocator';

/**
 * 创建测试用 Skill 实例
 *
 * 默认值：name='test-skill', dirPath='/tmp/skills/test-skill', enabled=true
 */
export function createTestSkill(overrides: Partial<{
  id: string;
  name: string;
  dirPath: string;
  description: string;
  allowedTools: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}> = {}): Skill {
  const name = overrides.name ?? 'test-skill';
  const props = {
    id: 'skill-001',
    name,
    dirPath: overrides.dirPath ?? `/tmp/skills/${name}`,
    enabled: true,
    createdAt: '2026-03-14T00:00:00Z',
    updatedAt: '2026-03-14T00:00:00Z',
    ...overrides
  };
  return new Skill(props);
}

/**
 * 创建 SkillRepository 的 vi.fn() mock
 */
export function createMockSkillRepository(): SkillRepository {
  return {
    findAll: vi.fn(() => []),
    findById: vi.fn(() => null),
    findByIds: vi.fn(() => []),
    findEnabled: vi.fn(() => []),
    findByName: vi.fn(() => null),
    create: vi.fn(() => createTestSkill()),
    update: vi.fn(() => null),
    setEnabled: vi.fn(() => null),
    remove: vi.fn(() => false)
  };
}

/**
 * 创建 GlobalConfigProvider 的 vi.fn() mock
 */
export function createMockGlobalConfigProvider(): GlobalConfigProvider {
  return {
    loadCliSkills: vi.fn(() => ({})),
    loadMcpServers: vi.fn(() => ({})),
    loadDiskConfig: vi.fn(() => ({}))
  };
}

/**
 * 创建 SkillFileWriter 的 vi.fn() mock
 */
export function createMockSkillFileWriter(): SkillFileWriter {
  return {
    writeStepSkills: vi.fn(() => undefined),
    cleanupStepSkills: vi.fn()
  };
}

/**
 * 创建 SkillDraftStore 的 vi.fn() mock（带内部 Map 便于断言）
 */
export function createMockSkillDraftStore(): SkillDraftStore {
  const map = new Map();
  return {
    put: vi.fn((draft) => { map.set(draft.generationId, draft); }),
    get: vi.fn((id) => map.get(id) ?? null),
    remove: vi.fn((id) => { map.delete(id); }),
    listAll: vi.fn(() => Array.from(map.values()))
  };
}

/**
 * 创建 SkillGenerationNotifier 的 vi.fn() mock
 */
export function createMockSkillGenerationNotifier(): SkillGenerationNotifier {
  return {
    start: vi.fn(),
    step: vi.fn(),
    done: vi.fn(),
    error: vi.fn()
  };
}

/**
 * 创建 SkillCreatorLocator 的 mock（默认返回一个占位路径）
 */
export function createMockSkillCreatorLocator(returnValue: string | null = '/mock/skill-creator'): SkillCreatorLocator {
  return {
    locate: vi.fn(() => returnValue)
  };
}
