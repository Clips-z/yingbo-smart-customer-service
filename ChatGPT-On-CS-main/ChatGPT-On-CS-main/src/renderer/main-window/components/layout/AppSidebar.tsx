import React from 'react';
import { Box, Flex, Tooltip, Icon, Text } from '@chakra-ui/react';
import {
  FiGrid,
  FiHeadphones,
  FiBookOpen,
  FiShield,
  FiBarChart2,
  FiBell,
  FiMenu,
} from 'react-icons/fi';

/* ── 导航项定义 ── */
export type NavSection = 'dashboard' | 'service' | 'knowledge' | 'security' | 'dataview';

export interface NavItem {
  key: NavSection;
  label: string;
  icon: React.ReactNode;
}

/** 知识管理子菜单项 */
export type KnowledgeSubKey =
  | 'knowledge-candidates'
  | 'product-qa'
  | 'store-kb'
  | 'industry-config'
  | 'validity'
  | 'corpus-test'
  | 'governance';

export const KNOWLEDGE_SUB_ITEMS: { key: KnowledgeSubKey; label: string }[] = [
  { key: 'knowledge-candidates', label: '对话知识候选' },
  { key: 'product-qa', label: '商品问答库' },
  { key: 'store-kb', label: '店铺知识库' },
  { key: 'industry-config', label: '行业相关配置' },
  { key: 'validity', label: '时效管理' },
  { key: 'corpus-test', label: '问答语料测试' },
  { key: 'governance', label: '治理与备份' },
];

const MAIN_NAV: NavItem[] = [
  { key: 'dashboard', label: '工作台', icon: <FiGrid size={19} /> },
  { key: 'service', label: '客服中心', icon: <FiHeadphones size={19} /> },
  { key: 'knowledge', label: '知识管理', icon: <FiBookOpen size={19} /> },
  { key: 'security', label: '内容安全', icon: <FiShield size={19} /> },
  { key: 'dataview', label: '数据与统计 ↗', icon: <FiBarChart2 size={19} /> },
];

interface AppSidebarProps {
  activeSection: NavSection | null;
  onNavigate: (section: NavSection) => void;
  /** 是否显示知识管理子侧栏 */
  showKnowledgeSub?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

/** 左侧图标侧边栏 —— 对齐 intro5 设计稿 */
const AppSidebar: React.FC<AppSidebarProps> = ({
  activeSection,
  onNavigate,
  showKnowledgeSub,
  isExpanded,
  onToggle,
}) => {
  return (
    <Flex
      direction="column"
      w={isExpanded ? '168px' : '64px'}
      bg="white"
      borderRight="1px solid"
      borderColor="gray.100"
      flexShrink={0}
      h="full"
      transition="width 0.18s ease"
    >
      {/* ── 品牌标识（顶部）── */}
      <Flex
        justify={isExpanded ? 'space-between' : 'center'}
        align="center"
        h="52px"
        borderBottom="1px solid"
        borderColor="gray.50"
        cursor="default"
        px={isExpanded ? 3 : 0}
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
        {isExpanded && <Text fontWeight={800} color="gray.700" fontSize="13px">迎波智能客服</Text>}
        <Box
          as="button"
          aria-label="收起导航"
          onClick={onToggle}
          color="gray.400"
          _hover={{ color: 'gray.700' }}
          _focusVisible={{ boxShadow: '0 0 0 2px rgba(66, 99, 235, 0.4)' }}
        >
          <FiMenu size={18} />
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
              isDisabled={isExpanded}
              hasArrow
              offset={[0, 8]}
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
                flexDirection={isExpanded ? 'row' : 'column'}
                alignItems="center"
                justifyContent={isExpanded ? 'flex-start' : 'center'}
                w={isExpanded ? 'calc(100% - 16px)' : '42px'}
                h={isExpanded ? '44px' : '42px'}
                mx="auto"
                px={isExpanded ? 3 : 0}
                gap={isExpanded ? 3 : 0}
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
                    left: isExpanded ? '0' : '-10px',
                    top: '8px',
                    bottom: '8px',
                    w: '3px',
                    borderRadius: '0 3px 3px 0',
                    bg: 'brand.500',
                  },
                })}
              >
                <Icon>{item.icon}</Icon>
                {isExpanded && <Text
                  mt={1}
                  fontSize="10px"
                  lineHeight="1.2"
                  fontWeight={isActive ? 700 : 500}
                  whiteSpace="nowrap"
                >
                  {item.label}
                </Text>}
              </Box>
            </Tooltip>
          );
        })}
      </Flex>

      {/* ── 底部工具栏 ── */}
      <Flex direction="column" pb={3} pt={2} gap={1}>
        <Tooltip label="通知与待办" placement="right" hasArrow offset={[0, 8]} openDelay={300}>
          <Box
            as="button"
            aria-label="查看通知与待办"
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
            _focusVisible={{ boxShadow: '0 0 0 2px rgba(66, 99, 235, 0.4)' }}
            onClick={() => onNavigate('dashboard')}
          >
            <Icon><FiBell size={18} /></Icon>
          </Box>
        </Tooltip>

        {/* 用户头像 */}
        <Tooltip label="用户" placement="right" hasArrow offset={[0, 8]}>
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
