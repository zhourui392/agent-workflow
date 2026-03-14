/**
 * 规则验证器（领域服务）
 *
 * 对步骤输出执行快速的规则验证（无 LLM 调用成本）。
 */

export interface ValidationRule {
  type: 'regex' | 'contains';
  pattern?: string;
  value?: string;
}

export interface RuleValidationResult {
  passed: boolean;
  reason?: string;
}

export class RuleValidator {
  validate(output: string, rules: ValidationRule[]): RuleValidationResult {
    for (const rule of rules) {
      if (rule.type === 'contains') {
        if (!rule.value || !output.includes(rule.value)) {
          return {
            passed: false,
            reason: `输出未包含期望内容: "${rule.value || ''}"`
          };
        }
      } else if (rule.type === 'regex') {
        try {
          const regex = new RegExp(rule.pattern || '');
          if (!regex.test(output)) {
            return {
              passed: false,
              reason: `输出不匹配正则: ${rule.pattern}`
            };
          }
        } catch {
          return {
            passed: false,
            reason: `无效正则表达式: ${rule.pattern}`
          };
        }
      }
    }

    return { passed: true };
  }
}
