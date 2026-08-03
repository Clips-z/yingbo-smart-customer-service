# 迎波智能客服：多平台实时采集、伴随助手与知识闭环实施总计划

> **For Luna / Claude:** REQUIRED SUB-SKILL: use `executing-plans` to implement this plan task-by-task. Do not skip gates, do not silently replace an existing subsystem, and do not enable automatic sending before the corresponding gate passes.

**Goal:** 把迎波智能客服从“以 OCR 轮询为主、识别和切换较慢”的工具，升级为能够真实投入多店铺客服工作的产品：结构化采集优先、OCR 兜底，客户切换和新消息接近实时，左侧工作台可精确跳转客户，右侧伴随助手展示真实问答和商品信息，点击回答即可填入，自动模式在同一安全链路上发送，并将最终有效问答持续沉淀到可查看、编辑和导出的知识库。

**Architecture:** 为每个平台建立独立 `PlatformAdapter`，将官方接口、插件/IPC、CDP、UIA 和 OCR 转换为统一会话事件；`CaptureRouter` 只允许一个主采集源驱动业务，其他来源仅作影子比较或兜底。所有 AI 生成、填入和发送都绑定 `platform + store + account + contact + conversation + contextRevision`，切换客户后旧结果立即失效。

**Tech Stack:** Electron、TypeScript、React、Express、Sequelize/SQLite、Jest、PowerShell、Python/RapidOCR、Windows UI Automation、Chrome DevTools Protocol；仅当千牛只读探针证明必要且可维护时，才增加独立原生 helper/plugin，并通过版本化 IPC 与 Electron 通信。

---

## 0. 文档状态与执行授权边界

- 当前状态：`PROPOSED`。
- 本文创建时只完成规划，没有授权实现本文功能。
- 用户后续明确“按照总计划执行”后，执行模型才可以开始 Task 0。
- 本计划默认持续执行到全部已批准范围完成；通过一个 Gate 后自动进入下一项，不必重复询问。
- 出现以下情况必须暂停并向用户报告，不能自行扩大权限：
  - 需要修改、替换或注入第三方平台客户端二进制；
  - 需要关闭防护、绕过签名、绕过登录或风控；
  - 需要删除用户数据、数据库或现有未提交改动；
  - 需要固定千牛版本且会影响用户现有店铺工作；
  - 发现串客户、误发送或重复发送；
  - 需要使用多脉等竞品的私有代码、密钥、协议实现或二进制内容。
- 不允许复制、解包复用或修改多脉的私有代码。可以把用户自己机器上的进程关系、窗口行为和公开资料作为产品架构参考，但实现必须独立完成。

## 1. Luna 目标模式执行协议

### 1.1 每次新会话必须先做

1. 完整阅读本文件。
2. 阅读“进度台账”，找到第一个 `PENDING` 或 `IN_PROGRESS` 任务。
3. 运行：

```powershell
git status --short
git branch --show-current
git log -8 --oneline
```

4. 阅读该任务列出的现有文件和前置 ADR，不要重新实现已完成任务。
5. 运行该任务的最小相关测试，确认当前基线。
6. 将任务状态改为 `IN_PROGRESS`，再开始编辑。
7. 每完成一个小步骤就运行指定测试；每完成一个 Task 就做一次范围明确的提交。
8. 更新本文件末尾的进度台账、实测指标和决策记录。

### 1.2 上下文压缩后的恢复规则

- 以 Git 提交、本文件进度台账、测试结果和 ADR 为事实来源。
- 不因为看不到旧对话而重做已提交工作。
- 如果进度台账与代码冲突，以“测试 + Git diff + 最近提交”为准，并修正台账。
- 不将用户原有改动当作废弃代码清理。
- 不运行 `git reset --hard`、`git checkout -- .` 或递归删除工作区。

### 1.3 每个 Task 的完成定义

一个任务只有同时满足以下条件才能标记 `DONE`：

- 指定代码和测试已完成；
- 相关 Jest 测试通过；
- `pnpm typecheck` 通过，或已记录与本任务无关的既有错误；
- `git diff --check` 通过；
- 人工场景（如该任务要求）已验证并保存脱敏结果；
- 本文件进度台账已更新；
- 已创建小而清晰的 Conventional Commit。

### 1.4 自动继续和自动回退

- Gate 通过：自动继续下一 Task。
- 主结构化通道不可用：自动执行本计划规定的 OCR/UIA 回退分支，不擅自深入注入。
- 单个测试失败：先修复本 Task；不得用跳过测试、删除断言或扩大超时掩盖问题。
- 发现与本 Task 无关的既有失败：记录完整命令和错误，继续运行更小范围测试；在最终全量 Gate 前必须重新核查。

## 2. 所需技能清单

Luna 若支持技能系统，按下表加载；若技能名称不同，使用具备相同职责的能力。不要为了“技能齐全”安装与任务无关的插件。

| 优先级 | 技能/等价能力 | 使用阶段 | 具体职责 |
|---|---|---|---|
| 必须 | `executing-plans` | 全程 | 按 Task 和 Gate 逐项执行，维护进度台账 |
| 必须 | `Code` | 全程 | TDD、实现、重构、测试、代码审查 |
| 必须 | `architecture-designer` | Task 2–8 | 统一事件层、适配器边界、ADR、降级设计 |
| 必须 | Windows `computer-use` | Task 1、5、7、10–12、18 | 操作千牛/京麦、切换客户、多屏和实机回归 |
| 必须 | `git-essentials` | 全程 | 保护脏工作区、小提交、可回退历史 |
| 必须 | `ui-ux-pro-max` | Task 13–14 | 伴随助手、左侧工作台、状态反馈和可用性 |
| 推荐 | `frontend-design` | Task 13–14 | React 组件布局、视觉层级、紧凑界面 |
| 推荐 | `security-auditor` | Task 11–12、19 | 检查跨客户发送、IPC 边界、敏感日志；重点是操作安全而非账户体系 |
| 推荐 | `ponytail-review` | 每个大阶段末尾 | 删除不必要抽象，保持单一采集路由和最小实现 |
| 推荐 | `github:yeet` / GitHub 发布能力 | Task 19 | 推送、PR、标签和 Release；仅用户授权后发布 |
| 可选 | `brainstorming` | 需求发生变化时 | 仅用于重新确认方案；执行既定计划时不要反复发散 |
| 可选 | `writing-plans` | 发现重大新分支时 | 只为新增的平台适配补充子计划 |

技能调用顺序建议：

```text
executing-plans
  → Code + architecture-designer
  → computer-use（实机探针）
  → ui-ux-pro-max + frontend-design（界面阶段）
  → security-auditor（填入/发送 Gate）
  → ponytail-review（阶段收口）
  → github 发布能力（最终授权后）
```

## 3. 必读上下文和现有基础

执行模型在 Task 0 后必须阅读这些文件，不应推倒重做：

- `docs/plans/2026-07-16-qianniu-companion-hardening-design.md`
- `docs/plans/2026-07-16-qianniu-companion-hardening.md`
- `docs/plans/2026-07-29-realtime-companion-experience.md`
- `docs/plans/2026-07-30-left-reception-workbench-design.md`
- `src/main/backend/services/qianniuCompatService.ts`
- `src/main/backend/services/qianniuContextTracker.ts`
- `src/main/backend/services/qianniuContextEvidence.ts`
- `src/main/backend/services/qianniuCapturePolicy.ts`
- `src/main/backend/services/companionContext.ts`
- `src/main/backend/services/companionContextRegistry.ts`
- `src/main/backend/services/deliveryContextGuard.ts`
- `src/main/backend/services/cdp/cdpEndpointProbe.ts`
- `src/main/backend/services/cdp/cdpConnection.ts`
- `src/main/backend/services/cdp/captureMetrics.ts`
- `src/renderer/companion-window/App.tsx`
- `src/renderer/main-window/components/CompactReceptionWorkbench.tsx`
- `src/main/services/windowDockingService.ts`

