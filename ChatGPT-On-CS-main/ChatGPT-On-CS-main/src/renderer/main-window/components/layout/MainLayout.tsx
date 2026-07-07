import React, { useState } from 'react';
import { Box, Flex, Text, VStack } from '@chakra-ui/react';
import Sidebar, { ViewKey } from './Sidebar';
import AppManager from '../AppManager';
import ReplyWorkbench from '../ReplyWorkbench';
import Panels from '../Panels';
import LogBox from '../LogBox';

const sections: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: '工作台', subtitle: '管理客服平台与自动回复运行状态' },
  service: { title: '客服中心', subtitle: '实时查看与处理各平台客户消息' },
};

const MainContent = ({ view }: { view: ViewKey }) => {
  if (view === 'service') {
    return (
      <VStack spacing={4} align="stretch">
        <ReplyWorkbench />
      </VStack>
    );
  }
  return (
    <VStack spacing={4} align="stretch">
      <AppManager />
      <Flex direction={{ base: 'column', xl: 'row' }} gap={4} align="stretch">
        <Box flex="1" minW="0">
          <Panels />
        </Box>
        <Box flex="1" minW="0">
          <LogBox />
        </Box>
      </Flex>
    </VStack>
  );
};

const MainLayout = () => {
  const [view, setView] = useState<ViewKey>('dashboard');
  const sec = sections[view];

  return (
    <Flex h="100vh" bg="#F7FAFC">
      <Sidebar view={view} onChange={setView} />
      <Box flex="1" h="100vh" overflowY="auto">
        {/* 页面标题 */}
        <Box px={{ base: 5, md: 7 }} pt={6} pb={1}>
          <Text fontSize="22px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
            {sec.title}
          </Text>
          <Text fontSize="13px" color="gray.400" mt={1}>
            {sec.subtitle}
          </Text>
        </Box>
        {/* 内容区 */}
        <Box px={{ base: 5, md: 7 }} pb={8}>
          <MainContent view={view} />
        </Box>
      </Box>
    </Flex>
  );
};

export default MainLayout;
