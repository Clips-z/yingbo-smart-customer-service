import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, Heading, Input, Select,
  SimpleGrid, Spinner, Text, Textarea, useToast,
} from '@chakra-ui/react';
import {
  approveKnowledgeCandidate,
  fetchKnowledgeCandidates,
  KnowledgeCandidateItem,
  rejectKnowledgeCandidate,
} from '../../../common/services/knowledge/candidates';

const KnowledgeCandidates: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<KnowledgeCandidateItem[]>([]);
  const [status, setStatus] = useState('pending');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<KnowledgeCandidateItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchKnowledgeCandidates({ status, keyword, pageSize: 100 });
      setItems(result.list);
    } catch (error) {
      toast({ status: 'error', title: '读取待审核知识失败', description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [keyword, status, toast]);

  useEffect(() => { load(); }, [load]);

  const approve = async () => {
    if (!editing) return;
    await approveKnowledgeCandidate(editing.id, editing);
    toast({ status: 'success', title: '已批准并加入正式知识库' });
    setEditing(null);
    await load();
  };

  const reject = async (item: KnowledgeCandidateItem) => {
    const reason = window.prompt('请输入驳回原因（便于后续复盘）', '信息不准确或不具备通用性');
    if (reason == null) return;
    await rejectKnowledgeCandidate(item.id, reason);
    toast({ status: 'info', title: '已驳回' });
    await load();
  };

  return (
    <Box py={5}>
      <Flex justify="space-between" align="start" mb={5} gap={4} wrap="wrap">
        <Box>
          <Heading size="md">对话知识候选</Heading>
          <Text color="gray.500" fontSize="sm" mt={1}>从实际采用的客服回复中积累，人工审核后才进入正式知识库。</Text>
        </Box>
        <Flex gap={2}>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索问题或答案" w="220px" />
          <Select value={status} onChange={(event) => setStatus(event.target.value)} w="130px">
            <option value="pending">待审核</option><option value="approved">已批准</option>
            <option value="rejected">已驳回</option><option value="all">全部</option>
          </Select>
        </Flex>
      </Flex>

      {loading ? <Spinner /> : items.length === 0 ? (
        <Box bg="white" borderRadius="xl" p={10} textAlign="center" color="gray.500">暂无符合条件的候选知识</Box>
      ) : (
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
          {items.map((item) => (
            <Box key={item.id} bg="white" borderWidth="1px" borderColor="gray.100" borderRadius="xl" p={4}>
              <Flex justify="space-between" mb={2}>
                <Badge colorScheme={item.status === 'pending' ? 'orange' : item.status === 'approved' ? 'green' : 'gray'}>
                  {item.status === 'pending' ? '待审核' : item.status === 'approved' ? '已批准' : '已驳回'}
                </Badge>
                <Text fontSize="xs" color="gray.500">出现 {item.sourceCount} 次 · 可信度 {Math.round(item.confidence * 100)}%</Text>
              </Flex>
              <Text fontWeight="700">{item.question}</Text>
              <Text mt={2} fontSize="sm" color="gray.600" whiteSpace="pre-wrap">{item.answer}</Text>
              {item.rejectionReason && <Text mt={2} fontSize="xs" color="red.500">原因：{item.rejectionReason}</Text>}
              {item.status === 'pending' && <Flex gap={2} mt={4} justify="end">
                <Button size="sm" variant="ghost" onClick={() => reject(item)}>驳回</Button>
                <Button size="sm" colorScheme="blue" onClick={() => setEditing({ ...item })}>审核并批准</Button>
              </Flex>}
            </Box>
          ))}
        </SimpleGrid>
      )}

      {editing && (
        <Box position="fixed" inset={0} bg="blackAlpha.500" zIndex={20} display="flex" alignItems="center" justifyContent="center" p={4}>
          <Box bg="white" borderRadius="xl" p={5} w="min(680px, 100%)" maxH="90vh" overflowY="auto">
            <Heading size="sm" mb={4}>审核知识内容</Heading>
            <FormControl mb={3}><FormLabel>客户问题</FormLabel><Textarea value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} /></FormControl>
            <FormControl mb={3}><FormLabel>标准答案</FormLabel><Textarea minH="140px" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} /></FormControl>
            <SimpleGrid columns={2} spacing={3}>
              <FormControl><FormLabel>业务阶段</FormLabel><Select value={editing.stage} onChange={(e) => setEditing({ ...editing, stage: e.target.value as KnowledgeCandidateItem['stage'] })}><option value="presale">售前</option><option value="mid">售中</option><option value="aftersale">售后</option></Select></FormControl>
              <FormControl><FormLabel>店铺 ID</FormLabel><Input value={editing.shopId} onChange={(e) => setEditing({ ...editing, shopId: e.target.value })} /></FormControl>
            </SimpleGrid>
            <Flex justify="end" gap={2} mt={5}><Button onClick={() => setEditing(null)}>取消</Button><Button colorScheme="blue" onClick={approve}>批准并入库</Button></Flex>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(KnowledgeCandidates);
