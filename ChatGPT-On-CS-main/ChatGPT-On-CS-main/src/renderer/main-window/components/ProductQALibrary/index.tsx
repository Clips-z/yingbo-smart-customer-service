import React, { useState, useMemo, useEffect } from 'react';
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
  MenuOptionGroup,
  MenuItemOption,
  HStack,
  VStack,
  Badge,
  Select,
  useToast,
  Spinner,
  SimpleGrid,
  Image,
  Tooltip,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import {
  FiSearch,
  FiChevronDown,
  FiRefreshCw,
  FiPlus,
  FiMoreHorizontal,
  FiList,
} from 'react-icons/fi';
import {
  fetchProductQAList,
  toggleProductOnSale,
  productPlaceholderImage,
  SHOP_OPTIONS,
  ProductQA,
} from '../../../common/services/knowledge/productQA';

/* ════════════════════ 商品卡片 ════════════════════ */
const ProductCard: React.FC<{
  product: ProductQA;
  onToggle: (id: string, onSale: boolean) => void;
}> = React.memo(({ product, onToggle }) => {
  return (
    <Box
      bg="white"
      borderRadius="xl"
      overflow="hidden"
      border="1px solid"
      borderColor="gray.100"
      boxShadow="sm"
      transition="all 0.18s ease"
      _hover={{
        boxShadow: 'md',
        borderColor: 'gray.200',
        transform: 'translateY(-2px)',
      }}
    >
      {/* 商品图 */}
      <Box position="relative" bg="gray.50" h="0" pb="100%">
        <Image
          src={productPlaceholderImage(product.name, product.hue)}
          alt={product.name}
          position="absolute"
          top="0"
          left="0"
          w="full"
          h="full"
          objectFit="cover"
        />
        {product.qaCount > 0 && (
          <Badge
            position="absolute"
            top={2}
            left={2}
            bg="brand.500"
            color="white"
            fontSize="10px"
            px={2}
            borderRadius="full"
            fontWeight={700}
          >
            {product.qaCount} 条问答
          </Badge>
        )}
      </Box>

      {/* 信息区 */}
      <Box p={3}>
        <Text
          fontSize="13px"
          fontWeight={600}
          color="gray.800"
          lineHeight={1.4}
          noOfLines={2}
          minH="36px"
          title={product.name}
        >
          {product.name}
        </Text>

        <Text fontSize="11px" color="gray.400" mt={1.5} fontWeight={500}>
          平台商品ID：{product.platformProductId}
        </Text>

        <Flex align="center" justify="space-between" mt={3}>
          <HStack spacing={1.5} align="center">
            <Text
              fontSize="12px"
              fontWeight={600}
              color={product.onSale ? 'green.500' : 'gray.400'}
            >
              {product.onSale ? '已上架' : '未上架'}
            </Text>
          </HStack>
          <Switch
            size="sm"
            colorScheme="green"
            isChecked={product.onSale}
            onChange={(e) => onToggle(product.id, e.target.checked)}
            sx={{
              '& .chakra-switch__track': { borderRadius: 'full' },
            }}
          />
        </Flex>
      </Box>
    </Box>
  );
});

