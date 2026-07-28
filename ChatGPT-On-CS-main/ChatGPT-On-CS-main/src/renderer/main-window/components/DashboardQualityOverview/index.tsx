import React, { useEffect, useMemo } from 'react';
import { Badge, Box, Button, Flex, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { FiAlertCircle, FiArrowRight, FiBookOpen, FiCheckCircle, FiClock, FiSend } from 'react-icons/fi';
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

  const taskIcons = [FiClock, FiAlertCircle, FiSend, FiAlertCircle, FiBookOpen];
  const taskTones = [
    { bg: '#EFF6FF', color: '#2563EB' }, { bg: '#FFF1F2', color: '#E11D48' },
    { bg: '#FFF7ED', color: '#EA580C' }, { bg: '#FEF2F2', color: '#DC2626' },
    { bg: '#F5F3FF', color: '#6D28D9' },
  ];
  const completedSteps = steps.filter((step) => step.done).length;

  return <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={5}>
    <Box gridColumn={{ xl: 'span 2' }} bg="white" border="1px solid" borderColor="#E8ECF3" borderRadius="18px" p={{ base: 4, md: 5 }} boxShadow="0 10px 30px rgba(16,24,40,.035)">
      <Flex justify="space-between" align="flex-start" mb={5} gap={3}>
        <Box><Flex align="center" gap={2}><Text fontSize="16px" fontWeight="800" color="#182230">优先处理</Text><Badge px={2} py={0.5} bg="#EEF3FF" color="#3C58BE">实时更新</Badge></Flex><Text fontSize="12px" color="gray.500" mt={1}>从待回复、异常和知识审核开始处理。</Text></Box>
        <Badge px={2.5} py={1} borderRadius="full" bg={rag?.state === 'running' ? '#ECFDF3' : '#FFF7ED'} color={rag?.state === 'running' ? '#027A48' : '#B54708'}>{rag?.state === 'running' ? '知识检索正常' : `知识检索 ${rag?.state || '检查中'}`}</Badge>
      </Flex>
      <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} spacing={3}>
        {cards.map((card, index) => { const Icon = taskIcons[index]; const tone = taskTones[index]; return <Box as="button" key={card.label} onClick={card.action} textAlign="left" p={3.5} minH="118px" border="1px solid" borderColor="#EDF0F5" borderRadius="14px" bg="#fff" transition="all .18s" _hover={{ transform: 'translateY(-2px)', borderColor: '#C9D4FF', boxShadow: '0 10px 18px rgba(73,91,179,.08)' }} _focusVisible={{ boxShadow: '0 0 0 3px rgba(91,124,250,.25)' }}><Flex justify="space-between"><Flex w="30px" h="30px" borderRadius="9px" bg={tone.bg} color={tone.color} align="center" justify="center"><Icon size={16} /></Flex><FiArrowRight color="#98A2B3" size={15} /></Flex><Text mt={4} fontSize="25px" lineHeight="1" fontWeight="850" color="#182230">{card.value}</Text><Text mt={1.5} fontSize="11px" color="gray.500" fontWeight="600">{card.label}</Text></Box>; })}
      </SimpleGrid>
      <Flex mt={5} pt={4} borderTop="1px solid" borderColor="#EDF0F5" gap={{ base: 3, md: 6 }} wrap="wrap" align="center"><Text fontSize="12px" color="gray.500">近 7 天采用率 <Text as="span" ml={1} color="#182230" fontWeight="800">{acceptanceRate == null ? '暂无数据' : `${acceptanceRate}%`}</Text></Text><Text fontSize="12px" color="gray.500">人工编辑率 <Text as="span" ml={1} color="#182230" fontWeight="800">{editRate == null ? '暂无数据' : `${editRate}%`}</Text></Text>{feedback?.failed ? <Text fontSize="12px" color="red.500">失败反馈 {feedback.failed}</Text> : <Flex fontSize="12px" color="green.600" align="center" gap={1}><FiCheckCircle /> 暂无失败反馈</Flex>}</Flex>
      <Flex mt={3} h="52px" gap={2} align="end" aria-label="近七天回复采用趋势">{trend.map((item) => <Flex key={item.date} flex="1" h="full" minW="0" direction="column" justify="end" align="center" title={`${item.date}：${item.accepted}/${item.totalActions}`}><Box w="full" maxW="34px" h={`${Math.max(7, Math.round((item.accepted / maxTrendActions) * 100))}%`} bg="linear-gradient(180deg, #8AA5FF, #5B7CFA)" borderRadius="5px 5px 2px 2px" /><Text mt={1} fontSize="9px" color="gray.400">{item.date.slice(5)}</Text></Flex>)}</Flex>
    </Box>
    <Box bg="#182230" color="white" borderRadius="18px" p={{ base: 4, md: 5 }} boxShadow="0 14px 30px rgba(16,24,40,.12)">
      <Flex justify="space-between" align="center"><Box><Text fontSize="16px" fontWeight="800">启用清单</Text><Text fontSize="12px" color="whiteAlpha.600" mt={1}>完成基础配置后即可稳定运行</Text></Box><Flex w="38px" h="38px" rounded="full" bg="whiteAlpha.100" align="center" justify="center"><Text fontWeight="800">{completedSteps}/{steps.length}</Text></Flex></Flex>
      <VStack align="stretch" spacing={1} mt={5}>{steps.map((step, index) => <Flex key={step.label} gap={3} align="center" py={2}><Flex w="20px" h="20px" flexShrink={0} rounded="full" align="center" justify="center" bg={step.done ? '#36D399' : 'whiteAlpha.100'} color={step.done ? '#0B261C' : 'whiteAlpha.700'} fontSize="10px" fontWeight="800">{step.done ? <FiCheckCircle size={13} /> : index + 1}</Flex><Text fontSize="12px" color={step.done ? 'whiteAlpha.500' : 'white'} flex="1" textDecoration={step.done ? 'line-through' : 'none'}>{step.label}</Text>{!step.done && <Button size="xs" variant="ghost" color="white" rightIcon={<FiArrowRight />} _hover={{ bg: 'whiteAlpha.150' }} onClick={step.action}>{step.actionLabel}</Button>}</Flex>)}</VStack>
    </Box>
  </SimpleGrid>;
};

export default React.memo(DashboardQualityOverview);
