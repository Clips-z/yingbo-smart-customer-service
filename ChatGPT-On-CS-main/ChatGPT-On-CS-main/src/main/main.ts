/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import 'source-map-support/register';
import './system/logger';
import path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import setupIpcHandlers from './ipcHandlers';
import { setServerReadyState } from './ipcHandlers';
import setupCron from './cron';
import BackendServiceManager from './system/backend';

// ========== 启动性能优化 ==========
// 必须在 import { app } 之后执行，避免 ts-node 转译下的 TDZ 错误
app?.commandLine?.appendSwitch('disable-gpu-vsync');
app?.commandLine?.appendSwitch('disable-background-timer-throttling');
app?.commandLine?.appendSwitch('disable-renderer-backgrounding');
// 减少启动时的磁盘 I/O
app?.commandLine?.appendSwitch('disable-features', 'OutOfBlinkCors');
// 禁用拼写检查
app?.commandLine?.appendSwitch('disable-spell-checking');

// ⭐ 延迟导入 Server（含 sqlite3 数据库初始化），避免 gotTheLock=false 时
//    数据库已初始化 → 退出时 napi 原生模块崩溃
let Server: typeof import('./backend/backend').default | null = null;

let mainWindow: BrowserWindow | null = null;
let backendServiceManager: BackendServiceManager | null = null;

const stopBackendServiceManager = async () => {
  if (backendServiceManager) {
    await backendServiceManager.stop();
  }
};

// 修复 GPU process isn't usable. Goodbye. 错误
// https://learn.microsoft.com/en-us/answers/questions/1193062/how-to-fix-electron-program-gpu-process-isnt-usabl
// 使用可选链防止 webpack UMD 包装器加载时 app 未完全初始化
app?.commandLine?.appendSwitch('no-sandbox');
app?.commandLine?.appendSwitch('lang', 'zh-CN');
app?.setName?.('迎波智能客服');
app?.setAppUserModelId?.('com.yinbo.smartcustomer');

// 支持通过环境变量重定向 userData 目录（用于沙箱/CI 环境）
if (process.env.ELECTRON_USER_DATA_DIR) {
  const userDataPath = path.resolve(process.env.ELECTRON_USER_DATA_DIR);
  app?.setPath?.('userData', userDataPath);
}

app.on('window-all-closed', async () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  await stopBackendServiceManager();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await stopBackendServiceManager();
});

const originalUncaughtException = process.listeners('uncaughtException').pop();
process.removeAllListeners('uncaughtException');
process.on('uncaughtException', async (error, origin) => {
  console.error('An error occurred in the main process:', error);
  console.error(error.stack);
  await stopBackendServiceManager();
  originalUncaughtException?.(error, origin);
});

const gotTheLock = app.requestSingleInstanceLock();

// ⭐ 开发/调试模式下如果单实例锁失败，不立即退出（沙箱环境可能误判）
//    生产打包环境仍然强制单实例
const FORCE_CONTINUE = !app.isPackaged && process.env.ALLOW_MULTI_INSTANCE === '1';

if (!gotTheLock) {
  if (FORCE_CONTINUE) {
    console.log('Single instance lock failed but FORCE_CONTINUE is set, continuing anyway...');
  } else {
    console.log('Single instance lock not acquired, quitting.');
  }
}

if (gotTheLock || FORCE_CONTINUE) {
  app.on('second-instance', () => {
    // 有人试图运行第二个实例，我们应该聚焦我们的窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')({ showDevTools: false });
}

// 安装开发者工具，如果网络不好，可以注释掉
// const installExtensions = async () => {
//   const installer = require('electron-devtools-installer');
//   const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
//   const extensions = ['REACT_DEVELOPER_TOOLS'];

//   return installer
//     .default(
//       extensions.map((name) => installer[name]),
//       forceDownload,
//     )
//     .catch(console.log);
// };

const createWindow = async () => {
  if (isDebug) {
    // await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  backendServiceManager = new BackendServiceManager(
    path.join(
      RESOURCES_PATH,
      process.env.BKEXE_PATH || './backend/__main__.exe',
    ),
  );

  await backendServiceManager.start();
  console.log('Backend service started on port:', backendServiceManager.getPort());

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 528,
    height: 1024,
    resizable: true,
    minWidth: 440,
    minHeight: 680,
    maximizable: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: (app.isPackaged || process.env.NODE_ENV === 'production')
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  setupIpcHandlers(mainWindow, backendServiceManager);
  setupCron(mainWindow, backendServiceManager);

  // ⭐ 动态导入 Server，此时才初始化数据库
  if (!Server) {
    Server = (await import('./backend/backend')).default;
  }
  const server = new Server(backendServiceManager.getPort(), mainWindow);
  // 启动服务器
  server
    .start()
    .then(() => {
      console.log('Server started successfully');
      setServerReadyState(true);
      // ⭐ Server 就绪后立即通知前端（不等 cron 触发），解决启动加载卡住问题
      mainWindow?.webContents?.send('check-health', true);
    })
    .catch((err) => {
      console.error('Error starting server:', err);
      setServerReadyState(false);
      // Server 启动失败也通知前端避免无限等待
      mainWindow?.webContents?.send('check-health', false);
    });

  console.log('Loading main window:', resolveHtmlPath('main.html'));
  mainWindow.loadURL(resolveHtmlPath('main.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 确保所有窗口关闭后退出应用
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  });

  mainWindow.on('close', async () => {
    // 停止后台服务
    await stopBackendServiceManager();
    // 关闭所有窗口
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== mainWindow) {
        win.close();
      }
    });
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });
};

app
  .whenReady()
  .then(() => {
    if (!gotTheLock && !FORCE_CONTINUE) {
      app.quit();
      return;
    }
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
