import React, { useEffect, useRef } from 'react';
import {
  Heading,
  HStack,
  Button,
  Box,
  VStack,
  Text,
  Flex,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';
import { FiChevronDown, FiFolder, FiTrash2 } from 'react-icons/fi';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';
import useGlobalStore from '../../../settings-window/stores/useGlobalStore';
import { LogLevel, LogObj } from '../../../common/services/platform/platform';

/** 根据日志级别返回对应的样式 */
const levelStyle = (level?: LogLevel): { color: string; bg: string; dot: string } => {
  switch (level) {
    case 'error':
      return { color: 'red.600', bg: 'red.50', dot: 'red.400' };
    case 'warn':
      return { color: 'orange.600', bg: 'orange.50', dot: 'orange.400' };
    case 'success':
      return { color: 'green.600', bg: 'green.50', dot: 'green.400' };
    case 'info':
      return { color: 'blue.600', bg: 'blue.50', dot: 'blue.400' };
    default:
      return { color: 'gray.600', bg: 'transparent', dot: 'gray.300' };
  }
};

const LogBox = () => {
  const { logs, clearLogs, addLog } = useGlobalStore();
  const { registerEventHandler } = useWebSocketContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  useEffect(() => {
    clearLogs();
    const unregister = registerEventHandler((message) => {
      if (message.event === 'log_show' && message.data) {
        const log = message.data as LogObj;
        addLog(log);
      }
    });

    return () => unregister();
  }, [registerEventHandler]); // eslint-disable-line

  // 自动滚动到底部
  useEffect(() => {
    if (shouldAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  const openSelectedFolder = () => {
    window.electron.ipcRenderer.sendMessage('open-logger-folder');
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      shouldAutoScroll.current = true;
    }
  };

  return (
    <Box
      bg="white"
      borderRadius="xl"
      p={4}
      boxShadow="sm"
      border="1px solid"
      borderColor="gray.100"
    >
      <Flex justify="space-between" align="center" mb={3}>
        <HStack spacing={3}>
          <Heading as="h5" size="sm" color="gray.800">
            运行日志
          </Heading>
          {logs.length > 0 && (
            <Text fontSize="11px" color="gray.400" fontWeight={500}>
              {logs.length} 条记录
            </Text>
          )}
        </HStack>
        <HStack spacing={1}>
          <Tooltip label="清空全部日志">
            <IconButton
              aria-label="清空日志"
              icon={<FiTrash2 />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'red.500', bg: 'red.50' }}
              onClick={clearLogs}
              borderRadius="md"
            />
          </Tooltip>
          <Tooltip label="打开日志文件夹">
            <IconButton
              aria-label="打开日志文件"
              icon={<FiFolder />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'brand.500', bg: 'brand.50' }}
              onClick={openSelectedFolder}
              borderRadius="md"
            />
          </Tooltip>
        </HStack>
      </Flex>

      {/* 日志列表 */}
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        overflowY="auto"
        maxH="30vh"
        borderRadius="md"
        border="1px solid"
        borderColor="gray.100"
        bg="gray.50"
      >
        {logs.length === 0 ? (
          <Flex
            direction="column"
            align="center"
            justify="center"
            py={10}
            color="gray.400"
          >
            <Text fontSize="24px" mb={2}>📜</Text>
            <Text fontSize="13px">暂无日志，系统事件将在此显示</Text>
          </Flex>
        ) : (
          <VStack spacing={0} align="stretch">
            {logs.map((log, index) => {
              const style = levelStyle(log.level);
              return (
                <Flex
                  key={index}
                  px={3}
                  py={1.5}
                  align="flex-start"
                  gap={2}
                  bg={index % 2 === 0 ? 'white' : 'gray.50'}
                  borderBottom="1px solid"
                  borderColor="gray.100"
                  _hover={{ bg: 'gray.100' }}
                  transition="background 0.15s"
                  className="fade-in"
                >
                  {/* 级别色点 */}
                  <Box
                    w="6px"
                    h="6px"
                    borderRadius="full"
                    bg={style.dot}
                    flexShrink={0}
                    mt="5px"
                  />
                  {/* 时间 */}
                  <Text
                    color="gray.400"
                    fontSize="11px"
                    fontFamily="'SF Mono', 'Cascadia Code', 'Consolas', monospace"
                    whiteSpace="nowrap"
                    flexShrink={0}
                    minW="52px"
                    mt="1px"
                  >
                    {log.time}
                  </Text>
                  {/* 内容 */}
                  <Text
                    color={style.color}
                    fontSize="12px"
                    lineHeight="1.5"
                    wordBreak="break-all"
                  >
                    {log.content}
                  </Text>
                </Flex>
              );
            })}
          </VStack>
        )}
      </Box>

      {/* 滚动到底部按钮 */}
      {!shouldAutoScroll.current && logs.length > 0 && (
        <Flex justify="center" mt={2}>
          <Button
            size="xs"
            variant="ghost"
            leftIcon={<FiChevronDown />}
            onClick={scrollToBottom}
            color="brand.500"
            fontSize="11px"
          >
            滚动到底部
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default React.memo(LogBox);
