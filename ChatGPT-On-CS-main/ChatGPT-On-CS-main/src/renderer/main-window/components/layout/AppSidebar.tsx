import React from 'react';
import { Box, Flex, Icon, Text, Tooltip } from '@chakra-ui/react';
import {
  FiActivity, FiBarChart2, FiBookOpen, FiGrid, FiHeadphones,
  FiMenu, FiSettings, FiShield,
} from 'react-icons/fi';

export type NavSection = 'dashboard' | 'service' | 'knowledge' | 'security' | 'dataview';

export interface NavItem {
  key: NavSection;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export type KnowledgeSubKey =
  | 'knowledge-candidates' | 'product-qa' | 'store-kb' | 'industry-config'
  | 'validity' | 'corpus-test' | 'governance';

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
  { key: 'dashboard', label: '运营总览', description: '今日待办与平台状态', icon: <FiGrid size={18} /> },
  { key: 'service', label: '会话工作台', description: '处理客户消息与回复', icon: <FiHeadphones size={18} /> },
  { key: 'knowledge', label: '知识资产', description: '沉淀、编辑与验证知识', icon: <FiBookOpen size={18} /> },
  { key: 'security', label: '安全与合规', description: '回复安全策略与审查', icon: <FiShield size={18} /> },
  { key: 'dataview', label: '数据分析', description: '在独立窗口查看趋势', icon: <FiBarChart2 size={18} /> },
];

interface AppSidebarProps {
  activeSection: NavSection | null;
  onNavigate: (section: NavSection) => void;
  showKnowledgeSub?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({
  activeSection, onNavigate, showKnowledgeSub, isExpanded, onToggle,
}) => (
  <Flex
    direction="column"
    w={isExpanded ? '224px' : '72px'}
    bg="#101828"
    color="white"
    flexShrink={0}
    h="full"
    transition="width 0.2s ease"
    overflow="hidden"
  >
    <Flex h="76px" align="center" px={isExpanded ? 5 : 0} justify={isExpanded ? 'space-between' : 'center'}>
      <Flex align="center" gap={3} minW="0">
        <Flex w="34px" h="34px" flexShrink={0} borderRadius="11px" align="center" justify="center" bg="linear-gradient(135deg, #5B8CFF, #7C5CFC)" boxShadow="0 10px 20px rgba(82, 103, 255, .28)">
          <Text fontWeight="900" fontSize="13px">YB</Text>
        </Flex>
        {isExpanded && <Box minW="0"><Text fontSize="14px" fontWeight="800" letterSpacing="-.02em">迎波智能客服</Text><Text color="whiteAlpha.500" fontSize="10px" mt="1px">AI SERVICE CONSOLE</Text></Box>}
      </Flex>
      {isExpanded && <Box as="button" aria-label="收起导航" color="whiteAlpha.600" onClick={onToggle} _hover={{ color: 'white' }}><FiMenu size={18} /></Box>}
      {!isExpanded && <Box as="button" aria-label="展开导航" color="whiteAlpha.600" onClick={onToggle} position="absolute" top="80px"><FiMenu size={18} /></Box>}
    </Flex>

    <Flex direction="column" px={isExpanded ? 3 : 2} gap={1} flex="1" pt={2}>
      {isExpanded && <Text px={3} pb={2} color="whiteAlpha.400" fontSize="10px" fontWeight="700" letterSpacing=".1em">工作空间</Text>}
      {MAIN_NAV.map((item) => {
        const active = activeSection === item.key || (item.key === 'knowledge' && showKnowledgeSub);
        return <Tooltip key={item.key} label={`${item.label} · ${item.description}`} placement="right" isDisabled={isExpanded} hasArrow>
          <Box as="button" onClick={() => item.key === 'dataview' ? window.electron.ipcRenderer.sendMessage('open-dataview-window', {}) : onNavigate(item.key)} display="flex" alignItems="center" gap={3} h="48px" px={isExpanded ? 3 : 0} justifyContent={isExpanded ? 'flex-start' : 'center'} borderRadius="12px" textAlign="left" color={active ? 'white' : 'whiteAlpha.600'} bg={active ? 'rgba(122, 145, 255, .20)' : 'transparent'} border="1px solid" borderColor={active ? 'rgba(143, 162, 255, .22)' : 'transparent'} _hover={{ bg: active ? 'rgba(122, 145, 255, .25)' : 'whiteAlpha.100', color: 'white' }} _focusVisible={{ boxShadow: '0 0 0 2px #8BA7FF' }}>
            <Icon color={active ? '#AFC2FF' : 'inherit'}>{item.icon}</Icon>
            {isExpanded && <Box minW="0"><Text fontSize="13px" fontWeight={active ? '700' : '600'}>{item.label}</Text><Text fontSize="10px" color={active ? 'whiteAlpha.600' : 'whiteAlpha.400'} noOfLines={1}>{item.description}</Text></Box>}
          </Box>
        </Tooltip>;
      })}
    </Flex>

    <Box px={isExpanded ? 3 : 2} pb={4}>
      <Box h="1px" bg="whiteAlpha.100" mb={3} />
      <Tooltip label="打开系统设置" placement="right" isDisabled={isExpanded} hasArrow>
        <Box as="button" onClick={() => window.electron.ipcRenderer.sendMessage('open-settings-window', {})} display="flex" alignItems="center" gap={3} h="42px" w="full" px={isExpanded ? 3 : 0} justifyContent={isExpanded ? 'flex-start' : 'center'} borderRadius="10px" color="whiteAlpha.600" _hover={{ bg: 'whiteAlpha.100', color: 'white' }}>
          <FiSettings size={17} />{isExpanded && <Text fontSize="13px" fontWeight="600">系统设置</Text>}
        </Box>
      </Tooltip>
      {isExpanded && <Flex px={3} mt={3} align="center" gap={2}><Box w="7px" h="7px" rounded="full" bg="#36D399" boxShadow="0 0 0 4px rgba(54,211,153,.1)" /><Box><Text fontSize="11px" fontWeight="600">服务运行中</Text><Text fontSize="10px" color="whiteAlpha.400">v{window?.electron?.ipcRenderer?.get?.('get-version') ?? ''}</Text></Box></Flex>}
      {!isExpanded && <Tooltip label="服务运行中" placement="right" hasArrow><Flex justify="center" mt={3}><Box w="7px" h="7px" rounded="full" bg="#36D399" /></Flex></Tooltip>}
    </Box>
  </Flex>
);

export default React.memo(AppSidebar);