已经存在、应复用的能力：

- 千牛 OCR、截图指纹和持久 Python worker；
- CDP endpoint 探针、WebSocket 连接和相关单元测试；
- `contextRevision`、`generationEpoch` 和旧生成结果失效；
- `CompanionContextRegistry` 和 `DeliveryContextGuard`；
- 左侧紧凑工作台、伴随窗口吸附和多屏基础；
- 人工、辅助、自动回复模式基础；
- 知识候选、知识审核、知识导出和产品知识实体。

已知实测结论：

- 当前千牛 `AliWorkbench.exe` 接收 `--remote-debugging-port`，但承载页面的 `AliRender.exe` 没有继承；普通外部 CDP 端口没有监听。
- 千牛顶层窗口为 Qt 窗口，UI Automation 子树为空，不能把 UIA 视为千牛主方案。
- OCR 在低性能环境可能非常慢，且会出现昵称、链接、方向和店铺误识别。
- 多脉呈现出“受控客户端版本 + 平台插件/内部桥接 + 本地 IPC/WebSocket + 部分自有页面 CDP”的特征，不是 CDP-only。

## 4. 已批准产品行为（不得重新解释）

1. 默认打开时：左侧工作台吸附，右侧伴随助手吸附，中间是平台客服客户端。
2. 两侧窗口都支持吸附、自由拖动和大屏展开。
3. 多显示器下按虚拟桌面自然延伸，不因右侧空间不足强制跳到左侧。
4. 点击左侧待回复客户，必须跳到对应平台、店铺、账号、客户，并把焦点留在输入框。
5. 伴随助手顶部第一行是店铺名，第二行才是客户 ID，不能重复显示客户 ID。
6. 伴随助手要复现客户真实问题；问题下方显示对应回答，形成明显的一问一答。
7. 客户发来的商品链接显示为“客户发送的链接/商品”，不能当作普通文字问题。
8. 删除独立的大型 AI 草稿框；点击回答卡片内容直接填入当前客户输入框。
9. 辅助模式只填入，自动模式在同一条链路上增加发送和发送确认。
10. 商品知识和商品详情自动抓取，支持一键发送商品链接。
11. 知识库必须允许人工查看、搜索、筛选、编辑、合并、停用、导入和导出具体内容。
12. 知识积累优先使用客服最终采用或修改后发送的回答，不直接保存 AI 第一次生成结果。

## 5. 架构决策

### ADR-001：不采用 OCR-only

OCR 保留为最后兜底，但不再承担实时主链路。原因是它无法根治延迟、跨店铺错配、消息方向误判和坐标变化。

### ADR-002：不采用全平台 CDP-only

千牛已实测不能通过普通启动参数直接开放聊天页面 CDP。每个平台必须选择自己的最佳结构化通道。

### ADR-003：采用平台适配器 + 统一事件

采集优先级：

```text
官方接口/官方插件
  > 可独立维护的结构化桥接或 IPC
  > CDP
  > UIA
  > OCR
```

优先级是策略，不是所有平台必须逐级实现。每个平台只实现必要的最小通道。

### ADR-004：只允许一个主通道驱动业务

影子通道只能比较，不能触发 AI、填入或发送。避免同一消息被 OCR 和结构化通道重复处理。

### ADR-005：写操作晚于读操作

千牛研究顺序固定为：只读探针 → 影子采集 → 主采集 → 精确跳转 → 填入 → 自动发送。不得跳级。

## 6. 统一领域模型

创建 `src/main/backend/services/capture/platformEvent.ts`：

```ts
export type CaptureSource =
  | 'official'
  | 'plugin'
  | 'ipc'
  | 'cdp'
  | 'uia'
  | 'ocr';

export type MessageDirection = 'incoming' | 'outgoing' | 'system';
export type MessageContentType =
  | 'text'
  | 'link'
  | 'product'
  | 'image'
  | 'file'
  | 'emoji'
  | 'system';

export interface ConversationIdentity {
  platformId: string;
  storeId: string;
  accountId: string;
  contactId: string;
  conversationId: string;
}

export interface ProductObservation {
  productId?: string;
  title?: string;
  url?: string;
  imageUrl?: string;
  skuId?: string;
  attributes?: Record<string, string>;
}

export interface PlatformEvent {
  eventId: string;
  messageId?: string;
  identity: ConversationIdentity;
  storeName?: string;
  accountName?: string;
  contactName?: string;
  direction: MessageDirection;
  contentType: MessageContentType;
  content: string;
  product?: ProductObservation;
  sourceTimestamp?: string;
  capturedAt: string;
  source: CaptureSource;
  confidence: number;
  sourceRevision: string;
}
```

创建 `src/main/backend/services/capture/platformAdapter.ts`：

```ts
import {
  ConversationIdentity,
  PlatformEvent,
} from './platformEvent';

export interface CaptureCapabilities {
  readable: boolean;
  canObserveConversationSwitch: boolean;
  canObserveMessages: boolean;
  canReadProducts: boolean;
  canFocusConversation: boolean;
  canFillDraft: boolean;
  canSendDraft: boolean;
  source: string;
  reason?: string;
}

export interface ConversationTarget {
  platformId: string;
  storeId: string;
  accountId: string;
  contactId: string;
  conversationId?: string;
}

export interface AdapterActionResult {
  ok: boolean;
  liveIdentity?: ConversationIdentity;
  reason?: string;
  elapsedMs: number;
}

export interface PlatformAdapter {
  readonly id: string;
  probe(): Promise<CaptureCapabilities>;
  start(onEvent: (event: PlatformEvent) => void): Promise<void>;
  stop(): Promise<void>;
  getCurrentConversation(): Promise<ConversationIdentity | undefined>;
  focusConversation(target: ConversationTarget): Promise<AdapterActionResult>;
  fillDraft(content: string): Promise<AdapterActionResult>;
  sendDraft(): Promise<AdapterActionResult>;
}
```

会话唯一键必须是：

```ts
`${platformId}:${storeId}:${accountId}:${contactId}:${conversationId}`
```

不允许只用客户昵称、展示名或 OCR 文本作为会话键。

## 7. 目标非功能指标

| 指标 | 结构化主通道目标 | OCR 兜底目标 |
|---|---:|---:|
| 客户切换 P95 | ≤ 300ms | ≤ 2s |
| 新文字消息捕捉 P95 | ≤ 300ms | ≤ 2s |
| 点击回答到填入 P95 | ≤ 200ms | ≤ 1s |
| 主通道故障降级 | ≤ 3s | 不适用 |
| 客户端重启恢复 | ≤ 10s | ≤ 10s |
| 客户识别正确率 | ≥ 99.5% | ≥ 95% |
| 新文字消息捕捉率 | ≥ 99% | ≥ 95% |
| 串客户 | 0 | 0；不确定时禁止操作 |
| 重复生成 | ≤ 0.5% | ≤ 1% |
| 连续稳定运行 | ≥ 8 小时 | ≥ 8 小时 |
| 空闲额外 CPU | ≤ 5% | ≤ 8% |
| 单适配器额外内存 | ≤ 200MB | ≤ 300MB |

## 8. 任务清单

### Task 0：保护现有工作区并创建执行基线

**Skills:** `executing-plans`, `git-essentials`, `Code`

**Files:**

- Inspect: all current modified/untracked files from `git status --short`
- Update: this plan progress ledger
- Create: `docs/architecture/realtime-capture-baseline.md`

**Steps:**

