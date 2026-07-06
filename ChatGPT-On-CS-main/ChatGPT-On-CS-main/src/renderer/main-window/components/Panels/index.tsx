import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  HStack,
  Tooltip,
  IconButton,
  Text,
  VStack,
  Switch,
  Flex,
  useColorModeValue,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { FiPause, FiPlay } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';
import {
  getConfig,
  updateConfig,
} from '../../../common/services/platform/controller';
import { DriverConfig } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

const Panels = () => {
  const { toast } = useToast();
  const { registerEventHandler } = useWebSocketContext();
  const [driverSettings, setDriverSettings] = useState<DriverConfig>({
    hasPaused: true,
    hasKeywordMatch: false,
    hasUseGpt: false,
    hasMouseClose: true,
    hasEscClose: true,
    hasTransfer: true,
    hasReplace: true,
  });

  const { data } = useQuery(['config', 'driver'], async () => {
    try {
      const resp = await getConfig({
        type: 'driver',
      });
      return resp;
    } catch (error) {
      toast({
        title: '获取配置失败',
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
      });

      return null;
    }
  });

  const pausedHandler = useCallback(
    (message: any) => {
      if (message.event === 'has_paused') {
        setDriverSettings((prevSettings) => ({
          ...prevSettings,
          hasPaused: true,
        }));

        toast({
          title: '自动回复已暂停',
          status: 'info',
          position: 'top',
          duration: 5000,
          isClosable: true,
        });
      }
    },
    [toast],
  );

  useEffect(() => {
    const unregister = registerEventHandler(pausedHandler);
    return () => unregister();
  }, [registerEventHandler, pausedHandler]);

  useEffect(() => {
    if (data) {
      const obj = data.data as DriverConfig;
      setDriverSettings(obj);
    }
  }, [data]);

  const handleUpdateConfig = async (newConfig: Partial<DriverConfig>) => {
    const updatedConfig = { ...driverSettings, ...newConfig };
    setDriverSettings(updatedConfig);
    try {
      await updateConfig({
        type: 'driver',
        cfg: updatedConfig,
      });

      if ('hasPaused' in newConfig) {
        toast({
          title: '更新配置成功',
          description: newConfig.hasPaused
            ? '已经暂停自动回复功能'
            : '已经开启自动回复功能',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      const errormsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      toast({
        title: '更新配置失败',
        description: errormsg,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const isRunning = !driverSettings.hasPaused;

  return (
    <Box
      bg="white"
      borderRadius="xl"
      p={4}
      boxShadow="sm"
      border="1px solid"
      borderColor="gray.100"
    >
      <HStack spacing={6} align="flex-start">
        {/* 左侧：启动/暂停按钮 */}
        <Flex
          direction="column"
          align="center"
          bg={isRunning ? 'green.50' : 'gray.50'}
          borderRadius="xl"
          p={4}
          minW="100px"
          transition="all 0.3s ease"
          border="1px solid"
          borderColor={isRunning ? 'green.100' : 'gray.100'}
        >
          <IconButton
            icon={isRunning ? <FiPause size={24} /> : <FiPlay size={24} />}
            aria-label={isRunning ? '暂停自动回复' : '开启自动回复'}
            size="lg"
            onClick={() =>
              handleUpdateConfig({ hasPaused: !driverSettings.hasPaused })
            }
            isRound
            bg={isRunning ? 'green.500' : 'brand.500'}
            color="white"
            _hover={
              isRunning
                ? { bg: 'green.600', transform: 'scale(1.05)' }
                : { bg: 'brand.600', transform: 'scale(1.05)' }
            }
            boxShadow={isRunning ? '0 0 20px rgba(34, 197, 94, 0.4)' : '0 0 20px rgba(99, 102, 241, 0.3)'}
            transition="all 0.3s"
            w="56px"
            h="56px"
            className={isRunning ? 'pulse-dot' : ''}
          />
          <Text
            mt={2}
            fontSize="13px"
            fontWeight={700}
            color={isRunning ? 'green.600' : 'gray.600'}
          >
            {isRunning ? '运行中' : '已暂停'}
          </Text>
        </Flex>

        {/* 右侧：开关组 */}
        <VStack flex={1} spacing={3} align="stretch">
          <Text fontSize="13px" fontWeight="600" color="gray.700" mb={-1}>
            功能开关
          </Text>

          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="13px" fontWeight={500} color="gray.700">关键词匹配</Text>
              <Text fontSize="11px" color="gray.400">优先匹配关键词，未匹配则调用 AI</Text>
            </Box>
            <Switch
              isChecked={driverSettings.hasKeywordMatch}
              onChange={(e) => handleUpdateConfig({ hasKeywordMatch: e.target.checked })}
              colorScheme="brand"
              size="sm"
            />
          </Flex>

          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="13px" fontWeight={500} color="gray.700">GPT 回复</Text>
              <Text fontSize="11px" color="gray.400">关闭后仅使用关键词回复</Text>
            </Box>
            <Switch
              isChecked={driverSettings.hasUseGpt}
              onChange={(e) => handleUpdateConfig({ hasUseGpt: e.target.checked })}
              colorScheme="brand"
              size="sm"
            />
          </Flex>

          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="13px" fontWeight={500} color="gray.700">关键词转人工</Text>
              <Text fontSize="11px" color="gray.400">匹配关键词自动暂停并提醒</Text>
            </Box>
            <Switch
              isChecked={driverSettings.hasTransfer}
              onChange={(e) => handleUpdateConfig({ hasTransfer: e.target.checked })}
              colorScheme="orange"
              size="sm"
            />
          </Flex>

          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="13px" fontWeight={500} color="gray.700">关键词替换</Text>
              <Text fontSize="11px" color="gray.400">自动替换回复中的敏感词</Text>
            </Box>
            <Switch
              isChecked={driverSettings.hasReplace}
              onChange={(e) => handleUpdateConfig({ hasReplace: e.target.checked })}
              colorScheme="brand"
              size="sm"
            />
          </Flex>

          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="13px" fontWeight={500} color="gray.700">ESC 自动暂停</Text>
              <Text fontSize="11px" color="gray.400">按 ESC 键时自动暂停回复</Text>
            </Box>
            <Switch
              isChecked={driverSettings.hasEscClose}
              onChange={(e) => handleUpdateConfig({ hasEscClose: e.target.checked })}
              colorScheme="brand"
              size="sm"
            />
          </Flex>
        </VStack>
      </HStack>
    </Box>
  );
};

export default React.memo(Panels);
