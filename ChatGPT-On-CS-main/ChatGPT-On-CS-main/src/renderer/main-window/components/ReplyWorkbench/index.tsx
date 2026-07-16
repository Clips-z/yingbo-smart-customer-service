import React, { useMemo, useState, useCallback } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Spinner,
  Text,
  Textarea,
  Tooltip,
  VStack,
  IconButton,
  Checkbox,
  useClipboard,
} from '@chakra-ui/react';
import {
  FiCheck,
  FiClipboard,
  FiCornerUpLeft,
  FiSend,
  FiUser,
  FiMessageSquare,
} from 'react-icons/fi';
import {
  fillQianniuSuggestion,
  fillWechatSuggestion,
  fillWecomSuggestion,
  saveQianniuSuggestionDraft,
  updateQianniuSuggestionStatus,
} from '../../../common/services/platform/controller';
import { QianniuReplyMode, ReplySuggestion } from '../../../common/services/platform/platform';
import {
  formatTime,
  getHealthColorScheme,
  healthLabels,
  modeLabels,
  platformLabels,
  statusColorMap,
  statusLabels,
} from './constants';
import BatchActionBar from './BatchActionBar';
import { useReplyWorkbench } from './useReplyWorkbench';
import { useToast } from '../../hooks/useToast';

// ── 常量 ──────────────────────────────────────────
const platformEmoji: Record<string, string> = {
  win_qianniu: '🐂',
  win_wechat: '💬',
  win_jinmai: '📦',
  win_wecom: '🏢',
  win_pdd: '🛒',
  win_douyin: '🎵',
};

const platformColorMap: Record<string, string> = {
  win_qianniu: 'orange',
  win_wechat: 'green',
  win_wecom: 'blue',
  win_jinmai: 'red',
  win_pdd: 'red',
  win_douyin: 'gray',
};

const leftBorderColorMap: Record<string, string> = {
  pending: 'orange.400',
  preparing: 'blue.400',
  sending: 'purple.400',
  prepared: 'blue.400',
  sent: 'green.400',
  failed: 'red.400',
  cancelled: 'gray.300',
  dismissed: 'gray.200',
};

// ── 辅助函数 ───────────────────────────────────────
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

// ── 子组件 ─────────────────────────────────────────

/** 采集器健康状态 Badge */
function CollectorHealthBadge({
  state,
  lastError,
  recoveryAction,
  nextRetryAt,
  label,
}: {
  state?: string;
  lastError?: string;
  recoveryAction?: string;
  nextRetryAt?: string;
  label: string;
}) {
  if (!state) return null;
  const retryText = nextRetryAt
    ? `下次重试：${new Date(nextRetryAt).toLocaleTimeString('zh-CN')}`
    : '';
  const tooltip = [lastError, recoveryAction, retryText]
    .filter(Boolean)
    .join('；');
  return (
    <Tooltip label={tooltip || `${label}运行正常`}>
      <Badge mt={2} colorScheme={getHealthColorScheme(state)} variant="subtle" borderRadius="sm">
        {healthLabels[state as keyof typeof healthLabels] || state}
      </Badge>
    </Tooltip>
  );
}

