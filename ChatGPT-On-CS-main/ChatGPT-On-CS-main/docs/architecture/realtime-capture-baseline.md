# 实时采集改造基线

> 本文由 Task 0 建立，记录开始结构化采集改造前的工作区和测试基线。不要把既有未提交改动视为待清理内容。

## 工作区

- Git 根目录：`work/source`
- 产品目录：`work/source/ChatGPT-On-CS-main/ChatGPT-On-CS-main`
- 当前分支：`agent/product-maturity-v2-1-0`
- 建立日期：2026-08-03
- 现有工作区：存在此前千牛兼容、伴随助手、左侧工作台和 CDP 探针改动。
- 处理原则：不 reset、不 checkout、不覆盖、不批量提交无法确认归属的文件。

## 现有相关改动

当前 diff 主要涉及：

- 千牛 OCR 采集、上下文跟踪、健康状态和发送脚本；
- 伴随助手上下文、回复安全和窗口吸附；
- 左侧接待工作台和平台控制器；
- CDP 连接、端点探针、采集指标和相关测试；
- 本总计划及前两份实时体验计划。

## 基线检查

执行命令：

```powershell
git diff --check
pnpm.cmd test -- --runInBand src/__tests__/services/cdp src/__tests__/services/qianniuCapturePolicy.test.ts src/__tests__/services/qianniuContextTracker.test.ts src/__tests__/services/deliveryContextGuard.test.ts
```

结果（2026-08-03）：

- `git diff --check`：通过。
- Jest：6 个测试套件通过，40 个测试通过，0 个失败。
- 覆盖：CDP connection、CDP endpoint probe、capture metrics、千牛 capture policy、千牛 context tracker、delivery context guard。
- PowerShell 直接执行 `pnpm` 受执行策略限制；后续统一使用 `pnpm.cmd`。

## 当前已知问题

- 当前尚未有稳定的千牛结构化聊天事件源。
- 普通 CDP 启动参数曾只传到 `AliWorkbench.exe`，承载聊天的 `AliRender.exe` 未开放可连接端口。
- OCR 仍可能产生较高延迟、低置信度、重复和跨客户风险。
- `pnpm lint` 可能受到既有 `.erb/scripts/check-node-env` 类型声明问题影响；每次必须区分新错误和基线错误。

## Task 0 结论

工作区已完成保护和基线记录，可以进入 Task 1–3。由于存在未提交改动，本次不创建“全量 checkpoint commit”；后续每个 Task 只提交本 Task 明确新增或修改且经过审查的文件。
