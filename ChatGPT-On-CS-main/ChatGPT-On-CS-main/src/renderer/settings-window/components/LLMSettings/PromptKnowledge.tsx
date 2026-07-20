import React, { ChangeEvent, useEffect, useState, useCallback } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Spinner,
  Switch,
  Text,
  Textarea,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { LLMConfig } from '../../../common/services/platform/platform';
import { GET, POST } from '../../../common/services/common/api/request';

interface PromptKnowledgeProps {
  config: LLMConfig;
  setLocalConfig: (newConfig: Partial<LLMConfig>) => void;
  saveConfig: (newConfig: Partial<LLMConfig>) => void;
}

interface RagHealthState {
  state: 'stopped' | 'starting' | 'running' | 'degraded';
  processRunning: boolean;
  port: number;
  lastError?: string;
  totalChunks?: number;
}

const PromptKnowledge: React.FC<PromptKnowledgeProps> = ({
  config,
  setLocalConfig,
  saveConfig,
}) => {
  const toast = useToast();
  const [ragHealth, setRagHealth] = useState<RagHealthState | null>(null);
  const [syncing, setSyncing] = useState(false);

  // 轮询 RAG 服务健康状态（通过 Electron 后端代理，避免 CORS）
  useEffect(() => {
    if (!config.ragEnabled) {
      setRagHealth(null);
      return undefined;
    }

    let cancelled = false;

    const checkHealth = async () => {
      try {
        const result = await GET<{
          success: boolean;
          data?: { status: string; version: string; chunks?: number };
          message?: string;
        }>('/api/v1/rag/health');
        if (cancelled) return;
        if (result?.success && result?.data) {
          setRagHealth({
            state: 'running',
            processRunning: true,
            port: 8000,
            totalChunks: result.data.chunks || 0,
          });
        } else {
          setRagHealth({
            state: 'degraded',
            processRunning: false,
            port: 8000,
            lastError: result?.message || '服务返回异常',
          });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const msg =
            error && typeof error === 'object' && 'message' in error
              ? String((error as { message: unknown }).message)
              : '服务启动中...';
          setRagHealth({
            state: msg.includes('启动') || msg.includes('网络') ? 'starting' : 'degraded',
            processRunning: false,
            port: 8000,
            lastError: msg,
          });
        }
      }
    };

    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [config.ragEnabled]);

  const handleRagToggle = async (checked: boolean) => {
    setLocalConfig({ ragEnabled: checked });
    await saveConfig({ ragEnabled: checked });
    toast({
      title: checked ? 'RAG 向量检索已开启' : 'RAG 向量检索已关闭',
      description: checked
        ? '知识库将使用向量检索 + Reranking，正在启动服务...'
        : '已切换回关键词匹配模式',
      status: checked ? 'success' : 'info',
      duration: 3000,
    });
  };

  const syncTextToRag = useCallback(
    async (text: string) => {
      if (!config.ragEnabled || !text.trim()) return;
      setSyncing(true);
      try {
        const result = await POST<{ success: boolean; message?: string; data?: { chunks: number } }>(
          '/api/v1/rag/text-upload',
          { text, filename: 'knowledge_base.txt' },
        );
        if (result?.success && result?.data) {
          toast({
            title: '知识库已同步到向量库',
            description: `文本已分为 ${result.data.chunks} 个知识块`,
            status: 'success',
            duration: 3000,
          });
        } else {
          throw new Error(result?.message || '同步失败');
        }
      } catch (error: unknown) {
        const msg =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message: unknown }).message)
            : String(error);
        toast({
          title: '向量库同步失败',
          description: msg,
          status: 'warning',
          duration: 3000,
        });
      } finally {
        setSyncing(false);
      }
    },
    [config.ragEnabled, toast],
  );

  const importKnowledge = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = (await file.text()).trim();
      if (!text) throw new Error('文件内容为空');
      const knowledgeBase = text.slice(0, 30000);
      setLocalConfig({ knowledgeBase });
      await saveConfig({ knowledgeBase });

      // 如果 RAG 开启，同时上传到向量库
      if (config.ragEnabled) {
        await syncTextToRag(knowledgeBase);
      } else {
        toast({
          title: '知识库已导入',
          description:
            text.length > 30000
              ? '内容较长，已保留前 30000 个字符'
              : file.name,
          status: 'success',
          duration: 3000,
        });
      }
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);
      toast({
        title: '知识库导入失败',
        description: msg,
        status: 'error',
      });
    }
  };

  const handleKnowledgeBlur = (text: string) => {
    saveConfig({ knowledgeBase: text });
    if (config.ragEnabled && text.trim()) {
      syncTextToRag(text);
    }
  };

  const ragStatusColor = (() => {
    if (!config.ragEnabled) return 'gray';
    if (!ragHealth) return 'gray';
    switch (ragHealth.state) {
      case 'running':
        return 'green';
      case 'starting':
        return 'yellow';
      case 'degraded':
        return 'red';
      default:
        return 'gray';
    }
  })();

  const ragStatusText = (() => {
    if (!config.ragEnabled) return '未启用';
    if (!ragHealth) return '检测中...';
    switch (ragHealth.state) {
      case 'running':
        return `运行中 · ${ragHealth.totalChunks || 0} 个知识块`;
      case 'starting':
        return '启动中...';
      case 'degraded':
        return `异常: ${ragHealth.lastError || '未知错误'}`;
      default:
        return '已停止';
    }
  })();

  return (
    <VStack width="full" align="stretch" spacing={4}>
      <Alert status="info" borderRadius="6px">
        <AlertIcon />
        人设和本地知识库会应用到所有模型；Coze Bot
        自己绑定的知识库也会同时生效。
      </Alert>
      <FormControl>
        <FormLabel>客服人设</FormLabel>
        <Textarea
          value={config.systemPrompt}
          placeholder="例如：你是户外用品店客服，说话简短自然；不了解的参数先询问具体型号，不承诺未确认的库存和价格。"
          minH="110px"
          maxLength={8000}
          onChange={(event) =>
            setLocalConfig({ systemPrompt: event.target.value })
          }
          onBlur={(event) => saveConfig({ systemPrompt: event.target.value })}
        />
        <FormHelperText>
          建议写清语气、身份、业务边界和禁止承诺的事项。
        </FormHelperText>
      </FormControl>
      <FormControl>
        <HStack justify="space-between" mb={2}>
          <HStack spacing={3}>
            <FormLabel m={0}>本地知识库</FormLabel>
            <HStack spacing={2}>
              <Switch
                size="sm"
                colorScheme="purple"
                isChecked={config.ragEnabled}
                onChange={(e) => handleRagToggle(e.target.checked)}
              />
              <Text fontSize="xs" color="gray.500">
                {config.ragEnabled ? '向量检索+Reranking' : '关键词匹配'}
              </Text>
            </HStack>
          </HStack>
          <HStack spacing={2}>
            {config.ragEnabled && (
              <Badge colorScheme={ragStatusColor} variant="subtle" fontSize="xs">
                {ragHealth?.state === 'starting' && (
                  <Spinner size="2xs" mr={1} />
                )}
                {ragStatusText}
              </Badge>
            )}
            {syncing && <CircularProgress size={4} isIndeterminate />}
            <Button as="label" size="sm" colorScheme="teal" cursor="pointer">
              导入文件
              <input
                hidden
                type="file"
                accept=".txt,.md,.csv,.json"
                onChange={importKnowledge}
              />
            </Button>
          </HStack>
        </HStack>
        <Textarea
          value={config.knowledgeBase}
          placeholder={
            config.ragEnabled
              ? 'RAG 模式：输入或导入文本后，内容会自动分块、向量化并存入向量库。客服回复时将通过向量检索 + Reranking 找到最相关的知识。'
              : '可直接粘贴商品参数、价格规则、发货说明、售后流程和常见问题，也可以导入 TXT / Markdown / CSV / JSON 文件。'
          }
          minH="180px"
          maxLength={30000}
          onChange={(event) =>
            setLocalConfig({ knowledgeBase: event.target.value })
          }
          onBlur={(event) => handleKnowledgeBlur(event.target.value)}
        />
        <Text mt={1} color="gray.500" fontSize="xs" textAlign="right">
          {config.knowledgeBase.length} / 30000
          {config.ragEnabled && ragHealth?.totalChunks !== undefined && (
            <Text as="span" ml={2} color="purple.500">
              · 向量库 {ragHealth.totalChunks} 块
            </Text>
          )}
        </Text>
        {config.ragEnabled && (
          <FormHelperText color="purple.500">
            RAG 模式已启用：文本编辑后会自动同步到向量库，支持递归分块和
            Reranking 重排序，检索精度远高于关键词匹配。
          </FormHelperText>
        )}
      </FormControl>
    </VStack>
  );
};

export default PromptKnowledge;