/** 左列：单条消息项（紧凑型，可点击选中查看详情） */
const ConversationListItem = React.memo(
  ({
    item,
    isActive,
    isSelected,
    onClick,
    onToggleSelect,
  }: {
    item: ReplySuggestion;
    isActive: boolean;
    isSelected: boolean;
    onClick: () => void;
    onToggleSelect?: (id: number) => void;
  }) => {
    const statusBorder = leftBorderColorMap[item.status] || 'gray.200';
    const pColor = platformColorMap[item.platform_id] || 'gray';

    return (
      <Box
        onClick={onClick}
        cursor="pointer"
        bg={isActive ? 'brand.50' : 'white'}
        borderRadius="md"
        border="1px solid"
        borderColor={isActive ? 'brand.300' : 'gray.100'}
        borderLeft="4px solid"
        borderLeftColor={statusBorder}
        px={3}
        py={2.5}
        transition="all 0.15s ease"
        _hover={{ bg: isActive ? 'brand.50' : 'gray.50', borderColor: isActive ? 'brand.300' : 'gray.200' }}
      >
        {/* 第一行：发送者 + 平台 + 时间 */}
        <Flex justify="space-between" align="center" mb={1}>
          <HStack spacing={1.5} minW={0}>
            {onToggleSelect && (
              <Checkbox
                isChecked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(item.id);
                }}
                size="sm"
                colorScheme="brand"
                flexShrink={0}
              />
            )}
            <Box color={`${pColor}.500`} flexShrink={0}><FiUser size={13} /></Box>
            <Text fontWeight="700" fontSize="12px" noOfLines={1} color="gray.800">
              {item.sender}
            </Text>
            <Badge
              colorScheme={platformColorMap[item.platform_id] || 'gray'}
              variant="subtle"
              fontSize="9px"
              borderRadius="sm"
              px={1}
            >
              {platformLabels[item.platform_id] || item.platform_id}
            </Badge>
          </HStack>
          <Text color="gray.400" fontSize="10px" whiteSpace="nowrap" flexShrink={0} ml={2}>
            {formatTime(item.created_at)}
          </Text>
        </Flex>

        {/* 第二行：买家原话摘要 */}
        <Text fontSize="12px" color="gray.500" noOfLines={1} mb={0.5}>
          {item.incoming_content}
        </Text>

        {/* 第三行：建议回复摘要 + 状态 */}
        <Flex justify="space-between" align="center">
          <Text fontSize="11px" color="gray.400" noOfLines={1} flex="1" mr={2}>
            {item.reply_content}
          </Text>
          <Badge
            colorScheme={statusColorMap[item.status]}
            variant="subtle"
            fontSize="9px"
            borderRadius="sm"
            flexShrink={0}
          >
            {statusLabels[item.status]}
          </Badge>
        </Flex>
      </Box>
    );
  },
);
ConversationListItem.displayName = 'ConversationListItem';

