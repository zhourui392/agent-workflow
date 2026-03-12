/**
 * Skills IPC 处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import { ipcMain } from 'electron';
import { skillRepository } from '../store/repositories';
import { loadClaudeCliSkills } from '../core';
import type { CreateSkillInput, UpdateSkillInput, Skill } from '../store/models';

/**
 * CLI Skill 配置项（用于前端显示）
 */
interface CliSkill {
  id: string;
  name: string;
  description: string;
  allowedTools?: string[];
  content: string;
  enabled: boolean;
  source: 'cli';
  createdAt: string;
  updatedAt: string;
}

/**
 * 注册 Skills 相关 IPC 处理器
 */
export function registerSkillHandlers(): void {
  ipcMain.handle('skills:list', () => {
    return skillRepository.findAll();
  });

  ipcMain.handle('skills:list-all', () => {
    const dbSkills = skillRepository.findAll();
    const cliSkills = loadClaudeCliSkills();

    const result: (Skill | CliSkill)[] = [...dbSkills];

    const dbNames = new Set(dbSkills.map(s => s.name));
    const now = new Date().toISOString();

    for (const [name, content] of Object.entries(cliSkills)) {
      if (!dbNames.has(name)) {
        result.push({
          id: `cli:${name}`,
          name,
          description: 'Claude Code CLI 插件 Skill',
          content,
          enabled: true,
          source: 'cli',
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return result;
  });

  ipcMain.handle('skills:get', (_, id: string) => {
    return skillRepository.findById(id);
  });

  ipcMain.handle('skills:create', (_, data: CreateSkillInput) => {
    return skillRepository.create(data);
  });

  ipcMain.handle('skills:update', (_, id: string, data: UpdateSkillInput) => {
    return skillRepository.update(id, data);
  });

  ipcMain.handle('skills:delete', (_, id: string) => {
    return skillRepository.remove(id);
  });

  ipcMain.handle('skills:set-enabled', (_, id: string, enabled: boolean) => {
    return skillRepository.setEnabled(id, enabled);
  });
}
