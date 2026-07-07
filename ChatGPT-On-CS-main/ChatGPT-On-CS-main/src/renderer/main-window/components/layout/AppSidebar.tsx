import React, { useEffect } from 'react';
import { Box, Flex, Tooltip, Icon, Text } from '@chakra-ui/react';
import {
  FiGrid,
  FiHeadphones,
  FiBookOpen,
  FiShield,
  FiBarChart2,
  FiStar,
  FiBook,
  FiBell,
  FiHelpCircle,
} from 'react-icons/fi';
import useNotificationStore from '../../stores/useNotificationStore';

/* ── 导航项定义 ── */
export type NavSection = 'dashboard' | 'service' | 'knowledge' | 'security' | 'dataview';

export interface NavItem {
  key: NavSection;
  label: string;
  icon: React.ReactNode;
}

/** 知识管理子菜单项 */
export type KnowledgeSubKey =
  | 'product-qa'
  | 'store-kb'
  | 'industry-config'
  | 'validity'
  | 'corpus-test';

export const KNOWLEDGE_SUB_ITEMS: { key: KnowledgeSubKey; label: string }[] = [
  { key: 'product-qa', label: '商品问答库' },
  { key: 'store-kb', label: '店铺知识库' },
  { key: 'industry-config', label: '行业相关配置' },
  { key: 'validity', label: '时效管理' },
  { key: 'corpus-test', label: '问答语料测试' },
];

const MAIN_NAV: NavItem[] = [
  { key: 'dashboard', label: '工作台', icon: <FiGrid size={19} /> },
  { key: 'service', label: '客服中心', icon: <FiHeadphones size={19} /> },
  { key: 'knowledge', label: '知识管理', icon: <FiBookOpen size={19} /> },
  { key: 'security', label: '内容安全', icon: <FiShield size={19} /> },
  { key: 'dataview', label: '数据与统计', icon: <FiBarChart2 size={19} /> },
];

/* 底部工具栏 */
const BOTTOM_NAV: NavItem[] = [
  { key: 'favorites' as any, label: '收藏', icon: <FiStar size={18} /> },
  { key: 'docs' as any, label: '文档', icon: <FiBook size={18} /> },
  { key: 'notifications' as any, label: '通知', icon: <FiBell size={18} /> },
  { key: 'help' as any, label: '帮助', icon: <FiHelpCircle size={18} /> },
];

interface AppSidebarProps {
  activeSection: NavSection | null;       // null = 未选中任何（或选中底部工具项）
  onNavigate: (section: NavSection) => void;
  /** 是否显示知识管理子侧栏 */
  showKnowledgeSub?: boolean;
}

