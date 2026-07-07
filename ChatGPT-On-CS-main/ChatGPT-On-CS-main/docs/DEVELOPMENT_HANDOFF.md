# 迎波智能客服后续开发交接文档

更新时间：2026-07-03

本文用于给后续接手的同事快速熟悉项目、启动方式、核心链路、当前已知问题和下一步开发流程。

## 2026-07-03 三模式回复工作台

- 主界面新增 `仅提示 / 辅助回复 / 无人值守` 三段模式切换。
- 新增持久化表 `n_reply_suggestions`，按买家 ID 保存原话、建议回复、状态和时间。
- 回复工作台支持 `全部 / 待回复 / 已处理`，建议可编辑、复制、标记处理或重新放回待办。
- 辅助回复会搜索对应买家并填入千牛输入框，不按回车；操作后状态为 `prepared`。
- 无人值守切换需要二次确认，且不会跨应用重启保留；默认仍为仅提示。
- 鼠标位置和文本剪贴板会在填入动作后恢复，建议长度统一限制为 300 字。
- 完整设计和验证清单见 `docs/plans/2026-07-03-reply-workbench-design.md`。

### 辅助填入用户定位修复

- 原脚本把千牛搜索框纵坐标写成 `136`，在 9.96 当前布局中可能点到聊天区域，导致买家 ID 被当作回复填入。
- 搜索框纵坐标已校正为 `164`，搜索后使用“向下 + 回车”选择结果。
- 填入流程拆为两步：先执行 `SelectOnly` 切换联系人，再重新截图并用 RapidOCR 核对当前聊天标题。
- 只有 OCR 识别出的当前用户与目标用户完全一致，才会执行第二步填入；不一致会返回明确错误并停止。

## 2026-07-03 主窗口缩放

- 主窗口已开启 Windows 原生边缘和四角拖拽缩放，并支持标题栏最大化/还原。
- 默认窗口仍为 `528 x 1024`，最小尺寸限制为 `440 x 680`，避免窗口过小时控件重叠。
- 配置位置：`src/main/main.ts` 的主 `BrowserWindow`。
- 主进程 production webpack 构建通过；实际窗口已从 `474 x 772` 成功最大化到 `1920 x 1032`。

## 2026-07-02 中文 OCR 准确率优化

