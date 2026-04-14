/**
 * 轻量日志适配器（替代 electron-log）
 *
 * 保持与 electron-log 默认导出同形状的接口（debug/info/warn/error/verbose/silly），
 * 迁移到 Web 服务后直接写 stdout/stderr。调用方只需替换 import 路径。
 */

type LogFn = (...args: unknown[]) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  verbose: LogFn;
  silly: LogFn;
}

function ts(): string {
  return new Date().toISOString();
}

function format(level: string, args: unknown[]): string {
  const parts = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  });
  return `[${ts()}] [${level}] ${parts.join(' ')}`;
}

const log: Logger = {
  debug: (...args) => { if (process.env.LOG_LEVEL === 'debug') console.debug(format('debug', args)); },
  info: (...args) => console.log(format('info', args)),
  warn: (...args) => console.warn(format('warn', args)),
  error: (...args) => console.error(format('error', args)),
  verbose: (...args) => { if (process.env.LOG_LEVEL === 'debug') console.log(format('verbose', args)); },
  silly: () => { /* noop */ }
};

export default log;
export { log };
