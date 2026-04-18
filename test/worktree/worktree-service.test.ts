import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { WorktreeService } from '../../src/main/worktree/WorktreeService';

function run(cwd: string, args: string[]): Promise<number> {
  return new Promise(resolve => {
    const child = spawn('git', args, { cwd });
    child.on('close', code => resolve(code ?? -1));
    child.on('error', () => resolve(-1));
  });
}

async function initRepoWithBranches(repoDir: string, branches: string[]): Promise<void> {
  fs.mkdirSync(repoDir, { recursive: true });
  // Create as bare-style remote by initializing normally, committing, then renaming
  await run(repoDir, ['init', '-q', '-b', 'main']);
  await run(repoDir, ['config', 'user.email', 't@t.com']);
  await run(repoDir, ['config', 'user.name', 't']);
  await run(repoDir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'x');
  await run(repoDir, ['add', '.']);
  await run(repoDir, ['commit', '-q', '-m', 'init']);
  for (const b of branches) {
    await run(repoDir, ['branch', b]);
  }
}

async function createLocalAndRemote(workRoot: string, repoName: string, remoteBranches: string[]): Promise<void> {
  const remoteDir = path.join(workRoot, '.remotes', repoName);
  fs.mkdirSync(remoteDir, { recursive: true });
  // remote is a bare repo seeded from a temp repo
  const seedDir = path.join(workRoot, '.seeds', repoName);
  await initRepoWithBranches(seedDir, remoteBranches);
  await run(remoteDir, ['init', '--bare', '-q', '-b', 'main']);
  await run(seedDir, ['remote', 'add', 'origin', remoteDir]);
  await run(seedDir, ['push', '-q', 'origin', 'main']);
  for (const b of remoteBranches) {
    await run(seedDir, ['push', '-q', 'origin', b]);
  }

  // local clone lives under workRoot/<repoName>
  const localDir = path.join(workRoot, repoName);
  await run(workRoot, ['clone', '-q', remoteDir, repoName]);
  await run(localDir, ['config', 'user.email', 't@t.com']);
  await run(localDir, ['config', 'user.name', 't']);
  await run(localDir, ['config', 'commit.gpgsign', 'false']);
}

describe('WorktreeService.switchBranch', () => {
  let workRoot: string;
  const service = new WorktreeService();

  beforeEach(() => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(workRoot, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('reports existed=true with real branch when worktree already present', async () => {
    // Two repos; only repo-a has feature branch on remote
    await createLocalAndRemote(workRoot, 'repo-a', ['feature-x']);
    await createLocalAndRemote(workRoot, 'repo-b', []);

    // First switch creates worktrees
    const first = await service.switchBranch(workRoot, 'feature-x');
    const firstA = first.repos.find(r => r.name === 'repo-a')!;
    const firstB = first.repos.find(r => r.name === 'repo-b')!;
    expect(firstA.created).toBe(true);
    expect(firstA.actualBranch).toBe('feature-x');
    expect(firstB.created).toBe(true);
    expect(firstB.actualBranch).toBe('main'); // fallback label; worktree is detached at origin/main

    // Second switch: worktrees already exist → should report actual branch, not lie
    const second = await service.switchBranch(workRoot, 'feature-x');
    const secondA = second.repos.find(r => r.name === 'repo-a')!;
    const secondB = second.repos.find(r => r.name === 'repo-b')!;

    expect(secondA.existed).toBe(true);
    expect(secondA.created).toBe(false);
    expect(secondA.actualBranch).toBe('feature-x');

    expect(secondB.existed).toBe(true);
    expect(secondB.created).toBe(false);
    // repo-b 的 worktree 是 detached HEAD（指向 origin/main），actualBranch 为空表示未在任何分支
    expect(secondB.actualBranch).toBe('');
  }, 60_000);

  it('recreates worktree after directory is removed (stale registration)', async () => {
    await createLocalAndRemote(workRoot, 'repo-a', ['feature-x']);

    const first = await service.switchBranch(workRoot, 'feature-x');
    expect(first.repos[0].created).toBe(true);

    // 模拟用户/其他工具删了 worktree 目录，但 .git/worktrees 里仍有登记
    const worktreePath = path.join(workRoot, '.worktrees', 'feature-x', 'repo-a');
    fs.rmSync(worktreePath, { recursive: true, force: true });

    // 不应因 "missing but already registered" 而失败
    const second = await service.switchBranch(workRoot, 'feature-x');
    const repoA = second.repos.find(r => r.name === 'repo-a')!;
    expect(repoA.created).toBe(true);
    expect(repoA.actualBranch).toBe('feature-x');
  }, 60_000);
});