- 采集现已默认启用 `QIANNIU_COMPAT_NON_INTRUSIVE=1` 无打扰模式：使用 `PostMessage` 后台点击，不再调用 `SetForegroundWindow`、`SetCursorPos` 或 `mouse_event`。
- 当任意千牛窗口位于前台时，兼容服务暂停自动切店和切联系人，避免客服正在聊天时页面跳转。
- 无打扰模式会阻止旧版前台粘贴发送脚本运行；当前 `QIANNIU_COMPAT_AUTO_SEND=0` 继续保持影子模式。
- 后台点击实测：点击前后前台窗口句柄一致，鼠标坐标均为 `1470,788`，焦点和鼠标均未变化。
- RapidOCR 已改为长驻子进程：`scripts/qianniu-rapidocr-worker.py` 启动后只加载一次模型，Node 侧由 `qianniuOcrWorker.ts` 使用 JSON 行协议复用；请求超时 30 秒，进程异常时会重建并回退到单次识别。
- 长驻性能实测：模型启动约 `2.25s`，首张截图约 `3.42s`，后续截图约 `2.91s`；不再为每张截图重复支付模型初始化时间。测试句和置信度 `0.99994` 保持不变。
- 采集截图现在包含 `chat_fingerprint`，只对联系人标题和聊天区域采样；红色等待计时、订单侧栏等区域变化不会触发重复 OCR。同一聊天画面保持 30 秒时，OCR 进程 CPU 累计增长实测为 `0.000s`。
- 千牛接待台未启动时采用退避：从每 3 秒调用 PowerShell 改为每 30 秒重试；同类错误仅首次和每 5 分钟记录一次，恢复后记录一条“采集已恢复”。
- 2026-07-03 集成验证：后端健康接口为 `true`，RapidOCR 仅有 1 个长驻 Python 进程，稳定内存约 `123MB`，日志中没有触发 one-shot fallback。
- 主进程 webpack 构建通过。全项目 `tsc --noEmit` 仍会被仓库原有 `assets/backend/assets/scripts/*.js` 与 `release/app/assets/backend/assets/scripts/*.js` 的 6 个 `TS1003` 错误阻塞，和本次 OCR 改动无关。
- Windows Media OCR 已降级为诊断后备，不再允许其结果进入自动回复链路。
- 新增 `scripts/qianniu-rapidocr.py`，使用 RapidOCR 3.9.0、PP-OCRv6 本地模型和 ONNX Runtime 1.20.1；聊天内容不会上传到外部服务。
- 新增项目内运行时 `tools/python311` 和依赖目录 `tools/rapidocr-py311`，避免依赖开发电脑的全局 Python。
- OCR 只识别千牛中间聊天窗，不再扫描联系人列表、商品详情和订单侧栏，显著减少无关文本混入。
- 平时红点轮询使用 `-SkipOcr`，只有切换到具体未读会话后才运行 RapidOCR，避免每 3 秒初始化一次模型。
- RapidOCR 置信度低于 `0.88` 的结果直接跳过；`0.88-0.96` 的结果必须连续两次完全一致才会进入回复链路。
- 2026-07-02 实际千牛窗口验证：联系人 `tb2324788150`，原文“输出电阻值的范围是5k±15%是吗”，识别文本逐字一致，置信度 `0.99994`。
- 多店铺实测已确认顶部红点切换有效：兼容服务可以从当前店铺自动切到 `wheeltec旗舰店`，再打开左侧未读联系人 `baba2tt`。
- 某个店铺切换后弹出“设备环境异常/手机扫码安全验证”；按 `Esc` 可返回，但该账号必须由人工完成安全验证，采集端不能代替登录验证。
- 原来的 `0.88-0.96` 全区间二次确认会误拦截正确短句“口气比较强硬”，现已把二次确认区间收窄为 `0.88-0.92`，两个阈值可通过 `QIANNIU_OCR_MIN_CONFIDENCE` 和 `QIANNIU_OCR_CONFIRM_BELOW` 调整。
- 新增气泡方向过滤：采样文字周围底色，蓝色偏差大于等于 `8` 判定为客服右侧气泡并排除。真实截图离线验证中，两条买家白色气泡偏差分别为 `0.37`、`0.42`，客服蓝色气泡为 `22.47`。
- 会话 `23` 曾把“已自带加速，直接点击下载即可！”写入影子链路，疑似误采客服气泡；该数据保留用于回归，不要当作正确样本。
- `npm` 等价的主进程 webpack 构建已通过；应用重启后健康接口正常，Python 后端已连接。
- `run-app.cmd` 仍保持 `QIANNIU_COMPAT_AUTO_SEND=0`。当前只生成影子回复，尚未对真实买家自动发送。

下一步：由测试买家向非当前店铺发送唯一短句，验证顶部店铺红点和左侧会话红点切换；确认采集、联系人、原文和回复均正确后，才临时开启自动发送做单账号闭环。

## 2026-07-01 千牛 9.96 兼容采集进展

本节结论优先于下方 2026-06-29 的阶段性判断。

- 官方 Electron 源码与安装包内 Python 采集端实际不匹配。可执行文件只包含 `strategyService-run`、`strategyService-stop`、`strategyService-ocr`，不包含前端调用的 `updateStatus`、`updateTasks`、`getAppsInfo`。
- `strategyService-run` 又受 `app/core/network/socketio.py` 多传事件名参数影响而无法启动，因此旧采集链路并未真正运行。
- 直接加载 `uiahandle.pyd` 验证：桌面权限下能找到千牛接待台窗口，但千牛 9.96 的消息框句柄为 `0`，错误为 `Failed to find panes / message box / extract messages`。旧版 UIA 控件路径已失效。
- 新增 `scripts/qianniu-compat-capture.ps1`：使用 `PrintWindow` 抓取不受遮挡影响的千牛窗口画面，调用 Windows OCR 输出带坐标文本，并检测顶部店铺红点和左侧会话红点。
- 新增 `QianniuCompatService`：每 3 秒扫描一次，按红点切换店铺/会话，提取联系人和最新买家文本，复用原关键词/插件/LLM 回复链路。
- 真实流量影子测试已成功把一条新消息写入 `n_sessions` / `n_messages`；随后修复了 PowerShell 到 Node 的 UTF-8 输出，并增加乱码过滤、账号/时间戳过滤、红点消失确认、同联系人 45 秒冷却。
- 新增 `scripts/qianniu-compat-send.ps1`，支持聚焦输入框、UTF-8 粘贴和回车发送。发送功能由 `QIANNIU_COMPAT_AUTO_SEND` 控制，当前 `run-app.cmd` 默认值为 `0`，尚未对真实买家执行自动发送测试。
- `QIANNIU_COMPAT_ENABLED=1` 启用兼容采集。运行应用必须具备正常桌面访问权限；受限沙箱内无法枚举千牛窗口。

