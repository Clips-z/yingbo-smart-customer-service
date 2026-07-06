import React from 'react';
import {
  Box,
  Flex,
  Image,
  Badge,
  HStack,
  IconButton,
  Tooltip,
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

  return (
    <Flex
      bg={isSelected ? 'teal.50' : 'gray.100'}
      borderRadius="lg"
      p={3}
      px={4}
      align="center"
      justify="space-between"
      outline={isSelected ? '2px solid var(--chakra-colors-teal-400)' : 'none'}
      cursor={app.running ? 'pointer' : 'default'}
      opacity={app.running ? 1 : 0.55}
      transition="all 0.2s"
      _hover={
        app.running
          ? { bg: isSelected ? 'teal.100' : 'gray.200', transform: 'translateY(-1px)' }
          : {}
      }
      flex="1"
      minW="180px"
      maxW="280px"
      onClick={() => {
        if (app.running) setSelectedAppId(app.id);
      }}
    >
      <HStack spacing={3}>
        <Box position="relative">
          <Image
            src={platformIcon}
            fallbackSrc={defaultPlatformIcon}
            boxSize="32px"
            borderRadius="md"
          />
          {app.env === 'desktop' && (
            <Tooltip label="客户端应用，需要先手动打开该应用">
              <Image
                src={windowsIcon}
                boxSize="14px"
                position="absolute"
                top="-4px"
                right="-4px"
                alt="windows"
              />
            </Tooltip>
          )}
        </Box>
        <Box>
          <HStack spacing={2}>
            <Box fontSize="sm" fontWeight="medium" color="gray.800">
              {PLATFORM_LABELS[app.id] || app.name}
            </Box>
            <Badge
              colorScheme={app.running ? 'green' : 'gray'}
              fontSize="10px"
              variant="subtle"
            >
              {app.running ? '在线' : '离线'}
            </Badge>
          </HStack>
        </Box>
      </HStack>
      <Tooltip label={`设置 ${PLATFORM_LABELS[app.id] || app.name} 平台`}>
        <IconButton
          variant="ghost"
          aria-label={`设置 ${app.name} 平台`}
          fontSize="14px"
          size="sm"
          icon={<SettingsIcon />}
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
