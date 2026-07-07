import React from 'react';
import { Box, Flex, HStack, Spinner, Text, Button, Tag, Wrap, WrapItem } from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import AppCardComponent from './AppCardComponent';
import { useAppManager } from './AppManagerContext';

const supportedPlatforms = ['千牛', '京麦', '微信', '企微', '拼多多', '抖音电商'];

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
        {/* 平台卡片 — 精美卡片网格 */}
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

        {/* 底部状态栏 — 圆角 Pill 风格 */}
        <Flex
          bg="white"
          borderRadius="xl"
          p={2.5}
          px={4}
          align="center"
          justify="space-between"
          boxShadow="sm"
          border="1px solid"
          borderColor="gray.100"
        >
          <HStack spacing={5}>
            <HStack spacing={1.5}>
              <Box
                w="10px"
                h="10px"
                borderRadius="full"
                bg="green.400"
                className="pulse-dot"
              />
              <Text fontSize="12px" fontWeight="600" color="gray.700">
                {onlineCount}
                <Text as="span" fontWeight="400" color="gray.500"> 个在线</Text>
              </Text>
            </HStack>
            {offlineCount > 0 && (
              <HStack spacing={1.5}>
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  bg="gray.300"
                />
                <Text fontSize="12px" fontWeight="600" color="gray.500">
                  {offlineCount}
                  <Text as="span" fontWeight="400"> 个离线</Text>
                </Text>
              </HStack>
            )}
          </HStack>
          <Text fontSize="11px" color="gray.400">
            点击卡片选择平台 · 仅在线可操作
          </Text>
        </Flex>
      </Box>
    );
  } else if (isLoading) {
    content = (
      <Flex
        justifyContent="center"
        alignItems="center"
        py={10}
        direction="column"
      >
        <Spinner size="md" color="brand.500" thickness="3px" />
        <Text mt={4} color="gray.500" fontSize="sm" fontWeight={500}>
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
        py={8}
        px={3}
        textAlign="center"
      >
        <Box fontSize="48px" mb={3} opacity={0.8}>
          🔌
        </Box>
        <Text fontWeight="600" color="gray.700" fontSize="15px">
          暂未识别到可接入的平台
        </Text>
        <Text mt={2} fontSize="13px" color="gray.500" lineHeight="1.6" maxW="360px">
          请先打开并登录千牛、企微、微信等客服客户端，然后回到这里。
        </Text>
        <HStack mt={4} spacing={2} wrap="wrap" justify="center">
          {supportedPlatforms.map((name) => (
            <Tag key={name} size="sm" colorScheme="brand" variant="subtle" borderRadius="full">
              {name}
            </Tag>
          ))}
        </HStack>
        <Button
          mt={4}
          size="sm"
          leftIcon={<FiRefreshCw />}
          colorScheme="brand"
          variant="outline"
          borderRadius="full"
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
