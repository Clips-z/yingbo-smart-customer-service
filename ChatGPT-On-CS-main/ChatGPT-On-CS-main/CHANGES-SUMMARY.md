# 迎波智能客服 — 本次修复总结

## 修复概览

### 1. dispatchService API 挂起问题（核心修复）

**问题**：当 Python 后端（`__main__.exe`）未运行时，Express API 请求会挂起 50+ 秒，导致前端页面无法加载数据。

**根因**：`dispatchService.ts` 中的 `getAllPlatforms()`、`updateTasks()`、`checkHealth()`、`syncConfig()` 四个方法通过 Socket.IO `emitWithAck` 与 Python 后端通信。无连接时，重试 10 次 × 5 秒超时 = 50 秒阻塞。

**修复**：为所有四个方法添加 `io.sockets.sockets.size === 0` 快速返回检查：

| 方法 | 修改前（无后端时） | 修改后 |
|------|-------------------|--------|
| `getAllPlatforms()` | 10次重试 × 5s超时 = 50s阻塞 | 即刻返回 `[]` |
| `updateTasks()` | 5s超时阻塞 | 即刻返回 `null` |
| `checkHealth()` | 5s超时阻塞 | 即刻返回 `false` |
| `syncConfig()` | 5s超时 + updateTasks 5s = 10s阻塞 | 即刻返回 `false` |

**影响的 API 端点**：
- `GET /api/v1/reply/list` — 调用 `getAllPlatforms()` 获取平台名称映射
- `GET /api/v1/transfer/list` — 同上
- `GET /api/v1/replace/list` — 同上
- `GET /api/v1/base/platform/all` — 直接返回平台列表
- `GET /api/v1/base/health` — 健康检查
- `POST /api/v1/base/sync` — 配置同步
- `POST /api/v1/base/setting` — 配置更新后触发同步

### 2. 环境变量路径重定向（沙箱/CI 支持）

**问题**：Electron 需要写入 `AppData\Roaming\chatgpt-on-cs\`（锁文件）和 `Documents\chatgpt-on-cs\`（数据库），沙箱环境阻止访问这些路径。

**修复**：

- **`main.ts`**：添加 `ELECTRON_USER_DATA_DIR` 环境变量支持
  ```typescript
  if (process.env.ELECTRON_USER_DATA_DIR) {
    app?.setPath?.('userData', process.env.ELECTRON_USER_DATA_DIR);
  }
  ```
  在 `requestSingleInstanceLock()` 之前执行，确保锁文件创建到指定目录。

- **`ormconfig.ts`**：添加 `DB_DIR` 环境变量支持
  ```typescript
  const DOCUMENTS_DIR = process.env.DB_DIR
    ? process.env.DB_DIR
    : path.join(os.homedir(), 'Documents');
  ```

### 3. 调试日志清理

移除 `main.ts` 中的临时调试日志：
- `console.log('gotTheLock:', gotTheLock)` 
- `console.log('createWindow started, gotTheLock:', gotTheLock)`
- `console.log('No lock, quitting')`

### 4. 启动脚本

创建 `start-dev.bat` 一键启动脚本，自动处理：
- 清除 `ELECTRON_RUN_AS_NODE` 环境变量
- 设置本地数据目录
- 启动 Electron

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/main/main.ts` | 添加 ELECTRON_USER_DATA_DIR 支持；移除调试日志 |
| `src/main/backend/ormconfig.ts` | 添加 DB_DIR 环境变量支持 |
| `src/main/backend/services/dispatchService.ts` | 四个方法添加 sockets.size 快速返回检查 |
| `start-dev.bat` | 新建：一键启动脚本 |

## 验证状态

- ✅ TypeScript 编译通过（`tsc --noEmit --skipLibCheck` 无 src/ 错误）
- ✅ Webpack 构建成功（main.js 4.5MB）
- ✅ 构建产物验证通过（所有修复代码均在 main.js 中）
- ⚠️ 运行时测试需要沙箱外执行（Electron 需写入系统路径）

## 如何启动应用

### 方法 1：使用启动脚本
双击 `start-dev.bat`

### 方法 2：手动命令行
```bat
cd "F:\懒人客服\ChatGPT-On-CS-main\ChatGPT-On-CS-main"
set ELECTRON_RUN_AS_NODE=
set ELECTRON_USER_DATA_DIR=%CD%\temp-data
set DB_DIR=%CD%\temp-data
npx electron release/app/
```

