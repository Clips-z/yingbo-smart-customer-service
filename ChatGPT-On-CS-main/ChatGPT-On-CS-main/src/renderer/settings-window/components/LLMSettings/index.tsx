import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  FormControl,
  Select,
  VStack,
  useToast,
  Stack,
  Skeleton,
  Box,
  Text,
  Badge,
  Flex,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  getConfig,
  updateConfig,
  checkGptHealth,
} from '../../../common/services/platform/controller';
import { LLMConfig } from '../../../common/services/platform/platform';
import ThirdPartyInterface from './ThirdParty';
import CozeSettings from './Coze';
import PromptKnowledge from './PromptKnowledge';
import { LLMTypeList, LLMDefaultConfig } from '../../../common/utils/constants';

interface LLMSettingsProps {
  appId?: string;
  instanceId?: string;
}

const LLMSettings: React.FC<LLMSettingsProps> = ({ appId, instanceId }) => {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [reply, setReply] = useState('');

  const { data, isLoading } = useQuery(
    ['config', 'llm', appId, instanceId],
    async () => {
      try {
        const resp = await getConfig({
          appId,
          instanceId,
          type: 'llm',
        });
        return resp;
      } catch (error) {
        const errormsg =
          error instanceof Error ? error.message : JSON.stringify(error);
        toast({
          title: '获取配置失败',
          description: errormsg,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });

        return null;
      }
    },
  );

  const [config, setConfig] = useState<LLMConfig>({
    appId: '',
    instanceId: '',
    llmType: '',
    model: '',
    baseUrl: '',
    key: '',
    systemPrompt: '',
    knowledgeBase: '',
    ragEnabled: false,
    cozeBotId: '',
    cozeUserId: '',
    cozeToken: '',
    cozeApiBase: 'https://api.coze.cn',
  });

  useEffect(() => {
    if (data) {
      const obj = data.data as LLMConfig;
      setConfig(obj);
    }
  }, [data]);

  const handleUpdateConfig = async (newConfig: Partial<LLMConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    try {
      await updateConfig({
        appId,
        instanceId,
        type: 'llm',
        cfg: updatedConfig,
      });
    } catch (error) {
      const errormsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      toast({
        title: '更新配置失败',
        description: errormsg,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleLocalConfig = (newConfig: Partial<LLMConfig>) => {
    setConfig((current) => ({ ...current, ...newConfig }));
  };

  const handleProviderChange = (value: string) => {
    setReply('');
    if (value === 'coze') {
      handleUpdateConfig({
        llmType: 'coze',
        cozeApiBase: config.cozeApiBase || 'https://api.coze.cn',
        cozeUserId: config.cozeUserId || 'lazy-customer-service',
      });
    } else {
      const preset = LLMDefaultConfig[value];
      const defaultModel = preset?.models?.[0] || '';
      const isSameType = config.llmType === value;
      handleUpdateConfig({
        llmType: value,
        baseUrl: isSameType ? config.baseUrl : (preset?.baseURL || ''),
        model: isSameType ? config.model : defaultModel,
      });
    }
  };

  const handleBaseURLChange = (e: ChangeEvent<HTMLInputElement>) => {
    let { value } = e.target;
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      value = `https://${value}`;
    }

    handleUpdateConfig({ baseUrl: value });
  };

  const handleCheckHealth = async () => {
    try {
      if (!config) return;
      const resp = await checkGptHealth(config);
      if (!resp.status) {
        throw new Error(resp.message);
      }

      setReply(resp.message);

      toast({
        title: config.llmType === 'coze' ? 'Coze 连接成功' : '模型连接成功',
        position: 'top',
        description: resp.message,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      const errormsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      toast({
        title: '连接失败',
        position: 'top',
        description: errormsg,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  if (isLoading) {
    return (
      <Stack spacing={4}>
        <Skeleton height="40px" borderRadius="md" />
        <Skeleton height="40px" borderRadius="md" />
        <Skeleton height="40px" borderRadius="md" />
      </Stack>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      {/* 步骤 1: 选择大模型供应商 */}
      <Box
        bg="gray.50"
        borderRadius="lg"
        p={4}
        border="1px solid"
        borderColor="gray.100"
      >
        <Flex align="center" gap={2} mb={3}>
          <Flex
            w="24px"
            h="24px"
            borderRadius="full"
            bg="brand.500"
            color="white"
            align="center"
            justify="center"
            fontSize="12px"
            fontWeight="700"
          >
            1
          </Flex>
          <Text fontWeight="600" fontSize="14px" color="gray.800">
            选择大模型供应商
          </Text>
        </Flex>
        <FormControl>
          <Select
            id="llmType"
            placeholder="请选择大模型类型"
            value={config.llmType}
            onChange={(e) => handleProviderChange(e.target.value)}
            bg="white"
            borderRadius="lg"
            size="md"
            focusBorderColor="brand.400"
          >
            {LLMTypeList.map((type) => (
              <option key={type.key} value={type.key}>
                {type.name}
              </option>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* 步骤 2: 配置连接信息 */}
      {config.llmType && (
        <Box
          bg="gray.50"
          borderRadius="lg"
          p={4}
          border="1px solid"
          borderColor="gray.100"
        >
          <Flex align="center" gap={2} mb={3}>
            <Flex
              w="24px"
              h="24px"
              borderRadius="full"
              bg={config.llmType ? 'brand.500' : 'gray.300'}
              color="white"
              align="center"
              justify="center"
              fontSize="12px"
              fontWeight="700"
            >
              2
            </Flex>
            <Text fontWeight="600" fontSize="14px" color="gray.800">
              配置连接信息
            </Text>
            {config.llmType && (
              <Badge colorScheme="brand" variant="subtle" fontSize="10px" borderRadius="full">
                {LLMTypeList.find((t) => t.key === config.llmType)?.name || config.llmType}
              </Badge>
            )}
          </Flex>

          {config.llmType !== 'coze' && (
            <ThirdPartyInterface
              config={config}
              handleUpdateConfig={handleUpdateConfig}
              handleBaseURLChange={handleBaseURLChange}
              handleCheckHealth={handleCheckHealth}
              reply={reply}
              show={show}
              setShow={setShow}
            />
          )}

          {config.llmType === 'coze' && (
            <CozeSettings
              config={config}
              handleUpdateConfig={handleUpdateConfig}
              handleCheckHealth={handleCheckHealth}
              reply={reply}
              show={show}
              setShow={setShow}
            />
          )}
        </Box>
      )}

      {/* 步骤 3: 提示词与知识库 */}
      {config.llmType && config.llmType !== 'coze' && (
        <Box
          bg="gray.50"
          borderRadius="lg"
          p={4}
          border="1px solid"
          borderColor="gray.100"
        >
          <Flex align="center" gap={2} mb={3}>
            <Flex
              w="24px"
              h="24px"
              borderRadius="full"
              bg="brand.500"
              color="white"
              align="center"
              justify="center"
              fontSize="12px"
              fontWeight="700"
            >
              3
            </Flex>
            <Text fontWeight="600" fontSize="14px" color="gray.800">
              提示词与知识库
            </Text>
          </Flex>
          <PromptKnowledge
            config={config}
            setLocalConfig={handleLocalConfig}
            saveConfig={handleUpdateConfig}
          />
        </Box>
      )}
    </VStack>
  );
};

export default LLMSettings;
