/**
 * MCP 服务 IPC 处理器
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  IdSchema,
  CreateMcpServerSchema,
  UpdateMcpServerSchema,
  validateInput
} from '../../shared/interface';
import { mcpServerToDTO } from '../../shared/interface/dtoMapper';
import { McpServer } from '../domain/model';
import type { McpServerApplicationService } from '../application/McpServerApplicationService';

export class McpServerIpcHandler {
  constructor(private readonly service: McpServerApplicationService) {}

  register(): void {
    ipcMain.handle('mcp-servers:list', () => {
      return this.service.list().map(mcpServerToDTO);
    });

    ipcMain.handle('mcp-servers:list-all', () => {
      return this.service.listAll().map(item =>
        item instanceof McpServer ? mcpServerToDTO(item) : item
      );
    });

    ipcMain.handle('mcp-servers:get', (_, id: unknown) => {
      const s = this.service.get(validateInput(IdSchema, id));
      return s ? mcpServerToDTO(s) : null;
    });

    ipcMain.handle('mcp-servers:create', (_, data: unknown) => {
      return mcpServerToDTO(this.service.create(validateInput(CreateMcpServerSchema, data)));
    });

    ipcMain.handle('mcp-servers:update', (_, id: unknown, data: unknown) => {
      const s = this.service.update(
        validateInput(IdSchema, id),
        validateInput(UpdateMcpServerSchema, data)
      );
      return s ? mcpServerToDTO(s) : null;
    });

    ipcMain.handle('mcp-servers:delete', (_, id: unknown) => {
      return this.service.remove(validateInput(IdSchema, id));
    });

    ipcMain.handle('mcp-servers:set-enabled', (_, id: unknown, enabled: unknown) => {
      const s = this.service.setEnabled(
        validateInput(IdSchema, id),
        validateInput(z.boolean(), enabled)
      );
      return s ? mcpServerToDTO(s) : null;
    });
  }
}
