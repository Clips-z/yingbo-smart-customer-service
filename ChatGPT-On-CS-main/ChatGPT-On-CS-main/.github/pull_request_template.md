## 改动说明

<!-- 一句话说清楚做了什么 -->


## 改动类型

- [ ] feat: 新功能
- [ ] fix: Bug 修复
- [ ] refactor: 重构
- [ ] perf: 性能优化
- [ ] style: 格式调整
- [ ] test: 测试相关
- [ ] docs: 文档更新
- [ ] chore: 构建/工具链

## 关联 Issue

<!-- #issue_number，没有则填 N/A -->

## 测试方式

<!-- 怎么验证这个改动是正确的 -->
1.
2.
3.

## 自查清单

- [ ] `npm run lint` 无 error
- [ ] `pnpm typecheck:baseline` 未增加类型债务
- [ ] 没有引入新的 `any` 类型
- [ ] 没有 `@ts-ignore` / `@ts-nocheck`
- [ ] 关键路径有 try/catch 错误处理
- [ ] 没有硬编码 API Key / Secret
- [ ] useEffect 中的事件监听器有清理
- [ ] 列表渲染有唯一 key
- [ ] 已添加/更新相关测试
- [ ] PR 标题符合 Conventional Commits
- [ ] 改动行数 < 400（超过则拆分）

## Breaking Change

<!-- 如果有破坏性改动，说明影响范围和迁移方式。没有则删除此节 -->

## 截图/录屏

<!-- UI 改动建议附截图 -->
