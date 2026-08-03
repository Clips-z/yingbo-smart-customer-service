import React, { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Flex,
  HStack,
  IconButton,
  Spinner,
  Stack,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  FiArrowLeft,
  FiLink,
  FiMaximize2,
  FiMessageCircle,
  FiMove,
  FiRefreshCw,
} from 'react-icons/fi';
import {
  getPlatformList,
  getQianniuSuggestions,
  getTasks,
  focusReplySuggestion,
} from '../../common/services/platform/controller';
import {
  App,
  Instance,
  ReplySuggestion,
} from '../../common/services/platform/platform';

type CompactTab = 'reception' | 'accounts';
type ReceptionFilter = 'pending' | 'handled';

const PLATFORM_META: Record<
  string,
  { name: string; mark: string; color: string; soft: string }
> = {
  win_qianniu: { name: '淘宝', mark: '淘', color: '#FF6A00', soft: '#FFF3E8' },
  win_jinmai: { name: '京东', mark: '京', color: '#E1251B', soft: '#FFF0EF' },
  win_pdd: { name: '拼多多', mark: '拼', color: '#E02E24', soft: '#FFF0EF' },
  win_douyin: { name: '抖店', mark: '抖', color: '#161823', soft: '#F1F2F4' },
  win_wechat: { name: '微信', mark: '微', color: '#07C160', soft: '#EBFFF3' },
  win_wecom: { name: '企微', mark: '企', color: '#2B7CFF', soft: '#EEF5FF' },
};

function meta(platformId: string) {
  return (
    PLATFORM_META[platformId] || {
      name: platformId,
      mark: '客',
      color: '#4667D9',
      soft: '#EEF2FF',
    }
  );
}

function ageLabel(value: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds || 1}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function restoreFull(section?: 'service' | 'platforms') {
  if (section) {
    (window as any).__navigateTo?.(
      section,
      undefined,
      section === 'service' ? 'pending' : undefined,
    );
  }
  window.electron.ipcRenderer.sendMessage('main-window-command', {
    action: 'restore',
  });
}

