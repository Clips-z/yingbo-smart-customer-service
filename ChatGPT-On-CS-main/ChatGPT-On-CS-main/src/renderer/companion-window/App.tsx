import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Badge,
  Box,
  Button,
  ChakraProvider,
  Flex,
  HStack,
  IconButton,
  Select,
  Spinner,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@chakra-ui/react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  FiArrowLeft,
  FiArrowRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiMessageCircle,
  FiMove,
  FiPackage,
  FiExternalLink,
  FiRefreshCw,
  FiSend,
  FiUser,
  FiX,
} from 'react-icons/fi';
import {
  fillCompanionSuggestion,
  getCompanionCollectorHealth,
  getCompanionContext,
  getCompanionTimeline,
  getQianniuSuggestions,
  getReplyMode,
  refreshQianniuCompanion,
  saveQianniuSuggestionDraft,
  setReplyMode,
} from '../common/services/platform/controller';
import {
  QianniuReplyMode,
  ReplySuggestion,
} from '../common/services/platform/platform';
import theme from '../common/styles/theme';
import '../common/App.css';
import {
  selectCompanionHistory,
  selectCompanionProduct,
  selectCompanionSuggestion,
} from './companionSelection';
import { fetchProductQAList, productPlaceholderImage } from '../common/services/knowledge/productQA';

type PlatformId = 'win_qianniu' | 'win_jinmai' | 'win_wechat' | 'win_wecom';
type TargetMode = 'follow' | PlatformId;
type DockState = {
  attached?: boolean;
  side?: 'left' | 'right';
  sideByPlatform?: Partial<Record<PlatformId, 'left' | 'right'>>;
  collapsed?: boolean;
  targetFound?: boolean;
  targetMode?: TargetMode;
  activePlatformId?: PlatformId;
};

type ReplyGenerationState = {
  state: 'generating' | 'ready' | 'discarded' | 'failed';
  platformId: PlatformId;
  contextRevision?: number;
  chatFingerprint: string;
  startedAt?: number;
  error?: string;
};

