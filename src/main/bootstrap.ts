/**
 * 组合根（Composition Root）
 *
 * 负责创建所有实例并注入依赖。
 * 这是整个应用唯一知道所有具体实现类的地方。
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import type { FastifyInstance } from 'fastify';
import log from './shared/infrastructure/logger';

// Shared infrastructure
import { getDatabase, closeDatabase } from './shared/infrastructure';

// Configuration context
import * as path from 'path';
import * as os from 'os';
import { SqliteSkillRepository } from './configuration/infrastructure/SqliteSkillRepository';
import { SkillFileStore } from './configuration/infrastructure/SkillFileStore';
import { DiskGlobalConfigRepository } from './configuration/infrastructure/DiskGlobalConfigRepository';
import { CliConfigLoader } from './configuration/infrastructure/CliConfigLoader';
import { SkillFileWriterImpl } from './configuration/infrastructure/SkillFileWriter';
import { GlobalConfigCacheImpl } from './configuration/infrastructure/GlobalConfigCache';
import { InMemoryMcpToolCatalog } from './configuration/infrastructure/InMemoryMcpToolCatalog';
import { StdioMcpToolLister } from './configuration/infrastructure/StdioMcpToolLister';
import { InMemorySkillDraftStore } from './configuration/infrastructure/InMemorySkillDraftStore';
import { DefaultSkillCreatorLocator } from './configuration/infrastructure/DefaultSkillCreatorLocator';
import { cleanupSkillGenerationTmp } from './configuration/infrastructure/SkillGenerationTmpCleaner';
import { ConfigMergeService } from './configuration/domain/service/ConfigMergeService';
import { SkillApplicationService } from './configuration/application/SkillApplicationService';
import { GenerateSkillUseCase } from './configuration/application/GenerateSkillUseCase';
import { VerifySkillUseCase } from './configuration/application/VerifySkillUseCase';
import { GlobalConfigApplicationService } from './configuration/application/GlobalConfigApplicationService';
import type { SkillGenerationNotifier } from './configuration/domain/service/SkillGenerationNotifier';

// Workflow context
import { SqliteWorkflowRepository } from './workflow/infrastructure/SqliteWorkflowRepository';
import { WorkflowApplicationService } from './workflow/application/WorkflowApplicationService';

// Execution context
import { SqliteExecutionRepository } from './execution/infrastructure/SqliteExecutionRepository';
import { ClaudeAgentExecutor } from './execution/infrastructure/ClaudeAgentExecutor';
import type { ProgressNotifier } from './execution/domain/service/PipelineOrchestrator';
import { OutputHandler } from './execution/infrastructure/OutputHandler';
import { TemplateEngine } from './execution/domain/service/TemplateEngine';
import { PipelineOrchestrator } from './execution/domain/service/PipelineOrchestrator';
import { ExecutePipelineUseCase } from './execution/application/ExecutePipelineUseCase';
import { QueryExecutionUseCase } from './execution/application/QueryExecutionUseCase';
import { CancelExecutionUseCase } from './execution/application/CancelExecutionUseCase';
import { RetryExecutionUseCase } from './execution/application/RetryExecutionUseCase';
import { CancellationRegistry } from './execution/domain/service/CancellationRegistry';
import { RuleValidator } from './execution/domain/service/RuleValidator';
import { WorkflowLoaderAdapter } from './execution/infrastructure/WorkflowLoaderAdapter';

// Scheduling context
import { NodeCronScheduler } from './scheduling/infrastructure/NodeCronScheduler';
import { CronSyncUseCase } from './scheduling/application/CronSyncUseCase';

// REST route handlers (Interface layer)
import { WorkflowRoutes } from './workflow/interface/WorkflowRoutes';
import { ExecutionRoutes } from './execution/interface/ExecutionRoutes';
import { SkillRoutes } from './configuration/interface/SkillRoutes';
import { ConfigRoutes } from './configuration/interface/ConfigRoutes';

// Chat context
import { ChatConfig } from './chat/infrastructure/ChatConfig';
import { CliAgentGateway } from './chat/infrastructure/CliAgentGateway';
import { SqliteSessionRepository } from './chat/infrastructure/SqliteSessionRepository';
import { ChatApplicationService } from './chat/application/ChatApplicationService';
import { ChatRoutes } from './chat/interface/ChatRoutes';

// Filesystem module
import { FsConfig } from './filesystem/FsConfig';
import { FsRoutes } from './filesystem/FsRoutes';

// Worktree module
import { WorktreeService } from './worktree/WorktreeService';
import { WorktreeRoutes } from './worktree/WorktreeRoutes';

export interface AppContext {
  registerRoutes: (fastify: FastifyInstance) => void;
  syncCron: () => void;
  stopCron: () => void;
  cleanup: () => void;
}

/**
 * 初始化应用上下文，组装所有依赖
 *
 * @param progressNotifier 进度通知器（由 server.ts 传入 WebSocket 实现）
 * @param skillGenerationNotifier Skill 生成/验证会话通知器
 */
