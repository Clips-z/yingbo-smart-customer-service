import React from 'react';
import {
  Badge,
  Box,
  Flex,
  Image,
  IconButton,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { SettingsIcon } from '@chakra-ui/icons';
import defaultPlatformIcon from '../../../../../assets/base/default-platform-icon.png';
import qianniuIcon from '../../../../../assets/base/platform-qianniu.png';
import jinmaiIcon from '../../../../../assets/base/platform-jinmai.png';
import wechatIcon from '../../../../../assets/base/platform-wechat.png';
import wecomIcon from '../../../../../assets/base/platform-wecom.png';
import pddIcon from '../../../../../assets/base/platform-pdd.png';
import douyinIcon from '../../../../../assets/base/platform-douyin.png';

const PLATFORM_ICONS: Record<string, string> = {
  win_qianniu: qianniuIcon,
  win_jinmai: jinmaiIcon,
  win_wechat: wechatIcon,
  win_wecom: wecomIcon,
  win_pdd: pddIcon,
  win_douyin: douyinIcon,
};

const PLATFORM_LABELS: Record<string, string> = {
  win_qianniu: '千牛',
  win_jinmai: '京麦',
  win_wechat: '微信',
  win_wecom: '企业微信',
  win_pdd: '拼多多',
  win_douyin: '抖店',
};

interface AppCardComponentProps {
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
}

const AppCardComponent: React.FC<AppCardComponentProps> = ({
  app,
  selectedAppId,
  setSelectedAppId,
  openSettings,
}) => {
  const selected = selectedAppId === app.id;
  const label = PLATFORM_LABELS[app.id] || app.name;
  return (
    <Flex
      as="button"
      type="button"
      w="full"
      minH="66px"
      p={3}
      align="center"
      gap={3}
      textAlign="left"
      border="1px solid"
      borderColor={selected ? '#AFC0FF' : 'ui.border'}
      bg={selected ? 'ui.accentSoft' : 'white'}
      borderRadius="13px"
      opacity={app.running ? 1 : 0.62}
      cursor={app.running ? 'pointer' : 'default'}
      transition="all 150ms ease"
      _hover={app.running ? { borderColor: '#AFC0FF', bg: selected ? 'ui.accentSoft' : '#FBFCFF' } : {}}
      _focusVisible={{ boxShadow: '0 0 0 3px rgba(70,103,217,.18)' }}
      onClick={() => app.running && setSelectedAppId(app.id)}
    >
      <Flex
        w="38px"
        h="38px"
        flexShrink={0}
        align="center"
        justify="center"
        borderRadius="11px"
        bg="white"
        border="1px solid"
        borderColor="ui.border"
      >
        <Image
          src={PLATFORM_ICONS[app.id] || defaultPlatformIcon}
          fallbackSrc={defaultPlatformIcon}
          boxSize="24px"
          borderRadius="6px"
        />
      </Flex>
      <Box flex="1" minW="0">
        <Flex align="center" gap={2}>
          <Text fontSize="13px" fontWeight="750" color="ui.ink" noOfLines={1}>
            {label}
          </Text>
          {app.env === 'desktop' && (
            <Badge fontSize="9px" colorScheme="gray">
              桌面端
            </Badge>
          )}
        </Flex>
        <Flex align="center" gap={1.5} mt={1}>
          <Box
            w="6px"
            h="6px"
            rounded="full"
            bg={app.running ? 'green.400' : 'gray.300'}
          />
          <Text fontSize="10px" color={app.running ? 'green.700' : 'gray.500'}>
            {app.running ? '已连接，可处理消息' : '未检测到客户端'}
          </Text>
        </Flex>
      </Box>
      <Tooltip label={`${label} 设置`}>
        <IconButton
          aria-label={`${label} 设置`}
          icon={<SettingsIcon />}
          size="xs"
          variant="ghost"
          color="gray.500"
          onClick={(event) => {
            event.stopPropagation();
            openSettings();
          }}
        />
      </Tooltip>
    </Flex>
  );
};

export default React.memo(AppCardComponent);
