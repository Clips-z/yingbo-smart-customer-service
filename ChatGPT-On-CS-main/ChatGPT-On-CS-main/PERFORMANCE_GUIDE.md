# 性能优化指南 — 懒人客服

> 针对本项目的性能瓶颈和优化方案

## 🔍 性能诊断

### 第一步：找到瓶颈

```bash
# 1. 渲染进程性能
# Chrome DevTools → Performance → Record
# 重点看：Long Tasks（红色三角）、React 重渲染

# 2. 主进程性能
# Electron → Task Manager（类似 Chrome 任务管理器）
# 看哪个进程 CPU/内存异常

# 3. 数据库性能
# 打开 SQLite 慢查询日志
```

---

## ⚡ 已识别的性能问题 & 修复

### 1. React Query cacheTime 配置错误

**文件**: `src/renderer/dataview-window/App.tsx`

```tsx
// ❌ 现有代码
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      cacheTime: 10,  // 单位？毫秒还是秒？实际只有 10ms！
    },
  },
});

// ✅ 修复（React Query v4+ 用 gcTime）
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,     // 5分钟垃圾回收时间
      staleTime: 30 * 1000,       // 30秒内数据视为新鲜，不重新请求
      refetchOnWindowFocus: false,
      retry: 1,                    // 失败只重试1次
    },
  },
});
```

### 2. 数据库缺少索引（消息表查询慢）

**文件**: `src/main/backend/entities/message.ts`

```ts
// ✅ 添加索引
export function initMessage(sequelize: Sequelize) {
  Message.init({
    // ... 其他字段
    session_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      index: true,  // ← 加这行
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      index: true,  // ← 加这行（排序用）
    },
  }, {
    indexes: [
      // 复合索引：按会话+时间查询（最常见查询）
      {
        name: 'idx_session_created',
        fields: ['session_id', 'created_at'],
      },
    ],
  });
}
```

### 3. OCR 采集卡顿（主线程阻塞）

**问题**: `qianniu_rapidocr.py` / `wechat-sidecar.py` 同步执行，阻塞 Electron 主进程

**方案**: 用 Worker 线程或子进程

```ts
// ✅ 主进程：用 child_process 执行 OCR，不阻塞
import { spawn } from 'child_process';

export function runOCR(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = spawn('python', ['scripts/ocr_worker.py', imagePath]);
    let result = '';
    worker.stdout.on('data', (data) => { result += data; });
    worker.on('close', (code) => {
      if (code === 0) resolve(result.trim());
      else reject(new Error(`OCR failed: ${code}`));
    });
  });
}
```

### 4. 大型列表不虚拟滚动

**问题**: 消息历史/关键词列表数据多时卡顿

**方案**: 用 `react-window` 虚拟滚动

```tsx
import { FixedSizeList } from 'react-window';

// ✅ 虚拟滚动列表（只渲染可见区域）
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={messages.length}
      itemSize={80}  // 每条消息高度
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>  {/* style 是绝对定位，必须传 */}
          <MessageItem message={messages[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

## 📊 内存泄漏检查清单

- [ ] `setInterval` / `setTimeout` 在组件卸载时清理
- [ ] EventEmitter 的 `listener` 有对应的 `removeListener`
- [ ] Socket.io 连接断开时清理
- [ ] IPC 监听器在窗口关闭时移除

```ts
// ✅ 正确的清理方式
useEffect(() => {
  const timer = setInterval(fn, 1000);
  return () => clearInterval(timer);  // 必须清理
}, []);

// ✅ IPC 清理
useEffect(() => {
  const handler = (event: IpcRendererEvent, data: any) => { };
  ipcRenderer.on('channel', handler);
  return () => { ipcRenderer.removeListener('channel', handler); };
}, []);
```

---

## 🎯 性能预算

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 应用启动时间 | < 3秒 | `Date.now()` 打点 |
| 消息列表首屏渲染 | < 500ms | React DevTools Profiler |
| OCR 识别耗时 | < 2秒 | `performance.now()` |
| 内存占用（空闲） | < 200MB | Chrome Task Manager |
| 内存占用（工作） | < 500MB | Chrome Task Manager |