function ReceptionList({
  suggestions,
  loading,
}: {
  suggestions: ReplySuggestion[];
  loading: boolean;
}) {
  const [filter, setFilter] = useState<ReceptionFilter>('pending');
  const [focusingId, setFocusingId] = useState<number>();
  const [focusNotice, setFocusNotice] = useState<{
    ok: boolean;
    text: string;
  }>();
  const rows = useMemo(
    () =>
      suggestions
        .filter((item) =>
          filter === 'pending'
            ? ['pending', 'failed'].includes(item.status)
            : !['pending', 'failed'].includes(item.status),
        )
        .sort(
          (left, right) =>
            new Date(right.created_at).getTime() -
            new Date(left.created_at).getTime(),
        )
        .slice(0, 60),
    [filter, suggestions],
  );

  const pendingCount = suggestions.filter((item) =>
    ['pending', 'failed'].includes(item.status),
  ).length;
  const focusCustomer = async (item: ReplySuggestion) => {
    if (focusingId) return;
    setFocusingId(item.id);
    setFocusNotice(undefined);
    try {
      await focusReplySuggestion(item.id);
      setFocusNotice({
        ok: true,
        text: `已切换到 ${item.contact_id || item.sender}，输入框已聚焦`,
      });
    } catch (error) {
      setFocusNotice({
        ok: false,
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setFocusingId(undefined);
    }
  };

  return (
    <Flex direction="column" minH={0} flex="1">
      <Flex
        h="42px"
        px={3}
        align="flex-end"
        gap={5}
        borderBottom="1px solid #E7EBF1"
        bg="white"
      >
        {(
          [
            ['pending', `待回复 ${pendingCount}`],
            ['handled', '已回复'],
          ] as Array<[ReceptionFilter, string]>
        ).map(([value, label]) => (
          <Box
            key={value}
            as="button"
            h="42px"
            borderBottom="2px solid"
            borderColor={filter === value ? '#2774FF' : 'transparent'}
            color={filter === value ? '#1F66D8' : '#667085'}
            fontSize="12px"
            fontWeight={filter === value ? '800' : '600'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Box>
        ))}
      </Flex>
      {focusNotice && (
        <Flex
          mx={2}
          mt={2}
          px={2.5}
          py={2}
          borderRadius="9px"
          bg={focusNotice.ok ? '#ECFDF3' : '#FFF4ED'}
          color={focusNotice.ok ? '#08785D' : '#B54708'}
          fontSize="10px"
          fontWeight="700"
        >
          {focusNotice.text}
        </Flex>
      )}
      <Box flex="1" minH={0} overflowY="auto" bg="#F7F8FA" py={1.5}>
        {loading ? (
          <Flex h="160px" align="center" justify="center">
            <Spinner size="sm" color="#2774FF" />
          </Flex>
        ) : rows.length === 0 ? (
          <Flex h="180px" direction="column" align="center" justify="center">
            <FiMessageCircle color="#AAB4C3" size={24} />
            <Text mt={2} fontSize="12px" color="#7A8798">
              {filter === 'pending' ? '当前没有待回复客户' : '还没有已处理记录'}
            </Text>
          </Flex>
        ) : (
          <Stack spacing={1.5} px={1.5}>
            {rows.map((item) => {
              const platform = meta(item.platform_id);
              const failed = item.status === 'failed';
              return (
                <Flex
                  key={item.id}
                  as="button"
                  type="button"
                  w="full"
                  minH="62px"
                  p={2}
                  gap={2.5}
                  align="center"
                  textAlign="left"
                  borderRadius="10px"
                  bg={failed ? '#FFF7ED' : 'white'}
                  border="1px solid"
                  borderColor={failed ? '#FED7AA' : '#EDF0F4'}
                  _hover={{ borderColor: '#B9CCFF', bg: '#F2F6FF' }}
                  cursor={focusingId ? 'wait' : 'pointer'}
                  opacity={focusingId && focusingId !== item.id ? 0.65 : 1}
                  onClick={() => void focusCustomer(item)}
                >
                  <Flex
                    w="32px"
                    h="32px"
                    flexShrink={0}
                    align="center"
                    justify="center"
                    borderRadius="full"
                    bg={platform.color}
                    color="white"
                    fontSize="12px"
                    fontWeight="900"
                  >
                    {platform.mark}
                  </Flex>
                  <Box flex="1" minW={0}>
                    <Text
                      fontSize="12px"
                      fontWeight="800"
                      color={platform.color}
                      noOfLines={1}
                    >
                      {item.store_id || item.store || platform.name}
                    </Text>
                    <Text fontSize="11px" color="#344054" noOfLines={1}>
                      {item.contact_id || item.sender}
                    </Text>
                    <Text fontSize="10px" color="#8A94A3" noOfLines={1}>
                      “{item.incoming_content || '等待客户消息'}”
                    </Text>
                  </Box>
                  {focusingId === item.id ? (
                    <Spinner size="xs" color="#2774FF" />
                  ) : (
                    <Text
                      alignSelf="flex-start"
                      pt={0.5}
                      fontSize="10px"
                      color={failed ? '#D92D20' : '#667085'}
                      fontWeight="800"
                    >
                      {ageLabel(item.created_at)}
                    </Text>
                  )}
                </Flex>
              );
            })}
          </Stack>
        )}
      </Box>
    </Flex>
  );
}

function AccountList({
  apps,
  instances,
  loading,
}: {
  apps: App[];
  instances: Instance[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Flex flex="1" align="center" justify="center">
        <Spinner size="sm" color="#2774FF" />
      </Flex>
    );
  }

  return (
    <Box flex="1" minH={0} overflowY="auto" bg="#F7F8FA" py={2}>
      <Stack spacing={2} px={2}>
        {apps.map((app) => {
          const platform = meta(app.id);
          const accounts = instances.filter(
            (instance) => instance.app_id === app.id,
          );
          return (
            <Box
              key={app.id}
              bg="white"
              border="1px solid #E7EBF1"
              borderRadius="11px"
              overflow="hidden"
            >
              <Flex px={2.5} h="38px" align="center" gap={2}>
                <Flex
                  w="22px"
                  h="22px"
                  align="center"
                  justify="center"
                  borderRadius="full"
                  bg={platform.color}
                  color="white"
                  fontSize="9px"
                  fontWeight="900"
                >
                  {platform.mark}
                </Flex>
                <Text flex="1" fontSize="12px" fontWeight="800">
                  {platform.name}（{accounts.length}）
                </Text>
                <Badge
                  fontSize="9px"
                  colorScheme={app.running ? 'green' : 'gray'}
                  borderRadius="full"
                >
                  {app.running ? '已连接' : '未启动'}
                </Badge>
              </Flex>
              {accounts.length > 0 ? (
                <Stack spacing={0} borderTop="1px solid #EDF0F4">
                  {accounts.map((instance) => (
                    <Flex
                      key={instance.task_id}
                      as="button"
                      type="button"
                      minH="48px"
                      px={2.5}
                      align="center"
                      gap={2}
                      textAlign="left"
                      _hover={{ bg: '#F2F6FF' }}
                      onClick={() => restoreFull('platforms')}
                    >
                      <Box w="7px" h="7px" borderRadius="full" bg="#12B76A" />
                      <Box flex="1" minW={0}>
                        <Text fontSize="11px" fontWeight="750" noOfLines={1}>
                          {instance.env_id || instance.task_id}
                        </Text>
                        <Text fontSize="9px" color="#98A2B3" noOfLines={1}>
                          客服实例 · {instance.task_id}
                        </Text>
                      </Box>
                      <FiLink size={13} color="#2774FF" />
                    </Flex>
                  ))}
                </Stack>
              ) : (
                <Text px={2.5} pb={2.5} fontSize="10px" color="#98A2B3">
                  暂无已配置客服账号
                </Text>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

export default function CompactReceptionWorkbench({
  windowMode,
}: {
  windowMode: 'docked' | 'floating';
}) {
  const [tab, setTab] = useState<CompactTab>('reception');
  const suggestionsQuery = useQuery(
    ['compact-reception-suggestions'],
    () => getQianniuSuggestions('all', 'all'),
    { refetchInterval: 1500 },
  );
  const platformsQuery = useQuery(['compact-platforms'], getPlatformList, {
    refetchInterval: 3000,
  });
  const tasksQuery = useQuery(['compact-tasks'], getTasks, {
    refetchInterval: 3000,
  });
  const suggestions = suggestionsQuery.data?.data || [];
  const pendingCount = suggestions.filter((item) =>
    ['pending', 'failed'].includes(item.status),
  ).length;

  return (
    <Flex h="100vh" direction="column" bg="#F7F8FA" overflow="hidden">
      <Flex
        h="58px"
        px={2.5}
        align="center"
        borderBottom="1px solid #E7EBF1"
        bg="#EEF4FF"
        flexShrink={0}
      >
        <Flex
          w="30px"
          h="30px"
          borderRadius="10px"
          bg="#2774FF"
          color="white"
          align="center"
          justify="center"
          fontSize="11px"
          fontWeight="900"
        >
          YB
        </Flex>
        <Box ml={2} flex="1">
          <Text fontSize="12px" fontWeight="900" color="#17345F">
            迎波聚合接待
          </Text>
          <Text fontSize="9px" color="#6D7F99">
            {pendingCount ? `${pendingCount} 位客户等待处理` : '当前接待正常'}
          </Text>
        </Box>
        <HStack spacing="2px" p="2px" borderRadius="9px" bg="#DCE8FF">
          <Tooltip label="吸附当前平台左侧">
            <IconButton
              aria-label="吸附当前平台左侧"
              icon={<FiArrowLeft />}
              size="xs"
              minW="25px"
              variant="ghost"
              bg={windowMode === 'docked' ? 'white' : 'transparent'}
              color={windowMode === 'docked' ? '#1F66D8' : '#60749A'}
              boxShadow={
                windowMode === 'docked'
                  ? '0 2px 6px rgba(31,102,216,.16)'
                  : 'none'
              }
              onClick={() =>
                window.electron.ipcRenderer.sendMessage(
                  'main-window-command',
                  { action: 'dock-left' },
                )
              }
            />
          </Tooltip>
          <Tooltip label="自由悬浮拖动">
            <IconButton
              aria-label="自由悬浮拖动"
              icon={<FiMove />}
              size="xs"
              minW="25px"
              variant="ghost"
              bg={windowMode === 'floating' ? 'white' : 'transparent'}
              color={windowMode === 'floating' ? '#1F66D8' : '#60749A'}
              boxShadow={
                windowMode === 'floating'
                  ? '0 2px 6px rgba(31,102,216,.16)'
                  : 'none'
              }
              onClick={() =>
                window.electron.ipcRenderer.sendMessage(
                  'main-window-command',
                  { action: 'float' },
                )
              }
            />
          </Tooltip>
          <Tooltip label="展开大屏工作台">
            <IconButton
              aria-label="展开大屏工作台"
              icon={<FiMaximize2 />}
              size="xs"
              minW="25px"
              variant="ghost"
              color="#60749A"
              onClick={() => restoreFull()}
            />
          </Tooltip>
        </HStack>
        <Tooltip label="刷新数据">
          <IconButton
            aria-label="刷新数据"
            icon={<FiRefreshCw />}
            size="xs"
            ml={0.5}
            variant="ghost"
            onClick={() =>
              void Promise.all([
                suggestionsQuery.refetch(),
                platformsQuery.refetch(),
                tasksQuery.refetch(),
              ])
            }
          />
        </Tooltip>
      </Flex>

      <Flex h="48px" px={2} align="center" gap={1.5} bg="white">
        {(
          [
            ['reception', '聚合接待', FiMessageCircle],
            ['accounts', '账号连接', FiLink],
          ] as const
        ).map(([value, label, TabIcon]) => (
          <Flex
            key={value}
            as="button"
            flex="1"
            h="34px"
            align="center"
            justify="center"
            gap={1.5}
            borderRadius="9px"
            bg={tab === value ? '#EAF1FF' : 'transparent'}
            color={tab === value ? '#1F66D8' : '#667085'}
            fontSize="11px"
            fontWeight={tab === value ? '800' : '650'}
            onClick={() => setTab(value)}
          >
            <TabIcon size={14} />
            {label}
            {value === 'reception' && pendingCount > 0 && (
              <Badge
                minW="18px"
                h="18px"
                px={1}
                borderRadius="full"
                bg="#F04438"
                color="white"
                fontSize="9px"
              >
                {pendingCount > 99 ? '99+' : pendingCount}
              </Badge>
            )}
          </Flex>
        ))}
      </Flex>

      {tab === 'reception' ? (
        <ReceptionList
          suggestions={suggestions}
          loading={suggestionsQuery.isLoading}
        />
      ) : (
        <AccountList
          apps={platformsQuery.data?.data || []}
          instances={tasksQuery.data?.data || []}
          loading={platformsQuery.isLoading || tasksQuery.isLoading}
        />
      )}

      <HStack
        minH="28px"
        px={3}
        justify="space-between"
        borderTop="1px solid #E7EBF1"
        bg="white"
      >
        <Text fontSize="9px" color="#98A2B3">
          {windowMode === 'docked'
            ? '左侧吸附 · 跟随当前平台'
            : '自由悬浮 · 可拖动'}
        </Text>
        <Text fontSize="9px" color="#98A2B3">
          v{window.electron.ipcRenderer.get('get-version')}
        </Text>
      </HStack>
    </Flex>
  );
}
