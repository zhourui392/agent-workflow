/**
 * 模板变量渲染引擎（领域服务）
 *
 * 支持的模板变量:
 * - {{inputs.xxx}}: 输入参数
 * - {{steps.<name>.output}}: 步骤输出
 *
 * @author zhourui
 * @since 2026/03/14
 */

/**
 * 模板渲染上下文
 */
export interface TemplateContext {
  inputs?: Record<string, unknown>;
  steps?: Record<string, { output: string }>;
}

/**
 * 从上下文中获取嵌套值
 *
 * @param context 上下文对象
 * @param path 路径表达式，如 "inputs.name" 或 "steps.step1.output"
 * @returns 获取到的值，不存在则返回 undefined
 */
function getNestedValue(context: TemplateContext, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    if (part in record) {
      current = record[part];
    } else if (/^\d+$/.test(part)) {
      const entries = Object.entries(record);
      const idx = parseInt(part, 10);
      current = idx < entries.length ? entries[idx][1] : undefined;
    } else {
      current = undefined;
    }
  }

  return current;
}

/**
 * 模板变量渲染引擎
 *
 * 将模板字符串中的 {{variable}} 占位符替换为上下文中的实际值。
 */
export class TemplateEngine {
  /**
   * 渲染模板字符串
   *
   * @param template 模板字符串
   * @param context 渲染上下文
   * @returns 渲染后的字符串
   */
  render(template: string, context: TemplateContext = {}): string {
    return template.replace(/\{\{(\s*[^{}]+?\s*)\}\}/g, (match, variableName: string) => {
      const trimmedName = variableName.trim();

      const value = getNestedValue(context, trimmedName);
      if (value === undefined || value === null) {
        return match;
      }

      if (typeof value === 'object') {
        return JSON.stringify(value);
      }

      return String(value);
    });
  }

  /**
   * 提取模板中使用的变量名列表
   *
   * @param template 模板字符串
   * @returns 变量名列表（去重）
   */
  extractVariables(template: string): string[] {
    const matches = template.matchAll(/\{\{(\s*[^{}]+?\s*)\}\}/g);
    const variables = new Set<string>();

    for (const match of matches) {
      variables.add(match[1].trim());
    }

    return Array.from(variables);
  }

  /**
   * 验证模板中的变量是否都可以被解析
   *
   * @param template 模板字符串
   * @param context 渲染上下文
   * @returns 未解析的变量列表，空数组表示全部可解析
   */
  validate(template: string, context: TemplateContext = {}): string[] {
    const variables = this.extractVariables(template);
    const unresolvedVariables: string[] = [];

    for (const variable of variables) {
      const value = getNestedValue(context, variable);
      if (value === undefined) {
        unresolvedVariables.push(variable);
      }
    }

    return unresolvedVariables;
  }
}