## 待办事项

- [x] 沙箱外运行时测试：验证 API 端点响应正常 ✅（2026-06-24，详见下方第 5 节）
- [ ] `__main__.exe` Python 后端打包
- [ ] 前端类型细化、单元测试、CI/CD

---

## 5. sqlite3 原生模块启动崩溃修复（2026-06-24）

### 问题
应用启动后立即崩溃（`before-quit` 阶段），根因是 **`release/app/node_modules` 目录为空**：
- webpack 将 `sqlite3` 标记为外部依赖（`main.js` 首行 `require("sqlite3")`），运行时由 Electron 从 `release/app/node_modules` 解析
- ERB 模板默认通过 `electron-builder install-app-deps` + `electron-rebuild` 填充该目录，但 `electron-rebuild` 在本机未能生成有效二进制（见初版 TEST-REPORT 第三节）

### 修复方案：复用预编译二进制，绕过 electron-rebuild
新增 `scripts/install-app-deps.js`：
1. 将 `sqlite3`（9.4MB，含原生 .node 绑定）与其加载器 `@mapbox/node-pre-gyp`（468KB）从根 `node_modules` 复制到 `release/app/node_modules`
2. 复用已下载的 `napi-v6` 预编译二进制 —— 它对 Electron 26 的 N-API v8 向后兼容
3. 同时生成 `napi-v8` 路径副本，使 `node-pre-gyp` 能按 Electron 的 N-API 版本定位到文件
4. 内置自检：复制后在 Node 下 `require('sqlite3')`，确认 binding 链路完整

> 该方案无需 MSVC / node-gyp 编译，也不依赖外网下载，可在任意已 `npm install` 的环境一键完成。

### 同步清理
- 移除 `main.ts` 中残留的全部 11 处 `[DEBUG]` 临时日志（保留有信息价值的关键日志，仅去掉调试标记）

### 端到端验证（2026-06-24）
| 验证项 | 结果 |
|--------|------|
| Electron 主进程启动 | ✅ 稳定运行，无崩溃 |
| Express server 监听 | ✅ 成功（实测端口 54988） |
| sqlite3 数据库初始化 | ✅ msg.db 创建（53KB，表结构完整） |
| `GET /api/v1/base/health` | ✅ `{"success":true,"data":true}` |
| `GET /api/v1/base/platform/all` | ✅ 返回 4 个内置平台 |
| `GET /api/v1/reply/list` | ✅ 秒回（无挂起） |
| `GET /api/v1/transfer/list` | ✅ 秒回（无挂起） |
| `GET /api/v1/replace/list` | ✅ 秒回（无挂起） |

### 本次修改文件清单
| 文件 | 变更 |
|------|------|
| `scripts/install-app-deps.js` | **新增**：安装 sqlite3 运行时依赖到 release/app |
| `scripts/launch-electron.cmd` | **新增**：封装环境变量的一键启动脚本 |
| `release/app/node_modules/` | **填充**：sqlite3 + @mapbox/node-pre-gyp |
| `src/main/main.ts` | 清理 11 处 `[DEBUG]` 临时日志 |
| `release/app/dist/main/main.js` | **重新构建**：让日志清理在生产产物中生效 |
| `TEST-REPORT.md` / `CHANGES-SUMMARY.md` | 更新验证结果与结论 |

### 如何使用
```bash
# 1. 确保 sqlite3 二进制已在根 node_modules（首次 npm install 后即可）
# 2. 填充 release/app 运行时依赖（每次重新 clone / clean 后执行一次）
node scripts/install-app-deps.js
# 3. 启动应用
scripts\launch-electron.cmd
```

---

## 6. Python 后端集成验证（2026-06-25）

### 发现
原待办项「`__main__.exe` Python 后端打包」**实际已完成**：PyInstaller 打包的后端可执行文件已就位：
- `assets/backend/__main__.exe`（65 MB，Python 3.11）
- `release/app/assets/backend/__main__.exe`（同上）
- 配套依赖（python311.dll、numpy、scipy、onnxruntime、cv2、aiohttp 等完整运行时）均在 `assets/backend/`

