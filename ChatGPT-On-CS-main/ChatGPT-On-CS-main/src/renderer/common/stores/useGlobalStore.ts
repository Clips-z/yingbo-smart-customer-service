import { create } from 'zustand';
import { Plugin, LogObj } from '../services/platform/platform';

export type { LogObj, Plugin };

/**
 * 全局共享 Store — 主窗口、设置窗口、数据窗口共用。
 * 原先在 settings-window/stores/ 下，主窗口组件跨窗口导入，
 * 现已迁移到 common/stores/ 消除跨窗口耦合。
 */
interface GlobalStore {
  logs: LogObj[];
  addLog: (log: LogObj) => void;
  clearLogs: () => void;
  activePlatformId: string | null;
  setActivePlatformId: (platformId: string | null) => void;
  activePlatformIds: string[];
  setActivePlatformIds: (platformIds: string[]) => void;
  currentPlugin: Plugin | null;
  setCurrentPlugin: (plugin: Plugin | null) => void;
}

const useGlobalStore = create<GlobalStore>((set) => ({
  logs: [],
  activePlatformId: null,
  activePlatformIds: [],
  currentPlugin: null,
  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs, log].slice(-50),
    })),
  clearLogs: () =>
    set(() => ({
      logs: [],
    })),
  setActivePlatformId: (activePlatformId) => set({ activePlatformId }),
  setActivePlatformIds: (activePlatformIds) => set({ activePlatformIds }),
  setCurrentPlugin: (plugin) =>
    set(() => ({
      currentPlugin: plugin,
    })),
}));

export default useGlobalStore;
