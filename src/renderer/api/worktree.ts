import axios from 'axios';

export interface RepoStatus {
  name: string;
  created?: boolean;
  existed?: boolean;
  actualBranch?: string;
  updated?: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface SwitchResult {
  worktreePath: string;
  branch: string;
  repos: RepoStatus[];
}

export interface UpdateResult {
  branch: string;
  repos: RepoStatus[];
}

const http = axios.create({ timeout: 180_000 });

export function switchBranch(workspacePath: string, branch: string): Promise<{ data: SwitchResult }> {
  return http.post<SwitchResult>('/api/worktree/switch', { workspacePath, branch });
}

export function updateBranch(workspacePath: string, branch: string): Promise<{ data: UpdateResult }> {
  return http.post<UpdateResult>('/api/worktree/update', { workspacePath, branch });
}

export function removeBranch(workspacePath: string, branch: string): Promise<{ data: { success: boolean } }> {
  return http.delete<{ success: boolean }>('/api/worktree/remove', { params: { workspacePath, branch } });
}
