import React, { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Flex,
  HStack,
  IconButton,
  Text,
  Textarea,
  Tooltip,
  useClipboard,
} from '@chakra-ui/react';
import {
  FiCheck,
  FiClipboard,
  FiCornerUpLeft,
  FiUser,
  FiSend,
  FiBookOpen,
} from 'react-icons/fi';
import {
  fillQianniuSuggestion,
  fillWechatSuggestion,
  fillWecomSuggestion,
  updateQianniuSuggestionStatus,
  getSuggestionEvidence,
  markSuggestionEvidence,
} from '../../../common/services/platform/controller';
import {
  QianniuReplyMode,
  ReplySuggestion,
  RetrievalEvidenceItem,
} from '../../../common/services/platform/platform';
import { useToast } from '../../hooks/useToast';
import {
  formatTime,
  platformLabels,
  statusColorMap,
  statusLabels,
} from './constants';

interface ReplyCardProps {
  item: ReplySuggestion;
  mode: QianniuReplyMode;
  onChanged: () => void;
  platformId: string;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

// 平台色映射
const platformColorMap: Record<string, string> = {
  win_qianniu: 'orange',
  win_wechat: 'green',
  win_wecom: 'blue',
  win_jinmai: 'red',
  win_pdd: 'red',
  win_douyin: 'gray',
};

const ReplyCard = React.memo(
  ({
    item,
    mode,
    onChanged,
    platformId,
    isSelected,
    onToggleSelect,
  }: ReplyCardProps) => {
    const { toast } = useToast();
    const [content, setContent] = useState(item.reply_content.slice(0, 300));
    const [isWorking, setIsWorking] = useState(false);
    const [evidence, setEvidence] = useState<RetrievalEvidenceItem[] | null>(null);
    const { onCopy, hasCopied } = useClipboard(content);

    const toggleEvidence = async () => {
      if (evidence) {
        setEvidence(null);
        return;
      }
      setEvidence(await getSuggestionEvidence(item.id));
    };

    const markIrrelevant = async (id: string) => {
      await markSuggestionEvidence(id, false);
      setEvidence((current) => current?.map((entry) =>
        entry.id === id ? { ...entry, relevance_feedback: 'irrelevant' } : entry,
      ) || null);
    };

    useEffect(
      () => setContent(item.reply_content.slice(0, 300)),
      [item.reply_content],
    );

    const handleFill = async (
      fillFn: (id: number, content: string) => Promise<unknown>,
      successTitle: string,
      successDesc: string,
      errorTitle: string,
    ) => {
      setIsWorking(true);
      try {
        await fillFn(item.id, content);
        toast({
          title: successTitle,
          description: successDesc,
          status: 'success',
          duration: 3500,
          isClosable: true,
        });
        onChanged();
      } catch (error) {
        toast({
          title: errorTitle,
          description: extractErrorMessage(error),
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setIsWorking(false);
      }
    };

    const fillReply = () =>
      handleFill(
        fillQianniuSuggestion,
        '已填入千牛输入框',
        `${item.sender}，请在千牛中确认后发送`,
        '填入失败',
      );

    const fillWechatReply = () =>
      handleFill(
        fillWechatSuggestion,
        '已定位微信联系人并填入回复',
        `${item.sender}，请在微信中确认后发送`,
        '定位微信失败',
      );

    const fillWecomReply = () =>
      handleFill(
        fillWecomSuggestion,
        '已定位企微联系人并填入回复',
        `${item.sender}，请在企业微信中确认后发送`,
        '定位企微失败',
      );

    const updateStatus = async (status: 'pending' | 'dismissed') => {
      setIsWorking(true);
      try {
        await updateQianniuSuggestionStatus(item.id, status);
        onChanged();
      } finally {
        setIsWorking(false);
      }
    };

    const fillButtonConfig: Record<
      string,
      { label: string; colorScheme: string; onClick: () => Promise<void>; tooltip: string }
    > = {
      win_qianniu: {
        label: '填入千牛',
        colorScheme: 'orange',
        onClick: fillReply,
        tooltip:
          mode === 'assist'
            ? '切换到对应用户并填入，不会发送'
            : '切换到辅助回复模式后可用',
      },
      win_wechat: {
        label: '填入微信',
        colorScheme: 'green',
        onClick: fillWechatReply,
        tooltip:
          mode === 'assist'
            ? '定位对应联系人并填入，不会发送'
            : '切换到微信辅助回复模式后可用',
      },
      win_wecom: {
        label: '填入企微',
        colorScheme: 'blue',
        onClick: fillWecomReply,
        tooltip:
          mode === 'assist'
            ? '定位对应联系人并填入，不会发送'
            : '切换到企微辅助回复模式后可用',
      },
    };

    const fillConfig = fillButtonConfig[platformId];
    const pColor = platformColorMap[platformId] || 'gray';
    const leftBorderColor = (() => {
      switch (item.status) {
        case 'pending': return 'orange.400';
        case 'prepared': return 'blue.400';
        case 'sent': return 'green.400';
        case 'failed': return 'red.400';
        default: return 'gray.200';
      }
    })();

    return (
      <Box
        bg="white"
        borderRadius="lg"
        boxShadow={isSelected ? 'md' : 'sm'}
        border="1px solid"
        borderColor={isSelected ? 'brand.200' : 'gray.100'}
        transition="all 0.2s ease"
        _hover={{ boxShadow: 'md' }}
        position="relative"
        overflow="hidden"
      >
        {/* 左侧状态色条 */}
        <Box
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          w="4px"
          bg={leftBorderColor}
        />

        <Box pl={5} pr={4} pt={3} pb={3}>
          {/* 头部：发送者信息 */}
          <Flex justify="space-between" align="flex-start" gap={2} mb={3}>
            <HStack minW={0} spacing={2}>
              {onToggleSelect && (
                <Checkbox
                  isChecked={isSelected || false}
                  onChange={() => onToggleSelect(item.id)}
                  size="sm"
                  colorScheme="brand"
                  flexShrink={0}
                />
              )}
              <Box color={`${pColor}.500`} flexShrink={0}>
                <FiUser />
              </Box>
              <Text fontWeight="700" fontSize="13px" noOfLines={1} color="gray.800">
                {item.sender}
              </Text>
              <Badge
                colorScheme={platformColorMap[item.platform_id] || 'gray'}
                variant="subtle"
                fontSize="10px"
                borderRadius="sm"
              >
                {platformLabels[item.platform_id] || item.platform_id}
              </Badge>
              <Badge
                colorScheme={statusColorMap[item.status]}
                variant="subtle"
                fontSize="10px"
                borderRadius="sm"
              >
                {statusLabels[item.status]}
              </Badge>
            </HStack>
            <Text color="gray.400" fontSize="11px" whiteSpace="nowrap" flexShrink={0}>
              {formatTime(item.created_at)}
            </Text>
          </Flex>

          {/* 买家原话 — 气泡样式 */}
          <Box
            bg="gray.50"
            borderRadius="lg"
            p={2.5}
            mb={3}
            position="relative"
          >
            <Text color="gray.400" fontSize="10px" fontWeight={600} mb={1} textTransform="uppercase" letterSpacing="0.05em">
              买家原话
            </Text>
            <Text fontSize="13px" color="gray.700" lineHeight="1.6">
              {item.incoming_content}
            </Text>
          </Box>

          {/* 建议回复 */}
          <Box>
            <Flex align="center" mb={1.5} justify="space-between">
              <Text color="gray.400" fontSize="10px" fontWeight={600} textTransform="uppercase" letterSpacing="0.05em">
                建议回复
              </Text>
              <Text color="gray.400" fontSize="10px">
                可编辑 · {content.length}/300
              </Text>
            </Flex>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              size="sm"
              minH="68px"
              maxLength={300}
              resize="vertical"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="md"
              fontSize="13px"
              _focus={{ borderColor: 'brand.400', boxShadow: '0 0 0 1px var(--chakra-colors-brand-200)' }}
              isDisabled={item.status === 'sent'}
            />
          </Box>

          {item.retrieval_status && item.retrieval_status !== 'disabled' && (
            <Box mt={2}>
              <Button size="xs" variant="ghost" leftIcon={<FiBookOpen />} onClick={toggleEvidence}>
                {evidence ? '收起回复依据' : `查看回复依据 · ${item.retrieval_status}`}
              </Button>
              {evidence && (
                <Box mt={2} borderWidth="1px" borderColor="blue.100" bg="blue.50" borderRadius="md" p={2}>
                  {evidence.length === 0 ? <Text fontSize="xs" color="gray.500">本次没有命中可引用的知识</Text> : evidence.map((entry) => (
                    <Box key={entry.id} py={1.5} borderBottomWidth="1px" borderColor="blue.100" _last={{ borderBottomWidth: 0 }}>
                      <Flex justify="space-between" gap={2}>
                        <Text fontSize="xs" fontWeight="700">#{entry.rank} {entry.source}</Text>
                        <Button size="xs" variant="link" colorScheme="red" isDisabled={entry.relevance_feedback === 'irrelevant'} onClick={() => markIrrelevant(entry.id)}>不相关</Button>
                      </Flex>
                      <Text fontSize="xs" color="gray.600" mt={1} noOfLines={3}>{entry.content_excerpt}</Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* 底部操作栏 */}
          <Flex justify="space-between" align="center" mt={3} gap={2} wrap="wrap">
            <ButtonGroup size="xs" variant="ghost" spacing={0}>
              <Tooltip label={hasCopied ? '已复制' : '复制回复'}>
                <IconButton
                  aria-label="复制回复"
                  icon={<FiClipboard />}
                  onClick={onCopy}
                  color={hasCopied ? 'green.500' : 'gray.400'}
                  _hover={{ color: 'brand.500', bg: 'brand.50' }}
                  borderRadius="md"
                  size="sm"
                />
              </Tooltip>
              {item.status === 'pending' ? (
                <Tooltip label="标记为已处理">
                  <IconButton
                    aria-label="标记已处理"
                    icon={<FiCheck />}
                    isDisabled={isWorking}
                    onClick={() => updateStatus('dismissed')}
                    color="gray.400"
                    _hover={{ color: 'green.500', bg: 'green.50' }}
                    borderRadius="md"
                    size="sm"
                  />
                </Tooltip>
              ) : (
                <Tooltip label="重新放回待回复">
                  <IconButton
                    aria-label="重新待回复"
                    icon={<FiCornerUpLeft />}
                    isDisabled={isWorking}
                    onClick={() => updateStatus('pending')}
                    color="gray.400"
                    _hover={{ color: 'orange.500', bg: 'orange.50' }}
                    borderRadius="md"
                    size="sm"
                  />
                </Tooltip>
              )}
            </ButtonGroup>

            {fillConfig && item.status !== 'sent' && (
              <Tooltip label={fillConfig.tooltip}>
                <Button
                  size="sm"
                  leftIcon={<FiSend />}
                  colorScheme={fillConfig.colorScheme}
                  isLoading={isWorking}
                  isDisabled={mode !== 'assist' || !content.trim()}
                  onClick={fillConfig.onClick}
                  borderRadius="lg"
                  fontWeight={600}
                  fontSize="12px"
                  boxShadow="sm"
                  _hover={{ transform: 'translateY(-1px)', boxShadow: 'md' }}
                  transition="all 0.2s"
                >
                  {fillConfig.label}
                </Button>
              </Tooltip>
            )}
          </Flex>
        </Box>
      </Box>
    );
  },
);

ReplyCard.displayName = 'ReplyCard';

export default ReplyCard;
