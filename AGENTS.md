# Mira 项目文档

## 项目概述

Mira 是一个全能 AI 助手桌面应用，基于 **Electron + TypeScript Agent Core** 架构打造，**零 Python 依赖**。

## 技术栈

| 层次 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 31 (electron-vite) |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS + @assistant-ui/react |
| Agent Core | TypeScript（纯 TS 实现，无 Python） |
| LLM | OpenAI / Anthropic Claude / DeepSeek / Ollama / Groq / Gemini / 自定义 API |
| 数据库 | SQLite (sql.js WASM，防抖持久化) |
| 向量记忆 | Transformers.js 本地 ONNX 推理（零外部依赖） |
| 代码智能 | LSP (Language Server Protocol) |
| 协议扩展 | MCP (Model Context Protocol) |
| 构建 | electron-builder（便携模式，目标电脑无需安装任何运行时） |

## 目录结构

```
mira/
├── packages/
│   ├── core/                        # @mira/core — Agent Core 核心逻辑
│   │   └── src/
│   │       ├── agent.ts             # Agent 核心循环（流式 LLM → 工具调用 → 权限）
│   │       ├── agent/               # Agent 子模块
│   │       │   ├── context.ts       #   系统提示构建
│   │       │   ├── state-machine.ts #   Agent 生命周期状态机
│   │       │   ├── turn-processor.ts#   单回合工具调用编排
│   │       │   ├── turn.ts          #   回合配置
│   │       │   ├── max-mode.ts      #   并行采样选优
│   │       │   ├── pipeline.ts      #   执行管线
│   │       │   └── utils.ts         #   Doom Loop 检测等
│   │       ├── llm-sdk.ts           # LLM SDK 封装（向后兼容层）
│   │       ├── llm/                 # LLM 分层架构
│   │       │   ├── schema/          #   消息/事件/错误类型
│   │       │   │   ├── messages.ts  #     LLMMessage 类型
│   │       │   │   ├── events.ts    #     流式事件类型
│   │       │   │   ├── errors.ts    #     LLMError 类型
│   │       │   │   └── options.ts   #     请求选项
│   │       │   ├── protocols/       #   协议适配器
│   │       │   │   ├── openai-chat.ts         # OpenAI Chat Completions
│   │       │   │   ├── openai-responses.ts    # OpenAI Responses API
│   │       │   │   ├── openai-compatible-chat.ts # OpenAI 兼容协议
│   │       │   │   ├── anthropic-messages.ts  # Anthropic Messages API
│   │       │   │   └── gemini.ts              # Google Gemini
│   │       │   ├── providers/       #   Provider 实现
│   │       │   │   ├── openai.ts              # OpenAI
│   │       │   │   ├── anthropic.ts           # Anthropic
│   │       │   │   └── openai-compatible.ts   # DeepSeek/Ollama/Groq/自定义
│   │       │   ├── route/           #   路由客户端（自动选择协议）
│   │       │   ├── cache-policy.ts  #   缓存策略
│   │       │   └── tool-runtime.ts  #   工具运行时
│   │       ├── tools/               # 32 个工具
│   │       ├── memory/              # 四层记忆系统
│   │       ├── skill/               # Skill 系统（Slash 命令 + 动态加载）
│   │       ├── permission.ts        # 声明式权限（通配符 + 硬拒绝）
│   │       ├── permission/          # 权限子模块
│   │       │   └── approval-store.ts #  审批存储
│   │       ├── modes.ts             # Agent 模式（可扩展）
│   │       ├── agent-profile.ts     # Agent 配置（JSON 可序列化）
│   │       ├── config.ts            # 多层配置合并
│   │       ├── database.ts          # SQLite (sql.js)
│   │       ├── session-manager.ts   # 项目/会话管理
│   │       ├── session-store.ts     # 会话持久化
│   │       ├── registry.ts          # 工具注册表
│   │       ├── context-manager.ts   # 上下文窗口管理（checkpoint/rebuild）
│   │       ├── compaction.ts        # 上下文压缩
│   │       ├── message-utils.ts     # 消息工具函数
│   │       ├── goal-judge.ts        # Goal 完成度验证
│   │       ├── goal-manager.ts      # Goal 管理
│   │       ├── dream-distill.ts     # Dream/Distill 记忆进化
│   │       ├── subagent-manager.ts  # 子 Agent 管理
│   │       ├── delegate-runner.ts   # 任务委派执行
│   │       ├── team-bus.ts          # 团队通信总线
│   │       ├── task-tracker.ts      # 任务追踪
│   │       ├── task-planner.ts      # 任务规划
│   │       ├── iteration-budget.ts  # 迭代预算控制
│   │       ├── failover.ts          # LLM 故障转移
│   │       ├── recovery.ts          # 错误恢复
│   │       ├── background.ts        # 后台任务
│   │       ├── cron-scheduler.ts    # 定时调度
│   │       ├── worktree-manager.ts  # Git Worktree 管理
│   │       ├── instruction-context.ts # 指令上下文
│   │       ├── layers.ts            # 分层架构
│   │       ├── logger.ts            # 日志系统
│   │       ├── platform-paths.ts    # 跨平台路径
│   │       ├── plugin-hooks.ts      # 插件钩子
│   │       ├── plugin/              # 插件系统
│   │       ├── mcp/                 # MCP 协议支持
│   │       ├── lsp/                 # LSP 代码智能
│   │       │   ├── client.ts        #   LSP 客户端
│   │       │   ├── manager.ts       #   LSP 管理器
│   │       │   └── code-context.ts  #   代码上下文提取
│   │       ├── workflow/            # Dynamic Workflow 编排
│   │       ├── execution/           # 工具编排执行
│   │       │   └── orchestrator.ts  #   并行/串行工具编排
│   │       ├── server/              # API 服务
│   │       │   ├── server.ts        #   HTTP 服务
│   │       │   ├── api.ts           #   REST API
│   │       │   └── cli.ts           #   CLI 入口
│   │       ├── zod-converter.ts     # Zod → JSON Schema 转换
│   │       ├── tool.ts              # 工具定义工厂
│   │       ├── tool-executor.ts     # 工具执行器
│   │       ├── tool-effect.ts       # 工具副作用处理
│   │       ├── hooks-setup.ts       # Hook 默认设置
│   │       ├── compose-mode.ts      # 组合模式
│   │       ├── index.ts             # 统一导出
│   │       └── types.ts             # AgentEvent 类型
│   │
│   ├── electron/                    # @mira/electron — Electron 主进程
│   │   └── src/
│   │       ├── main/index.ts        # 应用入口
│   │       ├── preload/index.ts     # 预加载脚本 (contextBridge)
│   │       ├── ipc/                 # IPC 通信层（14 个模块）
│   │       │   ├── handlers.ts      #   统一注册
│   │       │   ├── agent-ipc.ts     #   Agent 流式执行
│   │       │   ├── compose-ipc.ts   #   组合模式
│   │       │   ├── config-ipc.ts    #   配置读写
│   │       │   ├── dream-ipc.ts     #   Dream/Distill
│   │       │   ├── goal-ipc.ts      #   Goal 管理
│   │       │   ├── memory-ipc.ts    #   记忆操作
│   │       │   ├── question-ipc.ts  #   用户交互
│   │       │   ├── session-ipc.ts   #   会话/项目 CRUD
│   │       │   ├── sidecar-bridge.ts#   Sidecar 进程通信
│   │       │   ├── skill-ipc.ts     #   Skill 加载
│   │       │   ├── subagent-ipc.ts  #   子 Agent 状态
│   │       │   └── task-ipc.ts      #   任务管理
│   │       ├── managers/            # 窗口/托盘管理
│   │       └── utils/               # 日志/环境变量
│   │
│   └── ui/                          # @mira/ui — React 前端组件
│       └── src/
│           ├── chat/                # 聊天组件
│           │   ├── ChatWindow.tsx   #   主聊天界面
│           │   ├── MiraRuntimeProvider.tsx # 运行时状态
│           │   ├── ModelSelector.tsx #  模型/模式选择
│           │   ├── PermissionDialog.tsx # 权限审批弹窗
│           │   ├── QuestionDialog.tsx #  用户交互弹窗
│           │   ├── MarkdownRenderer.tsx # Markdown 渲染
│           │   ├── CodeBlock.tsx    #   代码块
│           │   ├── MermaidBlock.tsx #   Mermaid 图表
│           │   ├── ThinkingBlock.tsx #  思考过程展示
│           │   ├── VoiceInput.tsx   #   语音输入
│           │   ├── ToolCallView.tsx #   工具调用展示
│           │   ├── ToolPalette.tsx  #   工具面板
│           │   ├── tool-router.ts   #   工具路由
│           │   ├── mira-runtime.ts  #   运行时类型
│           │   ├── types.ts         #   类型定义
│           │   └── tool-views/      #   工具结果视图
│           │       ├── ToolDiffView.tsx     # Diff 视图
│           │       ├── ToolShellView.tsx    # Shell 输出
│           │       ├── ToolReadView.tsx     # 文件读取
│           │       ├── ToolSearchView.tsx   # 搜索结果
│           │       ├── ToolGenericView.tsx  # 通用视图
│           │       └── tool-fold.ts         # 折叠逻辑
│           ├── sidebar/             # 侧边栏
│           │   ├── Sidebar.tsx      #   会话列表
│           │   ├── ProjectBar.tsx   #   项目切换
│           │   ├── SettingsDialog.tsx # 设置面板
│           │   ├── ModelManager.tsx #   模型管理
│           │   ├── ProviderConfigPanel.tsx # Provider 配置
│           │   ├── ThemeSelector.tsx #  主题选择
│           │   ├── NewProjectDialog.tsx # 新建项目
│           │   ├── EditProjectDialog.tsx # 编辑项目
│           │   └── types.ts         #   类型定义
│           ├── layout/TitleBar.tsx  # 自定义标题栏
│           ├── ui/                  # 通用 UI 组件
│           ├── hooks/               # React Hooks
│           ├── contexts/            # React Contexts
│           ├── lib/                 # 工具函数
│           ├── types/               # 类型声明
│           └── index.ts             # 统一导出
│
├── apps/
│   └── desktop/                     # @mira/desktop — Electron 应用壳
│       ├── src/
│       │   ├── App.tsx              # 应用根组件
│       │   ├── main.tsx             # React 入口
│       │   ├── main.ts              # Electron 入口
│       │   └── styles/              # 全局样式
│       ├── index.html               # HTML 模板
│       ├── electron.vite.config.ts  # Vite 构建配置
│       └── electron-builder.yml     # 打包配置
│
├── data/                            # 运行时数据 (SQLite)
├── memory/                          # 会话记忆 JSON
├── vector-memory/                   # 向量记忆存储
├── tasks/                           # 任务进度
├── checkpoints/                     # 检查点快照
├── docs/                            # 文档
├── resources/                       # 打包资源（图标等）
├── package.json                     # 根 package.json
├── pnpm-workspace.yaml              # pnpm workspace 配置
├── electron.vite.config.ts          # 根 Vite 配置
├── electron-builder.yml             # 根打包配置
├── tailwind.config.js               # Tailwind 主题
├── tsconfig.json                    # 根 TypeScript 配置
├── vitest.config.ts                 # 测试配置
├── AGENTS.md                        # 本文件
├── CONTEXT.md                       # 开发上下文
├── CONTRIBUTING.md                  # 贡献指南
└── README.md                        # 项目说明
```

