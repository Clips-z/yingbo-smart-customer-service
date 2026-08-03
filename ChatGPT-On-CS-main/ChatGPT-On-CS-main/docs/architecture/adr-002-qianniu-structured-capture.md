# ADR-002：千牛结构化采集通道

- 状态：`DECIDED-FALLBACK`
- 日期：2026-08-03
- 决策人：迎波智能客服项目
- 关联计划：`docs/plans/2026-08-03-multiplatform-realtime-customer-service-master-plan.md`

## 背景

当前千牛主链路使用常驻 Windows OCR worker。它能提供截图、候选客户和最近消息，但仍存在延迟、低置信度、链接识别和跨客户风险。普通 CDP 启动参数已经做过初步验证，但尚未证明能够连接承载聊天的 `AliRender.exe`。

## 允许的研究范围

- 只读取本机进程树、公开命令行、监听端口、公开配置和可连接的本地端点。
- 第一轮只读取店铺、账号、客户、消息、商品链接和输入框能力。
- 不复制、解包复用或修改多脉等竞品二进制和私有代码。
- 不注入第三方平台进程，不绕过签名、登录、防护或风控。
- 不自动点击客户、填入输入框或发送消息。

## 已知证据

| 检查项 | 结果 | 证据 |
|---|---|---|
| AliWorkbench 接收远程调试参数 | 已观察到 | PID 144 命令行包含 `--remote-debugging-port=9333` |
| AliRender 继承并开放普通 CDP | 未观察到 | 9333、9222、9229、9515 全部 `ECONNREFUSED`；AliRender 命令行没有 remote-debugging 参数 |
| 千牛顶层 UIA 子树 | 空或不可用 | `千牛工作台 Qt5152QWindowToolSaveBits` 检查 |
| OCR 常驻 worker | 可用 | `src/main/backend/services/qianniuCaptureWorker.ts` |
| 统一事件/路由基础 | 已完成 | 提交 `847c14f` |

## 探针结果（2026-08-03）

- 客户端版本：Qianniu/9.96.00N
- 进程树：AliWorkbench PID 144 → AliRender PID 34788；多个 renderer/utility 子进程
- CDP 端口：9222、9229、9333、9515 均未监听
- 可连接 target：无
- 可读字段：普通外部 CDP 读取不到；已有 OCR 能读取候选消息和窗口截图
- 消息事件是否稳定：未发现结构化事件入口
- 输入框是否可定位：现有 PowerShell 坐标兼容链路可用；结构化输入框未验证
- 连续观察时长：进程和端口探针完成；未进行写操作
- P50/P95 延迟：结构化通道无样本；OCR 基线由 Task 1 记录
- 失败和异常：`pnpm.cmd exec ts-node` 直接执行脚本出现 Node ESM `.ts` 错误，改用 `node -r ts-node/register/transpile-only` 后探针正常输出

- 客户端版本：
- 进程树：
- CDP 端口：
- 可连接 target：
- 可读字段：
- 消息事件是否稳定：
- 输入框是否可定位：
- 连续观察时长：
- P50/P95 延迟：
- 失败和异常：

## 决策规则

1. 官方/公开插件能力可用：采用官方能力适配器。
2. 存在可独立实现、可版本检测的本地 IPC：采用只读 IPC adapter。
3. 存在稳定聊天 CDP target：采用 CDP adapter。
4. 仅能读取部分字段：结构化通道与 OCR 混合，明确字段级回退。
5. 必须进程注入、绕过签名或复用竞品私有实现：停止结构化投入，保持 OCR 兼容模式。

## 决策结论

1. **普通外部 CDP 不可作为当前千牛主通道。** 不能因为 AliWorkbench 命令行包含参数，就假定 AliRender 已开放 CDP。
2. **不进入进程注入、私有 Mojo/IPC 逆向或竞品二进制复用。** 当前证据不足以证明这条路线可独立维护，也不满足本计划的安全止损条件。
3. **继续使用 OCR 兼容通道，并完成统一事件、影子对比、客户一致性和 UI/知识闭环。** `QianniuOcrAdapter` 是当前可用 fallback adapter，路由通过 `QIANNIU_CAPTURE_ROUTER=1` 选择性启用。
4. 若后续能取得千牛官方插件 SDK 或公开可用的 QNPlugin 接口，再新增独立 ADR 和结构化 adapter；不得在本任务中猜测私有协议。
