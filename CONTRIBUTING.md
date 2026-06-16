# 贡献指南

感谢您对 Mira 的关注！以下指南帮助您参与项目开发。

## 开发环境

- Node.js 18+
- Python 3.10+（或使用 `portable-python/`）
- 包管理器：npm

```powershell
# 克隆后首次设置
.\setup.ps1

# 开发模式启动
npm run dev
```

## 代码规范

### TypeScript / React

- 使用 TypeScript 严格模式，避免 `any`
- 组件使用函数组件 + hooks，避免 class 组件
- 文件名使用 kebab-case（如 `chat-window.tsx`）
- 类型定义放在独立的 `types.ts` 中
- 样式使用 Tailwind CSS 原子类，避免手写 CSS

### Python

- 遵循 PEP 8 规范
- 异步路由使用 `async def`
- 类型注解完整

### 提交信息

使用中文描述，格式：`<类型>: <简要说明>`

```
feat: 新增侧边栏自动折叠功能
fix: 修复消息编辑时 input 值未更新
refactor: 重构 sendMessage 参数传递
docs: 补充 CONTRIBUTING.md
chore: 清理构建产物和冗余文件
style: 优化空状态引导布局
```

## 分支管理

- `main` — 稳定发布分支
- `feat/*` — 功能开发
- `fix/*` — 问题修复
- `docs/*` — 文档改进

## PR 流程

1. 从 `main` 创建功能分支
2. 实现功能或修复问题
3. 运行 `npm run typecheck` 确保类型正确
4. 运行 `npm run build` 确保构建通过
5. 运行 `npm test` 确保测试通过
6. 创建 Pull Request

## 测试

```powershell
# 运行所有测试
npm test

# TypeScript 类型检查
npm run typecheck

# 构建验证
npm run build
```

## 目录结构

参见 `docs/architecture.md` 了解完整架构说明。
