# v2.0.0 Startup Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 v2.0.0 冷启动永久停留在“正在启动本地服务”的问题，并重新发布经过完整验证的 Windows 安装包。

**Architecture:** 将“Node 本地 API 已监听”与“旧 Python 调度端健康”分离。渲染进程通过一个可单测的启动就绪订阅函数统一处理同步 IPC 状态和异步 IPC 事件，不再依赖错误的 Electron 事件参数签名。

**Tech Stack:** Electron 26、React 18、TypeScript、Jest、electron-builder、PowerShell、GitHub Actions/Releases。

---

### Task 1: 固化启动竞态回归测试

**Files:**
- Create: `src/__tests__/services/startupReadiness.test.ts`
- Create: `src/renderer/main-window/services/startupReadiness.ts`

**Steps:**
1. 写测试模拟同步状态为 `false`，再触发单参数 `check-health(true)`，断言进入 ready。
2. 写测试覆盖同步状态已经为 `true` 时不注册监听。
3. 写测试覆盖 `false`、`undefined` 和字符串异常值不放行，并验证取消订阅。
4. 运行 `npm test -- --runInBand src/__tests__/services/startupReadiness.test.ts`，确认实现前失败。

### Task 2: 修复主界面启动订阅

**Files:**
- Modify: `src/renderer/main-window/App.tsx`
- Modify: `src/renderer/main-window/services/startupReadiness.ts`

**Steps:**
1. 实现严格的就绪值解析和同步查询/异步订阅组合。
2. 将 `App.tsx` 的双参数回调替换为该订阅函数。
3. 使用 preload `on()` 返回的取消函数清理包装后的真实监听器。
4. 运行目标测试并确认通过。

### Task 3: 强化启动与打包验证

**Files:**
- Modify: `scripts/check-package-artifacts.js`
- Test: `src/__tests__/services/runtimePaths.test.ts`

**Steps:**
1. 核对当前各采集器与旧调度后端是否属于必需产物。
2. 对实际必需运行时增加明确的文件和 import 校验。
3. 运行运行时路径测试、Python 检查与包产物检查。

### Task 4: 完整本机验证

**Files:**
- No source changes expected.

**Steps:**
1. 运行 `npm test -- --runInBand`，预期全部通过。
2. 运行 `npm run build`，预期主进程和渲染进程构建通过。
3. 运行 `npm run package`，预期生成 `迎波智能客服 2.0.0.exe`。
4. 完全结束旧进程后冷启动解压版，验证无需刷新即可进入主界面。
5. 验证 Node API、RAG 健康接口和伴随面板打开正常。

### Task 5: 重新发布 v2.0.0

**Files:**
- No source changes expected.

**Steps:**
1. 提交并推送修复分支，创建 PR。
2. 等待 GitHub Actions 全绿后合并到 `main`。
3. 重新生成/移动 `v2.0.0` 标签到修复后的合并提交。
4. 先上传并校验新安装包大小与 SHA-256，再删除旧错误附件。
5. 验证 Release 仍为 Latest、页面返回 200、下载链接返回有效重定向。

