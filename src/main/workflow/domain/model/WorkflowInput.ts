/**
 * 工作流输入参数定义（值对象）
 */
export interface WorkflowInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}