1. 运行 `git rev-parse --show-toplevel`，确认实际 Git 根目录。
2. 运行 `git status --short`，保存输出到基线文档。
3. 逐项审查现有 diff；不得 reset、stash 或覆盖。
4. 运行 `git diff --check`。
5. 运行现有相关测试：

```powershell
pnpm test -- --runInBand src/__tests__/services/cdp src/__tests__/services/qianniuCapturePolicy.test.ts src/__tests__/services/qianniuContextTracker.test.ts src/__tests__/services/deliveryContextGuard.test.ts
pnpm typecheck
```

6. 在基线文档记录通过数、失败数、既有 lint/typecheck 问题。
7. 如果当前改动已验证且属于此前迎波开发，创建 checkpoint commit：

```powershell
git add <reviewed-files-only>
git commit -m "chore: checkpoint realtime companion foundation"
```

8. 如果无法确认某个文件归属，不提交该文件，记录后继续在当前工作区谨慎开发。

**Expected:** 现有改动均被保留；基线可复现；没有用清理命令掩盖问题。

**Gate 0:** 相关现有测试可运行，工作区状态已完整记录。

### Task 1：建立端到端性能与准确率基线

**Skills:** `Code`, `computer-use`

**Files:**

- Modify: `src/main/backend/services/cdp/captureMetrics.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Create: `scripts/benchmark-qianniu-capture.ts`
- Create: `src/__tests__/services/cdp/captureBaseline.test.ts`
- Update: `docs/architecture/realtime-capture-baseline.md`

**Steps:**

1. 为客户点击、上下文更新、消息捕捉、AI 开始/完成、填入开始/完成增加统一 trace ID。
2. 先写失败测试，验证同一 trace 能计算各阶段 elapsed time。
3. 运行该测试，确认因缺少实现失败。
4. 实现最小 trace 聚合，不保存完整客户消息，只保存哈希、长度、来源、耗时和会话键哈希。
5. 再运行测试并通过。
6. 创建 benchmark 脚本，输出 JSON 和 Markdown 摘要。
7. 实机执行 A店客户1 → A店客户2 → A店客户1、A店 → B店 → A店，各至少 20 次。
8. 记录 OCR 空白、低置信度、重复识别、店铺错配和客户错配。
9. 提交：

```powershell
git add src/main/backend/services/cdp/captureMetrics.ts src/main/backend/services/qianniuCompatService.ts scripts/benchmark-qianniu-capture.ts src/__tests__/services/cdp/captureBaseline.test.ts docs/architecture/realtime-capture-baseline.md
git commit -m "test: establish qianniu capture baseline"
```

**Gate 1:** 基线报告能明确区分采集耗时、AI 耗时和界面刷新耗时。

### Task 2：增加统一事件、适配器接口和契约测试

**Skills:** `architecture-designer`, `Code`

**Files:**

- Create: `src/main/backend/services/capture/platformEvent.ts`
- Create: `src/main/backend/services/capture/platformAdapter.ts`
- Create: `src/main/backend/services/capture/conversationKey.ts`
- Create: `src/__tests__/services/capture/conversationKey.test.ts`
- Create: `src/__tests__/services/capture/platformAdapterContract.test.ts`

**Steps:**

1. 写会话键失败测试：不同店铺、账号或客户不得产生相同键。
2. 实现 `conversationKey()`。
3. 写事件 schema/normalizer 测试，拒绝缺失身份字段和非法 confidence。
4. 实现第 6 节的最小类型和 normalizer。
5. 创建一个测试用 fake adapter，验证所有 adapter 遵守 start/stop 幂等契约。
6. 运行：

```powershell
pnpm test -- --runInBand src/__tests__/services/capture/conversationKey.test.ts src/__tests__/services/capture/platformAdapterContract.test.ts
pnpm typecheck
```

7. 提交：`feat: add platform capture contracts`。

**Gate 2:** 业务层可以只依赖统一类型，不需要知道事件来自 OCR、CDP 或 IPC。

### Task 3：实现消息去重、采集路由和单主通道规则

**Skills:** `architecture-designer`, `Code`, `ponytail-review`

**Files:**

- Create: `src/main/backend/services/capture/captureDeduplicator.ts`
- Create: `src/main/backend/services/capture/captureRouter.ts`
- Create: `src/main/backend/services/capture/captureHealth.ts`
- Create: `src/__tests__/services/capture/captureDeduplicator.test.ts`
- Create: `src/__tests__/services/capture/captureRouter.test.ts`
- Create: `src/__tests__/services/capture/captureHealth.test.ts`

**Required states:**

```ts
type CaptureRouteState =
  | 'probing'
  | 'structured-shadow'
  | 'structured-active'
  | 'cdp-active'
  | 'uia-active'
  | 'ocr-active'
  | 'recovering';
```

**Steps:**

1. 写真实 `messageId` 优先去重测试。
2. 写无 ID 时使用会话键 + 方向 + 内容 + 时间桶指纹的测试。
3. 写“影子事件不得触发业务 consumer”的失败测试。
4. 写“主通道失效 3 秒内 OCR 接管”的 fake-clock 测试。
5. 实现最小 deduplicator 和 router。
6. 确保路由切换时只发送一次 `sourceChanged`，不重放旧消息。
7. 运行全部 capture 测试和 typecheck。
8. 用 `ponytail-review` 检查是否出现不必要的 event bus/DI 框架；优先普通 TypeScript 类。
9. 提交：`feat: route capture events with deterministic fallback`。

**Gate 3:** 同一消息由结构化通道和 OCR 同时观察时，业务只收到一次。

### Task 4：把现有千牛 OCR 包装成适配器

**Skills:** `Code`

**Files:**

- Create: `src/main/backend/services/adapters/qianniu/qianniuOcrAdapter.ts`
- Create: `src/__tests__/services/adapters/qianniuOcrAdapter.test.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/services/qianniuCaptureWorker.ts`

**Steps:**

1. 写测试，将现有 OCR snapshot 转成统一 `PlatformEvent`。
2. 明确 OCR 无法确定的字段，使用 confidence 表达，不伪造 ID。
3. 实现 adapter，内部复用现有 worker，不启动第二个 OCR 循环。
4. 通过 feature flag `captureRouterEnabled` 接入 `QianniuCompatService`。
5. flag 关闭时行为必须与当前版本相同。
6. flag 开启时 OCR 事件经 router 后仍通过现有 context/AI 链路。
7. 运行全部千牛和 delivery guard 测试。
8. 提交：`refactor: adapt qianniu ocr to capture contract`。

**Gate 4:** 重构没有降低当前 OCR 功能，且可随时关闭新 router。

### Task 5：执行千牛结构化只读探针

**Skills:** `architecture-designer`, `computer-use`, `Code`

**Files:**

- Create: `docs/architecture/adr-002-qianniu-structured-capture.md`
- Create: `scripts/probe-qianniu-structure.ps1`
- Create: `scripts/probe-qianniu-process-tree.ps1`
- Modify if needed: `scripts/probe-qianniu-cdp.ts`
- Test: `src/__tests__/services/cdp/cdpEndpointProbe.test.ts`

**Probe order:**

1. 官方/公开插件或扩展能力。
2. 千牛配置声明的 COM/plugin 服务。
3. 进程树、命名管道、本地 TCP/WebSocket/IPC 边界。
4. `AliWorkbench` 与 `AliRender` 的消息通道。
5. 普通 CDP endpoint 再确认。
6. UIA 只作验证，不作为预设答案。

**Steps:**

1. 确认千牛已关闭后，仅用已存在的 localhost CDP 脚本测试一次。
2. 保存 `/json/version`、`/json/list` 或连接拒绝结果；不重复无效试验。
3. 只读枚举千牛进程、父子关系、命令行、本机监听端口和命名管道元数据。
4. 检查公开配置和插件注册信息，记录接口名称和版本；不反编译复制竞品代码。
5. 运行千牛 30 分钟，手动切换多个店铺和客户，观察是否有稳定结构化事件源。
6. 在 ADR 中逐项记录“能读到/不能读到/证据/延迟/风险”。
7. 按以下决策树选择：

```text
官方/公开插件可用 → 选择官方插件适配
否则稳定 IPC 可独立实现 → 选择 IPC sidecar
否则聊天 target CDP 可读 → 选择 CDP adapter
否则 UIA 能读核心字段 → 选择 UIA adapter
否则 → 维持 OCR 主通道，停止私有桥接投入
```

8. 提交：`docs: record qianniu structured capture decision`。

**Gate 5A — 允许继续结构化适配：** 能读取店铺、客户、消息正文三项中的至少两项，并能稳定观察客户切换或新消息事件。

**Gate 5B — 必须停止深入：** 只有注入/修改第三方二进制、绕过签名或复用竞品私有实现才能继续。此时保持 OCR，不进入原生注入开发。

### Task 6：实现选定的千牛只读适配器骨架

**Skills:** `architecture-designer`, `Code`

**Files:**

- Create one selected adapter only:
  - `src/main/backend/services/adapters/qianniu/qianniuPluginAdapter.ts`, or
  - `src/main/backend/services/adapters/qianniu/qianniuIpcAdapter.ts`, or
  - `src/main/backend/services/adapters/qianniu/qianniuCdpAdapter.ts`, or
  - `src/main/backend/services/adapters/qianniu/qianniuUiaAdapter.ts`
- Create: `src/main/backend/services/adapters/qianniu/qianniuEventNormalizer.ts`
- Create matching tests under `src/__tests__/services/adapters/`
- Create optional sidecar only if ADR approves: `tools/qianniu-adapter/`

**Steps:**

1. 只创建 ADR 选中的一种 adapter，不同时实现四种猜测方案。
2. 用脱敏 fixture 写失败测试，覆盖店铺变化、客户变化、新消息、己方消息、商品链接。
3. 实现只读连接、断线和重连。
4. 将原始事件转换为统一 `PlatformEvent`。
5. adapter 的 `focusConversation/fillDraft/sendDraft` 此时返回明确的 `unsupported`。
6. 日志不得包含完整客户消息、cookie、token 或账号凭据。
7. 运行 adapter contract、router 和千牛 context tests。
8. 提交：`feat: add read-only qianniu structured adapter`。

**Gate 6:** adapter 可启动、停止、重连；只读事件可稳定标准化；没有任何写操作。

### Task 7：千牛影子采集与对比报告

**Skills:** `Code`, `computer-use`

**Files:**

- Create: `src/main/backend/services/capture/shadowComparator.ts`
- Create: `src/__tests__/services/capture/shadowComparator.test.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Create: `scripts/report-capture-shadow.ts`
- Create: `docs/architecture/qianniu-shadow-results.md`

