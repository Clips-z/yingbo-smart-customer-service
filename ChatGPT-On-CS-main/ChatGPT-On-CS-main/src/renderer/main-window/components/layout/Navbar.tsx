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
      padding={{ base: '0.6rem 1rem', md: '0.75rem 1.5rem' }}
      position="fixed"
      width="100%"
      top="0"
      bg="rgba(255, 255, 255, 0.92)"
      backdropFilter="blur(16px)"
      borderBottom="1px solid"
      borderColor="gray.100"
      zIndex="1000"
      height={{ base: '52px', md: '56px' }}
    >
      {/* 品牌名称 */}
      <HStack spacing={3}>
        <Box
          w="34px"
          h="34px"
          borderRadius="10px"
          bgGradient="linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxShadow="0 2px 8px rgba(99, 102, 241, 0.3)"
        >
          <Text
            color="white"
            fontWeight="900"
            fontSize="15px"
            fontFamily="'Segoe UI', system-ui, sans-serif"
            lineHeight={1}
          >
            YB
          </Text>
        </Box>

        <Box>
          <Text
            as="h1"
            fontSize={{ base: '1.05em', md: '1.25em' }}
            fontWeight="800"
            letterSpacing="-0.02em"
            className="font-zh"
            background="linear-gradient(135deg, #6366F1 0%, #06B6D4 50%, #818CF8 100%)"
            backgroundClip="text"
            style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            lineHeight="1.2"
          >
            迎波智能客服
          </Text>
          <Text
            fontSize="9px"
            color="gray.400"
            fontWeight="500"
            letterSpacing="0.1em"
            textTransform="uppercase"
            lineHeight={1}
            mt="-1px"
          >
            AI Customer Service
          </Text>
        </Box>
      </HStack>

      {/* 导航按钮组 — 胶囊风格 */}
      <HStack spacing={1}>
        <Button
          size="xs"
          variant="ghost"
          leftIcon={<CalendarIcon boxSize="12px" />}
          onClick={handleOpenDataview}
          color="gray.600"
          borderRadius="full"
          px={3}
          fontSize="12px"
          fontWeight={500}
          _hover={{ bg: 'brand.50', color: 'brand.600' }}
        >
          记录
        </Button>
        <Button
          size="xs"
          variant="ghost"
          leftIcon={<ChatIcon boxSize="12px" />}
          onClick={handleOpenDataview}
          color="gray.600"
          borderRadius="full"
          px={3}
          fontSize="12px"
          fontWeight={500}
          _hover={{ bg: 'brand.50', color: 'brand.600' }}
        >
          关键词
        </Button>
        <Button
          size="xs"
          variant="solid"
          leftIcon={<SettingsIcon boxSize="12px" />}
          onClick={handleOpenSettings}
          bg="brand.500"
          color="white"
          borderRadius="full"
          px={4}
          fontSize="12px"
          fontWeight={600}
          _hover={{ bg: 'brand.600', transform: 'translateY(-1px)' }}
          _active={{ bg: 'brand.700' }}
          boxShadow="0 2px 6px rgba(99, 102, 241, 0.25)"
          transition="all 0.2s"
        >
          设置
        </Button>
      </HStack>
    </Flex>
  );
};

export default React.memo(Navbar);
