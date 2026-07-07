import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  IconButton,
  Button,
  Checkbox,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  HStack,
  VStack,
  Badge,
  Select,
  useToast,
  Spinner,
  Icon,
  Collapse,
  SimpleGrid,
  Tooltip,
  Divider,
} from '@chakra-ui/react';
import {
  FiSearch,
  FiChevronDown,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiChevronRight,
  FiChevronDown as FiChevronDownSmall,
  FiUpload,
  FiRefreshCw,
  FiCopy,
  FiBookmark,
  FiFilter,
} from 'react-icons/fi';
import {
  fetchStoreQAList,
  QAItem,
  QAStage,
  STAGE_LABELS,
  SHOP_OPTIONS,
  formatRelativeTime,
} from '../../../common/services/knowledge/storeKB';

/* ── 阶段色映射 ── */
const STAGE_COLOR: Record<QAStage, string> = {
  presale: 'blue',
  mid: 'orange',
  aftersale: 'purple',
};

/* ════════════════════ QA 列表项 ════════════════════ */
const QAListItem: React.FC<{
  item: QAItem;
  selected: boolean;
  defaultExpanded?: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (item: QAItem) => void;
  onDelete: (item: QAItem) => void;
}> = ({ item, selected, defaultExpanded = false, onToggleSelect, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [checked, setChecked] = useState(false);

  return (
    <Box
      border="1px solid"
      borderColor={selected ? 'brand.300' : 'gray.150'}
      bg={selected ? 'brand.50' : 'white'}
      borderRadius="lg"
      mb={2}
      overflow="hidden"
      transition="all 0.15s"
      _hover={{ borderColor: 'brand.200' }}
    >
      {/* 主行 */}
      <Flex align="flex-start" gap={2} p={3}>
        <Checkbox
          mt="2px"
          isChecked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            onToggleSelect(item.id, e.target.checked);
          }}
          colorScheme="brand"
        />

        <Box flex="1" minW="0" cursor="pointer" onClick={() => setExpanded((v) => !v)}>
          {/* 触发数 + 阶段 + 匹配类型 */}
          <HStack spacing={1.5} mb={1.5} flexWrap="wrap">
            <Badge
              colorScheme="gray"
              bg="gray.100"
              color="gray.600"
              borderRadius="full"
              fontSize="10px"
              px={2}
              fontWeight={700}
            >
              触发 {item.triggerCount}
            </Badge>
            <Badge
              colorScheme={STAGE_COLOR[item.stage]}
              borderRadius="full"
              fontSize="10px"
              px={2}
              fontWeight={600}
            >
              {STAGE_LABELS[item.stage]}
            </Badge>
            {item.matchType === 'fuzzy' && (
              <Badge colorScheme="teal" variant="subtle" borderRadius="full" fontSize="10px" px={2}>
                模糊
              </Badge>
            )}
          </HStack>

          {/* 问题 */}
          <Text fontSize="13.5px" fontWeight={600} color="gray.800" lineHeight={1.45}>
            {item.question}
          </Text>

          {/* 标签圆点 */}
          {item.tags.length > 0 && (
            <HStack spacing={1} mt={1.5}>
              {item.tags.map((t) => (
                <HStack key={t} spacing={1}>
                  <Box w="6px" h="6px" borderRadius="full" bg="brand.400" />
                  <Text fontSize="11px" color="gray.500">
                    {t}
                  </Text>
                </HStack>
              ))}
            </HStack>
          )}

          <HStack spacing={3} mt={1.5} align="center">
            <Text fontSize="11px" color="gray.400">
              更新于 {formatRelativeTime(item.updatedAt)}
            </Text>
            <HStack spacing={1} ml="auto">
              <IconButton
                aria-label="编辑"
                icon={<FiEdit2 size={13} />}
                size="xs"
                variant="ghost"
                color="gray.400"
                borderRadius="md"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                _hover={{ color: 'brand.500', bg: 'brand.50' }}
              />
              <IconButton
                aria-label="删除"
                icon={<FiTrash2 size={13} />}
                size="xs"
                variant="ghost"
                color="gray.400"
                borderRadius="md"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item);
                }}
                _hover={{ color: 'red.500', bg: 'red.50' }}
              />
              <Box
                as="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                color="gray.400"
                _hover={{ color: 'brand.500' }}
                display="flex"
              >
                <Icon as={expanded ? FiChevronDownSmall : FiChevronRight} boxSize={4} />
              </Box>
            </HStack>
          </HStack>
        </Box>
      </Flex>

      {/* 展开区：关联回复 + 关联问题 */}
      <Collapse in={expanded} animateOpacity>
        <Box px={3} pb={3} pt={0} borderTop="1px solid" borderColor="gray.100">
          <Box mt={3} bg="blue.50" borderRadius="md" p={3}>
            <Text fontSize="11px" fontWeight={700} color="blue.500" mb={1}>
              关联回复
            </Text>
            <Text fontSize="12.5px" color="gray.700" lineHeight={1.6}>
              {item.answer}
            </Text>
          </Box>

          {item.relatedQuestions.length > 0 && (
            <Box mt={2}>
              <Text fontSize="11px" fontWeight={700} color="gray.500" mb={1}>
                关联问题
              </Text>
              {item.relatedQuestions.map((rq, i) => (
                <Text
                  key={i}
                  fontSize="12px"
                  color="brand.600"
                  _hover={{ textDecoration: 'underline', cursor: 'pointer' }}
                  mb={0.5}
                >
                  · {rq}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

/* ════════════════════ 右侧统计面板 ════════════════════ */
const StatsPanel: React.FC<{
  stats: { total: number; presale: number; mid: number; aftersale: number };
  keyword: string;
  onKeyword: (v: string) => void;
  shop: string;
  onShop: (v: string) => void;
  stage: QAStage | 'all';
  onStage: (v: QAStage | 'all') => void;
}> = ({ stats, keyword, onKeyword, shop, onShop, stage, onStage }) => {
  const [showProductFilter, setShowProductFilter] = useState(false);

  const statCards = [
    { key: 'all' as const, label: '全部', value: stats.total, color: 'gray.600' },
    { key: 'presale' as const, label: '售前', value: stats.presale, color: 'blue.500' },
    { key: 'mid' as const, label: '售中', value: stats.mid, color: 'orange.500' },
    { key: 'aftersale' as const, label: '售后', value: stats.aftersale, color: 'purple.500' },
  ];

  return (
    <VStack spacing={3} align="stretch">
      {/* 标题 */}
      <Flex align="baseline" justify="space-between">
        <Text fontSize="14px" fontWeight={800} color="gray.700">
          问答知识库管理
        </Text>
        <Badge colorScheme="brand" borderRadius="full" px={2} fontSize="11px" fontWeight={700}>
          {stats.total} 条记录
        </Badge>
      </Flex>

      {/* 搜索框 */}
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none" h="full">
          <FiSearch color="#A0AEC0" />
        </InputLeftElement>
        <Input
          placeholder="搜索问题 / 回复 / 标签"
          value={keyword}
          onChange={(e) => onKeyword(e.target.value)}
          borderRadius="lg"
          bg="gray.50"
          borderColor="gray.200"
        />
      </InputGroup>

      {/* 计数行 */}
      <HStack spacing={1} flexWrap="wrap">
        {statCards.map((c) => (
          <Box
            key={c.key}
            flex="1"
            minW="64px"
            textAlign="center"
            bg={stage === c.key ? 'brand.50' : 'gray.50'}
            border="1px solid"
            borderColor={stage === c.key ? 'brand.300' : 'transparent'}
            borderRadius="lg"
            py={2}
            px={1}
            cursor="pointer"
            onClick={() => onStage(c.key)}
            transition="all 0.15s"
            _hover={{ bg: stage === c.key ? 'brand.50' : 'gray.100' }}
          >
            <Text fontSize="18px" fontWeight={800} color={c.color} lineHeight={1}>
              {c.value}
            </Text>
            <Text fontSize="10.5px" color="gray.500" mt={0.5}>
              {c.label}
            </Text>
          </Box>
        ))}
      </HStack>

      {/* 新增问答大按钮 */}
      <Button
        colorScheme="brand"
        size="md"
        leftIcon={<FiPlus />}
        borderRadius="lg"
        w="full"
        bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
        _hover={{ bgGradient: 'linear-gradient(135deg, #43529F, #2F5AC0)' }}
        h="42px"
      >
        新增问答
      </Button>

      {/* 操作按钮组 */}
      <SimpleGrid columns={2} spacing={2}>
        <ActionTile icon={FiUpload} label="上传语料训练" />
        <ActionTile icon={FiRefreshCw} label="同步历史记录" />
        <ActionTile icon={FiCopy} label="去重" />
        <ActionTile icon={FiBookmark} label="订阅知识库" />
      </SimpleGrid>

      <Divider borderColor="gray.100" />

      {/* 筛选 */}
      <VStack spacing={2} align="stretch">
        <Menu>
          <MenuButton
            as={Button}
            size="sm"
            variant="outline"
            rightIcon={<FiChevronDown />}
            borderRadius="lg"
            colorScheme="gray"
            w="full"
            justifyContent="space-between"
          >
            {SHOP_OPTIONS.find((s) => s.id === shop)?.name ?? '店铺筛选'}
          </MenuButton>
          <MenuList minW="180px">
            <MenuItem onClick={() => onShop('all')}>全部店铺</MenuItem>
            {SHOP_OPTIONS.map((s) => (
              <MenuItem key={s.id} onClick={() => onShop(s.id)}>
                {s.name}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Button
          size="sm"
          variant="outline"
          colorScheme="gray"
          leftIcon={<FiFilter />}
          rightIcon={<FiChevronDown />}
          borderRadius="lg"
          justifyContent="space-between"
          onClick={() => setShowProductFilter((v) => !v)}
        >
          高级筛选
        </Button>

        {/* 商品筛选折叠区 */}
        <Collapse in={showProductFilter} animateOpacity>
          <Box
            bg="gray.50"
            borderRadius="lg"
            p={3}
            border="1px solid"
            borderColor="gray.100"
          >
            <Text fontSize="11px" fontWeight={700} color="gray.500" mb={2}>
              商品筛选
            </Text>
            <VStack spacing={1.5} align="stretch">
              {['纯棉T恤', '实木书桌', '蓝牙耳机', '婴儿连体衣'].map((p) => (
                <Checkbox key={p} size="sm" colorScheme="brand" defaultChecked>
                  {p}
                </Checkbox>
              ))}
            </VStack>
          </Box>
        </Collapse>
      </VStack>
    </VStack>
  );
};

const ActionTile: React.FC<{ icon: React.ElementType; label: string }> = ({
  icon,
  label,
}) => (
  <Button
    variant="outline"
    colorScheme="gray"
    size="sm"
    borderRadius="lg"
    h="auto"
    py={2.5}
    flexDir="column"
    gap={1}
    fontSize="11px"
    fontWeight={600}
    color="gray.600"
    _hover={{ borderColor: 'brand.300', color: 'brand.600', bg: 'brand.50' }}
  >
    <Icon as={icon} boxSize={4} />
    {label}
  </Button>
);

/* ════════════════════ 主组件：三栏布局 ════════════════════ */
const StoreKnowledgeBase: React.FC = () => {
  const toast = useToast();
  const [keyword, setKeyword] = useState('');
  const [shop, setShop] = useState('all');
  const [stage, setStage] = useState<QAStage | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QAItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    presale: 0,
    mid: 0,
    aftersale: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchStoreQAList({ keyword, shop, stage, page, pageSize });
      setItems(res.list);
      setTotal(res.total);
      setStats(res.stats);
    } catch {
      toast({ title: '加载失败', status: 'error', duration: 2000, isClosest: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, shop, stage, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Flex h="full" gap={4} align="stretch">
      {/* ══ 左列：QA 列表 ══ */}
      <Box flex="1" minW="0" display="flex" flexDirection="column">
        <Flex align="center" justify="space-between" mb={3}>
          <Box>
            <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
              店铺知识库
            </Text>
            <Text fontSize="12.5px" color="gray.400" mt={0.5}>
              管理店铺级问答知识，自动学习客服历史对话
            </Text>
          </Box>
          {selectedIds.size > 0 && (
            <Badge colorScheme="brand" borderRadius="full" px={2}>
              已选 {selectedIds.size} 项
            </Badge>
          )}
        </Flex>

        <Box flex="1" minH="0" overflowY="auto" pr={1}>
          {loading ? (
            <Flex justify="center" align="center" h="300px">
              <Spinner size="lg" color="brand.500" />
            </Flex>
          ) : items.length === 0 ? (
            <Flex direction="column" align="center" justify="center" h="300px" color="gray.400">
              <Box fontSize="40px" mb={3}>📚</Box>
              <Text fontSize="14px">暂无匹配的知识条目</Text>
            </Flex>
          ) : (
            <VStack spacing={0} align="stretch">
              {items.map((it) => (
                <QAListItem
                  key={it.id}
                  item={it}
                  selected={selectedIds.has(it.id)}
                  onToggleSelect={(id, checked) =>
                    setSelectedIds((prev) => {
                      const n = new Set(prev);
                      checked ? n.add(id) : n.delete(id);
                      return n;
                    })
                  }
                  onEdit={(it) =>
                    toast({ title: `编辑：${it.question.slice(0, 10)}…`, status: 'info', duration: 1500, isClosest: true })
                  }
                  onDelete={(it) =>
                    toast({ title: `删除：${it.question.slice(0, 10)}…`, status: 'warning', duration: 1500, isClosest: true })
                  }
                />
              ))}
            </VStack>
          )}
        </Box>

        {/* 底部分页 */}
        {!loading && items.length > 0 && (
          <Flex align="center" justify="space-between" pt={3} fontSize="13px" color="gray.500">
            <Text>共 {total} 条</Text>
            <HStack spacing={1}>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={page <= 1}
                borderRadius="lg"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Text>第 {page} / {totalPages} 页</Text>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={page >= totalPages}
                borderRadius="lg"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </HStack>
          </Flex>
        )}
      </Box>

      {/* ══ 右列：统计面板 ══ */}
      <Box
        w="300px"
        flexShrink={0}
        bg="white"
        borderRadius="xl"
        border="1px solid"
        borderColor="gray.100"
        boxShadow="sm"
        p={4}
        overflowY="auto"
      >
        <StatsPanel
          stats={stats}
          keyword={keyword}
          onKeyword={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          shop={shop}
          onShop={(v) => {
            setShop(v);
            setPage(1);
          }}
          stage={stage}
          onStage={(v) => {
            setStage(v);
            setPage(1);
          }}
        />
      </Box>
    </Flex>
  );
};

export default React.memo(StoreKnowledgeBase);
