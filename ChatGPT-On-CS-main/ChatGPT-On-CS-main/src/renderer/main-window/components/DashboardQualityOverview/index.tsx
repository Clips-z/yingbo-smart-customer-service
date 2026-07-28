import React, { useEffect, useMemo } from 'react';
import { Badge, Box, Button, Flex, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  getConfig, getDouyinCollectorHealth, getJinmaiCollectorHealth,
  getPddCollectorHealth, getQianniuCollectorHealth, getQianniuSuggestions,
  getReplyQualityMetrics, getReplyQualityTrend, getWechatCollectorHealth, getWecomCollectorHealth,
} from '../../../common/services/platform/controller';
import { fetchKnowledgeCandidates } from '../../../common/services/knowledge/candidates';
import { GET } from '../../../common/services/common/api/request';
import useGlobalStore from '../../../common/stores/useGlobalStore';

const SLA_MINUTES = 5;
const HEALTH_LOADERS: Record<string, () => Promise<{ data: { state: string; lastError?: string } }>> = {
  win_qianniu: getQianniuCollectorHealth,
  win_wechat: getWechatCollectorHealth,
  win_wecom: getWecomCollectorHealth,
  win_jinmai: getJinmaiCollectorHealth,
  win_pdd: getPddCollectorHealth,
  win_douyin: getDouyinCollectorHealth,
};

