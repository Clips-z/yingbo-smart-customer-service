import { extendTheme } from '@chakra-ui/react';
import colors from './colors';
import { tableTheme } from './foundations/Table';
import { iconButtonTheme } from './foundations/IconButton';

const theme = extendTheme({
  styles: {
    global: {
      'html, body': {
        bg: '#F4F6FA',
        fontSize: 'md',
        fontWeight: 400,
        height: '100%',
        color: '#182230',
        fontFamily: `"IBM Plex Sans", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`,
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
    sm: '8px',
    md: '12px',
    lg: '20px',
    xl: '24px',
    '2xl': '28px',
    ui: {
      panel: '16px',
      control: '10px',
    },
  },
  colors: {
    ...colors,
    ui: {
      canvas: '#F4F6FA',
      panel: '#FFFFFF',
      ink: '#182230',
      muted: '#667085',
      border: '#E6EAF0',
      accent: '#4667D9',
      accentSoft: '#EEF2FF',
      navy: '#101828',
    },
  },
  semanticTokens: {},
  components: {
    Table: tableTheme,
    IconButton: iconButtonTheme,
    // 全局 Button 样式优化
    Button: {
      baseStyle: {
        fontWeight: 650,
        borderRadius: '10px',
        transition: 'all 150ms ease',
        _focusVisible: {
          boxShadow: '0 0 0 3px rgba(70, 103, 217, .22)',
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
      baseStyle: {
        field: {
          borderRadius: '10px',
          bg: 'white',
        },
      },
      defaultProps: {
        focusBorderColor: 'brand.400',
      },
    },
    Select: {
      baseStyle: {
        field: {
          borderRadius: '10px',
          bg: 'white',
        },
      },
      defaultProps: {
        focusBorderColor: 'brand.400',
      },
    },
    Textarea: {
      baseStyle: {
        borderRadius: '10px',
        bg: 'white',
      },
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
  shadows: {
    sm: '0 1px 2px rgba(16, 24, 40, .04)',
    md: '0 6px 18px rgba(16, 24, 40, .06)',
    lg: '0 14px 32px rgba(16, 24, 40, .09)',
    xl: '0 20px 44px rgba(16, 24, 40, .12)',
    ui: {
      panel: '0 1px 2px rgba(16, 24, 40, .025), 0 8px 24px rgba(16, 24, 40, .035)',
      floating: '0 16px 36px rgba(16, 24, 40, .14)',
    },
  },
});

export default theme;
