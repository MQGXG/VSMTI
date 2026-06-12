---
name: git-workflow
description: Git 工作流规范与分支管理指南
---

# Git 工作流技能

## 分支命名
- `feat/{name}` — 新功能
- `fix/{name}` — 修复
- `refactor/{name}` — 重构
- `docs/{name}` — 文档

## 提交规范
- 使用祈使句：`Add login validation` 而非 `Added login`
- 第一行不超过 72 字符
- 关联 issue：`Closes #123`

## 操作流程
1. 从 main 创建分支：`git checkout -b feat/xxx main`
2. 小步提交，每次聚焦一个改动
3. 提交前运行测试
4. 推送后创建 PR 请求审查
