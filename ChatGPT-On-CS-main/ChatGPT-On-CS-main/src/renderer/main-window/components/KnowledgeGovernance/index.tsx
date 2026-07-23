import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Badge, Box, Button, Flex, Heading, Input, Select, SimpleGrid, Table, Tbody, Td, Text, Textarea, Th, Thead, Tr, useToast, VStack } from '@chakra-ui/react';
import {
  AuditItem, BackupManifest, createBackup, downloadAuditExport, fetchAudit, fetchBackups,
  rebuildKnowledgeRag, replayFixtures, scheduleBackupRestore, verifyBackup, ReplayFixture,
  deleteReplayFixture, fetchReplayFixtures, saveReplayFixture,
} from '../../../common/services/knowledge/governance';

const KnowledgeGovernance: React.FC = () => {
  const toast = useToast();
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditKeyword, setAuditKeyword] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [restoreResult, setRestoreResult] = useState<AuditItem | undefined>();
  const [fixtures, setFixtures] = useState('[\n  {"platformId":"win_qianniu","source":"llm","retrievalStatus":"hit","ocrConfidence":0.95,"expectedAllowed":true}\n]');
  const [replayFixtureRows, setReplayFixtureRows] = useState<ReplayFixture[]>([]);
  const [replayName, setReplayName] = useState('安全回放');
  const [replayFixtureId, setReplayFixtureId] = useState<string>();
  const [restoreBackup, setRestoreBackup] = useState<BackupManifest | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const cancelRestoreRef = useRef<HTMLButtonElement>(null);
  const cancelRebuildRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (page = auditPage, keyword = auditKeyword, action = auditAction) => {
    const [backupRows, auditRows, restoreRows, replayRows] = await Promise.all([fetchBackups(), fetchAudit({ page, pageSize: 20, keyword, action }), fetchAudit({ page: 1, pageSize: 1, action: 'backup.restore_' }), fetchReplayFixtures()]);
    setBackups(backupRows); setAudit(auditRows.items); setAuditTotal(auditRows.total); setAuditPage(auditRows.page); setRestoreResult(restoreRows.items[0]); setReplayFixtureRows(replayRows);
  }, [auditAction, auditKeyword, auditPage]);
  useEffect(() => { load().catch(() => undefined); }, [load]);

  const confirmRestore = async () => {
    if (!restoreBackup) return;
    await scheduleBackupRestore(restoreBackup.id);
    setRestoreBackup(null);
    toast({ title: '恢复已安排，请重启应用', status: 'warning' });
  };

  const confirmRagRebuild = async () => {
    const result = await rebuildKnowledgeRag();
    setConfirmRebuild(false);
    await load();
    toast({ title: `知识索引已重建：商品 ${result.products}，问答 ${result.stores}${result.failed ? `，失败 ${result.failed}` : ''}`, status: result.failed ? 'warning' : 'success' });
  };

  return (
    <VStack align="stretch" spacing={4} py={5}>
      <Box><Heading size="md">知识治理与恢复</Heading><Text fontSize="sm" color="gray.500" mt={1}>版本审计、平台回放和 SQLite 备份均保存在本机。</Text></Box>
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
          <Flex justify="space-between" align="center" mb={3}><Text fontWeight="800">备份与恢复</Text><Button size="sm" colorScheme="blue" onClick={async () => { await createBackup(); await load(); toast({ title: '备份已创建并校验', status: 'success' }); }}>立即备份</Button></Flex>
          {restoreResult && <Box mb={3} p={2} borderRadius="md" bg={restoreResult.action === 'backup.restore_completed' ? 'green.50' : 'red.50'}><Text fontSize="xs" fontWeight="700">{restoreResult.action === 'backup.restore_completed' ? '最近恢复已完成，RAG 已重建' : '最近恢复后的 RAG 重建失败'}</Text><Text fontSize="xs" color="gray.600">{new Date(restoreResult.created_at).toLocaleString('zh-CN')} · {restoreResult.payload?.ragRebuild ? `商品 ${restoreResult.payload.ragRebuild.products}，问答 ${restoreResult.payload.ragRebuild.stores}，失败 ${restoreResult.payload.ragRebuild.failed}` : String(restoreResult.payload?.message || '请查看审计记录后重试')}</Text></Box>}
          <VStack align="stretch" spacing={2}>{backups.length === 0 ? <Text fontSize="sm" color="gray.500">暂无备份</Text> : backups.map((item) => <Flex key={item.id} bg="gray.50" p={3} borderRadius="lg" gap={2} align="center"><Box flex="1"><Text fontSize="sm" fontWeight="700">{new Date(item.createdAt).toLocaleString('zh-CN')}</Text><Text fontSize="xs" color="gray.500">{Math.round(item.size / 1024)} KB · {item.sha256.slice(0, 12)}…</Text></Box><Button size="xs" onClick={async () => { const result = await verifyBackup(item.id); toast({ title: result.valid ? '备份校验通过' : '备份损坏', status: result.valid ? 'success' : 'error' }); }}>校验</Button><Button size="xs" colorScheme="orange" onClick={() => setRestoreBackup(item)}>恢复</Button></Flex>)}</VStack>
        </Box>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
          <Text fontWeight="800" mb={1}>从 SQLite 重建知识索引</Text><Text fontSize="xs" color="gray.500" mb={3}>仅重建商品和店铺知识的派生 RAG 块，不会删除手动导入的其他文档。</Text>
          <Button size="sm" colorScheme="purple" onClick={() => setConfirmRebuild(true)}>重建 RAG 索引</Button>
        </Box>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" p={4}>
          <Text fontWeight="800" mb={1}>脱敏平台回放</Text><Text fontSize="xs" color="gray.500" mb={3}>粘贴不含截图和个人信息的 JSON 用例，验证升级后的安全门槛。</Text>
          <Flex gap={2} mb={2}><Input size="sm" value={replayName} onChange={(event) => setReplayName(event.target.value)} placeholder="回放名称" /><Button size="sm" onClick={async () => { try { await saveReplayFixture({ id: replayFixtureId, name: replayName, fixtures: JSON.parse(fixtures) }); await load(); toast({ title: '回放用例已保存', status: 'success' }); } catch (error) { toast({ title: '保存失败', description: String(error), status: 'error' }); } }}>{replayFixtureId ? '更新' : '保存'}</Button></Flex>
          <Textarea value={fixtures} onChange={(event) => setFixtures(event.target.value)} minH="150px" fontFamily="mono" fontSize="xs" />
          <Flex mt={2} gap={2}><Button size="sm" onClick={async () => { try { const result = await replayFixtures(JSON.parse(fixtures)); toast({ title: `回放通过 ${result.passed}/${result.total}`, status: result.passed === result.total ? 'success' : 'warning' }); } catch (error) { toast({ title: '回放数据无效', description: String(error), status: 'error' }); } }}>运行回放</Button><Button size="sm" variant="outline" onClick={() => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([fixtures], { type: 'application/json;charset=utf-8' })); link.download = `${replayName || 'replay'}.json`; link.click(); URL.revokeObjectURL(link.href); }}>导出 JSON</Button></Flex>
          <VStack mt={3} align="stretch" spacing={1}>{replayFixtureRows.map((item) => <Flex key={item.id} gap={2} align="center"><Text fontSize="xs" flex="1">{item.name} · {new Date(item.updated_at).toLocaleString('zh-CN')}</Text><Button size="xs" onClick={() => { setReplayFixtureId(item.id); setReplayName(item.name); setFixtures(JSON.stringify(item.fixtures, null, 2)); }}>加载</Button><Button size="xs" colorScheme="red" variant="ghost" onClick={async () => { await deleteReplayFixture(item.id); if (replayFixtureId === item.id) setReplayFixtureId(undefined); await load(); }}>删除</Button></Flex>)}</VStack>
        </Box>
      </SimpleGrid>
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.100" overflow="hidden">
        <Flex p={4} justify="space-between" gap={3} wrap="wrap"><Text fontWeight="800">审计记录</Text><Flex gap={2} wrap="wrap"><Input size="sm" w="180px" placeholder="搜索操作或对象" value={auditKeyword} onChange={(event) => setAuditKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') load(1).catch(() => undefined); }} /><Select size="sm" w="130px" value={auditAction} onChange={(event) => { setAuditAction(event.target.value); load(1, auditKeyword, event.target.value).catch(() => undefined); }}><option value="">全部操作</option><option value="knowledge.">知识库</option><option value="candidate.">候选知识</option><option value="backup.">备份</option><option value="evaluation.">评测</option></Select><Button size="sm" onClick={() => load(1).catch(() => undefined)}>筛选</Button><Button size="sm" variant="outline" onClick={() => downloadAuditExport('csv', { keyword: auditKeyword, action: auditAction }).catch((error) => toast({ title: '导出失败', description: String(error), status: 'error' }))}>导出 CSV</Button><Button size="sm" variant="outline" onClick={() => downloadAuditExport('json', { keyword: auditKeyword, action: auditAction }).catch((error) => toast({ title: '导出失败', description: String(error), status: 'error' }))}>导出 JSON</Button><Badge>{auditTotal} 条</Badge></Flex></Flex>
        <Box overflowX="auto"><Table size="sm"><Thead><Tr><Th>时间</Th><Th>动作</Th><Th>对象</Th><Th>操作者</Th><Th>校验摘要</Th></Tr></Thead><Tbody>{audit.map((item) => <Tr key={item.id}><Td whiteSpace="nowrap">{new Date(item.created_at).toLocaleString('zh-CN')}</Td><Td>{item.action}</Td><Td>{item.entity_type} · {item.entity_id.slice(0, 12)}</Td><Td>{item.actor}</Td><Td fontFamily="mono">{item.event_hash.slice(0, 12)}…</Td></Tr>)}</Tbody></Table></Box>
        <Flex p={3} justify="flex-end" gap={2}><Button size="sm" isDisabled={auditPage <= 1} onClick={() => load(auditPage - 1).catch(() => undefined)}>上一页</Button><Text fontSize="sm" alignSelf="center">第 {auditPage} 页</Text><Button size="sm" isDisabled={auditPage * 20 >= auditTotal} onClick={() => load(auditPage + 1).catch(() => undefined)}>下一页</Button></Flex>
      </Box>
      <AlertDialog isOpen={Boolean(restoreBackup)} leastDestructiveRef={cancelRestoreRef} onClose={() => setRestoreBackup(null)} isCentered>
        <AlertDialogOverlay bg="blackAlpha.400" />
        <AlertDialogContent borderRadius="xl">
          <AlertDialogHeader fontSize="16px">确认恢复备份</AlertDialogHeader>
          <AlertDialogBody fontSize="sm" color="gray.600">
            恢复将在下次启动时生效，系统会先自动保留当前数据库。是否继续？
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRestoreRef} variant="ghost" onClick={() => setRestoreBackup(null)}>取消</Button>
            <Button colorScheme="orange" onClick={confirmRestore}>安排恢复</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog isOpen={confirmRebuild} leastDestructiveRef={cancelRebuildRef} onClose={() => setConfirmRebuild(false)} isCentered>
        <AlertDialogOverlay bg="blackAlpha.400" />
        <AlertDialogContent borderRadius="xl">
          <AlertDialogHeader fontSize="16px">确认重建 RAG 索引</AlertDialogHeader>
          <AlertDialogBody fontSize="sm" color="gray.600">系统将清理商品与店铺知识的派生索引，并根据当前 SQLite 数据重新写入。手动导入的其他文档不会受影响。</AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRebuildRef} variant="ghost" onClick={() => setConfirmRebuild(false)}>取消</Button>
            <Button colorScheme="purple" onClick={confirmRagRebuild}>确认重建</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </VStack>
  );
};

export default React.memo(KnowledgeGovernance);
