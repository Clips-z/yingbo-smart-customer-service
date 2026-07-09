# 交付检查清单

本文档用于交付前快速确认“能安装、能启动、关键运行文件完整”。

## 产物位置

- 安装包：`release/build/迎波智能客服 1.4.5.exe`
- 免安装目录：`release/build/win-unpacked/`
- 免安装启动文件：`release/build/win-unpacked/迎波智能客服.exe`

## 打包命令

```bash
pnpm run package
```

该命令会自动完成：

1. 检查 Python 后端 `__main__.exe` 是否存在。
2. 生成主进程和界面文件。
3. 复制 sqlite3 等运行时原生依赖到 `release/app/node_modules`。
4. 生成 Windows 安装包和 `win-unpacked` 免安装目录。

## 自检命令

```bash
pnpm run check:backend:required
pnpm run prepare:native-deps
pnpm run check:package
```

检查通过时应能看到：

- `assets/backend/__main__.exe` 存在。
- `release/app/node_modules/sqlite3` 可以正常加载。
- `release/build/迎波智能客服 1.4.5.exe` 存在且非空。
- `release/build/win-unpacked/resources/assets/backend/__main__.exe` 存在且非空。
- `release/build/win-unpacked/resources/app.asar.unpacked/node_modules/sqlite3/build/Release/node_sqlite3.node` 存在且非空。

## 人工启动验证

1. 运行 `release/build/win-unpacked/迎波智能客服.exe`。
2. 确认主窗口能打开，不闪退。
3. 确认系统生成用户数据目录：`%APPDATA%/yingbo-smart-customer-service`。
4. 打开需要接待的平台客户端并登录。
5. 先使用“仅提示”或“辅助回复”模式测试一条消息，再考虑无人值守。

## 当前交付结论

截至 2026-07-09，本地已验证：

- 正式打包命令通过。
- 安装包和免安装目录生成成功。
- 后端可执行文件已进入发布目录。
- sqlite3 原生数据库文件已正确解包。
- 免安装版桌面程序已能启动，并且相关进程保持响应。

完整业务闭环仍建议使用测试账号验证：平台登录、消息采集、AI 回复生成、填入/发送、异常恢复。