const PLATFORM: Record<PlatformId, { name: string; short: string }> = {
  win_qianniu: { name: '千牛', short: '千' },
  win_jinmai: { name: '京麦', short: '京' },
  win_wechat: { name: '微信', short: '微' },
  win_wecom: { name: '企业微信', short: '企' },
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function command(value: object) {
  window.electron?.ipcRenderer?.sendMessage('companion-command', value);
}

function CompanionSurface() {
  if (!window.electron?.ipcRenderer) {
    return (
      <Flex h="100vh" p={5} direction="column" justify="center" gap={3} bg="gray.50">
        <Text fontWeight={800} color="gray.800">伴随助手暂时无法连接桌面服务</Text>
        <Text fontSize="sm" color="gray.600">请重新加载此窗口；若问题仍然存在，请重启迎波智能客服。</Text>
        <Button size="sm" colorScheme="brand" onClick={() => window.location.reload()}>
          重新加载
        </Button>
      </Flex>
    );
  }
  return <CompanionSurfaceContent />;
}

function CompanionSurfaceContent() {
  const [dockState, setDockState] = useState<DockState>(() => {
    try {
      return (
        (window.electron.ipcRenderer.get('get-companion-state') as DockState) ||
        {}
      );
    } catch {
      return {};
    }
  });
  const [content, setContent] = useState('');
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [generation, setGeneration] = useState<ReplyGenerationState>();
  const platformId = dockState.activePlatformId || 'win_qianniu';
  const platform = PLATFORM[platformId];

  const contextQuery = useQuery(
    ['companion-context', platformId],
    () => getCompanionContext(platformId),
    { refetchInterval: 5000 },
  );
  const healthQuery = useQuery(
    ['companion-health', platformId],
    () => getCompanionCollectorHealth(platformId),
    { refetchInterval: 5000 },
  );
  const suggestionsQuery = useQuery(
    ['companion-suggestions', platformId],
    () => getQianniuSuggestions('all', platformId),
    { refetchInterval: 5000 },
  );
  const timelineQuery = useQuery(
    ['companion-timeline', platformId, contextQuery.data?.data?.conversationKey],
    () => getCompanionTimeline(platformId, 50),
    { enabled: Boolean(contextQuery.data?.data?.contactId), refetchInterval: 5000 },
  );
  const modeQuery = useQuery(
    ['companion-mode', platformId],
    () => getReplyMode(platformId),
    { refetchInterval: 5000 },
  );
  const productsQuery = useQuery(
    ['companion-products', contextQuery.data?.data?.storeId || '', contextQuery.data?.data?.productId || ''],
    () => fetchProductQAList({ shop: contextQuery.data?.data?.storeId, page: 1, pageSize: 40 }),
    { enabled: Boolean(contextQuery.data?.data?.storeId), refetchInterval: 15000 },
  );

  const context = contextQuery.data?.data;
  const health = healthQuery.data?.data as
    | { state?: string; phase?: string; lastScanDurationMs?: number }
    | undefined;
  const suggestions = useMemo(
    () => suggestionsQuery.data?.data ?? [],
    [suggestionsQuery.data?.data],
  );
  const suggestion = useMemo(
    () => selectCompanionSuggestion(context, suggestions),
    [context, suggestions],
  );
  const currentQuestionIsLink = /^https?:\/\//i.test(
    suggestion?.incoming_content?.trim() || '',
  );
  const history = useMemo(
    () => selectCompanionHistory(context, suggestions, suggestion?.id),
    [context, suggestion?.id, suggestions],
  );
  const currentProduct = useMemo(
    () => selectCompanionProduct(context, productsQuery.data?.list || []),
    [context, productsQuery.data?.list],
  );
  const mode = modeQuery.data?.data.mode || 'assist';
  const activeSuggestionRef = useRef<ReplySuggestion>();
  const contentRef = useRef('');
  const savedRef = useRef<{ id?: number; content: string }>({ content: '' });
  contentRef.current = content;

  const persist = useCallback(
    async (target: ReplySuggestion, value: string) => {
      const trimmed = value.trim();
      if (!trimmed || target.status === 'sent') return;
      if (
        savedRef.current.id === target.id &&
        savedRef.current.content === trimmed
      )
        return;
      await saveQianniuSuggestionDraft(
        target.id,
        trimmed,
        target.context_revision,
      );
      savedRef.current = { id: target.id, content: trimmed };
    },
    [],
  );

  useEffect(() => {
    const previous = activeSuggestionRef.current;
    if (previous?.id === suggestion?.id) return;
    if (previous)
      void persist(previous, contentRef.current).catch(() => undefined);
    activeSuggestionRef.current = suggestion;
    const restored = (
      suggestion?.draft_content ||
      suggestion?.reply_content ||
      ''
    ).slice(0, 300);
    savedRef.current = { id: suggestion?.id, content: restored };
    contentRef.current = restored;
    setContent(restored);
    setNotice('');
  }, [persist, suggestion]);

  useEffect(() => {
    if (!suggestion || !content.trim()) return undefined;
    const timer = window.setTimeout(() => {
      void persist(suggestion, content).catch(() =>
        setNotice('草稿暂未保存，将自动重试'),
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [content, persist, suggestion]);

  useEffect(
    () =>
      window.electron.ipcRenderer.on('companion-state', (value) => {
        setDockState((value as DockState) || {});
      }),
    [],
  );

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('broadcast', (message) => {
      const event = (message as { event?: string })?.event || '';
      const payload = (message as { data?: ReplyGenerationState })?.data;
      if (
        event === 'qianniu_reply_generation_changed' &&
        payload?.platformId === platformId
      ) {
        setGeneration(payload);
      }
      if (
        ![
          'qianniu_context_changed',
          'qianniu_suggestion_created',
          'qianniu_suggestion_updated',
          'qianniu_reply_mode_changed',
          'jinmai_reply_mode_changed',
          'jinmai_suggestion_created',
          'jinmai_suggestion_updated',
          'jinmai_collector_health_changed',
          'wechat_reply_mode_changed',
          'wecom_reply_mode_changed',
          'wechat_collector_health_changed',
          'wecom_collector_health_changed',
        ].includes(event)
      ) return;
      void Promise.all([
        contextQuery.refetch(),
        healthQuery.refetch(),
        suggestionsQuery.refetch(),
        timelineQuery.refetch(),
        modeQuery.refetch(),
      ]);
    });
    return () => unsubscribe();
  }, [contextQuery, healthQuery, modeQuery, suggestionsQuery, timelineQuery]);

  useEffect(() => {
    if (platformId === 'win_qianniu') {
      void refreshQianniuCompanion().catch(() => undefined);
    }
  }, [platformId]);

  const stable = context?.state === 'stable';
  const collectorReady =
    health?.state === 'running' &&
    (platformId !== 'win_qianniu' || health.phase === 'ready');
  const matchesLiveContext = Boolean(
    suggestion &&
    context &&
    suggestion.platform_id === platformId &&
    (suggestion.conversation_key
      ? suggestion.conversation_key === context.conversationKey
      : suggestion.sender === context.contactId),
  );
  const safeToFill =
    mode === 'assist' &&
    !currentQuestionIsLink &&
    (platformId === 'win_jinmai'
      ? Boolean(suggestion) && collectorReady
      : stable && collectorReady && matchesLiveContext);
  const attached = dockState.attached !== false;
  const collapsed = Boolean(dockState.collapsed);
  const side =
    dockState.sideByPlatform?.[platformId] || dockState.side || 'right';
  const generationMatchesContext = Boolean(
    generation &&
      context &&
      generation.contextRevision === context.contextRevision &&
      generation.chatFingerprint === context.chatFingerprint,
  );
  const pipeline = !context
    ? '等待打开客服会话'
    : !stable
      ? '正在切换客户与店铺'
      : generationMatchesContext && generation?.state === 'generating'
        ? '正在生成 AI 回复'
        : generationMatchesContext && generation?.state === 'failed'
          ? generation.error || '生成失败，可点击刷新重试'
          : !collectorReady
            ? '正在读取当前会话'
            : suggestion
              ? '回复草稿已就绪'
              : '已识别会话，等待客户新问题';

  const fill = async () => {
    if (!suggestion) {
      setNotice('尚未生成当前客户的回复，请稍候或点击刷新');
      return;
    }
    if (!content.trim()) {
      setNotice('当前回复内容为空，暂时无法填入');
      return;
    }
    if (currentQuestionIsLink) {
      setNotice('客户刚发送的是商品链接，请等待其具体问题后再回复');
      return;
    }
    if (mode !== 'assist') {
      setNotice('请先在底部切换到“辅助”模式，再点击回复');
      return;
    }
    if (!collectorReady) {
      setNotice(`${platform.name}采集仍在连接，请点击刷新后重试`);
      return;
    }
    if (!safeToFill) {
      setNotice('当前客户或会话刚刚发生变化，已阻止填入旧回复');
      return;
    }
    setWorking(true);
    setNotice('');
    try {
      await persist(suggestion, content);
      await fillCompanionSuggestion(platformId, suggestion.id, content.trim());
      setNotice(
        `已填入 ${context?.contactId || suggestion.sender} 的${platform.name}输入框`,
      );
      await suggestionsQuery.refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  const refresh = async () => {
    setNotice('');
    if (platformId === 'win_qianniu') await refreshQianniuCompanion();
    await Promise.all([
      contextQuery.refetch(),
      healthQuery.refetch(),
      suggestionsQuery.refetch(),
      timelineQuery.refetch(),
    ]);
    setNotice(`已重新读取当前${platform.name}会话`);
  };

  if (collapsed) {
    return (
      <Flex
        h="100vh"
        bg="#10252a"
        color="white"
        direction="column"
        align="center"
        py={3}
        gap={3}
      >
        <Box fontWeight="900" fontSize="12px" sx={{ WebkitAppRegion: 'drag' }}>
          YB
        </Box>
        <Badge borderRadius="full" colorScheme={stable ? 'green' : 'orange'}>
          {platform.short}
        </Badge>
        <Tooltip
          label={context?.contactId || `等待${platform.name}会话`}
          placement="left"
        >
          <Flex
            w="36px"
            h="36px"
            borderRadius="12px"
            bg="whiteAlpha.200"
            align="center"
            justify="center"
          >
            <FiUser />
          </Flex>
        </Tooltip>
        <IconButton
          mt="auto"
          aria-label="展开"
          icon={<FiChevronsLeft />}
          size="sm"
          variant="ghost"
          color="white"
          onClick={() => command({ action: 'collapse', collapsed: false })}
        />
      </Flex>
    );
  }

  return (
    <Flex
      h="100vh"
      direction="column"
      bg="#F4F6FA"
      color="#182230"
      overflow="hidden"
    >
      <Flex
        minH="58px"
        px={3}
        align="center"
        bg="#11A8B8"
        color="white"
        gap={2}
        flexShrink={0}
        sx={{ WebkitAppRegion: 'drag' }}
      >
        <Flex
          w="28px"
          h="28px"
          borderRadius="9px"
          bg="whiteAlpha.250"
          color="white"
          align="center"
          justify="center"
          fontWeight="900"
          fontSize="11px"
        >
          YB
        </Flex>
        <Box flex="1" minW={0}>
          <Text fontSize="12px" fontWeight="900" noOfLines={1}>
            {(context?.storeName || context?.storeId || platform.name) +
              (context?.accountName || context?.accountId
                ? `:${context?.accountName || context?.accountId}`
                : '')}
          </Text>
          <Text fontSize="10px" fontWeight="700" color="whiteAlpha.800" noOfLines={1}>
            {context?.contactId || '等待识别客户 ID'}
          </Text>
          <Text hidden display="none" fontSize="12px" fontWeight="900" noOfLines={1}>
            {context?.contactId || `等待识别 ${platform.name} 客户`}
          </Text>
          <Text hidden display="none" fontSize="12px" fontWeight="800">
            迎波 · {platform.name}
          </Text>
          <Text fontSize="9px" color="whiteAlpha.600" noOfLines={1}>
            {attached
              ? `${side === 'left' ? '左侧' : '右侧'}吸附并跟随`
              : '自由悬浮 · 自动识别'}{' '}
            · {dockState.targetFound ? '窗口已连接' : '等待窗口'}
          </Text>
        </Box>
        <HStack
          spacing="2px"
          p="2px"
          borderRadius="9px"
          bg="whiteAlpha.100"
          sx={{ WebkitAppRegion: 'no-drag' }}
        >
          {[
            {
              label: '吸附左侧',
              icon: <FiArrowLeft />,
              active: attached && side === 'left',
              action: () => command({ action: 'attach', side: 'left' }),
            },
            {
              label: '自由悬浮',
              icon: <FiMove />,
              active: !attached,
              action: () => command({ action: 'detach' }),
            },
            {
              label: '吸附右侧',
              icon: <FiArrowRight />,
              active: attached && side === 'right',
              action: () => command({ action: 'attach', side: 'right' }),
            },
          ].map((item) => (
            <Tooltip key={item.label} label={item.label} hasArrow>
              <IconButton
                aria-label={item.label}
                icon={item.icon}
                size="xs"
                minW="26px"
                variant="ghost"
                bg={item.active ? 'white' : 'transparent'}
                color={item.active ? '#233876' : 'whiteAlpha.700'}
                _hover={{
                  bg: item.active ? 'white' : 'whiteAlpha.200',
                  color: item.active ? '#233876' : 'white',
                }}
                onClick={item.action}
              />
            </Tooltip>
          ))}
        </HStack>
        <HStack spacing={0} sx={{ WebkitAppRegion: 'no-drag' }}>
          <IconButton
            aria-label="折叠"
            icon={<FiChevronsRight />}
            size="xs"
            variant="ghost"
            color="white"
            onClick={() => command({ action: 'collapse', collapsed: true })}
          />
          <IconButton
            aria-label="隐藏"
            icon={<FiX />}
            size="xs"
            variant="ghost"
            color="white"
            onClick={() => command({ action: 'hide' })}
          />
        </HStack>
      </Flex>

      <Box flex="1" overflowY="auto" p={3}>
        <Stack spacing={3}>
          <Flex
            bg="white"
            border="1px solid #E6EAF0"
            borderRadius="12px"
            p={2}
            align="center"
            gap={2}
          >
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg={collectorReady ? '#36D399' : '#F59E0B'}
            />
            <Select
              size="xs"
              flex="1"
              border="none"
              bg="transparent"
              value={dockState.targetMode || 'follow'}
              aria-label="伴随平台"
              onChange={(event) =>
                command({
                  action: 'target-mode',
                  targetMode: event.target.value,
                })
              }
            >
              <option value="follow">
                {attached ? '自动跟随当前平台窗口' : '自动识别当前平台（悬浮）'}
              </option>
              <option value="win_qianniu">固定跟随千牛</option>
              <option value="win_wechat">固定跟随微信</option>
              <option value="win_wecom">固定跟随企业微信</option>
            </Select>
            <Badge
              bg={collectorReady ? '#ECFDF3' : '#FFF7ED'}
              color={collectorReady ? '#027A48' : '#B54708'}
            >
              {collectorReady ? '采集就绪' : '连接中'}
            </Badge>
            <IconButton
              aria-label="刷新"
              icon={<FiRefreshCw />}
              size="xs"
              variant="ghost"
              onClick={() => void refresh()}
            />
          </Flex>

          <Box display="none" bg="white" borderRadius="14px" p={3} border="1px solid #E6EAF0">
            <Flex align="center" gap={2.5}>
              <Flex
                w="38px"
                h="38px"
                borderRadius="13px"
                bg={stable ? '#ECFDF3' : '#FFF7ED'}
                align="center"
                justify="center"
              >
                {contextQuery.isLoading ? <Spinner size="sm" /> : <FiUser />}
              </Flex>
              <Box flex="1" minW={0}>
                <HStack>
                  <Text fontSize="14px" fontWeight="900" noOfLines={1}>
                    {context?.contactId || '等待识别当前客户'}
                  </Text>
                  <Badge colorScheme={stable ? 'green' : 'orange'}>
                    {stable ? '已绑定' : '切换中'}
                  </Badge>
                </HStack>
                <Text fontSize="10px" color="#6d8386" noOfLines={1}>
                  {context
                    ? `${context.accountName || context.accountId} · ${platform.name}`
                    : `请在${platform.name}中打开一个会话`}
                </Text>
              </Box>
            </Flex>
          </Box>

          <Flex
            bg="#EEF4FF"
            border="1px solid #D8E5FF"
            borderRadius="12px"
            px={3}
            py={2}
            align="center"
            gap={2}
          >
            {!stable || !collectorReady ? <Spinner size="xs" color="#4667D9" /> : <Box w="7px" h="7px" borderRadius="full" bg="#36D399" />}
            <Box minW={0}>
              <Text fontSize="10px" fontWeight="800" color="#29469B">
                实时处理状态 · {pipeline}
              </Text>
              <Text fontSize="9px" color="#60749A" noOfLines={1}>
                切换客户会立即中止旧会话生成，只保留当前窗口的回复
              </Text>
            </Box>
          </Flex>

          {platformId === 'win_qianniu' && (
            <Box
              as="details"
              bg="white"
              borderRadius="12px"
              p={3}
              border="1px solid #E6EAF0"
            >
              <HStack as="summary" cursor="pointer">
                <FiPackage color="#4667D9" />
                <Text fontSize="11px" fontWeight="900">
                  当前咨询商品
                </Text>
              </HStack>
              <Flex mt={2} gap={2} align="center">
                {currentProduct && <Box as="img" src={productPlaceholderImage(currentProduct.name, currentProduct.hue)} w="40px" h="40px" borderRadius="8px" />}
                <Box minW={0} flex="1">
                <Text fontSize="11px" color="#667085" noOfLines={2}>
                {currentProduct?.name || context?.productTitle ||
                  (context?.productId
                    ? `商品 ID ${context.productId}`
                    : '尚未识别商品，将使用店铺知识和聊天上下文')}
                </Text>
                {currentProduct && <Text mt={1} fontSize="9px" color="#81919B">知识库 {currentProduct.qaCount} 条问答 · {currentProduct.shopName}</Text>}
                </Box>
              </Flex>
              {(currentProduct?.platformProductId || context?.productId) && (
                <Button mt={2} size="xs" leftIcon={<FiExternalLink />} onClick={() => {
                  const id = currentProduct?.platformProductId || context?.productId;
                  window.electron.ipcRenderer.sendMessage('open-external', `https://item.taobao.com/item.htm?id=${id}`);
                }}>查看商品详情</Button>
              )}
            </Box>
          )}

          {Boolean(context?.recentMessages?.length) && (
            <Box
              as="details"
              bg="white"
              borderRadius="12px"
              p={3}
              border="1px solid #E6EAF0"
            >
              <HStack as="summary" cursor="pointer" justify="space-between">
                <Text fontSize="11px" fontWeight="900">
                  最近真实对话
                </Text>
                <Badge>
                  {context?.recentMessages?.length} 段
                  {context?.recentMessagesReused ? ' · 已恢复' : ''}
                </Badge>
              </HStack>
              <Stack spacing={1.5} mt={2}>
                {context?.recentMessages?.slice(-3).map((message, index) => (
                  <Flex
                    key={`${message.direction}-${index}-${message.content}`}
                    justify={
                      message.direction === 'outgoing'
                        ? 'flex-end'
                        : 'flex-start'
                    }
                  >
                    <Box
                      maxW="88%"
                      px={2.5}
                      py={1.5}
                      borderRadius="10px"
                      bg={
                        message.direction === 'outgoing' ? '#e4f2ff' : '#f1f5f4'
                      }
                      fontSize="10px"
                    >
                      {message.content}
                    </Box>
                  </Flex>
                ))}
              </Stack>
            </Box>
          )}

          {Boolean(timelineQuery.data?.data?.length) && (
            <Box bg="white" borderRadius="12px" p={3} border="1px solid #E6EAF0">
              <Flex align="center" justify="space-between" mb={2}>
                <Text fontSize="11px" fontWeight="900">一问一答历史</Text>
                <Badge>{timelineQuery.data?.data?.length || 0} 条</Badge>
              </Flex>
              <Stack spacing={2}>
                {timelineQuery.data?.data?.slice(-5).map((item) => (
                  <Box key={item.id} border="1px solid #E8EDF1" borderRadius="9px" overflow="hidden">
                    <Box px={2} py={1.5} bg="#F7FAFC">
                      <Flex gap={1.5} align="flex-start">
                        <Badge colorScheme="blue" borderRadius="4px">问</Badge>
                        <Text flex="1" fontSize="10px" whiteSpace="pre-wrap">{item.question}</Text>
                      </Flex>
                    </Box>
                    <Box px={2} py={1.5} bg={item.state === 'sent' ? '#F1FFF4' : '#FFFDF5'}>
                      <Flex gap={1.5} align="flex-start">
                        <Badge colorScheme="orange" borderRadius="4px">答</Badge>
                        <Text flex="1" fontSize="10px" whiteSpace="pre-wrap">{item.finalAnswer || item.answer}</Text>
                      </Flex>
                      <Text mt={1} fontSize="9px" color="#84949E">
                        {item.state === 'sent' ? '已发送' : item.state === 'filled' ? '已填入' : '建议回复'}
                      </Text>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          <Box bg="white" borderRadius="10px" border="1px solid #DCE4EA" overflow="hidden">
            <Flex px={2.5} py={2} gap={2} align="flex-start" borderBottom="1px solid #E8EDF1">
              <Badge colorScheme="blue" borderRadius="4px">问</Badge>
              <Box flex="1" minW={0}>
                <Text fontSize="12px" fontWeight="700">
                  {currentQuestionIsLink
                    ? '客户发送的商品链接'
                    : suggestion?.incoming_content || '正在识别当前客户的问题…'}
                </Text>
                {currentQuestionIsLink && (
                  <Text mt={1} fontSize="10px" color="#2670C8" noOfLines={1}>
                    {suggestion?.incoming_content}
                  </Text>
                )}
                <Text mt={1} fontSize="9px" color="#8A9AA5">客户问题 · 当前会话</Text>
              </Box>
            </Flex>
            <Box
              role="button"
              tabIndex={0}
              px={2.5}
              py={2}
              cursor={safeToFill && content.trim() ? 'pointer' : 'default'}
              bg={safeToFill && content.trim() ? '#F1FFF4' : '#FAFCFD'}
              onClick={() => void fill()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') void fill();
              }}
            >
              <Flex gap={2} align="flex-start">
                <Badge colorScheme="orange" borderRadius="4px">答</Badge>
                <Box flex="1" minW={0}>
                  <Text fontSize="12px" whiteSpace="pre-wrap" color={content ? '#2D4137' : '#84949E'}>
                    {content || '正在生成对应回复…'}
                  </Text>
                  {safeToFill && content.trim() && (
                    <Text mt={1} fontSize="9px" color="#16803C">点击这条回复，直接填入当前客户输入框</Text>
                  )}
                </Box>
              </Flex>
            </Box>
            {notice && (
              <Text
                px={2.5}
                py={1.5}
                borderTop="1px solid #E8EDF1"
                bg={notice.startsWith('已填入') ? '#ECFDF3' : '#FFF7ED'}
                color={notice.startsWith('已填入') ? '#08785D' : '#B54708'}
                fontSize="10px"
                fontWeight="700"
              >
                {notice}
              </Text>
            )}
          </Box>

          <Box display="none" bg="#182230" color="white" borderRadius="14px" p={3}>
            <HStack mb={2}>
              <FiMessageCircle color="#8FA8FF" />
              <Text fontSize="10px" color="whiteAlpha.700">
                客户最新问题
              </Text>
            </HStack>
            <Text fontSize="13px">
              {suggestion?.incoming_content || '正在等待当前会话的新问题…'}
            </Text>
          </Box>

          <Box display="none" bg="white" borderRadius="14px" p={3} border="1px solid #E6EAF0">
            <Flex justify="space-between" mb={2}>
              <Text fontSize="11px" fontWeight="900">
                AI 回复草稿
              </Text>
              <Badge colorScheme={suggestion ? 'green' : 'gray'}>
                {history.length
                  ? `历史 ${history.length}`
                  : suggestion
                    ? '已保存'
                    : '等待生成'}
              </Badge>
            </Flex>
            <Textarea
              value={content}
              onClick={() => void fill()}
              onChange={(event) => setContent(event.target.value)}
              placeholder="识别到客户问题后，AI 回复会显示在这里"
              minH="120px"
              maxLength={300}
              isDisabled={!suggestion || suggestion.status === 'sent'}
            />
            <Flex mt={1} justify="space-between">
              <Text fontSize="9px" color="#849598">
                切换客户自动保存，返回时恢复
              </Text>
              <Text fontSize="9px" color="#849598">
                {content.length}/300
              </Text>
            </Flex>
            {notice && (
              <Text
                mt={2}
                fontSize="10px"
                color={notice.startsWith('已') ? '#08785d' : '#b45d29'}
              >
                {notice}
              </Text>
            )}
            {history.length > 0 && (
              <Box as="details" open mt={3} pt={2} borderTop="1px solid #E6EAF0">
                <Text as="summary" cursor="pointer" fontSize="10px" fontWeight="700" color="gray.500">
                  查看当前客户历史回复（{history.length}）
                </Text>
                <Stack mt={2} spacing={1.5}>
                  {history.map((item) => (
                    <Box key={item.id} bg="#F7F8FA" borderRadius="10px" p={2}>
                      <Text fontSize="9px" noOfLines={1}>
                        客户：{item.incoming_content}
                      </Text>
                      <Text fontSize="10px" noOfLines={2}>
                        回复：{item.draft_content || item.reply_content}
                      </Text>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Stack>
      </Box>

      <Box p={3} bg="white" borderTop="1px solid #E6EAF0">
        <Flex bg="#F1F3F7" borderRadius="10px" p="3px" mb={2} gap="3px">
          {(
            [
              ['hint', '仅人工'],
              ['assist', '辅助'],
              ['unattended', '自动'],
            ] as Array<[QianniuReplyMode, string]>
          ).map(([value, label]) => (
            <Button
              key={value}
              flex="1"
              size="xs"
              bg={mode === value ? '#182230' : 'transparent'}
              color={mode === value ? 'white' : '#667d80'}
              isDisabled={working}
              onClick={() =>
                void setReplyMode(platformId, value).then(() =>
                  modeQuery.refetch(),
                )
              }
            >
              {label}
            </Button>
          ))}
        </Flex>
        <Button
          w="full"
          display="none"
          leftIcon={<FiSend />}
          bg="#4667D9"
          color="white"
          isLoading={working}
          isDisabled={!safeToFill || !content.trim()}
          onClick={() => void fill()}
        >
          填入当前客户的{platform.name}输入框
        </Button>
        <Text mt={1.5} textAlign="center" fontSize="9px" color="#829396">
          自动模式会在识别到当前客户的新问题后直接发送；切换客户时旧草稿会自动丢弃
        </Text>
      </Box>
    </Flex>
  );
}

export default function CompanionApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <CompanionSurface />
      </ChakraProvider>
    </QueryClientProvider>
  );
}
