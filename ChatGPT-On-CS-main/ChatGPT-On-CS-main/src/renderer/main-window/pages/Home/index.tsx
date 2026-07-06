import React, { useEffect } from 'react';
import { Box, VStack } from '@chakra-ui/react';
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