下一步只做受控闭环测试：由测试买家发送唯一文本，确认只新增一条会话、OCR 原文正确、回复长度合理后，将 `QIANNIU_COMPAT_AUTO_SEND` 临时设为 `1` 验证发送，再决定是否默认开启。

## 2026-06-29 最新排查结论

- 已下载官方 v1.4.5 源码包和安装包进行核对。官方源码包不包含 Python 采集端源码；安装包内的 `__main__.exe` 与当前项目文件 SHA-256 完全一致，因此不是本地采集端损坏或版本落后。
- 官方 v1.4.5 的正确调度协议是先发送 `strategyService-updateStatus`，再发送 `strategyService-updateTasks`。`strategyService-run` / `strategyService-stop` 不是该版本 Electron 端使用的正式启动流程。
- `src/main/backend/services/dispatchService.ts` 已恢复官方 `updateStatus` 协议，并保留当前任务同步与断线保护逻辑。
- 2026-06-29 重新构建和启动后：Python 采集端连接成功、健康检查通过、千牛任务列表为 1 条、全局配置为运行中，且未再出现新的 `InternalService.run()` 参数异常。
- 当前会话库仍为 `count = 0`。基础调度链路已恢复，最后还需要用买家端发送一条新的唯一消息，确认“采集入库 -> 生成回复 -> 千牛发送”完整闭环。
- 完成单店铺闭环后，再开发多店铺标签和右下角通知弹窗的自动切换/采集能力。

## 1. 项目定位

本项目是一个桌面版多平台智能客服工具，当前代码形态是：

- Electron 主进程：负责桌面窗口、IPC、本地服务启动。
- React 渲染端：主窗口、设置窗口、数据查看窗口。
- 本地 Node/Express 服务：提供 REST API、Socket.IO 服务、SQLite 数据读写、关键词/插件/LLM 回复逻辑。
- Python 采集端：`release/app/assets/backend/__main__.exe`，负责连接千牛/京麦/微信/企微等客户端，采集消息并执行回复。

项目入口目录：

```text
F:\懒人客服\ChatGPT-On-CS-main\ChatGPT-On-CS-main
```

## 2. 启动方式

推荐使用项目根目录的：

```bat
run-app.cmd
```

该脚本会设置几个关键环境变量：

```bat
set ALLOW_MULTI_INSTANCE=1
set ELECTRON_USER_DATA_DIR=%~dp0.tmp-userdata
set DB_DIR=%~dp0.tmp-userdata
```

这意味着当前调试环境的数据和日志主要在项目内或系统临时目录，而不是默认 Documents 目录。

常用开发命令：

```powershell
npm.cmd run build:main
npm.cmd run build:renderer
npm.cmd run build
npm.cmd test
```

当前排查中主要用过并验证成功的是：

```powershell
npm.cmd run build:main
```

## 3. 主要目录

```text
src/main/main.ts                         Electron 主进程入口
src/main/system/backend.ts               启动/停止 Python 采集端 __main__.exe
src/main/backend/backend.ts              本地 Express + Socket.IO 服务
src/main/backend/ormconfig.ts            SQLite 初始化和默认数据
src/main/backend/services/dispatchService.ts
                                          Node 服务与 Python 采集端之间的 Socket.IO 调度
src/main/backend/services/messageService.ts
                                          关键词、转人工、替换词、LLM 回复生成
src/main/backend/services/appService.ts  采集任务增删查和同步
src/main/backend/controllers/*           配置、消息、关键词等控制器
src/main/backend/entities/*              Sequelize 表模型
src/main/gptproxy/*                      多模型适配层
src/renderer/*                           React 前端
release/app/assets/backend/__main__.exe  Python 采集端可执行文件
release/app/assets/backend/assets/airtest
                                          采集端图像识别资源
```

