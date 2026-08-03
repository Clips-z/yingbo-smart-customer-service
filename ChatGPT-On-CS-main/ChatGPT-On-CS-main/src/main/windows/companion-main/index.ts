import { app, BrowserWindow, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import path from 'path';
import { resolveHtmlPath } from '../../util';
import {
  CompanionDockState,
  CompanionTargetMode,
  DockSide,
  normalizeCompanionDockState,
  WindowDockingService,
} from '../../services/windowDockingService';

type CompanionCommand =
  | { action: 'show' | 'hide' }
  | { action: 'attach'; side?: DockSide }
  | { action: 'detach' }
  | { action: 'side'; side: DockSide }
  | { action: 'collapse'; collapsed: boolean }
  | { action: 'target-mode'; targetMode: CompanionTargetMode };

const store = new Store();
const STATE_KEY = 'unified-companion-state';
const LEGACY_STATE_KEY = 'qianniu-companion-state';
const BOUNDS_KEY = 'qianniu-companion-bounds';

let companionWindow: BrowserWindow | null = null;
let dockingService: WindowDockingService | null = null;
let ipcRegistered = false;

function savedState(): CompanionDockState {
  const value = store.get(STATE_KEY) ?? store.get(LEGACY_STATE_KEY);
  const state = normalizeCompanionDockState(
    value && typeof value === 'object'
      ? (value as Partial<CompanionDockState>)
      : {},
  );
  if (!store.has(STATE_KEY)) store.set(STATE_KEY, state);
  return state;
}

function saveState(): void {
  if (dockingService) store.set(STATE_KEY, dockingService.getState());
}

export function getCompanionState(): CompanionDockState | undefined {
  return dockingService?.getState();
}

export function createCompanionWindow(): BrowserWindow {
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.showInactive();
    return companionWindow;
  }

  const state = savedState();
  const storedBounds = store.get(BOUNDS_KEY) as
    | { x?: number; y?: number; width?: number; height?: number }
    | undefined;
  companionWindow = new BrowserWindow({
    show: false,
    x: storedBounds?.x,
    y: storedBounds?.y,
    width: state.collapsed ? 56 : storedBounds?.width || 372,
    height: storedBounds?.height || 860,
    minWidth: 56,
    minHeight: 520,
    maxWidth: 520,
    frame: false,
    resizable: true,
    maximizable: false,
    minimizable: false,
    skipTaskbar: false,
    title: '迎波伴随助手',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'icon.png')
      : path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload:
        app.isPackaged || process.env.NODE_ENV === 'production'
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../../../.erb/dll/preload.js'),
    },
  });

  companionWindow.loadURL(resolveHtmlPath('companion.html'));
  dockingService = new WindowDockingService(
    companionWindow,
    state,
    undefined,
    undefined,
    (nextState) => {
      store.set(STATE_KEY, nextState);
      companionWindow?.webContents.send('companion-state', nextState);
    },
  );
  dockingService.start();

  companionWindow.once('ready-to-show', () => {
    companionWindow?.showInactive();
  });
  companionWindow.on('move', () => {
    if (!dockingService?.getState().attached && companionWindow) {
      store.set(BOUNDS_KEY, companionWindow.getBounds());
    }
  });
  companionWindow.on('resize', () => {
    if (!dockingService?.getState().attached && companionWindow) {
      store.set(BOUNDS_KEY, companionWindow.getBounds());
    }
  });
  companionWindow.on('closed', () => {
    dockingService?.stop();
    dockingService = null;
    companionWindow = null;
  });
  companionWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  return companionWindow;
}

export function handleCompanionCommand(command: CompanionCommand): void {
  if (!command || typeof command !== 'object') return;
  const window = createCompanionWindow();
  if (command.action === 'show') window.showInactive();
  if (command.action === 'hide') window.hide();
  if (command.action === 'detach') dockingService?.setAttached(false);
  if (command.action === 'attach') {
    if (command.side === 'left' || command.side === 'right') {
      dockingService?.setSide(command.side);
    }
    dockingService?.setAttached(true);
  }
  if (
    command.action === 'side' &&
    (command.side === 'left' || command.side === 'right')
  ) {
    dockingService?.setSide(command.side);
  }
  if (command.action === 'collapse' && typeof command.collapsed === 'boolean') {
    dockingService?.setCollapsed(command.collapsed);
  }
  if (command.action === 'target-mode') {
    if (
      ['follow', 'win_qianniu', 'win_jinmai', 'win_wechat', 'win_wecom'].includes(
        command.targetMode,
      )
    ) {
      dockingService?.setTargetMode(command.targetMode);
    }
  }
  saveState();
  window.webContents.send('companion-state', dockingService?.getState());
}

export function setupCompanionIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.on('open-companion-window', () => createCompanionWindow());
  ipcMain.on('open-external', (_event, value) => {
    const url = String(value || '');
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.on('companion-command', (_event, command: CompanionCommand) => {
    handleCompanionCommand(command);
  });
  ipcMain.on('get-companion-state', (event) => {
    event.returnValue = dockingService?.getState() || savedState();
  });
}
