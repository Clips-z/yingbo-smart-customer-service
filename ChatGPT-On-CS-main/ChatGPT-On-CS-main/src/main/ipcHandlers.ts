import {
  ipcMain,
  dialog,
  shell,
  BrowserWindow,
  app,
  Notification,
  Rectangle,
  screen,
} from 'electron';
import Store from 'electron-store';
import os from 'os';
import path from 'path';
import type BackendServiceManager from './system/backend';
import { getBrowserVersionFromOS } from './system/chrome';
import { createWindow as createSettingsWindow } from './windows/settings-main';
import { createWindow as createDataviewWindow } from './windows/dataview-main';
import { setupCompanionIpc } from './windows/companion-main';
import { WindowDockingService } from './services/windowDockingService';

const store = new Store();
const MAIN_WINDOW_BOUNDS_KEY = 'main-window-normal-bounds';
const MAIN_WINDOW_DOCKED_WIDTH_KEY = 'main-window-docked-width';

type MainWindowMode = 'full' | 'docked' | 'floating';

function isUsableBounds(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Partial<Rectangle>;
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(
    (item) => typeof item === 'number' && Number.isFinite(item),
  );
}

// ⭐ 跟踪服务就绪状态，用于同步响应 renderer 的健康状态查询
let _serverReadyState: boolean | null = null;

export const setServerReadyState = (ready: boolean) => {
  _serverReadyState = ready;
};

export const getServerReadyState = () => _serverReadyState;

