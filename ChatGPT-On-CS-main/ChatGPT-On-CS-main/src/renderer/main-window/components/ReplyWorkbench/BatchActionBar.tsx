import React from 'react';
import {
  Badge,
  Button,
  ButtonGroup,
  Flex,
  HStack,
  Spacer,
  Tooltip,
} from '@chakra-ui/react';
import { FiTrash, FiTrash2, FiCheck } from 'react-icons/fi';
import { ReplySuggestion } from '../../../common/services/platform/platform';

interface BatchActionBarProps {
  suggestions: ReplySuggestion[];
  pending: ReplySuggestion[];
  handled: ReplySuggestion[];
  selectedIds: Set<number>;
  batchWorking: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectPendingOnly: () => void;
  onBatchDismissed: () => void;
  onBatchDelete: () => void;
  onClearHandled: () => void;
}

const BatchActionBar = React.memo(
  ({
    suggestions,
    pending,
    handled,
    selectedIds,
    batchWorking,
    onSelectAll,
    onClearSelection,
    onSelectPendingOnly,
    onBatchDismissed,
    onBatchDelete,
    onClearHandled,
  }: BatchActionBarProps) => {
    const hasSelection = selectedIds.size > 0;
    const allSelected =
      suggestions.length > 0 && selectedIds.size === suggestions.length;
    const batchCount = hasSelection ? selectedIds.size : pending.length;

    return (
      <Flex
        bg="gray.50"
        borderRadius="lg"
        p={2}
        mb={3}
        align="center"
        gap={2}
        wrap="wrap"
        border="1px solid"
        borderColor="gray.100"
      >
        <HStack spacing={1} flexShrink={0}>
          <Button
            size="xs"
            variant="ghost"
            onClick={allSelected ? onClearSelection : onSelectAll}
            color="gray.500"
            fontSize="11px"
            borderRadius="md"
            _hover={{ bg: 'gray.200' }}
          >
            {allSelected ? '取消全选' : '全选'}
          </Button>
          {pending.length > 0 && (
            <Tooltip label={`选中所有 ${pending.length} 条待回复`}>
              <Button
                size="xs"
                variant="outline"
                colorScheme="orange"
                onClick={onSelectPendingOnly}
                borderRadius="md"
                fontSize="11px"
              >
                选待回复 ({pending.length})
              </Button>
            </Tooltip>
          )}
        </HStack>
        {hasSelection && (
          <Badge colorScheme="brand" fontSize="10px" borderRadius="full" px={2}>
            已选 {selectedIds.size}
          </Badge>
        )}
        <Spacer />
        <ButtonGroup size="xs" spacing={1}>
          <Tooltip
            label={
              hasSelection
                ? `将 ${selectedIds.size} 条标记为已处理`
                : `将全部 ${pending.length} 条待回复标记为已处理`
            }
          >
            <Button
              leftIcon={<FiCheck />}
              colorScheme="green"
              variant="outline"
              isLoading={batchWorking}
              isDisabled={
                (hasSelection && selectedIds.size === 0) ||
                (!hasSelection && pending.length === 0)
              }
              onClick={onBatchDismissed}
              size="xs"
              borderRadius="md"
              fontSize="11px"
            >
              一键已处理 ({batchCount})
            </Button>
          </Tooltip>
          {hasSelection && (
            <Tooltip label={`删除选中的 ${selectedIds.size} 条记录`}>
              <Button
                leftIcon={<FiTrash />}
                colorScheme="red"
                variant="outline"
                isLoading={batchWorking}
                onClick={onBatchDelete}
                size="xs"
                borderRadius="md"
                fontSize="11px"
              >
                删除选中
              </Button>
            </Tooltip>
          )}
          <Tooltip label={`清空所有 ${handled.length} 条已处理记录`}>
            <Button
              leftIcon={<FiTrash2 />}
              colorScheme="red"
              variant="ghost"
              isLoading={batchWorking}
              isDisabled={handled.length === 0}
              onClick={onClearHandled}
              size="xs"
              borderRadius="md"
              fontSize="11px"
            >
              清空已处理
            </Button>
          </Tooltip>
        </ButtonGroup>
      </Flex>
    );
  },
);

BatchActionBar.displayName = 'BatchActionBar';

export default BatchActionBar;
