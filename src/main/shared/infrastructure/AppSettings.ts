/**
 * global_config/settings.yaml 加载器
 *
 * 单一数据源：所有从 yaml 读的应用级配置都经过此模块。
 * 优先级由各 Config 类自行处理：env > yaml > hardcoded。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import log from './logger';

export interface EnvPromptEntry {
  key: string;
  label?: string;
  color?: string;
  prompt: string;
}

export interface AppSettings {
  defaultModel?: string;
  allowedTools?: string[];
  fs?: { roots?: string[] };
  chat?: { defaultWorkingDir?: string };
  envPrompts?: EnvPromptEntry[];
}

function getGlobalConfigPath(): string {
  return process.env.GLOBAL_CONFIG_PATH || path.join(process.cwd(), 'global_config');
}

function isEnvPromptEntry(x: unknown): x is EnvPromptEntry {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as { key?: unknown; prompt?: unknown };
  return typeof o.key === 'string' && typeof o.prompt === 'string';
}

function normalize(raw: Record<string, unknown>): AppSettings {
  const out: AppSettings = {};

  if (typeof raw.default_model === 'string') out.defaultModel = raw.default_model;
  if (Array.isArray(raw.allowed_tools)) {
    out.allowedTools = raw.allowed_tools.filter((x): x is string => typeof x === 'string');
  }

  if (raw.fs && typeof raw.fs === 'object') {
    const roots = (raw.fs as { roots?: unknown }).roots;
    if (Array.isArray(roots)) {
      const list = roots.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      if (list.length > 0) out.fs = { roots: list };
    }
  }

  if (raw.chat && typeof raw.chat === 'object') {
    const d = (raw.chat as { defaultWorkingDir?: unknown }).defaultWorkingDir;
    if (typeof d === 'string' && d.trim().length > 0) {
      out.chat = { defaultWorkingDir: d.trim() };
    }
  }

  if (Array.isArray(raw.env_prompts)) {
    const entries = raw.env_prompts.filter(isEnvPromptEntry);
    if (entries.length > 0) out.envPrompts = entries;
  }

  return out;
}

let cached: AppSettings | null = null;

export function loadAppSettings(force = false): AppSettings {
  if (cached && !force) return cached;

  const settingsPath = path.join(getGlobalConfigPath(), 'settings.yaml');
  if (!fs.existsSync(settingsPath)) {
    cached = {};
    return cached;
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const raw = (yaml.parse(content) as Record<string, unknown>) || {};
    cached = normalize(raw);
    return cached;
  } catch (error) {
    log.warn('Failed to parse settings.yaml', error);
    cached = {};
    return cached;
  }
}

/** 仅测试或 bootstrap 重载时使用 */
export function resetAppSettingsCache(): void {
  cached = null;
}
