import React, { useCallback, useState, useEffect } from 'react';
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
  Switch,
  Textarea,
  useToast,
  Spinner,
  Icon,
  Collapse,
  SimpleGrid,
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
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  useDisclosure,
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
  FiFilter,
  FiDownload,
} from 'react-icons/fi';
import {
  fetchStoreQAList,
  addQA,
  updateQA,
  deleteQA,
  QAItem,
  QAStage,
  QAMatchType,
  STAGE_LABELS,
  SHOP_OPTIONS,
  formatRelativeTime,
  retryStoreKnowledgeSync,
  bulkImportStoreKnowledge,
  fetchStoreKnowledgeVersions,
  rollbackStoreKnowledge,
  KnowledgeVersionItem,
  previewStoreKnowledgeMerge,
  mergeStoreKnowledge,
} from '../../../common/services/knowledge/storeKB';
import {
  parseStoreImport,
  StoreImportPreview,
} from '../../../common/services/knowledge/knowledgeImport';
import { downloadKnowledgeExport } from '../../../common/services/knowledge/knowledgeExport';

const STAGE_COLOR: Record<QAStage, string> = { presale: 'blue', mid: 'orange', aftersale: 'purple' };

/* ════════════════════ 新增/编辑 QA 弹窗 ════════════════════ */
const QAEditModal: React.FC<{
  isOpen: boolean;
  editing: QAItem | null;
  onClose: () => void;
  onSubmit: (data: {
    question: string; answer: string; relatedQuestions: string[];
    stage: QAStage; tags: string[]; matchType: QAMatchType; enabled: boolean;
    effectiveAt?: string; expiresAt?: string;
  }) => void;
}> = ({ isOpen, editing, onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [relatedQuestions, setRelatedQuestions] = useState('');
  const [stage, setStage] = useState<QAStage>('presale');
  const [tags, setTags] = useState('');
  const [matchType, setMatchType] = useState<QAMatchType>('exact');
  const [enabled, setEnabled] = useState(true);
  const [effectiveAt, setEffectiveAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (isOpen) {
      setQuestion(editing?.question ?? '');
      setAnswer(editing?.answer ?? '');
      setRelatedQuestions((editing?.relatedQuestions ?? []).join('\n'));
      setStage(editing?.stage ?? 'presale');
      setTags((editing?.tags ?? []).join('、'));
      setMatchType(editing?.matchType ?? 'exact');
      setEnabled(editing?.enabled !== false);
      setEffectiveAt(editing?.effectiveAt?.slice(0, 16) ?? '');
      setExpiresAt(editing?.expiresAt?.slice(0, 16) ?? '');
    }
  }, [isOpen, editing]);

  const valid = question.trim() && answer.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.400" />
      <ModalContent borderRadius="xl" maxH="90vh">
        <ModalHeader fontSize="16px" fontWeight={800}>{editing ? '编辑问答' : '新增问答'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={2}>
          <VStack spacing={3} align="stretch">
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>问题</FormLabel>
              <Textarea size="sm" rows={2} borderRadius="lg" placeholder="客户常问的问题" value={question} onChange={(e) => setQuestion(e.target.value)} bg="gray.50" borderColor="gray.200" />
            </FormControl>
            <Flex align="center" justify="space-between" bg="gray.50" p={3} borderRadius="lg">
              <Box>
                <Text fontSize="12.5px" fontWeight={600} color="gray.700">参与智能回复</Text>
                <Text fontSize="10px" color="gray.400">关闭后仍可查看、编辑和导出，但不会参与检索</Text>
              </Box>
              <Switch size="sm" colorScheme="green" isChecked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            </Flex>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>关联回复</FormLabel>
              <Textarea size="sm" rows={3} borderRadius="lg" placeholder="AI 客服应回复的内容" value={answer} onChange={(e) => setAnswer(e.target.value)} bg="gray.50" borderColor="gray.200" />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>关联问题（每行一条，选填）</FormLabel>
              <Textarea size="sm" rows={2} borderRadius="lg" placeholder={'相似问法1\n相似问法2'} value={relatedQuestions} onChange={(e) => setRelatedQuestions(e.target.value)} bg="gray.50" borderColor="gray.200" />
            </FormControl>
            <Flex gap={3}>
              <FormControl flex="1">
                <FormLabel fontSize="12px" color="gray.600" mb={1}>阶段分类</FormLabel>
                <Select size="sm" borderRadius="lg" value={stage} onChange={(e) => setStage(e.target.value as QAStage)}>
                  <option value="presale">售前</option>
                  <option value="mid">售中</option>
                  <option value="aftersale">售后</option>
                </Select>
              </FormControl>
              <FormControl flex="1">
                <FormLabel fontSize="12px" color="gray.600" mb={1}>匹配类型</FormLabel>
                <Select size="sm" borderRadius="lg" value={matchType} onChange={(e) => setMatchType(e.target.value as QAMatchType)}>
                  <option value="exact">精确匹配</option>
                  <option value="fuzzy">模糊匹配</option>
                </Select>
              </FormControl>
            </Flex>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>标签（顿号分隔，选填）</FormLabel>
              <Input size="sm" borderRadius="lg" placeholder="如：物流、退换" value={tags} onChange={(e) => setTags(e.target.value)} bg="gray.50" borderColor="gray.200" />
            </FormControl>
            <Flex gap={3}>
              <FormControl><FormLabel fontSize="12px" color="gray.600" mb={1}>生效时间（选填）</FormLabel><Input size="sm" type="datetime-local" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} /></FormControl>
              <FormControl><FormLabel fontSize="12px" color="gray.600" mb={1}>失效时间（选填）</FormLabel><Input size="sm" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></FormControl>
            </Flex>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="ghost" mr={2} onClick={onClose} borderRadius="lg">取消</Button>
          <Button size="sm" colorScheme="brand" isDisabled={!valid}
            onClick={() => onSubmit({
              question: question.trim(), answer: answer.trim(),
              relatedQuestions: relatedQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
              stage, tags: tags.split('、').map((s) => s.trim()).filter(Boolean), matchType, enabled,
              effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : undefined,
              expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            })}
            borderRadius="lg"
            bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
          >
            {editing ? '保存修改' : '创建问答'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ════════════════════ QA 列表项 ════════════════════ */
const QAListItem: React.FC<{
  item: QAItem;
  selected: boolean;
  defaultExpanded?: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (item: QAItem) => void;
  onRequestDelete: (item: QAItem) => void;
  onRetrySync: (id: string) => void;
  onRollback: (id: string, version: number) => void;
}> = ({ item, selected, defaultExpanded = false, onToggleSelect, onEdit, onRequestDelete, onRetrySync, onRollback }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [checked, setChecked] = useState(false);
  const [versions, setVersions] = useState<KnowledgeVersionItem[] | null>(null);

  return (
    <Box border="1px solid" borderColor={selected ? 'brand.300' : 'gray.150'} bg={selected ? 'brand.50' : 'white'} borderRadius="lg" mb={2} overflow="hidden" transition="all 0.15s" _hover={{ borderColor: 'brand.200' }}>
      <Flex align="flex-start" gap={2} p={3}>
        <Checkbox mt="2px" isChecked={checked} onChange={(e) => { setChecked(e.target.checked); onToggleSelect(item.id, e.target.checked); }} colorScheme="brand" />
        <Box flex="1" minW="0" cursor="pointer" onClick={() => setExpanded((v) => !v)}>
          <HStack spacing={1.5} mb={1.5} flexWrap="wrap">
            <Badge colorScheme="gray" bg="gray.100" color="gray.600" borderRadius="full" fontSize="10px" px={2} fontWeight={700}>触发 {item.triggerCount}</Badge>
            <Badge colorScheme={STAGE_COLOR[item.stage]} borderRadius="full" fontSize="10px" px={2} fontWeight={600}>{STAGE_LABELS[item.stage]}</Badge>
            {item.matchType === 'fuzzy' && <Badge colorScheme="teal" variant="subtle" borderRadius="full" fontSize="10px" px={2}>模糊</Badge>}
            {item.enabled === false && <Badge colorScheme="gray" borderRadius="full" fontSize="10px" px={2}>已停用</Badge>}
            <Badge colorScheme={item.syncStatus === 'synced' ? 'green' : item.syncStatus === 'failed' ? 'red' : 'orange'} borderRadius="full" fontSize="10px" px={2}>
              {item.syncStatus === 'synced' ? '已同步' : item.syncStatus === 'failed' ? '同步失败' : '待同步'}
            </Badge>
            {item.syncStatus !== 'synced' && (
              <Button size="xs" variant="link" colorScheme={item.syncStatus === 'failed' ? 'red' : 'orange'} onClick={(event) => { event.stopPropagation(); onRetrySync(item.id); }}>同步</Button>
            )}
          </HStack>
          <Text fontSize="13.5px" fontWeight={600} color="gray.800" lineHeight={1.45}>{item.question}</Text>
          {item.tags.length > 0 && (
            <HStack spacing={1} mt={1.5}>
              {item.tags.map((t) => (<HStack key={t} spacing={1}><Box w="6px" h="6px" borderRadius="full" bg="brand.400" /><Text fontSize="11px" color="gray.500">{t}</Text></HStack>))}
            </HStack>
          )}
          <HStack spacing={3} mt={1.5} align="center">
            <Text fontSize="11px" color="gray.400">更新于 {formatRelativeTime(item.updatedAt)}</Text>
            <HStack spacing={1} ml="auto">
              <IconButton aria-label="编辑" icon={<FiEdit2 size={13} />} size="xs" variant="ghost" color="gray.400" borderRadius="md" onClick={(e) => { e.stopPropagation(); onEdit(item); }} _hover={{ color: 'brand.500', bg: 'brand.50' }} />
              <IconButton aria-label="删除" icon={<FiTrash2 size={13} />} size="xs" variant="ghost" color="gray.400" borderRadius="md" onClick={(e) => { e.stopPropagation(); onRequestDelete(item); }} _hover={{ color: 'red.500', bg: 'red.50' }} />
              <Box as="button" onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setExpanded((v) => !v); }} color="gray.400" _hover={{ color: 'brand.500' }} display="flex">
                <Icon as={expanded ? FiChevronDownSmall : FiChevronRight} boxSize={4} />
              </Box>
            </HStack>
          </HStack>
        </Box>
      </Flex>
      <Collapse in={expanded} animateOpacity>
        <Box px={3} pb={3} pt={0} borderTop="1px solid" borderColor="gray.100">
          <Box mt={3} bg="blue.50" borderRadius="md" p={3}>
            <Text fontSize="11px" fontWeight={700} color="blue.500" mb={1}>关联回复</Text>
            <Text fontSize="12.5px" color="gray.700" lineHeight={1.6}>{item.answer}</Text>
          </Box>
          {item.relatedQuestions.length > 0 && (
            <Box mt={2}>
              <Text fontSize="11px" fontWeight={700} color="gray.500" mb={1}>关联问题</Text>
              {item.relatedQuestions.map((rq, i) => (<Text key={i} fontSize="12px" color="brand.600" _hover={{ textDecoration: 'underline', cursor: 'pointer' }} mb={0.5}>· {rq}</Text>))}
            </Box>
          )}
          {(item.effectiveAt || item.expiresAt) && <Text mt={2} fontSize="11px" color="orange.600">有效期：{item.effectiveAt ? new Date(item.effectiveAt).toLocaleString('zh-CN') : '立即'} ～ {item.expiresAt ? new Date(item.expiresAt).toLocaleString('zh-CN') : '长期'}</Text>}
          <Button mt={2} size="xs" variant="outline" onClick={async () => setVersions(versions ? null : await fetchStoreKnowledgeVersions(item.id))}>{versions ? '收起版本' : '查看版本历史'}</Button>
          {versions && <VStack mt={2} align="stretch" spacing={1}>{versions.map((version) => <Flex key={version.id} bg="gray.50" p={2} borderRadius="md" align="center" gap={2}><Text fontSize="xs" flex="1">v{version.version} · {version.action} · {new Date(version.created_at).toLocaleString('zh-CN')}</Text><Button size="xs" variant="link" onClick={() => onRollback(item.id, version.version)}>回滚</Button></Flex>)}</VStack>}
        </Box>
      </Collapse>
    </Box>
  );
};