## 4. 启动链路

完整启动顺序如下：

1. `run-app.cmd` 设置本地数据目录和用户数据目录。
2. `scripts/launch-electron-detached.js` 拉起 Electron。
3. `src/main/main.ts` 创建主窗口前，先创建 `BackendServiceManager`。
4. `BackendServiceManager` 启动：

```text
release/app/assets/backend/__main__.exe --port <动态端口>
```

5. Electron 主进程再启动本地 Express/Socket.IO 服务，监听同一个动态端口。
6. Python 采集端连接本地 Socket.IO 服务。
7. React 前端通过 `window.electron.getPort()` 获取动态端口，再请求本地 API。

前端请求封装在：

```text
src/renderer/common/services/common/api/request.ts
```

请求基址：

```text
http://127.0.0.1:<动态端口>
```

## 5. 数据库和日志位置

当前调试启动方式下，SQLite 数据库实际路径是：

```text
F:\懒人客服\ChatGPT-On-CS-main\ChatGPT-On-CS-main\.tmp-userdata\chatgpt-on-cs\msg.db
```

注意：如果没有 `DB_DIR`，代码会回退到：

```text
%USERPROFILE%\Documents\chatgpt-on-cs\msg.db
```

关键日志：

```text
F:\懒人客服\ChatGPT-On-CS-main\ChatGPT-On-CS-main\.tmp-userdata\logs\electron-startup.log
%TEMP%\chatgpt-on-cs\process.log
```

其中：

- `electron-startup.log`：Electron 主进程、本地服务、数据库 SQL 日志。
- `process.log`：Python 采集端 stdout/stderr，千牛采集问题优先看这里。

## 6. 核心数据表

主要 Sequelize 模型在 `src/main/backend/entities`：

- `n_config`：全局/平台/实例配置。
- `instance`：采集任务实例，字段包括 `id`、`app_id`、`env_id`。
- `keyword`：关键词自动回复。
- `transfer`：转人工关键词。
- `replace`：回复内容替换规则。
- `n_sessions`：已保存会话。
- `n_messages`：已保存消息。
- `plugins`：自定义插件。

配置优先级：

```text
实例配置 instance_id -> 平台配置 platform_id + 空 instance_id -> 全局配置 global
```

当前代码已兼容平台配置的 `instance_id` 为 `''` 或 `null` 的情况。

## 7. 本地 REST API 速查

以下端口需要从启动日志中读取，例如：

```text
Server is running on http://localhost:51433
```

健康检查：

```powershell
Invoke-RestMethod "http://127.0.0.1:<port>/api/v1/base/health"
```

平台列表：

```powershell
Invoke-RestMethod "http://127.0.0.1:<port>/api/v1/base/platform/all"
```

任务列表：

```powershell
Invoke-RestMethod "http://127.0.0.1:<port>/api/v1/strategy/tasks"
```

手动同步任务/配置：

```powershell
Invoke-RestMethod -Method Post "http://127.0.0.1:<port>/api/v1/base/sync"
```

查询千牛会话：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:<port>/api/v1/message/session" `
  -ContentType "application/json" `
  -Body '{"page":1,"pageSize":20,"platformId":"win_qianniu"}'
```

如果这里 `count = 0`，说明消息没有被采集并保存，不是 LLM 或关键词回复失败。

## 8. Socket.IO 事件链路

Node 本地服务是 Socket.IO Server，Python 采集端是 Socket.IO Client。

Node -> Python：

- `systemService-health`
- `strategyService-getAppsInfo`
- `strategyService-updateStatus`
- `strategyService-updateTasks`

注意：v1.4.5 官方 Electron 端通过 `updateStatus` 切换 `RUNNING` / `STOPPED`，不要改用 `strategyService-run` 或 `strategyService-stop`。

Python -> Node：

- `messageService-broadcast`
- `messageService-getMessages`

自动回复主链路：

