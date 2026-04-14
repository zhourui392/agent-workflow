/**
 * 文件系统 API 客户端
 */

import axios from 'axios';

export interface FileEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  lastModified: number;
}

const http = axios.create({ timeout: 60_000 });

export function listRoots(): Promise<{ data: { roots: string[] } }> {
  return http.get<{ roots: string[] }>('/api/fs/roots');
}

export function listPath(path: string): Promise<{ data: FileEntry[] }> {
  return http.get<FileEntry[]>('/api/fs/list', { params: { path } });
}

export function downloadUrl(path: string): string {
  return `/api/fs/download?path=${encodeURIComponent(path)}`;
}

export function uploadFile(targetDir: string, file: File): Promise<{ data: { success: boolean; path: string } }> {
  const form = new FormData();
  form.append('path', targetDir);
  form.append('file', file);
  return http.post<{ success: boolean; path: string }>('/api/fs/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

export function deleteFile(path: string): Promise<{ data: { success: boolean } }> {
  return http.delete<{ success: boolean }>('/api/fs/delete', { params: { path } });
}