/* ════════════════════ 右侧统计面板 ════════════════════ */
const StatsPanel: React.FC<{
  stats: { total: number; presale: number; mid: number; aftersale: number };
  keyword: string; onKeyword: (v: string) => void;
  shop: string; onShop: (v: string) => void;
  stage: QAStage | 'all'; onStage: (v: QAStage | 'all') => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: (format: 'csv' | 'json', all: boolean) => void;
}> = ({ stats, keyword, onKeyword, shop, onShop, stage, onStage, onAdd, onImport, onExport }) => {
  const [showProductFilter, setShowProductFilter] = useState(false);
  const statCards = [
    { key: 'all' as const, label: '全部', value: stats.total, color: 'gray.600' },
    { key: 'presale' as const, label: '售前', value: stats.presale, color: 'blue.500' },
    { key: 'mid' as const, label: '售中', value: stats.mid, color: 'orange.500' },
    { key: 'aftersale' as const, label: '售后', value: stats.aftersale, color: 'purple.500' },
  ];

  return (
    <VStack spacing={3} align="stretch">
      <Flex align="baseline" justify="space-between">
        <Text fontSize="14px" fontWeight={800} color="gray.700">问答知识库管理</Text>
        <Badge colorScheme="brand" borderRadius="full" px={2} fontSize="11px" fontWeight={700}>{stats.total} 条记录</Badge>
      </Flex>
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none" h="full"><FiSearch color="#A0AEC0" /></InputLeftElement>
        <Input placeholder="搜索问题 / 回复 / 标签" value={keyword} onChange={(e) => onKeyword(e.target.value)} borderRadius="lg" bg="gray.50" borderColor="gray.200" />
      </InputGroup>
      <HStack spacing={1} flexWrap="wrap">
        {statCards.map((c) => (
          <Box key={c.key} flex="1" minW="64px" textAlign="center" bg={stage === c.key ? 'brand.50' : 'gray.50'} border="1px solid" borderColor={stage === c.key ? 'brand.300' : 'transparent'} borderRadius="lg" py={2} px={1} cursor="pointer" onClick={() => onStage(c.key)} transition="all 0.15s" _hover={{ bg: stage === c.key ? 'brand.50' : 'gray.100' }}>
            <Text fontSize="18px" fontWeight={800} color={c.color} lineHeight={1}>{c.value}</Text>
            <Text fontSize="10.5px" color="gray.500" mt={0.5}>{c.label}</Text>
          </Box>
        ))}
      </HStack>
      <Button colorScheme="brand" size="md" leftIcon={<FiPlus />} borderRadius="lg" w="full" h="42px" bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)" _hover={{ bgGradient: 'linear-gradient(135deg, #43529F, #2F5AC0)' }} onClick={onAdd}>
        新增问答
      </Button>
      <SimpleGrid columns={2} spacing={2}>
        <ActionTile icon={FiUpload} label="导入 CSV / Excel" onClick={onImport} />
        <Menu>
          <MenuButton as={Button} variant="outline" colorScheme="gray" size="sm" borderRadius="lg" h="auto" py={2.5} fontSize="11px" fontWeight={600} color="gray.600">
            <VStack spacing={1}><Icon as={FiDownload} boxSize={4} /><Text>手动导出</Text></VStack>
          </MenuButton>
          <MenuList minW="190px">
            <MenuItem onClick={() => onExport('csv', false)}>当前筛选 · CSV</MenuItem>
            <MenuItem onClick={() => onExport('json', false)}>当前筛选 · JSON</MenuItem>
            <MenuItem onClick={() => onExport('json', true)}>全部内容 · JSON</MenuItem>
          </MenuList>
        </Menu>
      </SimpleGrid>
      <Divider borderColor="gray.100" />
      <VStack spacing={2} align="stretch">
        <Menu>
          <MenuButton as={Button} size="sm" variant="outline" rightIcon={<FiChevronDown />} borderRadius="lg" colorScheme="gray" w="full" justifyContent="space-between">{SHOP_OPTIONS.find((s) => s.id === shop)?.name ?? '店铺筛选'}</MenuButton>
          <MenuList minW="180px">
            <MenuItem onClick={() => onShop('all')}>全部店铺</MenuItem>
            {SHOP_OPTIONS.map((s) => (<MenuItem key={s.id} onClick={() => onShop(s.id)}>{s.name}</MenuItem>))}
          </MenuList>
        </Menu>
        <Button size="sm" variant="outline" colorScheme="gray" leftIcon={<FiFilter />} rightIcon={<FiChevronDown />} borderRadius="lg" justifyContent="space-between" onClick={() => setShowProductFilter((v) => !v)}>高级筛选</Button>
        <Collapse in={showProductFilter} animateOpacity>
          <Box bg="gray.50" borderRadius="lg" p={3} border="1px solid" borderColor="gray.100">
            <Text fontSize="11px" fontWeight={700} color="gray.500" mb={2}>商品筛选</Text>
            <VStack spacing={1.5} align="stretch">
              {['纯棉T恤', '实木书桌', '蓝牙耳机', '婴儿连体衣'].map((p) => (<Checkbox key={p} size="sm" colorScheme="brand" defaultChecked>{p}</Checkbox>))}
            </VStack>
          </Box>
        </Collapse>
      </VStack>
    </VStack>
  );
};

