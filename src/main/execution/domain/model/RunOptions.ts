/**
 * 运行时覆盖选项
 *
 * 在触发工作流执行时传入，优先级高于工作流定义中的默认值。
 */
export interface RunOptions {
  workingDirectory?: string;
}
