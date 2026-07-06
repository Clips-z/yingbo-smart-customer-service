# 🚀 团队技术提升方案 — 懒人客服项目

> 负责人：Senior Developer (高级开发工程师)
> 日期：2026-07-05
> 目标：3 个月内将团队代码质量提升到生产级标准

---

## 📊 当前状态评估

| 维度 | 评分 | 主要问题 |
|------|------|---------|
| TypeScript 类型安全 | ⭐⭐ | 大量 `any`，`@ts-ignore` 滥用 |
| 错误处理 | ⭐⭐ | 不统一，缺少结构化错误类型 |
| 性能 | ⭐⭐ | 数据库无索引，React Query 配置错误 |
| 代码规范 | ⭐ | 无 ESLint，无统一风格 |
| 测试 | ⭐ | 无单元测试，无 E2E 测试 |
| 文档 | ⭐⭐ | 代码注释少，无架构文档 |

---

## 🎯 三阶段提升路线

### 第一阶段（第 1-2 周）：基础规范建设 ✅

**目标**：建立代码规范，防止问题继续产生

- [x] ESLint 严格配置（`.eslintrc.cjs`）
- [x] TypeScript 严格模式（`tsconfig.json`）
- [x] 代码审查 Checklist（`CODE_REVIEW_CHECKLIST.md`）
- [x] 性能优化指南（`PERFORMANCE_GUIDE.md`）
- [ ] 安装并启用 ESLint Pre-commit Hook

```bash
# 安装 ESLint + Pre-commit Hook
cd ChatGPT-On-CS-main
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks
npm install -D husky lint-staged
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

`.lintstagedrc.json`:
```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{js,jsx}": ["eslint --fix", "prettier --write"]
}
```

---

### 第二阶段（第 3-6 周）：关键代码重构 🔧

**目标**：修复已识别的严重问题

#### 任务 1：修复 React Query 配置
**文件**：`src/renderer/dataview-window/App.tsx`
```tsx
// 修改 QueryClient 配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,   // 5分钟
      staleTime: 30 * 1000,    // 30秒内不重新请求
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

#### 任务 2：数据库加索引
**文件**：`src/main/backend/entities/message.ts`、`session.ts`
```ts
// Message 表
indexes: [{ name: 'idx_session_created', fields: ['session_id', 'created_at'] }]

// Session 表
indexes: [{ name: 'idx_platform_status', fields: ['platform', 'status'] }]
```

#### 任务 3：统一 API 请求层
**文件**：`src/renderer/common/services/common/api/request.ts`
→ 替换为提供的重构版本（见下方 `refactored-request.ts` 示例）

#### 任务 4：修复竞态条件
**文件**：`src/main/utils/index.ts`
```ts
export const getTempPath = () => {
  const logDir = path.join(os.tmpdir(), 'chatgpt-on-cs');
  fs.mkdirSync(logDir, { recursive: true });
  return logDir;
};
```

---

### 第三阶段（第 7-12 周）：工程化建设 🏗️

**目标**：建立自动化质量保障

#### 1. 单元测试
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/renderer/test/setup.ts',
  },
});
```

#### 2. 日志系统统一
创建 `src/shared/utils/logger.ts`：
```ts
// 渲染进程用
export const logger = {
  info: (module: string, message: string, data?: unknown) => {
    console.log(`[${module}] ${message}`, data ? data : '');
  },
  error: (module: string, message: string, error?: unknown) => {
    console.error(`[${module}] ${message}`, error);
    // 可选：发送到主进程写入文件
  },
};
```

#### 3. IPC 类型安全
创建 `src/shared/types/ipc.ts`：
```ts
// 统一的 IPC 通信类型定义
export interface IpcChannels {
  'ocr:start': { imagePath: string };  // → string (识别结果)
  'ocr:stop': void;                     // → void
  'platform:status': { platform: string }; // → PlatformStatus
  // ... 所有 IPC 通道在这里定义
}

// 使用时：ipcRenderer.invoke<T>(channel, data)
```

---

## 📚 团队学习计划

### 每周技术分享（1小时）

| 周次 | 主题 | 内容 |
|------|------|------|
| W1 | TypeScript 高级类型 | 泛型、类型守卫、utility types |
| W2 | React 性能优化 | memo、useMemo、useCallback、虚拟滚动 |
| W3 | Node.js 异步编程 | Promise、async/await、错误处理最佳实践 |
| W4 | Electron 架构 | 主进程/渲染进程通信、安全模型 |
| W5 | 数据库优化 | 索引设计、查询优化、SQLite 最佳实践 |
| W6 | 代码审查技巧 | 怎么写评论、常见反模式识别 |

---

## 📏 成功指标

| 指标 | 当前 | 3个月目标 |
|------|------|----------|
| ESLint 错误数 | ~200 | 0 |
| TypeScript `any` 数量 | 大量 | < 5 |
| 单元测试覆盖 | 0% | > 60% |
| 首屏加载时间 | ? | < 3秒 |
| 崩溃率 | ? | < 1% |

---

## 🛠️ 立即行动项

1. **今天**：安装 ESLint，运行 `npx eslint src/ --ext .ts,.tsx` 看当前有多少错误
2. **本周**：修复 `request.ts` 和 `App.tsx` 的严重问题
3. **下周**：建立代码审查流程，每次 PR 必须有人 review

---

## 📞 需要帮助？

遇到以下情况立即找资深开发指导：
- 重构时不确定怎么设计类型
- 性能问题无法定位瓶颈
- 架构设计拿不准方案
- 代码审查中发现不确定的问题
