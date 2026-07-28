import React, { useState } from 'react';
import { Alert, AlertIcon, Badge, Box, Flex, IconButton, Text, Tooltip, VStack } from '@chakra-ui/react';
import { FiBarChart2, FiChevronRight, FiSettings, FiSidebar } from 'react-icons/fi';
import AppSidebar, { NavSection, KnowledgeSubKey } from './AppSidebar';
import KnowledgeSubSidebar from './KnowledgeSubSidebar';
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

/* ── 工作台内容（保持不变）── */
const DashboardContent = () => (
  <VStack spacing={4} align="stretch">
    {/* 区块标题 */}
    <Flex pt={1} align="center" justify="space-between">
      <Box><Text fontSize="13px" fontWeight={700} color="gray.700">平台连接</Text><Text fontSize="12px" color="gray.400" mt={0.5}>启停各平台客服，查看自动回复运行状态</Text></Box>
      <Tooltip label="打开千牛伴随面板" placement="left" hasArrow>
        <IconButton
          aria-label="打开千牛伴随面板"
          icon={<FiSidebar size={18} />}
          size="sm"
          variant="outline"
          colorScheme="green"
          onClick={() =>
            window.electron.ipcRenderer.sendMessage('open-companion-window')
          }
        />
      </Tooltip>
    </Flex>

    {/* 平台卡片 */}
    <DashboardQualityOverview />

    {/* 平台卡片 */}
    <Box id="platform-manager"><AppManager /></Box>

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

/* ── 占位内容（尚未实现的模块）── */
const PlaceholderView = ({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) => (
  <Flex direction="column" align="center" justify="center" h="full" py={20}>
    <Box fontSize="48px" color="gray.200" mb={4}>
      {icon}
    </Box>
    <Text fontSize="16px" fontWeight={700} color="gray.500">
      {title}
    </Text>
    <Text fontSize="13px" color="gray.400" mt={1}>
      {description}
    </Text>
  </Flex>
);

/**
 * 主布局 —— 左侧图标侧边栏 + 可选子侧栏 + 内容区
 *
 * 对齐 intro5 设计稿的导航架构：
 *   [60px 图标侧栏] [176px 知识管理子侧栏?] [弹性内容区]
 *
 * 导航状态：
 *   - activeSection: 主导航选中项（dashboard / service / knowledge / security / dataview）
 *   - activeKnowledgeSub: 知识管理子菜单选中项（product-qa / store-kb / ...）
 */
const MainLayout = () => {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [activeKnowledgeSub, setActiveKnowledgeSub] =
    useState<KnowledgeSubKey>('product-qa');
  const [replyFocus, setReplyFocus] = useState<ReplyFocus>('all');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  React.useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  // 暴露全局导航函数（供截图脚本 / 调试用）
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__navigateTo = (section: NavSection, sub?: KnowledgeSubKey, focus?: ReplyFocus) => {
        setActiveSection(section);
        if (sub) setActiveKnowledgeSub(sub);
        if (section === 'service') setReplyFocus(focus || 'all');
      };
    }
    return () => { if ((window as any).__navigateTo) delete (window as any).__navigateTo; };
  }, []);

  /** 当前是否需要显示知识管理子侧栏 */
  const showKnowledgeSub = activeSection === 'knowledge';
  const pageMeta: Record<NavSection, { title: string; description: string }> = {
    dashboard: { title: '运营总览', description: '把需要处理的客户服务工作集中在一个地方。' },
    service: { title: '会话工作台', description: '查看、审核并发送 AI 建议回复。' },
    knowledge: { title: '知识资产', description: '持续沉淀对话经验，并随时导出、编辑和治理。' },
    security: { title: '安全与合规', description: '为自动回复设置明确的安全边界。' },
    dataview: { title: '数据分析', description: '查看经营与回复质量趋势。' },
  };
  const currentMeta = pageMeta[activeSection];

  return (
    <Flex h="100vh" bg="#F5F7FB" overflow="hidden">
      {/* ═══ 左侧图标侧边栏 ═══ */}
      <AppSidebar
        activeSection={activeSection}
        onNavigate={(section) => setActiveSection(section)}
        showKnowledgeSub={showKnowledgeSub}
        isExpanded={isSidebarExpanded}
        onToggle={() => setIsSidebarExpanded((expanded) => !expanded)}
      />

      {/* ═══ 知识管理子侧栏（条件渲染） ═══ */}
      {showKnowledgeSub && (
        <KnowledgeSubSidebar
          activeSub={activeKnowledgeSub}
          onSubChange={setActiveKnowledgeSub}
        />
      )}

      {/* ═══ 内容区 ═══ */}
      <Box
        flex="1"
        minW="0"
        display="flex"
        flexDirection="column"
        overflow="hidden"
      >
        <Flex h="76px" px={{ base: 5, md: 8 }} align="center" justify="space-between" bg="rgba(255,255,255,.86)" borderBottom="1px solid" borderColor="#E8ECF3" flexShrink={0} backdropFilter="blur(16px)">
          <Box minW="0"><Flex align="center" gap={1.5} mb={1}><Text color="gray.400" fontSize="11px">工作空间</Text><FiChevronRight size={13} color="#98A2B3" /><Text color="gray.500" fontSize="11px">{currentMeta.title}</Text></Flex><Text fontSize={{ base: '19px', md: '22px' }} fontWeight="800" color="#182230" letterSpacing="-.03em">{currentMeta.title}</Text><Text display={{ base: 'none', lg: 'block' }} fontSize="12px" color="gray.500" mt={0.5}>{currentMeta.description}</Text></Box>
          <Flex align="center" gap={2} flexShrink={0}>
            <Badge display={{ base: 'none', md: 'inline-flex' }} px={2.5} py={1} bg="green.50" color="green.700" borderRadius="full"><Box w="6px" h="6px" rounded="full" bg="green.400" mr={1.5} />服务正常</Badge>
            <Tooltip label="打开千牛伴随面板" hasArrow><IconButton aria-label="打开千牛伴随面板" icon={<FiSidebar />} size="sm" variant="ghost" onClick={() => window.electron.ipcRenderer.sendMessage('open-companion-window')} /></Tooltip>
            <Tooltip label="查看数据分析" hasArrow><IconButton aria-label="查看数据分析" icon={<FiBarChart2 />} size="sm" variant="ghost" onClick={() => window.electron.ipcRenderer.sendMessage('open-dataview-window', {})} /></Tooltip>
            <Tooltip label="系统设置" hasArrow><IconButton aria-label="系统设置" icon={<FiSettings />} size="sm" variant="ghost" onClick={() => window.electron.ipcRenderer.sendMessage('open-settings-window', {})} /></Tooltip>
          </Flex>
        </Flex>
        {!isOnline && (
          <Alert status="warning" borderRadius={0} fontSize="13px">
            <AlertIcon />
            当前处于离线状态：新消息、知识检索和平台同步将在网络恢复后继续。
          </Alert>
        )}
        <Box flex="1" minH="0" overflowY="auto" px={{ base: 4, md: 8 }} py={6}>
          <Box maxW="1560px" mx="auto">
          {(() => {
            switch (activeSection) {
              case 'dashboard':
                return <DashboardContent />;

              case 'service':
                return <ReplyWorkbench initialFocus={replyFocus} />;

              case 'knowledge':
                // 根据知识管理子项渲染不同视图（后续 Task #14/#15 实现）
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
                    return (
                      <PlaceholderView
                        title={KNOWLEDGE_SUB_LABELS[activeKnowledgeSub]}
                        description="功能开发中，敬请期待"
                        icon="🔧"
                      />
                    );
                }

              case 'security':
                return <ContentSecurity />;

              default:
                return <DashboardContent />;
            }
          })()}
          </Box>
        </Box>
      </Box>
    </Flex>
  );
};

/** 知识管理子项 → 显示名称映射 */
const KNOWLEDGE_SUB_LABELS: Record<KnowledgeSubKey, string> = {
  'knowledge-candidates': '对话知识候选',
  'product-qa': '商品问答库',
  'store-kb': '店铺知识库',
  'industry-config': '行业相关配置',
  validity: '时效管理',
  'corpus-test': '问答语料测试',
  governance: '治理与备份',
};

export default MainLayout;
