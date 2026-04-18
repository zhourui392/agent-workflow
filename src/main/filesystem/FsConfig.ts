/**
 * 文件系统模块配置
 *
 * 允许访问的根路径解析优先级：env FS_ROOTS > settings.yaml fs.roots > [process.cwd()]
 * env FS_ROOTS 为逗号分隔的绝对路径列表。
 */

import * as path from 'path';
import { loadAppSettings, type AppSettings } from '../shared/infrastructure/AppSettings';

export class FsConfig {
  readonly roots: string[];

  constructor(env: NodeJS.ProcessEnv = process.env, settings?: AppSettings) {
    const s = settings ?? loadAppSettings();

    let list: string[];
    const envRaw = env.FS_ROOTS;
    if (envRaw && envRaw.trim()) {
      list = envRaw.split(',').map(r => r.trim()).filter(r => r.length > 0);
    } else if (s.fs?.roots && s.fs.roots.length > 0) {
      list = s.fs.roots;
    } else {
      list = [process.cwd()];
    }

    this.roots = Array.from(new Set(list.map(r => path.resolve(r))));
  }
}
