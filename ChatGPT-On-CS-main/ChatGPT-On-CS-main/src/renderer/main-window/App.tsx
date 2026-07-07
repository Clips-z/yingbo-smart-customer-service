import React, { useState, useEffect } from 'react';
import { ChakraProvider, Box } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import FullScreenLoader from './pages/FullScreenLoader';
import Updater from './components/Updater';
import SystemCheck from './components/SystemCheck';
import MainLayout from './components/layout/MainLayout';
import { BroadcastProvider } from './hooks/useBroadcastContext';
import '../common/App.css';
import theme from '../common/styles/theme';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      cacheTime: 5 * 60 * 1000, // 5分钟，避免缓存频繁失效
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
            <SystemCheck />
            <Updater />
          </ErrorBoundary>
        </BroadcastProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

export default App;
