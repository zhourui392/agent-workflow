/**
 * Skill 生成/验证临时目录孤儿清理
 *
 * 进程重启后 `{tmpRoot}/skill-gen-*` 与 `{tmpRoot}/skill-verify-*` 会留下
 * 无主数据。启动时扫描 root 的直接子项，只删除匹配两种前缀的子目录，
 * 其它内容保留（避免误伤不相关数据）。
 */

import * as fs from 'fs';
import * as path from 'path';
import log from '../../shared/infrastructure/logger';

const TARGET_PREFIXES = ['skill-gen-', 'skill-verify-'];

function matchesTarget(name: string): boolean {
  return TARGET_PREFIXES.some(prefix => name.startsWith(prefix) && name.length > prefix.length);
}

export function cleanupSkillGenerationTmp(tmpRoot: string): void {
  if (!fs.existsSync(tmpRoot)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tmpRoot, { withFileTypes: true });
  } catch (error) {
    log.warn('扫描 skill 临时目录失败', { tmpRoot, error });
    return;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!matchesTarget(entry.name)) continue;
    const target = path.join(tmpRoot, entry.name);
    try {
      fs.rmSync(target, { recursive: true, force: true });
      removed += 1;
    } catch (error) {
      log.warn('清理 skill 孤儿目录失败', { target, error });
    }
  }

  if (removed > 0) {
    log.info('清理 skill 生成孤儿临时目录', { tmpRoot, removed });
  }
}
