import React from 'react';
import {
  Box,
  ChakraProvider,
  Flex,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react';
import {
  FiClock,
  FiCornerUpRight,
  FiEdit3,
  FiRefreshCw,
} from 'react-icons/fi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReplyKeyword from './components/ReplyKeyword';
import SessionHistory from './components/SessionHistory';
import ReplaceKeyword from './components/ReplaceKeyword';
import TransferKeyword from './components/TransferKeyword';
import theme from '../common/styles/theme';
import '../common/App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      cacheTime: 10,
    },
  },
});

const views = [
  {
    label: '关键词回复',
    description: '命中关键词后使用固定回复',
    icon: FiEdit3,
  },
  {
    label: '内容替换',
    description: '发送前自动替换指定内容',
    icon: FiRefreshCw,
  },
  {
    label: '转人工规则',
    description: '命中关键词后提醒人工处理',
    icon: FiCornerUpRight,
  },
  {
    label: '历史会话',
    description: '查询已保存的聊天记录',
    icon: FiClock,
  },
];

const panels = [
  <ReplyKeyword key="reply" />,
  <ReplaceKeyword key="replace" />,
  <TransferKeyword key="transfer" />,
  <SessionHistory key="history" />,
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ChakraProvider theme={theme}>
      <Tabs
        orientation="vertical"
        variant="unstyled"
        h="100vh"
        bg="ui.canvas"
        display="flex"
      >
        <Flex
          direction="column"
          w="224px"
          flexShrink={0}
          bg="ui.navy"
          color="white"
          px={3}
          py={5}
        >
          <Box px={3} mb={7}>
            <Text fontSize="15px" fontWeight="800">
              规则与数据
            </Text>
            <Text mt={1} color="whiteAlpha.500" fontSize="10px">
              迎波智能客服
            </Text>
          </Box>
          <TabList gap={1}>
            {views.map(({ label, description, icon: Icon }) => (
              <Tab
                key={label}
                justifyContent="flex-start"
                textAlign="left"
                gap={3}
                px={3}
                py={3}
                borderRadius="12px"
                color="whiteAlpha.600"
                _selected={{
                  color: 'white',
                  bg: 'rgba(122,145,255,.20)',
                  borderColor: 'rgba(143,162,255,.22)',
                }}
                border="1px solid transparent"
                _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              >
                <Icon size={17} />
                <Box>
                  <Text fontSize="12px" fontWeight="700">
                    {label}
                  </Text>
                  <Text mt={0.5} fontSize="9px" color="whiteAlpha.500">
                    {description}
                  </Text>
                </Box>
              </Tab>
            ))}
          </TabList>
        </Flex>
        <TabPanels flex="1" minW="0" overflowY="auto" p={{ base: 5, lg: 7 }}>
          {views.map((view, index) => (
            <TabPanel key={view.label} p={0}>
              <Box mb={5}>
                <Text fontSize="20px" fontWeight="800" color="ui.ink">
                  {view.label}
                </Text>
                <Text mt={1} fontSize="11px" color="gray.500">
                  {view.description}
                </Text>
              </Box>
              <Box
                bg="white"
                border="1px solid"
                borderColor="ui.border"
                borderRadius="ui.panel"
                boxShadow="ui.panel"
                p={5}
              >
                {panels[index]}
              </Box>
            </TabPanel>
          ))}
        </TabPanels>
      </Tabs>
    </ChakraProvider>
  </QueryClientProvider>
);

export default React.memo(App);
