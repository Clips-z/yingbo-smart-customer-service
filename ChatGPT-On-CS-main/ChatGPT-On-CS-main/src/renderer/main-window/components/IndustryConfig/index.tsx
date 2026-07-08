import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Switch,
  Badge,
  SimpleGrid,
  IconButton,
  useToast,
  Spinner,
  HStack,
  VStack,
  Divider,
  Tooltip,
} from '@chakra-ui/react';
import { FiEdit2, FiMessageSquare, FiBan, FiTag } from 'react-icons/fi';
import {
  fetchIndustryTemplates,
  toggleIndustry,
  IndustryTemplate,
} from '../../../common/services/knowledge/industryConfig';

/* ════════════════════ 行业卡片 ════════════════════ */
const IndustryCard: React.FC<{
  industry: IndustryTemplate;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (industry: IndustryTemplate) => void;
}> = ({ industry, onToggle, onEdit }) => {
  const c1 = `hsl(${industry.hue}, 70%, 92%)`;
  const c2 = `hsl(${(industry.hue + 30) % 360}, 65%, 70%)`;

  return (
    <Box
      bg="white"
      borderRadius="xl"
      border="1px solid"
      borderColor={industry.enabled ? 'brand.200' : 'gray.100'}
      boxShadow="sm"
      overflow="hidden"
      transition="all 0.18s ease"
      _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }}
    >
      {/* 头部：图标 + 名称 + 开关 */}
      <Flex align="center" gap={3} p={4} pb={3}>
        <Box
          w="44px"
          h="44px"
          borderRadius="lg"
          bgGradient={`linear-gradient(135deg, ${c1}, ${c2})`}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="22px"
          flexShrink={0}
        >
          {industry.icon}
        </Box>
        <Box flex="1" minW="0">
          <Text fontSize="14px" fontWeight={700} color="gray.800" noOfLines={1}>
            {industry.name}
          </Text>
          <Text fontSize="11px" color="gray.400" mt={0.5} noOfLines={1}>
            {industry.description}
          </Text>
        </Box>
        <Switch
          size="sm"
          colorScheme="green"
          isChecked={industry.enabled}
          onChange={(e) => onToggle(industry.id, e.target.checked)}
        />
      </Flex>

      <Divider borderColor="gray.100" />

      {/* 指标行 */}
      <Flex align="center" justify="space-between" px={4} py={3}>
        <HStack spacing={4}>
          <Metric icon={<FiMessageSquare size={13} />} label="话术" value={industry.phraseCount} />
          <Metric icon={<FiBan size={13} />} label="禁用词" value={industry.bannedWordCount} />
          <Metric icon={<FiTag size={13} />} label="术语" value={industry.termCount} />
        </HStack>
        <Tooltip label="配置行业话术与禁用词" placement="top">
          <IconButton
            aria-label="编辑"
            icon={<FiEdit2 size={15} />}
            size="sm"
            variant="ghost"
            colorScheme="brand"
            borderRadius="lg"
            onClick={() => onEdit(industry)}
            _hover={{ bg: 'brand.50' }}
          />
        </Tooltip>
      </Flex>

      {/* 启用状态条 */}
      <Box
        px={4}
        py={2}
        bg={industry.enabled ? 'brand.50' : 'gray.50'}
        borderTop="1px solid"
        borderColor="gray.100"
      >
        <Badge
          colorScheme={industry.enabled ? 'green' : 'gray'}
          variant={industry.enabled ? 'solid' : 'subtle'}
          borderRadius="full"
          fontSize="10px"
          px={2}
        >
          {industry.enabled ? '已启用' : '已停用'}
        </Badge>
        <Text as="span" fontSize="11px" color="gray.400" ml={2}>
          覆盖 {industry.productCount} 件商品
        </Text>
      </Box>
    </Box>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({
  icon,
  label,
  value,
}) => (
  <VStack spacing={0} align="center">
    <Flex align="center" color="brand.500" mb={0.5}>
      {icon}
      <Text fontSize="13px" fontWeight={800} color="gray.700" ml={1}>
        {value}
      </Text>
    </Flex>
    <Text fontSize="10px" color="gray.400">
      {label}
    </Text>
  </VStack>
);

/* ════════════════════ 主组件 ════════════════════ */
const IndustryConfig: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<IndustryTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [enabledCount, setEnabledCount] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchIndustryTemplates();
      setList(res.list);
      setTotal(res.total);
      setEnabledCount(res.enabledCount);
    } catch (err) {
      console.error('[IndustryConfig] load failed:', err);
      toast({ title: '加载失败', status: 'error', duration: 2000, isClosest: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    setList((prev) => prev.map((i) => (i.id === id ? { ...i, enabled } : i)));
    setEnabledCount((prev) => prev + (enabled ? 1 : -1));
    try {
      await toggleIndustry(id, enabled);
    } catch (err) {
      console.error('[IndustryConfig] toggle failed:', err);
      toast({ title: '操作失败', status: 'error', duration: 1500, isClosest: true });
    }
  };

  const handleEdit = (industry: IndustryTemplate) => {
    toast({
      title: `配置「${industry.name}」`,
      description: `话术 ${industry.phraseCount} · 禁用词 ${industry.bannedWordCount} · 术语 ${industry.termCount}`,
      status: 'info',
      duration: 2500,
      isClosest: true,
    });
  };

  return (
    <VStack spacing={4} align="stretch" h="full">
      <Box pt={1}>
        <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
          行业相关配置
        </Text>
        <Text fontSize="12.5px" color="gray.400" mt={0.5}>
          为不同行业配置专属话术、禁用词与术语，提升 AI 回复的专业度
        </Text>
      </Box>

      {/* 统计条 */}
      <Flex align="center" gap={3}>
        <Badge colorScheme="brand" borderRadius="full" px={3} py={1} fontSize="12px" fontWeight={700}>
          已启用 {enabledCount} / {total}
        </Badge>
        <Text fontSize="12px" color="gray.400">
          启用后该行业的专属知识将参与智能回复
        </Text>
      </Flex>

      {loading ? (
        <Flex justify="center" align="center" h="300px">
          <Spinner size="lg" color="brand.500" />
        </Flex>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4} flex="1">
          {list.map((it) => (
            <IndustryCard
              key={it.id}
              industry={it}
              onToggle={handleToggle}
              onEdit={handleEdit}
            />
          ))}
        </SimpleGrid>
      )}
    </VStack>
  );
};

export default React.memo(IndustryConfig);
