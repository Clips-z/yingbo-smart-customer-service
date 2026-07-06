import React from 'react';
import {
  Box,
  Button,
  Heading,
  List,
  ListIcon,
  ListItem,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';
import PageContainer from '../../../common/components/PageContainer';

const AboutPage: React.FC = () => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');

  return (
    <PageContainer>
      <VStack align="stretch" spacing={6}>
        <Box>
          <Heading size="lg">迎波智能客服</Heading>
          <Text mt={2} color="gray.600">
            面向微信、千牛、京麦和企业微信等工作场景的智能客服工作台。
          </Text>
        </Box>

        <List spacing={3}>
          <ListItem>
            <ListIcon as={CheckCircleIcon} color="teal.500" />
            根据已启动的平台自动识别并展示对应回复任务
          </ListItem>
          <ListItem>
            <ListIcon as={CheckCircleIcon} color="teal.500" />
            支持仅提示、辅助回复和无人值守三种工作模式
          </ListItem>
          <ListItem>
            <ListIcon as={CheckCircleIcon} color="teal.500" />
            支持 OpenAI 兼容模型、通义千问、Coze 智能体等回复来源
          </ListItem>
          <ListItem>
            <ListIcon as={CheckCircleIcon} color="teal.500" />
            支持本地知识库、客服人设、关键词匹配和转人工规则
          </ListItem>
        </List>

        <Stack direction={{ base: 'column', md: 'row' }} align="center">
          <Button
            colorScheme="teal"
            onClick={() =>
              window.electron.ipcRenderer.sendMessage('open-user-manual')
            }
          >
            打开使用手册
          </Button>
          <Text color="gray.600">当前版本：{currentVersion}</Text>
        </Stack>

        <Box borderTopWidth="1px" pt={4}>
          <Text fontWeight="semibold">版权所有 © 2026 YinBo</Text>
          <Text mt={1} fontSize="sm" color="gray.500">
            产品名称、界面与使用文档统一由 YinBo 维护。
          </Text>
        </Box>
      </VStack>
    </PageContainer>
  );
};

export default AboutPage;