const DashboardQualityOverview: React.FC = () => {
  const activePlatformIds = useGlobalStore((state) => state.activePlatformIds);
  const setActivePlatformId = useGlobalStore((state) => state.setActivePlatformId);
  const suggestionsQuery = useQuery(['dashboard-suggestions'], () => getQianniuSuggestions('all', 'all'), { refetchInterval: 5000 });
  const candidatesQuery = useQuery(['dashboard-candidates'], () => fetchKnowledgeCandidates({ status: 'pending', pageSize: 1 }), { refetchInterval: 15000 });
  const configQuery = useQuery(['dashboard-llm-config'], () => getConfig({ type: 'llm' }));
  const ragQuery = useQuery(['dashboard-rag-health'], () => GET<{ data: { state: string; totalChunks?: number; lastError?: string } }>('/api/v1/rag/health'), { refetchInterval: 10000 });
  const feedbackQuery = useQuery(['dashboard-reply-quality'], () => getReplyQualityMetrics(7), { refetchInterval: 15000 });
  const trendQuery = useQuery(['dashboard-reply-quality-trend'], () => getReplyQualityTrend(7), { refetchInterval: 15000 });
  const healthPlatformIds = activePlatformIds.filter((id) => HEALTH_LOADERS[id]);
  const healthQueries = useQueries({
    queries: healthPlatformIds.map((id) => ({
      queryKey: ['dashboard-collector-health', id],
      queryFn: HEALTH_LOADERS[id],
      refetchInterval: 10000,
    })),
  });
  const unhealthyPlatformIds = healthPlatformIds.filter((id, index) => {
    const state = healthQueries[index]?.data?.data.state;
    return state === 'degraded' || state === 'stopped';
  });
  const unhealthyCount = unhealthyPlatformIds.length;

  const suggestions = useMemo(
    () => suggestionsQuery.data?.data ?? [],
    [suggestionsQuery.data?.data],
  );
  const stats = useMemo(() => {
    const pending = suggestions.filter((item) => ['pending', 'failed'].includes(item.status));
    return {
      pending: pending.length,
      overdue: pending.filter((item) => Date.now() - new Date(item.created_at).getTime() >= SLA_MINUTES * 60000).length,
      failed: suggestions.filter((item) => item.status === 'failed').length,
    };
  }, [suggestions]);
  const candidates = candidatesQuery.data?.total || 0;
  const rag = ragQuery.data?.data;
  const llm = configQuery.data?.data as any;
  const feedback = feedbackQuery.data?.data;
  const acceptanceRate = feedback?.totalActions
    ? Math.round((feedback.accepted / feedback.totalActions) * 100)
    : null;
  const editRate = feedback?.totalActions
    ? Math.round((feedback.edited / feedback.totalActions) * 100)
    : null;
  const trend = trendQuery.data?.data ?? [];
  const maxTrendActions = Math.max(...trend.map((item) => item.totalActions), 1);
  const navigate = (section: string, sub?: string, focus?: string) => (window as any).__navigateTo?.(section, sub, focus);
  const openAiSettings = () => window.electron.ipcRenderer.sendMessage('open-settings-window', { tab: 'ai' });
  const steps = [
    { label: '启用至少一个客服平台', done: activePlatformIds.length > 0, action: () => document.getElementById('platform-manager')?.scrollIntoView({ behavior: 'smooth' }), actionLabel: '去启用' },
    { label: '配置并启用回复模型', done: Boolean(llm?.model && llm?.key), action: openAiSettings, actionLabel: '去配置' },
    { label: '导入首批店铺知识', done: Boolean(rag?.totalChunks), action: () => navigate('knowledge', 'store-kb'), actionLabel: '去导入' },
    { label: '完成一次测试回复', done: suggestions.length > 0, action: () => navigate('service', undefined, 'pending'), actionLabel: '去测试' },
    { label: '完成第一次辅助填入', done: Boolean(feedback?.accepted), action: () => navigate('service', undefined, 'pending'), actionLabel: '去处理' },
  ];

  useEffect(() => {
    const ragFailed = rag?.state === 'degraded';
    const count = stats.failed + stats.overdue + unhealthyCount + Number(ragFailed);
    if (!count) return;
    const key = 'yingbo-action-notification-at';
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 30 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    const systemProblems = [
      unhealthyCount ? `${unhealthyCount} 个平台采集异常` : '',
      ragFailed ? '知识检索异常' : '',
    ].filter(Boolean).join('，');
    window.electron.ipcRenderer.sendMessage('notification', '客服工作台需要处理', `${stats.overdue} 条回复超时，${stats.failed} 条发送失败${systemProblems ? `，${systemProblems}` : ''}。`);
  }, [stats.failed, stats.overdue, unhealthyCount, rag?.state]);

  const cards = [
    { label: '待回复', value: stats.pending, color: 'blue', action: () => navigate('service', undefined, 'pending') },
    { label: `超时（>${SLA_MINUTES}分钟）`, value: stats.overdue, color: 'red', action: () => navigate('service', undefined, 'overdue') },
    { label: '发送失败', value: stats.failed, color: 'orange', action: () => navigate('service', undefined, 'failed') },
    { label: '平台异常', value: unhealthyCount, color: 'red', action: () => { if (unhealthyPlatformIds[0]) setActivePlatformId(unhealthyPlatformIds[0]); navigate('service'); } },
    { label: '待审核知识', value: candidates, color: 'purple', action: () => navigate('knowledge', 'knowledge-candidates') },
  ];

  return (
    <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
      <Box gridColumn={{ xl: 'span 2' }} bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
        <Flex justify="space-between" align="center" mb={3}>
          <Box><Text fontWeight="800">今日待办</Text><Text fontSize="xs" color="gray.500">点击卡片直接进入处理页面</Text></Box>
          <Badge colorScheme={rag?.state === 'running' ? 'green' : 'orange'}>知识检索 {rag?.state || '检查中'}</Badge>
        </Flex>
        <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} spacing={3}>
          {cards.map((card) => (
            <Button key={card.label} h="82px" variant="outline" colorScheme={card.color} onClick={card.action} flexDirection="column">
              <Text fontSize="2xl" fontWeight="900">{card.value}</Text><Text fontSize="xs">{card.label}</Text>
            </Button>
          ))}
        </SimpleGrid>
        <Flex mt={3} gap={4} fontSize="xs" color="gray.500" wrap="wrap">
          <Text>近 7 天采用率：<Text as="span" fontWeight={700} color="gray.700">{acceptanceRate == null ? '暂无数据' : `${acceptanceRate}%`}</Text></Text>
          <Text>编辑率：<Text as="span" fontWeight={700} color="gray.700">{editRate == null ? '暂无数据' : `${editRate}%`}</Text></Text>
          {feedback?.failed ? <Text color="red.500">失败反馈：{feedback.failed}</Text> : null}
        </Flex>
        <Flex mt={3} h="56px" gap={2} align="end" aria-label="近七天回复采用趋势">
          {trend.map((item) => (
            <Flex key={item.date} flex="1" h="full" minW="0" direction="column" justify="end" align="center" title={`${item.date}：${item.accepted}/${item.totalActions}`}>
              <Box w="full" maxW="28px" h={`${Math.max(6, Math.round((item.accepted / maxTrendActions) * 100))}%`} bg="brand.400" borderRadius="sm" />
              <Text mt={1} fontSize="9px" color="gray.400">{item.date.slice(5)}</Text>
            </Flex>
          ))}
        </Flex>
      </Box>
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
        <Flex justify="space-between" align="center" mb={3}><Text fontWeight="800">开始使用</Text><Text fontSize="xs" color="gray.400">{steps.filter((step) => step.done).length}/{steps.length}</Text></Flex>
        <VStack align="stretch" spacing={2}>
          {steps.map((step) => <Flex key={step.label} gap={2} align="center"><Badge colorScheme={step.done ? 'green' : 'gray'}>{step.done ? '完成' : '待办'}</Badge><Text fontSize="sm" color={step.done ? 'gray.500' : 'gray.700'} flex="1">{step.label}</Text>{!step.done && <Button size="xs" variant="link" onClick={step.action}>{step.actionLabel}</Button>}</Flex>)}
        </VStack>
      </Box>
    </SimpleGrid>
  );
};

export default React.memo(DashboardQualityOverview);
