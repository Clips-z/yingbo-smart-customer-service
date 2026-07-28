import React from 'react';
import { Box, Flex, Icon, Text, Tooltip } from '@chakra-ui/react';
import {
  FiBarChart2,
  FiBookOpen,
  FiGrid,
  FiHeadphones,
  FiMenu,
  FiSettings,
  FiShield,
  FiShoppingBag,
} from 'react-icons/fi';

export type NavSection =
  | 'dashboard'
  | 'service'
  | 'platforms'
  | 'knowledge'
  | 'security'
  | 'dataview';

export interface NavItem {
  key: NavSection;
  label: string;
  description: string;
  icon: React.ReactNode;
}

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

const PRIMARY_NAV: NavItem[] = [
  {
    key: 'dashboard',
    label: '运营工作台',
    description: '查看今天最需要处理的事项',
    icon: <FiGrid size={18} />,
  },
  {
    key: 'service',
    label: '回复审核',
    description: '处理待回复、超时和失败会话',
    icon: <FiHeadphones size={18} />,
  },
  {
    key: 'platforms',
    label: '店铺与平台',
    description: '管理平台、店铺和运行实例',
    icon: <FiShoppingBag size={18} />,
  },
  {
    key: 'knowledge',
    label: '知识库',
    description: '审核、编辑、导入和导出知识',
    icon: <FiBookOpen size={18} />,
  },
];

const MANAGEMENT_NAV: NavItem[] = [
  {
    key: 'security',
    label: '回复规则',
    description: '管理拦截和人工确认边界',
    icon: <FiShield size={17} />,
  },
  {
    key: 'dataview',
    label: '效果分析',
    description: '复盘回复和运行趋势',
    icon: <FiBarChart2 size={17} />,
  },
];

interface AppSidebarProps {
  activeSection: NavSection | null;
  onNavigate: (section: NavSection) => void;
  showKnowledgeSub?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({
  activeSection,
  onNavigate,
  showKnowledgeSub,
  isExpanded,
  onToggle,
}) => {
  const renderItem = (item: NavItem) => {
    const active =
      activeSection === item.key ||
      (item.key === 'knowledge' && showKnowledgeSub);
    return (
      <Tooltip
        key={item.key}
        label={`${item.label} · ${item.description}`}
        placement="right"
        isDisabled={isExpanded}
        hasArrow
      >
        <Box
          as="button"
          onClick={() => onNavigate(item.key)}
          display="flex"
          alignItems="center"
          gap={3}
          h="44px"
          w="full"
          px={isExpanded ? 3 : 0}
          justifyContent={isExpanded ? 'flex-start' : 'center'}
          borderRadius="10px"
          textAlign="left"
          color={active ? 'white' : 'whiteAlpha.650'}
          bg={active ? '#2947A3' : 'transparent'}
          boxShadow={active ? '0 8px 20px rgba(15, 36, 96, .28)' : 'none'}
          _hover={{
            bg: active ? '#2947A3' : 'whiteAlpha.100',
            color: 'white',
          }}
          _focusVisible={{ boxShadow: '0 0 0 2px #9CB4FF' }}
        >
          <Icon color={active ? '#D9E2FF' : 'inherit'}>{item.icon}</Icon>
          {isExpanded && (
            <Text fontSize="13px" fontWeight={active ? '750' : '600'}>
              {item.label}
            </Text>
          )}
        </Box>
      </Tooltip>
    );
  };

  return (
    <Flex
      direction="column"
      w={isExpanded ? '196px' : '68px'}
      bg="#111C2E"
      color="white"
      flexShrink={0}
      h="full"
      transition="width 0.2s ease"
      overflow="hidden"
    >
      <Flex
        h="70px"
        align="center"
        px={isExpanded ? 4 : 0}
        justify={isExpanded ? 'space-between' : 'center'}
      >
        <Flex align="center" gap={2.5} minW="0">
          <Flex
            w="34px"
            h="34px"
            flexShrink={0}
            borderRadius="10px"
            align="center"
            justify="center"
            bg="#4C6FFF"
            boxShadow="0 10px 22px rgba(76,111,255,.28)"
          >
            <Text fontWeight="900" fontSize="12px">
              YB
            </Text>
          </Flex>
          {isExpanded && (
            <Box minW="0">
              <Text fontSize="13px" fontWeight="800">
                迎波智能客服
              </Text>
              <Text color="whiteAlpha.450" fontSize="9px" letterSpacing=".08em">
                OPERATIONS
              </Text>
            </Box>
          )}
        </Flex>
        {isExpanded && (
          <Box
            as="button"
            aria-label="收起导航"
            color="whiteAlpha.550"
            onClick={onToggle}
            _hover={{ color: 'white' }}
          >
            <FiMenu size={17} />
          </Box>
        )}
      </Flex>

      <Flex direction="column" px={2.5} gap={1} flex="1" pt={2}>
        {isExpanded && (
          <Text px={3} pb={1.5} color="whiteAlpha.350" fontSize="9px" fontWeight="700" letterSpacing=".12em">
            日常工作
          </Text>
        )}
        {PRIMARY_NAV.map(renderItem)}
        <Box h="1px" bg="whiteAlpha.100" my={3} />
        {isExpanded && (
          <Text px={3} pb={1.5} color="whiteAlpha.350" fontSize="9px" fontWeight="700" letterSpacing=".12em">
            管理与复盘
          </Text>
        )}
        {MANAGEMENT_NAV.map(renderItem)}
      </Flex>

      <Box px={2.5} pb={4}>
        {!isExpanded && (
          <Tooltip label="展开导航" placement="right" hasArrow>
            <Flex
              as="button"
              w="full"
              h="40px"
              align="center"
              justify="center"
              color="whiteAlpha.600"
              onClick={onToggle}
            >
              <FiMenu size={17} />
            </Flex>
          </Tooltip>
        )}
        <Tooltip label="系统设置" placement="right" isDisabled={isExpanded} hasArrow>
          <Box
            as="button"
            onClick={() =>
              window.electron.ipcRenderer.sendMessage(
                'open-settings-window',
                {},
              )
            }
            display="flex"
            alignItems="center"
            gap={3}
            h="42px"
            w="full"
            px={isExpanded ? 3 : 0}
            justifyContent={isExpanded ? 'flex-start' : 'center'}
            borderRadius="10px"
            color="whiteAlpha.650"
            _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
          >
            <FiSettings size={17} />
            {isExpanded && (
              <Text fontSize="13px" fontWeight="600">
                系统设置
              </Text>
            )}
          </Box>
        </Tooltip>
        {isExpanded && (
          <Flex px={3} mt={3} align="center" gap={2}>
            <Box
              w="7px"
              h="7px"
              rounded="full"
              bg="#38D39F"
              boxShadow="0 0 0 4px rgba(56,211,159,.1)"
            />
            <Text fontSize="10px" color="whiteAlpha.500">
              服务运行中 · v
              {window?.electron?.ipcRenderer?.get?.('get-version') ?? ''}
            </Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

export default React.memo(AppSidebar);