## 包依赖关系

```
@mira/desktop (应用壳)
  ├── @mira/core
  ├── @mira/ui
  └── @mira/electron

@mira/electron (Electron 主进程)
  └── @mira/core

@mira/ui (前端组件)
  └── @mira/core

@mira/core (核心逻辑，无外部依赖)
  └── (独立)
```

## Agent 模式

| 模式 | 描述 | 迭代上限 | 可用工具 |
|------|------|----------|----------|
| 助手 (assistant) | 日常问答、写作、分析 | 10 | 全部（禁 bash/code_exec） |
| 专家 (expert) | 深度研究、数据分析 | 25 | 全部（禁 bash） |
| 执行 (action) | 自动化任务、批量处理 | 50 | 全部工具 |
| 安全 (safe) | 只读探索 | 5 | 只读（read_file/list_files/grep/glob/web_search/web_browse/data_analysis） |
| 规划 (plan) | 代码分析、方案设计 | 15 | 只读 + LSP（lsp_definition/lsp_references/lsp_hover） |

支持通过 `~/.config/mira/agents/` 和 `{project}/.mira/agents/` 目录加载自定义 Agent JSON 配置。

## 工具清单（32 个）

| 分类 | 工具 | 说明 |
|------|------|------|
| **core** | read_file | 读取文件内容 |
| | write_file | 创建/覆盖文件 |
| | edit_file | 编辑文件指定部分 |
| | list_files | 列出目录内容 |
| | grep | 正则内容搜索 |
| | glob | 文件名模式匹配 |
| | git_status | Git 状态 |
| | git_diff | Git 差异 |
| | git_log | Git 提交历史 |
| **knowledge** | web_search | 网络搜索 |
| | web_browse | 网页浏览（Playwright） |
| | web_fetch | URL 内容获取 |
| | data_analysis | 数据分析 |
| | memory_search | 记忆搜索 |
| | memory_recall | 记忆召回 |
| **execution** | bash | Shell 命令执行 |
| | code_exec | 代码执行 |
| | image_gen | AI 图片生成 |
| | git_commit | Git 提交 |
| **orchestration** | delegate_task | 任务委派给子 Agent |
| | team_tool | 团队协作工具 |
| | task_planner | 任务规划 |
| | cron_tool | 定时任务调度 |
| | worktree_tool | Git Worktree 管理 |
| | workflow_run | Dynamic Workflow 执行 |
| **infrastructure** | lsp_definition | 跳转到定义 |
| | lsp_references | 查找引用 |
| | lsp_hover | 悬停信息 |
| **interaction** | question | 向用户提问 |
| **document** | create-docx | Word 文档生成 |
| **search** | search-history | 历史记录搜索 |

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
| Gemini | 协议适配 | Gemini API |
| Custom | 兼容 | 用户自定义 URL |