```text
Python 采集端发现新消息
  -> 调用 messageService-getMessages
  -> DispatchService.registerHandlers
  -> ConfigController.get(ctx)
  -> MessageService.extractMsgInfo
  -> 插件逻辑或默认插件 PluginDefaultRunCode
  -> MessageService.getReply
  -> 关键词 / 转人工 / LLM / 默认回复 / 替换词
  -> callback(reply) 返回给 Python
  -> Python 在目标客户端输入并发送
  -> Node 保存 session/message
```

默认插件代码在：

```text
src/main/backend/constants/index.ts
```

核心逻辑是：

```js
const cfg = await cc.get(ctx);
return await rp.getReply(cfg, ctx, messages);
```

## 9. 本轮已做的修正

以下改动已经在当前工作区中：

1. `src/main/backend/services/dispatchService.ts`

- `syncConfig()` 会先读取 `instance` 表并调用 `updateTasks(instances)`。
- 根据全局 `has_paused` 决定对已有任务执行 run 或 stop。
- `runTask()` / `stopTask()` 当前保持不传业务参数，以避免引入新的 Python 参数数量错误。

2. `src/main/backend/services/appService.ts`

- `initTasks()` 改为统一走 `dispatchService.syncConfig()`。
- `addTask()` 在数据库事务提交后再同步采集端任务。
- `removeTask()` 删除任务和相关配置后再同步采集端。

3. `src/main/backend/controllers/configController.ts`

- 平台配置查找兼容 `instance_id = ''` 和 `instance_id IS NULL`。
- 平台级配置创建时写入 `instance_id: ''`。
- 修复未激活实例配置阻挡全局配置的问题。

4. `src/main/backend/services/messageService.ts`

- LLM 回复增加 20 秒超时。
- LLM client 增加 `timeout` 和 `maxRetries: 1`。
- 日志中不再完整打印 API key，只保留前 8 位加掩码。

构建验证：

```powershell
npm.cmd run build:main
```

已通过。

## 10. 当前千牛问题结论

用户实际测试场景：

- 千牛已登录。
- 多个店铺/账号标签同时存在。
- 当前打开的是一个店铺聊天页。
- 右下角弹窗来自另一个店铺账号。
- 用户发送了“你好”，软件未自动回复。

排查结论：

1. 消息没有进入本地消息库。

接口查询千牛会话返回 `count = 0`，说明不是“模型没回复”，而是采集阶段没有成功。

2. Python 采集端启动任务时报错。

`%TEMP%\chatgpt-on-cs\process.log` 中出现：

```text
AttributeError: 'str' object has no attribute 'get'
```

栈位置：

```text
app/core/network/socketio.py line 48 in handle_event
app/services/api_server.py line 30 in run
```

尝试给 `strategyService-run` 传 `{ app_id: ... }` 后，会变成：

```text
TypeError: InternalService.run() takes 2 positional arguments but 3 were given
```

因此更像是 Python 采集端内部 `SocketioClient.register_handler` 的事件分发把参数传错了：

- 不传 payload 时，业务 `run(data)` 收到的是事件名字符串。
- 传 payload 时，业务 `run(data)` 收到过多参数。

3. Python 采集端是 Nuitka 打包的 `__main__.exe`。

可执行文件中能看到如下字符串：

```text
app.core.network.socketio
InternalService.run
strategyService-run
app.platforms.qianniu.task
Qianniu
```

但源码没有直接展开在当前目录，普通 `sitecustomize.py` 或外部同名模块覆盖没有生效。

4. 即使修复采集端 run 事件，多店铺弹窗仍需要单独增强。

从截图看，右下角弹窗账号和当前打开聊天标签不是同一个店铺。现有采集逻辑大概率只围绕当前千牛主窗口/当前会话工作，不保证能自动遍历顶部多店铺标签或处理右下角通知弹窗。

## 11. 千牛问题建议修复路线

优先级 1：拿到或恢复 Python 采集端源码。

需要重点修：

```text
app/core/network/socketio.py
app/services/api_server.py
app/platforms/qianniu/task.py
```

`SocketioClient.register_handler` 应该确保业务 handler 只收到一个 dict payload，例如：

