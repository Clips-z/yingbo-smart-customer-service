import React from 'react';
import {
  Box,
  Text,
  Stack,
  Tooltip,
  Button,
  HStack,
} from '@chakra-ui/react';
import { FiBookOpen } from 'react-icons/fi';

const Footer = () => {
  return (
    <Box
      as="footer"
      role="contentinfo"
      maxW="7xl"
      py={3}
      px={{ base: '4', md: '8' }}
      bg="white"
      borderTop="1px solid"
      borderColor="gray.100"
    >
      <HStack justify="center" spacing={6}>
        <Tooltip label="查看文档获取帮助">
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<FiBookOpen size={14} />}
            onClick={() =>
              window.electron.ipcRenderer.sendMessage('open-user-manual')
            }
            color="gray.500"
            fontSize="12px"
            _hover={{ color: 'brand.500', bg: 'brand.50' }}
            borderRadius="full"
          >
            使用手册
          </Button>
        </Tooltip>
        <Text fontSize="11px" color="gray.400">
          &copy; {new Date().getFullYear()} YinBo. All rights reserved.
        </Text>
      </HStack>
    </Box>
  );
};

export default Footer;
