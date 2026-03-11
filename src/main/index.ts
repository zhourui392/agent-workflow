/**
 * Electron主进程入口
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import { getDatabase, closeDatabase } from './store/database';
import { registerAllHandlers } from './ipc';
import { syncAllWorkflows, stopAll as stopAllCronJobs } from './scheduler/cronManager';

let mainWindow: BrowserWindow | null = null;

/**
 * 配置日志
 */
function setupLogging(): void {
  log.transports.file.level = 'info';
  log.transports.console.level = 'debug';
  log.info(`Application starting, version: ${app.getVersion()}`);
}

/**
 * 创建主窗口
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    titleBarStyle: 'hiddenInset'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 应用初始化
 */
async function initialize(): Promise<void> {
  setupLogging();

  getDatabase();
  log.info('Database initialized');

  registerAllHandlers();
  log.info('IPC handlers registered');

  syncAllWorkflows();
  log.info('Cron jobs synced');
}

/**
 * 应用清理
 */
function cleanup(): void {
  log.info('Application shutting down...');
  stopAllCronJobs();
  closeDatabase();
}

app.whenReady().then(async () => {
  await initialize();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanup();
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
