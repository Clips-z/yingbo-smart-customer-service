import React, { useEffect, useState, useCallback } from 'react';
import {
  ChakraProvider,
  Flex,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Heading,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  Checkbox,
  Text,
  Button,
  Box,
} from '@chakra-ui/react';
import {
  FiSettings,
  FiCpu,
  FiBox,
  FiInfo,
} from 'react-icons/fi';
import { loader } from '@monaco-editor/react';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GeneralSettings from './components/Settings/GeneralSettings';
import LLMSettings from './components/LLMSettings';
import PluginPage from './pages/Plugin';
import PluginEditPage from './pages/PluginEdit';
import AboutPage from './components/About';
import { trackPageView } from '../common/services/analytics';
import {
  checkConfigActive,
  activeConfig,
} from '../common/services/platform/controller';
import theme from '../common/styles/theme';
import '../common/App.css';

// TODO: 后续考虑将 monaco-editor 的路径改为本地路径
loader.config({
  paths: { vs: 'https://jsd.onmicrosoft.cn/npm/monaco-editor@0.43.0/min/vs' },
});

// Create a client
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

// 侧边栏导航配置
const NAV_ITEMS = [
  { key: 'general', icon: FiSettings, label: '平台与回复策略' },
  { key: 'ai', icon: FiCpu, label: 'AI 模型与知识' },
  { key: 'plugin', icon: FiBox, label: '高级插件' },
  { key: 'about', icon: FiInfo, label: '关于' },
];

