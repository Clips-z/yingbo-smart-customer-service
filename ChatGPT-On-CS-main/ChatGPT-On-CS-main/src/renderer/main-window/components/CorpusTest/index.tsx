import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Input,
  Textarea,
  Badge,
  Icon,
  useToast,
  Spinner,
  VStack,
  HStack,
  Divider,
  Progress,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  FiSend,
  FiCheckCircle,
  FiXCircle,
  FiHistory,
  FiTag,
} from 'react-icons/fi';
import {
  fetchStoreQAList,
  QAItem,
  STAGE_LABELS,
} from '../../../common/services/knowledge/storeKB';
import { runCorpusTest, CorpusTestResult } from '../../../common/services/knowledge/corpusTest';

const SUGGESTED = [
  '这款衣服会缩水吗？',
  '支持七天无理由退换货吗？',
  '下单后多久发货？',
  '收到货发现有瑕疵怎么办？',
];

const STAGE_COLOR: Record<string, string> = {
  presale: 'blue',
  mid: 'orange',
  aftersale: 'purple',
};

/* ════════════════════ 结果卡片 ════════════════════ */
const ResultCard: React.FC<{ result: CorpusTestResult; rank: number }> = ({ result, rank }) => {
  const { matched, score } = result;
  if (!matched) {
    return (
      <Box bg="white" borderRadius="xl" border="1px solid" borderColor="red.100" p={4}>
        <Flex align="center" gap={2} color="red.500">
          <Icon as={FiXCircle} boxSize={4} />
          <Text fontWeight={700} fontSize="13px">未命中知识库</Text>
        </Flex>
        <Text fontSize="12px" color="gray.500" mt={2}>
          该问题暂无匹配的知识条目，建议前往「店铺知识库」补充相关问答。
        </Text>
      </Box>
    );
  }
  const scoreColor = score >= 70 ? 'green' : score >= 40 ? 'orange' : 'gray';
  return (
    <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" p={4} boxShadow="sm">
      <Flex align="center" justify="space-between" mb={2}>
        <HStack spacing={2}>
          {rank === 1 && (
            <Badge colorScheme="green" borderRadius="full" fontSize="10px" px={2}>最佳匹配</Badge>
          )}
          <Badge colorScheme={STAGE_COLOR[matched.stage]} borderRadius="full" fontSize="10px" px={2}>
            {STAGE_LABELS[matched.stage]}
          </Badge>
        </HStack>
        <HStack spacing={1}>
          <Text fontSize="11px" color="gray.400">匹配度</Text>
          <Text fontSize="13px" fontWeight={800} color={`${scoreColor}.500`}>{score}%</Text>
        </HStack>
      </Flex>

      <Text fontSize="12px" fontWeight={600} color="gray.700" mb={1}>
        Q：{matched.question}
      </Text>
      <Box bg="blue.50" borderRadius="md" p={3} mt={2}>
        <Text fontSize="11px" fontWeight={700} color="blue.500" mb={1}>A：关联回复</Text>
        <Text fontSize="12.5px" color="gray.700" lineHeight={1.6}>
          {matched.answer}
        </Text>
      </Box>

      <Progress
        value={score}
        size="xs"
        colorScheme={scoreColor}
        borderRadius="full"
        mt={3}
        bg="gray.100"
      />
    </Box>
  );
};