/** 右列：会话详情（聊天气泡风格） */
const ConversationDetail = React.memo(
  ({
    item,
    mode,
    onChanged,
  }: {
    item: ReplySuggestion;
    mode: QianniuReplyMode;
    onChanged: () => void;
  }) => {
    const { toast } = useToast();
    const initialContent = (item.draft_content || item.reply_content).slice(0, 300);
    const [content, setContent] = useState(initialContent);
    const [isWorking, setIsWorking] = useState(false);
    const { onCopy, hasCopied } = useClipboard(content);
    const activeItemRef = React.useRef(item);
    const contentRef = React.useRef(initialContent);
    const lastPersistedRef = React.useRef({ id: item.id, content: initialContent });

    contentRef.current = content;

    const persistDraft = useCallback(
      async (target: ReplySuggestion, value: string) => {
        const nextContent = value.trim();
        if (
          target.platform_id !== 'win_qianniu' ||
          !nextContent ||
          target.status === 'sent' ||
          (lastPersistedRef.current.id === target.id &&
            lastPersistedRef.current.content === nextContent)
        ) {
          return;
        }
        await saveQianniuSuggestionDraft(
          target.id,
          nextContent,
          target.context_revision,
        );
        lastPersistedRef.current = { id: target.id, content: nextContent };
      },
      [],
    );

    React.useEffect(() => {
      const previous = activeItemRef.current;
      if (previous.id === item.id) return;

      void persistDraft(previous, contentRef.current).catch(() => undefined);
      const restored = (item.draft_content || item.reply_content).slice(0, 300);
      activeItemRef.current = item;
      contentRef.current = restored;
      lastPersistedRef.current = { id: item.id, content: restored };
      setContent(restored);
    }, [item, persistDraft]);

    React.useEffect(() => {
      if (item.platform_id !== 'win_qianniu' || item.status === 'sent') return undefined;
      const timer = window.setTimeout(() => {
        void persistDraft(item, content).catch(() => undefined);
      }, 500);
      return () => window.clearTimeout(timer);
    }, [content, item, persistDraft]);

    React.useEffect(
      () => () => {
        void persistDraft(activeItemRef.current, contentRef.current).catch(
          () => undefined,
        );
      },
      [persistDraft],
    );

    const handleFill = useCallback(
      async (
        fillFn: (id: number, content: string) => Promise<unknown>,
        successTitle: string,
        successDesc: string,
        errorTitle: string,
      ) => {
        setIsWorking(true);
        try {
          await fillFn(item.id, content);
          toast({ title: successTitle, description: successDesc, status: 'success', duration: 3500, isClosable: true });
          onChanged();
        } catch (error) {
          toast({ title: errorTitle, description: extractErrorMessage(error), status: 'error', duration: 5000, isClosable: true });
          onChanged();
        } finally {
          setIsWorking(false);
        }
      },
      [item.id, content, toast, onChanged],
    );

    const fillReply = () => handleFill(fillQianniuSuggestion, '已填入千牛输入框', `${item.sender}，请在千牛中确认后发送`, '填入失败');
    const fillWechatReply = () => handleFill(fillWechatSuggestion, '已定位微信联系人并填入回复', `${item.sender}，请在微信中确认后发送`, '定位微信失败');
    const fillWecomReply = () => handleFill(fillWecomSuggestion, '已定位企微联系人并填入回复', `${item.sender}，请在企业微信中确认后发送`, '定位企微失败');

    const updateStatus = async (status: 'pending' | 'dismissed') => {
      setIsWorking(true);
      try {
        await updateQianniuSuggestionStatus(item.id, status);
        onChanged();
      } finally {
        setIsWorking(false);
      }
    };

    const fillButtonConfig: Record<string, { label: string; colorScheme: string; onClick: () => Promise<void> }> = {
      win_qianniu: { label: '填入千牛', colorScheme: 'orange', onClick: fillReply },
      win_wechat: { label: '填入微信', colorScheme: 'green', onClick: fillWechatReply },
      win_wecom: { label: '填入企微', colorScheme: 'blue', onClick: fillWecomReply },
    };

    const fillConfig = fillButtonConfig[item.platform_id];
    const pColor = platformColorMap[item.platform_id] || 'gray';
    const isSent = item.status === 'sent';
    const deliveryInProgress = item.status === 'preparing' || item.status === 'sending';

    return (
      <Box h="full" display="flex" flexDirection="column">
        {/* 顶部：发送者信息栏 */}
        <Flex
          align="center"
          gap={2}
          pb={3}
          mb={3}
          borderBottom="1px solid"
          borderColor="gray.100"
        >
          <Box
            w="36px" h="36px" borderRadius="full"
            bg={`${pColor}.100`} color={`${pColor}.600`}
            display="flex" alignItems="center" justifyContent="center"
            flexShrink={0}
          >
            <FiUser size={16} />
          </Box>
          <Box flex="1" minW={0}>
            <HStack spacing={1.5} mb={0.5}>
              <Text fontWeight="700" fontSize="14px" color="gray.800">
                {item.sender}
              </Text>
              <Badge colorScheme={platformColorMap[item.platform_id] || 'gray'} variant="subtle" fontSize="10px" borderRadius="sm">
                {platformLabels[item.platform_id] || item.platform_id}
              </Badge>
              <Badge colorScheme={statusColorMap[item.status]} variant="subtle" fontSize="10px" borderRadius="sm">
                {statusLabels[item.status]}
              </Badge>
            </HStack>
            <Text fontSize="11px" color="gray.400">
              {formatTime(item.created_at)}
            </Text>
          </Box>
        </Flex>

        {/* 中间：对话气泡区 */}
        <Box flex="1" minH={0} overflowY="auto" px={1}>
          {/* 买家消息 — 左对齐灰色气泡 */}
          <Flex justify="flex-start" mb={4}>
            <Box maxW="85%">
              <Text fontSize="10px" color="gray.400" fontWeight={600} mb={1} ml={1}>
                买家消息
              </Text>
              <Box
                bg="gray.50"
                border="1px solid"
                borderColor="gray.200"
                borderRadius="2xl"
                borderBottomLeftRadius="sm"
                px={4}
                py={3}
              >
                <Text fontSize="14px" color="gray.700" lineHeight="1.7">
                  {item.incoming_content}
                </Text>
              </Box>
            </Box>
          </Flex>

          {/* AI建议回复 — 右对齐品牌色气泡 */}
          <Flex justify="flex-end" mb={4}>
            <Box maxW="85%">
              <Text fontSize="10px" color="gray.400" fontWeight={600} mb={1} mr={1} textAlign="right">
                AI 建议回复
              </Text>
              <Box
                bg="brand.500"
                borderRadius="2xl"
                borderBottomRightRadius="sm"
                px={4}
                py={3}
                boxShadow="md"
              >
                <Text fontSize="14px" color="white" lineHeight="1.7">
                  {item.reply_content}
                </Text>
              </Box>
            </Box>
          </Flex>
        </Box>

        {/* 底部：编辑区 + 操作按钮 */}
        <Box
          borderTop="1px solid"
          borderColor="gray.100"
          pt={3}
          mt={2}
        >
          <Flex align="center" justify="space-between" mb={2}>
            <Text fontSize="10px" color="gray.400" fontWeight={600}>
              编辑回复 · {content.length}/300
            </Text>
          </Flex>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            size="sm"
            minH="64px"
            maxLength={300}
            resize="vertical"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
            fontSize="13px"
            _focus={{ borderColor: 'brand.400', boxShadow: '0 0 0 1px var(--chakra-colors-brand-200)' }}
            isDisabled={isSent || deliveryInProgress}
            mb={3}
          />
          {item.delivery_error && item.status === 'failed' && (
            <Alert status="error" mb={2} borderRadius="md" py={2}>
              <AlertIcon />
              <Text fontSize="12px">{item.delivery_error}，检查千牛状态后可重试。</Text>
            </Alert>
          )}
          <Flex justify="space-between" align="center" gap={2}>
            {/* 左侧图标按钮 */}
            <HStack spacing={0.5}>
              <Tooltip label={hasCopied ? '已复制' : '复制回复'}>
                <IconButton
                  aria-label="复制回复"
                  icon={<FiClipboard />}
                  onClick={onCopy}
                  color={hasCopied ? 'green.500' : 'gray.400'}
                  _hover={{ color: 'brand.500', bg: 'brand.50' }}
                  borderRadius="md"
                  size="sm"
                  variant="ghost"
                />
              </Tooltip>
              {item.status === 'pending' ? (
                <Tooltip label="标记为已处理">
                  <IconButton
                    aria-label="标记已处理"
                    icon={<FiCheck />}
                    isDisabled={isWorking}
                    onClick={() => updateStatus('dismissed')}
                    color="gray.400"
                    _hover={{ color: 'green.500', bg: 'green.50' }}
                    borderRadius="md"
                    size="sm"
                    variant="ghost"
                  />
                </Tooltip>
              ) : (
                <Tooltip label="重新放回待回复">
                  <IconButton
                    aria-label="重新待回复"
                    icon={<FiCornerUpLeft />}
                    isDisabled={isWorking}
                    onClick={() => updateStatus('pending')}
                    color="gray.400"
                    _hover={{ color: 'orange.500', bg: 'orange.50' }}
                    borderRadius="md"
                    size="sm"
                    variant="ghost"
                  />
                </Tooltip>
              )}
            </HStack>

            {/* 右侧填入按钮 */}
            {fillConfig && !isSent && (
              <Tooltip label={mode === 'assist' ? '定位对应联系人并填入，不会发送' : '切换到辅助回复模式后可用'}>
                <Button
                  size="sm"
                  leftIcon={<FiSend />}
                  colorScheme={fillConfig.colorScheme}
                  isLoading={isWorking}
                  isDisabled={isWorking || deliveryInProgress || mode !== 'assist' || !content.trim()}
                  onClick={fillConfig.onClick}
                  borderRadius="lg"
                  fontWeight={600}
                  fontSize="12px"
                  boxShadow="sm"
                  _hover={{ transform: 'translateY(-1px)', boxShadow: 'md' }}
                  transition="all 0.2s"
                >
                  {fillConfig.label}
                </Button>
              </Tooltip>
            )}
          </Flex>
        </Box>
      </Box>
    );
  },
);
ConversationDetail.displayName = 'ConversationDetail';

