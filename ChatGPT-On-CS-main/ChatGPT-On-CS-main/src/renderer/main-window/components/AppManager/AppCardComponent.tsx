import React from 'react';
import {
  Box,
  Flex,
  Image,
  Badge,
  HStack,
  IconButton,
  Tooltip,
  Text,
} from '@chakra-ui/react';
import { SettingsIcon } from '@chakra-ui/icons';
import defaultPlatformIcon from '../../../../../assets/base/default-platform-icon.png';
import qianniuIcon from '../../../../../assets/base/platform-qianniu.png';
import jinmaiIcon from '../../../../../assets/base/platform-jinmai.png';
import wechatIcon from '../../../../../assets/base/platform-wechat.png';
import wecomIcon from '../../../../../assets/base/platform-wecom.png';
import windowsIcon from '../../../../../assets/base/windows.png';

const PLATFORM_ICONS: Record<string, string> = {
  win_qianniu: qianniuIcon,
  win_jinmai: jinmaiIcon,
  win_wechat: wechatIcon,
  win_wecom: wecomIcon,
};

const PLATFORM_LABELS: Record<string, string> = {
  win_qianniu: '千牛',
  win_jinmai: '京麦',
  win_wechat: '微信',
  win_wecom: '企微',
};

// 平台专属色映射
const PLATFORM_COLORS: Record<string, string> = {
  win_qianniu: 'qianniu',
  win_jinmai: 'jinmai',
  win_wechat: 'wechat',
  win_wecom: 'wecom',
};

type AppCardComponentProps = {
  app: {
    id: string;
    name: string;
    avatar?: string;
    env?: string;
    running?: boolean;
  };
  selectedAppId: string | null;
  setSelectedAppId: React.Dispatch<React.SetStateAction<string | null>>;
  openSettings: () => void;
};

const AppCardComponent = ({
  app,
  selectedAppId,
  setSelectedAppId,
  openSettings,
}: AppCardComponentProps) => {
  const platformIcon = PLATFORM_ICONS[app.id] || defaultPlatformIcon;
  const isSelected = selectedAppId === app.id;
  const platformColor = PLATFORM_COLORS[app.id] || 'gray';
  const platformLabel = PLATFORM_LABELS[app.id] || app.name;

  return (
    <Flex
      bg="white"
      borderRadius="lg"
      p={3}
      px={4}
      align="center"
      justify="space-between"
      gap={3}
      cursor={app.running ? 'pointer' : 'default'}
      opacity={app.running ? 1 : 0.5}
      transition="all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
      boxShadow={
        isSelected
          ? `0 0 0 2px var(--chakra-colors-${platformColor}-400), 0 4px 12px rgba(0,0,0,0.08)`
          : '0 1px 3px rgba(0,0,0,0.06)'
      }
      _hover={
        app.running
          ? {
            transform: 'translateY(-2px)',
            boxShadow: `0 6px 16px rgba(0,0,0,0.1)`,
          }
          : {}
      }
      flex="1"
      minW="160px"
      maxW="240px"
      onClick={() => {
        if (app.running) setSelectedAppId(app.id);
      }}
      position="relative"
      overflow="hidden"
    >
      {/* 左侧选中指示条 */}
      {isSelected && (
        <Box
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          w="3px"
          bg={`${platformColor}.500`}
          borderRightRadius="sm"
        />
      )}

      <HStack spacing={3}>
        {/* 平台图标 + 环境标识 */}
        <Box position="relative">
          <Box
            p="6px"
            borderRadius="md"
            bg={isSelected ? `${platformColor}.50` : 'gray.50'}
            transition="background 0.2s"
          >
            <Image
              src={platformIcon}
              fallbackSrc={defaultPlatformIcon}
              boxSize="28px"
              borderRadius="sm"
            />
          </Box>
          {app.env === 'desktop' && (
            <Tooltip label="客户端应用，需要先手动打开该应用">
              <Image
                src={windowsIcon}
                boxSize="12px"
                position="absolute"
                top="-3px"
                right="-3px"
                alt="windows"
              />
            </Tooltip>
          )}
        </Box>

        <Box>
          <HStack spacing={2}>
            <Text fontSize="13px" fontWeight="600" color="gray.800">
              {platformLabel}
            </Text>
          </HStack>
          <HStack spacing={1} mt="1px">
            {/* 在线/离线状态点 */}
            <Box
              w="6px"
              h="6px"
              borderRadius="full"
              bg={app.running ? 'green.400' : 'gray.300'}
              className={app.running ? 'pulse-dot' : ''}
            />
            <Text fontSize="11px" color={app.running ? 'green.600' : 'gray.400'} fontWeight={500}>
              {app.running ? '在线' : '离线'}
            </Text>
          </HStack>
        </Box>
      </HStack>

      {/* 设置按钮 */}
      <Tooltip label={`设置 ${platformLabel} 平台`}>
        <IconButton
          variant="ghost"
          aria-label={`设置 ${platformLabel} 平台`}
          fontSize="14px"
          size="sm"
          icon={<SettingsIcon />}
          color={isSelected ? `${platformColor}.500` : 'gray.400'}
          _hover={{ bg: `${platformColor}.50`, color: `${platformColor}.600` }}
          borderRadius="lg"
          onClick={(e) => {
            e.stopPropagation();
            openSettings();
          }}
        />
      </Tooltip>
    </Flex>
  );
};

export default AppCardComponent;
