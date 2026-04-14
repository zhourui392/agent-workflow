/**
 * 路径安全工具
 *
 * 对外暴露的路径必须归一化后以某个允许根目录开头，否则视为越界。
 * 用于防御 `..` / 符号链接之外的显式路径篡改。
 */

import * as path from 'path';

export class PathOutOfRootError extends Error {
  constructor(attempted: string) {
    super(`Path not under any allowed root: ${attempted}`);
    this.name = 'PathOutOfRootError';
  }
}

/**
 * 将传入路径归一化为绝对路径，并校验是否位于 roots 之一下方。
 * 抛出 PathOutOfRootError 时表示拒绝访问。
 *
 * @param input 用户传入的路径（相对或绝对）
 * @param roots 允许的根目录（必须是已归一化的绝对路径）
 * @returns 归一化后的绝对路径
 */
export function assertUnderRoot(input: string, roots: string[]): string {
  if (!input || input.trim() === '') {
    throw new PathOutOfRootError(input);
  }
  const resolved = path.resolve(input);
  for (const root of roots) {
    const normRoot = path.resolve(root);
    if (resolved === normRoot || resolved.startsWith(normRoot + path.sep)) {
      return resolved;
    }
  }
  throw new PathOutOfRootError(input);
}
