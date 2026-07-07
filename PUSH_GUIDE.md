# 推送代码到 GitHub — 操作指南

由于沙箱环境无法直连 GitHub，请在本地 Windows 执行以下操作。

## 方案 A：使用 git bundle（推荐，最简单）

```bash
# 1. 将 yingbo-changes.bundle 下载到本地项目目录

# 2. 在本地项目中导入 bundle
cd 你的本地项目目录
git remote add sandbox ./yingbo-changes.bundle
git fetch sandbox
git merge sandbox/master --allow-unrelated-histories
# 或者如果本地已有完整仓库：
git pull ./yingbo-changes.bundle master

# 3. 推送到 GitHub
git push origin main
```

## 方案 B：使用 patch 文件

```bash
# 1. 下载 changes.patch 到本地项目目录

# 2. 应用补丁
cd 你的本地项目目录
git apply changes.patch

# 3. 提交并推送
git add -A
git commit -m "🔧 代码质量提升：消除 TODO/FIXME、空 catch、@ts-ignore，优化性能与工程化"
git push origin main
```

## 方案 C：直接用 gh-proxy 拉取

```bash
# 如果你能把仓库保持公开：
cd 你的本地项目目录
git pull "https://gh-proxy.com/https://github.com/Clips-z/yingbo-smart-customer-service.git" main
```

## 本次改动概要

- ✅ React Query cacheTime 修复 (10ms → 5min)
- ✅ Session 表添加 4 个索引
- ✅ 消除全部 15+ 空 catch 块
- ✅ 消除全部 15 个 TODO/FIXME
- ✅ @ts-ignore 从 71 降至 29
- ✅ API 请求层增强（重试 + 去重 + 慢请求警告）
- ✅ ESLint v9 flat config
- ✅ 修改 28 个文件