export function bootstrap(
  progressNotifier: ProgressNotifier,
  skillGenerationNotifier: SkillGenerationNotifier
): AppContext {
  log.info('Bootstrapping application context...');

  // === Infrastructure ===
  const db = getDatabase();

  // === Configuration Context ===
  const globalConfigRoot = process.env.GLOBAL_CONFIG_PATH || path.join(process.cwd(), 'global_config');
  const skillFileStore = new SkillFileStore(path.join(globalConfigRoot, 'skills'));
  const skillRepo = new SqliteSkillRepository(db, skillFileStore);
  const cliConfigLoader = new CliConfigLoader();
  const diskConfigRepo = new DiskGlobalConfigRepository();
  const skillFileWriter = new SkillFileWriterImpl();
  const globalConfigCache = new GlobalConfigCacheImpl(cliConfigLoader, diskConfigRepo);
  const configMergeService = new ConfigMergeService(
    skillRepo, globalConfigCache, skillFileWriter
  );
  const skillDraftStore = new InMemorySkillDraftStore();
  const skillCreatorLocator = new DefaultSkillCreatorLocator();
  const skillGenerationTmpRoot = process.env.SKILL_GENERATION_TMP_DIR
    || path.join(os.tmpdir(), 'agent-workflow-skill-gen');
  cleanupSkillGenerationTmp(skillGenerationTmpRoot);
  const skillAppService = new SkillApplicationService(
    skillRepo, cliConfigLoader, skillDraftStore, skillGenerationTmpRoot
  );
  const globalConfigAppService = new GlobalConfigApplicationService(diskConfigRepo, globalConfigCache);
  const mcpToolLister = new StdioMcpToolLister();
  const mcpToolCatalog = new InMemoryMcpToolCatalog({
    getMcpServers: () => configMergeService.loadGlobalConfig().mcpServers ?? {},
    lister: mcpToolLister
  });

  // === Execution Context ===
  const executionRepo = new SqliteExecutionRepository(db);
  const stepExecutor = new ClaudeAgentExecutor();
  const outputProcessor = new OutputHandler();
  const templateEngine = new TemplateEngine();
  const cancellationRegistry = new CancellationRegistry();
  const ruleValidator = new RuleValidator();
  // === Workflow Context (early init for WorkflowLoader) ===
  const workflowRepo = new SqliteWorkflowRepository(db);
  const workflowLoader = new WorkflowLoaderAdapter(workflowRepo);

  const pipelineOrchestrator = new PipelineOrchestrator(
    executionRepo, stepExecutor, configMergeService, progressNotifier, outputProcessor, templateEngine, cancellationRegistry, ruleValidator, workflowLoader
  );
  const executePipelineUseCase = new ExecutePipelineUseCase(pipelineOrchestrator);
  const queryExecutionUseCase = new QueryExecutionUseCase(executionRepo);
  const cancelExecutionUseCase = new CancelExecutionUseCase(executionRepo, cancellationRegistry);
  const retryExecutionUseCase = new RetryExecutionUseCase(executionRepo, pipelineOrchestrator, workflowLoader);
  const generateSkillUseCase = new GenerateSkillUseCase(
    stepExecutor,
    skillCreatorLocator,
    skillDraftStore,
    skillGenerationNotifier,
    skillGenerationTmpRoot
  );
  const verifySkillUseCase = new VerifySkillUseCase(
    stepExecutor,
    skillDraftStore,
    skillGenerationNotifier,
    skillGenerationTmpRoot
  );

  // === Scheduling Context ===
  const scheduler = new NodeCronScheduler();
  const cronSyncUseCase = new CronSyncUseCase(
    new SqliteWorkflowRepository(db), scheduler, executePipelineUseCase
  );

  // === Workflow Context ===
  const workflowAppService = new WorkflowApplicationService(
    workflowRepo, scheduler, executePipelineUseCase
  );

  // === Chat Context ===
  const chatConfig = new ChatConfig();
  const chatSessionRepo = new SqliteSessionRepository(db);
  const agentGateway = new CliAgentGateway(chatConfig);
  const chatAppService = new ChatApplicationService(chatSessionRepo, agentGateway);

  // === FileSystem Module ===
  const fsConfig = new FsConfig();

  // === REST Route handlers ===
  const workflowRoutes = new WorkflowRoutes(workflowAppService);
  const executionRoutes = new ExecutionRoutes(queryExecutionUseCase, cancelExecutionUseCase, retryExecutionUseCase);
  const skillRoutes = new SkillRoutes(
    skillAppService, generateSkillUseCase, verifySkillUseCase, skillDraftStore
  );
  const configRoutes = new ConfigRoutes(globalConfigAppService, mcpToolCatalog);
  const chatRoutes = new ChatRoutes(chatAppService, chatConfig);
  const fsRoutes = new FsRoutes(fsConfig);
  const worktreeRoutes = new WorktreeRoutes(new WorktreeService());

  log.info('Application context bootstrapped successfully');

  return {
    registerRoutes: (fastify: FastifyInstance) => {
      workflowRoutes.register(fastify);
      executionRoutes.register(fastify);
      skillRoutes.register(fastify);
      configRoutes.register(fastify);
      chatRoutes.register(fastify);
      fsRoutes.register(fastify);
      worktreeRoutes.register(fastify);
      log.info('REST routes registered');
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
