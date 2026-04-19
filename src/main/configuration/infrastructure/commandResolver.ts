/**
 * 跨平台命令解析器
 *
 * Windows 的 child_process.spawn 不走 shell 时：
 *   1. 不会自动匹配 PATHEXT 中的 .cmd/.bat shim（npx/npm 等会 ENOENT）
 *   2. 从 Node 20+ 起对 .cmd/.bat 文件直接抛 EINVAL（CVE-2024-27980 修复）
 * 因此 Windows 下必须：将裸命令补 .cmd 后缀，并对 .cmd/.bat 启用 shell: true
 * 同时对 command 与每个 arg 做 cmd 元字符转义，避免注入。
 */

const WIN_EXECUTABLE_EXTENSIONS = ['.cmd', '.bat', '.exe', '.com', '.ps1'];
const WIN_SHELL_REQUIRED_EXTENSIONS = ['.cmd', '.bat'];
const REQUIRES_QUOTING_PATTERN = /[\s"&|<>^%()!]/;

export interface StdioSpawnPreparation {
  command: string;
  args: string[];
  shell: boolean;
}

export function resolveSpawnCommand(command: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return command;
  if (hasPathSeparator(command)) return command;
  if (hasExecutableExtension(command)) return command;
  return `${command}.cmd`;
}

export function prepareStdioSpawn(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): StdioSpawnPreparation {
  if (platform !== 'win32') {
    return { command, args, shell: false };
  }
  const resolved = resolveSpawnCommand(command, platform);
  if (!needsWindowsShell(resolved)) {
    return { command: resolved, args, shell: false };
  }
  return {
    command: quoteForWindowsShell(resolved),
    args: args.map(quoteForWindowsShell),
    shell: true
  };
}

function hasPathSeparator(command: string): boolean {
  return command.includes('/') || command.includes('\\');
}

function hasExecutableExtension(command: string): boolean {
  const lower = command.toLowerCase();
  return WIN_EXECUTABLE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function needsWindowsShell(command: string): boolean {
  const lower = command.toLowerCase();
  return WIN_SHELL_REQUIRED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Windows cmd.exe 参数引用
 *
 * 仅当 value 含空格或 shell 元字符时才加引号：cmd 的 /c 模式会把整个命令行
 * 的引号透传给子进程（如 npx.cmd → npm），所以给本来安全的 -y 加引号会
 * 被 npm 识别为字符串 ""-y""。简单 token 保持原样；复杂 token 包围双引号，
 * 内部 " 前加 \，% 双写为 %% 防止 cmd 变量展开。
 */
function quoteForWindowsShell(value: string): string {
  if (value === '') return '""';
  if (!REQUIRES_QUOTING_PATTERN.test(value)) return value;
  const escaped = value.replace(/"/g, '\\"').replace(/%/g, '%%');
  return `"${escaped}"`;
}
