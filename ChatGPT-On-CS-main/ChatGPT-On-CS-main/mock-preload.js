// Mock preload：在无主进程环境下让 renderer 能渲染完整 UI
const { contextBridge, ipcRenderer } = require('electron');

// 内部监听器注册表（用于正确处理 on/remove/removeListener）
const listeners = {};

contextBridge.exposeInMainWorld('electron', {
  getPort: () => 33847,
  ipcRenderer: {
    // 同步获取值 —— 关键！让 App 的健康检查通过
    get: (channel) => {
      if (channel === 'get-version') return '1.4.5';
      if (channel === 'get-browser-version') return '26.6.10';
      if (channel === 'get-health-status') return true; // ⭐ 让 UI 立即显示
      return null;
    },

    sendMessage: (...args) => {
      try { ipcRenderer.send(...args); } catch (e) {}
    },

    on: (channel, func) => {
      if (!listeners[channel]) listeners[channel] = new Set();
      listeners[channel].add(func);
      const wrapper = (...a) => func(...a);
      wrapper._original = func; // 保留原始引用以便 removeListener 匹配
      ipcRenderer.on(channel, wrapper);
      return wrapper;
    },

    once: (channel, func) => {
      try { ipcRenderer.once(channel, (event, ...args) => func(...args)); } catch (e) {}
    },

    // remove(channel) — 只移除该 channel 所有监听器（BroadcastProvider 用法）
    remove: (channel, func) => {
      if (func) {
        try { ipcRenderer.removeListener(channel, func); } catch (e) {}
      } else {
        // 只传 channel 时移除全部
        if (listeners[channel]) {
          for (const fn of listeners[channel]) {
            try { ipcRenderer.removeListener(channel, fn); } catch (e) {}
          }
          listeners[channel].clear();
        }
      }
    },

    // removeListener(channel, func) — 移除指定监听器（App.tsx cleanup 用法）
    removeListener: (channel, func) => {
      if (!func) return; // 防止传 undefined 时报错
      try { ipcRenderer.removeListener(channel, func); } catch (e) {}
    },
  },
});
