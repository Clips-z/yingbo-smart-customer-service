import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  ChakraProvider,
  Flex,
  HStack,
  IconButton,
  Image,
  Spinner,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@chakra-ui/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiLink,
  FiLink2,
  FiMessageCircle,
  FiPackage,
  FiSend,
  FiUser,
  FiX,
} from 'react-icons/fi';
import {
  fillQianniuSuggestion,
  getQianniuCompanionContext,
  getQianniuSuggestions,
  getReplyMode,
  saveQianniuSuggestionDraft,
  setReplyMode,
} from '../common/services/platform/controller';
import {
  QianniuReplyMode,
  ReplySuggestion,
} from '../common/services/platform/platform';
import {
  fetchProductQAList,
  productPlaceholderImage,
} from '../common/services/knowledge/productQA';
import theme from '../common/styles/theme';
import '../common/App.css';
import {
  selectCompanionProduct,
  selectCompanionSuggestion,
} from './companionSelection';

type DockState = {
  attached?: boolean;
  side?: 'left' | 'right';
  collapsed?: boolean;
  targetFound?: boolean;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
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

  const contextQuery = useQuery(
    ['qianniu-companion-context'],
    getQianniuCompanionContext,
    { refetchInterval: 1200 },
  );
  const suggestionsQuery = useQuery(
    ['qianniu-companion-suggestions'],
    () => getQianniuSuggestions('all', 'win_qianniu'),
    { refetchInterval: 2000 },
  );
  const modeQuery = useQuery(
    ['qianniu-companion-mode'],
    () => getReplyMode('win_qianniu'),
    { refetchInterval: 5000 },
  );
  const productQuery = useQuery(
    ['qianniu-companion-product', contextQuery.data?.data?.productId],
    () =>
      fetchProductQAList({
        keyword: contextQuery.data?.data?.productId || '',
        status: 'on',
        page: 1,
        pageSize: 10,
      }),
    { enabled: Boolean(contextQuery.data?.data?.productId), staleTime: 30_000 },
  );

  const context = contextQuery.data?.data;
  const suggestions = suggestionsQuery.data?.data || [];
  const suggestion = useMemo(
    () => selectCompanionSuggestion(context, suggestions),
    [context, suggestions],
  );
  const conversationHistory = useMemo(
    () =>
      context?.conversationKey
        ? suggestions.filter(
            (item) =>
              item.conversation_key === context.conversationKey &&
              item.id !== suggestion?.id,
          )
        : [],
    [context?.conversationKey, suggestion?.id, suggestions],
  );
  const mode = modeQuery.data?.data.mode || 'assist';
  const matchedProduct = useMemo(
    () => selectCompanionProduct(context, productQuery.data?.list || []),
    [context, productQuery.data?.list],
  );

  const activeSuggestionRef = useRef<ReplySuggestion | undefined>(suggestion);
  const contentRef = useRef(content);
  const savedRef = useRef<{ id?: number; content: string }>({ content: '' });
  contentRef.current = content;

  const persist = useCallback(async (target: ReplySuggestion, value: string) => {
    const trimmed = value.trim();
    if (
      !trimmed ||
      target.status === 'sent' ||
      (savedRef.current.id === target.id && savedRef.current.content === trimmed)
    ) {
      return;
    }
    await saveQianniuSuggestionDraft(
      target.id,
      trimmed,
      target.context_revision,
    );
    savedRef.current = { id: target.id, content: trimmed };
  }, []);

  useEffect(() => {
    const previous = activeSuggestionRef.current;
    if (previous?.id === suggestion?.id) return;
    if (previous) void persist(previous, contentRef.current).catch(() => undefined);
    activeSuggestionRef.current = suggestion;
    const restored = (suggestion?.draft_content || suggestion?.reply_content || '').slice(
      0,
      300,
    );
    savedRef.current = { id: suggestion?.id, content: restored };
    contentRef.current = restored;
    setContent(restored);
    setNotice('');
  }, [persist, suggestion]);

  useEffect(() => {
    if (!suggestion || !content.trim()) return undefined;
    const timer = window.setTimeout(() => {
      void persist(suggestion, content).catch(() =>
        setNotice('草稿暂未保存，将在切换前重试'),
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [content, persist, suggestion]);

  useEffect(
    () => () => {
      const current = activeSuggestionRef.current;
      if (current) void persist(current, contentRef.current).catch(() => undefined);
    },
    [persist],
  );

  useEffect(
    () =>
      window.electron.ipcRenderer.on('companion-state', (value) => {
        setDockState((value as DockState) || {});
      }),
    [],
  );

  const changeMode = async (nextMode: QianniuReplyMode) => {
    if (nextMode === 'unattended') return;
    setWorking(true);
    try {
      await setReplyMode('win_qianniu', nextMode);
      await modeQuery.refetch();
    } finally {
      setWorking(false);
    }
  };

  const fill = async () => {
    if (!suggestion || !content.trim() || mode !== 'assist') return;
    setWorking(true);
    setNotice('');
    try {
      await persist(suggestion, content);
      await fillQianniuSuggestion(suggestion.id, content.trim());
      setNotice(`已填入 ${context?.contactId || suggestion.sender} 的千牛输入框`);
      await suggestionsQuery.refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  const attached = dockState.attached !== false;
  const collapsed = Boolean(dockState.collapsed);

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
        borderLeft="1px solid rgba(255,255,255,.12)"
      >
        <Box
          fontWeight="900"
          fontSize="13px"
          letterSpacing=".08em"
          sx={{ WebkitAppRegion: 'drag' }}
        >
          YB
        </Box>
        <Box w="8px" h="8px" borderRadius="full" bg={context ? '#32d6a0' : '#f6ad55'} />
        <Tooltip label={context?.contactId || '等待客户'} placement="left">
          <Flex w="36px" h="36px" borderRadius="12px" bg="whiteAlpha.200" align="center" justify="center">
            <FiUser />
          </Flex>
        </Tooltip>
        <Tooltip label="展开伴随面板" placement="left">
          <IconButton
            mt="auto"
            aria-label="展开"
            icon={<FiChevronsLeft />}
            size="sm"
            variant="ghost"
            color="white"
            onClick={() => command({ action: 'collapse', collapsed: false })}
          />
        </Tooltip>
      </Flex>
    );
  }

  const stable = context?.state === 'stable';
  const waiting = contextQuery.isLoading || context?.state === 'switching';

  return (
    <Flex h="100vh" direction="column" bg="#edf3f2" color="#173238" overflow="hidden">
      <Flex
        h="48px"
        px={3}
        align="center"
        bg="#10252a"
        color="white"
        gap={2}
        flexShrink={0}
        sx={{ WebkitAppRegion: 'drag' }}
      >
        <Flex w="28px" h="28px" borderRadius="9px" bg="#2dd4a2" color="#0d2927" align="center" justify="center" fontWeight="900" fontSize="11px">
          YB
        </Flex>
        <Box flex="1" minW={0}>
          <Text fontSize="12px" fontWeight="800" letterSpacing=".04em">迎波 · 当前接待</Text>
          <Text fontSize="9px" color="whiteAlpha.600" noOfLines={1}>
            {attached ? `已吸附千牛${dockState.side === 'left' ? '左侧' : '右侧'}` : '自由悬浮'}
          </Text>
        </Box>
        <HStack spacing={0} sx={{ WebkitAppRegion: 'no-drag' }}>
          <Tooltip label={attached ? '取消吸附' : '吸附千牛'}>
            <IconButton
              aria-label="吸附"
              icon={attached ? <FiLink /> : <FiLink2 />}
              size="xs"
              variant="ghost"
              color="whiteAlpha.800"
              onClick={() => command(attached ? { action: 'detach' } : { action: 'attach', side: 'right' })}
            />
          </Tooltip>
          <Tooltip label="折叠">
            <IconButton
              aria-label="折叠"
              icon={<FiChevronsRight />}
              size="xs"
              variant="ghost"
              color="whiteAlpha.800"
              onClick={() => command({ action: 'collapse', collapsed: true })}
            />
          </Tooltip>
          <Tooltip label="隐藏">
            <IconButton
              aria-label="隐藏"
              icon={<FiX />}
              size="xs"
              variant="ghost"
              color="whiteAlpha.800"
              onClick={() => command({ action: 'hide' })}
            />
          </Tooltip>
        </HStack>
      </Flex>

      <Box flex="1" overflowY="auto" p={3}>
        <Stack spacing={3}>
          <Box bg="white" borderRadius="16px" p={3} boxShadow="0 8px 24px rgba(25,55,58,.06)" border="1px solid #dbe7e5">
            <Flex align="center" gap={2.5}>
              <Flex w="38px" h="38px" borderRadius="13px" bg={stable ? '#d8f8ee' : '#fff1dc'} color={stable ? '#08785d' : '#9c5b09'} align="center" justify="center">
                {waiting ? <Spinner size="sm" /> : <FiUser />}
              </Flex>
              <Box flex="1" minW={0}>
                <HStack spacing={1.5}>
                  <Text fontSize="14px" fontWeight="900" noOfLines={1}>
                    {context?.contactId || '等待识别当前客户'}
                  </Text>
                  <Badge bg={stable ? '#d8f8ee' : '#fff1dc'} color={stable ? '#08785d' : '#9c5b09'} borderRadius="full" fontSize="9px">
                    {stable ? '已绑定' : waiting ? '切换中' : '未连接'}
                  </Badge>
                </HStack>
                <Text mt={0.5} fontSize="10px" color="#6d8386" noOfLines={1}>
                  {context ? `${context.storeId} · ${context.accountId}` : '打开千牛并进入一个买家会话'}
                </Text>
              </Box>
            </Flex>
          </Box>

          {!stable ? (
            <Alert status="warning" borderRadius="14px" bg="#fff7e8" border="1px solid #f4ddb5">
              <AlertIcon />
              <Box>
                <Text fontSize="12px" fontWeight="800">正在确认接待对象</Text>
                <Text fontSize="10px" color="#7a6546">身份稳定前不会填入或发送任何回复。</Text>
              </Box>
            </Alert>
          ) : (
            <>
              <Box bg="white" borderRadius="16px" p={3} border="1px solid #dbe7e5">
                <Flex align="center" justify="space-between" mb={2}>
                  <HStack spacing={1.5}><FiPackage color="#0f8b70" /><Text fontSize="11px" fontWeight="900">当前咨询商品</Text></HStack>
                  <Badge variant="subtle" colorScheme={context.productId ? 'green' : 'gray'} fontSize="9px">
                    {context.productId ? '已识别' : '待识别'}
                  </Badge>
                </Flex>
                {context.productId ? (
                  <Flex gap={2.5} align="center">
                    <Image
                      src={productPlaceholderImage(
                        matchedProduct?.name || context.productTitle || '商品',
                        matchedProduct?.hue || 168,
                      )}
                      boxSize="52px"
                      borderRadius="12px"
                      objectFit="cover"
                    />
                    <Box minW={0} flex="1">
                      <Text fontSize="12px" fontWeight="800" noOfLines={2}>
                        {matchedProduct?.name || context.productTitle || `商品 ${context.productId}`}
                      </Text>
                      <Text fontSize="9px" color="#789092" mt={1}>ID {context.productId}</Text>
                      <HStack spacing={1} mt={1}>
                        <Badge colorScheme={matchedProduct ? 'green' : 'orange'} fontSize="8px">
                          {matchedProduct ? `知识 ${matchedProduct.qaCount} 条` : '知识待绑定'}
                        </Badge>
                        {matchedProduct?.syncStatus && (
                          <Badge colorScheme={matchedProduct.syncStatus === 'synced' ? 'teal' : 'gray'} fontSize="8px">
                            {matchedProduct.syncStatus === 'synced' ? 'RAG已同步' : '待同步'}
                          </Badge>
                        )}
                      </HStack>
                    </Box>
                  </Flex>
                ) : (
                  <Text fontSize="12px" color="#86989a">
                    尚未识别商品，回复只使用店铺知识和聊天上下文。
                  </Text>
                )}
              </Box>

              <Box bg="#17383d" color="white" borderRadius="16px" p={3} boxShadow="0 10px 28px rgba(16,45,49,.16)">
                <HStack spacing={1.5} mb={2}><FiMessageCircle color="#5ce1b6" /><Text fontSize="10px" fontWeight="800" color="whiteAlpha.700">买家最新问题</Text></HStack>
                <Text fontSize="13px" lineHeight="1.65">
                  {suggestion?.incoming_content || '正在等待当前会话的新问题…'}
                </Text>
              </Box>

              <Box bg="white" borderRadius="16px" p={3} border="1px solid #dbe7e5">
                <Flex justify="space-between" align="center" mb={2}>
                  <Text fontSize="11px" fontWeight="900">AI 回复草稿</Text>
                  <HStack spacing={1}>
                    {conversationHistory.length > 0 && <Badge colorScheme="orange" fontSize="9px">历史 {conversationHistory.length}</Badge>}
                    <Badge colorScheme={suggestion ? 'green' : 'gray'} fontSize="9px">{suggestion ? '已保存' : '等待生成'}</Badge>
                  </HStack>
                </Flex>
                <Textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="识别到客户问题后，AI回复会显示在这里"
                  minH="126px"
                  maxLength={300}
                  resize="vertical"
                  bg="#f7faf9"
                  borderColor="#d6e4e2"
                  fontSize="13px"
                  lineHeight="1.65"
                  isDisabled={!suggestion || suggestion.status === 'sent'}
                  _focus={{ borderColor: '#20a982', boxShadow: '0 0 0 1px #20a982' }}
                />
                <Flex mt={1.5} justify="space-between">
                  <Text fontSize="9px" color="#849598">切换客户后自动保存，返回时恢复</Text>
                  <Text fontSize="9px" color="#849598">{content.length}/300</Text>
                </Flex>
                {notice && <Text mt={2} fontSize="10px" color={notice.startsWith('已填入') ? '#08785d' : '#b45d29'}>{notice}</Text>}
              </Box>
            </>
          )}
        </Stack>
      </Box>

      <Box p={3} pt={2} bg="white" borderTop="1px solid #dbe7e5" flexShrink={0}>
        <Flex bg="#edf3f2" borderRadius="12px" p="3px" mb={2} gap="3px">
          {([
            ['hint', '仅人工'],
            ['assist', '辅助'],
            ['unattended', '自动'],
          ] as Array<[QianniuReplyMode, string]>).map(([value, label]) => (
            <Button
              key={value}
              flex="1"
              size="xs"
              borderRadius="9px"
              bg={mode === value ? (value === 'assist' ? '#17383d' : '#c7792c') : 'transparent'}
              color={mode === value ? 'white' : '#667d80'}
              isDisabled={working || value === 'unattended'}
              onClick={() => void changeMode(value)}
              fontSize="10px"
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
          _hover={{ bg: '#16896b' }}
          borderRadius="12px"
          size="sm"
          isLoading={working}
          isDisabled={!stable || !suggestion || !content.trim() || mode !== 'assist'}
          onClick={() => void fill()}
        >
          填入当前客户的千牛输入框
        </Button>
        <Text mt={1.5} textAlign="center" fontSize="9px" color="#829396">
          辅助模式只填入，不会自动发送
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
