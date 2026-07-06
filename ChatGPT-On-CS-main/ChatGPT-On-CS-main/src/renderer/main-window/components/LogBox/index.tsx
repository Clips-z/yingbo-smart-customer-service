import React, { useEffect } from 'react';
import {
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
  TableContainer,
  Button,
  Box,
  VStack,
  Text,
} from '@chakra-ui/react';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';
import useGlobalStore from '../../../settings-window/stores/useGlobalStore';
import { LogLevel, LogObj } from '../../../common/services/platform/platform';

/** 根据日志级别返回对应的文字颜色 */
const levelColor = (level?: LogLevel): string => {
  switch (level) {
    case 'error':
      return 'red.600';
    case 'warn':
      return 'orange.500';
    case 'success':
      return 'green.600';
    case 'info':
      return 'blue.600';
    default:
      return 'gray.700';
  }
};

const LogBox = () => {
  const { logs, clearLogs, addLog } = useGlobalStore();
  const { registerEventHandler } = useWebSocketContext();

  useEffect(() => {
    clearLogs();
    const unregister = registerEventHandler((message) => {
      if (message.event === 'log_show' && message.data) {
        const log = message.data as LogObj;
        addLog(log);
      }
    });

    // 组件卸载时注销事件处理器
    return () => unregister();
  }, [registerEventHandler]); // eslint-disable-line

  const openSelectedFolder = () => {
    window.electron.ipcRenderer.sendMessage('open-logger-folder');
  };

  return (
    <Box minHeight="150px">
      <VStack>
        {/* 靠左对齐 */}
        <HStack width="full" justifyContent="flex-start">
          <Heading as="h5" size="md" ml="2" mr="5">
            运行日志
          </Heading>
          <Button size="sm" onClick={clearLogs}>
            清空全部日志
          </Button>
          <Button size="sm" onClick={openSelectedFolder}>
            打开日志文件
          </Button>
        </HStack>

        <TableContainer overflowY="scroll" width="full" maxH="40vh">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>时间</Th>
                <Th>内容</Th>
              </Tr>
            </Thead>
            <Tbody bg="gray.100">
              {logs.map((log, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <Tr key={index}>
                  <Td whiteSpace="nowrap" color="gray.500" fontSize="xs">
                    {log.time}
                  </Td>
                  <Td>
                    <Text color={levelColor(log.level)} fontSize="sm">
                      {log.content}
                    </Text>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </VStack>
    </Box>
  );
};

export default React.memo(LogBox);
