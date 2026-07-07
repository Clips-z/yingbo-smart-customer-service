import React from 'react';
import { Box, Flex, Text, VStack, HStack } from '@chakra-ui/react';
import { FiGrid, FiHeadphones, FiBarChart2 } from 'react-icons/fi';
import { SettingsIcon } from '@chakra-ui/icons';

export type ViewKey = 'dashboard' | 'service';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  view?: ViewKey;
  action?: 'stats' | 'settings';
}

const Sidebar = ({ view, onChange }: { view: ViewKey; onChange: (v: ViewKey) => void }) => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');

  const items: NavItem[] = [
    { key: 'dashboard', label: '工作台', icon: <FiGrid size={18} />, view: 'dashboard' },
    { key: 'service', label: '客服中心', icon: <FiHeadphones size={18} />, view: 'service' },
    { key: 'stats', label: '数据统计', icon: <FiBarChart2 size={18} />, action: 'stats' },
    { key: 'settings', label: '设置', icon: <SettingsIcon boxSize="18px" />, action: 'settings' },
  ];

  const handle = (it: NavItem) => {
    if (it.view) onChange(it.view);
    if (it.action === 'stats') {
      window.electron.ipcRenderer.sendMessage('open-dataview-window', {});
    }
    if (it.action === 'settings') {
      window.electron.ipcRenderer.sendMessage('open-settings-window', {});
    }
  };

  return (
    <Flex
      direction="column"
      w="234px"
      flexShrink={0}
      h="100vh"
      bg="white"
      borderRight="1px solid"
      borderColor="gray.100"
      position="relative"
    >
      {/* 品牌区 */}
      <HStack spacing={3} px={5} py={5} align="center">
        <Box
          w="38px"
          h="38px"
          borderRadius="11px"
          bgGradient="linear-gradient(135deg, #4A5BB3 0%, #2A83FF 100%)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxShadow="0 4px 12px rgba(74, 91, 179, 0.4)"
        >
          <Text color="white" fontWeight="900" fontSize="16px" lineHeight={1}>
            YB
          </Text>
        </Box>
        <Box>
          <Text
            fontWeight={800}
            fontSize="15px"
            lineHeight={1.1}
            background="linear-gradient(135deg, #4A5BB3 0%, #2A83FF 60%, #4997FF 100%)"
            backgroundClip="text"
            style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            迎波智能客服
          </Text>
          <Text fontSize="9px" color="gray.400" letterSpacing="0.08em" textTransform="uppercase" lineHeight={1}>
            AI Customer Service
          </Text>
        </Box>
      </HStack>

      {/* 导航 */}
      <VStack spacing={1} px={3} align="stretch" mt={2}>
        {items.map((it) => {
          const active = !!it.view && it.view === view;
          return (
            <Flex
              key={it.key}
              align="center"
              gap={3}
              px={3}
              py={2.5}
              borderRadius="lg"
              cursor="pointer"
              bg={active ? 'brand.50' : 'transparent'}
              color={active ? 'brand.700' : 'gray.600'}
              borderLeft={active ? '3px solid' : '3px solid transparent'}
              borderColor={active ? 'brand.500' : 'transparent'}
              _hover={{ bg: active ? 'brand.50' : 'gray.50', color: active ? 'brand.700' : 'gray.800' }}
              onClick={() => handle(it)}
              transition="all 0.15s"
            >
              <Box color={active ? 'brand.500' : 'gray.400'}>{it.icon}</Box>
              <Text fontSize="14px" fontWeight={active ? 700 : 500}>
                {it.label}
              </Text>
            </Flex>
          );
        })}
      </VStack>

      <Box flex="1" />

      {/* 底部状态 */}
      <Box px={5} py={4} borderTop="1px solid" borderColor="gray.100">
        <HStack spacing={2}>
          <Box
            w="8px"
            h="8px"
            borderRadius="full"
            bg="green.400"
            className="pulse-dot"
            boxShadow="0 0 0 3px rgba(34, 197, 94, 0.15)"
          />
          <Text fontSize="12px" color="gray.500" fontWeight={500}>
            系统运行中
          </Text>
        </HStack>
        <Text fontSize="10px" color="gray.300" mt={1}>
          v{currentVersion}
        </Text>
      </Box>
    </Flex>
  );
};

export default React.memo(Sidebar);
