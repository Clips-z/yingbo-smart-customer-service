import axios from 'axios';
import { BrowserWindow } from 'electron';
import { setCron } from './system/cron';
import type BackendServiceManager from './system/backend';

const setupCron = (mainWindow: BrowserWindow, bsm: BackendServiceManager) => {
  const baseURL = (url: string) => {
    return `http://127.0.0.1:${bsm.getPort()}/${url}`;
  };

  // 每隔 30 秒执行一次，通知渲染进程刷新配置（原 5 秒过于频繁）
  setCron('*/30 * * * * *', () => {
    mainWindow.webContents.send('refresh-config');
  });

  // 每隔 15 秒检查一次后端服务是否健康（原 3 秒过于频繁）
  const doHealthCheck = async () => {
    if (!bsm) {
      console.error('BackendServiceManager not found');
      return;
    }

    try {
      const {
        data: { data },
      } = await axios.get(baseURL('api/v1/base/health'), { timeout: 5000 });
      mainWindow.webContents.send('check-health', data);
    } catch (error) {
      console.error('Health check failed:', error instanceof Error ? error.message : String(error));
      // 失败也必须通知前端，否则前端永远收不到消息会一直卡在加载页
      mainWindow.webContents.send('check-health', false);
    }
  };

  setCron('*/15 * * * * *', doHealthCheck);

  // ⭐ 立即执行一次健康检查，不等 cron 首次触发（避免最长 3 秒等待）
  setTimeout(doHealthCheck, 1000);

  // 每隔 5 分钟同步一次 Backend 服务的状态
  setCron('0 */5 * * * *', async () => {
    if (!bsm) {
      console.error('BackendServiceManager not found');
      return;
    }

    // 为了避免依赖麻烦，这里直接通过 axios 发送请求
    try {
      await axios.post(baseURL('api/v1/base/sync'), {});
    } catch (error) {
      console.error('Error syncing backend service status:', error);
    }
  });
};

export default setupCron;
