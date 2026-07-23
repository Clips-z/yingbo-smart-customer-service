import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Textarea,
  Badge,
  Icon,
  useToast,
  Spinner,
  VStack,
  HStack,
  Divider,
  Progress,
  Input,
} from '@chakra-ui/react';
import {
  FiSend,
  FiCheckCircle,
  FiXCircle,
  FiClock,
} from 'react-icons/fi';
import {
  fetchStoreQAList,
  QAItem,
  STAGE_LABELS,
} from '../../../common/services/knowledge/storeKB';
import {
  runCorpusTest,
  CorpusTestResult,
  EvaluationSummary,
  runSavedEvaluation,
  saveEvaluationCase,
  deleteEvaluationCase,
  EvaluationCaseItem,
  fetchEvaluationCases,
  compareEvaluationVariants,
  fetchEvaluationRuns,
  fetchVariantFeedback,
} from '../../../common/services/knowledge/corpusTest';

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
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [savedCases, setSavedCases] = useState<EvaluationCaseItem[]>([]);
  const [editingCaseId, setEditingCaseId] = useState<string | undefined>();
  const [comparison, setComparison] = useState<{ winner: string; variants: Array<{ name: string; hitRate: number; averageLatencyMs: number }> } | null>(null);
  const [variantA, setVariantA] = useState({ name: '精确 Top3', topK: 3 });
  const [variantB, setVariantB] = useState({ name: '召回 Top5', topK: 5 });
  const [variantFeedback, setVariantFeedback] = useState<Array<{ variant: string; totalActions: number; acceptanceRate: number; averageEditRatio: number }>>([]);
  const [comparisonRuns, setComparisonRuns] = useState<Array<{ id: string; winner: string; created_at: string; results: Array<{ name: string; hitRate: number }> }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchStoreQAList({ page: 1, pageSize: 100 });
        setCorpus(res.list);
        setSavedCases(await fetchEvaluationCases());
        setComparisonRuns(await fetchEvaluationRuns());
      } catch {
        toast({ title: '知识库加载失败', status: 'error', duration: 2000, isClosable: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const runTest = async (q: string) => {
    const text = q.trim();
    if (!text) {
      toast({ title: '请输入测试问题', status: 'warning', duration: 1500, isClosable: true });
      return;
    }
    setTesting(true);
    try {
      const res = await runCorpusTest(text);
      setResult(res);
      setHistory((prev) => [res, ...prev].slice(0, 8));
    } catch (error) {
      toast({ title: '真实检索失败', description: String(error), status: 'error', duration: 2500 });
    } finally {
      setTesting(false);
    }
  };

  const saveCase = async () => {
    const text = query.trim();
    if (!text) return;
    await saveEvaluationCase(text, result?.matched ? [result.matched.id] : [], editingCaseId);
    setSavedCases(await fetchEvaluationCases());
    setEditingCaseId(undefined);
    toast({ title: editingCaseId ? '测试用例已更新' : '已保存为回归测试用例', status: 'success', duration: 1800 });
  };

  const runRegression = async () => {
    setTesting(true);
    try { setSummary(await runSavedEvaluation()); }
    finally { setTesting(false); }
  };

  const exportSummary = () => {
    if (!summary) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `knowledge-evaluation-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
              真实检索
            </Button>
            <Flex mt={2} gap={2}>
              <Button size="xs" flex="1" variant="outline" onClick={saveCase} isDisabled={!query.trim()}>保存为测试用例</Button>
              <Button size="xs" flex="1" variant="outline" onClick={runRegression}>运行回归集</Button>
            </Flex>
            <Flex mt={2} gap={2}><Input size="xs" value={variantA.name} onChange={(event) => setVariantA({ ...variantA, name: event.target.value })} /><Input size="xs" w="70px" type="number" min="1" max="20" value={variantA.topK} onChange={(event) => setVariantA({ ...variantA, topK: Number(event.target.value) || 1 })} /><Text fontSize="xs" alignSelf="center">vs</Text><Input size="xs" value={variantB.name} onChange={(event) => setVariantB({ ...variantB, name: event.target.value })} /><Input size="xs" w="70px" type="number" min="1" max="20" value={variantB.topK} onChange={(event) => setVariantB({ ...variantB, topK: Number(event.target.value) || 1 })} /></Flex>
            <Button mt={2} size="xs" w="full" variant="outline" colorScheme="purple" onClick={async () => { setComparison(await compareEvaluationVariants(variantA, variantB)); setComparisonRuns(await fetchEvaluationRuns()); }}>对比两套方案</Button>
            {comparison && <Box mt={2} bg="purple.50" borderRadius="md" p={2}><Text fontSize="11px" fontWeight="700">建议：{comparison.winner}</Text>{comparison.variants.map((variant) => <Text key={variant.name} fontSize="10px">{variant.name}：命中 {variant.hitRate}% · {variant.averageLatencyMs}ms</Text>)}</Box>}
            {comparisonRuns.slice(0, 3).map((run) => <Text key={run.id} mt={1} fontSize="10px" color="gray.500">{new Date(run.created_at).toLocaleString()} · 胜出：{run.winner} · {run.results.map((item) => `${item.name} ${item.hitRate}%`).join(' / ')}</Text>)}
            <Button mt={2} size="xs" w="full" variant="outline" onClick={async () => setVariantFeedback(await fetchVariantFeedback())}>查看近 30 天人工反馈</Button>
            {variantFeedback.map((item) => <Text key={item.variant} mt={1} fontSize="10px" color="gray.600">{item.variant}：{item.totalActions} 次反馈 · 采纳 {item.acceptanceRate}% · 平均改写 {Math.round(item.averageEditRatio * 100)}%</Text>)}
            {summary && (
              <Box mt={3} bg="green.50" borderRadius="md" p={2}>
                <Text fontSize="11px" fontWeight="700">回归集 {summary.total} 条 · Hit@1 {summary.hitAt1}% · Hit@5 {summary.hitAt5}%</Text>
                <Text fontSize="10px" color="gray.500">未命中 {summary.noHitRate}% · 风险误放 {summary.unsafePassCount} · P95 {summary.p95LatencyMs}ms</Text>
                <Button mt={1} size="xs" variant="link" onClick={exportSummary}>导出本次报告 JSON</Button>
              </Box>
            )}

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
              <Icon as={FiClock} color="gray.400" boxSize={3.5} />
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
            <Divider my={3} />
            <Text fontSize="12px" fontWeight={700} color="gray.600" mb={2}>已保存回归用例（{savedCases.length}）</Text>
            <VStack spacing={1.5} align="stretch">
              {savedCases.slice(0, 20).map((item) => (
                <Flex key={item.id} bg={editingCaseId === item.id ? 'blue.50' : 'gray.50'} borderRadius="md" p={2} gap={2} align="center">
                  <Text fontSize="11px" flex="1" noOfLines={1}>{item.question}</Text>
                  <Button size="xs" variant="link" onClick={() => { setQuery(item.question); setEditingCaseId(item.id); }}>编辑</Button>
                  <Button size="xs" variant="link" colorScheme="red" onClick={async () => { await deleteEvaluationCase(item.id); setSavedCases(await fetchEvaluationCases()); }}>删除</Button>
                </Flex>
              ))}
            </VStack>
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
                  <Text fontSize="11px" color="gray.400">查询：{result.query} · {result.latencyMs}ms</Text>
              </Flex>
              <Divider borderColor="gray.100" />
              {result.candidates.length === 0 ? (
                <ResultCard result={result} rank={1} />
              ) : (
                result.candidates.map((c, i) => (
                  <ResultCard
                    key={c.item.id}
                    result={{
                      query: result.query,
                      matched: c.item,
                      score: c.score,
                      candidates: [],
                      latencyMs: result.latencyMs,
                      retrievalStatus: result.retrievalStatus,
                    }}
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
