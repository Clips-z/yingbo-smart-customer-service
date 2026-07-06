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
    return <Spinner color="teal.500" />;
  }
  if (!items.length) {
    const emptyMessages: Record<string, { title: string; desc: string }> = {
      all: { title: '暂无回复任务', desc: '当有新消息时，会自动显示在这里' },
      pending: { title: '没有待回复的消息', desc: '所有消息都已处理完毕 ✨' },
      handled: { title: '没有已处理记录', desc: '标记已处理的记录会显示在这里' },
    };
    const msg = emptyMessages[tabKey] || emptyMessages.all;
    return (
      <VStack py={10} spacing={3} textAlign="center" color="gray.400">
        <Box fontSize="4xl">📭</Box>
        <Text fontWeight="600" fontSize="md" color="gray.500">
          {msg.title}
        </Text>
        <Text fontSize="sm">{msg.desc}</Text>
        {tabKey === 'all' && supportsModes && mode === 'hint' && (
          <Text fontSize="xs" color="gray.400">
            提示：切换到「辅助回复」模式可一键填入回复到客户端
          </Text>
        )}
      </VStack>
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
      <Badge mt={2} colorScheme={getHealthColorScheme(state)}>
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
      <Box width="full" py={6} textAlign="center">
        <Heading as="h2" size="md" mb={2}>
          回复工作台
        </Heading>
        <Text color="gray.500" fontSize="sm">
          请先打开并选择一个客服客户端
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
      return '当前只生成建议，不操作客服客户端';
    if (isQianniu && mode === 'assist') return '填入后由你在千牛确认发送';
    if (isWechat && mode === 'assist') return '定位填入后由你在微信确认发送';
    if (isWecom && mode === 'assist') return '定位填入后由你在企业微信确认发送';
    if (isJinmai && mode === 'assist') return '定位填入后由你在京麦确认发送';
    if (supportsModes && mode === 'unattended') return '当前会自动发送回复';
    return '';
  })();

  return (
    <Box width="full">
      <ButtonGroup size="sm" mb={3} flexWrap="wrap" spacing={2}>
        {activePlatformIds.length > 1 && (
          <Button
            colorScheme="teal"
            variant={activePlatformId === 'all' ? 'solid' : 'outline'}
            onClick={() => setActivePlatformId('all')}
          >
            全部{' '}
            {
              allSuggestions.filter((item) =>
                activePlatformIds.includes(item.platform_id),
              ).length
            }
          </Button>
        )}
        {activePlatformIds.map((platformId) => (
          <Button
            key={platformId}
            colorScheme="teal"
            variant={activePlatformId === platformId ? 'solid' : 'outline'}
            onClick={() => setActivePlatformId(platformId)}
          >
            {platformLabels[platformId] || platformId}{' '}
            {
              allSuggestions.filter((item) => item.platform_id === platformId)
                .length
            }
          </Button>
        ))}
      </ButtonGroup>

      <Flex
        justify="space-between"
        align={{ base: 'stretch', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
        gap={3}
        mb={3}
      >
        <Box>
          <Heading as="h2" size="md">
            {platformName}回复工作台
          </Heading>
          <Text color="gray.500" fontSize="xs" mt={1}>
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
        {supportsModes && (
          <ButtonGroup size="sm" isAttached isDisabled={changingMode}>
            {(Object.keys(modeLabels) as QianniuReplyMode[]).map((value) => (
              <Button
                key={value}
                colorScheme={
                  mode === value
                    ? value === 'unattended'
                      ? 'red'
                      : 'teal'
                    : 'gray'
                }
                variant={mode === value ? 'solid' : 'outline'}
                onClick={() => changeMode(value)}
              >
                {modeLabels[value]}
              </Button>
            ))}
          </ButtonGroup>
        )}
      </Flex>

      {supportsModes && mode === 'unattended' && (
        <Alert status="warning" mb={3} borderRadius="6px">
          <AlertIcon />
          <Text fontSize="sm" flex="1">
            无人值守已开启，仅可靠来源回复会自动发送
          </Text>
          <Button size="xs" colorScheme="red" onClick={() => changeMode('hint')}>
            立即停止自动发送
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

      <Tabs size="sm" colorScheme="teal" isLazy>
        <TabList>
          <Tab>全部 {suggestions.length}</Tab>
          <Tab>待回复 {pending.length}</Tab>
          <Tab>已处理 {handled.length}</Tab>
        </TabList>
        <TabPanels maxH="46vh" overflowY="auto">
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
