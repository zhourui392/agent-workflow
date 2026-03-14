/**
 * Configuration 测试数据工厂
 *
 * 提供创建 Skill 领域对象及相关 Repository/Service mock 的工厂函数。
 */

import { vi } from 'vitest';
import { Skill } from '../../src/main/configuration/domain/model';
import type { SkillRepository } from '../../src/main/configuration/domain/repository/SkillRepository';
import type { GlobalConfigProvider, SkillFileWriter } from '../../src/main/configuration/domain/service/ConfigMergeService';

/**
 * 创建测试用 Skill 实例
 *
 * 默认值：name='test-skill', content='Test skill content', enabled=true
 */
export function createTestSkill(overrides: Partial<{
  id: string;
  name: string;
  description: string;
  allowedTools: string[];
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}> = {}): Skill {
  const props = {
    id: 'skill-001',
    name: 'test-skill',
    content: 'Test skill content',
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
