# 代码审查标准与流程 — 迎波智能客服

> 版本：1.0 | 更新日期：2026-07-05
> 适用范围：ChatGPT-On-CS 全部 TypeScript/JavaScript/Python 代码

---

## 目录

1. [审查流程总览](#1-审查流程总览)
2. [PR 提交规范](#2-pr-提交规范)
3. [严重级别定义](#3-严重级别定义)
4. [审查检查清单](#4-审查检查清单)
5. [技术栈专项规则](#5-技术栈专项规则)
6. [审查评论规范](#6-审查评论规范)
7. [自动化工具链](#7-自动化工具链)
8. [审查者轮值机制](#8-审查者轮值机制)
9. [度量指标](#9-度量指标)

---

## 1. 审查流程总览

```
开发者提交 PR → 自动化检查（ESLint + tsc + 测试）
                        ↓ 通过
                  人工审查（至少 1 人）
                        ↓
              🔴 Blocker  → 必须修复
              🟡 Suggestion → 讨论后决定
              💭 Nit       → 可忽略
                        ↓ 全部 Blocker 解决
                    合并到主分支
```

### 核心原则

- **小步快跑**：单个 PR 不超过 400 行改动，大功能拆分多个 PR
- **自动化优先**：ESLint/TypeScript 能捕获的问题不浪费人工审查时间
- **对事不对人**：审查评论针对代码，不针对开发者
- **及时响应**：PR 提交后 24 小时内开始审查，审查意见 24 小时内响应

---

## 2. PR 提交规范

### PR 标题格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

feat(qianniu): 新增千牛 OCR 批量识别模式
fix(react-query): 修复 cacheTime 配置导致数据频繁失效
refactor(request): 统一 API 请求层错误处理
perf(message-list): 添加虚拟滚动优化大数据量渲染
```

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | 新增企微平台自动回复 |
| `fix` | Bug 修复 | 修复 sqlite3 N-API 版本不兼容 |
| `refactor` | 重构（不改行为） | 提取公共 API 请求方法 |
| `perf` | 性能优化 | 消息表添加复合索引 |
| `style` | 格式调整 | 统一缩进为 2 空格 |
| `test` | 测试相关 | 补充关键词匹配单元测试 |
| `docs` | 文档更新 | 更新部署说明 |
| `chore` | 构建/工具链 | 升级 electron 到 26.2.1 |

### PR 描述模板

```markdown
## 改动说明
<!-- 一句话说清楚做了什么 -->

## 改动类型
- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 重构 (refactor)
- [ ] 性能优化 (perf)
- [ ] 其他

## 关联 Issue
<!-- #issue_number -->

## 测试方式
<!-- 怎么验证这个改动是正确的 -->
1. 启动应用
2. 进入 XX 页面
3. 操作 XX
4. 预期结果：XX

## 自查清单
- [ ] 本地 ESLint 无报错（`npm run lint`）
- [ ] TypeScript 编译无报错（`npx tsc --noEmit`）
- [ ] 已添加/更新相关测试
- [ ] 没有引入新的 `any` 类型
- [ ] 没有在代码中硬编码 API Key / Secret
- [ ] 如有 Breaking Change，已在描述中标注
```

### PR 大小限制

| 改动行数 | 处理方式 |
|----------|---------|
| < 100 行 | 审查者快速审查，5-10 分钟 |
| 100-400 行 | 标准审查，15-30 分钟 |
| 400-800 行 | 建议拆分，审查者需 30-60 分钟 |
| > 800 行 | 必须拆分，否则拒绝审查 |

---

## 3. 严重级别定义

### 🔴 Blocker（必须修复，不修不合）

问题会导致功能异常、安全漏洞、数据丢失或崩溃，必须在合并前修复。

| 类别 | 具体表现 |
|------|---------|
| 安全漏洞 | SQL 注入、XSS、硬编码密钥、未校验的外部输入 |
| 数据风险 | 数据丢失、竞态条件写文件、数据库无事务保护 |
| 崩溃风险 | 空指针解引用、未捕获的 Promise rejection |
| API 破坏 | 修改了已有 API 的请求/响应格式且未向后兼容 |
| 错误处理缺失 | 关键路径（API 调用、数据库操作、文件读写）没有 try/catch |
| 类型安全 | 使用 `any` 绕过类型检查、`@ts-ignore` 压制错误 |
| Electron 安全 | `nodeIntegration: true`、`contextIsolation: false` |

### 🟡 Suggestion（建议修复，讨论后决定）

问题不会立即导致故障，但会影响可维护性、性能或代码质量。审查者说明原因后可以合并，但应尽快修复。

| 类别 | 具体表现 |
|------|---------|
| 输入校验 | 前端表单未校验、API 参数未验证范围 |
| 命名问题 | 变量/函数名无法表达意图（如 `data2`、`handleX`） |
| 测试缺失 | 新功能/关键逻辑没有对应测试 |
| 性能问题 | N+1 查询、渲染中创建新对象、大列表未虚拟滚动 |
| 代码重复 | 相同逻辑出现 3 处以上，应提取公共方法 |
| 数据库 | 查询字段无索引、全表扫描 |
| React | 缺少 `key`、useEffect 依赖不完整、缺少 memo |

### 💭 Nit（建议考虑，可忽略）

纯风格偏好或微小改进，不影响功能和质量。

| 类别 | 具体表现 |
|------|---------|
| 风格一致性 | 与项目现有风格不一致（但 ESLint 未覆盖） |
| 命名微调 | 局部变量名可以更精准 |
| 文档补充 | 公共方法缺少 JSDoc |
| 替代方案 | 有另一种实现方式值得一考虑 |

---

## 4. 审查检查清单

> 审查者逐项确认。Blocker 项不通过 = 直接打回。

### 4.1 TypeScript 类型安全

- [ ] 没有 `any` 类型（用 `unknown` + 类型守卫替代）
- [ ] 没有 `@ts-ignore` / `@ts-nocheck` 注释
- [ ] 所有 API 响应有明确的 interface 定义（不用 `data: any`）
- [ ] IPC 通信有类型定义（`src/shared/types/ipc.ts`）
- [ ] 函数参数和返回值有显式类型标注（复杂函数）
- [ ] 泛型使用合理，不过度抽象

```typescript
// ❌ Blocker: 使用 any
function processData(data: any) {
  return data.results.map((item: any) => item.name);
}

// ✅ 正确: 明确类型
interface ApiResponse {
  results: { name: string }[];
}
function processData(data: ApiResponse): string[] {
  return data.results.map((item) => item.name);
}
```

### 4.2 错误处理

- [ ] 所有 Promise 有 `.catch()` 或被 `try/catch` 包裹
- [ ] catch 块不为空（至少记录日志）
- [ ] 用户操作失败时有明确的 UI 提示（Toast/Message，不用 `alert`）
- [ ] 主进程错误写入日志文件（用 `electron-log`，不只 `console.error`）
- [ ] API 请求层统一处理网络错误和超时
- [ ] 定时任务（cron）有异常兜底，不会因一次失败而停止

```typescript
// ❌ Blocker: 未捕获的 rejection + 空 catch
async function fetchMessages() {
  const data = await api.getMessages(); // 无 try/catch
}

try {
  doSomething();
} catch (e) {
  // 空的 catch，问题被吞掉
}

// ✅ 正确: 完整的错误处理
async function fetchMessages(): Promise<Message[]> {
  try {
    const data = await api.getMessages();
    return data;
  } catch (err) {
    logger.error('[Message] 获取消息列表失败', { error: err });
    showToast('获取消息失败，请稍后重试', 'error');
    return [];
  }
}
```

### 4.3 安全

- [ ] 没有硬编码 API Key / Secret（用环境变量或 config.json）
- [ ] 渲染进程 `nodeIntegration: false`，`contextIsolation: true`
- [ ] 渲染进程接收 HTML 时用 DOMPurify 过滤后再渲染
- [ ] `dangerouslySetInnerHTML` 必须配合输入过滤
- [ ] SQL 查询用 Sequelize 参数化查询，不拼接 SQL 字符串
- [ ] IPC 通道校验来源，不接收未预期的渲染进程消息
- [ ] 用户敏感数据（聊天记录、API Key）不写入日志

```typescript
// ❌ Blocker: SQL 注入风险
const sql = `SELECT * FROM messages WHERE content LIKE '%${keyword}%'`;

// ✅ 正确: Sequelize 参数化
Message.findAll({
  where: { content: { [Op.like]: `%${keyword}%` } },
});
```

### 4.4 性能

- [ ] 数据库查询字段有索引（WHERE / JOIN / ORDER BY 字段）
- [ ] 列表超过 100 条时有分页或虚拟滚动
- [ ] React 组件 render 中不创建新对象/数组（会导致子组件重渲染）
- [ ] 事件监听器在组件卸载时清理（useEffect return 清理函数）
- [ ] setInterval / setTimeout 在组件卸载时清除
- [ ] Socket.IO / IPC 监听器在不需要时移除
- [ ] 大型计算用 `useMemo`，传给子组件的回调用 `useCallback`
- [ ] 图片/资源懒加载

```typescript
// ❌ Suggestion: render 中创建新对象
function Parent({ items }: { items: Item[] }) {
  return <Child config={{ color: 'red', size: 10 }} />; // 每次渲染都是新对象
}

// ✅ 正确: useMemo 稳定引用
function Parent({ items }: { items: Item[] }) {
  const config = useMemo(() => ({ color: 'red', size: 10 }), []);
  return <Child config={config} />;
}
```

### 4.5 React 最佳实践

- [ ] 列表渲染有唯一且稳定的 `key`（不用数组 index）
- [ ] useEffect 依赖数组完整（`react-hooks/exhaustive-deps`）
- [ ] 状态更新使用函数式更新（`setCount((prev) => prev + 1)`）
- [ ] 组件文件不超过 300 行，超过则拆分
- [ ] 共享逻辑提取为自定义 Hook
- [ ] React Query 的 `cacheTime` / `staleTime` 配置合理（单位是毫秒）

```typescript
// ❌ Blocker: cacheTime 配置错误（10ms 就被回收！）
const queryClient = new QueryClient({
  defaultOptions: { queries: { cacheTime: 10 } },
});

// ✅ 正确
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,    // 5 分钟
      staleTime: 30 * 1000,      // 30 秒
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

### 4.6 Electron 架构

- [ ] 主进程和渲染进程通信用 `ipcMain.handle` / `ipcRenderer.invoke`
- [ ] 渲染进程不直接访问 Node API（通过 preload 脚本暴露）
- [ ] 大型依赖（sqlite3、文件系统）在主进程，渲染进程通过 IPC 访问
- [ ] 新建 BrowserWindow 时配置安全选项
- [ ] 文件操作用 `fs.promises`（异步），不用 `fs.existsSync` + `fs.mkdirSync`（竞态）

```typescript
// ❌ Suggestion: 竞态条件
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir); // 两个进程同时判断不存在，都创建 → 报错
}

// ✅ 正确: recursive 模式，已存在不报错
import { promises as fs } from 'fs';
await fs.mkdir(logDir, { recursive: true });
```

### 4.7 代码风格

- [ ] 函数/变量名表达意图，不写注释也能看懂
- [ ] 函数不超过 100 行（超过则拆分）
- [ ] 文件不超过 300 行（超过则拆分模块）
- [ ] 魔法数字用常量替代
- [ ] 没有超过 3 层的嵌套（用提前 return 扁平化）

```typescript
// ❌ Nit: 魔法数字
setTimeout(retryFn, 5000);

// ✅ 正确
const RETRY_DELAY_MS = 5000;
setTimeout(retryFn, RETRY_DELAY_MS);
```

### 4.8 测试

- [ ] 新功能有对应测试
- [ ] Bug 修复有回归测试（先写复现测试，再修复）
- [ ] 关键业务逻辑（关键词匹配、消息转发、自动回复）有单元测试
- [ ] 测试覆盖正常路径 + 边界情况 + 错误情况

---

## 5. 技术栈专项规则

### 5.1 Sequelize / 数据库

| 规则 | 级别 | 说明 |
|------|------|------|
| 查询字段必须有索引 | 🟡 | WHERE / JOIN / ORDER BY 涉及的字段 |
| 禁止 `SELECT *` | 🟡 | 只查需要的字段：`findAll({ attributes: ['id', 'name'] })` |
| 写操作必须用事务 | 🔴 | 多表关联写入时 |
| 禁止拼接 SQL | 🔴 | 用 Sequelize 操作符 |
| 分页必须有 limit | 🟡 | `findAll({ limit: 50, offset: 0 })` |
| Entity 字段必须有 allowNull | 🟡 | 显式声明是否允许 null |

### 5.2 GPT Proxy 层（`src/main/gptproxy/`）

| 规则 | 级别 | 说明 |
|------|------|------|
| API Key 不硬编码 | 🔴 | 从 config.json 或环境变量读取 |
| 流式响应有超时保护 | 🔴 | 防止 API 无响应导致 hang |
| 不同供应商的错误码统一映射 | 🟡 | 统一返回 OpenAI 兼容格式 |
| 请求重试有退避策略 | 🟡 | 指数退避，最多 3 次 |

### 5.3 Python 采集脚本（`scripts/`）

| 规则 | 级别 | 说明 |
|------|------|------|
| OCR/采集脚本有超时机制 | 🔴 | 防止永久阻塞 Electron 主进程 |
| 异常不直接 exit | 🟡 | 返回错误码，由 Node 侧处理 |
| 路径参数校验 | 🟡 | 防止路径遍历攻击 |
| 日志输出结构化 | 💭 | 便于 Node 侧解析 |

### 5.4 RAG 服务（`rag-server/`）

| 规则 | 级别 | 说明 |
|------|------|------|
| API Key 从 config.json 读取 | 🔴 | 不硬编码 |
| 向量数据库操作有异常处理 | 🔴 | ChromaDB 连接失败不崩溃 |
| 分块参数可配置 | 🟡 | chunk_size、overlap 不硬编码 |
| 健康检查端点 | 🟡 | `/health` 返回服务状态 |

---

## 6. 审查评论规范

### 评论格式

```
<级别图标> **<类别>: <问题概述>**
<文件:行号>: <具体问题描述>

**原因:** <为什么这是问题>

**建议:** <具体的修复方案，最好有代码示例>
```

### 示例评论

**Blocker 示例：**

```
🔴 **安全: API Key 硬编码**
src/main/gptproxy/qwen/resources/chat.ts:15

API Key 直接写在代码中：`const apiKey = 'sk-xxx'`

**原因:** 代码提交到 Git 后，任何有仓库访问权限的人都能看到 Key。即使后续删除，Git 历史中仍可追溯。

**建议:** 从 config.json 读取：
```ts
const config = require('../../config.json');
const apiKey = config.siliconflow_api_key;
```
```

**Suggestion 示例：**

```
🟡 **性能: 数据库查询缺少索引**
src/main/backend/entities/message.ts

Message 表的 `session_id` 和 `created_at` 字段没有索引，但消息列表查询会按这两个字段过滤和排序。

**原因:** 数据量增大后，每次查询都是全表扫描，消息列表加载会越来越慢。

**建议:** 添加复合索引：
```ts
{
  indexes: [{
    name: 'idx_session_created',
    fields: ['session_id', 'created_at'],
  }],
}
```
```

**Nit 示例：**

```
💭 **可读性: 变量名建议**
src/main/utils/index.ts:18

`emitAndWait` 函数中 `let response` 可以命名为 `socketResponse`，更明确来源。

只是建议，不阻塞合并。
```

### 评论礼仪

- **先肯定好的部分**：发现好的设计/实现，先说 "这里用 XX 模式很好，因为..."
- **提问代替假设**：不确定意图时问 "这里这样设计是因为 XX 吗？" 而不是 "这写错了"
- **提供解决方案**：不只指出问题，还要给出具体修复建议
- **区分偏好和问题**：个人偏好用 "I prefer..."，客观问题直接指出
- **不要nitpick**：ESLint 能处理的事不浪费审查评论

---

## 7. 自动化工具链

### 7.1 提交前自动检查（Pre-commit Hook）

```json
// .lintstagedrc.json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css,scss}": ["prettier --write"]
}
```

### 7.2 CI 检查（PR 提交时自动运行）

```yaml
# .github/workflows/code-quality.yml （或等价的本地脚本）
检查项:
  1. ESLint — 0 error（warning 允许）
  2. TypeScript — tsc --noEmit 0 error
  3. 单元测试 — 全部通过
  4. 构建验证 — webpack build 成功
```

### 7.3 当前项目状态

| 工具 | 状态 | 备注 |
|------|------|------|
| ESLint 严格配置 | 已启用 | `.eslintrc.cjs` |
| TypeScript 严格模式 | 已启用 | `tsconfig.json` strict: true |
| Prettier | 部分启用 | 内嵌 package.json，建议独立 `.prettierrc` |
| Pre-commit Hook | 未启用 | 需安装 husky + lint-staged |
| CI/CD | 未启用 | 无 .github/workflows |
| 单元测试 | 基础配置 | Jest 已配置，但测试用例少 |

---

## 8. 审查者轮值机制

### 轮值规则

| 角色 | 职责 | 轮值周期 |
|------|------|---------|
| 主审查者 | 负责本周所有 PR 的一审 | 每周轮换 |
| 副审查者 | 主审查者不在时代理 + 大 PR 二审 | 每周轮换 |
| 架构审查 | 涉及核心架构改动的 PR 需额外审查 | 资深开发固定 |

### 审查者豁免

以下情况可以跳过人工审查（但仍需自动化检查通过）：

- 纯文档修改（`docs:`）
- 纯格式调整（`style:`）
- 依赖版本升级（`chore(deps):`）
- 紧急修复（需事后补 PR 审查）

### 审查时间预算

| PR 大小 | 预计审查时间 |
|---------|------------|
| < 100 行 | 5-10 分钟 |
| 100-400 行 | 15-30 分钟 |
| 400-800 行 | 30-60 分钟 |

审查者应在接受审查任务后 24 小时内完成。

---

## 9. 度量指标

### 月度统计

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| PR 平均审查时长 | < 24 小时 | PR 创建到合并的时间 |
| Blocker 发现率 | > 90% | 审查发现的 Blocker / 上线后发现的问题 |
| PR 平均大小 | < 300 行 | 改动行数统计 |
| ESLint Error 数 | 0 | `npx eslint src/ --ext .ts,.tsx` |
| `any` 类型数量 | < 5 | 代码搜索统计 |
| 单元测试覆盖率 | > 60% | Jest coverage 报告 |
| 审查评论平均数/PR | 3-8 条 | 过少可能审查不够，过多可能 PR 太大 |

### 季度回顾

每季度末回顾以下问题：

1. 哪些类型的 Blocker 出现频率最高？→ 针对性培训
2. 哪些审查规则执行得好？哪些经常被忽略？
3. 审查流程是否拖慢了交付速度？如何优化？
4. 团队成员对审查机制的反馈如何？

---

## 附录：快速参考卡

```
┌─────────────────────────────────────────────┐
│         提交 PR 前自查                        │
├─────────────────────────────────────────────┤
│ □ npm run lint        → 0 error             │
│ □ npx tsc --noEmit    → 0 error             │
│ □ 无 any / @ts-ignore                       │
│ □ 无硬编码 API Key                          │
│ □ 关键路径有 try/catch                      │
│ □ useEffect 有清理函数                      │
│ □ 列表有 key                                │
│ □ PR 标题符合 Conventional Commits          │
│ □ PR 描述完整（改动说明 + 测试方式）           │
│ □ 改动 < 400 行（超过则拆分）                 │
└─────────────────────────────────────────────┘
```
