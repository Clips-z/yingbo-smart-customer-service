# 代码审查 Checklist

> 每次 PR 合并前，审查者按此清单逐项确认。

## 📋 使用方式

- [ ] 逐项勾选，未通过的项必须修改后才可合并
- 严重项（🔴）未通过 = 直接打回
- 建议项（🟡）未通过 = 评论说明原因可合并

---

## 🔴 严重项（必须修复）

### TypeScript 类型安全
- [ ] 没有 `any` 类型（用 `unknown` + 类型守卫替代）
- [ ] 没有 `@ts-ignore` 注释（有则说明类型设计有问题）
- [ ] 所有 API 响应都有明确的接口定义（不用 `data: any`）
- [ ] IPC 通信有类型定义文件（`src/shared/types/ipc.ts`）

### 错误处理
- [ ] 所有 Promise 都有 `.catch` 或有 `try/catch`
- [ ] 没有空的 catch 块（至少要有日志）
- [ ] 用户操作失败时有明确提示（不用 `alert`，用 Toast/Message 组件）
- [ ] 主进程错误写入日志文件（不用 `console.error` 只在终端显示）

### 性能
- [ ] 数据库查询字段有索引（特别是 WHERE、JOIN、ORDER BY 的字段）
- [ ] 列表有分页或虚拟滚动（超过 100 条数据）
- [ ] 没有在 render 中创建新对象/数组（会导致子组件重渲染）
- [ ] 事件监听器在组件卸载时清理（useEffect 返回清理函数）

### 安全
- [ ] 没有把 API Key / Secret 写在代码里（用环境变量）
- [ ] 渲染进程接收到的 HTML 内容用 `dangerouslySetInnerHTML` 时有过滤
- [ ] 没有启用 Node.js 集成（`nodeIntegration: false`）

---

## 🟡 建议项（最好修复）

### 代码风格
- [ ] 函数/变量名表达意图，不写注释也能看懂
- [ ] 没有超过 100 行的函数（拆分成多个小函数）
- [ ] 没有超过 300 行的文件（拆分成多个模块）
- [ ] 魔法数字用常量替代（`setTimeout(fn, 5000)` → `setTimeout(fn, TIMEOUT_MS)`）

### React 最佳实践
- [ ] 组件用 `React.memo` 包裹（尤其是列表项）
- [ ] 事件处理函数用 `useCallback` 包裹（传给子组件的）
- [ ] 计算值用 `useMemo` 包裹（昂贵计算）
- [ ] 没有在 JSX 中直接 `array.map()` 时没有 `key`

### Electron 最佳实践
- [ ] 主进程和渲染进程通信用 `ipcMain.handle` / `ipcRenderer.invoke`（不用 `send` + `on`）
- [ ] 渲染进程不直接访问 Node API（通过预加载脚本暴露）
- [ ] 大型依赖（如 `sqlite3`）放在主进程，渲染进程通过 API 访问

---

## 📏 日志规范

```typescript
// ✅ 好的日志
logger.info('[Keyword] 创建关键词', { platform: 'wechat', keyword: 'hello' });
logger.error('[OCR] 识别失败', { error: err.message, platform: 'qianniu' });

// ❌ 不好的日志
console.log('error');                     // 没有上下文
console.error(err);                       // 对象不好搜索
console.log('关键词创建成功');             // 没有结构化数据
```

---

## 📦 Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 新增关键词批量导入功能
fix: 修复千牛 OCR 识别超时导致应用卡死
refactor: 重构 API 请求层，统一错误处理
perf: 优化消息列表渲染性能，添加虚拟滚动
fix!: 修改 API 响应格式（breaking change）
```

常用前缀：
- `feat:` 新功能
- `fix:` Bug 修复
- `refactor:` 重构（不改变行为的代码改动）
- `perf:` 性能优化
- `style:` 代码格式（不改变逻辑）
- `test:` 测试相关
- `docs:` 文档更新
- `chore:` 构建/工具链改动
