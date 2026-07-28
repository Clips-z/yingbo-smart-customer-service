import React from 'react';
import {
  Badge,
  Button,
  ButtonGroup,
  Flex,
  HStack,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spacer,
  Tooltip,
} from '@chakra-ui/react';
import { FiTrash, FiTrash2, FiCheck, FiMoreHorizontal } from 'react-icons/fi';
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
          <Menu placement="bottom-end">
            <MenuButton
              as={Button}
              leftIcon={<FiMoreHorizontal />}
              variant="ghost"
              isDisabled={
                batchWorking || (!hasSelection && handled.length === 0)
              }
              size="xs"
              color="gray.500"
            >
              更多
            </MenuButton>
            <MenuList minW="176px" fontSize="12px">
              {hasSelection && (
                <MenuItem
                  icon={<FiTrash />}
                  color="red.600"
                  onClick={onBatchDelete}
                >
                  删除选中（{selectedIds.size}）
                </MenuItem>
              )}
              <MenuItem
                icon={<FiTrash2 />}
                color="red.600"
                isDisabled={handled.length === 0}
                onClick={onClearHandled}
              >
                清空已处理（{handled.length}）
              </MenuItem>
            </MenuList>
          </Menu>
        </ButtonGroup>
      </Flex>
    );
  },
);

BatchActionBar.displayName = 'BatchActionBar';

export default BatchActionBar;
