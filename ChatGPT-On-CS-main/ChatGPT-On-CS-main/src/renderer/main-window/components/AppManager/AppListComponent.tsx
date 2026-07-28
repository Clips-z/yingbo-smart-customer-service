import React from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  SimpleGrid,
  Spinner,
  Text,
} from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import AppCardComponent from './AppCardComponent';
import InstanceListComponent from './InstanceListComponent';
import { useAppManager } from './AppManagerContext';

const AppListComponent = () => {
  const {
    data,
    selectedAppId,
    setSelectedAppId,
    setSelectedInstanceId,
    setIsSettingsOpen,
    isLoading,
    isRefetchingPlatforms,
    retryCount,
    refetchPlatforms,
    instances,
  } = useAppManager();

  if (isLoading) {
    return (
      <Flex minH="180px" align="center" justify="center" direction="column">
        <Spinner size="sm" color="ui.accent" thickness="2px" />
        <Text mt={3} color="gray.500" fontSize="12px">
          正在检测已打开的客服平台…
        </Text>
      </Flex>
    );
  }

  if (!data?.data?.length) {
    return (
      <Flex
        minH="220px"
        align="center"
        justify="center"
        direction="column"
        textAlign="center"
      >
        <Flex
          w="44px"
          h="44px"
          align="center"
          justify="center"
          borderRadius="14px"
          bg="ui.accentSoft"
          color="ui.accent"
        >
          <FiRefreshCw size={20} />
        </Flex>
        <Text mt={4} fontWeight="750" color="ui.ink" fontSize="14px">
          暂未识别到客服平台
        </Text>
        <Text mt={1} fontSize="11px" color="gray.500" maxW="380px">
          请先打开并登录千牛、京麦、微信、企业微信、拼多多或抖店工作台。
        </Text>
        <Button
          mt={4}
          size="sm"
          leftIcon={<FiRefreshCw />}
          colorScheme="blue"
          variant="outline"
          onClick={refetchPlatforms}
          isLoading={isRefetchingPlatforms}
        >
          重新检测
        </Button>
        {retryCount > 0 && (
          <Text mt={2} fontSize="10px" color="gray.400">
            已自动检测 {retryCount} 次
          </Text>
        )}
      </Flex>
    );
  }

  const onlineCount = data.data.filter((app) => app.running).length;
  const selectedApp = data.data.find((app) => app.id === selectedAppId);
  const selectedCount = instances.filter(
    (instance) => instance.app_id === selectedAppId,
  ).length;

  return (
    <SimpleGrid columns={{ base: 1, lg: 12 }} spacing={4}>
      <Box gridColumn={{ lg: 'span 5' }}>
        <Flex align="center" justify="space-between" mb={3}>
          <Text fontSize="11px" fontWeight="700" color="gray.500">
            已检测平台
          </Text>
          <Badge bg="green.50" color="green.700" borderRadius="full">
            {onlineCount} 个在线
          </Badge>
        </Flex>
        <Flex direction="column" gap={2}>
          {data.data.map((app) => (
            <AppCardComponent
              key={app.id}
              app={app}
              selectedAppId={selectedAppId}
              setSelectedAppId={(next) => {
                setSelectedAppId(next);
                setSelectedInstanceId(null);
              }}
              openSettings={() => {
                setSelectedAppId(app.id);
                setSelectedInstanceId(null);
                setIsSettingsOpen(true);
              }}
            />
          ))}
        </Flex>
      </Box>
      <Box
        gridColumn={{ lg: 'span 7' }}
        border="1px solid"
        borderColor="ui.border"
        borderRadius="14px"
        bg="#FAFBFC"
        minH="220px"
        overflow="hidden"
      >
        <Flex
          h="52px"
          px={4}
          align="center"
          justify="space-between"
          borderBottom="1px solid"
          borderColor="ui.border"
          bg="white"
        >
          <Box>
            <Text fontSize="12px" fontWeight="750" color="ui.ink">
              {selectedApp ? `${selectedApp.name} 的客服实例` : '客服实例'}
            </Text>
            <Text fontSize="10px" color="gray.500">
              {selectedApp
                ? `当前检测到 ${selectedCount} 个运行任务`
                : '从左侧选择一个在线平台'}
            </Text>
          </Box>
          {selectedApp && (
            <Button
              size="xs"
              variant="ghost"
              color="ui.accent"
              onClick={() => setIsSettingsOpen(true)}
            >
              平台设置
            </Button>
          )}
        </Flex>
        <InstanceListComponent />
      </Box>
    </SimpleGrid>
  );
};

export default React.memo(AppListComponent);