**Steps:**

1. 写 shadow comparator 测试：同一会话、消息和切换在两来源间对齐。
2. 实现 `structured-shadow`，保证结构化事件不触发 AI。
3. 保存聚合指标，不保存原始消息。
4. 实机覆盖：A1→A2→A1、A店→B店→A店、连续文字、链接、商品卡片、图片、表情。
5. 覆盖最小化、恢复、移动到第二屏、千牛刷新和重启。
6. 至少运行 2 小时；正式切主前最终运行 8 小时。
7. 输出一致率、P50/P95 延迟、结构化独有、OCR 独有和冲突数量。
8. 提交：`test: compare qianniu structured capture against ocr`。

**Gate 7:** 客户识别 ≥99.5%，新文字消息捕捉 ≥99%，串客户 0，P95 ≤300ms，连续 8 小时无崩溃。

**失败分支:** 任何串客户都回到 Task 6；达不到捕捉率则维持 OCR 主通道，不进入 Task 8。

### Task 8：切换千牛主采集并保留 OCR 兜底

**Skills:** `architecture-designer`, `Code`

**Files:**

- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/services/companionContextRegistry.ts`
- Modify: `src/main/backend/services/qianniuHealth.ts`
- Modify: `src/main/backend/backend.ts`
- Test: `src/__tests__/services/capture/captureRouter.test.ts`
- Test: `src/__tests__/services/companionContextRegistry.test.ts`
- Test: `src/__tests__/services/qianniuHealth.test.ts`

**Steps:**

1. 写从 structured-active 降级到 ocr-active 的集成测试。
2. 写恢复后先进入 shadow、验证后再 active 的测试。
3. 把统一事件映射到现有 `CompanionContextRegistry.observe()`。
4. 保留 `generationEpoch` 和 `contextRevision`，切换来源时不错误提升会话版本。
5. 保证降级期间不并发生成两条回复。
6. API 暴露当前 source、最后事件时间、降级原因和恢复状态。
7. 运行全部 capture/companion/qianniu tests。
8. 提交：`feat: prefer structured qianniu capture with ocr fallback`。

**Gate 8:** 主通道断开 3 秒内降级；恢复不丢消息、不重复生成。

### Task 9：建立统一会话时间线和真实问答配对

**Skills:** `architecture-designer`, `Code`

**Files:**

- Create: `src/main/backend/entities/conversationEvent.ts`
- Create: `src/main/backend/services/conversationTimelineService.ts`
- Create: `src/main/backend/services/questionAnswerPairing.ts`
- Create: `src/__tests__/services/conversationTimelineService.test.ts`
- Create: `src/__tests__/services/questionAnswerPairing.test.ts`
- Modify: database initialization file discovered in Task 0

**Steps:**

1. 创建 append-only 会话事件实体，保存结构化身份、方向、内容类型、产品引用和来源；敏感字段遵循现有 privacy service。
2. 写测试：客户连续两问、客服一答不能错误配成两条已回答问答。
3. 写测试：客户链接和商品卡片保留 contentType，不降级成普通问句。
4. 写测试：切换客户后问答历史绝不混合。
5. 实现最小配对状态：`unanswered / suggested / filled / sent / manually-answered / ignored`。
6. 迁移采用现有项目的 `checkAndAddFields` 兼容风格，不能破坏旧数据库。
7. 提交：`feat: persist customer conversation timeline`。

**Gate 9:** 任意客户再次打开时能恢复其真实问题、回答和状态；不同客户数据隔离。

### Task 10：精确跳转平台、店铺、账号和客户

**Skills:** `computer-use`, `Code`

**Files:**

- Create: `src/main/backend/services/conversationNavigationService.ts`
- Modify selected QianNiu adapter from Task 6
- Modify: `src/main/backend/backend.ts`
- Modify: `src/renderer/common/services/platform/controller.ts`
- Modify: `src/renderer/common/services/platform/platform.d.ts`
- Modify: `src/renderer/main-window/components/CompactReceptionWorkbench.tsx`
- Create: `src/__tests__/services/conversationNavigationService.test.ts`

**Steps:**

1. 写失败测试：错误店铺或账号即使客户昵称相同也不能视为成功。
2. 实现 navigation sequence：激活客户端 → 选择账号/店铺 → 选择客户 → 等待 header 更新 → 校验完整 identity。
3. API 返回分阶段结果和具体失败原因，不只返回 boolean。
4. 工作台点击后立即显示“正在切换”，成功后高亮，失败时保持原客户且展示原因。
5. 成功后将焦点留在真实输入框；若 adapter 尚无写能力，仅定位会话并报告 `input-not-focusable`。
6. 实机验证 A1→A2→A1、A店→B店→A店各 30 次。
7. 提交：`feat: navigate pending replies to exact conversation`。

**Gate 10:** 100 次混合切换零串客户；P95 ≤300ms（结构化）或记录当前通道能力。

### Task 11：点击回答直接填入当前客户输入框

**Skills:** `Code`, `computer-use`, `security-auditor`

**Files:**

- Create: `src/main/backend/services/conversationDraftDelivery.ts`
- Modify selected QianNiu adapter
- Modify: `src/main/backend/services/deliveryContextGuard.ts`
- Modify: `src/main/backend/backend.ts`
- Modify: `src/renderer/common/services/platform/controller.ts`
- Modify: `src/renderer/companion-window/App.tsx`
- Create: `src/__tests__/services/conversationDraftDelivery.test.ts`

**Required algorithm:**

```text
点击回答卡片
→ 读取回答绑定 identity + contextRevision
→ 读取实时 identity
→ 完整一致才聚焦输入框
→ 写入并触发平台所需 input/change 事件
→ 再读实时 identity
→ 仍一致则返回 filled
→ 否则清空本次写入（如果可以确认安全）并转人工
```

**Steps:**

1. 写切换客户期间点击旧回答必须拒绝的测试。
2. 写填入前一致、填入后不一致必须失败的测试。
3. 复用现有 `DeliveryContextGuard`，不要创建第二套身份规则。
4. 删除/隐藏独立 AI 草稿 textarea；回答卡片本身成为填入操作面。
5. 成功、失败、已失效提供清晰即时反馈。
6. 实机验证生成期间切换客户、生成后切换客户、A→B→A。
7. 提交：`feat: fill generated replies into verified conversation`。

**Gate 11:** 100 次点击填入零错客户；P95 ≤200ms；任何不确定身份都拒绝操作。

### Task 12：在同一交付链路上增加自动发送

**Skills:** `Code`, `computer-use`, `security-auditor`

**Files:**

- Modify: `src/main/backend/services/conversationDraftDelivery.ts`
- Modify: `src/main/backend/services/replySafetyPolicy.ts`
- Modify: `src/main/backend/services/deliveryGuard.ts`
- Modify selected QianNiu adapter
- Modify: `src/main/backend/backend.ts`
- Test: `src/__tests__/services/automaticDeliverySafety.test.ts`
- Create: `src/__tests__/services/automaticDeliveryIdempotency.test.ts`

**Steps:**

1. 写幂等测试：同一回答的重试不能发送两次。
2. 写发送前客户切换必须取消的测试。
3. 自动模式复用 Task 11 的 fill，不创建第二套填入代码。
4. 发送后从结构化 outgoing event 或可靠的回读结果确认成功。
5. 未确认成功时不自动重复发送，任务转人工接待。
6. 只有用户明确开启自动模式且 Gate 11 通过才可进入此分支。
7. 单店铺辅助 → 多店铺辅助 → 单店铺自动 → 多店铺自动逐级灰度。
8. 提交：`feat: send verified replies with idempotent confirmation`。

**Gate 12:** 串客户 0、重复发送 0、未确认发送能转人工、连续 8 小时稳定。

### Task 13：重构右侧伴随助手的信息架构

**Skills:** `ui-ux-pro-max`, `frontend-design`, `Code`

**Files:**

- Modify: `src/renderer/companion-window/App.tsx`
- Modify: `src/renderer/companion-window/companionSelection.ts`
- Create: `src/renderer/companion-window/components/CompanionHeader.tsx`
- Create: `src/renderer/companion-window/components/ProductContextPanel.tsx`
- Create: `src/renderer/companion-window/components/ConversationTimeline.tsx`
- Create: `src/renderer/companion-window/components/QuestionAnswerCard.tsx`
- Create: `src/renderer/companion-window/components/CaptureStatus.tsx`
- Create corresponding component tests

**Layout order:**

1. 店铺名。
2. 客户 ID。
3. 商品搜索/当前咨询商品/一键发送链接。
4. 商品知识与商品详情。
5. 模式选择和对当前客户禁用自动回复。
6. 按时间排序的真实问答卡片。
7. 底部人工/辅助/自动模式。

**Steps:**

1. 先用现有数据做静态组件测试，不改变 backend。
2. 去掉重复客户 ID 和大型 AI 草稿框。
3. 客户消息使用“问”，回复使用“答”；链接使用链接/商品视觉类型。
4. 点击回答卡片调用 Task 11 API。
5. 显示 `未回答/生成中/可填入/已填入/已发送/人工回复/失效`。
6. source 状态只用简洁用户语言：实时连接、兼容模式、正在重连、未连接。
7. 伴随窗口窄宽度下不横向滚动，关键按钮保持可点击。
8. 截图验证与用户参考图的信息层级一致，但不复制竞品品牌和素材。
9. 提交：`feat: present realtime question answer companion timeline`。

**Gate 13:** 用户能一眼确认店铺、客户、问题、回答、商品和当前状态；回答可点击填入。

### Task 14：完善左侧聚合接待和多屏窗口行为

**Skills:** `ui-ux-pro-max`, `frontend-design`, `computer-use`, `Code`

**Files:**

- Modify: `src/renderer/main-window/components/CompactReceptionWorkbench.tsx`
- Modify: `src/renderer/main-window/components/layout/MainLayout.tsx`
- Modify: `src/renderer/main-window/components/layout/AppSidebar.tsx`
- Modify: `src/main/services/windowDockingService.ts`
- Modify: `src/main/windows/companion-main/index.ts`
- Test: `src/__tests__/services/windowDockingService.test.ts`
- Create component tests for compact workbench

**Steps:**

1. 默认主工作台以左侧 compact 模式打开；用户设置可持久化。
2. 提供待回复/已回复/账号连接页签。
3. 按平台分组店铺和账号，显示实时连接、兼容模式或断开。
4. 点击待回复记录调用 Task 10，不只激活平台窗口。
5. 提供展开大屏、重新吸附、自由拖动按钮。
6. 多屏坐标使用 Electron virtual desktop bounds；右侧超出当前屏时允许进入相邻显示器。
7. 单屏且自然超出可视区域时允许裁切，不自动翻到左侧，除非用户主动选择左侧。
8. 验证 100%、125%、150% DPI 和第二显示器在左/右/上方三种布局。
9. 提交：`feat: complete docked multi-store reception workspace`。

**Gate 14:** 默认左右对称吸附、点击客户精确跳转、多屏行为符合用户已确认规则。

### Task 15：商品上下文和一键发送商品链接

**Skills:** `architecture-designer`, `Code`, `computer-use`

**Files:**

- Create: `src/main/backend/services/productContextService.ts`
- Modify: `src/main/backend/entities/productKnowledge.ts`
- Modify: `src/main/backend/backend.ts`
- Modify: `src/renderer/common/services/platform/controller.ts`
- Modify: `src/renderer/companion-window/components/ProductContextPanel.tsx`
- Create: `src/__tests__/services/productContextService.test.ts`

**Steps:**

1. 写测试：客户发商品 URL 时解析平台和 product ID，不将 URL 当普通问句。
2. 写测试：相同店铺商品去重，不同店铺相同 product ID 保持隔离。
3. 从结构化事件优先获取商品标题、图片、属性和 URL；缺失时再用已有知识或轻量抓取。
4. 商品详情抓取使用缓存和过期时间，不随每条消息重复抓取。
5. 一键发送链接复用 Task 11/12 的身份验证交付链路。
6. UI 展示当前咨询商品、商品知识、商品详情和最近商品列表。
7. 提交：`feat: capture and deliver product conversation context`。

**Gate 15:** 客户商品链接类型正确，当前商品不串店铺，一键发送不会发给错误客户。

### Task 16：完成知识候选、审核、编辑和导出闭环

**Skills:** `architecture-designer`, `Code`

**Files:**

- Modify: `src/main/backend/entities/knowledgeCandidate.ts`
- Modify: `src/main/backend/entities/storeKnowledge.ts`
- Modify: `src/main/backend/services/knowledgeCandidateService.ts`
- Modify: `src/main/backend/services/knowledgeExportService.ts`
- Modify: `src/main/backend/services/replyFeedbackService.ts`
- Modify: `src/renderer/main-window/components/KnowledgeCandidates/index.tsx`
- Modify: `src/renderer/main-window/components/StoreKnowledgeBase/index.tsx`
- Test existing knowledge tests and add `conversationKnowledgeAccumulation.test.ts`

**Required candidate fields:**

- 标准问题、相似问法、最终回答；
- platform/store/product 范围；
- 来源会话和 evidence reply IDs；
- AI 初稿、客服最终发送稿的差异摘要；
- 使用次数、采纳次数、最近使用时间；
- pending/approved/rejected/merged/disabled；
- 创建、审核、修改时间和版本。

**Steps:**

1. 只从 `sent` 或明确人工确认的问答生成候选。
2. “好的、谢谢、表情、纯链接”等低价值内容默认不生成候选。
3. 按平台、店铺、商品、标准化问题做去重和合并建议。
4. 审核通过后再进入正式知识库和 RAG；拒绝不删除证据。
5. 保留人工查看、编辑、合并、停用、回滚。
6. 导出至少支持 JSON 和 CSV；如果现有 Excel 导出稳定则保留。
7. 导入必须先预览冲突，不直接覆盖。
8. 运行全部 knowledge tests。
9. 提交：`feat: close the reviewed conversation knowledge loop`。

**Gate 16:** 最终采用回答可以追溯、审核、编辑和导出；AI 初稿不会未经审核污染知识库。

### Task 17：诊断、自愈和用户可见状态

**Skills:** `Code`, `ui-ux-pro-max`

**Files:**

- Create: `src/main/backend/services/capture/captureDiagnostics.ts`
- Modify: `src/main/backend/services/platformHealth.ts`
- Modify: `src/main/backend/services/qianniuHealth.ts`
- Modify: `src/main/backend/backend.ts`
- Modify: `src/renderer/companion-window/components/CaptureStatus.tsx`
- Create: `src/renderer/main-window/components/CaptureDiagnostics/index.tsx`
- Create tests for diagnostics and redaction

**Diagnostics fields:**

- 当前平台和 adapter；
- route state；
- 当前店铺/账号/客户；
- 最近客户切换和消息时间；
- P50/P95 采集延迟；
- OCR 延迟；
- 最近降级原因；
- 重连次数；
- 一键重新探测；
- 脱敏诊断包导出。

**Steps:**

1. 写脱敏测试，确保完整消息、token、cookie 不进入诊断包。
2. 实现 stale detection：超过阈值没有事件时不能继续显示“实时正常”。
3. 实现退避重连，避免每秒启动新进程或连接。
4. source 恢复后先 shadow 验证，再 active。
5. UI 只展示简洁状态，技术细节放诊断页。
6. 提交：`feat: expose capture health and self recovery`。

**Gate 17:** 用户能明确知道“为什么没识别”，系统能自动降级和恢复。

### Task 18：其他平台逐个平台迁移

**Skills:** `architecture-designer`, `Code`, `computer-use`, `writing-plans`

**Files:**

- Create per-platform ADR and adapter under `src/main/backend/services/adapters/<platform>/`
- Modify existing sidecar services only after adapter contract tests exist:
  - `jinmaiSidecarService.ts`
  - `pddSidecarService.ts`
  - `douyinSidecarService.ts`
  - `wecomSidecarService.ts`
  - `wechatSidecarService.ts`

**Order:**

1. 京麦。
2. 拼多多。
3. 抖音。
4. 企业微信。
5. 微信。

**Steps per platform:**

1. 单独创建一页 ADR，不假设千牛方案可复用。
2. 只读 probe。
3. 用统一 adapter contract 包装现有采集。
4. 影子对比。
5. 达到本平台 Gate 后切主。
6. 再实现 navigation/fill/send capability。
7. 运行跨平台相同客户昵称和多账号隔离测试。
8. 每个平台单独提交，不创建“万能 DOM 适配器”。

**Gate 18:** 一个平台完成全部 Gate 后才开始下一个；失败的平台保留当前可靠通道。

### Task 19：全量回归、性能验收、打包和发布准备

**Skills:** `Code`, `computer-use`, `security-auditor`, `ponytail-review`, `github:yeet`

**Files:**

- Create: `docs/testing/realtime-customer-service-acceptance.md`
- Update: `README.md`
- Update: `README_EN.md` if current project continues maintaining it
- Update: `CHANGES-SUMMARY.md`
- Update version files only after user confirms release version

**Automated commands:**

```powershell
pnpm test -- --runInBand
pnpm typecheck
pnpm lint
pnpm build
pnpm package
pnpm check:package
git diff --check
```

**Manual matrix:**

- 人工、辅助、自动三种模式；
- A1→A2→A1；
- A店→B店→A店；
- 多个平台相同客户昵称；
- 连续文字、链接、图片、表情、商品卡片；
- AI 生成期间切换客户；
- 回答生成后再切换客户；
- 点击左侧待回复并填入；
- 自动发送确认；
- 客户端最小化、恢复、重启、重新登录；
- 主通道断线、OCR 接管、主通道恢复；
- 单屏和双屏、不同 DPI；
- 10 个同时在线店铺/账号上下文；
- 8 小时稳定性运行。

**Steps:**

1. 先运行最小相关测试，再全量测试。
2. lint 若失败，确认是否为既有 `.erb/scripts/check-node-env` 类型声明问题；不得将新 lint 错误混入既有基线。
3. 用 `ponytail-review` 删除重复路由、重复 guard 和不必要抽象。
4. 用 `security-auditor` 重点审核身份校验、IPC 输入和发送幂等。
5. 打包到新的测试目录，不直接覆盖稳定运行目录。
6. 安装并实机完成验收后，才替换：`D:\yingbokefu\yingbo-smart-customer-service-runtime\迎波智能客服.exe`。
7. 只有用户明确授权 GitHub 发布时才 push/tag/release。
8. Release 标题、版本号和说明由用户最终确认；不自行假定为 v2.6.0。

**Final Gate:** 全部自动测试通过；所有人工阻断场景通过；串客户、错填入、重复发送均为 0。

## 9. 测试策略

### 9.1 单元测试

- 会话键与身份隔离；
- 事件标准化；
- 去重；
- 路由状态机；
- shadow 对比；
- context revision；
- draft/send guard；
- 问答配对；
- 商品 URL 类型；
- 知识候选过滤和合并；
- 诊断脱敏。

### 9.2 契约测试

所有平台 adapter 使用同一测试套件验证：

- `start()` 和 `stop()` 幂等；
- 断线只报告一次；
- 事件身份完整；
- `fillDraft()` 不隐式发送；
- `sendDraft()` 只能在已填入且 identity 一致时运行；
- unsupported capability 返回明确结果，不能抛出未处理异常。

### 9.3 脱敏回放测试

- 保存经过替换的结构化事件 fixture，不保存真实店铺/客户内容。
- 每次平台升级先用旧 fixture 回归，再采集新版本 fixture。
- fixture 必须带 client version、adapter version 和 sourceRevision。

### 9.4 实机测试

实机测试是结构化适配的必需项，不能只靠 mock 判定 Gate 通过。每次实机结果写入 acceptance 文档，包含版本、持续时间、样本数和失败案例。

## 10. Feature Flags 与回退

至少提供以下配置：

```ts
captureRouterEnabled: boolean;
qianniuStructuredCaptureEnabled: boolean;
qianniuStructuredShadowEnabled: boolean;
conversationNavigationEnabled: boolean;
verifiedDraftFillEnabled: boolean;
verifiedAutoSendEnabled: boolean;
conversationTimelineV2Enabled: boolean;
```

规则：

- 默认只逐级打开已经通过 Gate 的 flag。
- 自动发送默认关闭。
- 出现事故时可以单独关闭结构化采集、跳转、填入或发送，不需要降级整个应用。
- 数据库迁移必须向前兼容；关闭新功能后旧版本仍能读取核心数据。

## 11. 观测字段与日志约束

允许记录：

- 会话键哈希；
- message ID 哈希；
- 内容长度和 contentType；
- 来源和 adapter 版本；
- 延迟；
- 状态变化；
- 错误码和降级原因。

默认不记录：

- 完整客户消息；
- cookie、token、登录信息；
- 完整商品订单地址；
- 客户手机号；
- 平台本地存储内容。

用户主动导出诊断时仍应脱敏。

## 12. 提交顺序

建议 Conventional Commits：

```text
chore: checkpoint realtime companion foundation
test: establish qianniu capture baseline
feat: add platform capture contracts
feat: route capture events with deterministic fallback
refactor: adapt qianniu ocr to capture contract
docs: record qianniu structured capture decision
feat: add read-only qianniu structured adapter
test: compare qianniu structured capture against ocr
feat: prefer structured qianniu capture with ocr fallback
feat: persist customer conversation timeline
feat: navigate pending replies to exact conversation
feat: fill generated replies into verified conversation
feat: send verified replies with idempotent confirmation
feat: present realtime question answer companion timeline
feat: complete docked multi-store reception workspace
feat: capture and deliver product conversation context
feat: close the reviewed conversation knowledge loop
feat: expose capture health and self recovery
test: complete realtime customer service acceptance
docs: document realtime capture recovery and operations
```

不得把所有改动压成一个大提交，也不得为了让 CI 通过删除既有测试。

## 13. 时间和执行批次估算

| 批次 | 内容 | 预计开发日 | 关键不确定性 |
|---|---|---:|---|
| A | Task 0–4 基线与统一层 | 3–5 | 现有脏工作区和测试基线 |
| B | Task 5 千牛结构化探针 | 2–5 | 是否存在可维护接口 |
| C | Task 6–8 只读、影子和切主 | 5–10 | 客户端版本兼容 |
| D | Task 9–12 时间线、跳转、填入和发送 | 5–8 | 写操作身份确认 |
| E | Task 13–17 UI、商品、知识、诊断 | 5–8 | 真实数据联调 |
| F | Task 18 其他平台 | 每平台 3–8 | 各平台技术完全不同 |
| G | Task 19 全量验收和发布 | 2–4 | 8 小时稳定性测试 |

千牛主线约 22–40 个开发日；其他平台按适配难度单独累加。日历时间不能替代 Gate。

## 14. 进度台账

执行模型每完成一项必须更新。允许状态：`PENDING`、`IN_PROGRESS`、`BLOCKED`、`DONE`、`FALLBACK_DONE`。

| Task | 状态 | 提交 | 测试/证据 | 备注 |
|---:|---|---|---|---|
| 0 | DONE | `847c14f` | `docs/architecture/realtime-capture-baseline.md` | 工作区保护与基线；未创建全量 checkpoint commit，保留原有脏改动 |
| 1 | DONE | `847c14f` | `captureTrace.test.ts`、`captureMetrics.test.ts`、`pnpm.cmd typecheck` | 增加脱敏延迟 trace 和 baseline 输出脚本 |
| 2 | DONE | `847c14f` | `capture` 套件 3 tests、typecheck | 统一事件、会话键和 adapter contract |
| 3 | DONE | `847c14f` | `capture` 套件 8 tests、typecheck、diff check | 去重、单主通道路由、health/stale 状态 |
| 4 | DONE | `4fd48d9` + existing service diff | `qianniuOcrAdapter.test.ts`、capture/cdp tests、typecheck | 复用常驻 worker 的 snapshot adapter；路由通过 `QIANNIU_CAPTURE_ROUTER=1` 选择性启用 |
| 5 | DONE | `4fd48d9` | `probe-qianniu-structure.ps1`、`probe-qianniu-process-tree.ps1`、ADR-002 | 普通外部 CDP 四端口均拒绝；AliRender 未继承调试参数 |
| 6 | FALLBACK_DONE | `4fd48d9` + ADR-002 | 13 suites/51 tests；typecheck | 不进入私有注入/竞品协议；千牛当前保留 OCR fallback，等待官方/公开插件接口 |
| 7 | DONE | pending | `shadowComparator.test.ts`、capture tests、typecheck | 通用影子比较器和脱敏报告脚本已完成；当前无千牛结构化样本，因此不宣称影子 Gate 通过 |
| 8 | FALLBACK_DONE | pending | `QIANNIU_CAPTURE_ROUTER=1` 可选接入、health route 输出、typecheck | 结构化主链路不可用；OCR adapter 可进入统一 router，未宣称实时结构化通过 |
| 9 | DONE | pending | `conversationTimelineService.test.ts`、timeline API、typecheck | 使用现有 ReplySuggestion 持久化客户问题/回答，按客户上下文隔离并显示状态 |
| 10 | DONE | pending | `focusConversation`、delivery/context tests、typecheck | 左侧聚合跳转增加店铺/账号/客户二次校验；仍使用现有 OCR 坐标兼容动作 |
| 11 | IN_PROGRESS | pending | `conversationDraftDelivery.test.ts`、delivery/context tests、typecheck | 点击回答已改为先校验草稿绑定与当前客户，再填入；真实千牛 100 次 Gate 尚未执行 |
| 12 | IN_PROGRESS | pending | `automaticDeliverySafety.test.ts`、`conversationDraftDelivery.test.ts`、typecheck | 自动发送复用同一校验与幂等状态；真实千牛 8 小时稳定性 Gate 尚未执行 |
| 13 | DONE | pending | companion UI typecheck；问答历史与单一点击回复卡 | 伴随助手显示店铺名→客户 ID、实时状态、问答历史、三种回复模式；移除重复隐藏草稿框 |
| 14 | DONE | pending | window docking tests、typecheck | 工作台默认可左侧吸附/自由悬浮/展开大屏；伴随助手支持按平台跟随和多屏边界 |
| 15 | DONE | pending | typecheck；商品上下文组件 | 当前商品、知识问答数量、详情打开和一键发送链接；无商品时明确降级提示 |
| 16 | DONE | pending | knowledge governance/export routes、candidate feedback flow | 仅对已填入/已发送反馈进入候选；候选可人工审核、编辑、拒绝；知识库可导出/导入 |
| 17 | DONE | pending | capture health tests、typecheck | 伴随助手展示采集源、状态、扫描耗时、错误和当前会话；支持刷新恢复 |
| 18 | PENDING | - | - | 其他平台逐个迁移 |
| 19 | PENDING | - | - | 验收、打包、发布准备 |

#### Gate 4 — 2026-08-03

- Decision: PASS
- Evidence: `QianniuOcrAdapter` 复用现有 resident worker，不创建第二个 OCR loop；默认 flag 关闭，开启后才进入 router
- Test commands: adapter、capture、CDP、千牛策略、context、delivery tests
- Metrics: 13 suites passed, 51 tests passed；typecheck passed
- Selected next task: Task 5
- Commit: `4fd48d9`（`qianniuCompatService.ts` 的既有混合改动仍保持未提交，未覆盖）

#### Gate 5 / 6 — 2026-08-03

- Decision: FALLBACK
- Evidence: `AliWorkbench.exe` PID 144 包含 `--remote-debugging-port=9333`，但 `AliRender.exe` 未继承；9222/9229/9333/9515 均 `ECONNREFUSED`
- Decision: 不进入进程注入、私有 Mojo/IPC 逆向或竞品二进制复用；完成 OCR fallback adapter
- Selected next task: Task 7（OCR fallback 影子指标与统一上下文验证）
- Commit: `4fd48d9`

#### Gate 7 — 2026-08-03

- Decision: FALLBACK_FOUNDATION
- Evidence: comparator 能按会话、message ID/时间桶比对 structured/OCR，报告只保留计数、冲突和延迟；当前千牛没有 structured source 可做 8 小时实测
- Test commands: `pnpm.cmd test -- --runInBand src/__tests__/services/capture`; `pnpm.cmd typecheck`
- Metrics: 6 suites passed, 10 tests passed
- Selected next task: Task 9（问答时间线；Task 8 的 structured-active 暂不启用）
- Commit: pending

#### Gate 8–10 — 2026-08-03

- Decision: FALLBACK_DONE / PASS
- Evidence: OCR adapter 可选进入 router；timeline endpoint 查询当前 conversation；千牛 focusConversation 在选择后复核客户、店铺和账号
- Test commands: `pnpm.cmd typecheck`; `pnpm.cmd test -- --runInBand src/__tests__/services/conversationTimelineService.test.ts src/__tests__/services/deliveryContextGuard.test.ts`
- Metrics: 9 tests passed；typecheck passed
- Limitation: 普通 CDP 不可用，因此 Task 8 的 structured-active 指标仍未达成
- Selected next task: Task 11（点击回答填入与交付幂等）
- Commit: pending

#### Task 11–12 implementation checkpoint — 2026-08-03

- Decision: IN_PROGRESS
- Implemented: `prepareDraftDelivery` bounds reply content to 300 characters and rejects empty or switched conversations before fill/send; unattended send now uses the same verified content and existing atomic delivery reservation.
- UI: removed the hidden duplicate AI draft textarea; the visible answer card remains the single click-to-fill entry point.
- Test commands: `pnpm.cmd typecheck`; `pnpm.cmd test -- --runInBand src/__tests__/services/conversationDraftDelivery.test.ts src/__tests__/services/automaticDeliverySafety.test.ts src/__tests__/services/deliveryContextGuard.test.ts`
- Metrics: 3 suites passed, 11 tests passed; typecheck passed.
- Limitation: live千牛点击填入/自动发送 Gate 11/12 still requires a real-client run; ordinary external CDP remains unavailable and OCR coordinates remain the fallback action channel.
- Selected next task: Task 13（伴随助手 UI 与商品上下文）

#### Task 13–17 implementation checkpoint — 2026-08-03

- Decision: DONE（实现完成；真实多平台长时间运行留在 Task 18/19 验收）
- Implemented: companion answer card is the only click-to-fill entry; hidden duplicate draft editor removed. Header separates store name and customer ID. Recent messages and persisted question/answer timeline are visible per conversation.
- Workbench: left-docked compact reception list is integrated with click-to-focus navigation, platform/account grouping, free-float and expand controls.
- Product: current product context shows matched knowledge count, opens product detail, and can send a Taobao product URL to the verified current QianNiu contact.
- Knowledge: existing manual candidate governance and CSV/JSON knowledge export/import remain the controlled accumulation path; no unreviewed auto-publish was added.
- Diagnostics: health details expose route source, stale status, scan latency, last error, and current session.
- Test command: `pnpm.cmd typecheck` passed; targeted timeline/delivery tests passed.
- Limitation: live client acceptance and other-platform per-adapter gates are still pending.
- Selected next task: Task 18（其他平台逐个迁移与回归）

### 已完成 Gate 记录

#### Gate 0 — 2026-08-03

- Decision: PASS
- Test commands: `git diff --check`; `pnpm.cmd test -- --runInBand`（相关 6 suites）
- Metrics: 6 suites passed, 40 tests passed
- Failures observed: PowerShell 直接执行 `pnpm` 被执行策略阻止，改用 `pnpm.cmd`
- Selected next task: Task 1
- Commit: `847c14f`（工作区包含既有未提交改动，Task 0 未创建全量 checkpoint）

#### Gate 1 — 2026-08-03

- Decision: PASS
- Test commands: `pnpm.cmd test -- --runInBand src/__tests__/services/cdp/captureMetrics.test.ts src/__tests__/services/cdp/captureTrace.test.ts`; `pnpm.cmd typecheck`
- Metrics: 2 suites passed, 3 tests passed
- Evidence: `CaptureTrace` 只保存阶段和耗时；`benchmark-qianniu-capture.ts` 输出脱敏 snapshot
- Selected next task: Task 2
- Commit: `847c14f`

#### Gate 2 — 2026-08-03

- Decision: PASS
- Test commands: `pnpm.cmd test -- --runInBand src/__tests__/services/capture`; `pnpm.cmd typecheck`
- Metrics: 2 suites passed, 3 tests passed
- Evidence: 统一事件、会话键和 adapter contract 已建立
- Selected next task: Task 3
- Commit: `847c14f`

#### Gate 3 — 2026-08-03

- Decision: PASS
- Test commands: `pnpm.cmd test -- --runInBand src/__tests__/services/capture`; `pnpm.cmd typecheck`; `git diff --check`
- Metrics: 5 suites passed, 8 tests passed
- Evidence: 真实 message ID 去重、无 ID 指纹去重、影子事件不进入业务、recovering 状态阻止投递、health stale 检测
- Selected next task: Task 4
- Commit: `847c14f`

## 15. 实测指标台账模板

| 日期 | 客户端版本 | Adapter 版本 | 样本数 | 客户切换 P95 | 消息捕捉 P95 | 捕捉率 | 串客户 | 重复事件 | 持续时间 | 结论 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| - | - | - | - | - | - | - | - | - | - | 未测试 |

## 16. 决策记录模板

每次 Gate 使用以下格式追加，不能只写“已通过”：

```markdown
### Gate N — YYYY-MM-DD