const setupIpcHandlers = (
  mainWindow: BrowserWindow,
  bsm: BackendServiceManager,
) => {
  setupCompanionIpc();
  // Every new application session starts as the left reception workbench.
  // Full-screen and floating are deliberate, session-level operator choices.
  let mainWindowMode: MainWindowMode = 'docked';
  const mainDockingService = new WindowDockingService(
    mainWindow,
    {
      attached: true,
      side: 'left',
      sideByPlatform: {
        win_qianniu: 'left',
        win_jinmai: 'left',
        win_wechat: 'left',
        win_wecom: 'left',
      },
      collapsed: false,
      targetFound: false,
      targetMode: 'follow',
    },
    undefined,
    180,
    () => {
      if (mainWindowMode === 'docked') publishMainWindowState();
    },
    Math.max(
      300,
      Math.min(720, Number(store.get(MAIN_WINDOW_DOCKED_WIDTH_KEY)) || 320),
    ),
    300,
  );

  const publishMainWindowState = () => {
    const dockingState = mainDockingService.getState();
    mainWindow.webContents.send('main-window-state', {
      mode: mainWindowMode,
      targetFound: dockingState.targetFound,
      activePlatformId: dockingState.activePlatformId,
    });
  };

  const dockMainWindow = () => {
    if (mainWindowMode !== 'docked') {
      const current = mainWindow.getBounds();
      if (current.width >= 760) store.set(MAIN_WINDOW_BOUNDS_KEY, current);
    }
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const { workArea } = display;
    mainWindowMode = 'docked';
    mainWindow.unmaximize();
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(300, 520);
    const dockedWidth = Math.max(
      300,
      Math.min(
        720,
        workArea.width,
        Number(store.get(MAIN_WINDOW_DOCKED_WIDTH_KEY)) || 320,
      ),
    );
    mainDockingService.setExpandedWidth(dockedWidth);
    mainWindow.setBounds(
      {
        x: workArea.x,
        y: workArea.y,
        width: dockedWidth,
        height: workArea.height,
      },
      true,
    );
    mainDockingService.setSide('left');
    mainDockingService.setTargetMode('follow');
    mainDockingService.setAttached(true);
    mainWindow.show();
    mainWindow.focus();
    publishMainWindowState();
  };

  const floatMainWindow = () => {
    mainWindowMode = 'floating';
    mainDockingService.setAttached(false);
    mainWindow.unmaximize();
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(300, 520);
    const [width, height] = mainWindow.getSize();
    if (width > 480) {
      mainWindow.setSize(320, Math.max(620, Math.min(height, 820)), true);
    }
    mainWindow.show();
    mainWindow.focus();
    publishMainWindowState();
  };

  const restoreMainWindow = () => {
    const savedBounds = store.get(MAIN_WINDOW_BOUNDS_KEY);
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const fallback = {
      x: Math.round(
        display.workArea.x + Math.max(0, (display.workArea.width - 1180) / 2),
      ),
      y: Math.round(
        display.workArea.y + Math.max(0, (display.workArea.height - 820) / 2),
      ),
      width: Math.min(1180, display.workArea.width),
      height: Math.min(820, display.workArea.height),
    };
    mainWindowMode = 'full';
    mainDockingService.setAttached(false);
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(760, 680);
    mainWindow.setBounds(
      isUsableBounds(savedBounds) ? savedBounds : fallback,
      true,
    );
    mainWindow.show();
    mainWindow.focus();
    publishMainWindowState();
  };

  ipcMain.on('main-window-command', (_event, value) => {
    const action = (value as { action?: unknown } | undefined)?.action;
    if (action === 'dock-left') dockMainWindow();
    if (action === 'float') floatMainWindow();
    if (action === 'restore') restoreMainWindow();
  });
  ipcMain.on('get-main-window-state', (event) => {
    event.returnValue = { mode: mainWindowMode };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    dockMainWindow();
    mainDockingService.start();
  });
  mainWindow.on('resize', () => {
    if (mainWindowMode !== 'docked') return;
    const { width } = mainWindow.getBounds();
    if (width < 300) return;
    mainDockingService.setExpandedWidth(width);
    store.set(MAIN_WINDOW_DOCKED_WIDTH_KEY, width);
  });
  mainWindow.once('closed', () => mainDockingService.stop());

  ipcMain.on('get-env', async (event, key) => {
    event.returnValue = process.env[key];
  });

  ipcMain.on('get-port', async (event) => {
    event.returnValue = bsm.getPort();
  });

  ipcMain.on('ipc-example', async (event) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    event.reply('ipc-example', msgTemplate('pong'));
  });

  ipcMain.on('select-directory', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    event.reply('selected-directory', result.filePaths);
  });

  ipcMain.on('select-file', async (event, args) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters:
        args && args.filters
          ? args.filters
          : [{ name: 'All Files', extensions: ['*'] }],
    });
    event.reply('selected-file', result.filePaths);
  });

  ipcMain.on('open-directory', async (event, args) => {
    shell.openPath(args);
  });

  ipcMain.on('open-logger-folder', async () => {
    const logDir = path.join(os.tmpdir(), 'chatgpt-on-cs');

    shell.openPath(logDir);
  });

  ipcMain.on('electron-store-get', async (event, val) => {
    event.returnValue = store.get(val);
  });

  ipcMain.on('electron-store-set', async (event, key, val) => {
    store.set(key, val);
  });

  ipcMain.on('electron-store-remove', async (event, key) => {
    store.delete(key);
  });

  ipcMain.on('get-version', async (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on('open-url', async (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.on('open-user-manual', async () => {
    const manualPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', '迎波智能客服使用手册.html')
      : path.join(__dirname, '../../assets/迎波智能客服使用手册.html');
    await shell.openPath(manualPath);
  });

  ipcMain.on('get-browser-version', async (event) => {
    const version = await getBrowserVersionFromOS();
    event.returnValue = version;
  });

  // ⭐ 同步查询服务健康状态（用于 renderer 挂载后立即检查，防止错过 check-health 事件）
  ipcMain.on('get-health-status', async (event) => {
    event.returnValue = _serverReadyState ?? false;
  });

  ipcMain.on('notification', async (event, title, message) => {
    const notification = {
      title,
      body: message,
    };
    new Notification(notification).show();
  });

  ipcMain.on(
    'open-settings-window',
    async (event, { appId, instanceId, tab } = {}) => {
      const args = [];

      if (appId) {
        args.push(`settings-app-id-${appId}`);
      }

      if (instanceId) {
        args.push(`settings-instance-id-${instanceId}`);
      }

      if (['general', 'ai', 'plugin', 'about'].includes(tab)) {
        args.push(`settings-tab-${tab}`);
      }

      createSettingsWindow(args);
    },
  );

  ipcMain.on('open-dataview-window', async (event, args) => {
    createDataviewWindow(args);
  });
};

export default setupIpcHandlers;
