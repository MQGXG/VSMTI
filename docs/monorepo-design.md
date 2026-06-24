# Mira Monorepo 架构设计

## 目标

将 Mira 项目从单包架构迁移到 Monorepo 架构，提升代码组织、依赖管理和开发效率。

## 架构设计

### 目录结构

```
mira/
├── packages/
│   ├── core/                    # 核心逻辑
│   │   ├── src/
│   │   │   ├── agent/           # Agent 核心循环
│   │   │   ├── llm/             # LLM 集成
│   │   │   ├── memory/          # 记忆系统
│   │   │   ├── permission/      # 权限系统
│   │   │   ├── mcp/             # MCP 协议
│   │   │   ├── plugin/          # 插件系统
│   │   │   ├── skill/           # 技能系统
│   │   │   └── index.ts         # 导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── tools/                   # 工具系统
│   │   ├── src/
│   │   │   ├── file/            # 文件操作工具
│   │   │   ├── web/             # 网络工具
│   │   │   ├── git/             # Git 工具
│   │   │   ├── code/            # 代码工具
│   │   │   ├── document/        # 文档工具
│   │   │   └── index.ts         # 导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                      # UI 组件
│   │   ├── src/
│   │   │   ├── components/      # 通用组件
│   │   │   ├── chat/            # 聊天组件
│   │   │   ├── sidebar/         # 侧边栏组件
│   │   │   ├── hooks/           # React Hooks
│   │   │   └── index.ts         # 导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── electron/                # Electron 应用
│   │   ├── src/
│   │   │   ├── main/            # 主进程
│   │   │   ├── preload/         # 预加载脚本
│   │   │   ├── ipc/             # IPC 通信
│   │   │   └── index.ts         # 导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── sdk/                     # SDK（可选）
│       ├── src/
│       │   └── index.ts         # 导出
│       ├── package.json
│       └── tsconfig.json
│
├── apps/                        # 应用入口
│   ├── desktop/                 # 桌面应用
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── web/                     # Web 应用（可选）
│       ├── src/
│       │   └── ...
│       ├── package.json
│       └── vite.config.ts
│
├── specs/                       # 规范文档
│   ├── core.md
│   ├── tools.md
│   ├── ui.md
│   └── mcp.md
│
├── scripts/                     # 脚本
│   ├── build.ts
│   └── release.ts
│
├── package.json                 # 根 package.json
├── pnpm-workspace.yaml          # pnpm workspace 配置
├── tsconfig.json                # 根 tsconfig
└── README.md
```

## 包依赖关系

```
apps/desktop
  ├── @mira/core
  ├── @mira/tools
  ├── @mira/ui
  └── @mira/electron

@mira/electron
  ├── @mira/core
  └── @mira/tools

@mira/tools
  └── @mira/core

@mira/ui
  └── @mira/core

@mira/core
  └── (无依赖)
```

## 包描述

### @mira/core
核心逻辑包，包含：
- Agent 核心循环
- LLM 集成
- 记忆系统
- 权限系统
- MCP 协议支持
- 插件系统
- 技能系统

### @mira/tools
工具系统包，包含：
- 文件操作工具 (read_file, write_file, edit_file, list_files, grep, glob)
- 网络工具 (web_search, web_fetch, web_browse)
- Git 工具 (git_status, git_diff, git_log, git_commit)
- 代码工具 (bash, code_exec)
- 文档工具 (create_docx)

### @mira/ui
UI 组件包，包含：
- 通用组件 (Button, Input, Dialog 等)
- 聊天组件 (ChatWindow, MessageList 等)
- 侧边栏组件 (Sidebar, Settings 等)
- React Hooks

### @mira/electron
Electron 应用包，包含：
- 主进程逻辑
- 预加载脚本
- IPC 通信
- 窗口管理

### @mira/sdk
SDK 包（可选），提供：
- TypeScript 类型定义
- API 文档
- 使用示例

## 迁移策略

### 阶段 1: 设置 Monorepo 工具
1. 安装 pnpm
2. 配置 pnpm-workspace.yaml
3. 更新根 package.json

### 阶段 2: 创建包结构
1. 创建 packages 目录
2. 创建各个包的目录结构
3. 配置各个包的 package.json

### 阶段 3: 迁移代码
1. 迁移核心模块到 @mira/core
2. 迁移工具模块到 @mira/tools
3. 迁移 UI 模块到 @mira/ui
4. 迁移 Electron 模块到 @mira/electron

### 阶段 4: 更新依赖
1. 更新各个包的依赖关系
2. 更新导入路径
3. 测试所有功能

### 阶段 5: 优化和清理
1. 优化构建配置
2. 清理未使用的代码
3. 更新文档

## 优势

1. **更好的代码组织**: 每个包都有明确的职责
2. **更好的依赖管理**: 包之间的依赖关系清晰
3. **更好的可维护性**: 可以独立更新每个包
4. **更好的可复用性**: 包可以在其他项目中复用
5. **更好的开发体验**: 支持增量构建和热重载
