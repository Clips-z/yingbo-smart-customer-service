import React from 'react';
import { Box, Flex, Text, Button, HStack } from '@chakra-ui/react';
import {
  SettingsIcon,
  ChatIcon,
  CalendarIcon,
} from '@chakra-ui/icons';

const Navbar = () => {
  const handleOpenSettings = () => {
    window.electron.ipcRenderer.sendMessage('open-settings-window', {});
  };

  const handleOpenDataview = () => {
    window.electron.ipcRenderer.sendMessage('open-dataview-window', {});
  };

  return (
    <Flex
      as="nav"
      align="center"
      justify="space-between"
      wrap="wrap"
      padding={{ base: '0.75rem 1rem', md: '1rem 1.5rem' }}
      position="fixed"
      width="100%"
      top="0"
      bg={'white'}
      borderBottom="1px solid"
      borderColor="gray.100"
      zIndex="1000"
      height={{ base: '56px', md: '60px' }}
      boxShadow="sm"
    >
      {/* 品牌名称 — 渐变设计 */}
      <HStack spacing={3}>
        {/* Logo 图标区域 */}
        <Box
          w="32px"
          h="32px"
          borderRadius="8px"
          bgGradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxShadow="md"
        >
          <Text
            color="white"
            fontWeight="900"
            fontSize="16px"
            fontFamily="'Segoe UI', system-ui, sans-serif"
            lineHeight={1}
          >
            YB
          </Text>
        </Box>

        <Box>
          <Text
            as="h1"
            fontSize={{ base: '1.15em', md: '1.4em' }}
            fontWeight="800"
            letterSpacing="-0.02em"
            className="font-zh"
            background="linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)"
            backgroundClip="text"
            style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            lineHeight="1.2"
          >
            迎波智能客服
          </Text>
          <Text
            fontSize="10px"
            color="gray.400"
            fontWeight="500"
            letterSpacing="0.08em"
            textTransform="uppercase"
            lineHeight={1}
            mt="-2px"
          >
            AI Customer Service Assistant
          </Text>
        </Box>
      </HStack>

      <HStack gap="6px" display={{ md: 'flex' }} spacing={1}>
        <Button
          size="xs"
          variant="ghost"
          leftIcon={<CalendarIcon />}
          onClick={handleOpenDataview}
          colorScheme="teal"
          borderRadius="lg"
        >
          记录
        </Button>
        <Button
          size="xs"
          variant="ghost"
          leftIcon={<ChatIcon />}
          onClick={handleOpenDataview}
          colorScheme="teal"
          borderRadius="lg"
        >
          关键词
        </Button>
        <Button
          size="xs"
          variant="ghost"
          leftIcon={<SettingsIcon />}
          onClick={handleOpenSettings}
          colorScheme="teal"
          borderRadius="lg"
        >
          设置
        </Button>
      </HStack>
    </Flex>
  );
};

export default React.memo(Navbar);