### 集成验证结果（启动日志实证）
| 验证项 | 结果 |
|--------|------|
| 后端进程拉起 | ✅ `Backend process started with PID: 34568`（作为 Electron 子进程） |
| Socket.IO 反向连接 | ✅ `Client connected registerHandlers`（后端连回主进程） |
| `GET /api/v1/base/health` | ✅ `{"success":true,"data":true}`（后端在线，非 false） |
| 平台自动化就绪 | ✅ `[chrome-detect] Found browser at: ...chrome.exe` |
| 数据库读写 | ✅ 全表迁移/初始化/种子数据填充均正常 |
| 日志清理生效 | ✅ 生产 `main.js` 中 `[DEBUG]` 标记已全部清除 |

### 结论
完整启动链路 —— **Electron → sqlite3 数据库 → Express server → 拉起 Python 后端 → Socket.IO 双向通信 → 平台自动化** —— 已全部打通，应用进入可用状态。

### 下一步可选方向
- ~~AI 回复功能实测：配置 LLM（base_url / key）后验证真实对话回复链路~~ ✅（见第 7 节）
- 前端类型细化、单元测试、CI/CD

---

## 7. AI 回复链路端到端实测（2026-06-25）

### 背景
验证「平台消息 → 插件沙箱 → `config_srv.get` → `reply_srv.getReply`（转人工 / 关键词 / GPT）→ 返回回复」完整链路。百炼（DashScope OpenAI 兼容模式）作为 LLM 后端。

### 配置写入方式
插件测试不走请求体传 `cfg`，而是依赖数据库全局配置。通过 `POST /api/v1/base/setting` 写入：

| type | 关键字段 | 说明 |
|------|---------|------|
| `llm` | `baseUrl`, `key`, `llmType`, `model` | 百炼兼容端点 + 通义千问模型 |
| `driver` | `hasUseGpt: true`, `hasKeywordMatch: false`, `hasTransfer: false` | 跳过关键词/转人工，直走 GPT |
| `generic` | `replySpeed: 0`, `replyRandomSpeed: 0` | 测试时取消随机等待 |

`configController.get(ctx)` 查找顺序：实例配置 → 应用配置 → **全局配置**（`global=true`），并将全局 driver 开关合并进结果。

### 端点参数：`POST /api/v1/base/plugin/check`

```json
{
  "code": "<插件 JS 代码，须 export main 函数>",
  "ctx": {
    "CTX_APP_NAME": "mock",
    "CTX_APP_ID": "mock_app_id",
    "CTX_INSTANCE_ID": "mock_instance_id"
  },
  "messages": [
    {
      "sender": "OTHER用户",
      "content": "请问你们的退货政策是什么？",
      "role": "OTHER",
      "type": "TEXT"
    }
  ]
}
```

默认插件代码（与 `PluginDefaultRunCode` 一致）：

```javascript
const cc = require('config_srv');
const rp = require('reply_srv');
async function main(ctx, messages) {
  const cfg = await cc.get(ctx);
  return await rp.getReply(cfg, ctx, messages);
}
```

### 实测结果

| 步骤 | 端点 | 结果 |
|------|------|------|
| 1 | `POST /api/v1/base/gpt/health` | ✅ 百炼兼容端点流式回复正常 |
| 2 | `POST /api/v1/base/setting` ×3 | ✅ 全局 LLM + driver + generic 写入成功 |
| 3 | `POST /api/v1/base/plugin/check` | ✅ `status: true`，GPT 生成完整退货政策回复 |

**插件链路结论**：VM 沙箱执行 → `config_srv.get` 读库 → `getReply` 识别 `OTHER` 消息 → 跳过关键词（已关闭）→ 调用百炼 GPT → 返回 `{ content, type: 'TEXT' }` 全链路打通。

### 自动化脚本

新增 `scripts/e2e-plugin-check.js`：自动探测端口、从 `.tmp-userdata/llm.local.json` 加载 LLM 配置、写入全局设置、调用 `plugin/check`。

```bash
# 1. 启动应用
node scripts/launch-electron-detached.js

# 2. 准备本地 LLM 配置（勿提交 git）
#    .tmp-userdata/llm.local.json → { "baseUrl", "key", "llmType", "model" }

# 3. 运行端到端测试
node scripts/e2e-plugin-check.js
```

### 本次修改文件

| 文件 | 变更 |
|------|------|
| `scripts/e2e-plugin-check.js` | **新增**：插件 GPT 链路自动化测试 |
| `CHANGES-SUMMARY.md` | 记录 AI 回复链路实测结果 |
