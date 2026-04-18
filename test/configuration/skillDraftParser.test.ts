/**
 * SkillDraftParser 单元测试
 *
 * 从 SKILL.md 文本解析出 {name, description, allowedTools}
 */

import { describe, it, expect } from 'vitest';
import { parseSkillMd, SkillDraftParseError } from '../../src/main/configuration/domain/service/SkillDraftParser';

describe('parseSkillMd', () => {
  it('解析合法 frontmatter（name + description + allowed-tools）', () => {
    const md = [
      '---',
      'name: my-skill',
      'description: A great skill',
      'allowed-tools: Read, Write, Bash',
      '---',
      '',
      '# Body'
    ].join('\n');

    const parsed = parseSkillMd(md);
    expect(parsed.name).toBe('my-skill');
    expect(parsed.description).toBe('A great skill');
    expect(parsed.allowedTools).toEqual(['Read', 'Write', 'Bash']);
  });

  it('allowed-tools 为数组形式', () => {
    const md = [
      '---',
      'name: x',
      'allowed-tools:',
      '  - Read',
      '  - Write',
      '---',
      'body'
    ].join('\n');
    const parsed = parseSkillMd(md);
    expect(parsed.allowedTools).toEqual(['Read', 'Write']);
  });

  it('allowed-tools 缺失时返回 undefined', () => {
    const md = ['---', 'name: x', 'description: d', '---', 'body'].join('\n');
    const parsed = parseSkillMd(md);
    expect(parsed.allowedTools).toBeUndefined();
  });

  it('description 缺失时返回 undefined', () => {
    const md = ['---', 'name: x', '---', 'body'].join('\n');
    const parsed = parseSkillMd(md);
    expect(parsed.description).toBeUndefined();
  });

  it('缺少 frontmatter 时抛错', () => {
    const md = '# No frontmatter\nbody';
    expect(() => parseSkillMd(md)).toThrow(SkillDraftParseError);
  });

  it('frontmatter 未闭合时抛错', () => {
    const md = '---\nname: x\nbody without close';
    expect(() => parseSkillMd(md)).toThrow(SkillDraftParseError);
  });

  it('name 缺失时抛错', () => {
    const md = '---\ndescription: d\n---\nbody';
    expect(() => parseSkillMd(md)).toThrow(/name/i);
  });

  it('name 非字符串时抛错', () => {
    const md = '---\nname: 123\n---\nbody';
    // YAML 解析为 number，parser 必须校验类型
    expect(() => parseSkillMd(md)).toThrow(SkillDraftParseError);
  });

  it('name 非法字符时抛错', () => {
    const md = '---\nname: has space\n---\nbody';
    expect(() => parseSkillMd(md)).toThrow(/name/i);
  });

  it('allowed-tools 空字符串视为空数组', () => {
    const md = '---\nname: x\nallowed-tools: \n---\nbody';
    const parsed = parseSkillMd(md);
    expect(parsed.allowedTools === undefined || parsed.allowedTools.length === 0).toBe(true);
  });

  it('空输入抛错', () => {
    expect(() => parseSkillMd('')).toThrow(SkillDraftParseError);
  });
});
