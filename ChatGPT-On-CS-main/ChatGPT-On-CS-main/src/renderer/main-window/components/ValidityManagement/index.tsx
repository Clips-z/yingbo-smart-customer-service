import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Badge,
  Button,
  IconButton,
  useToast,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
  VStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  Icon,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import {
  FiPlus,
  FiTrash2,
  FiClock,
  FiMoreHorizontal,
  FiEdit2,
} from 'react-icons/fi';
import {
  fetchValidityRules,
  addValidityRule,
  deleteValidityRule,
  VALIDITY_STATUS_LABELS,
  VALIDITY_STATUS_COLORS,
  formatDateTime,
  ValidityRule,
} from '../../../common/services/knowledge/validity';

/* ════════════════════ 新增/编辑弹窗 ════════════════════ */
const RuleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; target: string; startAt: string; endAt: string }) => void;
}> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('全店活动');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTarget('全店活动');
      setStartAt('');
      setEndAt('');
    }
  }, [isOpen]);

  const valid = name.trim() && startAt && endAt && new Date(endAt) > new Date(startAt);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay bg="blackAlpha.400" />
      <ModalContent borderRadius="xl">
        <ModalHeader fontSize="16px" fontWeight={800}>
          新增时效规则
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={2}>
          <VStack spacing={3} align="stretch">
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>
                规则名称
              </FormLabel>
              <Input
                size="sm"
                borderRadius="lg"
                placeholder="如：双11全场5折活动话术"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="12px" color="gray.600" mb={1}>
                关联对象
              </FormLabel>
              <Select
                size="sm"
                borderRadius="lg"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option>全店活动</option>
                <option>李西西旗舰店</option>
                <option>木之语家居</option>
                <option>春雨服饰专营</option>
                <option>星河数码</option>
              </Select>
            </FormControl>
            <Flex gap={3}>
              <FormControl>
                <FormLabel fontSize="12px" color="gray.600" mb={1}>
                  生效时间
                </FormLabel>
                <Input
                  size="sm"
                  type="datetime-local"
                  borderRadius="lg"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="12px" color="gray.600" mb={1}>
                  失效时间
                </FormLabel>
                <Input
                  size="sm"
                  type="datetime-local"
                  borderRadius="lg"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </FormControl>
            </Flex>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="ghost" mr={2} onClick={onClose} borderRadius="lg">
            取消
          </Button>
          <Button
            size="sm"
            colorScheme="brand"
            isDisabled={!valid}
            onClick={() => onSubmit({ name, target, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() })}
            borderRadius="lg"
            bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
          >
            创建规则
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ════════════════════ 主组件 ════════════════════ */
const ValidityManagement: React.FC = () => {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<ValidityRule[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ active: 0, upcoming: 0, expired: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchValidityRules();
      setList(res.list);
      setCounts(res.counts);
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

  const handleCreate = async (data: { name: string; target: string; startAt: string; endAt: string }) => {
    const created = await addValidityRule(data);
    onClose();
    await load();
    toast({ title: `已创建「${created.name}」`, status: 'success', duration: 2000, isClosest: true });
  };

  const handleDelete = async (rule: ValidityRule) => {
    await deleteValidityRule(rule.id);
    await load();
    toast({ title: `已删除「${rule.name}」`, status: 'warning', duration: 1800, isClosest: true });
  };

  const statusBadges: { key: string; label: string; color: string }[] = [
    { key: 'active', label: '生效中', color: 'green' },
    { key: 'upcoming', label: '未开始', color: 'blue' },
    { key: 'expired', label: '已过期', color: 'gray' },
  ];

  return (
    <VStack spacing={4} align="stretch" h="full">
      <Box pt={1}>
        <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
          时效管理
        </Text>
        <Text fontSize="12.5px" color="gray.400" mt={0.5}>
          为限时活动与促销话术设定生效窗口，过期自动停用
        </Text>
      </Box>

      {/* 统计 + 新增 */}
      <Flex align="center" justify="space-between" flexWrap="wrap" gap={3} bg="white" p={3} borderRadius="xl" border="1px solid" borderColor="gray.100" boxShadow="sm">
        <HStack spacing={2}>
          {statusBadges.map((s) => (
            <Badge key={s.key} colorScheme={s.color} borderRadius="full" px={3} py={1} fontSize="12px" fontWeight={700}>
              {s.label} {counts[s.key] ?? 0}
            </Badge>
          ))}
        </HStack>
        <Button
          size="sm"
          colorScheme="brand"
          leftIcon={<FiPlus />}
          borderRadius="lg"
          bgGradient="linear-gradient(135deg, #4A5BB3, #3866D4)"
          _hover={{ bgGradient: 'linear-gradient(135deg, #43529F, #2F5AC0)' }}
          onClick={onOpen}
        >
          新增时效规则
        </Button>
      </Flex>

      {loading ? (
        <Flex justify="center" align="center" h="300px">
          <Spinner size="lg" color="brand.500" />
        </Flex>
      ) : (
        <Box
          flex="1"
          minH="0"
          overflowY="auto"
          bg="white"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.100"
          boxShadow="sm"
        >
          <Table size="sm" variant="simple">
            <Thead position="sticky" top={0} bg="gray.50" zIndex={1}>
              <Tr>
                <Th fontSize="11px" color="gray.500">规则名称</Th>
                <Th fontSize="11px" color="gray.500">关联对象</Th>
                <Th fontSize="11px" color="gray.500">生效时间</Th>
                <Th fontSize="11px" color="gray.500">失效时间</Th>
                <Th fontSize="11px" color="gray.500">关联问答</Th>
                <Th fontSize="11px" color="gray.500">状态</Th>
                <Th fontSize="11px" color="gray.500" textAlign="right">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {list.map((r) => (
                <Tr key={r.id} _hover={{ bg: 'gray.50' }}>
                  <Td fontWeight={600} color="gray.800">
                    <HStack spacing={2}>
                      <Icon as={FiClock} color="brand.400" boxSize={3.5} />
                      <Text>{r.name}</Text>
                    </HStack>
                  </Td>
                  <Td color="gray.600">{r.target}</Td>
                  <Td fontSize="12px" color="gray.500">{formatDateTime(r.startAt)}</Td>
                  <Td fontSize="12px" color="gray.500">{formatDateTime(r.endAt)}</Td>
                  <Td>
                    <Badge colorScheme="gray" bg="gray.100" color="gray.600" borderRadius="full" fontSize="10px" px={2}>
                      {r.qaCount} 条
                    </Badge>
                  </Td>
                  <Td>
                    <Badge
                      colorScheme={VALIDITY_STATUS_COLORS[r.status]}
                      variant={r.status === 'active' ? 'solid' : 'subtle'}
                      borderRadius="full"
                      fontSize="10px"
                      px={2}
                      fontWeight={600}
                    >
                      {VALIDITY_STATUS_LABELS[r.status]}
                    </Badge>
                  </Td>
                  <Td textAlign="right">
                    <Menu>
                      <MenuButton
                        as={IconButton}
                        aria-label="操作"
                        icon={<FiMoreHorizontal />}
                        size="xs"
                        variant="ghost"
                        color="gray.400"
                        borderRadius="md"
                        _hover={{ color: 'brand.500', bg: 'brand.50' }}
                      />
                      <MenuList>
                        <MenuItem icon={<FiEdit2 size={13} />} onClick={() => toast({ title: '编辑功能开发中', status: 'info', duration: 1500, isClosest: true })}>
                          编辑
                        </MenuItem>
                        <MenuItem icon={<FiTrash2 size={13} />} color="red.500" onClick={() => handleDelete(r)}>
                          删除
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      <RuleModal isOpen={isOpen} onClose={onClose} onSubmit={handleCreate} />
    </VStack>
  );
};

export default React.memo(ValidityManagement);
