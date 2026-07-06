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
  FiEdit3,
  FiMessageSquare,
} from 'react-icons/fi';
import {
  fillQianniuSuggestion,
  fillWechatSuggestion,
  fillWecomSuggestion,
  updateQianniuSuggestionStatus,
} from '../../../common/services/platform/controller';
import {
  QianniuReplyMode,
  ReplySuggestion,
} from '../../../common/services/platform/platform';
import { useToast } from '../../hooks/useToast';
import {
  borderColorMap,
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
    const { onCopy, hasCopied } = useClipboard(content);

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
        colorScheme: 'teal',
        onClick: fillReply,
        tooltip:
          mode === 'assist'
            ? '切换到对应用户并填入，不会发送'
            : '切换到辅助回复模式后可用',
      },
      win_wechat: {
        label: '定位并填入微信',
        colorScheme: 'green',
        onClick: fillWechatReply,
        tooltip:
          mode === 'assist'
            ? '定位对应联系人并填入，不会发送'
            : '切换到微信辅助回复模式后可用',
      },
      win_wecom: {
        label: '定位并填入企微',
        colorScheme: 'purple',
        onClick: fillWecomReply,
        tooltip:
          mode === 'assist'
            ? '定位对应联系人并填入，不会发送'
            : '切换到企微辅助回复模式后可用',
      },
    };

    const fillConfig = fillButtonConfig[platformId];

    return (
      <Box
        borderWidth="1px"
        borderColor={borderColorMap[item.status]}
        borderRadius="6px"
        bg="white"
        p={3}
        width="full"
        opacity={isSelected ? 1 : undefined}
      >
        <Flex justify="space-between" align="center" gap={2} mb={2}>
          <HStack minW={0} spacing={2}>
            {onToggleSelect && (
              <Checkbox
                isChecked={isSelected || false}
                onChange={() => onToggleSelect(item.id)}
                size="sm"
                flexShrink={0}
              />
            )}
            <Box color="orange.500" flexShrink={0}>
              <FiMessageSquare />
            </Box>
            <Text fontWeight="700" fontSize="sm" noOfLines={1}>
              {item.sender}
            </Text>
            <Badge colorScheme="purple" flexShrink={0}>
              {platformLabels[item.platform_id] || item.platform_id}
            </Badge>
            <Badge colorScheme={statusColorMap[item.status]} flexShrink={0}>
              {statusLabels[item.status]}
            </Badge>
          </HStack>
          <Text color="gray.500" fontSize="xs" whiteSpace="nowrap">
            {formatTime(item.created_at)}
          </Text>
        </Flex>

        <Box borderLeft="3px solid" borderColor="gray.300" pl={2} mb={3}>
          <Text color="gray.500" fontSize="xs" mb={1}>
            买家原话
          </Text>
          <Text fontSize="sm">{item.incoming_content}</Text>
        </Box>

        <Text color="gray.500" fontSize="xs" mb={1}>
          建议回复
        </Text>
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          size="sm"
          minH="76px"
          maxLength={300}
          resize="vertical"
          bg="gray.50"
          isDisabled={item.status === 'sent'}
        />

        <Flex justify="space-between" align="center" mt={2} gap={2} wrap="wrap">
          <ButtonGroup size="sm" variant="ghost" spacing={1}>
            <Tooltip label={hasCopied ? '已复制' : '复制回复'}>
              <IconButton
                aria-label="复制回复"
                icon={<FiClipboard />}
                onClick={onCopy}
              />
            </Tooltip>
            {item.status === 'pending' ? (
              <Tooltip label="移到已处理">
                <IconButton
                  aria-label="标记已处理"
                  icon={<FiCheck />}
                  isDisabled={isWorking}
                  onClick={() => updateStatus('dismissed')}
                />
              </Tooltip>
            ) : (
              <Tooltip label="重新放回待回复">
                <IconButton
                  aria-label="重新待回复"
                  icon={<FiCornerUpLeft />}
                  isDisabled={isWorking}
                  onClick={() => updateStatus('pending')}
                />
              </Tooltip>
            )}
          </ButtonGroup>

          {fillConfig && item.status !== 'sent' && (
            <Tooltip label={fillConfig.tooltip}>
              <Button
                size="sm"
                leftIcon={<FiEdit3 />}
                colorScheme={fillConfig.colorScheme}
                isLoading={isWorking}
                isDisabled={mode !== 'assist' || !content.trim()}
                onClick={fillConfig.onClick}
              >
                {fillConfig.label}
              </Button>
            </Tooltip>
          )}
        </Flex>
      </Box>
    );
  },
);

ReplyCard.displayName = 'ReplyCard';

export default ReplyCard;
