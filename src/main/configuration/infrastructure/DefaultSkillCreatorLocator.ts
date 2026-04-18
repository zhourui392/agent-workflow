/**
 * DefaultSkillCreatorLocator
 *
 * 按优先级定位 skill-creator 源目录：
 *   1) 环境变量 SKILL_CREATOR_DIR
 *   2) ~/.claude/skills/skill-creator/
 *   3) ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/
 *
 * 未找到返回 null，由上层（GenerateSkillUseCase）给出安装提示。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SkillCreatorLocator } from '../domain/service/SkillCreatorLocator';

function candidatePaths(): string[] {
  const home = os.homedir();
  const fromEnv = process.env.SKILL_CREATOR_DIR;
  return [
    ...(fromEnv ? [fromEnv] : []),
    path.join(home, '.claude', 'skills', 'skill-creator'),
    path.join(home, '.claude', 'plugins', 'marketplaces', 'claude-plugins-official', 'plugins', 'skill-creator', 'skills', 'skill-creator')
  ];
}

export class DefaultSkillCreatorLocator implements SkillCreatorLocator {
  locate(): string | null {
    for (const dir of candidatePaths()) {
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) {
        return dir;
      }
    }
    return null;
  }
}
