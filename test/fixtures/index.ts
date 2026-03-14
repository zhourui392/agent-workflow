/**
 * 测试夹具统一导出
 *
 * 提供所有测试数据工厂函数和 mock 创建函数的集中入口。
 *
 * 用法:
 *   import { createTestWorkflow, createMockExecutionRepository } from '../fixtures';
 */

// Workflow 相关
export {
  createTestWorkflow,
  createMockWorkflowRepository
} from './workflow.fixtures';

// Execution 相关
export {
  createTestExecution,
  createTestStepExecution,
  createMockExecutionRepository
} from './execution.fixtures';

// Configuration 相关
export {
  createTestMcpServer,
  createTestSkill,
  createMockMcpServerRepository,
  createMockSkillRepository,
  createMockGlobalConfigProvider,
  createMockSkillFileWriter
} from './configuration.fixtures';

// 领域服务 mock
export {
  createMockStepExecutor,
  createMockProgressNotifier,
  createMockOutputProcessor,
  createMockConfigMergeService
} from './service.fixtures';
