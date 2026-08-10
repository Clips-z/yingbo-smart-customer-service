// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'get-env'
  | 'get-port'
  | 'get-health-status'
  | 'check-health'
  | 'electron-store-get'
  | 'electron-store-set'
  | 'electron-store-remove'
  | 'refresh-config'
  | 'open-directory'
  | 'open-logger-folder'
  | 'select-file'
  | 'selected-file'
  | 'select-directory'
  | 'selected-directory'
  | 'open-url'
  | 'open-user-manual'
  | 'open-external'
  | 'notification'
  | 'get-browser-version'
  | 'broadcast'
  | 'open-settings-window'
  | 'open-dataview-window'
  | 'update-settings-params'
  | 'get-version'
  | 'open-companion-window'
  | 'companion-command'
  | 'companion-state'
  | 'get-companion-state'
  | 'main-window-command'
  | 'main-window-state'
  | 'get-main-window-state';

// 运行时白名单 — 防止渲染进程注入未知通道
const validChannels = new Set<Channels>([
  'ipc-example',
  'get-env',
  'get-port',
  'get-health-status',
  'check-health',
  'electron-store-get',
  'electron-store-set',
  'electron-store-remove',
  'refresh-config',
  'open-directory',
  'open-logger-folder',
  'select-file',
  'selected-file',
  'select-directory',
  'selected-directory',
  'open-url',
  'open-user-manual',
  'open-external',
  'notification',
  'get-browser-version',
  'broadcast',
  'open-settings-window',
  'open-dataview-window',
  'update-settings-params',
  'get-version',
  'open-companion-window',
  'companion-command',
  'companion-state',
  'get-companion-state',
  'main-window-command',
  'main-window-state',
  'get-main-window-state',
]);

// 通道参数校验规则
const channelArgRules: Partial<Record<Channels, (args: unknown[]) => boolean>> = {
  'electron-store-get': (args) => args.length === 1 && typeof args[0] === 'string',
  'electron-store-set': (args) =>
    args.length === 2 && typeof args[0] === 'string' && args[1] !== undefined,
  'electron-store-remove': (args) => args.length === 1 && typeof args[0] === 'string',
  'get-env': (args) => args.length === 1 && typeof args[0] === 'string',
  'open-url': (args) => args.length === 1 && typeof args[0] === 'string',
  'notification': (args) => args.length >= 1 && typeof args[0] === 'string',
  'companion-command': (args) =>
    args.length === 1 && typeof args[0] === 'object' && args[0] !== null,
  'main-window-command': (args) =>
    args.length === 1 && typeof args[0] === 'object' && args[0] !== null,
};

function validateChannel(channel: string): asserts channel is Channels {
  if (!validChannels.has(channel as Channels)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
}

function validateArgs(channel: Channels, args: unknown[]): boolean {
  const rule = channelArgRules[channel];
  if (rule && !rule(args)) {
    console.error(`[IPC] Invalid arguments for channel "${channel}"`);
    return false;
  }
  return true;
}

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      validateChannel(channel);
      if (!validateArgs(channel, args)) return;
      ipcRenderer.send(channel, ...args);
    },
    get(channel: Channels, ...args: unknown[]) {
      validateChannel(channel);
      if (!validateArgs(channel, args)) return undefined;
      return ipcRenderer.sendSync(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      validateChannel(channel);
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    // 这个once方法是特别的，因为它确保了事件处理函数只会被调用一次，然后自动移除。
    once(channel: Channels, func: (...args: unknown[]) => void) {
      validateChannel(channel);
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    remove(channel: Channels) {
      validateChannel(channel);
      ipcRenderer.removeAllListeners(channel);
    },
    removeListener(channel: Channels, func: (...args: unknown[]) => void) {
      validateChannel(channel);
      ipcRenderer.removeListener(channel, func);
    },
  },
  store: {
    get(key: string) {
      if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
        console.error('[IPC] Invalid store key');
        return undefined;
      }
      return ipcRenderer.sendSync('electron-store-get', key);
    },
    set(key: string, value: unknown) {
      if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
        console.error('[IPC] Invalid store key');
        return;
      }
      // 防止存储过大对象导致内存溢出
      try {
        const serialized = JSON.stringify(value);
        if (serialized && serialized.length > 5 * 1024 * 1024) {
          console.error('[IPC] Store value too large (>5MB), rejected');
          return;
        }
      } catch {
        console.error('[IPC] Store value is not serializable');
        return;
      }
      ipcRenderer.send('electron-store-set', key, value);
    },
    remove(key: string) {
      if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
        console.error('[IPC] Invalid store key');
        return;
      }
      ipcRenderer.send('electron-store-remove', key);
    },
  },
  getEnv: (key: string) => {
    if (typeof key !== 'string' || key.length === 0) {
      console.error('[IPC] Invalid env key');
      return undefined;
    }
    const v = ipcRenderer.sendSync('get-env', key);
    return v;
  },
  getPort: () => {
    const v = ipcRenderer.sendSync('get-port');
    return v;
  },
  getArgs: () => {
    // 过滤掉可能包含敏感路径的参数，只保留必要的运行时标识
    return process.argv.filter(
      (arg) =>
        !arg.includes(':\\') && // 过滤 Windows 路径
        !arg.includes('/') && // 过滤 Unix 路径
        arg.length < 100, // 过滤过长的参数
    );
  },
};

export type ElectronHandler = typeof electronHandler;

// 把功能暴露给渲染进程
contextBridge.exposeInMainWorld('electron', electronHandler);