/* ════════════════════ 主组件 ════════════════════ */
const CorpusTest: React.FC = () => {
  const toast = useToast();
  const [corpus, setCorpus] = useState<QAItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<CorpusTestResult | null>(null);
  const [history, setHistory] = useState<CorpusTestResult[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchStoreQAList({ page: 1, pageSize: 100 });
        setCorpus(res.list);
      } catch (err) {
        console.error('[CorpusTest] load failed:', err);
        toast({ title: '知识库加载失败', status: 'error', duration: 2000, isClosest: true });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runTest = (q: string) => {
    const text = q.trim();
    if (!text) {
      toast({ title: '请输入测试问题', status: 'warning', duration: 1500, isClosest: true });
      return;
    }
    setTesting(true);
    // 模拟推理延迟
    setTimeout(() => {
      const res = runCorpusTest(text, corpus);
      setResult(res);
      setHistory((prev) => [res, ...prev].slice(0, 8));
      setTesting(false);
    }, 500);
  };

  const matchedCount = useMemo(
    () => corpus.length,
    [corpus]
  );

  return (
    <VStack spacing={4} align="stretch" h="full">
      <Box pt={1}>
        <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
          问答语料测试
        </Text>
        <Text fontSize="12.5px" color="gray.400" mt={0.5}>
          输入客户问题，验证知识库命中效果与回复质量（共 {matchedCount} 条知识参与匹配）
        </Text>
      </Box>

      <Flex gap={4} align="stretch" flex="1" minH="0">
        {/* 左：输入 + 历史 */}
        <VStack w="320px" flexShrink={0} spacing={3} align="stretch">
          <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm" p={4}>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入要测试的客户问题，如：这件衣服会缩水吗？"
              size="sm"
              rows={3}
              borderRadius="lg"
              resize="none"
              bg="gray.50"
              borderColor="gray.200"
            />
            <Button
              mt={3}
              w="full"
              size="sm"
              colorScheme="brand"
              leftIcon={<FiSend />}
              isLoading={testing}
              onClick={() => runTest(query)}
              borderRadius="lg"
              bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
              _hover={{ bgGradient: 'linear-gradient(135deg, #43529F, #2F5AC0)' }}
            >
              模拟发送
            </Button>

            <Text fontSize="11px" color="gray.400" mt={3} mb={1}>试试这些：</Text>
            <Flex wrap="wrap" gap={1.5}>
              {SUGGESTED.map((s) => (
                <Button
                  key={s}
                  size="xs"
                  variant="outline"
                  colorScheme="gray"
                  borderRadius="full"
                  onClick={() => { setQuery(s); runTest(s); }}
                  _hover={{ borderColor: 'brand.300', color: 'brand.600' }}
                >
                  {s}
                </Button>
              ))}
            </Flex>
          </Box>

          {/* 历史 */}
          <Box flex="1" minH="0" overflowY="auto" bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm" p={3}>
            <HStack mb={2}>
              <Icon as={FiHistory} color="gray.400" boxSize={3.5} />
              <Text fontSize="12px" fontWeight={700} color="gray.600">测试历史</Text>
            </HStack>
            {history.length === 0 ? (
              <Text fontSize="11px" color="gray.400">暂无测试记录</Text>
            ) : (
              <VStack spacing={2} align="stretch">
                {history.map((h, i) => (
                  <Box
                    key={i}
                    p={2}
                    borderRadius="md"
                    bg="gray.50"
                    cursor="pointer"
                    onClick={() => setResult(h)}
                    _hover={{ bg: 'brand.50' }}
                  >
                    <Flex align="center" justify="space-between">
                      <Text fontSize="11px" color="gray.600" noOfLines={1} flex="1" mr={2}>
                        {h.query}
                      </Text>
                      <Badge
                        colorScheme={h.matched ? (h.score >= 70 ? 'green' : 'orange') : 'red'}
                        borderRadius="full"
                        fontSize="9px"
                        px={1.5}
                      >
                        {h.matched ? `${h.score}%` : '未命中'}
                      </Badge>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            )}
          </Box>
        </VStack>

        {/* 右：结果 */}
        <Box flex="1" minW="0" bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm" p={4} overflowY="auto">
          {loading ? (
            <Flex justify="center" align="center" h="full">
              <Spinner size="lg" color="brand.500" />
            </Flex>
          ) : !result ? (
            <Flex direction="column" align="center" justify="center" h="full" color="gray.300">
              <Icon as={FiSend} boxSize={10} mb={3} />
              <Text fontSize="13px">在左侧输入问题并点击「模拟发送」查看命中结果</Text>
            </Flex>
          ) : (
            <VStack spacing={3} align="stretch">
              <Flex align="center" gap={2}>
                <Icon as={result.matched ? FiCheckCircle : FiXCircle} color={result.matched ? 'green.500' : 'red.500'} boxSize={4} />
                <Text fontSize="14px" fontWeight={700} color="gray.700">
                  {result.matched ? '命中知识库' : '未命中'}
                </Text>
                <Text fontSize="11px" color="gray.400">查询：{result.query}</Text>
              </Flex>
              <Divider borderColor="gray.100" />
              {result.candidates.length === 0 ? (
                <ResultCard result={result} rank={1} />
              ) : (
                result.candidates.map((c, i) => (
                  <ResultCard
                    key={c.item.id}
                    result={{ query: result.query, matched: c.item, score: c.score, candidates: [] }}
                    rank={i + 1}
                  />
                ))
              )}
            </VStack>
          )}
        </Box>
      </Flex>
    </VStack>
  );
};

export default React.memo(CorpusTest);
