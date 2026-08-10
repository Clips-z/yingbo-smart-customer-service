/* eslint-disable no-void */
import React, { useEffect, useState } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import FullScreenLoader from './pages/FullScreenLoader';
import Updater from './components/Updater';
import SystemCheck from './components/SystemCheck';
import MainLayout from './components/layout/MainLayout';
import { BroadcastProvider } from './hooks/useBroadcastContext';
import { subscribeToStartupReadiness } from './services/startupReadiness';
import '../common/App.css';
import theme from '../common/styles/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      cacheTime: 5 * 60 * 1000,
    },
  },
});

function App() {
  const [serviceState, setServiceState] = useState<
    'starting' | 'ready' | 'unavailable'
  >('starting');

  useEffect(
    () =>
      subscribeToStartupReadiness(
        window.electron.ipcRenderer,
        () => {
          setServiceState('ready');
          void queryClient.invalidateQueries();
        },
        () => {
          setServiceState((current) =>
            current === 'starting' ? 'starting' : 'unavailable',
          );
          void queryClient.cancelQueries();
        },
      ),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <BroadcastProvider>
          <ErrorBoundary>
            {serviceState === 'ready' ? (
              <MainLayout />
            ) : (
              <FullScreenLoader reconnecting={serviceState === 'unavailable'} />
            )}
            <SystemCheck />
            <Updater />
          </ErrorBoundary>
        </BroadcastProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

export default App;
