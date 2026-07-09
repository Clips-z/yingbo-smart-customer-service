import React, { useEffect, useCallback } from 'react';
import {
  Box,
  Flex,
  Text,
  IconButton,
  Badge,
  Divider,
  Spinner,
  VStack,
  HStack,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import {
  FiX,
  FiCheck,
  FiTrash2,
  FiBell,
  FiAlertCircle,
  FiAlertTriangle,
  FiCheckCircle,
  FiInfo,
  FiUserCheck,
  FiCpu,
} from 'react-icons/fi';
import useNotificationStore, {
  NotificationItem,
  NotificationLevel,
} from '../../stores/useNotificationStore';

/* ── 级别图标和颜色映射 ── */
const levelConfig: Record<
  NotificationLevel,
  { icon: React.ElementType; color: string; bg: string }
> = {
  info: { icon: FiInfo, color: 'blue.500', bg: 'blue.50' },
  warning: { icon: FiAlertTriangle, color: 'orange.500', bg: 'orange.50' },
  error: { icon: FiAlertCircle, color: 'red.500', bg: 'red.50' },
  success: { icon: FiCheckCircle, color: 'green.500', bg: 'green.50' },
};

/* ── 类型图标映射 ── */
const typeIcon: Record<string, React.ElementType> = {
  system: FiCpu,
  platform: FiBell,
  reply: FiUserCheck,
  alert: FiAlertCircle,
};

/* ── 单条通知 ── */
const NotificationRow: React.FC<{
  item: NotificationItem;
  onMarkRead: (id: number) => void;
  onDelete: (id: number) => void;
}> = React.memo(({ item, onMarkRead, onDelete }) => {
  const config = levelConfig[item.level];
  const Icon = config.icon;
  const TypeIcon = typeIcon[item.type] || FiBell;

  return (
    <Box
      p={3}
      bg={item.is_read ? 'transparent' : config.bg}
      borderBottom="1px solid"
      borderColor="gray.100"
      _hover={{ bg: 'gray.50' }}
      transition="background 0.15s"
      role="group"
    >
      <Flex justify="space-between" align="flex-start" gap={2}>
        <HStack spacing={2} align="flex-start" flex={1} minW={0}>
          <Box
            as={Icon}
            size="14px"
            color={config.color}
            mt="2px"
            flexShrink={0}
          />
          <Box flex={1} minW={0}>
            <Flex align="center" gap={2} mb={0.5}>
              <Text
                fontSize="13px"
                fontWeight={600}
                color="gray.800"
                isTruncated
              >
                {item.title}
              </Text>
              {!item.is_read && (
                <Badge
                  colorScheme="red"
                  variant="solid"
                  fontSize="9px"
                  px={1.5}
                  py={0}
                  borderRadius="full"
                  flexShrink={0}
                >
                  新
                </Badge>
              )}
            </Flex>
            <Text fontSize="12px" color="gray.600" lineHeight="1.5" noOfLines={2}>
              {item.body}
            </Text>
            <Flex align="center" gap={2} mt={1.5}>
              <HStack spacing={1}>
                <TypeIcon size="10px" color="gray.400" />
                <Text fontSize="10px" color="gray.400">
                  {item.type === 'system'
                    ? '系统'
                    : item.type === 'platform'
                    ? '平台'
                    : item.type === 'reply'
                    ? '回复'
                    : '告警'}
                </Text>
              </HStack>
              <Text fontSize="10px" color="gray.400">
                {formatTime(item.created_at)}
              </Text>
            </Flex>
          </Box>
        </HStack>

        {/* 操作按钮 — hover 显示 */}
        <HStack
          spacing={0.5}
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.15s"
          flexShrink={0}
        >
          {!item.is_read && (
            <Tooltip label="标记已读" placement="top">
              <IconButton
                aria-label="标记已读"
                icon={<FiCheck size={13} />}
                size="xs"
                variant="ghost"
                colorScheme="blue"
                onClick={() => onMarkRead(item.id)}
              />
            </Tooltip>
          )}
          <Tooltip label="删除" placement="top">
            <IconButton
              aria-label="删除通知"
              icon={<FiTrash2 size={13} />}
              size="xs"
              variant="ghost"
              colorScheme="red"
              onClick={() => onDelete(item.id)}
            />
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );
});

NotificationRow.displayName = 'NotificationRow';

/* ── 时间格式化 ── */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

/* ── 通知面板 ── */
const NotificationPanel: React.FC = () => {
  const {
    notifications,
    unreadCount,
    isLoading,
    isPanelOpen,
    loadNotifications,
    loadUnreadCount,
    markRead,
    markAllRead,
    deleteNotification,
    togglePanel,
  } = useNotificationStore();

  const toast = useToast();

  // 面板打开时加载数据
  useEffect(() => {
    if (isPanelOpen) {
      loadNotifications();
      loadUnreadCount();
    }
  }, [isPanelOpen, loadNotifications, loadUnreadCount]);

  // 定期刷新未读计数（面板关闭时也轮询以更新徽章）
  useEffect(() => {
    loadUnreadCount();
    const timer = setInterval(() => {
      loadUnreadCount();
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadUnreadCount]);

  const handleMarkRead = useCallback(
    async (id: number) => {
      await markRead(id);
    },
    [markRead],
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllRead();
    toast({
      title: '已全部标记为已读',
      status: 'success',
      duration: 2000,
      isClosable: true,
      position: 'top',
    });
  }, [markAllRead, toast]);

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteNotification(id);
    },
    [deleteNotification],
  );

  if (!isPanelOpen) return null;

  return (
    <Box
      position="fixed"
      top={0}
      right={0}
      w="380px"
      h="100vh"
      bg="white"
      boxShadow="-4px 0 24px rgba(0,0,0,0.08)"
      borderLeft="1px solid"
      borderColor="gray.100"
      zIndex={1500}
      display="flex"
      flexDirection="column"
    >
      {/* ── 头部 ── */}
      <Flex
        justify="space-between"
        align="center"
        px={4}
        py={3}
        borderBottom="1px solid"
        borderColor="gray.100"
        flexShrink={0}
      >
        <HStack spacing={2}>
          <FiBell size={18} color="var(--chakra-colors-gray-700)" />
          <Text fontWeight={700} fontSize="15px" color="gray.800">
            通知中心
          </Text>
          {unreadCount > 0 && (
            <Badge
              colorScheme="red"
              variant="solid"
              fontSize="10px"
              px={2}
              py={0.5}
              borderRadius="full"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </HStack>
        <HStack spacing={1}>
          {unreadCount > 0 && (
            <Tooltip label="全部标记已读" placement="bottom">
              <IconButton
                aria-label="全部标记已读"
                icon={<FiCheck size={16} />}
                size="sm"
                variant="ghost"
                colorScheme="blue"
                onClick={handleMarkAllRead}
              />
            </Tooltip>
          )}
          <IconButton
            aria-label="关闭通知面板"
            icon={<FiX size={18} />}
            size="sm"
            variant="ghost"
            onClick={togglePanel}
          />
        </HStack>
      </Flex>

      <Divider borderColor="gray.100" />

      {/* ── 通知列表 ── */}
      <Box flex={1} overflowY="auto">
        {isLoading ? (
          <Flex justify="center" align="center" h="200px">
            <Spinner size="md" color="brand.500" thickness="2px" />
          </Flex>
        ) : notifications.length === 0 ? (
          <VStack spacing={3} py={16} color="gray.400">
            <FiBell size={40} strokeWidth={1.5} />
            <Text fontSize="14px" fontWeight={500}>
              暂无通知
            </Text>
            <Text fontSize="12px">当有新的系统消息、平台告警时，会在这里显示</Text>
          </VStack>
        ) : (
          notifications.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
            />
          ))
        )}
      </Box>
    </Box>
  );
};

export default React.memo(NotificationPanel);
