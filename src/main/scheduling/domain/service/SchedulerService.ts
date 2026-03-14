/**
 * 调度服务接口
 */
export interface SchedulerService {
  register(workflowId: string, schedule: string, callback: () => Promise<void>): void;
  unregister(workflowId: string): void;
  stopAll(): void;
  getScheduledCount(): number;
}
