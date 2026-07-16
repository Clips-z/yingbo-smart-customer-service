import React, { useState } from 'react';
import { Box, Flex, IconButton, Text, Tooltip, VStack } from '@chakra-ui/react';
import { FiSidebar } from 'react-icons/fi';
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

/* ── 工作台内容（保持不变）── */
const DashboardContent = () => (
  <VStack spacing={4} align="stretch">
    {/* 区块标题 */}
    <Flex pt={1} align="center" justify="space-between">
      <Box>
        <Text fontSize="18px" fontWeight={800} color="gray.800" letterSpacing="-0.01em">
          平台管理
        </Text>
        <Text fontSize="12.5px" color="gray.400" mt={0.5}>
          启停各平台客服，查看自动回复运行状态
        </Text>
      </Box>
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

  // 暴露全局导航函数（供截图脚本 / 调试用）
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__navigateTo = (section: NavSection, sub?: KnowledgeSubKey) => {
        setActiveSection(section);
        if (sub) setActiveKnowledgeSub(sub);
      };
    }
    return () => { if ((window as any).__navigateTo) delete (window as any).__navigateTo; };
  }, []);

  /** 当前是否需要显示知识管理子侧栏 */
  const showKnowledgeSub = activeSection === 'knowledge';

  return (
    <Flex h="100vh" bg="#F7FAFC" overflow="hidden">
      {/* ═══ 左侧图标侧边栏 ═══ */}
      <AppSidebar
        activeSection={activeSection}
        onNavigate={(section) => setActiveSection(section)}
        showKnowledgeSub={showKnowledgeSub}
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
        <Box flex="1" minH="0" overflowY="auto" px={5} pb={6}>
          {(() => {
            switch (activeSection) {
              case 'dashboard':
                return <DashboardContent />;

              case 'service':
                return <ReplyWorkbench />;

              case 'knowledge':
                // 根据知识管理子项渲染不同视图（后续 Task #14/#15 实现）
                switch (activeKnowledgeSub) {
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
    </Flex>
  );
};

/** 知识管理子项 → 显示名称映射 */
const KNOWLEDGE_SUB_LABELS: Record<KnowledgeSubKey, string> = {
  'product-qa': '商品问答库',
  'store-kb': '店铺知识库',
  'industry-config': '行业相关配置',
  validity: '时效管理',
  'corpus-test': '问答语料测试',
};

export default MainLayout;
