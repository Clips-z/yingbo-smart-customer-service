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
    { label: '启用至少一个客服平台', done: activePlatformIds.length > 0, action: () => navigate('platforms'), actionLabel: '去启用' },
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
  const attentionCount = stats.pending + unhealthyCount + candidates;

  return (
    <VStack spacing={5} align="stretch">
      <Box
        position="relative"
        overflow="hidden"
        bg="#111C2E"
        color="white"
        borderRadius="20px"
        px={{ base: 4, md: 6 }}
        py={{ base: 5, md: 6 }}
        boxShadow="0 18px 42px rgba(17,28,46,.16)"
        _before={{
          content: '""',
          position: 'absolute',
          w: '420px',
          h: '420px',
          right: '-160px',
          top: '-250px',
          borderRadius: 'full',
          bg: 'radial-gradient(circle, rgba(76,111,255,.34), transparent 68%)',
          pointerEvents: 'none',
        }}
      >
        <Flex
          position="relative"
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={3}
          mb={5}
        >
          <Box>
            <Text fontSize="11px" color="whiteAlpha.550" fontWeight="700" letterSpacing=".12em">
              TODAY · 客服运营
            </Text>
            <Text mt={1} fontSize={{ base: '21px', md: '25px' }} fontWeight="850" letterSpacing="-.03em">
              {attentionCount
                ? `有 ${attentionCount} 项需要关注`
                : '当前运行平稳，没有紧急待办'}
            </Text>
            <Text mt={1.5} fontSize="12px" color="whiteAlpha.650">
              先处理客户等待和运行异常，再审核可沉淀的知识。
            </Text>
          </Box>
          <Badge
            px={3}
            py={1.5}
            borderRadius="full"
            bg={rag?.state === 'running' ? 'rgba(56,211,159,.14)' : 'rgba(245,158,11,.16)'}
            color={rag?.state === 'running' ? '#73E3BA' : '#FDBA74'}
          >
            {rag?.state === 'running' ? '知识检索正常' : `知识检索 ${rag?.state || '检查中'}`}
          </Badge>
        </Flex>
        <SimpleGrid position="relative" columns={{ base: 2, md: 5 }} spacing={0}>
          {cards.map((card, index) => {
            const Icon = taskIcons[index];
            return (
              <Box
                as="button"
                key={card.label}
                onClick={card.action}
                textAlign="left"
                px={{ base: 3, md: 4 }}
                py={3}
                borderLeft={{ base: 'none', md: index ? '1px solid' : 'none' }}
                borderTop={{ base: index > 1 ? '1px solid' : 'none', md: 'none' }}
                borderColor="whiteAlpha.150"
                _hover={{ bg: 'whiteAlpha.100' }}
                _focusVisible={{ boxShadow: 'inset 0 0 0 2px #9CB4FF' }}
              >
                <Flex align="center" gap={2} color="whiteAlpha.600">
                  <Icon size={14} />
                  <Text fontSize="10px" fontWeight="650">{card.label}</Text>
                </Flex>
                <Text mt={2} fontSize="27px" lineHeight="1" fontWeight="850">
                  {card.value}
                </Text>
              </Box>
            );
          })}
        </SimpleGrid>
      </Box>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={5}>
        <Box
          gridColumn={{ xl: 'span 2' }}
          bg="white"
          border="1px solid"
          borderColor="#E4E8F0"
          borderRadius="16px"
          overflow="hidden"
        >
          <Flex justify="space-between" align="center" px={5} py={4} borderBottom="1px solid #EDF0F5">
            <Box>
              <Text fontSize="15px" fontWeight="800">今天的处理顺序</Text>
              <Text fontSize="11px" color="gray.500" mt={0.5}>按客户等待风险和业务影响排序</Text>
            </Box>
            <Badge bg="#EEF2FF" color="#2947A3">实时更新</Badge>
          </Flex>
          {cards.slice(0, 4).map((card, index) => {
            const Icon = taskIcons[index];
            const tone = taskTones[index];
            const helper = [
              '审核 AI 建议并填入当前客户',
              '优先处理等待超过 5 分钟的客户',
              '检查上下文后重试或改为人工',
              '检查对应平台的采集和登录状态',
            ][index];
            return (
              <Flex
                as="button"
                key={card.label}
                w="full"
                align="center"
                gap={3}
                px={5}
                py={3.5}
                textAlign="left"
                borderBottom={index < 3 ? '1px solid #F0F2F6' : 'none'}
                _hover={{ bg: '#F8FAFD' }}
                onClick={card.action}
              >
                <Flex w="34px" h="34px" borderRadius="10px" bg={tone.bg} color={tone.color} align="center" justify="center">
                  <Icon size={16} />
                </Flex>
                <Box flex="1">
                  <Text fontSize="12px" fontWeight="750">{card.label}</Text>
                  <Text fontSize="10px" color="gray.500">{helper}</Text>
                </Box>
                <Text fontSize="18px" fontWeight="850">{card.value}</Text>
                <FiArrowRight color="#98A2B3" />
              </Flex>
            );
          })}
        </Box>

        <Box bg="white" border="1px solid #E4E8F0" borderRadius="16px" p={5}>
          <Flex justify="space-between" align="flex-start">
            <Box>
              <Text fontSize="15px" fontWeight="800">回复质量</Text>
              <Text fontSize="11px" color="gray.500" mt={0.5}>近 7 天人工反馈</Text>
            </Box>
            <Button size="xs" variant="ghost" rightIcon={<FiArrowRight />} onClick={() => window.electron.ipcRenderer.sendMessage('open-dataview-window', {})}>
              查看复盘
            </Button>
          </Flex>
          <SimpleGrid columns={2} mt={5} spacing={3}>
            <Box borderRight="1px solid #EDF0F5">
              <Text fontSize="24px" fontWeight="850">{acceptanceRate == null ? '—' : `${acceptanceRate}%`}</Text>
              <Text fontSize="10px" color="gray.500">直接采用率</Text>
            </Box>
            <Box pl={2}>
              <Text fontSize="24px" fontWeight="850">{editRate == null ? '—' : `${editRate}%`}</Text>
              <Text fontSize="10px" color="gray.500">人工编辑率</Text>
            </Box>
          </SimpleGrid>
          {trend.length ? (
            <Flex mt={5} h="64px" gap={2} align="end" aria-label="近七天回复采用趋势">
              {trend.map((item) => (
                <Flex key={item.date} flex="1" h="full" minW="0" direction="column" justify="end" align="center" title={`${item.date}：${item.accepted}/${item.totalActions}`}>
                  <Box w="full" maxW="30px" h={`${Math.max(7, Math.round((item.accepted / maxTrendActions) * 100))}%`} bg="linear-gradient(180deg, #8EA7FF, #4C6FFF)" borderRadius="4px 4px 1px 1px" />
                  <Text mt={1} fontSize="8px" color="gray.400">{item.date.slice(5)}</Text>
                </Flex>
              ))}
            </Flex>
          ) : (
            <Flex mt={5} h="64px" bg="#F7F9FC" borderRadius="10px" align="center" justify="center">
              <Text fontSize="10px" color="gray.500">产生人工采用或编辑后显示趋势</Text>
            </Flex>
          )}
          <Button mt={4} size="sm" w="full" variant="outline" leftIcon={<FiBookOpen />} onClick={() => navigate('knowledge', 'knowledge-candidates')}>
            审核知识候选（{candidates}）
          </Button>
        </Box>
      </SimpleGrid>

      {completedSteps < steps.length && (
        <Box bg="#FFFDF7" border="1px solid #F3E7C2" borderRadius="14px" px={5} py={4}>
          <Flex justify="space-between" align="center" mb={3}>
            <Box>
              <Text fontSize="13px" fontWeight="800">还有 {steps.length - completedSteps} 项基础配置未完成</Text>
              <Text fontSize="10px" color="gray.500">完成后，迎波可以稳定陪伴平台窗口运行。</Text>
            </Box>
            <Badge bg="#FFF4D6" color="#9A6700">{completedSteps}/{steps.length}</Badge>
          </Flex>
          <VStack align="stretch" spacing={1}>
            {steps.filter((step) => !step.done).map((step) => (
              <Flex key={step.label} align="center" gap={2} py={1.5}>
                <FiClock color="#B7791F" />
                <Text flex="1" fontSize="11px">{step.label}</Text>
                <Button size="xs" variant="ghost" rightIcon={<FiArrowRight />} onClick={step.action}>{step.actionLabel}</Button>
              </Flex>
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

export default React.memo(DashboardQualityOverview);
