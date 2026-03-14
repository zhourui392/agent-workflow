/**
 * 工作流输出配置（值对象）
 */
export interface WorkflowOutput {
  file?: {
    path: string;
    format?: 'text' | 'json' | 'markdown';
  };
  webhook?: {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    timeoutMs?: number;
  };
}
