/**
 * 文件系统 REST 路由
 *
 * 端点：
 * - GET    /api/fs/roots             列出允许访问的根目录
 * - GET    /api/fs/list?path=        列出目录内容（文件元数据）
 * - POST   /api/fs/upload            上传文件（multipart: path + file）
 * - GET    /api/fs/download?path=    下载文件
 * - DELETE /api/fs/delete?path=      删除文件（不允许删目录）
 *
 * 所有涉及 path 的端点都先做 assertUnderRoot 校验，阻止越界访问。
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FsConfig } from './FsConfig';
import { assertUnderRoot, PathOutOfRootError } from './pathSafety';
import log from '../shared/infrastructure/logger';

interface FileEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  lastModified: number;
}

async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const names = await fsp.readdir(dirPath);
  const entries = await Promise.all(names.map(async (name): Promise<FileEntry | null> => {
    const full = path.join(dirPath, name);
    try {
      const st = await fsp.stat(full);
      return {
        name,
        path: full,
        dir: st.isDirectory(),
        size: st.size,
        lastModified: st.mtimeMs
      };
    } catch {
      return null;
    }
  }));
  // 目录在前，其次按名称
  return entries
    .filter((e): e is FileEntry => e !== null)
    .sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function safeCheck<T>(roots: string[], input: string, reply: FastifyReply, fn: (resolved: string) => Promise<T> | T): Promise<T | undefined> | T | undefined {
  try {
    const resolved = assertUnderRoot(input, roots);
    return fn(resolved);
  } catch (err) {
    if (err instanceof PathOutOfRootError) {
      reply.code(403);
      return undefined;
    }
    throw err;
  }
}

export class FsRoutes {
  constructor(private readonly config: FsConfig) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/api/fs/roots', async () => {
      return { roots: this.config.roots };
    });

    fastify.get('/api/fs/list', async (req: FastifyRequest<{ Querystring: { path?: string } }>, reply: FastifyReply) => {
      const p = req.query.path;
      if (!p) { reply.code(400); return { error: 'path is required' }; }
      try {
        const resolved = assertUnderRoot(p, this.config.roots);
        const st = await fsp.stat(resolved);
        if (!st.isDirectory()) { reply.code(400); return { error: 'Not a directory' }; }
        const entries = await listDirectory(resolved);
        const parent = path.dirname(resolved);
        if (parent !== resolved) {
          try {
            assertUnderRoot(parent, this.config.roots);
            entries.unshift({ name: '..', path: parent, dir: true, size: 0, lastModified: 0 });
          } catch (e) {
            if (!(e instanceof PathOutOfRootError)) throw e;
          }
        }
        return entries;
      } catch (err) {
        if (err instanceof PathOutOfRootError) { reply.code(403); return { error: 'Forbidden' }; }
        reply.code(404);
        return { error: 'Not found' };
      }
    });

    fastify.get('/api/fs/download', async (req: FastifyRequest<{ Querystring: { path?: string } }>, reply: FastifyReply) => {
      const p = req.query.path;
      if (!p) { reply.code(400); return { error: 'path is required' }; }
      try {
        const resolved = assertUnderRoot(p, this.config.roots);
        const st = await fsp.stat(resolved);
        if (st.isDirectory()) { reply.code(400); return { error: 'Cannot download a directory' }; }
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(resolved))}"`);
        reply.header('Content-Type', 'application/octet-stream');
        return reply.send(fs.createReadStream(resolved));
      } catch (err) {
        if (err instanceof PathOutOfRootError) { reply.code(403); return { error: 'Forbidden' }; }
        reply.code(404);
        return { error: 'Not found' };
      }
    });

    fastify.delete('/api/fs/delete', async (req: FastifyRequest<{ Querystring: { path?: string } }>, reply: FastifyReply) => {
      const p = req.query.path;
      if (!p) { reply.code(400); return { error: 'path is required' }; }
      try {
        const resolved = assertUnderRoot(p, this.config.roots);
        const st = await fsp.stat(resolved);
        if (st.isDirectory()) { reply.code(400); return { error: 'Refusing to delete directory' }; }
        await fsp.unlink(resolved);
        log.info(`Deleted file: ${resolved}`);
        return { success: true };
      } catch (err) {
        if (err instanceof PathOutOfRootError) { reply.code(403); return { error: 'Forbidden' }; }
        reply.code(404);
        return { error: 'Not found' };
      }
    });

    fastify.post('/api/fs/upload', async (req: FastifyRequest, reply: FastifyReply) => {
      // @fastify/multipart: 从表单字段读取 path，从 file 部分读取二进制
      const parts = (req as unknown as { parts: () => AsyncIterable<MultipartPart> }).parts();
      let targetDir: string | null = null;
      let savedPath: string | null = null;

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'path') {
          targetDir = String(part.value);
        } else if (part.type === 'file' && part.fieldname === 'file') {
          if (!targetDir) {
            reply.code(400);
            return { error: 'path field must appear before file' };
          }
          let resolved: string;
          try {
            resolved = assertUnderRoot(targetDir, this.config.roots);
          } catch {
            reply.code(403);
            return { error: 'Forbidden' };
          }
          const stat = await fsp.stat(resolved).catch(() => null);
          if (!stat || !stat.isDirectory()) {
            reply.code(400);
            return { error: 'Target path is not a directory' };
          }
          const filename = path.basename(part.filename || 'upload.bin');
          const dest = path.join(resolved, filename);
          // 再次校验（防御拼接越界，虽然 basename 已阻断）
          try { assertUnderRoot(dest, this.config.roots); } catch { reply.code(403); return { error: 'Forbidden' }; }
          await new Promise<void>((resolve, reject) => {
            const ws = fs.createWriteStream(dest);
            part.file.on('error', reject);
            ws.on('error', reject);
            ws.on('finish', () => resolve());
            part.file.pipe(ws);
          });
          savedPath = dest;
          log.info(`Uploaded file: ${dest}`);
        }
      }

      if (!savedPath) {
        reply.code(400);
        return { error: 'No file uploaded' };
      }
      return { success: true, path: savedPath };
    });
  }
}

// Minimal multipart typing to avoid importing @fastify/multipart types here
interface MultipartPart {
  type: 'field' | 'file';
  fieldname: string;
  value?: unknown;
  filename?: string;
  file: NodeJS.ReadableStream;
}
