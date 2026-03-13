/**
 * 文件读取与路径工具
 *
 * @author zhourui(V33215020)
 * @since 2026/03/14
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as yaml from 'yaml';
import log from 'electron-log';

/**
 * 获取应用全局配置目录路径
 *
 * @returns 全局配置目录绝对路径
 */
export function getGlobalConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'global_config');
  }
  return path.join(__dirname, '..', '..', '..', '..', 'global_config');
}

/**
 * 读取文件内容，不存在则返回null
 *
 * @param filePath 文件路径
 * @returns 文件内容或null
 */
export function readFileOrNull(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (error) {
    log.warn(`Failed to read file: ${filePath}`, error);
  }
  return null;
}

/**
 * 解析YAML文件，不存在或解析失败则返回空对象
 *
 * @param filePath 文件路径
 * @returns 解析结果或空对象
 */
export function parseYamlFile<T>(filePath: string): T | null {
  const content = readFileOrNull(filePath);
  if (!content) {
    return null;
  }

  try {
    return yaml.parse(content) as T;
  } catch (error) {
    log.warn(`Failed to parse YAML file: ${filePath}`, error);
    return null;
  }
}
