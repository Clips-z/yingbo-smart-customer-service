import React, { ChangeEvent } from 'react';
import {
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Button,
  Text,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { LLMConfig } from '../../../common/services/platform/platform';
import { ModelList, LLMDefaultConfig } from '../../../common/utils/constants';

interface ThirdPartyInterfaceProps {
  config: LLMConfig;
  handleUpdateConfig: (newConfig: Partial<LLMConfig>) => void;
  handleBaseURLChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleCheckHealth: () => void;
  reply: string;
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
}

const ThirdPartyInterface: React.FC<ThirdPartyInterfaceProps> = ({
  config,
  handleUpdateConfig,
  handleBaseURLChange,
  handleCheckHealth,
  reply,
  show,
  setShow,
}) => {
  const currentPreset = config.llmType ? LLMDefaultConfig[config.llmType] : null;
  const suggestedModels = currentPreset?.models?.filter(Boolean) || ModelList.map((m) => m.key);
  const addressLabel = currentPreset?.baseURL
    ? `API 地址设置（${currentPreset.baseURL}）`
    : 'API 地址设置（尾部需要加上 /v1）';

  return (
    <>
      <FormControl>
        <FormLabel htmlFor="model">选择或输入模型</FormLabel>
        <InputGroup>
          <Input
            id="model"
            placeholder={currentPreset ? (currentPreset.models[0] || '选择或输入模型') : '选择或输入模型'}
            value={config.model}
            onChange={(e) => handleUpdateConfig({ model: e.target.value })}
            list="models"
          />
          <datalist id="models">
            {suggestedModels.map((model, idx) => (
              <option key={model + idx} value={model}>
                {model}
              </option>
            ))}
          </datalist>
        </InputGroup>
      </FormControl>

      <FormControl>
        <FormLabel htmlFor="gptAddress" mt="8px">
          <Text as="span" bg="orange.100" px="1" py="1" borderRadius="sm" fontSize="sm">
            {addressLabel}
          </Text>
          <Button
            size="sm"
            colorScheme="blue"
            ml="4"
            loadingText="检查中"
            onClick={handleCheckHealth}
          >
            检查连接
          </Button>
        </FormLabel>
        <InputGroup size="sm">
          <Input
            id="gptAddress"
            value={config.baseUrl}
            placeholder={
              currentPreset
                ? `默认：${currentPreset.baseURL || '需手动填写'}`
                : '输入站点地址'
            }
            onChange={handleBaseURLChange}
          />
        </InputGroup>
        {currentPreset?.hint && (
          <Text fontSize="xs" color="gray.500" mt="1">
            {currentPreset.hint}
          </Text>
        )}
      </FormControl>

      <FormControl>
        <FormLabel htmlFor="apiKey">API Key</FormLabel>
        <InputGroup size="md">
          <Input
            id="apiKey"
            pr="4.5rem"
            type={show ? 'text' : 'password'}
            placeholder="Enter password"
            value={config.key}
            onChange={(e) => handleUpdateConfig({ key: e.target.value })}
          />
          <InputRightElement width="4.5rem">
            <Button
              h="1.75rem"
              size="sm"
              onClick={() => {
                setShow(!show);
              }}
            >
              {show ? <ViewIcon /> : <ViewOffIcon />}
            </Button>
          </InputRightElement>
        </InputGroup>
      </FormControl>

      {reply && (
        <>
          <Text>回复内容</Text>
          <Text>{reply}</Text>
        </>
      )}
    </>
  );
};

export default React.memo(ThirdPartyInterface);
