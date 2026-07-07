import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Badge,
  Button,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Switch,
  Select,
  useToast,
  Spinner,
  HStack,
  VStack,
  Icon,
  Divider,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  SimpleGrid,
  Tooltip,
} from '@chakra-ui/react';
import {
  FiSearch,
  FiPlus,
  FiTrash2,
  FiShield,
  FiAlertTriangle,
} from 'react-icons/fi';
import {
  fetchSecurityOverview,
  fetchSensitiveWords,
  addSensitiveWord,
  deleteSensitiveWord,
  updatePolicy,
  SensitiveWord,
  SensitiveCategory,
  SECURITY_CONST,
} from '../../../common/services/knowledge/contentSecurity';

const { CATEGORY_LABELS, CATEGORY_COLORS, ACTION_LABELS } = SECURITY_CONST;

/* ════════════════════ 新增敏感词弹窗 ════════════════════ */
const WordModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (word: string, category: SensitiveCategory, action: SensitiveWord['action']) => void;
  categories: SensitiveCategory[];
}> = ({ isOpen, onClose, onSubmit, categories }) => {
  const [word, setWord] = useState('');
  const [category, setCategory] = useState<SensitiveCategory>('competitor');
  const [action, setAction] = useState<SensitiveWord['action']>('block');

  useEffect(() => { if (isOpen) { setWord(''); setCategory('competitor'); setAction('block'); } }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay bg="blackAlpha.400" />
      <ModalContent borderRadius="xl">
        <ModalHeader fontSize="16px" fontWeight={800}>新增敏感词</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={2}>
          <VStack spacing={3} align="stretch">
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>敏感词</FormLabel>
              <Input size="sm" borderRadius="lg" placeholder="如：加微信" value={word} onChange={(e) => setWord(e.target.value)} autoFocus />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>分类</FormLabel>
              <Select size="sm" borderRadius="lg" value={category} onChange={(e) => setCategory(e.target.value as SensitiveCategory)}>
                {categories.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>命中动作</FormLabel>
              <Select size="sm" borderRadius="lg" value={action} onChange={(e) => setAction(e.target.value as SensitiveWord['action'])}>
                <option value="block">拦截</option>
                <option value="review">转人工审核</option>
                <option value="replace">替换</option>
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="ghost" mr={2} onClick={onClose} borderRadius="lg">取消</Button>
          <Button
            size="sm" colorScheme="brand" isDisabled={!word.trim()}
            onClick={() => onSubmit(word.trim(), category, action)}
            borderRadius="lg"
            bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
          >
            添加
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ════════════════════ 主组件 ════════════════════ */
const ContentSecurity: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<SensitiveWord[]>([]);
  const [overview, setOverview] = useState<{ totalWords: number; byCategory: Record<string, number>; policy: any } | null>(null);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ov, ws] = await Promise.all([fetchSecurityOverview(), fetchSensitiveWords()]);
      setOverview(ov);
      setWords(ws);
    } catch {
      toast({ title: '加载失败', status: 'error', duration: 2000, isClosest: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (word: string, category: SensitiveCategory, action: SensitiveWord['action']) => {
    await addSensitiveWord(word, category, action);
    setModalOpen(false);
    await load();
    toast({ title: `已添加「${word}」`, status: 'success', duration: 1800, isClosest: true });
  };

  const handleDelete = async (w: SensitiveWord) => {
    await deleteSensitiveWord(w.id);
    await load();
    toast({ title: `已删除「${w.word}」`, status: 'warning', duration: 1500, isClosest: true });
  };

  const togglePolicy = async (key: 'filterEnabled' | 'riskTipEnabled' | 'manualReviewEnabled') => {
    const next = !overview!.policy[key];
    setOverview((prev) => prev ? { ...prev, policy: { ...prev.policy, [key]: next } } : prev);
    await updatePolicy({ [key]: next });
  };

  const filtered = keyword.trim()
    ? words.filter((w) => w.word.includes(keyword.trim()))
    : words;

  const categoryList = Object.keys(CATEGORY_LABELS) as SensitiveCategory[];

  if (loading || !overview) {
    return (
      <Flex justify="center" align="center" h="400px">
        <Spinner size="lg" color="brand.500" />
      </Flex>
    );
  }

  return (
    <VStack spacing={4} align="stretch" h="full">
      <Box pt={1}>
        <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
          内容安全
        </Text>
        <Text fontSize="12.5px" color="gray.400" mt={0.5}>
          敏感词过滤与内容审核，保障客服对话合规安全
        </Text>
      </Box>

      {/* 风险等级统计 */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
        <StatTile icon={<FiShield />} label="敏感词总数" value={overview.totalWords} color="brand" />
        <StatTile icon={<FiAlertTriangle />} label="竞品导流词" value={overview.byCategory.competitor} color="purple" />
        <StatTile icon={<FiAlertTriangle />} label="辱骂攻击词" value={overview.byCategory.insult} color="orange" />
        <StatTile icon={<FiShield />} label="隐私信息词" value={overview.byCategory.privacy} color="blue" />
      </SimpleGrid>

      <Flex gap={4} align="stretch" flex="1" minH="0">
        {/* 左：审核策略 */}
        <VStack w="280px" flexShrink={0} spacing={3} align="stretch">
          <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm" p={4}>
            <Text fontSize="13px" fontWeight={800} color="gray.700" mb={3}>审核策略</Text>
            <VStack spacing={3} align="stretch">
              <PolicyRow label="敏感词过滤" desc="命中敏感词时执行对应动作" checked={overview.policy.filterEnabled} onChange={() => togglePolicy('filterEnabled')} />
              <PolicyRow label="风险提示" desc="高风险对话向客服弹窗提示" checked={overview.policy.riskTipEnabled} onChange={() => togglePolicy('riskTipEnabled')} />
              <PolicyRow label="人工审核" desc="超阈值对话自动转人工" checked={overview.policy.manualReviewEnabled} onChange={() => togglePolicy('manualReviewEnabled')} />
            </VStack>
            <Divider my={3} borderColor="gray.100" />
            <Flex align="center" justify="space-between">
              <Box>
                <Text fontSize="12px" fontWeight={600} color="gray.700">人工审核阈值</Text>
                <Text fontSize="10px" color="gray.400">风险分 ≥ {overview.policy.reviewThreshold}</Text>
              </Box>
              <HStack spacing={1}>
                <Button size="xs" variant="outline" borderRadius="md" onClick={() => updatePolicy({ reviewThreshold: Math.max(0, overview.policy.reviewThreshold - 10) }).then(load)}>
                  −
                </Button>
                <Text fontSize="13px" fontWeight={800} color="gray.700" w="30px" textAlign="center">{overview.policy.reviewThreshold}</Text>
                <Button size="xs" variant="outline" borderRadius="md" onClick={() => updatePolicy({ reviewThreshold: Math.min(100, overview.policy.reviewThreshold + 10) }).then(load)}>
                  +
                </Button>
              </HStack>
            </Flex>
          </Box>
        </VStack>

        {/* 右：敏感词库 */}
        <Box flex="1" minW="0" bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm" p={4} display="flex" flexDirection="column">
          <Flex align="center" justify="space-between" mb={3}>
            <Text fontSize="13px" fontWeight={800} color="gray.700">
              敏感词库 <Badge colorScheme="brand" borderRadius="full" ml={1}>{words.length}</Badge>
            </Text>
            <Button size="sm" colorScheme="brand" leftIcon={<FiPlus />} borderRadius="lg" bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)" onClick={() => setModalOpen(true)}>
              新增
            </Button>
          </Flex>

          <InputGroup size="sm" mb={3}>
            <InputLeftElement pointerEvents="none" h="full"><FiSearch color="#A0AEC0" /></InputLeftElement>
            <Input
              placeholder="搜索敏感词"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              borderRadius="lg"
              bg="gray.50"
              borderColor="gray.200"
            />
          </InputGroup>

          <Box flex="1" minH="0" overflowY="auto" pr={1}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
              {filtered.map((w) => (
                <Flex
                  key={w.id}
                  align="center"
                  gap={2}
                  p={2.5}
                  borderRadius="lg"
                  bg="gray.50"
                  _hover={{ bg: 'gray.100' }}
                >
                  <Icon as={FiShield} color={`${CATEGORY_COLORS[w.category]}.400`} boxSize={3.5} />
                  <Box flex="1" minW="0">
                    <Text fontSize="12.5px" fontWeight={600} color="gray.800" noOfLines={1}>{w.word}</Text>
                    <HStack spacing={1} mt={0.5}>
                      <Badge colorScheme={CATEGORY_COLORS[w.category]} variant="subtle" borderRadius="full" fontSize="9px" px={1.5}>
                        {CATEGORY_LABELS[w.category]}
                      </Badge>
                      <Badge colorScheme="gray" bg="gray.200" color="gray.600" borderRadius="full" fontSize="9px" px={1.5}>
                        {ACTION_LABELS[w.action]}
                      </Badge>
                    </HStack>
                  </Box>
                  <IconButton
                    aria-label="删除"
                    icon={<FiTrash2 size={13} />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    borderRadius="md"
                    onClick={() => handleDelete(w)}
                    _hover={{ color: 'red.500', bg: 'red.50' }}
                  />
                </Flex>
              ))}
            </SimpleGrid>
            {filtered.length === 0 && (
              <Flex justify="center" align="center" h="100px" color="gray.400" fontSize="12px">
                无匹配敏感词
              </Flex>
            )}
          </Box>
        </Box>
      </Flex>

      <WordModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAdd}
        categories={categoryList}
      />
    </VStack>
  );
};

/* ── 统计卡片 ── */
const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: number; color: string }> = ({
  icon, label, value, color,
}) => (
  <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm" p={3}>
    <Flex align="center" gap={2} mb={1}>
      <Icon as={FiShield} color={`${color}.400`} boxSize={4} />
      <Text fontSize="11px" color="gray.500">{label}</Text>
    </Flex>
    <Text fontSize="22px" fontWeight={800} color="gray.800">{value}</Text>
  </Box>
);

/* ── 策略行 ── */
const PolicyRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: () => void }> = ({
  label, desc, checked, onChange,
}) => (
  <Flex align="center" justify="space-between">
    <Box>
      <Text fontSize="12.5px" fontWeight={600} color="gray.700">{label}</Text>
      <Text fontSize="10px" color="gray.400">{desc}</Text>
    </Box>
    <Switch size="sm" colorScheme="brand" isChecked={checked} onChange={onChange} />
  </Flex>
);

export default React.memo(ContentSecurity);
