import React from 'react';
import { Box, Flex, HStack, Spinner, Text, Button, Tag, Wrap, WrapItem } from '@chakra-ui/react';
import AppCardComponent from './AppCardComponent';
import { useAppManager } from './AppManagerContext';

const supportedPlatforms = ['千牛', '京麦', '微信', '企微'];

const PLATFORM_MODES: Record<string, string> = {
  hint: '提示模式',
  assist: '辅助回复',
  unattended: '无人值守',
};

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
  } = useAppManager();

  let content: React.ReactNode;

  if (data?.data && data.data.length > 0) {
    const onlineCount = data.data.filter((a) => a.running).length;
    const offlineCount = data.data.length - onlineCount;

    content = (
      <Box>
        {/* 平台卡片 — 横向排列 */}
        <Wrap spacing={3} mb={3}>
          {data.data.map((app, i) => (
            <WrapItem key={i}>
              <AppCardComponent
                app={app}
                selectedAppId={selectedAppId}
                setSelectedAppId={setSelectedAppId}
                openSettings={() => {
                  setSelectedAppId(app.id);
                  setSelectedInstanceId(null);
                  setIsSettingsOpen(true);
                }}
              />
            </WrapItem>
          ))}
        </Wrap>

        {/* 底部状态栏 */}
        <Flex
          bg="gray.50"
          borderRadius="md"
          p={2}
          px={4}
          align="center"
          justify="space-between"
          fontSize="xs"
          color="gray.600"
        >
          <HStack spacing={4}>
            <HStack spacing={1}>
              <Box w="8px" h="8px" borderRadius="full" bg="green.400" />
              <Text>
                {onlineCount} 个在线
              </Text>
            </HStack>
            {offlineCount > 0 && (
              <HStack spacing={1}>
                <Box w="8px" h="8px" borderRadius="full" bg="gray.400" />
                <Text>
                  {offlineCount} 个离线
                </Text>
              </HStack>
            )}
          </HStack>
          <HStack spacing={4} color="gray.500">
            <Text>仅在线平台可选中操作</Text>
          </HStack>
        </Flex>
      </Box>
    );
  } else if (isLoading) {
    content = (
      <Flex
        justifyContent="center"
        alignItems="center"
        py={8}
        direction="column"
      >
        <Spinner size="md" color="teal.500" />
        <Text mt={3} color="gray.500" fontSize="sm">
          正在检测客户端...
        </Text>
      </Flex>
    );
  } else {
    content = (
      <Flex
        justifyContent="center"
        alignItems="center"
        flexDirection="column"
        py={6}
        px={3}
        textAlign="center"
      >
        <Text fontWeight="semibold" color="gray.700">
          暂未识别到可接入的平台
        </Text>
        <Text mt={2} fontSize="sm" color="gray.500" lineHeight="1.7">
          请先打开并登录千牛、企微、微信等客服客户端，然后回到这里。
        </Text>
        <HStack mt={3} spacing={2} wrap="wrap" justify="center">
          {supportedPlatforms.map((name) => (
            <Tag key={name} size="sm" colorScheme="teal">
              {name}
            </Tag>
          ))}
        </HStack>
        <Button
          mt={4}
          size="sm"
          colorScheme="teal"
          variant="outline"
          onClick={refetchPlatforms}
          isLoading={isRefetchingPlatforms}
        >
          重新检测
        </Button>
        {retryCount > 0 && (
          <Text mt={2} fontSize="xs" color="gray.400">
            已自动检测 {retryCount} 次
          </Text>
        )}
      </Flex>
    );
  }

  return (
    <Box w="100%">
      {content}
    </Box>
  );
};

export default AppListComponent;
