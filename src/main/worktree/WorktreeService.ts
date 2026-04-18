/**
 * Git Worktree 服务
 *
 * 移植自 agent-web 的 WorktreeService.java。对 workspace 下所有 .git 仓库（递归深度 6）
 * 并行 fetch/worktree add/pull。
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import log from '../shared/infrastructure/logger';

const MAX_DEPTH = 6;
const CONCURRENCY = 8;
const GIT_TIMEOUT_MS = 30_000;

export interface RepoStatus {
  name: string;
  created?: boolean;
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

function safeBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function collectGitRepos(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    // 排除 .worktrees 子目录，防止递归进入已创建的 worktree
    if (path.basename(dir) === '.worktrees') return;
    const hasGit = entries.some(e => e.name === '.git');
    if (hasGit) { results.push(dir); return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.')) continue;
      if (e.name === 'node_modules' || e.name === 'target' || e.name === 'dist' || e.name === 'build') continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return results;
}

interface GitResult { code: number; stdout: string; stderr: string }

function runGit(cwd: string, args: string[], timeoutMs: number = GIT_TIMEOUT_MS): Promise<GitResult> {
  return new Promise(resolve => {
    let stdout = '', stderr = '';
    let finished = false;
    const child = spawn('git', args, { cwd, env: process.env });
    const timer = setTimeout(() => {
      if (finished) return;
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      finished = true;
      resolve({ code: -1, stdout, stderr: stderr + '\n[timeout]' });
    }, timeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on('error', err => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(err) });
    });
  });
}

async function parallel<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const cur = idx++;
      if (cur >= items.length) return;
      out[cur] = await fn(items[cur]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function getDefaultBranch(repoDir: string): Promise<string | null> {
  const r = await runGit(repoDir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (r.code === 0) {
    const ref = r.stdout.trim();
    const prefix = 'origin/';
    return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
  }
  const r2 = await runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (r2.code === 0) return r2.stdout.trim();
  return null;
}

async function remoteBranchExists(repoDir: string, branch: string): Promise<boolean> {
  const r = await runGit(repoDir, ['rev-parse', '--verify', '--quiet', `origin/${branch}`]);
  return r.code === 0;
}

export class WorktreeService {
  async switchBranch(workspacePath: string, branch: string): Promise<SwitchResult> {
    const abs = path.resolve(workspacePath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`workspacePath not found: ${workspacePath}`);
    }
    const safe = safeBranch(branch);
    const worktreeRoot = path.join(abs, '.worktrees', safe);
    fs.mkdirSync(worktreeRoot, { recursive: true });

    const repos = collectGitRepos(abs);
    log.info(`[worktree] switch branch=${branch} repos=${repos.length} workspace=${abs}`);

    // 1. 并行 fetch
    await parallel(repos, CONCURRENCY, async repo => {
      await runGit(repo, ['fetch', '--all', '--prune']);
    });

    // 2. 并行创建 worktree
    const statuses = await parallel(repos, CONCURRENCY, async repo => {
      const rel = path.relative(abs, repo) || path.basename(repo);
      const target = path.join(worktreeRoot, rel);
      return this.createWorktreeForRepo(repo, target, branch, rel);
    });

    return { worktreePath: worktreeRoot, branch, repos: statuses };
  }

  private async createWorktreeForRepo(repoDir: string, target: string, branch: string, name: string): Promise<RepoStatus> {
    // 已存在则按 created=false 返回
    if (fs.existsSync(target)) {
      return { name, created: false, actualBranch: branch, reason: '已存在，跳过' };
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });

    // 1. 远端有该分支：基于 origin/<branch> 创建 worktree（无 -B/-b，避免覆盖本地已有同名分支；
    //    若本地无同名分支，git 会自动建立跟踪分支，pull --ff-only 可用）
    if (await remoteBranchExists(repoDir, branch)) {
      const r = await runGit(repoDir, ['worktree', 'add', target, `origin/${branch}`]);
      if (r.code === 0) return { name, created: true, actualBranch: branch };
      return { name, created: false, actualBranch: branch, reason: r.stderr.trim().slice(0, 200) };
    }

    // 2. 远端无该分支：维持在默认分支（通常 master/main），不新建任何分支
    const fallback = await getDefaultBranch(repoDir);
    if (!fallback) {
      return { name, created: false, actualBranch: '', reason: '无法确定默认分支' };
    }
    const r = await runGit(repoDir, ['worktree', 'add', target, `origin/${fallback}`]);
    if (r.code === 0) return { name, created: true, actualBranch: fallback };
    return { name, created: false, actualBranch: fallback, reason: r.stderr.trim().slice(0, 200) };
  }

  async updateBranch(workspacePath: string, branch: string): Promise<UpdateResult> {
    const abs = path.resolve(workspacePath);
    const safe = safeBranch(branch);
    const worktreeRoot = path.join(abs, '.worktrees', safe);
    if (!fs.existsSync(worktreeRoot)) {
      throw new Error(`worktree not found: ${worktreeRoot}`);
    }

    // 收集所有 worktree（有 .git 即可）
    const worktrees = collectGitRepos(worktreeRoot);
    log.info(`[worktree] update branch=${branch} worktrees=${worktrees.length}`);

    const statuses = await parallel(worktrees, CONCURRENCY, async wt => {
      const rel = path.relative(worktreeRoot, wt) || path.basename(wt);
      return this.pullOne(wt, rel);
    });
    return { branch, repos: statuses };
  }

  private async pullOne(worktree: string, name: string): Promise<RepoStatus> {
    const before = await runGit(worktree, ['rev-parse', 'HEAD']);
    const pull = await runGit(worktree, ['pull', '--ff-only']);
    if (pull.code !== 0) {
      return { name, updated: false, skipped: false, reason: pull.stderr.trim().slice(0, 200) };
    }
    const after = await runGit(worktree, ['rev-parse', 'HEAD']);
    if (before.stdout.trim() === after.stdout.trim()) {
      return { name, updated: false, skipped: true, reason: '已是最新' };
    }
    return { name, updated: true, reason: '已更新' };
  }

  async removeBranch(workspacePath: string, branch: string): Promise<void> {
    const abs = path.resolve(workspacePath);
    const safe = safeBranch(branch);
    const worktreeRoot = path.join(abs, '.worktrees', safe);
    if (!fs.existsSync(worktreeRoot)) return;

    // 先在每个原始 repo 里 prune 掉 worktree 引用
    const repos = collectGitRepos(abs);
    await parallel(repos, CONCURRENCY, async repo => {
      await runGit(repo, ['worktree', 'prune']);
    });

    // 再删目录
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
  }
}
