import React from 'react';
import {
  Box,
  Button,
  Flex,
  Spinner,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import InstanceCardComponent from './InstanceCardComponent';
import { useAppManager } from './AppManagerContext';
import { trackButtonClick } from '../../../common/services/analytics';

const InstanceListComponent = () => {
  const {
    filteredInstances,
    selectedInstanceId,
    selectedAppId,
    isTasksLoading,
    setSelectedInstanceId,
    handleDelete,
    handleAddTask,
    setIsSettingsOpen,
  } = useAppManager();
  const toast = useToast();

  const addInstance = async () => {
    try {
      trackButtonClick(`add_task_${selectedAppId || ''}`);
      await handleAddTask();
    } catch (error) {
      toast({
        title: '新增客服实例失败',
        description: (error as Error).message || '请稍后重试',
        status: 'error',
        position: 'top',
      });
    }
  };

  if (!selectedAppId) {
    return (
      <Flex minH="166px" align="center" justify="center" direction="column">
        <Text fontSize="12px" fontWeight="650" color="gray.500">
          请选择一个在线平台
        </Text>
        <Text mt={1} fontSize="10px" color="gray.400">
          选择后可查看该平台下的客服任务
        </Text>
      </Flex>
    );
  }

  return (
    <Box p={3}>
      <Flex direction="column" gap={2}>
        {filteredInstances.map((instance) => (
          <InstanceCardComponent
            key={instance.task_id}
            instance={instance}
            selectedInstanceId={selectedInstanceId}
            setSelectedInstanceId={setSelectedInstanceId}
            handleDelete={handleDelete}
            openSettings={() => setIsSettingsOpen(true)}
          />
        ))}
        {!filteredInstances.length && !isTasksLoading && (
          <Flex py={5} align="center" justify="center" direction="column">
            <Text fontSize="12px" color="gray.500">
              还没有客服实例
            </Text>
            <Text fontSize="10px" color="gray.400" mt={1}>
              新增后可为不同客服账号配置独立策略
            </Text>
          </Flex>
        )}
        {isTasksLoading ? (
          <Flex h="36px" align="center" justify="center">
            <Spinner size="xs" />
          </Flex>
        ) : (
          <Button
            size="sm"
            variant="outline"
            borderStyle="dashed"
            leftIcon={<FiPlus />}
            onClick={addInstance}
          >
            新增客服实例
          </Button>
        )}
      </Flex>
    </Box>
  );
};

export default React.memo(InstanceListComponent);
