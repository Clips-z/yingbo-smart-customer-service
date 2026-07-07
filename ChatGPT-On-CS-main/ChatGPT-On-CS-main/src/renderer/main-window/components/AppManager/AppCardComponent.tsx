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
import pddIcon from '../../../../../assets/base/platform-pdd.png';
import douyinIcon from '../../../../../assets/base/platform-douyin.png';
import windowsIcon from '../../../../../assets/base/windows.png';

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
  win_wecom: '企微',
  win_pdd: '拼多多',
  win_douyin: '抖音电商',
};

// 平台专属色映射
const PLATFORM_COLORS: Record<string, string> = {
  win_qianniu: 'qianniu',
  win_jinmai: 'jinmai',
  win_wechat: 'wechat',
  win_wecom: 'wecom',
  win_pdd: 'red',
  win_douyin: 'gray',
};

// intro.png 风格：每个平台一张彩色渐变卡片
const PLATFORM_CARD: Record<string, { grad: string; iconBg: string; text: string }> = {
  win_qianniu: { grad: 'linear-gradient(135deg, #FFEADB 0%, #FFD4BE 100%)', iconBg: '#F97B45', text: '#9A3412' },
  win_wecom: { grad: 'linear-gradient(135deg, #DAFEFF 0%, #B0F7FA 100%)', iconBg: '#2A83FF', text: '#155E75' },
  win_wechat: { grad: 'linear-gradient(135deg, #DCEDEB 0%, #B3D2D1 100%)', iconBg: '#10B981', text: '#065F46' },
  win_jinmai: { grad: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', iconBg: '#EF4444', text: '#991B1B' },
  win_pdd: { grad: 'linear-gradient(135deg, #FEE2E2 0%, #FCA5A5 100%)', iconBg: '#EF4444', text: '#991B1B' },
  win_douyin: { grad: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)', iconBg: '#7C3AED', text: '#5B21B6' },
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
  const card = PLATFORM_CARD[app.id] || PLATFORM_CARD.win_douyin;

  return (
    <Flex
      bg={card.grad}
      borderRadius="xl"
      p={3}
      px={4}
      align="center"
      justify="space-between"
      gap={3}
      cursor={app.running ? 'pointer' : 'default'}
      opacity={app.running ? 1 : 0.55}
      transition="all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
      boxShadow={
        isSelected
          ? `0 0 0 2px var(--chakra-colors-${platformColor}-400), 0 10px 22px -6px rgba(74,91,179,0.35)`
          : '0 4px 14px -6px rgba(15,23,42,0.18)'
      }
      _hover={
        app.running
          ? {
            transform: 'translateY(-3px)',
            boxShadow: '0 14px 28px -8px rgba(15,23,42,0.28)',
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
      <HStack spacing={3}>
        {/* 平台图标 + 环境标识 */}
        <Box position="relative">
          <Box
            p="7px"
            borderRadius="lg"
            bg="white"
            boxShadow="0 2px 6px rgba(15,23,42,0.12)"
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
            <Text fontSize="13px" fontWeight="700" color={card.text}>
              {platformLabel}
            </Text>
          </HStack>
          <HStack spacing={1} mt="1px">
            {/* 在线/离线状态点 */}
            <Box
              w="6px"
              h="6px"
              borderRadius="full"
              bg={app.running ? 'green.500' : 'gray.400'}
              className={app.running ? 'pulse-dot' : ''}
            />
            <Text fontSize="11px" color={app.running ? 'green.700' : 'gray.500'} fontWeight={600}>
              {app.running ? '在线' : '离线'}
            </Text>
          </HStack>
        </Box>
      </HStack>

      {/* 设置按钮 */}
      <Tooltip label={`设置 ${platformLabel} 平台`}>
        <IconButton
          variant="solid"
          aria-label={`设置 ${platformLabel} 平台`}
          fontSize="14px"
          size="sm"
          icon={<SettingsIcon />}
          bg="white"
          color={card.iconBg}
          _hover={{ bg: 'whiteAlpha.800', transform: 'scale(1.08)' }}
          boxShadow="0 2px 6px rgba(15,23,42,0.12)"
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
