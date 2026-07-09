import React from 'react';
import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Select,
  Text,
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  HStack,
  VStack,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { LLMConfig } from '../../../common/services/platform/platform';

interface CozeSettingsProps {
  config: LLMConfig;
  handleUpdateConfig: (newConfig: Partial<LLMConfig>) => void;
  handleCheckHealth: () => void;
  reply: string;
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
}

const normalizeBotId = (value: string) => {
  const botIdFromUrl = value.match(/\/bot\/(\d+)/)?.[1];
  return botIdFromUrl || value.replace(/\D/g, '');
};

const DETECTED_BOT_ID = '7483703340833587226';

const CozeSettings: React.FC<CozeSettingsProps> = ({
  config,
  handleUpdateConfig,
  handleCheckHealth,
  reply,
  show,
  setShow,
}) => (
  <VStack width="full" align="stretch" spacing={4}>
    <Alert status="info" borderRadius="md" alignItems="flex-start">
      <AlertIcon mt="1px" />
      <AlertDescription>
        当前由 Coze
        项目统一管理人设、知识库、插件和工作流。迎波智能客服只负责传入顾客对话并接收最终回复，不会再叠加本地提示词。
      </AlertDescription>
    </Alert>
    <FormControl>
      <FormLabel>Coze 地区</FormLabel>
      <Select
        value={config.cozeApiBase || 'https://api.coze.cn'}
        onChange={(event) =>
          handleUpdateConfig({
            cozeApiBase: event.target.value,
            llmType: 'coze',
          })
        }
      >
        <option value="https://api.coze.cn">中国区（coze.cn）</option>
        <option value="https://api.coze.com">国际区（coze.com）</option>
      </Select>
    </FormControl>
    <FormControl isRequired>
      <FormLabel>Personal Access Token</FormLabel>
      <InputGroup>
        <Input
          type={show ? 'text' : 'password'}
          value={config.cozeToken}
          placeholder="pat_..."
          onChange={(event) =>
            handleUpdateConfig({ cozeToken: event.target.value })
          }
        />
        <InputRightElement width="4.5rem">
          <Button size="sm" h="1.75rem" onClick={() => setShow(!show)}>
            {show ? <ViewIcon /> : <ViewOffIcon />}
          </Button>
        </InputRightElement>
      </InputGroup>
      <FormHelperText>在 Coze 开放平台的个人访问令牌页面创建。</FormHelperText>
    </FormControl>
    <FormControl isRequired>
      <HStack justify="space-between" mb={2}>
        <FormLabel mb={0}>智能体 ID（Bot ID）</FormLabel>
        <Button
          size="xs"
          variant="outline"
          onClick={() => handleUpdateConfig({ cozeBotId: DETECTED_BOT_ID })}
        >
          使用已识别项目
        </Button>
      </HStack>
      <Input
        value={config.cozeBotId}
        placeholder="可直接粘贴 Coze 开发页网址或数字 ID"
        onChange={(event) =>
          handleUpdateConfig({ cozeBotId: normalizeBotId(event.target.value) })
        }
      />
      <FormHelperText>
        你的“电商自动回复客服”ID 为 {DETECTED_BOT_ID}。使用前需在 Coze 发布到
        API 渠道，发布后的版本才会被调用。
      </FormHelperText>
    </FormControl>
    <FormControl>
      <FormLabel>用户标识前缀</FormLabel>
      <Input
        value={config.cozeUserId}
        placeholder="lazy-customer-service"
        onChange={(event) =>
          handleUpdateConfig({ cozeUserId: event.target.value })
        }
      />
      <FormHelperText>
        系统会对联系人名称做哈希，不会把微信昵称直接作为 Coze 用户 ID。
      </FormHelperText>
    </FormControl>
    <HStack>
      <Button
        colorScheme="blue"
        onClick={handleCheckHealth}
        isDisabled={!config.cozeToken.trim() || !config.cozeBotId.trim()}
      >
        检查 Coze 连接
      </Button>
      <Badge
        colorScheme={
          config.cozeToken.trim() && config.cozeBotId.trim() ? 'orange' : 'gray'
        }
      >
        {config.cozeToken.trim() && config.cozeBotId.trim()
          ? '配置已填写，等待测试'
          : '尚未完成配置'}
      </Badge>
    </HStack>
    {reply && <Text color="green.600">测试回复：{reply}</Text>}
  </VStack>
);

export default React.memo(CozeSettings);
