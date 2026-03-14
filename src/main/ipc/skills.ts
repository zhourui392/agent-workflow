/**
 * Skills IPC 处理器
 *
 * @author zhourui(V33215020)
 * @since 2026/03/12
 */

import { ipcMain } from 'electron';
import { skillRepository } from '../store/repositories';
import { loadClaudeCliSkillsWithDetails } from '../core';
import type { Skill } from '../store/models';
import {
  IdSchema,
  CreateSkillSchema,
  UpdateSkillSchema,
  validateInput
} from './schemas';
import { z } from 'zod';

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
    const cliSkills = loadClaudeCliSkillsWithDetails();

    const result: (Skill | CliSkill)[] = [...dbSkills];

    const dbNames = new Set(dbSkills.map(s => s.name));
    const now = new Date().toISOString();

    for (const skill of cliSkills) {
      if (!dbNames.has(skill.name)) {
        result.push({
          id: `cli:${skill.name}`,
          name: skill.name,
          description: skill.description || 'Claude Code CLI Skill',
          allowedTools: skill.allowedTools,
          content: skill.content,
          enabled: true,
          source: 'cli',
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return result;
  });

  ipcMain.handle('skills:get', (_, id: unknown) => {
    return skillRepository.findById(validateInput(IdSchema, id));
  });

  ipcMain.handle('skills:create', (_, data: unknown) => {
    return skillRepository.create(validateInput(CreateSkillSchema, data));
  });

  ipcMain.handle('skills:update', (_, id: unknown, data: unknown) => {
    return skillRepository.update(
      validateInput(IdSchema, id),
      validateInput(UpdateSkillSchema, data)
    );
  });

  ipcMain.handle('skills:delete', (_, id: unknown) => {
    return skillRepository.remove(validateInput(IdSchema, id));
  });

  ipcMain.handle('skills:set-enabled', (_, id: unknown, enabled: unknown) => {
    return skillRepository.setEnabled(
      validateInput(IdSchema, id),
      validateInput(z.boolean(), enabled)
    );
  });
}
