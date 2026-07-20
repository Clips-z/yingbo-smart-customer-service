import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  IconButton,
  Button,
  Switch,
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
  SimpleGrid,
  Image,
  Tooltip,
  Checkbox,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  useDisclosure,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@chakra-ui/react';
import {
  FiSearch,
  FiChevronDown,
  FiPlus,
  FiList,
  FiCopy,
  FiTrash2,
  FiCheckCircle,
  FiXCircle,
  FiUpload,
  FiDownload,
  FiEdit2,
} from 'react-icons/fi';
import {
  fetchProductQAList,
  toggleProductOnSale,
  addProductQA,
  batchSetOnSale,
  batchDeleteProducts,
  productPlaceholderImage,
  SHOP_OPTIONS,
  ProductQA,
  retryProductSync,
  bulkImportProducts,
  updateProductQA,
} from '../../../common/services/knowledge/productQA';
import {
  ImportPreview,
  parseProductImport,
} from '../../../common/services/knowledge/knowledgeImport';
import { downloadKnowledgeExport } from '../../../common/services/knowledge/knowledgeExport';

/* ════════════════════ 新增商品弹窗 ════════════════════ */
const AddProductModal: React.FC<{
  isOpen: boolean;
  editing: ProductQA | null;
  onClose: () => void;
  onSubmit: (data: {
    name: string; platformProductId: string; barcode: string; shopId: string; onSale: boolean; tags: string[];
  }) => void;
}> = ({ isOpen, editing, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [platformProductId, setPlatformProductId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [shopId, setShopId] = useState('shop_lixixi');
  const [onSale, setOnSale] = useState(true);
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(editing?.name || '');
      setPlatformProductId(editing?.platformProductId || '');
      setBarcode(editing?.barcode || '');
      setShopId(editing?.shopId || 'shop_lixixi');
      setOnSale(editing?.onSale !== false);
      setTags((editing?.tags || []).join('、'));
    }
  }, [isOpen, editing]);

  const valid = name.trim() && platformProductId.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay bg="blackAlpha.400" />
      <ModalContent borderRadius="xl">
        <ModalHeader fontSize="16px" fontWeight={800}>{editing ? '查看并编辑商品知识' : '添加商品'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={2}>
          <VStack spacing={3} align="stretch">
            <Flex gap={3} align="center">
              <Box
                w="64px" h="64px" borderRadius="lg" overflow="hidden" flexShrink={0}
                bg="gray.50" border="1px dashed" borderColor="gray.200"
              >
                {name ? (
                  <Image src={productPlaceholderImage(name, 210)} alt="" w="full" h="full" objectFit="cover" />
                ) : (
                  <Flex w="full" h="full" align="center" justify="center" fontSize="10px" color="gray.300">预览</Flex>
                )}
              </Box>
              <Box flex="1">
                <FormControl>
                  <FormLabel fontSize="12px" color="gray.600" mb={1}>商品名称</FormLabel>
                  <Input size="sm" borderRadius="lg" placeholder="商品名称" value={name} onChange={(e) => setName(e.target.value)} />
                </FormControl>
              </Box>
            </Flex>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>平台商品ID</FormLabel>
              <Input size="sm" borderRadius="lg" placeholder="如 888874062298" value={platformProductId} onChange={(e) => setPlatformProductId(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>知识标签（顿号分隔）</FormLabel>
              <Input size="sm" borderRadius="lg" placeholder="如：服装、洗护" value={tags} onChange={(e) => setTags(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>商品条码（选填）</FormLabel>
              <Input size="sm" borderRadius="lg" placeholder="69 开头条码" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>所属店铺</FormLabel>
              <Select size="sm" borderRadius="lg" value={shopId} onChange={(e) => setShopId(e.target.value)}>
                {SHOP_OPTIONS.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </Select>
            </FormControl>
            <Flex align="center" justify="space-between" bg="gray.50" p={3} borderRadius="lg">
              <Box>
                <Text fontSize="12.5px" fontWeight={600} color="gray.700">上架状态</Text>
                <Text fontSize="10px" color="gray.400">上架后商品可参与智能问答</Text>
              </Box>
              <Switch size="sm" colorScheme="green" isChecked={onSale} onChange={(e) => setOnSale(e.target.checked)} />
            </Flex>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="ghost" mr={2} onClick={onClose} borderRadius="lg">取消</Button>
          <Button
            size="sm" colorScheme="brand" isDisabled={!valid}
            onClick={() => onSubmit({ name: name.trim(), platformProductId: platformProductId.trim(), barcode: barcode.trim(), shopId, onSale, tags: tags.split('、').map((item) => item.trim()).filter(Boolean) })}
            borderRadius="lg"
            bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
          >
            {editing ? '保存修改' : '确认添加'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ════════════════════ 商品卡片 ════════════════════ */
const ProductCard: React.FC<{
  product: ProductQA;
  batchMode: boolean;
  checked: boolean;
  toggling: boolean;
  onCheck: (id: string, checked: boolean) => void;
  onToggle: (id: string, onSale: boolean) => void;
  onCopyId: (id: string) => void;
  onRetrySync: (id: string) => void;
  onEdit: (product: ProductQA) => void;
}> = ({ product, batchMode, checked, toggling, onCheck, onToggle, onCopyId, onRetrySync, onEdit }) => {
  return (
    <Box
      bg="white"
      borderRadius="xl"
      overflow="hidden"
      border="1px solid"
      borderColor={checked ? 'brand.300' : 'gray.100'}
      boxShadow={checked ? 'md' : 'sm'}
      transition="all 0.18s ease"
      _hover={{ boxShadow: 'md', borderColor: 'gray.200', transform: batchMode ? 'none' : 'translateY(-2px)' }}
      position="relative"
    >
      {/* 批量勾选 */}
      {batchMode && (
        <Checkbox
          position="absolute"
          top={2}
          left={2}
          zIndex={2}
          isChecked={checked}
          onChange={(e) => onCheck(product.id, e.target.checked)}
          colorScheme="brand"
          bg="white"
          borderRadius="sm"
        />
      )}

      {/* 商品图 */}
      <Box position="relative" bg="gray.50" h="0" pb="100%">
        <Image
          src={productPlaceholderImage(product.name, product.hue)}
          alt={product.name}
          position="absolute" top="0" left="0" w="full" h="full" objectFit="cover"
        />
        {product.qaCount > 0 && (
          <Badge position="absolute" top={2} right={2} bg="brand.500" color="white" fontSize="10px" px={2} borderRadius="full" fontWeight={700}>
            {product.qaCount} 条问答
          </Badge>
        )}
      </Box>

      {/* 信息区 */}
      <Box p={3}>
        <Text fontSize="13px" fontWeight={600} color="gray.800" lineHeight={1.4} noOfLines={2} minH="36px" title={product.name}>
          {product.name}
        </Text>
        <HStack mt={1.5} justify="space-between" align="center">
          <Text fontSize="11px" color="gray.400" fontWeight={500} noOfLines={1}>平台商品ID：{product.platformProductId}</Text>
          {!batchMode && (
            <Tooltip label="复制商品ID" placement="top">
              <IconButton aria-label="复制ID" icon={<FiCopy size={12} />} size="xs" variant="ghost" color="gray.300" borderRadius="md" onClick={() => onCopyId(product.platformProductId)} _hover={{ color: 'brand.500', bg: 'brand.50' }} />
            </Tooltip>
          )}
        </HStack>

        <Flex align="center" justify="space-between" mt={3}>
          <Text fontSize="12px" fontWeight={600} color={product.onSale ? 'green.500' : 'gray.400'}>
            {product.onSale ? '已上架' : '未上架'}
          </Text>
          {!batchMode && (
            <Switch size="sm" colorScheme="green" isChecked={product.onSale} isDisabled={toggling} onChange={(e) => onToggle(product.id, e.target.checked)} sx={{ '& .chakra-switch__track': { borderRadius: 'full' } }} />
          )}
        </Flex>
        <HStack mt={2} spacing={2}>
          <Badge colorScheme={product.syncStatus === 'synced' ? 'green' : product.syncStatus === 'failed' ? 'red' : 'orange'} fontSize="9px" borderRadius="full">
            {product.syncStatus === 'synced' ? '已同步' : product.syncStatus === 'failed' ? '同步失败' : '待同步'}
          </Badge>
          {product.syncStatus !== 'synced' && product.onSale && (
            <Button size="xs" variant="link" colorScheme={product.syncStatus === 'failed' ? 'red' : 'orange'} onClick={() => onRetrySync(product.id)}>同步</Button>
          )}
        </HStack>
        {!batchMode && (
          <Button mt={2} size="xs" w="full" variant="ghost" colorScheme="brand" leftIcon={<FiEdit2 />} onClick={() => onEdit(product)}>
            查看完整内容并编辑
          </Button>
        )}
      </Box>
    </Box>
  );
};

/* ════════════════════ 分页器 ════════════════════ */
const Pagination: React.FC<{
  total: number; page: number; pageSize: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}> = ({ total, page, pageSize, onPageChange, onPageSizeChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [localPage, setLocalPage] = useState(page);
  useEffect(() => setLocalPage(page), [page]);
  const go = (p: number) => { const np = Math.min(totalPages, Math.max(1, p)); setLocalPage(np); onPageChange(np); };

  return (
    <Flex align="center" justify="space-between" px={1} pt={2} fontSize="13px" color="gray.500">
      <Text>共 {total} 条</Text>
      <HStack spacing={2}>
        <Button size="sm" variant="ghost" onClick={() => go(localPage - 1)} isDisabled={localPage <= 1} borderRadius="lg">上一页</Button>
        <HStack spacing={1} align="center">
          <Text>第</Text>
          <Input value={localPage} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); if (!Number.isNaN(v)) setLocalPage(v); }} onBlur={() => go(localPage)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} w="44px" h="30px" textAlign="center" size="sm" borderRadius="lg" px={1} />
          <Text>/ {totalPages} 页</Text>
        </HStack>
        <Button size="sm" variant="ghost" onClick={() => go(localPage + 1)} isDisabled={localPage >= totalPages} borderRadius="lg">下一页</Button>
        <Select value={pageSize} onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))} w="auto" size="sm" h="30px" borderRadius="lg" ml={2}>
          <option value={10}>10 条/页</option>
          <option value={20}>20 条/页</option>
          <option value={50}>50 条/页</option>
        </Select>
      </HStack>
    </Flex>
  );
};

/* ════════════════════ 主组件 ════════════════════ */
const ProductQALibrary: React.FC = () => {
  const toast = useToast();
  const { isOpen: addOpen, onOpen: addOnOpen, onClose: addOnClose } = useDisclosure();
  const [keyword, setKeyword] = useState('');
  const [shop, setShop] = useState('all');
  const [status, setStatus] = useState<'all' | 'on' | 'off'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductQA[]>([]);
  const [total, setTotal] = useState(0);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const importDisclosure = useDisclosure();
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductQA | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchProductQAList({ keyword, shop, status, page, pageSize });
      setProducts(res.list);
      setTotal(res.total);
    } catch {
      toast({ title: '加载失败', status: 'error', duration: 2000, isClosable: true });
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize, shop, status, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggle = async (id: string, onSale: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await toggleProductOnSale(id, onSale);
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, onSale } : p)));
    } catch {
      toast({ title: '操作失败', status: 'error', duration: 1500, isClosable: true });
    } finally {
      setTogglingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleSave = async (data: { name: string; platformProductId: string; barcode: string; shopId: string; onSale: boolean; tags: string[] }) => {
    if (editingProduct) await updateProductQA(editingProduct.id, data);
    else await addProductQA(data);
    addOnClose();
    setPage(1);
    await loadData();
    toast({ title: editingProduct ? '商品知识已更新' : '商品已添加', status: 'success', duration: 1800, isClosable: true });
    setEditingProduct(null);
  };

  const openAdd = () => {
    setEditingProduct(null);
    addOnOpen();
  };

  const openEdit = (product: ProductQA) => {
    setEditingProduct(product);
    addOnOpen();
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const handleBatchToggle = async (onSale: boolean) => {
    if (selectedIds.length === 0) return;
    await batchSetOnSale(selectedIds, onSale);
    await loadData();
    toast({ title: `${onSale ? '已上架' : '已下架'} ${selectedIds.length} 件商品`, status: 'success', duration: 1800, isClosable: true });
    setSelected(new Set());
  };

  const handleBatchDelete = async () => {
    await batchDeleteProducts(selectedIds);
    setConfirmDelete(false);
    setSelected(new Set());
    await loadData();
    toast({ title: `已删除 ${selectedIds.length} 件商品`, status: 'warning', duration: 1800, isClosable: true });
  };

  const handleCopyId = async (id: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(id);
      toast({ title: '已复制商品ID', status: 'success', duration: 1200, isClosable: true });
    } catch {
      toast({ title: '复制失败', description: '请检查系统剪贴板权限后重试', status: 'error', duration: 2500, isClosable: true });
    }
  };

  const handleRetrySync = async (id: string) => {
    await retryProductSync(id);
    await loadData();
    toast({ title: '已重试同步', status: 'info', duration: 1600 });
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImportPreview(await parseProductImport(file));
    } catch (error) {
      toast({ title: '文件解析失败', description: String(error), status: 'error' });
    }
  };

  const confirmImport = async () => {
    if (!importPreview?.valid.length) return;
    setImporting(true);
    try {
      const results = await bulkImportProducts(importPreview.valid);
      const failed = results.filter((item) => !item.success).length;
      toast({ title: `导入完成：成功 ${results.length - failed}，失败 ${failed}`, status: failed ? 'warning' : 'success' });
      importDisclosure.onClose();
      setImportPreview(null);
      setPage(1);
      await loadData();
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json', all: boolean) => {
    try {
      await downloadKnowledgeExport('product', format, all ? {} : { keyword, shop, status });
      toast({ title: '商品知识已导出', description: all ? '已导出全部内容' : '已按当前筛选导出', status: 'success', duration: 1800 });
    } catch (error) {
      toast({ title: '导出失败', description: String(error), status: 'error', duration: 2500 });
    }
  };

  const statusLabel = useMemo(() => ({ all: '上架状态', on: '已上架', off: '未上架' }[status]), [status]);
  const shopLabel = SHOP_OPTIONS.find((s) => s.id === shop)?.name ?? '全部店铺';

  return (
    <VStack spacing={4} align="stretch" h="full">
      <Box pt={1}>
        <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">商品问答库</Text>
        <Text fontSize="12.5px" color="gray.400" mt={0.5}>为商品配置智能问答，让 AI 客服精准回复商品相关问题</Text>
      </Box>

      {/* 工具栏 */}
      <Flex align="center" gap={2} flexWrap="wrap" bg="white" p={3} borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm">
        <InputGroup size="sm" maxW="300px" flex="1" minW="220px">
          <InputLeftElement pointerEvents="none" h="full"><FiSearch color="#A0AEC0" /></InputLeftElement>
          <Input placeholder="搜索商品名称 / 平台商品ID / 商品条码" value={keyword}
            onChange={(e) => { setPage(1); setKeyword(e.target.value); }} borderRadius="lg" bg="gray.50" borderColor="gray.200" _placeholder={{ color: 'gray.400' }} />
        </InputGroup>

        <Menu>
          <MenuButton as={Button} size="sm" variant="outline" rightIcon={<FiChevronDown />} borderRadius="lg" colorScheme="gray" minW="110px">{shopLabel}</MenuButton>
          <MenuList minW="160px">
            <MenuItem onClick={() => { setShop('all'); setPage(1); }}>全部店铺</MenuItem>
            {SHOP_OPTIONS.map((s) => (<MenuItem key={s.id} onClick={() => { setShop(s.id); setPage(1); }}>{s.name}</MenuItem>))}
          </MenuList>
        </Menu>

        <Menu>
          <MenuButton as={Button} size="sm" variant="outline" rightIcon={<FiChevronDown />} borderRadius="lg" colorScheme="gray" minW="100px">{statusLabel}</MenuButton>
          <MenuList minW="140px">
            <MenuItem onClick={() => { setStatus('all'); setPage(1); }}>全部状态</MenuItem>
            <MenuItem onClick={() => { setStatus('on'); setPage(1); }}>已上架</MenuItem>
            <MenuItem onClick={() => { setStatus('off'); setPage(1); }}>未上架</MenuItem>
          </MenuList>
        </Menu>

        <Button size="sm" variant={batchMode ? 'solid' : 'outline'} colorScheme={batchMode ? 'brand' : 'gray'} leftIcon={<FiList />} borderRadius="lg" onClick={() => { setBatchMode((v) => !v); setSelected(new Set()); }}>
          {batchMode ? '退出批量' : '批量管理'}
        </Button>

        {batchMode && (
          <HStack spacing={2} pl={1} borderLeft="1px solid" borderColor="gray.200">
            <Text fontSize="12px" color="gray.500">已选 {selected.size}</Text>
            <Button size="xs" colorScheme="green" variant="ghost" leftIcon={<FiCheckCircle />} isDisabled={selected.size === 0} onClick={() => handleBatchToggle(true)}>批量上架</Button>
            <Button size="xs" colorScheme="orange" variant="ghost" leftIcon={<FiXCircle />} isDisabled={selected.size === 0} onClick={() => handleBatchToggle(false)}>批量下架</Button>
            <Button size="xs" colorScheme="red" variant="ghost" leftIcon={<FiTrash2 />} isDisabled={selected.size === 0} onClick={() => setConfirmDelete(true)}>批量删除</Button>
          </HStack>
        )}

        <Menu>
          <MenuButton as={IconButton} aria-label="导出知识" icon={<FiDownload />} size="sm" variant="ghost" borderRadius="lg" colorScheme="gray" />
          <MenuList minW="190px">
            <MenuItem onClick={() => handleExport('csv', false)}>导出当前筛选 · CSV</MenuItem>
            <MenuItem onClick={() => handleExport('json', false)}>导出当前筛选 · JSON</MenuItem>
            <MenuItem onClick={() => handleExport('csv', true)}>导出全部内容 · CSV</MenuItem>
            <MenuItem onClick={() => handleExport('json', true)}>导出全部内容 · JSON</MenuItem>
          </MenuList>
        </Menu>

        <Box flex="1" />

        <Button size="sm" variant="outline" colorScheme="gray" leftIcon={<FiUpload />} borderRadius="lg" onClick={importDisclosure.onOpen}>
          导入 CSV / Excel
        </Button>
        <Button size="sm" colorScheme="brand" leftIcon={<FiPlus />} borderRadius="lg" bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)" _hover={{ bgGradient: 'linear-gradient(135deg, #43529F, #2F5AC0)' }} onClick={openAdd}>
          添加商品
        </Button>
      </Flex>

      {/* 商品网格 */}
      <Box flex="1" minH="0" overflowY="auto" pr={1}>
        {loading ? (
          <Flex justify="center" align="center" h="300px"><Spinner size="lg" color="brand.500" /></Flex>
        ) : products.length === 0 ? (
          <Flex direction="column" align="center" justify="center" h="300px" color="gray.400">
            <Box fontSize="40px" mb={3}>📦</Box>
            <Text fontSize="14px">没有找到匹配的商品</Text>
          </Flex>
        ) : (
          <SimpleGrid columns={{ base: 2, md: 3, xl: 4 }} spacing={4}>
            {products.map((p) => (
              <ProductCard key={p.id} product={p} batchMode={batchMode} checked={selected.has(p.id)} toggling={togglingIds.has(p.id)}
                onCheck={(id, c) => setSelected((prev) => { const n = new Set(prev); if (c) n.add(id); else n.delete(id); return n; })}
                onToggle={handleToggle} onCopyId={handleCopyId} onRetrySync={handleRetrySync} onEdit={openEdit} />
            ))}
          </SimpleGrid>
        )}
      </Box>

      {!loading && products.length > 0 && (
        <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      )}

      <AddProductModal isOpen={addOpen} editing={editingProduct} onClose={() => { addOnClose(); setEditingProduct(null); }} onSubmit={handleSave} />

      <Modal isOpen={importDisclosure.isOpen} onClose={importDisclosure.onClose} size="lg" isCentered>
        <ModalOverlay bg="blackAlpha.400" />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="16px">导入商品预览</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Input type="file" accept=".csv,.xlsx" p={1} onChange={handleImportFile} />
              <Text fontSize="12px" color="gray.500">必需列：商品名称、平台商品ID、店铺ID。可选列：商品条码、店铺名称、上架状态。</Text>
              {importPreview && (
                <Box bg="gray.50" borderRadius="lg" p={3}>
                  <HStack spacing={3}>
                    <Badge colorScheme="green">可导入 {importPreview.valid.length}</Badge>
                    <Badge colorScheme={importPreview.invalid.length ? 'red' : 'gray'}>错误 {importPreview.invalid.length}</Badge>
                  </HStack>
                  {importPreview.invalid.slice(0, 8).map((item) => (
                    <Text key={item.row} fontSize="11px" color="red.500" mt={1}>第 {item.row} 行：{item.error}</Text>
                  ))}
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="ghost" onClick={importDisclosure.onClose}>取消</Button>
            <Button size="sm" colorScheme="brand" ml={2} isLoading={importing} isDisabled={!importPreview?.valid.length} onClick={confirmImport}>导入有效行</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 批量删除确认 */}
      <AlertDialog isOpen={confirmDelete} leastDestructiveRef={cancelRef} onClose={() => setConfirmDelete(false)} isCentered>
        <AlertDialogOverlay bg="blackAlpha.300" />
        <AlertDialogContent borderRadius="xl">
          <AlertDialogHeader fontSize="15px" fontWeight={800}>确认删除</AlertDialogHeader>
          <AlertDialogBody fontSize="13px" color="gray.600">
            将删除选中的 {selectedIds.length} 件商品及其问答配置，此操作不可撤销。
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} borderRadius="lg">取消</Button>
            <Button size="sm" colorScheme="red" ml={2} onClick={handleBatchDelete} borderRadius="lg">确认删除</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </VStack>
  );
};

export default React.memo(ProductQALibrary);
