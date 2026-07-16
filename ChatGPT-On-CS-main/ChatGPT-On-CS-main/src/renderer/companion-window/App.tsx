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
  FiChevronsLeft,
  FiChevronsRight,
  FiLink,
  FiLink2,
  FiMessageCircle,
  FiPackage,
  FiRefreshCw,
  FiSend,
  FiUser,
  FiX,
} from 'react-icons/fi';
import {
  fillCompanionSuggestion,
  getCompanionCollectorHealth,
  getCompanionContext,
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
  selectCompanionSuggestion,
} from './companionSelection';

type PlatformId = 'win_qianniu' | 'win_wechat' | 'win_wecom';
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

const PLATFORM: Record<PlatformId, { name: string; short: string }> = {
  win_qianniu: { name: '千牛', short: '千' },
  win_wechat: { name: '微信', short: '微' },
  win_wecom: { name: '企业微信', short: '企' },
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function command(value: object) {
  window.electron.ipcRenderer.sendMessage('companion-command', value);
}

function CompanionSurface() {
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
  const platformId = dockState.activePlatformId || 'win_qianniu';
  const platform = PLATFORM[platformId];

  const contextQuery = useQuery(
    ['companion-context', platformId],
    () => getCompanionContext(platformId),
    { refetchInterval: 1000 },
  );
  const healthQuery = useQuery(
    ['companion-health', platformId],
    () => getCompanionCollectorHealth(platformId),
    { refetchInterval: 2000 },
  );
  const suggestionsQuery = useQuery(
    ['companion-suggestions', platformId],
    () => getQianniuSuggestions('all', platformId),
    { refetchInterval: 1500 },
  );
  const modeQuery = useQuery(
    ['companion-mode', platformId],
    () => getReplyMode(platformId),
    { refetchInterval: 4000 },
  );

  const context = contextQuery.data?.data;
  const health = healthQuery.data?.data as
    | { state?: string; phase?: string; lastScanDurationMs?: number }
    | undefined;
  const suggestions = suggestionsQuery.data?.data || [];
  const suggestion = useMemo(
    () => selectCompanionSuggestion(context, suggestions),
    [context, suggestions],
  );
  const history = useMemo(
    () => selectCompanionHistory(context, suggestions, suggestion?.id),
    [context, suggestion?.id, suggestions],
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

  const stable = context?.state === 'stable';
  const collectorReady =
    health?.state === 'running' &&
    (platformId !== 'win_qianniu' || health.phase === 'ready');
  const matchesLiveContext = Boolean(
    suggestion &&
    context &&
    suggestion.platform_id === platformId &&
    (suggestion.context_revision == null ||
      suggestion.context_revision === context.contextRevision) &&
    (suggestion.conversation_key
      ? suggestion.conversation_key === context.conversationKey
      : suggestion.sender === context.contactId),
  );
  const safeToFill =
    stable && collectorReady && matchesLiveContext && mode === 'assist';
  const attached = dockState.attached !== false;
  const collapsed = Boolean(dockState.collapsed);
  const side =
    dockState.sideByPlatform?.[platformId] || dockState.side || 'right';

  const fill = async () => {
    if (!suggestion || !content.trim() || !safeToFill) return;
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
      bg="#edf3f2"
      color="#173238"
      overflow="hidden"
    >
      <Flex
        h="50px"
        px={3}
        align="center"
        bg="#10252a"
        color="white"
        gap={2}
        flexShrink={0}
        sx={{ WebkitAppRegion: 'drag' }}
      >
        <Flex
          w="28px"
          h="28px"
          borderRadius="9px"
          bg="#2dd4a2"
          color="#0d2927"
          align="center"
          justify="center"
          fontWeight="900"
          fontSize="11px"
        >
          YB
        </Flex>
        <Box flex="1" minW={0}>
          <Text fontSize="12px" fontWeight="800">
            迎波 · {platform.name}伴随面板
          </Text>
          <Text fontSize="9px" color="whiteAlpha.600" noOfLines={1}>
            {attached
              ? `已吸附${side === 'left' ? '左侧' : '右侧'}`
              : '自由悬浮'}{' '}
            · {dockState.targetFound ? '窗口已连接' : '等待窗口'}
          </Text>
        </Box>
        <HStack spacing={0} sx={{ WebkitAppRegion: 'no-drag' }}>
          <IconButton
            aria-label="吸附"
            icon={attached ? <FiLink /> : <FiLink2 />}
            size="xs"
            variant="ghost"
            color="white"
            onClick={() =>
              command(
                attached ? { action: 'detach' } : { action: 'attach', side },
              )
            }
          />
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
            borderRadius="14px"
            p={2.5}
            border="1px solid #dbe7e5"
            gap={2}
            align="center"
          >
            <Select
              size="sm"
              value={dockState.targetMode || 'follow'}
              onChange={(event) =>
                command({
                  action: 'target-mode',
                  targetMode: event.target.value,
                })
              }
            >
              <option value="follow">自动跟随前台平台</option>
              <option value="win_qianniu">锁定千牛</option>
              <option value="win_wechat">锁定微信</option>
              <option value="win_wecom">锁定企业微信</option>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                command({
                  action: 'side',
                  side: side === 'left' ? 'right' : 'left',
                })
              }
            >
              {side === 'left' ? '移到右侧' : '移到左侧'}
            </Button>
          </Flex>

          <Flex
            bg={collectorReady ? '#e5f7f1' : '#fff7e8'}
            borderRadius="12px"
            px={3}
            py={2}
            align="center"
            gap={2}
          >
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg={collectorReady ? '#20a982' : '#d9a441'}
            />
            <Text flex="1" fontSize="10px">
              {collectorReady
                ? `${platform.name}采集已就绪`
                : `正在连接并识别${platform.name}`}
            </Text>
            <IconButton
              aria-label="刷新"
              icon={<FiRefreshCw />}
              size="xs"
              variant="ghost"
              onClick={() => void refresh()}
            />
          </Flex>

          <Box bg="white" borderRadius="16px" p={3} border="1px solid #dbe7e5">
            <Flex align="center" gap={2.5}>
              <Flex
                w="38px"
                h="38px"
                borderRadius="13px"
                bg={stable ? '#d8f8ee' : '#fff1dc'}
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

          {platformId === 'win_qianniu' && (
            <Box
              bg="white"
              borderRadius="16px"
              p={3}
              border="1px solid #dbe7e5"
            >
              <HStack mb={1}>
                <FiPackage color="#0f8b70" />
                <Text fontSize="11px" fontWeight="900">
                  当前咨询商品
                </Text>
              </HStack>
              <Text fontSize="11px" color="#61777a">
                {context?.productTitle ||
                  (context?.productId
                    ? `商品 ID ${context.productId}`
                    : '尚未识别商品，将使用店铺知识和聊天上下文')}
              </Text>
            </Box>
          )}

          {Boolean(context?.recentMessages?.length) && (
            <Box
              bg="white"
              borderRadius="16px"
              p={3}
              border="1px solid #dbe7e5"
            >
              <HStack justify="space-between" mb={2}>
                <Text fontSize="11px" fontWeight="900">
                  最近真实对话
                </Text>
                <Badge>
                  {context?.recentMessages?.length} 段
                  {context?.recentMessagesReused ? ' · 已恢复' : ''}
                </Badge>
              </HStack>
              <Stack spacing={1.5}>
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

          <Box bg="#17383d" color="white" borderRadius="16px" p={3}>
            <HStack mb={2}>
              <FiMessageCircle color="#5ce1b6" />
              <Text fontSize="10px" color="whiteAlpha.700">
                客户最新问题
              </Text>
            </HStack>
            <Text fontSize="13px">
              {suggestion?.incoming_content || '正在等待当前会话的新问题…'}
            </Text>
          </Box>

          <Box bg="white" borderRadius="16px" p={3} border="1px solid #dbe7e5">
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
              <Stack mt={3} pt={2} borderTop="1px solid #e1ebe9" spacing={1.5}>
                {history.map((item) => (
                  <Box key={item.id} bg="#f3f7f6" borderRadius="10px" p={2}>
                    <Text fontSize="9px" noOfLines={1}>
                      客户：{item.incoming_content}
                    </Text>
                    <Text fontSize="10px" noOfLines={2}>
                      回复：{item.draft_content || item.reply_content}
                    </Text>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>

      <Box p={3} bg="white" borderTop="1px solid #dbe7e5">
        <Flex bg="#edf3f2" borderRadius="12px" p="3px" mb={2} gap="3px">
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
              bg={mode === value ? '#17383d' : 'transparent'}
              color={mode === value ? 'white' : '#667d80'}
              isDisabled={working || value === 'unattended'}
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
          leftIcon={<FiSend />}
          bg="#20a982"
          color="white"
          isLoading={working}
          isDisabled={!safeToFill || !content.trim()}
          onClick={() => void fill()}
        >
          填入当前客户的{platform.name}输入框
        </Button>
        <Text mt={1.5} textAlign="center" fontSize="9px" color="#829396">
          辅助模式只填入，不会自动发送；会话不匹配时自动禁用
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
