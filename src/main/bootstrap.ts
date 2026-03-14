/**
 * 组合根（Composition Root）
 *
 * 负责创建所有实例并注入依赖。
 * 这是整个应用唯一知道所有具体实现类的地方。
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import log from 'electron-log';

// Shared infrastructure
import { getDatabase, closeDatabase } from './shared/infrastructure';

// Configuration context
import { SqliteSkillRepository } from './configuration/infrastructure/SqliteSkillRepository';
import { DiskGlobalConfigRepository } from './configuration/infrastructure/DiskGlobalConfigRepository';
import { CliConfigLoader } from './configuration/infrastructure/CliConfigLoader';
import { SkillFileWriterImpl } from './configuration/infrastructure/SkillFileWriter';
import { GlobalConfigCacheImpl } from './configuration/infrastructure/GlobalConfigCache';
import { ConfigMergeService } from './configuration/domain/service/ConfigMergeService';
import { SkillApplicationService } from './configuration/application/SkillApplicationService';
import { GlobalConfigApplicationService } from './configuration/application/GlobalConfigApplicationService';

// Workflow context
import { SqliteWorkflowRepository } from './workflow/infrastructure/SqliteWorkflowRepository';
import { WorkflowApplicationService } from './workflow/application/WorkflowApplicationService';

// Execution context
import { SqliteExecutionRepository } from './execution/infrastructure/SqliteExecutionRepository';
import { ClaudeAgentExecutor } from './execution/infrastructure/ClaudeAgentExecutor';
import { ElectronProgressNotifier } from './execution/infrastructure/ElectronProgressNotifier';
import { OutputHandler } from './execution/infrastructure/OutputHandler';
import { TemplateEngine } from './execution/domain/service/TemplateEngine';
import { PipelineOrchestrator } from './execution/domain/service/PipelineOrchestrator';
import { ExecutePipelineUseCase } from './execution/application/ExecutePipelineUseCase';
import { QueryExecutionUseCase } from './execution/application/QueryExecutionUseCase';
import { CancelExecutionUseCase } from './execution/application/CancelExecutionUseCase';
import { CancellationRegistry } from './execution/domain/service/CancellationRegistry';
import { RuleValidator } from './execution/domain/service/RuleValidator';

// Scheduling context
import { NodeCronScheduler } from './scheduling/infrastructure/NodeCronScheduler';
import { CronSyncUseCase } from './scheduling/application/CronSyncUseCase';

// IPC handlers (Interface layer)
import { WorkflowIpcHandler } from './workflow/interface/WorkflowIpcHandler';
import { ExecutionIpcHandler } from './execution/interface/ExecutionIpcHandler';
import { SkillIpcHandler } from './configuration/interface/SkillIpcHandler';
import { ConfigIpcHandler } from './configuration/interface/ConfigIpcHandler';

export interface AppContext {
  registerIpc: () => void;
  syncCron: () => void;
  stopCron: () => void;
  cleanup: () => void;
}

/**
 * 初始化应用上下文，组装所有依赖
 */
export function bootstrap(): AppContext {
  log.info('Bootstrapping application context...');

  // === Infrastructure ===
  const db = getDatabase();

  // === Configuration Context ===
  const skillRepo = new SqliteSkillRepository(db);
  const cliConfigLoader = new CliConfigLoader();
  const diskConfigRepo = new DiskGlobalConfigRepository();
  const skillFileWriter = new SkillFileWriterImpl();
  const globalConfigCache = new GlobalConfigCacheImpl(cliConfigLoader, diskConfigRepo);
  const configMergeService = new ConfigMergeService(
    skillRepo, globalConfigCache, skillFileWriter
  );
  const skillAppService = new SkillApplicationService(skillRepo, cliConfigLoader);
  const globalConfigAppService = new GlobalConfigApplicationService(diskConfigRepo, globalConfigCache);

  // === Execution Context ===
  const executionRepo = new SqliteExecutionRepository(db);
  const stepExecutor = new ClaudeAgentExecutor();
  const progressNotifier = new ElectronProgressNotifier();
  const outputProcessor = new OutputHandler();
  const templateEngine = new TemplateEngine();
  const cancellationRegistry = new CancellationRegistry();
  const ruleValidator = new RuleValidator();
  const pipelineOrchestrator = new PipelineOrchestrator(
    executionRepo, stepExecutor, configMergeService, progressNotifier, outputProcessor, templateEngine, cancellationRegistry, ruleValidator
  );
  const executePipelineUseCase = new ExecutePipelineUseCase(pipelineOrchestrator);
  const queryExecutionUseCase = new QueryExecutionUseCase(executionRepo);
  const cancelExecutionUseCase = new CancelExecutionUseCase(executionRepo, cancellationRegistry);

  // === Scheduling Context ===
  const scheduler = new NodeCronScheduler();
  const cronSyncUseCase = new CronSyncUseCase(
    new SqliteWorkflowRepository(db), scheduler, executePipelineUseCase
  );

  // === Workflow Context ===
  const workflowRepo = new SqliteWorkflowRepository(db);
  const workflowAppService = new WorkflowApplicationService(
    workflowRepo, scheduler, executePipelineUseCase
  );

  // === IPC Handlers ===
  const workflowIpcHandler = new WorkflowIpcHandler(workflowAppService);
  const executionIpcHandler = new ExecutionIpcHandler(queryExecutionUseCase, cancelExecutionUseCase);
  const skillIpcHandler = new SkillIpcHandler(skillAppService);
  const configIpcHandler = new ConfigIpcHandler(globalConfigAppService);

  log.info('Application context bootstrapped successfully');

  return {
    registerIpc: () => {
      workflowIpcHandler.register();
      executionIpcHandler.register();
      skillIpcHandler.register();
      configIpcHandler.register();
      log.info('IPC handlers registered');
    },
    syncCron: () => {
      cronSyncUseCase.syncAll();
    },
    stopCron: () => {
      scheduler.stopAll();
    },
    cleanup: () => {
      scheduler.stopAll();
      closeDatabase();
      log.info('Application cleanup completed');
    }
  };
}
