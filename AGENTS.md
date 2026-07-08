# Mira 项目文档

## 项目概述

Mira 是一个全能 AI 助手桌面应用，基于 **Electron + TypeScript Agent Core** 架构打造，**零 Python 依赖**。

## 技术栈

| 层次 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 31 (electron-vite) |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS + @assistant-ui/react + @assistant-ui/react-streamdown |
| Agent Core | TypeScript（纯 TS 实现，无 Python） |
| LLM | OpenAI / Anthropic Claude / DeepSeek / Ollama / Groq / Gemini / 自定义 API |
| 数据库 | SQLite (sql.js WASM，防抖持久化) |
| 向量记忆 | Transformers.js 本地 ONNX 推理（零外部依赖） |
| 代码智能 | LSP (Language Server Protocol) |
| 协议扩展 | MCP (Model Context Protocol) |
| HTML 转换 | Turndown（HTML → Markdown 专业转换） |
| 3D 图谱 | react-force-graph-3d + three.js |
| 动态头像 | untitled-pixi-live2d-engine + pixi.js v8 (Live2D Cubism SDK 5-r.4) |
| 构建 | electron-builder（便携模式，目标电脑无需安装任何运行时） |

## 目录结构

```
mira/
├── packages/
│   ├── core/                        # @mira/core — Agent Core 核心逻辑
│   │   └── src/
│   │       ├── index.ts             # 统一导出
│   │       ├── types.ts             # AgentEvent 类型
│   │       ├── compose-mode.ts      # 组合模式
│   │       ├── agent/               # Agent 核心子模块
│   │       │   ├── index.ts
│   │       │   ├── agent.ts         #   Agent 核心循环
│   │       │   ├── context.ts       #   系统提示构建
│   │       │   ├── state-machine.ts #   生命周期状态机
│   │       │   ├── turn-processor.ts#   单回合工具调用编排
│   │       │   ├── turn.ts          #   回合配置
│   │       │   ├── max-mode.ts      #   并行采样选优
│   │       │   ├── utils.ts         #   Doom Loop 检测
│   │       │   ├── fork-cache.ts    #   分支缓存
│   │       │   ├── text-ngram.ts    #   文本 N-gram 分析
│   │       │   ├── registry.ts      #   Agent 内部注册表
│   │       │   └── system-context.ts#   系统级上下文
│   │       ├── llm/                 # LLM 分层架构
│   │       │   ├── index.ts
│   │       │   ├── client.ts        #   LLM 客户端
│   │       │   ├── cache-policy.ts  #   缓存策略
│   │       │   ├── tool-runtime.ts  #   工具运行时
│   │       │   ├── schema/          #   消息/事件/错误类型
│   │       │   │   ├── index.ts
│   │       │   │   ├── messages.ts  #     LLMMessage 类型
│   │       │   │   ├── events.ts    #     流式事件类型
│   │       │   │   ├── errors.ts    #     LLMError 类型
│   │       │   │   └── options.ts   #     请求选项
│   │       │   ├── protocols/       #   协议适配器
│   │       │   │   ├── index.ts
│   │       │   │   ├── openai-chat.ts         # OpenAI Chat Completions
│   │       │   │   ├── openai-responses.ts    # OpenAI Responses API
│   │       │   │   ├── openai-compatible-chat.ts # OpenAI 兼容协议
│   │       │   │   ├── anthropic-messages.ts  # Anthropic Messages API
│   │       │   │   └── gemini.ts              # Google Gemini
│   │       │   ├── providers/       #   Provider 实现（配置驱动）
│   │       │   │   └── index.ts     #   12 种 Provider（OpenAI/Anthropic/DeepSeek/Ollama/Groq/Fireworks/Together/Cerebras/Perplexity/Gemini/Vertex/自定义）
│   │       │   └── route/           #   路由客户端
│   │       │       ├── index.ts
│   │       │       ├── types.ts     #   路由类型（Auth/Endpoint/Framing/Protocol）
│   │       │       ├── route.ts     #   路由实例创建
│   │       │       └── client.ts    #   路由客户端实现
│   │       ├── config/              # 配置模块
│   │       │   ├── index.ts
│   │       │   ├── flags.ts         #   特性开关
│   │       │   ├── modes.ts         #   Agent 模式定义
│   │       │   ├── paths.ts         #   跨平台路径
│   │       │   └── profile.ts       #   Agent 配置（JSON 可序列化）
│   │       ├── system/              # 系统级模块
│   │       │   ├── database.ts      #   SQLite (sql.js)
│   │       │   ├── instruction.ts   #   指令上下文
│   │       │   ├── logger.ts        #   日志系统
│   │       │   ├── registry.ts      #   工具注册表
│   │       │   ├── registry-init.ts #   注册表初始化
│   │       │   ├── server-manager.ts#   服务器管理器
│   │       │   ├── permission/      #   权限子模块
│   │       │   │   ├── index.ts
│   │       │   │   ├── gate.ts      #     权限门控
│   │       │   │   ├── store.ts     #     权限规则存储
│   │       │   │   └── approval-store.ts # 审批存储
│   │       │   └── server/          #   API 服务
│   │       │       ├── index.ts
│   │       │       ├── server.ts    #     HTTP 服务
│   │       │       ├── api.ts       #     REST API
│   │       │       └── cli.ts       #     CLI 入口
│   │       ├── session/             # 会话管理
│   │       │   ├── manager.ts       #   项目/会话管理
│   │       │   ├── store.ts         #   会话持久化
│   │       │   ├── context.ts       #   上下文窗口管理（checkpoint/rebuild）
│   │       │   ├── compaction.ts    #   上下文压缩
│   │       │   ├── fork.ts          #   会话分支
│   │       │   └── snapshot.ts      #   会话快照
│   │       ├── memory/              # 记忆系统
│   │       │   ├── manager.ts       #   记忆管理器
│   │       │   ├── types.ts         #   记忆类型定义
│   │       │   ├── builtin-provider.ts    #   内置记忆提供者
│   │       │   ├── checkpoint-provider.ts #   检查点提供者
│   │       │   ├── file-memory-provider.ts #  文件记忆提供者
│   │       │   ├── fts-memory-provider.ts #  全文搜索记忆提供者
│   │       │   └── vector-provider.ts     #   向量记忆提供者
│   │       ├── shared/              # 共享工具模块
│   │       │   ├── tool.ts          #   工具定义工厂
│   │       │   ├── tool-executor.ts #   工具执行器
│   │       │   ├── tool-effect.ts   #   工具副作用处理
│   │       │   ├── zod-converter.ts #   Zod → JSON Schema 转换
│   │       │   ├── message-utils.ts #   消息工具函数
│   │       │   ├── plugin-hooks.ts  #   插件钩子
│   │       │   └── hooks-setup.ts   #   Hook 默认设置
│   │       ├── orchestrate/         # 编排模块
│   │       │   ├── goal-judge.ts    #   Goal 完成度验证
│   │       │   ├── goal-manager.ts  #   Goal 管理
│   │       │   ├── subagent.ts      #   子 Agent 管理（Actor 模型）
│   │       │   ├── actor-gate.ts    #   任务完成门控（TaskGate）
│   │       │   ├── actor-protocol.ts #   标准化返回协议
│   │       │   ├── delegate.ts      #   任务委派执行
│   │       │   ├── team-bus.ts      #   团队通信总线
│   │       │   ├── execution.ts     #   工具编排执行（并行/串行）
│   │       │   ├── dream.ts         #   Dream/Distill 记忆进化
│   │       │   └── failover.ts      #   LLM 故障转移
│   │       ├── task/                # 任务管理
│   │       │   ├── tracker.ts       #   任务追踪
│   │       │   ├── planner.ts       #   任务规划
│   │       │   └── budget.ts        #   迭代预算控制
│   │       ├── background/          # 后台任务
│   │       │   ├── index.ts
│   │       │   ├── cron.ts          #   定时调度
│   │       │   ├── recovery.ts      #   错误恢复
│   │       │   └── worktree.ts      #   Git Worktree 管理
│   │       ├── skill/               # Skill 系统
│   │       │   ├── skill-loader.ts  #   动态加载
│   │       │   ├── skill-commands.ts#   Slash 命令
│   │       │   └── skill-tools.ts   #   Skill 工具
│   │       ├── tools/               # 工具层（7 个子目录，38 个工具）
│   │       │   ├── index.ts         #   导出所有工具
│   │       │   ├── core/            #   核心工具（read/write/edit/list/grep/glob/git/code-search/search-history/create-docx/apply-patch/bash-security）
│   │       │   ├── execution/       #   执行工具（bash/code-exec/image-gen）
│   │       │   ├── knowledge/       #   知识工具（web-search/web-browse/web-fetch/data-analysis/memory）
│   │       │   ├── knowledge/       #   安全工具（ssrf-util/cache-util/playwright-shared）
│   │       │   ├── orchestrate/     #   编排工具（agent-tools/delegate-task/team-tool/task-tool/cron-tool/worktree-tool/workflow-tool）
│   │       │   ├── infra/           #   基础设施（lsp-tool）
│   │       │   ├── interaction/     #   交互工具（question）
│   │       │   └── shared/          #   工具共享（tool-loader/tool-meta/tool-output-store）
│   │       ├── lsp/                 # LSP 代码智能
│   │       │   ├── client.ts        #   LSP 客户端
│   │       │   ├── manager.ts       #   LSP 管理器
│   │       │   └── code-context.ts  #   代码上下文提取
│   │       ├── mcp/                 # MCP 协议支持
│   │       │   └── index.ts
│   │       ├── plugin/              # 插件系统
│   │       │   └── index.ts
│   │       ├── workflow/            # Dynamic Workflow 编排
│   │       │   └── index.ts
│   │       └── __tests__/           # 测试
│   │           ├── setup.ts
│   │           ├── agent.test.ts
│   │           ├── tool.test.ts
│   │           ├── smoke.test.ts
│   │           ├── llm-sdk.test.ts
│   │           ├── message-utils.test.ts
│   │           ├── permission-loop.test.ts
│   │           ├── benchmark.test.ts
│   │           ├── compaction.test.ts
│   │           ├── failover.test.ts
│   │           └── plugin-hooks.test.ts
│   │
│   ├── electron/                    # @mira/electron — Electron 主进程
│   │   └── src/
│   │       ├── index.ts             # 主进程入口
│   │       ├── main/                # 应用入口
│   │       ├── preload/index.ts     # 预加载脚本 (contextBridge)
│   │       ├── ipc/                 # IPC 通信层（14 个模块）
│   │       │   ├── index.ts         #   统一导出
│   │       │   ├── handlers.ts      #   统一注册
│   │       │   ├── compose-ipc.ts   #   组合模式
│   │       │   ├── config-ipc.ts    #   配置读写
│   │       │   ├── dream-ipc.ts     #   Dream/Distill
│   │       │   ├── goal-ipc.ts      #   Goal 管理
│   │       │   ├── live2d-ipc.ts    #   Live2D 头像控制
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
│           ├── index.ts             # 统一导出
│           ├── chat/                # 聊天组件
│           │   ├── ChatWindow.tsx   #   主聊天界面
│           │   ├── MiraRuntimeProvider.tsx # 运行时状态
│           │   ├── ModelSelector.tsx #  模型/模式选择
│           │   ├── PermissionDialog.tsx # 权限审批弹窗
│           │   ├── ProgressBar.tsx  #   进度条
│           │   ├── QuestionDialog.tsx #  用户交互弹窗
│           │   ├── ThinkingBlock.tsx #  思考过程展示
│           │   ├── MiraLogo.tsx     #   Mira 标识
│           │   ├── VoiceInput.tsx   #   语音输入
│           │   ├── ToolCallView.tsx #   工具调用展示
│           │   ├── ToolPalette.tsx  #   工具面板
│           │   ├── tool-router.ts   #   工具路由
│           │   ├── mira-runtime.ts  #   运行时类型
│           │   ├── types.ts         #   类型定义
│           │   └── tool-views/      #   工具结果视图
│           │       ├── ToolDiffView.tsx
│           │       ├── ToolShellView.tsx
│           │       ├── ToolReadView.tsx
│           │       ├── ToolSearchView.tsx
│           │       ├── ToolGenericView.tsx
│           │       └── tool-fold.ts
│           ├── components/          # 组件
│           │   ├── assistant-ui/    #   assistant-ui 扩展组件
│           │   │   ├── markdown-text.tsx
│           │   │   ├── reasoning.tsx
│           │   │   ├── tool-fallback.tsx
│           │   │   ├── tool-group.tsx
│           │   │   ├── diff-viewer.tsx
│           │   │   ├── message-timing.tsx
│           │   │   ├── context-display.tsx
│           │   │   ├── tooltip-icon-button.tsx
│           │   │   ├── animated-avatar.tsx   # CSS 动画头像
│           │   │   ├── animated-avatar.css   # 头像动画样式
│           │   │   └── live2d-avatar.tsx     # Live2D 动态头像（untitled-pixi-live2d-engine）
│           │   └── ui/              #   shadcn 基础 UI 组件（10 个）
│           │       ├── button.tsx
│           │       ├── collapsible.tsx
│           │       ├── dialog.tsx
│           │       ├── dropdown-menu.tsx
│           │       ├── input.tsx
│           │       ├── Modal.tsx
│           │       ├── select.tsx
│           │       ├── switch.tsx
│           │       ├── tabs.tsx
│           │       └── tooltip.tsx
│           ├── memory/              #   知识图谱
│           │   ├── MemoryGraph.tsx  #     3D 力导向图谱组件
│           │   ├── GraphPanel.tsx   #     图谱全屏面板
│           │   └── graph-data.ts    #     实体/关系提取引擎
│           ├── sidebar/             # 侧边栏
│           │   ├── Sidebar.tsx
│           │   ├── ProjectBar.tsx
│           │   ├── SettingsDialog/      #   设置弹窗（含4个子组件）
│           │   ├── ConfigSourceIndicator.tsx
│           │   ├── ModelManager.tsx
│           │   ├── provider-data.ts
│           │   ├── ProviderConfigPanel.tsx
│           │   ├── ThemeSelector.tsx
│           │   ├── NewProjectDialog.tsx
│           │   ├── EditProjectDialog.tsx
│           │   └── types.ts
│           ├── layout/TitleBar.tsx  # 自定义标题栏
│           ├── hooks/               # React Hooks
│           ├── contexts/            # React Contexts
│           ├── lib/                 # 工具函数
│           ├── services/            # 服务层
│           ├── types/               # 类型声明
│           └── ui/                  # 额外 UI 组件
│
├── apps/
│   └── desktop/                     # @mira/desktop — Electron 应用壳
│       ├── src/
│       │   ├── App.tsx              # 应用根组件
│       │   ├── main.tsx             # React 入口
│       │   ├── main.ts              # Electron 入口
│       │   ├── lib/                 # 工具库
│       │   └── styles/              # 全局样式
│       ├── index.html               # HTML 模板（CSP 配置）
│       ├── electron.vite.config.ts  # Vite 构建配置
│       └── electron-builder.yml     # 打包配置
│
├── public/                          # Vite 静态资源（根目录）
│   ├── Core/                        #   Live2D Cubism Core
│   │   └── live2dcubismcore.min.js  #     Cubism 运行时
│   └── models/                      #   Live2D 模型文件
│       └── hiyori/                  #     示例模型
│           ├── Hiyori.model3.json   #       模型配置
│           ├── Hiyori.moc3          #       编译后模型
│           └── textures/            #       贴图文件
├── data/                            # 运行时数据 (SQLite)
├── memory/                          # 会话记忆 JSON
├── vector-memory/                   # 向量记忆存储
├── tasks/                           # 任务进度
├── checkpoints/                     # 检查点快照
├── docs/                            # 文档
├── resources/                       # 打包资源（图标等）
├── logs/                            # 运行日志
├── package.json                     # 根 package.json
├── pnpm-workspace.yaml              # pnpm workspace 配置
├── electron.vite.config.ts          # 根 Vite 配置
├── electron-builder.yml             # 根打包配置
├── tailwind.config.js               # Tailwind 主题
├── postcss.config.js                # PostCSS 配置
├── tsconfig.json                    # 根 TypeScript 配置
├── vitest.config.ts                 # 测试配置
├── components.json                  # shadcn 组件配置
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

## 工具清单（38 个）

| 分类 | 工具 | 说明 |
|------|------|------|
| **core** | read_file | 读取文件内容（魔数检测 + 字节精确截断 + 编码检测） |
| | write_file | 创建/覆盖文件（BOM 保留 + stale 检测 + 写入锁） |
| | edit_file | 编辑文件指定部分（9 种匹配策略 + LSP 增强回退） |
| | list_files | 列出目录内容 |
| | grep | 正则内容搜索 |
| | glob | 文件名模式匹配 |
| | code_search | 代码语义搜索 |
| | git_status | Git 状态 |
| | git_diff | Git 差异 |
| | git_log | Git 提交历史 |
| **knowledge** | web_search | 网络搜索（Exa/Parallel MCP + DuckDuckGo 免费降级 + TTL 缓存） |
| | web_browse | 网页浏览（Playwright，支持 navigate/click/type/scroll/back/extract/**capture**） |
| | web_fetch | URL 内容获取（Turndown + SSRF 防护 + TTL 缓存） |
| | data_analysis | 数据分析 |
| | memory_search | 记忆搜索 |
| | memory_recall | 记忆召回 |
| **execution** | bash | Shell 命令执行（支持 PowerShell/CMD/Unix sh） |
| | code_exec | 代码执行 |
| | image_generate | AI 图片生成 |
| | git_commit | Git 提交 |
| **orchestrate** | delegate_task | 任务委派给子 Agent |
| | team_tool | 团队协作工具 |
| | plan_task | 任务规划 |
| | cron_tool | 定时任务调度 |
| | worktree_tool | Git Worktree 管理 |
| | workflow_run | Dynamic Workflow 执行 |
| | spawn_agent | 启动子 Agent |
| | wait_agents | 等待子 Agent 完成 |
| | list_subagents | 列出子 Agent 状态 |
| **infra** | lsp_definition | 跳转到定义 |
| | lsp_references | 查找引用 |
| | lsp_hover | 悬停信息 |
| | create_mcp | 创建 MCP 服务器 |
| **skill** | skills_list | 列出可用 Skill |
| | skill_view | 查看 Skill 详情 |
| **interaction** | question | 向用户提问 |
| **document** | create_docx | Word 文档生成 |
| | apply_patch | 多文件批量编辑（4 层模糊匹配 + ChangeContext 锚点） |
| **search** | search_history | 历史记录搜索 |

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
| Vertex | 协议适配 | Vertex AI API |
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
基于 Actor 模型的子 Agent 系统，支持以下功能：

| 特性 | 说明 |
|------|------|
| **调度模式** | `subagent`（共享会话）和 `peer`（独立工作目录） |
| **注册表持久化** | SQLite `actor_registry` 表，进程重启后自动恢复孤儿 Actor |
| **任务门控** | TaskGate 验证子 Agent 是否真正完成任务，最多 2 次自动重试，失败自动降级 |
| **标准化返回协议** | 子 Agent 按 `**Status**` / `**Summary**` 头块输出结构化结果 |
| **上下文继承** | 三种模式：`none`（只传 prompt）、`state`（注入 checkpoint 摘要）、`full`（共享前缀缓存） |
| **ReAct 循环** | preStop 循环（结果不符合预期时最多 3 轮自动补跑） + postStop 循环（完成后的跟进工作） |
| **粘滞检测** | 每分钟扫描，5 分钟无活动的子 Agent 自动标记为 `stuck` |
| **并发控制** | 最大并行 5（可配置），最大嵌套深度 8，总生命周期上限 100 |
| **状态机** | pending → running → completing → completed / failed / cancelled / orphaned / stuck |
| **通信总线** | 子 Agent 通过 `team-bus` 发送通知和结果给父 Agent |

### MCP（Model Context Protocol）
支持 MCP 服务器扩展工具能力。

### LSP（Language Server Protocol）
代码智能：定义跳转、引用查找、悬停信息。

## 聊天模块（Part 消息体系）

消息以 Part 数组结构存储，每个 Part 有独立类型和渲染方式：

| Part 类型 | 渲染组件 | 说明 |
|-----------|---------|------|
| `text` | MarkdownText（Streamdown） | 流式 Markdown 渲染，Shiki 代码高亮 |
| `thinking` | ThinkingBlock | AI 推理过程折叠面板 |
| `tool-call` | ToolCallView → 按工具名路由 | 自动路由到 ToolReadView/ToolShellView/ToolSearchView/ToolDiffView |
| `file` | 图片/文件内嵌 | 附件展示 |
| `diff-summary` | ToolDiffSummary | 回合级文件变更汇总（+N / -M） |
| `compaction` | 分割线 | 上下文压缩标记 |

连续 `read_file`/`glob`/`grep`/`list_files` 工具调用自动聚合为 **ContextToolGroup** 折叠面板。

## assistant-ui 组件集成

项目使用 assistant-ui 作为聊天 UI 框架，采用 `ExternalStoreRuntime` 桥接自定义状态：

| 集成方式 | 组件 |
|---------|------|
| Runtime | `ExternalStoreRuntime` — 桥接 `useMiraChat` 状态 |
| Primitives | `ThreadPrimitive`、`MessagePrimitive`、`ComposerPrimitive` |
| Actions | `ActionBarPrimitive`、`BranchPickerPrimitive`、`SelectionToolbarPrimitive` |
| Markdown | `@assistant-ui/react-streamdown` — Streamdown（Shiki + Mermaid 内置） |
| Voice | `WebSpeechSynthesisAdapter`（TTS）、`WebSpeechDictationAdapter`（STT） |
| Files | `AttachmentAdapter` — 自定义文件上传 |
| Queue | `createMessageQueue` — 运行时允许排队发消息 |
| shadcn 组件 | ToolFallback、ToolGroup、Reasoning、DiffViewer、MessageTiming、ContextDisplay |

未使用内置 `<Thread />` 组件，而是用 Primitives 自行拼装以满足定制需求（Skill 补全/ModelSelector/WelcomeScreen）。

## IPC 通信

`preload.ts` 通过 `contextBridge` 暴露 `electronAPI`：

| 命名空间 | 功能 |
|---------|------|
| `agent.*` | Agent 流式执行、工具调用、权限回复、Skill 列表 |
| `agent.question.*` | Agent 向用户提问与回答 |
| `agent.task.*` | 任务追踪 CRUD |
| `agent.subagent.*` | 子 Agent 生命周期控制 |
| `agent.goal.*` | Goal 管理 |
| `agent.dreamDistill.*` | Dream/Distill 记忆进化 |
| `agent.compose.*` | 组合模式全流程 |
| `agent.onEvent` | 监听 Agent 流式事件 |
| `config.*` | 配置读写（全局 JSON + 项目 JSON + 环境变量） |
| `ts.*` | 项目/会话 CRUD、消息搜索、快照恢复 |
| `memory.*` | 记忆搜索与状态查询 |
| `encryptApiKey` / `decryptApiKey` / `isEncryptionAvailable` | API Key 加密存储（Electron safeStorage） |
| `platform` | 当前平台标识 |
| `notify` | 系统通知 |
| `openFile` / `openDirectory` / `saveFile` | 文件/目录选择对话框 |
| `getPythonStatus` / `getPythonLogs` / `restartPython` | Python 进程管理 |
| `minimizeWindow` / `maximizeWindow` / `closeWindow` | 窗口控制 |

## 数据库

SQLite (sql.js WASM) 表结构：

| 表 | 字段 | 说明 |
|----|------|------|
| projects | project_id, name, workspace_path, created_at | 项目 |
| sessions | session_id, project_id, title, workspace, created_at, updated_at | 会话 |
| messages | id, session_id, role, content, timestamp, tool_call_id, retry_count | 消息历史 |
| permissions | workspace, action, resource, effect | 权限规则 |
| goals | session_id, id, description, created_at, status, satisfied_at, timeout_ms, evaluations_json | Goal 追踪 |
| actor_registry | actor_id, session_id, parent_actor_id, mode, status, description, context_mode, agent, result, error, turn_count, time_created, time_updated, time_completed, lifecycle | 子 Agent 注册表 |

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
