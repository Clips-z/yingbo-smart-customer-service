import React from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  ButtonGroup,
  Flex,
  Heading,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Tooltip,
  VStack,
  Badge,
} from '@chakra-ui/react';
import { QianniuReplyMode, ReplySuggestion } from '../../../common/services/platform/platform';
import {
  getHealthColorScheme,
  healthLabels,
  modeLabels,
  platformLabels,
} from './constants';
import ReplyCard from './ReplyCard';
import BatchActionBar from './BatchActionBar';
import { useReplyWorkbench } from './useReplyWorkbench';

// 平台图标
const platformEmoji: Record<string, string> = {
  win_qianniu: '🐂',
  win_wechat: '💬',
  win_jinmai: '📦',
  win_wecom: '🏢',
};

function renderList(
  items: ReplySuggestion[],
  isLoading: boolean,
  tabKey: string,
  supportsModes: boolean,
  mode: QianniuReplyMode,
  selectedIds: Set<number>,
  toggleSelect: (id: number) => void,
  refresh: () => void,
) {
  if (isLoading) {
    return (
      <Flex justify="center" py={8}>
        <Spinner color="brand.500" thickness="3px" />
      </Flex>
    );
  }
  if (!items.length) {
    const emptyMessages: Record<string, { emoji: string; title: string; desc: string }> = {
      all: { emoji: '📭', title: '暂无回复任务', desc: '当有新消息时，会自动显示在这里' },
      pending: { emoji: '✨', title: '没有待回复的消息', desc: '所有消息都已处理完毕，干得漂亮！' },
      handled: { emoji: '📋', title: '没有已处理记录', desc: '标记已处理的记录会显示在这里' },
    };
    const msg = emptyMessages[tabKey] || emptyMessages.all;
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        py={12}
        px={4}
        textAlign="center"
      >
        <Text fontSize="40px" mb={3}>{msg.emoji}</Text>
        <Text fontWeight="600" fontSize="15px" color="gray.600" mb={1}>
          {msg.title}
        </Text>
        <Text fontSize="13px" color="gray.400">{msg.desc}</Text>
        {tabKey === 'all' && supportsModes && mode === 'hint' && (
          <Text fontSize="12px" color="gray.400" mt={3}>
            提示：切换到「辅助回复」模式可一键填入回复到客户端
          </Text>
        )}
      </Flex>
    );
  }
  return (
    <VStack spacing={2} align="stretch">
      {items.map((item) => (
        <ReplyCard
          key={item.id}
          item={item}
          mode={mode}
          onChanged={refresh}
          platformId={item.platform_id}
          isSelected={selectedIds.has(item.id)}
          onToggleSelect={toggleSelect}
        />
      ))}
    </VStack>
  );
}

function CollectorHealthBadge({
  state,
  lastError,
  label,
}: {
  state?: string;
  lastError?: string;
  label: string;
}) {
  if (!state) return null;
  return (
    <Tooltip label={lastError || `${label}运行正常`}>
      <Badge mt={2} colorScheme={getHealthColorScheme(state)} variant="subtle" borderRadius="sm">
        {healthLabels[state as keyof typeof healthLabels] || state}
      </Badge>
    </Tooltip>
  );
}

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
  } = useReplyWorkbench();

  if (!activePlatformId) {
    return (
      <Box
        bg="white"
        borderRadius="xl"
        p={8}
        textAlign="center"
        boxShadow="sm"
        border="1px solid"
        borderColor="gray.100"
      >
        <Text fontSize="40px" mb={3}>💼</Text>
        <Heading as="h3" size="md" mb={2} color="gray.700">
          回复工作台
        </Heading>
        <Text color="gray.500" fontSize="13px">
          请先在上方选择一个在线平台，消息和回复将在这里显示
        </Text>
      </Box>
    );
  }

  const platformName =
    activePlatformId === 'all'
      ? '全部平台'
      : platformLabels[activePlatformId] || activePlatformId;

  const modeHintText = (() => {
    if (!supportsModes && activePlatformId !== 'all')
      return `当前只显示${platformName}产生的回复`;
    if (activePlatformId === 'all') return '按时间统一显示所有在线平台回复';
    if (supportsModes && mode === 'hint')
      return '仅生成建议，不操作客服客户端';
    if (isQianniu && mode === 'assist') return '填入后由你在千牛确认发送';
    if (isWechat && mode === 'assist') return '定位填入后由你在微信确认发送';
    if (isWecom && mode === 'assist') return '定位填入后由你在企业微信确认发送';
    if (isJinmai && mode === 'assist') return '定位填入后由你在京麦确认发送';
    if (supportsModes && mode === 'unattended') return '自动发送回复中';
    return '';
  })();

  return (
    <Box
      bg="white"
      borderRadius="xl"
      p={4}
      boxShadow="sm"
      border="1px solid"
      borderColor="gray.100"
    >
      {/* 平台切换 — Pill 标签页 */}
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

      {/* 标题栏 + 模式切换 */}
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
            <CollectorHealthBadge
              state={collectorHealth.state}
              lastError={collectorHealth.lastError}
              label="微信消息采集"
            />
          )}
          {isWecom && wecomCollectorHealth && (
            <CollectorHealthBadge
              state={wecomCollectorHealth.state}
              lastError={wecomCollectorHealth.lastError}
              label="企微消息采集"
            />
          )}
          {isJinmai && jinmaiCollectorHealth && (
            <CollectorHealthBadge
              state={jinmaiCollectorHealth.state}
              lastError={jinmaiCollectorHealth.lastError}
              label="京麦消息采集"
            />
          )}
        </Box>

        {/* Segmented Control 风格模式切换 */}
        {supportsModes && (
          <Flex
            bg="gray.100"
            borderRadius="xl"
            p="3px"
            gap="2px"
          >
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
        )}
      </Flex>

      {/* 无人值守警告 */}
      {supportsModes && mode === 'unattended' && (
        <Alert status="warning" mb={3} borderRadius="lg" variant="left-accent">
          <AlertIcon />
          <Text fontSize="13px" flex="1">
            无人值守已开启，AI 将自动发送回复
          </Text>
          <Button size="xs" colorScheme="red" variant="outline" onClick={() => changeMode('hint')} borderRadius="full">
            立即停止
          </Button>
        </Alert>
      )}

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

      <Tabs size="sm" variant="soft-rounded" colorScheme="brand" isLazy>
        <TabList mb={3}>
          <Tab fontSize="12px" fontWeight={500}>全部 {suggestions.length}</Tab>
          <Tab fontSize="12px" fontWeight={500}>待回复 {pending.length}</Tab>
          <Tab fontSize="12px" fontWeight={500}>已处理 {handled.length}</Tab>
        </TabList>
        <TabPanels maxH="50vh" overflowY="auto" px={1}>
          <TabPanel px={0}>
            {renderList(
              suggestions,
              suggestionsLoading,
              'all',
              supportsModes,
              mode,
              selectedIds,
              toggleSelect,
              refresh,
            )}
          </TabPanel>
          <TabPanel px={0}>
            {renderList(
              pending,
              suggestionsLoading,
              'pending',
              supportsModes,
              mode,
              selectedIds,
              toggleSelect,
              refresh,
            )}
          </TabPanel>
          <TabPanel px={0}>
            {renderList(
              handled,
              suggestionsLoading,
              'handled',
              supportsModes,
              mode,
              selectedIds,
              toggleSelect,
              refresh,
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
};

export default React.memo(ReplyWorkbench);