- Decision: PASS / FAIL / FALLBACK
- Client version:
- Adapter/source:
- Test commands:
- Sample size:
- Metrics:
- Failures observed:
- Selected next task:
- Commit:
```

## 17. 最终完成定义

只有下列项目全部满足，目标模式才能把整项工作标记为完成：

- 千牛已使用经过实测的最佳结构化通道，或已由 Gate 证明不可行并稳定回退；
- OCR 不再阻塞正常实时链路，但在故障时可以接管；
- 点击左侧客户能精确跳转到平台、店铺、账号和客户输入框；
- 伴随助手实时显示正确店铺、客户、真实问题和对应回答；
- 点击回答可填入，自动模式可在验证后发送；
- 商品链接、商品知识和商品详情类型正确并可一键发送；
- 问答历史按客户隔离并可恢复；
- 有效问答进入可审核、查看、编辑和导出的知识闭环；
- 单屏、多屏、不同 DPI 和客户端重启场景通过；
- 8 小时稳定性测试通过；
- 串客户、错填入、重复发送均为 0；
- 测试、文档、打包检查通过；
- 最终运行包经过用户实机验收；
- GitHub 发布仅在用户授权后完成。

---

## Execution handoff

在新的 Luna 会话中使用以下指令即可开始：

```text
请进入目标模式，完整读取 docs/plans/2026-08-03-multiplatform-realtime-customer-service-master-plan.md，加载其中“所需技能清单”的等价能力，从 Task 0 开始持续执行。严格按 Gate 自动继续或回退，保护现有未提交改动，每完成一个 Task 更新计划内进度台账并提交。除计划明确要求暂停的高风险条件外，不要重复向我确认，也不要跳过实机测试、客户一致性校验或 8 小时稳定性 Gate。最终完成定义全部满足后再结束目标。
```
