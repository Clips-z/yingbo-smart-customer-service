# 千牛回复工作台设计

## 目标

把兼容采集生成的回复从运行日志升级为可操作的待办队列。每条记录明确关联买家 ID、买家原话和 AI 建议，客服可查看、编辑、复制、填入千牛或标记处理。

## 三种模式

- `hint`（仅提示）：采集并生成建议，只在回复工作台展示，不操作千牛。
- `assist`（辅助回复）：客服点击“填入千牛”后，程序搜索对应买家并把编辑后的建议写入输入框，不按回车。
- `unattended`（无人值守）：生成后自动写入并发送。切换时必须二次确认；重启应用后自动回到仅提示，防止意外连续发送。

## 数据流

1. `QianniuCompatService` 检测未读会话并完成 RapidOCR 识别。
2. `DispatchService.createReply` 生成回复并保存原聊天记录。
3. 文本回复写入 `n_reply_suggestions`，状态初始为 `pending`。
4. 主界面通过 REST 接口加载建议，并监听广播即时刷新。
5. 辅助模式填入成功后状态变为 `prepared`；自动发送成功后变为 `sent`。

## 状态

- `pending`：待客服处理。
- `prepared`：已写入千牛输入框，是否发送由客服决定。
- `sent`：无人值守模式已自动发送。
- `dismissed`：客服手动标记为已处理。

## 安全边界

- 默认模式为仅提示。
- 仅辅助模式允许调用“填入千牛”接口。
- 辅助填入不传 `-Submit`，不会模拟回车。
- 辅助填入先只切换联系人，再通过 RapidOCR 核对聊天标题；用户 ID 不一致时禁止填入回复。
- 自动发送模式不跨重启保留。
- 填入脚本会恢复原鼠标位置和文本剪贴板。
- 回复建议最多 300 字，界面与实际填入长度一致。

## 主要文件

- `src/main/backend/entities/replySuggestion.ts`
- `src/main/backend/services/qianniuCompatService.ts`
- `src/main/backend/backend.ts`
- `scripts/qianniu-compat-send.ps1`
- `src/renderer/main-window/components/ReplyWorkbench/index.tsx`

## 验证清单

- 三种模式接口可读取和切换。
- 新消息生成独立待回复项，买家 ID 与原话正确。
- 辅助模式只填入，不发送，并切换到正确买家。
- 仅提示模式无法调用填入接口。
- 无人值守模式切换有确认，重启后回到仅提示。
- 窄窗口下卡片、文本框和操作按钮不重叠。
