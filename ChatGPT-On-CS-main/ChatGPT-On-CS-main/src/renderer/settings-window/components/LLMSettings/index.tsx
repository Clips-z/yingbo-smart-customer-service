import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  FormControl,
  FormLabel,
  Select,
  VStack,
  useToast,
  Stack,
  Skeleton,
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
      // 切换模型类型时，填充该模型类型的默认 base URL 和推荐模型
      // 如果当前已有配置且切换的是相同类型，则保留用户已修改的值
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
      <Stack>
        <Skeleton height="20px" />
        <Skeleton height="20px" />
        <Skeleton height="20px" />
      </Stack>
    );
  }

  return (
    <VStack spacing="4" align="start">
      <FormControl>
        <FormLabel htmlFor="llmType">选择大模型类型</FormLabel>
        <Select
          id="llmType"
          placeholder="选择大模型类型"
          value={config.llmType}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          {LLMTypeList.map((type) => (
            <option key={type.key} value={type.key}>
              {type.name}
            </option>
          ))}
        </Select>
      </FormControl>

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

      {config.llmType !== 'coze' && (
        <PromptKnowledge
          config={config}
          setLocalConfig={handleLocalConfig}
          saveConfig={handleUpdateConfig}
        />
      )}
    </VStack>
  );
};

export default LLMSettings;
