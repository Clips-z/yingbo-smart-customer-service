import { create } from 'zustand';

export type NotificationType = 'system' | 'platform' | 'reply' | 'alert';
export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export interface NotificationItem {
  id: number;
  type: NotificationType;
  level: NotificationLevel;
  title: string;
  body: string;
  platform_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationStore {
  /** 通知列表 */
  notifications: NotificationItem[];
  /** 未读数量 */
  unreadCount: number;
  /** 面板是否打开 */
  isPanelOpen: boolean;
  /** 是否正在加载 */
  isLoading: boolean;

  /** 加载通知列表 */
  loadNotifications: (options?: {
    unreadOnly?: boolean;
    limit?: number;
  }) => Promise<void>;
  /** 加载未读计数 */
  loadUnreadCount: () => Promise<void>;
  /** 标记为已读 */
  markRead: (id: number) => Promise<void>;
  /** 全部标记已读 */
  markAllRead: () => Promise<void>;
  /** 删除通知 */
  deleteNotification: (id: number) => Promise<void>;
  /** 打开/关闭面板 */
  togglePanel: () => void;
  /** 设置面板状态 */
  setPanelOpen: (open: boolean) => void;
}

const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isPanelOpen: false,
  isLoading: false,

  loadNotifications: async (options) => {
    set({ isLoading: true });
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'notifications:list',
        options ?? { limit: 50 },
      );
      if (result.ok) {
        set({ notifications: result.data, isLoading: false });
      } else {
        console.error('加载通知失败:', result.error);
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('加载通知异常:', error);
      set({ isLoading: false });
    }
  },

  loadUnreadCount: async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'notifications:unread-count',
      );
      if (result.ok) {
        set({ unreadCount: result.count });
      }
    } catch (error) {
      console.error('加载未读计数异常:', error);
    }
  },

  markRead: async (id) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'notifications:mark-read',
        id,
      );
      if (result.ok) {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, is_read: true } : n,
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      }
    } catch (error) {
      console.error('标记已读异常:', error);
    }
  },

  markAllRead: async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'notifications:mark-all-read',
      );
      if (result.ok) {
        set((state) => ({
          notifications: state.notifications.map((n) => ({
            ...n,
            is_read: true,
          })),
          unreadCount: 0,
        }));
      }
    } catch (error) {
      console.error('全部标记已读异常:', error);
    }
  },

  deleteNotification: async (id) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'notifications:delete',
        id,
      );
      if (result.ok) {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount: state.notifications.find((n) => n.id === id && !n.is_read)
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        }));
      }
    } catch (error) {
      console.error('删除通知异常:', error);
    }
  },

  togglePanel: () => {
    const { isPanelOpen } = get();
    set({ isPanelOpen: !isPanelOpen });
  },

  setPanelOpen: (open) => {
    set({ isPanelOpen: open });
  },
}));

export default useNotificationStore;
