import React from 'react';
import {
  Badge,
  Box,
  Flex,
  IconButton,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { DeleteIcon, SettingsIcon } from '@chakra-ui/icons';

interface InstanceCardComponentProps {
  instance: {
    task_id: string;
    app_id: string;
    env_id: string;
    avatar?: string;
  };
  selectedInstanceId: string | null;
  setSelectedInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDelete: (taskId: string) => void;
  openSettings: () => void;
}

const InstanceCardComponent: React.FC<InstanceCardComponentProps> = ({
  instance,
  selectedInstanceId,
  setSelectedInstanceId,
  handleDelete,
  openSettings,
}) => {
  const selected = selectedInstanceId === instance.task_id;
  return (
    <Flex
      as="button"
      type="button"
      w="full"
      minH="58px"
      align="center"
      gap={3}
      p={3}
      textAlign="left"
      border="1px solid"
      borderColor={selected ? '#AFC0FF' : 'ui.border'}
      bg={selected ? 'ui.accentSoft' : 'white'}
      borderRadius="11px"
      onClick={() => setSelectedInstanceId(instance.task_id)}
      _hover={{ borderColor: '#AFC0FF' }}
    >
      <Flex
        w="30px"
        h="30px"
        flexShrink={0}
        borderRadius="9px"
        bg={selected ? 'ui.accent' : 'gray.100'}
        color={selected ? 'white' : 'gray.600'}
        align="center"
        justify="center"
        fontSize="11px"
        fontWeight="800"
      >
        客
      </Flex>
      <Box flex="1" minW="0">
        <Text fontSize="12px" fontWeight="700" color="ui.ink" noOfLines={1}>
          {instance.env_id || '默认客服账号'}
        </Text>
        <Flex mt={1} gap={2} align="center">
          <Badge colorScheme="green" fontSize="9px">
            任务运行中
          </Badge>
          <Text fontSize="9px" color="gray.400" noOfLines={1}>
            {instance.task_id}
          </Text>
        </Flex>
      </Box>
      <Tooltip label="实例设置">
        <IconButton
          aria-label="实例设置"
          icon={<SettingsIcon />}
          size="xs"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            openSettings();
          }}
        />
      </Tooltip>
      <Tooltip label="移除实例">
        <IconButton
          aria-label="移除实例"
          icon={<DeleteIcon />}
          size="xs"
          variant="ghost"
          color="red.500"
          onClick={(event) => {
            event.stopPropagation();
            handleDelete(instance.task_id);
          }}
        />
      </Tooltip>
    </Flex>
  );
};

export default React.memo(InstanceCardComponent);
