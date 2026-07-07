# 推送指南 — yingbo-smart-customer-service

## 当前状态

远程 main 分支已经比本地 `c8cf9e4` 多了多个 commit，因此需要合并后再推送。

## 方案一：使用 git bundle（推荐）

```bash
# 1. 克隆最新远程仓库
git clone https://github.com/Clips-z/yingbo-smart-customer-service.git yingbo-temp
cd yingbo-temp

# 2. 导入 bundle（bundle 基于 c8cf9e4 构建）
git fetch /path/to/yingbo-features-v2.bundle HEAD:feature/code-quality-v2

# 3. 合并到 main
git checkout main
git merge feature/code-quality-v2 -m "✨ 合并：修复 React #130、通知面板、千牛 OCR 改进"

# 4. 推送
git push origin main
```

## 方案二：手动 cherry-pick commits

bundle 中包含三个 commit：

| Commit | 说明 |
|--------|------|
| `f32106a` | 🔧 代码质量提升 |
| `633b87b` | ✨ 功能完善：React #130、通知面板、千牛 OCR |
| `a56539a` | 🧹 移除不应提交的交付文件 |

```bash
cd yingbo-smart-customer-service
git fetch /path/to/yingbo-features-v2.bundle HEAD:tmp-bundle
git cherry-pick f32106a 633b87b a56539a
git push origin main
```

## 文件位置

Bundle 文件: `/workspace/yingbo-features-v2.bundle` (6.8MB)
