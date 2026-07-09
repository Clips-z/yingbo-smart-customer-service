import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';

export default [
  // 全局忽略
  {
    ignores: [
      'node_modules/**',
      'release/**',
      '.erb/dll/**',
      '**/*.css.d.ts',
      '**/*.sass.d.ts',
      '**/*.scss.d.ts',
      'coverage/**',
      'dist/**',
    ],
  },

  // TypeScript / TSX 文件
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', '*.ts', '*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      'no-shadow': 'off',
      'no-dupe-class-members': 'off',

      // React
      'react/react-in-jsx-scope': 'off',
      'react/jsx-filename-extension': 'off',
      'react/function-component-definition': 'off',
      'react/jsx-curly-brace-presence': 'off',
      'react/require-default-props': 'off',
      'react/jsx-props-no-spreading': 'off',
      'react/destructuring-assignment': 'off',
      'react/jsx-no-useless-fragment': 'off',
      'react/no-array-index-key': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import
      'import/no-extraneous-dependencies': 'off',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
      'import/no-import-module-exports': 'off',
      'import/no-named-as-default': 'off',
      'import/prefer-default-export': 'off',

      // General
      'no-console': 'off',
      'max-classes-per-file': 'off',
      'no-continue': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      camelcase: 'off',
      'no-use-before-define': 'off',
      'class-methods-use-this': 'off',
      'prefer-promise-reject-errors': 'off',
      'no-promise-executor-return': 'off',
      'promise/no-promise-in-callback': 'off',
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },

  // JavaScript 文件（脚本等）
  {
    files: ['*.js', '*.cjs', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'warn',
    },
  },
];
