import React, { useEffect, useMemo } from 'react';
import { Badge, Box, Button, Flex, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getConfig, getQianniuSuggestions } from '../../../common/services/platform/controller';
import { fetchKnowledgeCandidates } from '../../../common/services/knowledge/candidates';
import { GET } from '../../../common/services/common/api/request';
import useGlobalStore from '../../../common/stores/useGlobalStore';

const SLA_MINUTES = 5;

const DashboardQualityOverview: React.FC = () => {
  const activePlatformIds = useGlobalStore((state) => state.activePlatformIds);
  const suggestionsQuery = useQuery(['dashboard-suggestions'], () => getQianniuSuggestions('all', 'all'), { refetchInterval: 5000 });
  const candidatesQuery = useQuery(['dashboard-candidates'], () => fetchKnowledgeCandidates({ status: 'pending', pageSize: 1 }), { refetchInterval: 15000 });
  const configQuery = useQuery(['dashboard-llm-config'], () => getConfig({ type: 'llm' }));
  const ragQuery = useQuery(['dashboard-rag-health'], () => GET<{ data: { state: string; totalChunks?: number; lastError?: string } }>('/api/v1/rag/health'), { refetchInterval: 10000 });

  const suggestions = suggestionsQuery.data?.data || [];
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
  const steps = [
    { label: '启用至少一个客服平台', done: activePlatformIds.length > 0 },
    { label: '配置并启用回复模型', done: Boolean(llm?.model && llm?.key) },
    { label: '启动知识检索服务', done: rag?.state === 'running' },
    { label: '完成一次测试回复', done: suggestions.length > 0 },
  ];

  useEffect(() => {
    const count = stats.failed + stats.overdue;
    if (!count) return;
    const key = 'yingbo-action-notification-at';
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 30 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    window.electron.ipcRenderer.sendMessage('notification', '客服工作台需要处理', `${stats.overdue} 条回复超时，${stats.failed} 条发送失败。`);
  }, [stats.failed, stats.overdue]);

  const navigate = (section: string, sub?: string) => (window as any).__navigateTo?.(section, sub);
  const cards = [
    { label: '待回复', value: stats.pending, color: 'blue', action: () => navigate('service') },
    { label: `超时（>${SLA_MINUTES}分钟）`, value: stats.overdue, color: 'red', action: () => navigate('service') },
    { label: '发送失败', value: stats.failed, color: 'orange', action: () => navigate('service') },
    { label: '待审核知识', value: candidates, color: 'purple', action: () => navigate('knowledge', 'knowledge-candidates') },
  ];

  return (
    <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
      <Box gridColumn={{ xl: 'span 2' }} bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
        <Flex justify="space-between" align="center" mb={3}>
          <Box><Text fontWeight="800">今日待办</Text><Text fontSize="xs" color="gray.500">点击卡片直接进入处理页面</Text></Box>
          <Badge colorScheme={rag?.state === 'running' ? 'green' : 'orange'}>知识检索 {rag?.state || '检查中'}</Badge>
        </Flex>
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
          {cards.map((card) => (
            <Button key={card.label} h="82px" variant="outline" colorScheme={card.color} onClick={card.action} flexDirection="column">
              <Text fontSize="2xl" fontWeight="900">{card.value}</Text><Text fontSize="xs">{card.label}</Text>
            </Button>
          ))}
        </SimpleGrid>
      </Box>
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
        <Flex justify="space-between" align="center" mb={3}><Text fontWeight="800">开始使用</Text><Text fontSize="xs" color="gray.400">{steps.filter((step) => step.done).length}/{steps.length}</Text></Flex>
        <VStack align="stretch" spacing={2}>
          {steps.map((step) => <Flex key={step.label} gap={2} align="center"><Badge colorScheme={step.done ? 'green' : 'gray'}>{step.done ? '完成' : '待办'}</Badge><Text fontSize="sm" color={step.done ? 'gray.500' : 'gray.700'}>{step.label}</Text></Flex>)}
        </VStack>
        <Button mt={4} size="sm" w="full" variant="outline" onClick={() => window.electron.ipcRenderer.sendMessage('open-settings-window', {})}>检查配置</Button>
      </Box>
    </SimpleGrid>
  );
};

export default React.memo(DashboardQualityOverview);