## 高级特性

### Goal Judge（任务完成度验证）
独立的验证 Agent，判断任务是否真正完成。防止 Agent 提前宣称"完成"。
配置：`goalDescription` + `judgeModel`，最多评估 12 次，连续失败 3 次自动终止。

### Max Mode（并行采样选优）
每轮并行生成 N 个候选方案（默认 5），由 judge 模型选出最优执行。
提升 10-20% 准确率，代价 4-5x token 消耗。

### Dream/Distill（记忆进化）
- **Dream**：扫描会话轨迹，提取持久知识到项目记忆
- **Distill**：发现重复工作流，打包为可复用 skill/subagent

### Dynamic Workflow
代码级编排：主 Agent 生成 JS 脚本，通过 `agent()` / `parallel()` / `pipeline()` 协调子 Agent。

### Subagent 管理
最大并行 5 个子 Agent，支持委派、团队通信、任务追踪。

### MCP（Model Context Protocol）
支持 MCP 服务器扩展工具能力。

### LSP（Language Server Protocol）
代码智能：定义跳转、引用查找、悬停信息。

## IPC 通信

`preload.ts` 通过 `contextBridge` 暴露 `electronAPI`：

- `agent.*` — Agent 流式执行、权限回复、工具调用、Skill 列表
- `compose.*` — 组合模式
- `config.*` — 配置读写（全局 JSON + 项目 JSON + 环境变量）
- `dream.*` — Dream/Distill 操作
- `goal.*` — Goal 管理
- `memory.*` — 记忆操作
- `question.*` — 用户交互
- `session.*` — 项目/会话 CRUD、消息搜索
- `sidecar.*` — Sidecar 进程通信
- `skill.*` — Skill 加载
- `subagent.*` — 子 Agent 状态
- `task.*` — 任务管理
- `safeStorage.*` — API Key 加密存储（Electron safeStorage）
- `dialog/*` — 文件/目录选择对话框
- `window:*` — 窗口控制（最小化/最大化/关闭）