```python
async def handle_event(*args, **kwargs):
    data = args[-1] if args and isinstance(args[-1], dict) else {}
    if asyncio.iscoroutinefunction(handler):
        return await handler(data)
    return handler(data)
```

同时 `InternalService.run(data)` 中要能处理 `data` 为空：

```python
app_id = data.get("app_id", "")
```

优先级 2：修复后重新打包 Python 后端，替换：

```text
release/app/assets/backend/__main__.exe
```

替换后验证：

```powershell
Invoke-RestMethod -Method Post "http://127.0.0.1:<port>/api/v1/base/sync"
Get-Content "$env:TEMP\chatgpt-on-cs\process.log" -Tail 80
```

目标：不再出现 `AttributeError` 或 `TypeError`。

优先级 3：增强千牛多店铺采集。

建议在 `Qianniu` 策略中支持：

- 识别顶部多个店铺标签及未读红点。
- 识别右下角弹窗中的店铺/联系人/消息摘要。
- 点击弹窗或切换到对应店铺标签后再进入会话采集。
- 为每个店铺维护独立去重状态，避免重复回复。
- ctx 中补充店铺标识，例如 `CTX_STORE_NAME` 或专门的 shop id。

## 12. 当前可复现诊断流程

1. 启动应用。

```powershell
Start-Process -FilePath "F:\懒人客服\ChatGPT-On-CS-main\ChatGPT-On-CS-main\run-app.cmd" `
  -WorkingDirectory "F:\懒人客服\ChatGPT-On-CS-main\ChatGPT-On-CS-main" `
  -WindowStyle Hidden
```

2. 从日志找动态端口。

```powershell
Select-String `
  -Path "F:\懒人客服\ChatGPT-On-CS-main\ChatGPT-On-CS-main\.tmp-userdata\logs\electron-startup.log" `
  -Pattern "Server is running|Backend process started|Client connected" |
  Select-Object -Last 20
```

3. 检查健康。

```powershell
Invoke-RestMethod "http://127.0.0.1:<port>/api/v1/base/health"
```

4. 检查任务。

```powershell
Invoke-RestMethod "http://127.0.0.1:<port>/api/v1/strategy/tasks"
```

5. 触发同步。

```powershell
Invoke-RestMethod -Method Post "http://127.0.0.1:<port>/api/v1/base/sync"
```

6. 看采集端日志。

```powershell
Get-Content "$env:TEMP\chatgpt-on-cs\process.log" -Tail 100
```

7. 发送测试消息后查会话。

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:<port>/api/v1/message/session" `
  -ContentType "application/json" `
  -Body '{"page":1,"pageSize":20,"platformId":"win_qianniu"}'
```

## 13. 开发注意事项

- README 和部分源码中文注释存在编码乱码，后续整理时建议统一 UTF-8。
- 不要把用户的 LLM API key 写进日志、文档或截图。
- 当前接口里平台列表如果 Python 采集端返回失败，会回退到内置平台列表。
- `platform/all` 返回内置列表不代表真实识别到千牛，只能说明前端可展示平台。
- `message/session count = 0` 基本可以判断采集没进库。
- `npx tsc --noEmit` 可能会被打包资源目录中的脚本干扰，当前更可靠的验证是 `npm.cmd run build:main`。
- 修改采集端协议时，Node 和 Python 两边必须一起验证。

## 14. 建议后续开发顺序

1. 先修 Python 采集端 `strategyService-run` 事件参数分发。
2. 调用 `/api/v1/base/sync`，确认 `updateStatus` 和 `updateTasks` 不报错。
3. 用当前打开的千牛聊天窗口发送唯一测试文本，确认消息能被采集到。
4. 确认采集入库后，再测试关键词回复和默认回复。
5. 最后做多店铺/右下角弹窗能力。
6. 为千牛策略加最小回归测试或诊断日志，至少记录：当前窗口、当前店铺、当前联系人、采集到的消息、是否触发回复。

## 15. 交接给同事的一句话结论

基础调度协议已经恢复为官方 `strategyService-updateStatus` + `strategyService-updateTasks`，采集端连接、健康检查和任务同步均正常。下一步先完成一条真实消息的采集和自动回复闭环；闭环通过后，再做多店铺标签与右下角弹窗采集增强。
