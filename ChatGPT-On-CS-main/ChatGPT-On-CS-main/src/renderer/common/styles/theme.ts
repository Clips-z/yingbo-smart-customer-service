import { extendTheme } from '@chakra-ui/react';
import colors from './colors';
import { tableTheme } from './foundations/Table';
import { iconButtonTheme } from './foundations/IconButton';

const theme = extendTheme({
  styles: {
    global: {
      'html, body': {
        bg: 'gray.50',
        fontSize: 'md',
        fontWeight: 400,
        height: '100%',
        fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif`,
      },
      a: {
        color: 'brand.500',
        padding: '0',
      },
      // 全局滚动条样式
      '*::-webkit-scrollbar': {
        width: '6px',
        height: '6px',
      },
      '*::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '*::-webkit-scrollbar-thumb': {
        background: 'gray.300',
        borderRadius: '3px',
        '&:hover': {
          background: 'gray.400',
        },
      },
    },
  },
  borders: {
    base: '1px solid #E2E8F0',
  },
  radii: {
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '20px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
  },
  colors: {
    ...colors,
  },
  components: {
    Table: tableTheme,
    IconButton: iconButtonTheme,
    // 全局 Button 样式优化
    Button: {
      baseStyle: {
        fontWeight: 500,
        borderRadius: 'md',
        _focus: {
          boxShadow: 'none',
        },
      },
      sizes: {
        xs: {
          fontSize: '11px',
          px: 3,
          py: 1,
        },
      },
    },
    // 全局 Badge 样式优化
    Badge: {
      baseStyle: {
        borderRadius: 'sm',
        fontWeight: 600,
        textTransform: 'none',
        letterSpacing: '0',
      },
    },
    // 全局 Input / Select / Textarea 样式
    Input: {
      defaultProps: {
        focusBorderColor: 'brand.400',
      },
    },
    Select: {
      defaultProps: {
        focusBorderColor: 'brand.400',
      },
    },
    Textarea: {
      defaultProps: {
        focusBorderColor: 'brand.400',
      },
    },
    // Tabs 样式优化
    Tabs: {
      baseStyle: {
        tab: {
          _selected: {
            fontWeight: 600,
          },
        },
      },
    },
  },
});

export default theme;