const App = () => {
  const [settings, setSettings] = useState<{
    appId?: string;
    instanceId?: string;
  }>({});
  const toast = useToast();
  const [isActive, setIsActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    trackPageView('Settings');
  }, []);

  const fetchConfigActive = useCallback(
    async (appId: string, instanceId?: string) => {
      try {
        setIsModalOpen(true);
        const resp = await checkConfigActive({ appId, instanceId });
        setIsActive(resp.data.active);
        if (resp.data.active) {
          setIsModalOpen(false);
        }
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
        setIsActive(false);
      }
    },
    [toast],
  );

  const handleCheckboxChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const { appId, instanceId } = settings;

        setIsActive(event.target.checked);
        await activeConfig({
          active: event.target.checked,
          appId,
          instanceId,
        });
        toast({
          title: '更新配置成功',
          position: 'top',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });

        setIsModalOpen(!event.target.checked);
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
    },
    [settings, toast],
  );

  useEffect(() => {
    const { electron } = window;
    const handleParams = (receivedArgs: string[]) => {
      const settingsArgs = receivedArgs.reduce(
        (acc: { appId?: string; instanceId?: string; tab?: string }, arg: string) => {
          if (arg.startsWith('settings-app-id-')) {
            acc.appId = arg.replace('settings-app-id-', '');
          }
          if (arg.startsWith('settings-instance-id-')) {
            acc.instanceId = arg.replace('settings-instance-id-', '');
          }
          if (arg.startsWith('settings-tab-')) {
            acc.tab = arg.replace('settings-tab-', '');
          }
          return acc;
        },
        {},
      );

      setSettings(settingsArgs);
      const requestedTab = NAV_ITEMS.findIndex((item) => item.key === settingsArgs.tab);
      if (requestedTab >= 0) setTabIndex(requestedTab);

      if (settingsArgs.appId) {
        fetchConfigActive(settingsArgs.appId, settingsArgs.instanceId);
      }
    };

    if (electron) {
      const receivedArgs = electron.getArgs();
      handleParams(receivedArgs);

      electron.ipcRenderer.on(
        'update-settings-params',
        // @ts-ignore
        (updatedArgs: string[]) => {
          console.log('update-settings-params', updatedArgs);
          handleParams(updatedArgs);
        },
      );
    }

    return () => {
      window.electron.ipcRenderer.remove('update-settings-params');
    };
  }, [fetchConfigActive]);

  const renderSettingsTabs = () => (
    <Flex direction="row" height="100vh" bg="ui.canvas">
      {/* 侧边导航栏 — 图标风格 */}
      <Flex
        direction="column"
        w="216px"
        bg="ui.navy"
        color="white"
        py={5}
        px={3}
      >
        {/* Logo */}
        <Box px={3} mb={7}>
          <Heading
            size="sm"
            fontWeight="800"
            letterSpacing="-0.02em"
            color="white"
          >
            迎波智能客服
          </Heading>
          <Text fontSize="10px" color="whiteAlpha.500" mt={1} fontWeight={600} letterSpacing=".08em">
            设置中心
          </Text>
        </Box>

        {/* 导航项 */}
        <Tabs
          orientation="vertical"
          index={tabIndex}
          onChange={setTabIndex}
          flex="1"
          variant="unstyled"
        >
          <TabList>
            {NAV_ITEMS.map((item, i) => {
              // 平台设置时隐藏关于页
              if (item.key === 'about' && (settings.appId || settings.instanceId)) {
                return null;
              }
              // 平台设置时调整插件标签
              const label =
                item.key === 'plugin' && (settings.appId || settings.instanceId)
                  ? '插件设置'
                  : item.key === 'plugin'
                  ? '全局插件'
                  : item.label;

              const isSelected = tabIndex === i;
              const Icon = item.icon;

              return (
                <Tab
                  key={item.key}
                  borderRadius="lg"
                  mb={1}
                  px={3}
                  py={2.5}
                  justifyContent="flex-start"
                  fontSize="13px"
                  fontWeight={isSelected ? 600 : 500}
                  color={isSelected ? 'white' : 'whiteAlpha.600'}
                  bg={isSelected ? 'rgba(122,145,255,.20)' : 'transparent'}
                  border="1px solid"
                  borderColor={isSelected ? 'rgba(143,162,255,.22)' : 'transparent'}
                  _hover={isSelected ? {} : { bg: 'whiteAlpha.100', color: 'white' }}
                  transition="all 0.2s"
                >
                  <Icon size={16} style={{ marginRight: 10 }} />
                  {label}
                </Tab>
              );
            })}
          </TabList>
        </Tabs>
      </Flex>

      {/* 内容区域 */}
      <Box flex="1" overflowY="auto" p={{ base: 5, lg: 7 }} bg="ui.canvas">
        <Tabs
          orientation="vertical"
          index={tabIndex}
          onChange={setTabIndex}
          variant="unstyled"
          flex="1"
        >
          <TabPanels>
            <TabPanel p={0}>
              <Box bg="white" borderRadius="ui.panel" p={6} boxShadow="ui.panel" border="1px solid" borderColor="ui.border">
                <Heading as="h3" size="md" mb={5} color="gray.800" display="flex" alignItems="center" gap={2}>
                  <FiSettings size={20} /> 通用设置
                </Heading>
                <GeneralSettings
                  style={{ width: '100%' }}
                  appId={settings.appId}
                  instanceId={settings.instanceId}
                />
              </Box>
            </TabPanel>
            <TabPanel p={0}>
              <Box bg="white" borderRadius="ui.panel" p={6} boxShadow="ui.panel" border="1px solid" borderColor="ui.border">
                <Heading as="h3" size="md" mb={5} color="gray.800" display="flex" alignItems="center" gap={2}>
                  <FiCpu size={20} /> AI 配置
                </Heading>
                <LLMSettings
                  appId={settings.appId}
                  instanceId={settings.instanceId}
                />
              </Box>
            </TabPanel>
            <TabPanel p={0}>
              <Router>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <PluginPage
                        appId={settings.appId}
                        instanceId={settings.instanceId}
                      />
                    }
                  />
                  <Route path="/editor" element={<PluginEditPage />} />
                </Routes>
              </Router>
            </TabPanel>
            <TabPanel p={0}>
              <Box bg="white" borderRadius="ui.panel" p={6} boxShadow="ui.panel" border="1px solid" borderColor="ui.border">
                <AboutPage />
              </Box>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>

      {/* 激活弹窗 */}
      {settings.appId && (
        <Modal isOpen={isModalOpen} onClose={() => {}}>
          <ModalOverlay />
          <ModalContent borderRadius="xl">
            <ModalHeader>
              激活配置
              <Checkbox
                ml={4}
                isChecked={isActive}
                onChange={handleCheckboxChange}
                colorScheme="brand"
              >
                激活{' '}
                {settings.instanceId
                  ? `客服 ${settings.instanceId} 设置`
                  : `应用 ${settings.appId} 设置`}
              </Checkbox>
              <Text color="gray.500" fontSize="sm" mt={1}>
                请注意：激活设置后，设置才会生效
              </Text>
            </ModalHeader>
            <ModalBody />
          </ModalContent>
        </Modal>
      )}

      {/* 取消激活按钮 */}
      {settings.appId && isActive && (
        <Button
          position="fixed"
          top="16px"
          right="16px"
          colorScheme="red"
          variant="outline"
          borderRadius="full"
          size="sm"
          onClick={() => {
            // @ts-ignore
            handleCheckboxChange({ target: { checked: false } });
          }}
        >
          取消激活
        </Button>
      )}
    </Flex>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        {renderSettingsTabs()}
      </ChakraProvider>
    </QueryClientProvider>
  );
};

export default React.memo(App);
