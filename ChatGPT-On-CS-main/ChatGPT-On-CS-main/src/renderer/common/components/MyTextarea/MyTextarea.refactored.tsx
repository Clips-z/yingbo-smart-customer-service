/**
 * 重构后的 MyTextarea 组件
 *
 * 改进点：
 * 1. 类型定义清晰（移除 @ts-ignore）
 * 2. 移除多余的 Fragment wrapper
 * 3. 正确的 forwardRef 使用
 * 4. 可选链的整洁写法
 * 5. displayName 显式设置（DevTools 显示组件名）
 */
import React, { forwardRef, useState, useEffect, useCallback } from 'react';
import { Box, Text, Textarea, TextareaProps } from '@chakra-ui/react';

export interface MyTextareaProps extends Omit<TextareaProps, 'onChange'> {
  /** 输入框标题（可选） */
  title?: string;
  /** 最大字符数（可选，设置后显示计数） */
  maxLength?: number;
  /** 是否显示字符计数（默认 true，当设置了 maxLength 时） */
  showCount?: boolean;
  /** 值变化回调 */
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** 默认值 */
  defaultValue?: string;
}

/**
 * 增强版 Textarea 组件
 *
 * @example
 * // 基础用法
 * <MyTextarea placeholder="请输入..." />
 *
 * // 带字符计数
 * <MyTextarea maxLength={500} showCount />
 *
 * // 受控模式
 * <MyTextarea value={content} onChange={handleChange} />
 *
 * // 带 ref（用于聚焦等）
 * const ref = useRef<HTMLTextAreaElement>(null);
 * <MyTextarea ref={ref} />
 */
const MyTextarea = forwardRef<HTMLTextAreaElement, MyTextareaProps>(
  (
    {
      title,
      maxLength,
      showCount = true,
      value,
      defaultValue,
      onChange,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
    // 内部状态：跟踪字符数
    const [charCount, setCharCount] = useState(() => {
      if (value !== undefined) return typeof value === 'string' ? value.length : 0;
      if (defaultValue !== undefined) return defaultValue.length;
      return 0;
    });

    // 同步外部 value 变化
    useEffect(() => {
      if (value !== undefined && typeof value === 'string') {
        setCharCount(value.length);
      }
    }, [value]);

    // 变化处理（用 useCallback 避免子组件重渲染）
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setCharCount(e.target.value.length);
        onChange?.(e);
      },
      [onChange],
    );

    // 计算是否接近上限（视觉提示）
    const isNearLimit = maxLength && charCount > maxLength * 0.9;

    return (
      <Box position="relative" w="100%" h="100%">
        {/* 标题 */}
        {title && (
          <Text fontSize="sm" fontWeight="medium" mb={1} color="gray.600">
            {title}
          </Text>
        )}

        {/* Textarea 本体 */}
        <Textarea
          ref={ref}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          {...props}
        />

        {/* 字符计数 */}
        {showCount && maxLength && (
          <Text
            fontSize="xs"
            position="absolute"
            right={3}
            bottom={3}
            color={isNearLimit ? 'orange.500' : 'gray.400'}
            pointerEvents="none"  {/* 不阻挡点击 */}
          >
            {charCount} / {maxLength}
          </Text>
        )}
      </Box>
    );
  },
);

// 显式设置 displayName（React DevTools 中显示）
MyTextarea.displayName = 'MyTextarea';

export default React.memo(MyTextarea);
