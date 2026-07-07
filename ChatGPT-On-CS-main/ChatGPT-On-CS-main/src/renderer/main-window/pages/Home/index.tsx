import React, { useEffect } from 'react';
import { Box, VStack, Flex, Heading, Text, HStack, Badge } from '@chakra-ui/react';
import PageContainer from '../../../common/components/PageContainer';
import { trackPageView } from '../../../common/services/analytics';
import AppManager from '../../components/AppManager/index';
import Panels from '../../components/Panels';
import LogBox from '../../components/LogBox';
import ReplyWorkbench from '../../components/ReplyWorkbench';

const HomePage = () => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');
  useEffect(() => {
    trackPageView(`Home-${currentVersion}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageContainer>
      {/* Hero 区块 — intro.png 风格 */}
      <Box
        position="relative"
        borderRadius="2xl"
        p={{ base: 5, md: 7 }}
        mb={5}
        overflow="hidden"
        bgGradient="linear-gradient(135deg, #4A5BB3 0%, #2A83FF 55%, #4997FF 100%)"
        boxShadow="0 20px 40px -16px rgba(74, 91, 179, 0.5)"
      >
        {/* 装饰光斑 */}
        <Box position="absolute" top="-40px" right="-20px" w="180px" h="180px" borderRadius="full" bg="whiteAlpha.200" />
        <Box position="absolute" bottom="-60px" left="30%" w="140px" h="140px" borderRadius="full" bg="whiteAlpha.150" />
        <Flex direction="column" position="relative" zIndex={1}>
          <HStack spacing={2} mb={3}>
            <Badge bg="whiteAlpha.250" color="white" borderRadius="full" px={3} py={1} fontSize="11px" fontWeight={600}>
              ✨ v{currentVersion}
            </Badge>
            <Badge bg="whiteAlpha.250" color="white" borderRadius="full" px={3} py={1} fontSize="11px" fontWeight={600}>
              🤖 AI 驱动
            </Badge>
          </HStack>
          <Heading as="h1" color="white" fontSize={{ base: '22px', md: '28px' }} fontWeight={800} lineHeight={1.25} mb={2}>
            多平台智能客服工作台
          </Heading>
          <Text color="whiteAlpha.850" fontSize="14px" maxW="520px" lineHeight={1.7}>
            支持千牛、京麦、微信、企业微信四大平台，自动捕捉客户消息，AI 智能生成回复，
            让每一次服务都更快、更专业。
          </Text>
          <HStack spacing={6} mt={4}>
            <Box>
              <Text color="white" fontSize="22px" fontWeight={800}>4</Text>
              <Text color="whiteAlpha.700" fontSize="11px">支持平台</Text>
            </Box>
            <Box>
              <Text color="white" fontSize="22px" fontWeight={800}>24/7</Text>
              <Text color="whiteAlpha.700" fontSize="11px">全天候值守</Text>
            </Box>
            <Box>
              <Text color="white" fontSize="22px" fontWeight={800}>⚡</Text>
              <Text color="whiteAlpha.700" fontSize="11px">毫秒级响应</Text>
            </Box>
          </HStack>
        </Flex>
      </Box>

      <VStack spacing={3} pb={4}>
        {/* 平台管理 */}
        <Box w="full">
          <AppManager />
        </Box>

        {/* 回复工作台 */}
        <Box w="full">
          <ReplyWorkbench />
        </Box>

        {/* 控制面板 */}
        <Box w="full">
          <Panels />
        </Box>

        {/* 运行日志 */}
        <Box w="full">
          <LogBox />
        </Box>
      </VStack>
    </PageContainer>
  );
};

export default HomePage;
