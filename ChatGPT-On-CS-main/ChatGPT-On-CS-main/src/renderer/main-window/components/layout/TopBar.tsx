import React from 'react';
import { Box, Flex, Text, HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { FiBarChart2, FiGrid, FiHeadphones, FiSidebar } from 'react-icons/fi';
import { SettingsIcon } from '@chakra-ui/icons';

export type ViewKey = 'dashboard' | 'service';

const TopBar = ({ view, onChange }: { view: ViewKey; onChange: (v: ViewKey) => void }) => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');

  const tabs: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: '工作台', icon: <FiGrid size={16} /> },
    { key: 'service', label: '客服中心', icon: <FiHeadphones size={16} /> },
  ];

  return (
    <Box
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.100"
      flexShrink={0}
      boxShadow="0 1px 2px rgba(15, 23, 42, 0.04)"
    >
      {/* 品牌行 */}
      <Flex align="center" justify="space-between" px={4} h="54px">
        <HStack spacing={2.5}>
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
            <Text color="white" fontWeight="900" fontSize="13px" lineHeight={1}>
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
          </Box>
        </HStack>

        <HStack spacing={1}>
          <Tooltip label="打开千牛伴随面板" placement="bottom" hasArrow>
            <IconButton
              aria-label="打开千牛伴随面板"
              icon={<FiSidebar size={17} />}
              variant="ghost"
              size="sm"
              color="gray.500"
              borderRadius="lg"
              _hover={{ bg: 'green.50', color: 'green.600' }}
              onClick={() =>
                window.electron.ipcRenderer.sendMessage('open-companion-window')
              }
            />
          </Tooltip>
          <Tooltip label="数据统计" placement="bottom" hasArrow>
            <IconButton
              aria-label="数据统计"
              icon={<FiBarChart2 size={17} />}
              variant="ghost"
              size="sm"
              color="gray.500"
              borderRadius="lg"
              _hover={{ bg: 'gray.100', color: 'brand.600' }}
              onClick={() => window.electron.ipcRenderer.sendMessage('open-dataview-window', {})}
            />
          </Tooltip>
          <Tooltip label="设置" placement="bottom" hasArrow>
            <IconButton
              aria-label="设置"
              icon={<SettingsIcon boxSize="17px" />}
              variant="ghost"
              size="sm"
              color="gray.500"
              borderRadius="lg"
              _hover={{ bg: 'gray.100', color: 'brand.600' }}
              onClick={() => window.electron.ipcRenderer.sendMessage('open-settings-window', {})}
            />
          </Tooltip>
          <HStack spacing={1.5} pl={1.5} ml={1} borderLeft="1px solid" borderColor="gray.100">
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg="green.400"
              className="pulse-dot"
              boxShadow="0 0 0 3px rgba(34, 197, 94, 0.15)"
            />
            <Text fontSize="11px" color="gray.500" fontWeight={600} whiteSpace="nowrap">
              运行中
            </Text>
          </HStack>
        </HStack>
      </Flex>

      {/* 视图切换（下划线标签） */}
      <Flex px={4} gap={5} align="flex-end" h="40px">
        {tabs.map((t) => {
          const active = t.key === view;
          return (
            <Box
              as="button"
              key={t.key}
              onClick={() => onChange(t.key)}
              pb="11px"
              pt="2px"
              borderBottom={active ? '2px solid' : '2px solid transparent'}
              borderColor="brand.500"
              color={active ? 'brand.700' : 'gray.500'}
              fontWeight={active ? 700 : 500}
              fontSize="14px"
              transition="all 0.15s"
              _hover={{ color: active ? 'brand.700' : 'gray.800' }}
            >
              <HStack spacing={1.5}>
                <Box color={active ? 'brand.500' : 'gray.400'}>{t.icon}</Box>
                <Text>{t.label}</Text>
              </HStack>
            </Box>
          );
        })}
        <Box flex="1" />
        <Text fontSize="10px" color="gray.300" alignSelf="center" fontWeight={500}>
          v{currentVersion}
        </Text>
      </Flex>
    </Box>
  );
};

export default React.memo(TopBar);
