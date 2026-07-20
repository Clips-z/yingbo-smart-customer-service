import React, { useEffect, useState } from 'react';
import { Badge, Box, Button, Flex, Heading, SimpleGrid, Table, Tbody, Td, Text, Textarea, Th, Thead, Tr, useToast, VStack } from '@chakra-ui/react';
import {
  AuditItem, BackupManifest, createBackup, fetchAudit, fetchBackups,
  replayFixtures, scheduleBackupRestore, verifyBackup,
} from '../../../common/services/knowledge/governance';

const KnowledgeGovernance: React.FC = () => {
  const toast = useToast();
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [fixtures, setFixtures] = useState('[\n  {"platformId":"win_qianniu","source":"llm","retrievalStatus":"hit","ocrConfidence":0.95,"expectedAllowed":true}\n]');

  const load = async () => {
    const [backupRows, auditRows] = await Promise.all([fetchBackups(), fetchAudit()]);
    setBackups(backupRows); setAudit(auditRows);
  };
  useEffect(() => { void load(); }, []);

  return (
    <VStack align="stretch" spacing={4} py={5}>
      <Box><Heading size="md">知识治理与恢复</Heading><Text fontSize="sm" color="gray.500" mt={1}>版本审计、平台回放和 SQLite 备份均保存在本机。</Text></Box>
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
          <Flex justify="space-between" align="center" mb={3}><Text fontWeight="800">备份与恢复</Text><Button size="sm" colorScheme="blue" onClick={async () => { await createBackup(); await load(); toast({ title: '备份已创建并校验', status: 'success' }); }}>立即备份</Button></Flex>
          <VStack align="stretch" spacing={2}>{backups.length === 0 ? <Text fontSize="sm" color="gray.500">暂无备份</Text> : backups.map((item) => <Flex key={item.id} bg="gray.50" p={3} borderRadius="lg" gap={2} align="center"><Box flex="1"><Text fontSize="sm" fontWeight="700">{new Date(item.createdAt).toLocaleString('zh-CN')}</Text><Text fontSize="xs" color="gray.500">{Math.round(item.size / 1024)} KB · {item.sha256.slice(0, 12)}…</Text></Box><Button size="xs" onClick={async () => { const result = await verifyBackup(item.id); toast({ title: result.valid ? '备份校验通过' : '备份损坏', status: result.valid ? 'success' : 'error' }); }}>校验</Button><Button size="xs" colorScheme="orange" onClick={async () => { if (!window.confirm('恢复会在下次启动生效，并自动保留当前数据库。继续？')) return; await scheduleBackupRestore(item.id); toast({ title: '恢复已安排，请重启应用', status: 'warning' }); }}>恢复</Button></Flex>)}</VStack>
        </Box>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
          <Text fontWeight="800" mb={1}>脱敏平台回放</Text><Text fontSize="xs" color="gray.500" mb={3}>粘贴不含截图和个人信息的 JSON 用例，验证升级后的安全门槛。</Text>
          <Textarea value={fixtures} onChange={(event) => setFixtures(event.target.value)} minH="150px" fontFamily="mono" fontSize="xs" />
          <Button mt={2} size="sm" onClick={async () => { try { const result = await replayFixtures(JSON.parse(fixtures)); toast({ title: `回放通过 ${result.passed}/${result.total}`, status: result.passed === result.total ? 'success' : 'warning' }); } catch (error) { toast({ title: '回放数据无效', description: String(error), status: 'error' }); } }}>运行回放</Button>
        </Box>
      </SimpleGrid>
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" overflow="hidden">
        <Flex p={4} justify="space-between"><Text fontWeight="800">审计记录</Text><Badge>{audit.length} 条</Badge></Flex>
        <Box overflowX="auto"><Table size="sm"><Thead><Tr><Th>时间</Th><Th>动作</Th><Th>对象</Th><Th>操作者</Th><Th>校验摘要</Th></Tr></Thead><Tbody>{audit.map((item) => <Tr key={item.id}><Td whiteSpace="nowrap">{new Date(item.created_at).toLocaleString('zh-CN')}</Td><Td>{item.action}</Td><Td>{item.entity_type} · {item.entity_id.slice(0, 12)}</Td><Td>{item.actor}</Td><Td fontFamily="mono">{item.event_hash.slice(0, 12)}…</Td></Tr>)}</Tbody></Table></Box>
      </Box>
    </VStack>
  );
};

export default React.memo(KnowledgeGovernance);
