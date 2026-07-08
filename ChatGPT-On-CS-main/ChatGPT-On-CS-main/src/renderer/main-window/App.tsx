import React, { useState, useEffect } from 'react';
import { ChakraProvider, Box } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import FullScreenLoader from './pages/FullScreenLoader';
import Updater from './components/Updater';
import SystemCheck from './components/SystemCheck';
import MainLayout from './components/layout/MainLayout';
import NotificationPanel from './components/NotificationPanel';
import { BroadcastProvider } from './hooks/useBroadcastContext';
import '../common/App.css';
import theme from '../common/styles/theme';

// Create a client
// 注意：keepPreviousData 是 useQuery 级别的选项，不应放在 defaultOptions 中，
// 否则生产构建下 Terser 压缩可能导致 QueryClient 构造失败，引发 React #130 错误。
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      gcTime: 5 * 60 * 1000, // 5分钟（React Query v4/v5 统一使用 gcTime）
      staleTime: 30 * 1000, // 30秒内数据视为新鲜，避免重复请求
    },
  },
});

function App() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // ⭐ 双保险策略：主动查询 + 被动监听
    // 1. 立即主动查询当前健康状态（防止事件在我们注册监听之前就已发出）
    try {
      const currentHealth = window.electron.ipcRenderer.get(
        'get-health-status',
      );
      if (currentHealth === true || currentHealth === 'true') {
        console.log('[App] Health status (sync): ready, switching to main UI');
        setIsLoaded(true);
        return; // 已经就绪，不需要再注册监听
      }
    } catch (e) {
      // sendSync 失败时降级到异步监听
      console.log('[App] Sync health check failed, using async listener');
    }

    // 2. 被动监听后续的健康检查事件
    const handler = (_event: any, health: unknown) => {
      const h = !!health;
      console.log('[App] Received check-health:', h);
      if (h) {
        setIsLoaded(true);
      }
    };

    window.electron.ipcRenderer.on('check-health', handler);

    return () => {
      window.electron.ipcRenderer.removeListener('check-health', handler);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <BroadcastProvider>
          <ErrorBoundary>
            {isLoaded ? <MainLayout /> : <FullScreenLoader />}
            <NotificationPanel />
            <SystemCheck />
            <Updater />
          </ErrorBoundary>
        </BroadcastProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

export default App;