/** 左侧图标侧边栏 —— 对齐 intro5 设计稿 */
const AppSidebar: React.FC<AppSidebarProps> = ({
  activeSection,
  onNavigate,
  showKnowledgeSub,
}) => {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const togglePanel = useNotificationStore((s) => s.togglePanel);

  // 定期轮询未读计数
  useEffect(() => {
    const store = useNotificationStore.getState();
    store.loadUnreadCount();
    const timer = setInterval(() => store.loadUnreadCount(), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Flex
      direction="column"
      w="60px"
      bg="white"
      borderRight="1px solid"
      borderColor="gray.100"
      flexShrink={0}
      h="full"
    >
      {/* ── 品牌标识（顶部）── */}
      <Flex
        justify="center"
        align="center"
        h="52px"
        borderBottom="1px solid"
        borderColor="gray.50"
        cursor="default"
      >
        <Box
          w="30px"
          h="30px"
          borderRadius="9px"
          bgGradient="linear-gradient(135deg, #4A5BB3 0%, #2A83FF 100%)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxShadow="0 3px 10px rgba(74, 91, 179, 0.35)"
        >
          <Text color="white" fontWeight={900} fontSize="13px" lineHeight={1}>
            YB
          </Text>
        </Box>
      </Flex>

      {/* ── 主导航区 ── */}
      <Flex direction="column" flex="1" pt={2} pb={2} gap={1}>
        {MAIN_NAV.map((item) => {
          const isActive = activeSection === item.key;
          const isKnowledgeActive = item.key === 'knowledge' && showKnowledgeSub;

          return (
            <Tooltip
              key={item.key}
              label={item.label}
              placement="right"
              hasArrow
              offset={{ mainAxis: 8 }}
              openDelay={300}
            >
              <Box
                as="button"
                onClick={() =>
                  item.key === 'dataview'
                    ? window.electron.ipcRenderer.sendMessage('open-dataview-window', {})
                    : onNavigate(item.key)
                }
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                w="42px"
                h="42px"
                mx="auto"
                borderRadius="xl"
                transition="all 0.18s ease"
                cursor="pointer"
                outline="none"
                _focusVisible={{
                  boxShadow: '0 0 0 2px rgba(66, 99, 235, 0.4)',
                }}
                /* 激活态：品牌蓝底 + 白色图标 */
                bg={
                  isKnowledgeActive || isActive
                    ? 'linear-gradient(135deg, #4A5BB3, #3866D4)'
                    : 'transparent'
                }
                color={
                  isKnowledgeActive || isActive ? 'white' : 'gray.500'
                }
                _hover={
                  isKnowledgeActive || isActive
                    ? {}
                    : { bg: 'gray.100', color: 'gray.700' }
                }
                // 左侧激活指示条（仅主导航项）
                position="relative"
                {...((isKnowledgeActive || isActive) && {
                  _before: {
                    content: '""',
                    position: 'absolute',
                    left: '-10px',
                    top: '8px',
                    bottom: '8px',
                    w: '3px',
                    borderRadius: '0 3px 3px 0',
                    bg: 'brand.500',
                  },
                })}
              >
                <Icon>{item.icon}</Icon>
              </Box>
            </Tooltip>
          );
        })}
      </Flex>

      {/* ── 底部工具栏 ── */}
      <Flex direction="column" pb={3} pt={2} gap={1}>
        {BOTTOM_NAV.map((item) => (
          <Tooltip
            key={item.key}
            label={item.label}
            placement="right"
            hasArrow
            offset={{ mainAxis: 8 }}
            openDelay={300}
          >
            <Box
              as="button"
              display="flex"
              alignItems="center"
              justifyContent="center"
              w="40px"
              h="36px"
              mx="auto"
              borderRadius="lg"
              transition="all 0.15s"
              cursor="pointer"
              outline="none"
              bg="transparent"
              color="gray.400"
              _hover={{ bg: 'gray.100', color: 'gray.600' }}
              _focusVisible={{
                boxShadow: '0 0 0 2px rgba(66, 99, 235, 0.4)',
              }}
              onClick={() => {
                if (item.key === 'notifications') {
                  togglePanel();
                } else if (item.key === 'docs') {
                  // 打开用户使用手册（通过 IPC 调用主进程 shell.openPath）
                  window.electron.ipcRenderer.sendMessage('open-user-manual');
                } else if (item.key === 'help') {
                  // 打开帮助：导航到知识管理 → 显示使用指南
                  window.electron.ipcRenderer.sendMessage('open-url', 'https://github.com/Clips-z/yingbo-smart-customer-service');
                } else if (item.key === 'favorites') {
                  // 收藏功能：导航到客服中心（快捷入口，后续可扩展独立收藏面板）
                  onNavigate('service' as any);
                }
              }}
            >
              <Icon position="relative">
                {item.icon}
                {item.key === 'notifications' && unreadCount > 0 && (
                  <Box
                    position="absolute"
                    top="-4px"
                    right="-6px"
                    bg="red.500"
                    color="white"
                    borderRadius="full"
                    px={1}
                    minW="16px"
                    h="16px"
                    fontSize="9px"
                    fontWeight={800}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    lineHeight={1}
                    boxShadow="0 1px 3px rgba(220, 38, 38, 0.4)"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Box>
                )}
              </Icon>
            </Box>
          </Tooltip>
        ))}

        {/* 用户头像 */}
        <Tooltip label="用户" placement="right" hasArrow offset={{ mainAxis: 8 }}>
          <Box
            as="button"
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="40px"
            h="36px"
            mx="auto"
            mt={1}
            borderRadius="lg"
            transition="all 0.15s"
            cursor="pointer"
            outline="none"
            _hover={{ bg: 'gray.100' }}
            _focusVisible={{
              boxShadow: '0 0 0 2px rgba(66, 99, 235, 0.4)',
            }}
          >
            <Box
              w="28px"
              h="28px"
              borderRadius="full"
              bg="linear-gradient(135deg, #A78BFA, #7C3AED)"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text color="white" fontWeight={700} fontSize="12px">
                U
              </Text>
            </Box>
          </Box>
        </Tooltip>

        {/* 运行状态 + 版本号 */}
        <Flex direction="column" align="center" pt={2} pb={1} gap={1}>
          <Flex align="center" gap={1}>
            <Box
              w="6px"
              h="6px"
              rounded="full"
              bg="green.400"
              className="pulse-dot"
              boxShadow="0 0 0 2px rgba(34, 197, 94, 0.15)"
            />
          </Flex>
          <Text
            fontSize="8px"
            color="gray.300"
            fontWeight={600}
            lineHeight={1}
            textAlign="center"
          >
            v{window?.electron?.ipcRenderer?.get?.('get-version') ?? ''}
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default React.memo(AppSidebar);
