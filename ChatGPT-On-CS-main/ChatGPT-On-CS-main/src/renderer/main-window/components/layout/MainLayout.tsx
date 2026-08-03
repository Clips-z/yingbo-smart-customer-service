import React, { useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Flex,
  Text,
  VStack,
} from '@chakra-ui/react';
import AppSidebar, { KnowledgeSubKey, NavSection } from './AppSidebar';
import KnowledgeSubSidebar from './KnowledgeSubSidebar';
import PageHeader from './PageHeader';
import AppManager from '../AppManager';
import ReplyWorkbench from '../ReplyWorkbench';
import Panels from '../Panels';
import LogBox from '../LogBox';
import ProductQALibrary from '../ProductQALibrary';
import StoreKnowledgeBase from '../StoreKnowledgeBase';
import IndustryConfig from '../IndustryConfig';
import ValidityManagement from '../ValidityManagement';
import CorpusTest from '../CorpusTest';
import ContentSecurity from '../ContentSecurity';
import KnowledgeCandidates from '../KnowledgeCandidates';
import DashboardQualityOverview from '../DashboardQualityOverview';
import KnowledgeGovernance from '../KnowledgeGovernance';
import { ReplyFocus } from '../ReplyWorkbench/replyPriority';
import CompactReceptionWorkbench from '../CompactReceptionWorkbench';

type MainWindowMode = 'full' | 'docked' | 'floating';
type MainWindowState = { mode?: MainWindowMode };

const DashboardContent = () => (
  <VStack spacing={5} align="stretch">
    <DashboardQualityOverview />
    <Box
      as="details"
      bg="white"
      border="1px solid"
      borderColor="ui.border"
      borderRadius="ui.panel"
      boxShadow="ui.panel"
      px={5}
      py={4}
    >
      <Box as="summary" cursor="pointer">
        <Text fontSize="13px" fontWeight="750" color="ui.ink">
          运行控制与日志
        </Text>
        <Text fontSize="10px" color="gray.500" mt={1}>
          需要调整功能开关或排查运行问题时展开。
        </Text>
      </Box>
      <Flex
        mt={4}
        direction={{ base: 'column', xl: 'row' }}
        gap={5}
        align="stretch"
      >
        <Box flex="1" minW="0">
          <Panels />
        </Box>
        <Box flex="1" minW="0">
          <LogBox />
        </Box>
      </Flex>
    </Box>
  </VStack>
);

const PlatformContent = () => (
  <Box
    id="platform-manager"
    bg="white"
    border="1px solid"
    borderColor="ui.border"
    borderRadius="ui.panel"
    p={{ base: 4, md: 5 }}
    boxShadow="ui.panel"
    minH="520px"
  >
    <Flex
      justify="space-between"
      align={{ base: 'flex-start', md: 'center' }}
      direction={{ base: 'column', md: 'row' }}
      gap={3}
      mb={5}
      pb={4}
      borderBottom="1px solid"
      borderColor="ui.border"
    >
      <Box>
        <Text fontSize="16px" fontWeight="800" color="ui.ink">
          店铺运行状态
        </Text>
        <Text fontSize="11px" color="gray.500" mt={1}>
          先选择平台，再查看其客服实例、登录和采集状态。
        </Text>
      </Box>
      <Alert
        status="info"
        variant="subtle"
        borderRadius="10px"
        w="auto"
        py={2}
        px={3}
        fontSize="11px"
      >
        <AlertIcon boxSize="14px" />
        一个平台可以管理多个店铺或客服实例
      </Alert>
    </Flex>
    <AppManager />
  </Box>
);

const PAGE_META: Record<
  Exclude<NavSection, 'dataview'>,
  { title: string; description: string }
> = {
  dashboard: {
    title: '运营总览',
    description: '集中查看待办、异常、回复质量与平台运行状态。',
  },
  service: {
    title: '回复审核',
    description: '集中处理待回复、超时、失败和需要人工确认的会话。',
  },
  platforms: {
    title: '店铺与平台',
    description: '管理各平台下的店铺、客服实例和运行状态。',
  },
  knowledge: {
    title: '知识资产',
    description: '查看、编辑、导出并持续沉淀有效知识。',
  },
  security: {
    title: '回复规则',
    description: '管理敏感词、拦截规则和人工确认边界。',
  },
};