const ActionTile: React.FC<{ icon: React.ElementType; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <Button variant="outline" colorScheme="gray" size="sm" borderRadius="lg" h="auto" py={2.5} flexDir="column" gap={1} fontSize="11px" fontWeight={600} color="gray.600" _hover={{ borderColor: 'brand.300', color: 'brand.600', bg: 'brand.50' }} onClick={onClick}>
    <Icon as={icon} boxSize={4} />
    {label}
  </Button>
);

/* ════════════════════ 主组件 ════════════════════ */
const StoreKnowledgeBase: React.FC = () => {
  const toast = useToast();
  const { isOpen: modalOpen, onOpen: modalOnOpen, onClose: modalOnClose } = useDisclosure();
  const { isOpen: delOpen, onOpen: delOnOpen, onClose: delOnClose } = useDisclosure();
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const [keyword, setKeyword] = useState('');
  const [shop, setShop] = useState('all');
  const [stage, setStage] = useState<QAStage | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<QAItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QAItem | null>(null);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QAItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, presale: 0, mid: 0, aftersale: 0 });
  const importDisclosure = useDisclosure();
  const [importPreview, setImportPreview] = useState<StoreImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchStoreQAList({ keyword, shop, stage, page, pageSize });
      setItems(res.list); setTotal(res.total); setStats(res.stats);
    } catch {
      toast({ title: '加载失败', status: 'error', duration: 2000, isClosable: true });
    } finally { setLoading(false); }
  }, [keyword, page, pageSize, shop, stage, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openAdd = () => { setEditing(null); modalOnOpen(); };
  const openEdit = (item: QAItem) => { setEditing(item); modalOnOpen(); };

  const handleSubmit = async (data: { question: string; answer: string; relatedQuestions: string[]; stage: QAStage; tags: string[]; matchType: QAMatchType; enabled: boolean; effectiveAt?: string; expiresAt?: string }) => {
    if (editing) {
      await updateQA(editing.id, data);
      toast({ title: '已保存修改', status: 'success', duration: 1800, isClosable: true });
    } else {
      await addQA({ ...data, shopId: shop === 'all' ? 'shop_lixixi' : shop });
      toast({ title: '问答已创建', status: 'success', duration: 1800, isClosable: true });
    }
    modalOnClose();
    setPage(1);
    await loadData();
  };

  const handleRollback = async (id: string, version: number) => {
    if (!window.confirm(`确定回滚到 v${version}？当前内容仍会保留为新版本。`)) return;
    await rollbackStoreKnowledge(id, version);
    await loadData();
    toast({ title: `已回滚到 v${version}`, status: 'success' });
  };

  const handleMerge = async () => {
    const [targetId, sourceId] = [...selectedIds];
    if (!targetId || !sourceId) return;
    const preview = await previewStoreKnowledgeMerge(targetId, sourceId);
    if (!window.confirm(`将「${preview.source.question}」合并到「${preview.target.question}」？来源条目会停用，可通过版本历史追溯。`)) return;
    await mergeStoreKnowledge(targetId, sourceId);
    setSelectedIds(new Set());
    await loadData();
    toast({ title: '知识条目已合并', status: 'success' });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteQA(pendingDelete.id);
    delOnClose();
    setPendingDelete(null);
    await loadData();
    toast({ title: '已删除该问答', status: 'warning', duration: 1800, isClosable: true });
  };

  const retrySync = async (id: string) => {
    await retryStoreKnowledgeSync(id);
    await loadData();
    toast({ title: '已重试 RAG 同步', status: 'info', duration: 1600 });
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setImportPreview(await parseStoreImport(file)); }
    catch (error) { toast({ title: '文件解析失败', description: String(error), status: 'error' }); }
  };

  const confirmImport = async () => {
    if (!importPreview?.valid.length) return;
    setImporting(true);
    try {
      const results = await bulkImportStoreKnowledge(importPreview.valid);
      const failed = results.filter((item) => !item.success).length;
      toast({ title: `导入完成：成功 ${results.length - failed}，失败 ${failed}`, status: failed ? 'warning' : 'success' });
      importDisclosure.onClose();
      setImportPreview(null);
      setPage(1);
      await loadData();
    } finally { setImporting(false); }
  };

  const handleExport = async (format: 'csv' | 'json', all: boolean) => {
    try {
      await downloadKnowledgeExport('store', format, all ? {} : {
        keyword,
        shop,
        stage,
      });
      toast({ title: '知识库已导出', description: all ? '已导出全部店铺问答' : '已按当前筛选导出', status: 'success', duration: 1800 });
    } catch (error) {
      toast({ title: '导出失败', description: String(error), status: 'error', duration: 2500 });
    }
  };

  return (
    <Flex h="full" gap={4} align="stretch">
      <Box flex="1" minW="0" display="flex" flexDirection="column">
        <Flex align="center" justify="space-between" mb={3}>
          <Box>
            <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">店铺知识库</Text>
            <Text fontSize="12.5px" color="gray.400" mt={0.5}>管理店铺级问答知识，自动学习客服历史对话</Text>
          </Box>
          <HStack>{selectedIds.size > 0 && <Badge colorScheme="brand" borderRadius="full" px={2}>已选 {selectedIds.size} 项</Badge>}{selectedIds.size === 2 && <Button size="xs" colorScheme="purple" onClick={handleMerge}>预览并合并</Button>}</HStack>
        </Flex>

        <Box flex="1" minH="0" overflowY="auto" pr={1}>
          {loading ? (
            <Flex justify="center" align="center" h="300px"><Spinner size="lg" color="brand.500" /></Flex>
          ) : items.length === 0 ? (
            <Flex direction="column" align="center" justify="center" h="300px" color="gray.400">
              <Box fontSize="40px" mb={3}>📚</Box>
              <Text fontSize="14px">暂无匹配的知识条目</Text>
            </Flex>
          ) : (
            <VStack spacing={0} align="stretch">
              {items.map((it) => (
                <QAListItem key={it.id} item={it} selected={selectedIds.has(it.id)} onToggleSelect={(id, checked) => setSelectedIds((prev) => { const n = new Set(prev); if (checked) n.add(id); else n.delete(id); return n; })} onEdit={openEdit} onRequestDelete={(item) => { setPendingDelete(item); delOnOpen(); }} onRetrySync={retrySync} onRollback={handleRollback} />
              ))}
            </VStack>
          )}
        </Box>

        {!loading && items.length > 0 && (
          <Flex align="center" justify="space-between" pt={3} fontSize="13px" color="gray.500">
            <Text>共 {total} 条</Text>
            <HStack spacing={1}>
              <Button size="sm" variant="ghost" isDisabled={page <= 1} borderRadius="lg" onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
              <Text>第 {page} / {totalPages} 页</Text>
              <Button size="sm" variant="ghost" isDisabled={page >= totalPages} borderRadius="lg" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</Button>
            </HStack>
          </Flex>
        )}
      </Box>

      <Box w="300px" flexShrink={0} bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm" p={4} overflowY="auto">
        <StatsPanel stats={stats} keyword={keyword} onKeyword={(v) => { setKeyword(v); setPage(1); }} shop={shop} onShop={(v) => { setShop(v); setPage(1); }} stage={stage} onStage={(v) => { setStage(v); setPage(1); }} onAdd={openAdd} onImport={importDisclosure.onOpen} onExport={handleExport} />
      </Box>

      <QAEditModal isOpen={modalOpen} editing={editing} onClose={modalOnClose} onSubmit={handleSubmit} />

      <Modal isOpen={importDisclosure.isOpen} onClose={importDisclosure.onClose} size="lg" isCentered>
        <ModalOverlay bg="blackAlpha.400" />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="16px">导入店铺问答预览</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Input type="file" accept=".csv,.xlsx" p={1} onChange={handleImportFile} />
              <Text fontSize="12px" color="gray.500">必需列：问题、回复、店铺ID。可选列：相似问法、标签、阶段、匹配方式。</Text>
              {importPreview && (
                <Box bg="gray.50" borderRadius="lg" p={3}>
                  <HStack><Badge colorScheme="green">可导入 {importPreview.valid.length}</Badge><Badge colorScheme={importPreview.invalid.length ? 'red' : 'gray'}>错误 {importPreview.invalid.length}</Badge></HStack>
                  {importPreview.invalid.slice(0, 8).map((item) => <Text key={item.row} fontSize="11px" color="red.500" mt={1}>第 {item.row} 行：{item.error}</Text>)}
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter><Button size="sm" variant="ghost" onClick={importDisclosure.onClose}>取消</Button><Button size="sm" colorScheme="brand" ml={2} isLoading={importing} isDisabled={!importPreview?.valid.length} onClick={confirmImport}>导入有效行</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <AlertDialog isOpen={delOpen} leastDestructiveRef={cancelRef} onClose={delOnClose} isCentered>
        <AlertDialogOverlay bg="blackAlpha.300" />
        <AlertDialogContent borderRadius="xl">
          <AlertDialogHeader fontSize="15px" fontWeight={800}>确认删除</AlertDialogHeader>
          <AlertDialogBody fontSize="13px" color="gray.600">
            将删除问答「{pendingDelete?.question.slice(0, 20)}…」及其关联配置，此操作不可撤销。
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} size="sm" variant="ghost" onClick={delOnClose} borderRadius="lg">取消</Button>
            <Button size="sm" colorScheme="red" ml={2} onClick={confirmDelete} borderRadius="lg">确认删除</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Flex>
  );
};

export default React.memo(StoreKnowledgeBase);
