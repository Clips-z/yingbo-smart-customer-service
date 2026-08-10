/* eslint-disable no-void, no-nested-ternary */
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
  sendCompanionText,
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
  companionContactLabel,
  isCompanionCollectorReady,
  selectCompanionProduct,
  selectCompanionSuggestion,
} from './companionSelection';
import {
  buildCompanionConversation,
  isReadableConversationText,
} from './companionConversation';
import { fetchProductQAList, productPlaceholderImage } from '../common/services/knowledge/productQA';

type PlatformId =
  | 'win_qianniu'
  | 'win_jinmai'
  | 'win_wechat'
  | 'win_wecom'
  | 'win_pdd'
  | 'win_douyin';
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

function validQianniuStore(value?: string | null): string {
  const text = String(value || '').replace(/\s+/g, '').trim();
  if (!text || /^\d{1,8}$/.test(text) || /^qianniu-default$/i.test(text)) return '';
  if (/^(淘宝|京东|拼多多|抖音电商|微信|企业微信)$/u.test(text)) return '';
  if (!/^[\u4e00-\u9fffA-Za-z0-9_.-]+$/u.test(text)) return '';
  return text;
}

const PLATFORM: Record<PlatformId, { name: string; short: string }> = {
  win_qianniu: { name: '千牛', short: '千' },
  win_jinmai: { name: '京麦', short: '京' },
  win_wechat: { name: '微信', short: '微' },
  win_wecom: { name: '企业微信', short: '企' },
  win_pdd: { name: '拼多多', short: '拼' },
  win_douyin: { name: '抖店', short: '抖' },
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
  const [sendingProductLink, setSendingProductLink] = useState(false);
  const [generation, setGeneration] = useState<ReplyGenerationState>();
  const platformId = dockState.activePlatformId || 'win_qianniu';
  const platform = PLATFORM[platformId];

  const contextQuery = useQuery(
    ['companion-context', platformId],
    () => getCompanionContext(platformId),
    { refetchInterval: 800 },
  );
  const healthQuery = useQuery(
    ['companion-health', platformId],
    () => getCompanionCollectorHealth(platformId),
    { refetchInterval: 1500 },
  );
  const suggestionsQuery = useQuery(
    ['companion-suggestions', platformId],
    () => getQianniuSuggestions('all', platformId),
    { refetchInterval: 1500 },
  );
  const timelineQuery = useQuery(
    ['companion-timeline', platformId, contextQuery.data?.data?.conversationKey],
    () => getCompanionTimeline(platformId, 5),
    {
      enabled:
        contextQuery.data?.data?.state === 'stable' &&
        Boolean(companionContactLabel(platformId, contextQuery.data?.data?.contactId)) &&
        (platformId !== 'win_qianniu' ||
          Boolean(validQianniuStore(contextQuery.data?.data?.storeId || contextQuery.data?.data?.storeName))),
      refetchInterval: 1500,
    },
  );
  const modeQuery = useQuery(
    ['companion-mode', platformId],
    () => getReplyMode(platformId),
    { refetchInterval: 1500 },
  );
  const productsQuery = useQuery(
    ['companion-products', contextQuery.data?.data?.storeId || '', contextQuery.data?.data?.productId || ''],
    () => fetchProductQAList({ shop: contextQuery.data?.data?.storeId, page: 1, pageSize: 40 }),
    { enabled: Boolean(contextQuery.data?.data?.storeId), refetchInterval: 15000 },
  );

  const context = contextQuery.data?.data;
  const visibleStore = validQianniuStore(context?.storeName || context?.storeId);
  const recognizedContactId = companionContactLabel(platformId, context?.contactId);
  const visibleAccountId = companionContactLabel('win_qianniu', context?.accountName || context?.accountId);
  const conversationItems = useMemo(
    () =>
      buildCompanionConversation(
        context?.recentMessages,
        timelineQuery.data?.data,
        recognizedContactId,
        5,
      ),
    [context?.recentMessages, recognizedContactId, timelineQuery.data?.data],
  );
  const health = healthQuery.data?.data as
    | {
        state?: string;
        phase?: string;
        lastSuccessAt?: string;
        lastScanDurationMs?: number;
        lastError?: string;
        captureRoute?: { source?: string; state?: string; stale?: boolean; lastError?: string };
        accessibility?: {
          mode?:
            | 'probing'
            | 'uia-msaa-primary'
            | 'accessibility-partial'
            | 'clipboard-assisted'
            | 'unavailable';
          reason?: string;
        };
        officialBridge?: {
          connected?: boolean;
          runtime?: 'miniapp' | 'legacy-jssdk';
          lastHeartbeatAt?: number;
          pendingCount?: number;
          currentContact?: { securityUID?: string; bizDomain?: string; userNick?: string };
        };
      }
    | undefined;
  const captureLabel =
    platformId === 'win_qianniu'
      ? health?.officialBridge?.connected
        ? '官方身份/填入 + 按变化 OCR'
        : health?.accessibility?.mode === 'accessibility-partial'
          ? '真实对话校准 + OCR 辅助'
        : '真实对话校准 + OCR 辅助'
      : health?.captureRoute?.source || '兼容采集';
  const suggestions = useMemo(
    () => suggestionsQuery.data?.data ?? [],
    [suggestionsQuery.data?.data],
  );
  const liveQuestion = useMemo(
    () =>
      [...(context?.recentMessages || [])]
        .reverse()
        .find(
          (item) =>
            item.direction === 'incoming' &&
            isReadableConversationText(item.content),
        )
        ?.content?.trim() || '',
    [context?.recentMessages],
  );
  const suggestion = useMemo(
    () => selectCompanionSuggestion(context, suggestions, liveQuestion),
    [context, liveQuestion, suggestions],
  );
  const displayedQuestion = useMemo(
    () => liveQuestion || suggestion?.incoming_content?.trim() || '',
    [liveQuestion, suggestion?.incoming_content],
  );
  const currentQuestionIsLink = /^https?:\/\//i.test(
    displayedQuestion,
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
      // PDD/Douyin sidecars expose fill/focus but do not expose the Qianniu
      // draft persistence endpoint. Avoid a noisy 404 retry loop for them.
      if (['win_pdd', 'win_douyin'].includes(target.platform_id)) return;
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
          'pdd_reply_mode_changed',
          'pdd_suggestion_created',
          'pdd_suggestion_updated',
          'pdd_collector_health_changed',
          'douyin_reply_mode_changed',
          'douyin_suggestion_created',
          'douyin_suggestion_updated',
          'douyin_collector_health_changed',
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
  }, [
    contextQuery,
    healthQuery,
    modeQuery,
    platformId,
    suggestionsQuery,
    timelineQuery,
  ]);

  useEffect(() => {
    if (platformId === 'win_qianniu') {
      void refreshQianniuCompanion().catch(() => undefined);
    }
  }, [platformId]);

  const stable = context?.state === 'stable';
  let visibleContactId = '等待识别客户 ID';
  if (stable) visibleContactId = recognizedContactId || visibleContactId;
  else if (context) visibleContactId = '正在识别当前客户…';
  const personCentricPlatform = ['win_wechat', 'win_wecom'].includes(platformId);
  const headerPrimary = personCentricPlatform
    ? visibleContactId
    : (visibleStore || '店铺识别中') +
      (visibleAccountId ? `:${visibleAccountId}` : '');
  const headerSecondary = personCentricPlatform ? platform.name : visibleContactId;
  const questionContact =
    recognizedContactId ||
    companionContactLabel(
      platformId,
      suggestion?.contact_id || suggestion?.sender,
    ) ||
    '联系人识别中';
  const collectorReady = isCompanionCollectorReady(platformId, health);
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
    (['win_jinmai', 'win_pdd', 'win_douyin'].includes(platformId)
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
              : displayedQuestion
                ? '已识别问题，等待对应回复'
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
          label={visibleContactId || `等待${platform.name}会话`}
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
            {headerPrimary}
          </Text>
          <Text fontSize="10px" fontWeight="700" color="whiteAlpha.800" noOfLines={1}>
            {headerSecondary}
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
              <option value="win_jinmai">固定跟随京麦</option>
              <option value="win_wechat">固定跟随微信</option>
              <option value="win_wecom">固定跟随企业微信</option>
              <option value="win_pdd">固定跟随拼多多</option>
              <option value="win_douyin">固定跟随抖店</option>
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

          <Box as="details" borderRadius="10px" border="1px solid #E6EAF0" bg="#FAFCFF">
            <Text as="summary" cursor="pointer" px={3} py={2} fontSize="10px" fontWeight="800" color="#60749A">
              采集诊断 · {captureLabel} · {health?.captureRoute?.stale ? '等待新事件' : '最近有事件'}
            </Text>
            <Stack px={3} pb={2} spacing={1} fontSize="9px" color="#718096">
              <Text>采集状态：{health?.state || '未连接'} / {health?.phase || '未知'}</Text>
              {platformId === 'win_qianniu' && (
                <Text>
                  官方桥接：{health?.officialBridge?.connected ? `已连接 · ${health.officialBridge.runtime === 'miniapp' ? 'PC 小程序' : 'PCWW JSSDK'}（联系人识别和点击填入走官方接口）` : '未连接（消息变化后才调用 OCR）'}
                </Text>
              )}
              <Text>最近扫描：{health?.lastScanDurationMs ?? '-'} ms</Text>
              {(health?.lastError || health?.captureRoute?.lastError) && (
                <Text color="#B54708" noOfLines={2}>原因：{health.lastError || health.captureRoute?.lastError}</Text>
              )}
              <Text>
                {personCentricPlatform
                  ? `当前联系人/群聊：${recognizedContactId || '-'}`
                  : `当前会话：${context?.storeName || context?.storeId || '-'} · ${context?.contactId || '-'}`}
              </Text>
            </Stack>
          </Box>

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
                <Flex mt={2} gap={2}>
                <Button size="xs" leftIcon={<FiExternalLink />} onClick={() => {
                  const id = currentProduct?.platformProductId || context?.productId;
                  window.electron.ipcRenderer.sendMessage('open-external', `https://item.taobao.com/item.htm?id=${id}`);
                }}>查看详情</Button>
                <Button
                  size="xs"
                  colorScheme="blue"
                  isLoading={sendingProductLink}
                  onClick={async () => {
                    const id = currentProduct?.platformProductId || context?.productId;
                    if (!id || !context?.contactId) return;
                    setSendingProductLink(true);
                    try {
                      await sendCompanionText(
                        platformId,
                        `商品链接：https://item.taobao.com/item.htm?id=${id}`,
                        context.contactId,
                      );
                      setNotice('商品链接已发送给当前客户');
                    } catch (error) {
                      setNotice(error instanceof Error ? error.message : String(error));
                    } finally {
                      setSendingProductLink(false);
                    }
                  }}
                >一键发送链接</Button>
                </Flex>
              )}
            </Box>
          )}

          {Boolean(conversationItems.length && stable && recognizedContactId) && (
            <Box bg="white" borderRadius="12px" p={3} border="1px solid #E6EAF0">
              <Flex align="center" justify="space-between" mb={2}>
                <Box minW={0}>
                  <Text fontSize="11px" fontWeight="900">当前客户最近对话</Text>
                  <Text fontSize="9px" color="#7A8A96" noOfLines={1}>
                    {personCentricPlatform ? '联系人/群聊' : '客户 ID'}：{recognizedContactId}
                  </Text>
                </Box>
                <Badge>{conversationItems.length} 条</Badge>
              </Flex>
              <Stack spacing={1.5}>
                {conversationItems.map((item) => item.kind === 'message' ? (
                  <Flex key={item.key} justify={item.direction === 'outgoing' ? 'flex-end' : 'flex-start'}>
                    <Box
                      maxW="90%"
                      px={2.5}
                      py={1.5}
                      borderRadius="10px"
                      bg={item.direction === 'outgoing' ? '#E4F2FF' : '#F1F5F4'}
                      fontSize="10px"
                      whiteSpace="pre-wrap"
                    >
                      {item.content}
                    </Box>
                  </Flex>
                ) : (
                  <Box key={item.key} border="1px solid #E8EDF1" borderRadius="9px" overflow="hidden">
                    <Flex px={2} py={1.5} gap={1.5} bg="#F7FAFC" align="flex-start">
                      <Badge colorScheme="blue" borderRadius="4px">问</Badge>
                      <Text flex="1" fontSize="10px" whiteSpace="pre-wrap">{item.question}</Text>
                    </Flex>
                    <Flex px={2} py={1.5} gap={1.5} bg={item.state === 'sent' ? '#F1FFF4' : '#FFFDF5'} align="flex-start">
                      <Badge colorScheme="orange" borderRadius="4px">答</Badge>
                      <Text flex="1" fontSize="10px" whiteSpace="pre-wrap">{item.answer}</Text>
                    </Flex>
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
                    : displayedQuestion || '正在识别当前客户的问题…'}
                </Text>
                {currentQuestionIsLink && (
                  <Text mt={1} fontSize="10px" color="#2670C8" noOfLines={1}>
                    {displayedQuestion}
                  </Text>
                )}
                <Text mt={1} fontSize="9px" color="#8A9AA5" noOfLines={1}>
                  {personCentricPlatform
                    ? `来自：${questionContact}`
                    : `客户问题 · ${questionContact}`}
                </Text>
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
