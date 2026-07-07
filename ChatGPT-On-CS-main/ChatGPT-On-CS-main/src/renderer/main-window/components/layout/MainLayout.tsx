import React, { useState } from 'react';
import { Box, Flex, Text, VStack } from '@chakra-ui/react';
import TopBar, { ViewKey } from './TopBar';
import AppManager from '../AppManager';
import ReplyWorkbench from '../ReplyWorkbench';
import Panels from '../Panels';
import LogBox from '../LogBox';

const DashboardContent = () => (
  <VStack spacing={4} align="stretch">
    {/* 区块标题 */}
    <Box pt={1}>
      <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
        平台管理
      </Text>
      <Text fontSize="12.5px" color="gray.400" mt={0.5}>
        启停各平台客服，查看自动回复运行状态
      </Text>
    </Box>

    {/* 平台卡片 */}
    <AppManager />

    {/* 控制面板 + 日志：窄窗口纵向堆叠，窗口变宽后左右并排 */}
    <Flex direction={{ base: 'column', lg: 'row' }} gap={4} align="stretch">
      <Box flex="1" minW="0">
        <Panels />
      </Box>
      <Box flex="1" minW="0">
        <LogBox />
      </Box>
    </Flex>
  </VStack>
);

const MainLayout = () => {
  const [view, setView] = useState<ViewKey>('dashboard');

  return (
    <Flex direction="column" h="100vh" bg="#F7FAFC">
      <TopBar view={view} onChange={setView} />
      <Box flex="1" minH="0" overflowY="auto" px={4} pb={6}>
        {view === 'service' ? <ReplyWorkbench /> : <DashboardContent />}
      </Box>
    </Flex>
  );
};

export default MainLayout;
