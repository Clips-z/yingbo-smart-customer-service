module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // ===== 严格 TypeScript 规则 =====
    '@typescript-eslint/no-explicit-any': 'error',           // 禁止 any
    '@typescript-eslint/no-unused-vars': ['error', {        // 未使用变量
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    '@typescript-eslint/explicit-function-return-type': 'off', // 允许推断
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-var-requires': 'error',          // 禁止 require

    // ===== React 规则 =====
    'react/react-in-jsx-scope': 'off',                     // 不需要 import React
    'react/prop-types': 'off',                              // 用 TypeScript
    'react-hooks/rules-of-hooks': 'error',                 // Hook 规则
    'react-hooks/exhaustive-deps': 'warn',                 // Hook 依赖检查

    // ===== 代码质量规则 =====
    'no-console': ['warn', { allow: ['warn', 'error'] }],  // 禁止 console.log
    'no-unused-expressions': 'error',
    'no-return-await': 'error',                            // 不需要 return await
    'prefer-const': 'error',                               // 用 const
    'no-async-promise-executor': 'error',                  // Promise 构造函数

    // ===== Electron 特殊规则 =====
    'no-restricted-globals': ['error', {
      name: 'require',
      message: '在渲染进程中使用 import 而不是 require',
    }],
  },
  overrides: [
    // 主进程：可以用 require，Node API 允许 console
    {
      files: ['src/main/**/*.{ts,js}'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'no-console': 'off',
      },
    },
    // 测试文件放宽规则
    {
      files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-console': 'off',
      },
    },
  ],
};