/* ════════════════════ 分页器 ════════════════════ */
const Pagination: React.FC<{
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}> = ({ total, page, pageSize, onPageSizeChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [localPage, setLocalPage] = useState(page);

  useEffect(() => setLocalPage(page), [page]);

  const go = (p: number) => {
    const np = Math.min(totalPages, Math.max(1, p));
    setLocalPage(np);
    onPageChange(np);
  };

  return (
    <Flex align="center" justify="space-between" px={1} pt={2} fontSize="13px" color="gray.500">
      <Text>共 {total} 条</Text>
      <HStack spacing={2}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => go(localPage - 1)}
          isDisabled={localPage <= 1}
          borderRadius="lg"
        >
          上一页
        </Button>
        <HStack spacing={1} align="center">
          <Text>第</Text>
          <Input
            value={localPage}
            onChange={(e) => {
              const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
              if (!isNaN(v)) setLocalPage(v);
            }}
            onBlur={() => go(localPage)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            w="44px"
            h="30px"
            textAlign="center"
            size="sm"
            borderRadius="lg"
            px={1}
          />
          <Text>/ {totalPages} 页</Text>
        </HStack>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => go(localPage + 1)}
          isDisabled={localPage >= totalPages}
          borderRadius="lg"
        >
          下一页
        </Button>

        <Select
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          w="auto"
          size="sm"
          h="30px"
          borderRadius="lg"
          ml={2}
        >
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
  const [keyword, setKeyword] = useState('');
  const [shop, setShop] = useState('all');
  const [status, setStatus] = useState<'all' | 'on' | 'off'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [batchMode, setBatchMode] = useState(false);

  // 数据请求
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductQA[]>([]);
  const [total, setTotal] = useState(0);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchProductQAList({ keyword, shop, status, page, pageSize });
      setProducts(res.list);
      setTotal(res.total);
    } catch (e) {
      toast({ title: '加载失败', status: 'error', duration: 2000, isClosest: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, shop, status, page, pageSize]);

  const handleToggle = async (id: string, onSale: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await toggleProductOnSale(id, onSale);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, onSale } : p))
      );
    } catch {
      toast({ title: '操作失败', status: 'error', duration: 1500, isClosest: true });
    } finally {
      setTogglingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'on':
        return '已上架';
      case 'off':
        return '未上架';
      default:
        return '上架状态';
    }
  }, [status]);

  const shopLabel =
    SHOP_OPTIONS.find((s) => s.id === shop)?.name ?? '全部店铺';

  return (
    <VStack spacing={4} align="stretch" h="full">
      {/* 标题 */}
      <Box pt={1}>
        <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
          商品问答库
        </Text>
        <Text fontSize="12.5px" color="gray.400" mt={0.5}>
          为商品配置智能问答，让 AI 客服精准回复商品相关问题
        </Text>
      </Box>

      {/* 工具栏 */}
      <Flex
        align="center"
        gap={2}
        flexWrap="wrap"
        bg="white"
        p={3}
        borderRadius="xl"
        border="1px solid"
        borderColor="gray.100"
        boxShadow="sm"
      >
        {/* 搜索框 */}
        <InputGroup size="sm" maxW="300px" flex="1" minW="220px">
          <InputLeftElement pointerEvents="none" h="full">
            <FiSearch color="#A0AEC0" />
          </InputLeftElement>
          <Input
            placeholder="搜索商品名称 / 平台商品ID / 商品条码"
            value={keyword}
            onChange={(e) => {
              setPage(1);
              setKeyword(e.target.value);
            }}
            borderRadius="lg"
            bg="gray.50"
            borderColor="gray.200"
            _placeholder={{ color: 'gray.400' }}
          />
        </InputGroup>

        {/* 店铺筛选 */}
        <Menu>
          <MenuButton
            as={Button}
            size="sm"
            variant="outline"
            rightIcon={<FiChevronDown />}
            borderRadius="lg"
            colorScheme="gray"
            minW="110px"
          >
            {shopLabel}
          </MenuButton>
          <MenuList minW="160px">
            <MenuItem onClick={() => { setShop('all'); setPage(1); }}>全部店铺</MenuItem>
            {SHOP_OPTIONS.map((s) => (
              <MenuItem key={s.id} onClick={() => { setShop(s.id); setPage(1); }}>
                {s.name}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        {/* 上架状态筛选 */}
        <Menu>
          <MenuButton
            as={Button}
            size="sm"
            variant="outline"
            rightIcon={<FiChevronDown />}
            borderRadius="lg"
            colorScheme="gray"
            minW="100px"
          >
            {statusLabel}
          </MenuButton>
          <MenuList minW="140px">
            <MenuItem onClick={() => { setStatus('all'); setPage(1); }}>全部状态</MenuItem>
            <MenuItem onClick={() => { setStatus('on'); setPage(1); }}>已上架</MenuItem>
            <MenuItem onClick={() => { setStatus('off'); setPage(1); }}>未上架</MenuItem>
          </MenuList>
        </Menu>

        {/* 批量管理 */}
        <Button
          size="sm"
          variant={batchMode ? 'solid' : 'outline'}
          colorScheme={batchMode ? 'brand' : 'gray'}
          leftIcon={<FiList />}
          borderRadius="lg"
          onClick={() => setBatchMode((v) => !v)}
        >
          批量管理
        </Button>

        {/* 更多 */}
        <IconButton
          aria-label="更多"
          icon={<FiMoreHorizontal />}
          size="sm"
          variant="ghost"
          borderRadius="lg"
          colorScheme="gray"
        />

        <Box flex="1" />

        {/* 同步平台商品 */}
        <Button
          size="sm"
          variant="outline"
          colorScheme="gray"
          leftIcon={<FiRefreshCw />}
          borderRadius="lg"
          onClick={() =>
            toast({ title: '正在同步平台商品…', status: 'info', duration: 1500, isClosest: true })
          }
        >
          同步平台商品
        </Button>

        {/* 添加商品 */}
        <Button
          size="sm"
          colorScheme="brand"
          leftIcon={<FiPlus />}
          borderRadius="lg"
          bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
          _hover={{ bgGradient: 'linear-gradient(135deg, #43529F, #2F5AC0)' }}
          onClick={() =>
            toast({ title: '添加商品', status: 'info', duration: 1500, isClosest: true })
          }
        >
          添加商品
        </Button>
      </Flex>

      {/* 商品网格 */}
      <Box flex="1" minH="0" overflowY="auto" pr={1}>
        {loading ? (
          <Flex justify="center" align="center" h="300px">
            <Spinner size="lg" color="brand.500" />
          </Flex>
        ) : products.length === 0 ? (
          <Flex direction="column" align="center" justify="center" h="300px" color="gray.400">
            <Box fontSize="40px" mb={3}>📦</Box>
            <Text fontSize="14px">没有找到匹配的商品</Text>
          </Flex>
        ) : (
          <SimpleGrid columns={{ base: 2, md: 3, xl: 4 }} spacing={4}>
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onToggle={handleToggle}
              />
            ))}
          </SimpleGrid>
        )}
      </Box>

      {/* 分页 */}
      {!loading && products.length > 0 && (
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      )}
    </VStack>
  );
};

export default React.memo(ProductQALibrary);
