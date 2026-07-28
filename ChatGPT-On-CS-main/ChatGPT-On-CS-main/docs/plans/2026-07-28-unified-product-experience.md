# 统一产品体验重构 Implementation Plan

> **For Codex:** 按阶段实施，每阶段必须通过类型检查、渲染构建和桌面截图验收后再进入下一阶段。

**Goal:** 保留现有抓取、回复、知识库和数据接口，将迎波智能客服重构为结构统一、操作紧凑、适合长时间日常使用的桌面产品。

**Architecture:** 主窗口负责运营、平台店铺、知识资产和设置；伴随助手只负责当前会话的高频操作。继续使用 Electron、React、Chakra UI 和现有本地 API，不重写业务服务。新增少量纯展示组件和统一设计令牌，逐步替换旧组件。

**Tech Stack:** Electron 26、React 18、TypeScript、Chakra UI、React Query、Zustand、Jest。

---

## 阶段一：统一产品外壳与设计系统

**Files**
- Modify: `src/renderer/common/styles/theme.ts`
- Modify: `src/renderer/common/App.css`
- Modify: `src/renderer/main-window/components/layout/MainLayout.tsx`
- Modify: `src/renderer/main-window/components/layout/AppSidebar.tsx`
- Create: `src/renderer/main-window/components/layout/PageHeader.tsx`

**Acceptance**
- 主窗口只有一套导航、页头、内容宽度和状态表达。
- 1366×768 至 1920×1080 下无横向溢出。
- 主操作、次操作、危险操作和状态颜色一致。
- 类型检查和渲染构建通过。

## 阶段二：平台—店铺—运行实例

**Files**
- Modify: `src/renderer/main-window/components/AppManager/index.tsx`
- Modify: `src/renderer/main-window/components/AppManager/AppManagerContext.tsx`
- Modify: `src/renderer/main-window/components/AppManager/AppCardComponent.tsx`
- Modify: `src/renderer/main-window/components/AppManager/InstanceCardComponent.tsx`

**Acceptance**
- 平台按分组展示，店铺/实例明确归属于平台。
- 每个店铺显示登录、采集、回复模式和异常状态。
- 常用启动、暂停、测试操作不超过两次点击。
- 无店铺、加载、失败状态完整。

## 阶段三：客服工作台三栏结构

**Files**
- Modify: `src/renderer/main-window/components/ReplyWorkbench/index.tsx`
- Modify: `src/renderer/main-window/components/ReplyWorkbench/ReplyCard.tsx`
- Modify: `src/renderer/main-window/components/ReplyWorkbench/BatchActionBar.tsx`
- Modify: `src/renderer/main-window/components/ReplyWorkbench/useReplyWorkbench.ts`

**Acceptance**
- 左栏是待处理会话，中央是客户问题和上下文，右栏是回复编辑与证据。
- 发送、填入、重生成、转人工、标错和沉淀知识具有固定位置。
- 店铺筛选和异常筛选始终可见。
- 窄窗口退化为列表/详情双栏，不丢失操作。

## 阶段四：伴随助手精简

**Files**
- Modify: `src/renderer/companion-window/App.tsx`
- Modify: `src/renderer/common/styles/theme.ts`

**Acceptance**
- 默认只展示当前平台店铺客户、最近问题、回复编辑框和四个核心操作。
- 商品、历史、知识证据和健康详情默认折叠。
- 收起模式仍能看到新消息与异常提示。
- 不改变现有自动跟随和填入逻辑。

## 阶段五：统一知识资产管理

**Files**
- Modify: `src/renderer/main-window/components/KnowledgeSubSidebar.tsx`
- Modify: `src/renderer/main-window/components/ProductQALibrary/index.tsx`
- Modify: `src/renderer/main-window/components/StoreKnowledgeBase/index.tsx`
- Modify: `src/renderer/main-window/components/KnowledgeCandidates/index.tsx`
- Modify: `src/renderer/main-window/components/KnowledgeGovernance/index.tsx`

**Acceptance**
- 平台、店铺、状态、标签和全文搜索使用统一筛选栏。
- 查看、编辑、版本、启停、导入、导出和删除位置一致。
- 候选知识能看到来源对话、冲突提示和采纳目标。
- 表格、详情抽屉、空状态和批量操作一致。

## 阶段六：首页、设置与数据收敛

**Files**
- Modify: `src/renderer/main-window/components/DashboardQualityOverview/index.tsx`
- Modify: `src/renderer/main-window/components/layout/MainLayout.tsx`
- Modify: `src/renderer/settings-window/App.tsx`
- Modify: `src/renderer/dataview-window/App.tsx`

**Acceptance**
- 首页只保留运行状态、异常、待办、质量和全局暂停入口。
- 设置按平台店铺、AI、回复策略、知识、备份、高级设置分类。
- 数据视图和设置视觉与主窗口统一。
- 不再存在无功能的用户头像、通知图标或装饰按钮。

## 最终验证

1. Run: `pnpm typecheck`
2. Run: `pnpm exec jest --runInBand`
3. Run: `pnpm build:main`
4. Run: `pnpm build:renderer`
5. 生成 unpacked 桌面包并替换测试运行目录。
6. 逐页截图检查：首页、平台店铺、客服工作台、伴随助手、知识库、设置、数据。
7. 验证千牛真实窗口下的跟随、切换客户、填入回复和暂停恢复。

