import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { KnowledgeSubKey, KNOWLEDGE_SUB_ITEMS } from './AppSidebar';

/* ── Props ── */
interface KnowledgeSubSidebarProps {
  activeSub: KnowledgeSubKey;
  onSubChange: (key: KnowledgeSubKey) => void;
}

/**
 * 知识管理子侧栏 —— 当主导航选中"知识管理"时，显示在图标侧边栏右侧
 *
 * 对齐 intro2 / intro3 设计稿中的第二列子菜单：
 *   商品问答库（高亮）
 *   店铺知识库
 *   行业相关配置
 *   时效管理
 *   问答语料测试
 */
const KnowledgeSubSidebar: React.FC<KnowledgeSubSidebarProps> = ({
  activeSub,
  onSubChange,
}) => {
  return (
    <Flex
      direction="column"
      w="216px"
      bg="#FFFFFF"
      borderRight="1px solid"
      borderColor="#E8ECF3"
      flexShrink={0}
      h="full"
      pt={6}
      px={3}
    >
      {/* 子菜单标题 */}
      <Text
        px={3}
        pb={1}
        fontSize="15px"
        fontWeight={800}
        color="gray.700"
        letterSpacing="-0.01em"
      >
        知识资产
      </Text>
      <Text px={3} pb={4} fontSize="11px" color="gray.400">可查看、导出并编辑每一条知识</Text>

      {/* 子菜单项列表 */}
      <Flex direction="column" gap={1}>
        {KNOWLEDGE_SUB_ITEMS.map((item) => {
          const isActive = item.key === activeSub;

          return (
            <Box
              as="button"
              key={item.key}
              onClick={() => onSubChange(item.key)}
              display="flex"
              alignItems="center"
              w="full"
              h="42px"
              px={3}
              borderRadius="10px"
              transition="all 0.15s ease"
              cursor="pointer"
              outline="none"
              _focusVisible={{
                boxShadow: '0 0 0 2px rgba(66, 99, 235, 0.35)',
              }}
              /* 激活态：深蓝底 + 白字 + 左侧粗指示条 */
              bg={isActive ? '#EEF3FF' : 'transparent'}
              color={isActive ? '#3854B7' : 'gray.600'}
              _hover={
                isActive
                  ? {}
                  : { bg: 'gray.50', color: 'gray.800' }
              }
              position="relative"
              {...(isActive && {
                _before: {
                  content: '""',
                  position: 'absolute',
                  left: '0', top: '9px', bottom: '9px', w: '3px',
                  borderRadius: '0 3px 3px 0', bg: '#5B7CFA',
                },
              })}
            >
              {/* 圆点装饰（非激活态时显示小圆点） */}
              {!isActive && (
                <Box
                  w="6px"
                  h="6px"
                  rounded="full"
                  bg={isActive ? 'white' : 'gray.300'}
                  mr={2.5}
                  flexShrink={0}
                  transition="all 0.15s"
                />
              )}
              <Text
                fontSize="13px"
                fontWeight={isActive ? 700 : 550}
                lineHeight={1}
                whiteSpace="nowrap"
              >
                {item.label}
              </Text>
            </Box>
          );
        })}
      </Flex>
    </Flex>
  );
};

export default React.memo(KnowledgeSubSidebar);