## 数据库

SQLite (sql.js WASM) 表结构：

| 表 | 字段 | 说明 |
|----|------|------|
| projects | project_id, name, workspace_path, created_at | 项目 |
| sessions | session_id, project_id, title, workspace, created_at, updated_at | 会话 |
| messages | id, session_id, role, content, timestamp, tool_call_id | 消息历史 |
| permissions | workspace, action, resource, effect | 权限规则 |
| goals | session_id, id, description, created_at, status, satisfied_at, timeout_ms, evaluations_json | Goal 追踪 |

## 开发指南

```bash
# 安装依赖（需要 pnpm）
pnpm install

# 启动开发模式
pnpm dev
# 或
.\start.ps1 dev

# 打包
pnpm package:win    # Windows
pnpm package:mac    # macOS
pnpm package:linux  # Linux

# 测试
pnpm test

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint
pnpm lint:fix
```

## 环境要求

- Node.js 18+
- pnpm 8+
- Windows / macOS / Linux
- **无需 Python**（Agent Core 完全由 TypeScript 实现）

## Understand Anything Dashboard（代码图谱可视化）

知识图谱仪表盘用于交互式浏览代码库结构。当用户说"看图谱"、"启动可视化"等时执行以下流程：

### 启动命令

```powershell
$env:GRAPH_DIR = "<项目根目录>"
Set-Location -LiteralPath "$HOME\.understand-anything\repo\understand-anything-plugin\packages\dashboard"
npx vite --host 127.0.0.1
```

### 路径信息

- 插件根目录：`C:\Users\Devenv114\.understand-anything\repo`
- 仪表盘目录：`$HOME\.understand-anything\repo\understand-anything-plugin\packages\dashboard`
- 知识图谱文件：`<项目根目录>\.understand-anything\knowledge-graph.json`

### 前置检查

1. 检查知识图谱是否存在：`Test-Path "<项目根目录>\.understand-anything\knowledge-graph.json"`
2. 如果不存在，提示用户先运行 `/understand` 命令
3. 检查 `$HOME\.understand-anything\repo\understand-anything-plugin\packages\core\dist\index.js` 是否存在，若不存在则构建 core 包

### Token 提取

从 Vite 启动输出中提取 `🔑 Dashboard URL: http://127.0.0.1:<PORT>/?token=<TOKEN>` 这行，向用户返回完整的带 token 的 URL。
