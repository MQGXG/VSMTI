# Mira 项目文档

## 项目概述

Mira 是一个全能 AI 助手桌面应用，基于 **Electron + TypeScript Agent Core** 架构打造，**零 Python 依赖**。

## 技术栈

| 层次 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 31 (electron-vite) |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS + @assistant-ui/react |
| Agent Core | TypeScript（纯 TS 实现，无 Python） |
| LLM | OpenAI / Anthropic Claude / DeepSeek / Ollama / Groq / 自定义 API |
| 数据库 | SQLite (sql.js WASM，防抖持久化) |
| 构建 | electron-builder（便携模式，目标电脑无需安装任何运行时） |

## 目录结构

```
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 应用入口
│   ├── preload.ts               # 预加载脚本 (contextBridge)
│   ├── agent-core/              # ★ TypeScript Agent Core
│   │   ├── agent.ts             # Agent 核心循环（流式 LLM → 工具调用 → 权限）
│   │   ├── llm-sdk.ts           # LLM SDK 封装
│   │   ├── llm/                 # LLM 分层架构
│   │   │   ├── schema/          #   消息/事件/错误类型
│   │   │   ├── protocols/       #   OpenAI / Anthropic 协议
│   │   │   ├── providers/       #   Provider 实现（10+）
│   │   │   └── route/           #   路由客户端
│   │   ├── tools/               # 23 个工具（文件/执行/网络/Git/分析等）
│   │   ├── memory/              # 记忆系统（Builtin/Vector/File/FTS）
│   │   ├── skill/               # Skill 系统（Slash 命令 + 动态加载）
│   │   ├── permission.ts        # 声明式权限（通配符 + 模式叠加）
│   │   ├── modes.ts             # 5 种 Agent 模式
│   │   ├── config.ts            # 多层配置合并
│   │   ├── database.ts          # SQLite (sql.js)
│   │   ├── session-manager.ts   # 项目/会话管理
│   │   ├── registry.ts          # 工具注册表
│   │   ├── ipc-bridge.ts        # IPC 桥接（实时事件流）
│   │   └── ...                  # 其他模块
│   ├── managers/
│   │   ├── window-manager.ts    # 窗口管理
│   │   └── tray-manager.ts      # 托盘管理
│   ├── ipc/
│   │   └── handlers.ts          # IPC 通信处理
│   └── utils/
│       ├── logger.ts            # 日志系统
│       └── shell-env.ts         # 环境变量注入
├── src/                         # React 渲染进程
│   ├── App.tsx                  # 应用根组件
│   ├── components/
│   │   ├── chat/                # 聊天组件
│   │   │   ├── ChatWindow.tsx   #   主聊天界面
│   │   │   ├── MiraRuntimeProvider.tsx  # 运行时状态
│   │   │   ├── ModelSelector.tsx #  模型/模式选择
│   │   │   ├── PermissionDialog.tsx # 权限审批弹窗
│   │   │   ├── MarkdownRenderer.tsx # Markdown 渲染
│   │   │   └── tool-views/      #   工具执行结果视图
│   │   ├── sidebar/             # 侧边栏
│   │   │   ├── Sidebar.tsx      #   会话列表
│   │   │   ├── ProjectBar.tsx   #   项目切换
│   │   │   ├── SettingsDialog.tsx # 设置面板
│   │   │   └── ModelManager.tsx #   模型管理
│   │   ├── layout/TitleBar.tsx  # 自定义标题栏
│   │   └── ui/Modal.tsx         # 通用 UI
│   ├── hooks/
│   │   └── useMiraChat.ts       # 核心聊天 Hook
│   ├── contexts/ThemeContext.tsx # 主题上下文
│   ├── styles/                  # 全局样式
│   └── types/electron.d.ts      # 类型声明
├── data/                        # 运行时数据 (SQLite)
├── dist/                        # 前端构建输出
├── dist-electron/               # Electron 构建输出
├── docs/                        # 文档
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
└── tailwind.config.js
```

## Agent 模式

| 模式 | 描述 | 迭代上限 | 可用工具 |
|------|------|----------|----------|
| 助手 (assistant) | 日常问答、写作、分析 | 10 | 全部（禁 bash/code_exec） |
| 专家 (expert) | 深度研究、数据分析 | 25 | 全部（禁 bash） |
| 执行 (action) | 自动化任务、批量处理 | 50 | 全部工具 |
| 安全 (safe) | 只读探索 | 5 | 只读（read_file/list_files/grep/glob/web_search/web_browse/data_analysis） |
| 规划 (plan) | 代码分析、方案设计 | 15 | 只读 + LSP（lsp_definition/lsp_references/lsp_hover） |

## 工具清单

| 分类 | 工具 |
|------|------|
| 文件操作 | read_file, write_file, edit_file, list_files, grep, glob |
| 执行 | bash, code_exec |
| 网络 | web_search, web_browse |
| Git | git_status, git_diff, git_log, git_commit |
| 分析 | data_analysis, image_gen |
| 协作 | delegate_task, team_tool, task_tool |
| 调度 | cron_tool, worktree_tool |
| 代码智能 | lsp_tool |

## LLM Provider 支持

| Provider | 类型 | 默认 Base URL |
|----------|------|--------------|
| OpenAI | 原生 | `api.openai.com/v1` |
| Anthropic | 原生 | `api.anthropic.com` |
| DeepSeek | 兼容 | `api.deepseek.com` |
| Ollama | 兼容 | `localhost:11434/v1` |
| Groq | 兼容 | `api.groq.com/openai/v1` |
| Fireworks | 兼容 | `api.fireworks.ai/inference/v1` |
| Together | 兼容 | `api.together.xyz/v1` |
| Cerebras | 兼容 | `api.cerebras.ai/v1` |
| Perplexity | 兼容 | `api.perplexity.ai` |
| Custom | 兼容 | 用户自定义 URL |

## IPC 通信

`preload.ts` 通过 `contextBridge` 暴露 `electronAPI`：

- `agent.*` — Agent 流式执行、权限回复、工具调用、Skill 列表
- `ts.*` — 项目/会话 CRUD、消息搜索
- `config.*` — 配置读写（全局 JSON + 项目 JSON + 环境变量）
- `safeStorage.*` — API Key 加密存储（Electron safeStorage）
- `dialog/*` — 文件/目录选择对话框
- `window:*` — 窗口控制（最小化/最大化/关闭）

## 开发指南

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev
# 或
.\start.ps1 dev

# 打包
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux

# 测试
npm run test

# 类型检查
npm run typecheck
```

## 环境要求

- Node.js 18+
- Windows / macOS / Linux
- **无需 Python**（Agent Core 完全由 TypeScript 实现）
