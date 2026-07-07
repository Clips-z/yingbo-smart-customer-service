import React, { useEffect } from 'react';
import { Flex, Stack, Skeleton } from '@chakra-ui/react';
import AppListComponent from './AppListComponent';
import { AppManagerProvider, useAppManager } from './AppManagerContext';

const LoadingSkeleton = () => (
  <Stack>
    <Skeleton height="36px" />
    <Skeleton height="20px" />
  </Stack>
);

const AppManagerContent = () => {
  const {
    data,
    isLoading,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedAppId,
    selectedInstanceId,
  } = useAppManager();

  const handleOpenSettings = () => {
    window.electron.ipcRenderer.sendMessage('open-settings-window', {
      appId: selectedAppId,
      instanceId: selectedInstanceId,
    });
  };

  useEffect(() => {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      handleOpenSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId, selectedInstanceId, isSettingsOpen, setIsSettingsOpen]);

  if (isLoading || !data || !data.data) {
    return <LoadingSkeleton />;
  }

  return (
    <Flex direction="column" w="100%">
      <AppListComponent />
    </Flex>
  );
};

const AppManagerComponent = () => {
  return (
    <AppManagerProvider>
      <AppManagerContent />
    </AppManagerProvider>
  );
};

export default React.memo(AppManagerComponent);
