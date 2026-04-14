/**
 * 文件系统模块配置
 *
 * 读取 FS_ROOTS 环境变量（逗号分隔的绝对路径列表），未设置时默认允许 process.cwd()。
 */

import * as path from 'path';

export class FsConfig {
  readonly roots: string[];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const raw = env.FS_ROOTS;
    const list = raw
      ? raw.split(',').map(r => r.trim()).filter(r => r.length > 0)
      : [process.cwd()];
    // 归一化并去重
    this.roots = Array.from(new Set(list.map(r => path.resolve(r))));
  }
}
