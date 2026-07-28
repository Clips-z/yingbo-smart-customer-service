import React from 'react';
import {
  Badge,
  Box,
  Flex,
  IconButton,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import {
  FiBarChart2,
  FiChevronRight,
  FiSettings,
  FiSidebar,
} from 'react-icons/fi';

interface PageHeaderProps {
  title: string;
  description: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description }) => (
  <Flex
    minH="72px"
    px={{ base: 4, md: 6 }}
    py={3}
    align="center"
    justify="space-between"
    gap={4}
    bg="rgba(255,255,255,.94)"
    borderBottom="1px solid"
    borderColor="ui.border"
    flexShrink={0}
  >
    <Box minW="0">
      <Flex align="center" gap={1} mb={0.5}>
        <Text color="gray.400" fontSize="10px" fontWeight="600">
          迎波工作空间
        </Text>
        <FiChevronRight size={12} color="#98A2B3" />
        <Text color="gray.500" fontSize="10px" fontWeight="600">
          {title}
        </Text>
      </Flex>
      <Flex align={{ base: 'flex-start', lg: 'baseline' }} gap={{ base: 0, lg: 3 }} direction={{ base: 'column', lg: 'row' }}>
        <Text
          fontSize={{ base: '18px', md: '20px' }}
          fontWeight="800"
          color="ui.ink"
          letterSpacing="-.025em"
          whiteSpace="nowrap"
        >
          {title}
        </Text>
        <Text
          display={{ base: 'none', md: 'block' }}
          fontSize="11px"
          color="gray.500"
          noOfLines={1}
        >
          {description}
        </Text>
      </Flex>
    </Box>

    <Flex align="center" gap={1.5} flexShrink={0}>
      <Badge
        display={{ base: 'none', md: 'inline-flex' }}
        alignItems="center"
        px={2.5}
        py={1}
        bg="green.50"
        color="green.700"
        borderRadius="full"
        fontSize="10px"
      >
        <Box w="6px" h="6px" rounded="full" bg="green.400" mr={1.5} />
        服务正常
      </Badge>
      <Tooltip label="打开伴随助手" hasArrow>
        <IconButton
          aria-label="打开伴随助手"
          icon={<FiSidebar />}
          size="sm"
          variant="ghost"
          onClick={() =>
            window.electron.ipcRenderer.sendMessage('open-companion-window')
          }
        />
      </Tooltip>
      <Tooltip label="数据分析" hasArrow>
        <IconButton
          aria-label="数据分析"
          icon={<FiBarChart2 />}
          size="sm"
          variant="ghost"
          onClick={() =>
            window.electron.ipcRenderer.sendMessage(
              'open-dataview-window',
              {},
            )
          }
        />
      </Tooltip>
      <Tooltip label="系统设置" hasArrow>
        <IconButton
          aria-label="系统设置"
          icon={<FiSettings />}
          size="sm"
          variant="ghost"
          onClick={() =>
            window.electron.ipcRenderer.sendMessage(
              'open-settings-window',
              {},
            )
          }
        />
      </Tooltip>
    </Flex>
  </Flex>
);

export default React.memo(PageHeader);