const MainLayout = () => {
  const [activeSection, setActiveSection] =
    useState<NavSection>('dashboard');
  const [activeKnowledgeSub, setActiveKnowledgeSub] =
    useState<KnowledgeSubKey>('product-qa');
  const [replyFocus, setReplyFocus] = useState<ReplyFocus>('all');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [windowMode, setWindowMode] = useState<MainWindowMode>(() => {
    try {
      const state = window.electron.ipcRenderer.get(
        'get-main-window-state',
      ) as MainWindowState;
      return ['docked', 'floating'].includes(state?.mode || '')
        ? (state.mode as MainWindowMode)
        : 'full';
    } catch {
      return 'full';
    }
  });

  React.useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  React.useEffect(
    () =>
      window.electron.ipcRenderer.on('main-window-state', (value) => {
        const state = value as MainWindowState;
        setWindowMode(
          ['docked', 'floating'].includes(state?.mode || '')
            ? (state.mode as MainWindowMode)
            : 'full',
        );
      }),
    [],
  );

  React.useEffect(() => {
    (window as any).__navigateTo = (
      section: NavSection,
      sub?: KnowledgeSubKey,
      focus?: ReplyFocus,
    ) => {
      setActiveSection(section);
      if (sub) setActiveKnowledgeSub(sub);
      if (section === 'service') setReplyFocus(focus || 'all');
    };
    return () => {
      delete (window as any).__navigateTo;
    };
  }, []);

  const navigate = (section: NavSection) => {
    if (section === 'dataview') {
      window.electron.ipcRenderer.sendMessage('open-dataview-window', {});
      return;
    }
    setActiveSection(section);
  };

  const showKnowledgeSub = activeSection === 'knowledge';
  const currentMeta =
    PAGE_META[activeSection as Exclude<NavSection, 'dataview'>] ||
    PAGE_META.dashboard;

  const content = (() => {
    if (activeSection === 'dashboard') return <DashboardContent />;
    if (activeSection === 'service') {
      return <ReplyWorkbench initialFocus={replyFocus} />;
    }
    if (activeSection === 'platforms') return <PlatformContent />;
    if (activeSection === 'security') return <ContentSecurity />;
    if (activeSection !== 'knowledge') return <DashboardContent />;

    switch (activeKnowledgeSub) {
      case 'knowledge-candidates':
        return <KnowledgeCandidates />;
      case 'product-qa':
        return <ProductQALibrary />;
      case 'store-kb':
        return <StoreKnowledgeBase />;
      case 'industry-config':
        return <IndustryConfig />;
      case 'validity':
        return <ValidityManagement />;
      case 'corpus-test':
        return <CorpusTest />;
      case 'governance':
        return <KnowledgeGovernance />;
      default:
        return <ProductQALibrary />;
    }
  })();

  if (windowMode !== 'full') {
    return <CompactReceptionWorkbench windowMode={windowMode} />;
  }

  return (
    <Flex h="100vh" bg="ui.canvas" overflow="hidden">
      <AppSidebar
        activeSection={activeSection}
        onNavigate={navigate}
        showKnowledgeSub={showKnowledgeSub}
        isExpanded={isSidebarExpanded}
        onToggle={() => setIsSidebarExpanded((expanded) => !expanded)}
      />
      {showKnowledgeSub && (
        <KnowledgeSubSidebar
          activeSub={activeKnowledgeSub}
          onSubChange={setActiveKnowledgeSub}
        />
      )}
      <Flex flex="1" minW="0" direction="column" overflow="hidden">
        <PageHeader {...currentMeta} />
        {!isOnline && (
          <Alert status="warning" borderRadius={0} fontSize="12px" py={2}>
            <AlertIcon boxSize="16px" />
            当前处于离线状态；平台同步和知识检索将在网络恢复后继续。
          </Alert>
        )}
        <Box
          flex="1"
          minH="0"
          overflowY="auto"
          px={{ base: 4, md: 6 }}
          py={{ base: 4, md: 5 }}
        >
          <Box maxW="1540px" mx="auto">
            {content}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
};

export default MainLayout;