// ── 空态 ───────────────────────────────────────────

const EmptyState = ({ tabKey }: { tabKey: string }) => {
  const emptyMessages: Record<string, { emoji: string; title: string; desc: string }> = {
    all: { emoji: '📭', title: '暂无回复任务', desc: '当有新消息时，会自动显示在这里' },
    pending: { emoji: '✨', title: '没有待回复的消息', desc: '所有消息都已处理完毕，干得漂亮！' },
    handled: { emoji: '📋', title: '没有已处理记录', desc: '标记已处理的记录会显示在这里' },
  };
  const msg = emptyMessages[tabKey] || emptyMessages.all;
  return (
    <Flex direction="column" align="center" justify="center" py={12} px={4} textAlign="center">
      <Text fontSize="40px" mb={3}>{msg.emoji}</Text>
      <Text fontWeight="600" fontSize="15px" color="gray.600" mb={1}>{msg.title}</Text>
      <Text fontSize="13px" color="gray.400">{msg.desc}</Text>
    </Flex>
  );
};

// ── 主组件 ─────────────────────────────────────────

const ReplyWorkbench = () => {
  const {
    activePlatformId,
    activePlatformIds,
    setActivePlatformId,
    changingMode,
    selectedIds,
    batchWorking,
    isQianniu,
    isWechat,
    isWecom,
    isJinmai,
    supportsModes,
    mode,
    allSuggestions,
    suggestions,
    pending,
    handled,
    suggestionsLoading,
    collectorHealth,
    qianniuCollectorHealth,
    wecomCollectorHealth,
    jinmaiCollectorHealth,
    refresh,
    toggleSelect,
    selectAll,
    clearSelection,
    selectPendingOnly,
    handleBatchDismissed,
    handleBatchDelete,
    handleClearHandled,
    changeMode,
    emergencyStop,
  } = useReplyWorkbench();

  // 当前选中的会话（右侧详情）
  const [activeItemId, setActiveItemId] = useState<number | null>(null);

  // 当前 tab 决定显示的列表数据
  const [tabKey, setTabKey] = useState<'all' | 'pending' | 'handled'>('all');

  const listData = useMemo(() => {
    switch (tabKey) {
      case 'pending': return pending;
      case 'handled': return handled;
      default: return suggestions;
    }
  }, [tabKey, suggestions, pending, handled]);

  // 自动选中第一条（当列表变化且当前选中不在列表中时）
  React.useEffect(() => {
    if (listData.length > 0) {
      const exists = listData.some((s) => s.id === activeItemId);
      if (!exists) {
        setActiveItemId(listData[0].id);
      }
    } else {
      setActiveItemId(null);
    }
  }, [listData]);

  const activeItem = useMemo(
    () => listData.find((s) => s.id === activeItemId) || null,
    [listData, activeItemId],
  );

  // 无平台选择 → 空态
  if (!activePlatformId) {
    return (
      <Box bg="white" borderRadius="xl" p={8} textAlign="center" boxShadow="sm" border="1px solid" borderColor="gray.100">
        <Text fontSize="40px" mb={3}>💼</Text>
        <Heading as="h3" size="md" mb={2} color="gray.700">回复工作台</Heading>
        <Text color="gray.500" fontSize="13px">请先在上方选择一个在线平台，消息和回复将在这里显示</Text>
      </Box>
    );
  }

  const platformName =
    activePlatformId === 'all'
      ? '全部平台'
      : platformLabels[activePlatformId] || activePlatformId;

  const modeHintText = (() => {
    if (!supportsModes && activePlatformId !== 'all') return `当前只显示${platformName}产生的回复`;
    if (activePlatformId === 'all') return '按时间统一显示所有在线平台回复';
    if (supportsModes && mode === 'hint') return '仅生成建议，不操作客服客户端';
    if (isQianniu && mode === 'assist') return '填入后由你在千牛确认发送';
    if (isWechat && mode === 'assist') return '定位填入后由你在微信确认发送';
    if (isWecom && mode === 'assist') return '定位填入后由你在企业微信确认发送';
    if (isJinmai && mode === 'assist') return '定位填入后由你在京麦确认发送';
    if (supportsModes && mode === 'unattended') return '自动发送回复中';
    return '';
  })();

  return (
    <Box bg="white" borderRadius="xl" p={4} boxShadow="sm" border="1px solid" borderColor="gray.100">
      {/* ── 顶部：平台 Pill 标签 ── */}
      <Flex gap={1.5} mb={4} flexWrap="wrap">
        {activePlatformIds.length > 1 && (
          <Button
            size="sm"
            colorScheme="brand"
            variant={activePlatformId === 'all' ? 'solid' : 'outline'}
            onClick={() => setActivePlatformId('all')}
            borderRadius="full"
            fontSize="12px"
            fontWeight={activePlatformId === 'all' ? 600 : 500}
            px={4}
          >
            🌐 全部{' '}
            <Badge ml={1.5} bg={activePlatformId === 'all' ? 'whiteAlpha.300' : 'gray.100'} color={activePlatformId === 'all' ? 'white' : 'gray.600'} borderRadius="full" fontSize="10px" px={1.5}>
              {allSuggestions.filter((item) => activePlatformIds.includes(item.platform_id)).length}
            </Badge>
          </Button>
        )}
        {activePlatformIds.map((platformId) => {
          const count = allSuggestions.filter((item) => item.platform_id === platformId).length;
          const isActive = activePlatformId === platformId;
          return (
            <Button
              key={platformId}
              size="sm"
              variant={isActive ? 'solid' : 'outline'}
              colorScheme={
                isActive
                  ? platformId === 'win_wechat' ? 'green'
                  : platformId === 'win_wecom' ? 'blue'
                  : platformId === 'win_jinmai' ? 'red'
                  : platformId === 'win_pdd' ? 'red'
                  : 'orange'
                  : 'gray'
              }
              onClick={() => setActivePlatformId(platformId)}
              borderRadius="full"
              fontSize="12px"
              fontWeight={isActive ? 600 : 500}
              px={4}
            >
              {platformEmoji[platformId] || ''} {platformLabels[platformId] || platformId}{' '}
              <Badge ml={1.5} bg={isActive ? 'whiteAlpha.300' : 'gray.100'} color={isActive ? 'white' : 'gray.600'} borderRadius="full" fontSize="10px" px={1.5}>
                {count}
              </Badge>
            </Button>
          );
        })}
      </Flex>

      {/* ── 标题栏 + 模式切换 ── */}
      <Flex
        justify="space-between"
        align={{ base: 'stretch', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
        gap={3}
        mb={3}
      >
        <Box>
          <Heading as="h3" size="sm" color="gray.800">
            {platformName} · 回复工作台
          </Heading>
          <Text color="gray.400" fontSize="12px" mt={0.5}>
            {modeHintText}
          </Text>
          {isWechat && collectorHealth && (
            <CollectorHealthBadge state={collectorHealth.state} lastError={collectorHealth.lastError} label="微信消息采集" />
          )}
          {isQianniu && qianniuCollectorHealth && (
            <CollectorHealthBadge
              state={qianniuCollectorHealth.state}
              lastError={qianniuCollectorHealth.lastError}
              recoveryAction={qianniuCollectorHealth.recoveryAction}
              nextRetryAt={qianniuCollectorHealth.nextRetryAt}
              label="千牛消息采集"
            />
          )}
          {isWecom && wecomCollectorHealth && (
            <CollectorHealthBadge state={wecomCollectorHealth.state} lastError={wecomCollectorHealth.lastError} label="企微消息采集" />
          )}
          {isJinmai && jinmaiCollectorHealth && (
            <CollectorHealthBadge state={jinmaiCollectorHealth.state} lastError={jinmaiCollectorHealth.lastError} label="京麦消息采集" />
          )}
        </Box>

        {supportsModes && (
          <HStack spacing={2}>
          <Flex bg="gray.100" borderRadius="xl" p="3px" gap="2px">
            {(Object.keys(modeLabels) as QianniuReplyMode[]).map((value) => {
              const isActive = mode === value;
              const colorScheme = value === 'unattended' ? 'red' : value === 'assist' ? 'green' : 'brand';
              return (
                <Button
                  key={value}
                  size="sm"
                  bg={isActive ? `${colorScheme}.500` : 'transparent'}
                  color={isActive ? 'white' : 'gray.500'}
                  onClick={() => changeMode(value)}
                  isDisabled={changingMode}
                  borderRadius="lg"
                  fontSize="12px"
                  fontWeight={isActive ? 600 : 500}
                  px={4}
                  _hover={isActive ? {} : { bg: 'gray.200', color: 'gray.700' }}
                  boxShadow={isActive ? 'md' : 'none'}
                  transition="all 0.2s"
                >
                  {value === 'hint' && '💡 '}
                  {value === 'assist' && '🤝 '}
                  {value === 'unattended' && '🤖 '}
                  {modeLabels[value]}
                </Button>
              );
            })}
          </Flex>
          {(isQianniu || isWechat) && (
            <Button
              size="sm"
              colorScheme="red"
              variant="outline"
              onClick={emergencyStop}
              isDisabled={changingMode}
              borderRadius="lg"
            >
              紧急停止
            </Button>
          )}
          </HStack>
        )}
      </Flex>

      {/* ── 无人值守警告 ── */}
      {supportsModes && mode === 'unattended' && (
        <Alert status="warning" mb={3} borderRadius="lg" variant="left-accent">
          <AlertIcon />
          <Text fontSize="13px" flex="1">无人值守已开启，AI 将自动发送回复</Text>
          <Button size="xs" colorScheme="red" variant="outline" onClick={emergencyStop} borderRadius="full">
            立即停止
          </Button>
        </Alert>
      )}

      {/* ── 批量操作栏 ── */}
      <BatchActionBar
        suggestions={suggestions}
        pending={pending}
        handled={handled}
        selectedIds={selectedIds}
        batchWorking={batchWorking}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onSelectPendingOnly={selectPendingOnly}
        onBatchDismissed={handleBatchDismissed}
        onBatchDelete={handleBatchDelete}
        onClearHandled={handleClearHandled}
      />

      {/* ── Tab 切换 + 双栏布局 ── */}
      <Flex gap={1} mb={3}>
        {(['all', 'pending', 'handled'] as const).map((key) => {
          const count = key === 'all' ? suggestions.length : key === 'pending' ? pending.length : handled.length;
          return (
            <Button
              key={key}
              size="xs"
              variant={tabKey === key ? 'solid' : 'ghost'}
              colorScheme={tabKey === key ? 'brand' : 'gray'}
              onClick={() => setTabKey(key)}
              borderRadius="lg"
              fontSize="11px"
              fontWeight={tabKey === key ? 600 : 500}
              px={3}
            >
              {key === 'all' ? '全部' : key === 'pending' ? '待回复' : '已处理'} {count}
            </Button>
          );
        })}
      </Flex>

      {/* 双栏布局：左列表 + 右详情 */}
      {suggestionsLoading ? (
        <Flex justify="center" py={8}>
          <Spinner color="brand.500" thickness="3px" />
        </Flex>
      ) : listData.length === 0 ? (
        <EmptyState tabKey={tabKey} />
      ) : (
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          gap={3}
          align="stretch"
        >
          {/* 左列：消息列表 */}
          <Box
            flex="1"
            minW={0}
            maxH={{ base: '300px', lg: 'calc(100vh - 420px)' }}
            overflowY="auto"
            pr={1}
          >
            <VStack spacing={1.5} align="stretch">
              {listData.map((item) => (
                <ConversationListItem
                  key={item.id}
                  item={item}
                  isActive={activeItemId === item.id}
                  isSelected={selectedIds.has(item.id)}
                  onClick={() => setActiveItemId(item.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </VStack>
          </Box>

          {/* 右列：会话详情 */}
          <Box
            flex="1.2"
            minW={0}
            bg="gray.50"
            borderRadius="xl"
            p={4}
            border="1px solid"
            borderColor="gray.100"
            maxH={{ base: 'none', lg: 'calc(100vh - 420px)' }}
            overflowY="auto"
          >
            {activeItem ? (
              <ConversationDetail
                item={activeItem}
                mode={mode}
                onChanged={refresh}
              />
            ) : (
              <Flex direction="column" align="center" justify="center" h="full" py={12} textAlign="center">
                <Text fontSize="36px" mb={3}>💬</Text>
                <Text fontWeight="600" fontSize="14px" color="gray.500" mb={1}>
                  选择一条消息
                </Text>
                <Text fontSize="12px" color="gray.400">
                  点击左侧列表中的消息查看详情和回复
                </Text>
              </Flex>
            )}
          </Box>
        </Flex>
      )}
    </Box>
  );
};

export default React.memo(ReplyWorkbench);
