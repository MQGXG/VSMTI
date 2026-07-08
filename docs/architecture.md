# Mira 架构文档

## 一、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                       渲染进程 (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────────┐  │
│  │ TitleBar │  │ Sidebar  │  │ ChatWindow                 │  │
│  │ 状态指示  │  │ 项目/会话  │  │ ┌─────────────────────┐  │  │
│  │          │  │          │  │ │ ToolPalette（工具面板）│  │  │
│  │          │  │          │  │ │ ChatInput             │  │  │
│  │          │  │          │  │ │ MarkdownRenderer       │  │  │
│  │          │  │          │  │ │ ToolCallView           │  │  │
│  │          │  │          │  │ └─────────────────────┘  │  │  │
│  └──────────┘  └──────────┘  └───────────────────────────┘  │
│                           │                                   │
│                  ┌────────┴────────┐                          │
│                  ▼ IPC (contextBridge)                        │
├──────────────────────────────────────────────────────────────┤
│                    主进程 (Node.js)                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ @mira/core — TypeScript Agent Core                      │  │
│  │  agent/           Agent 核心循环 + 状态机 + 回合编排      │  │
│  │  llm/             LLM 分层架构                           │  │
│  │    schema/        消息/事件/错误类型                      │  │
│  │    protocols/     OpenAI/Anthropic/Gemini 等 5 种协议    │  │
│  │    providers/     12 个 Provider 配置                    │  │
│  │    route/         路由客户端                             │  │
│  │  tools/           38 个工具（8 分类）                     │  │
│  │  memory/          五层记忆系统                           │  │
│  │  system/          数据库/权限/注册表/日志/服务            │  │
│  │    permission/    声明式权限系统（gate/store/approval）   │  │
│  │  session/         会话/项目管理 + 上下文压缩             │  │
│  │  orchestrate/     编排（Goal/Subagent/Dream/Failover）   │  │
│  │    actor-gate/    任务门控（TaskGate 自动验证与重试）    │  │
│  │    actor-protocol/ 标准化返回协议（Status/Summary）       │  │
│  │  config/          配置多层合并 + Agent 模式              │  │
│  │  task/            任务追踪/规划/预算控制                 │  │
│  │  background/      定时调度/错误恢复/Git Worktree         │  │
│  │  skill/           Skill 动态加载/Slash 命令              │  │
│  │  compose-mode.ts  组合模式（7 阶段）                     │  │
│  │  workflow/        Dynamic Workflow 编排                 │  │
│  │  mcp/             MCP 协议支持                          │  │
│  │  plugin/          插件系统                              │  │
│  │  lsp/             LSP 代码智能                          │  │
│  │  shared/          工具工厂/Zod 转换/消息工具/插件钩子    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                           │                                    │
│                  ┌────────┴────────┐                           │
│                  ▼ LLM APIs        ▼ MCP Servers               │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ OpenAI / Claude  │  │ 外部工具服务器    │                  │
│  │ DeepSeek / Ollama│  │                  │                  │
│  │ Groq / Gemini    │  │                  │                  │
│  └──────────────────┘  └──────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

## 二、包架构

```
mira/
├── apps/
│   └── desktop/       # @mira/desktop — Electron 应用壳
├── packages/
│   ├── core/          # @mira/core — 核心逻辑（无外部依赖）
│   ├── electron/      # @mira/electron — Electron 主进程
│   └── ui/            # @mira/ui — React 前端组件
├── docs/
├── data/              # 运行时数据 (SQLite)
├── memory/            # 会话记忆 JSON
├── vector-memory/     # 向量记忆存储
├── tasks/             # 任务进度
├── checkpoints/       # 检查点快照
├── logs/              # 运行日志
├── package.json       # 根 package.json (pnpm monorepo)
└── pnpm-workspace.yaml
```

### 包依赖关系

```
@mira/desktop
  ├── @mira/core
  ├── @mira/ui
  └── @mira/electron

@mira/electron
  └── @mira/core

@mira/ui
  └── @mira/core

@mira/core（独立，无外部依赖）
```

## 三、数据流

### 3.1 AI 对话流

```
用户输入 → ChatWindow → useMiraChat hook
    → IPC "agent:run" → Agent.run()
    → LLM.stream() → Provider API
    → AgentEvent (AsyncGenerator)
    → ChatWindow 逐事件渲染
```

**主流程通过 IPC (contextBridge) 直连通信；同时提供 Sidecar HTTP 进程作为可选代理层。**

### 3.2 工具执行流

```
Agent 循环 → tool_call → PermissionSet.evaluate()
    → 允许/拒绝/询问用户
    → ToolOrchestrator.execute()
    → 具体工具 (readFile / bash / webSearch / git...)
    → 结果返回 Agent 继续循环
```

### 3.3 记忆注入流

```
Agent 启动 → MemoryManager.selectMemories()
    → 搜索各层记忆（checkpoint/builtin/fts/file/vector）
    → 注入系统提示词
    → Agent 带着上下文继续工作
```

### 3.4 子 Agent 流

```
主 Agent → delegate_task / spawn_agent → SubagentManager.spawn()
    → 子 Agent 独立运行（最大并行 5，最大嵌套深度 8）
    → SQLite 注册表持久化 + 孤儿恢复
    → TaskGate 任务门控验证（最多 2 次自动重试）
    → 标准化返回协议（**Status** / **Summary**）
    → ReAct 循环（preStop + postStop，各 3 轮）
    → 粘滞检测（5 分钟无活动 = stuck）
    → 完成后结果返回主 Agent
    → 主 Agent 继续工作
```

## 四、Agent Core 核心模块

### 4.1 Agent 主循环 (`agent/agent.ts`)

```
Agent.run()
  ├→ AgentStateMachine 管理生命周期（idle/running/waiting_permission/stopped/done）
  ├→ ContextManager 管理上下文窗口（4 层压缩管线 + Checkpoint）
  ├→ processTurn() 执行单回合
  │   ├→ buildSystemMessage() 组装系统提示
  │   ├→ LLM.stream() 获取模型输出
  │   ├→ 工具调用 → PermissionSet → ToolOrchestrator
  │   └→ 返回 AgentEvent 流
  ├→ GoalJudge 验证任务完成度
  └→ DoomLoop 检测防止死循环
```

### 4.2 LLM 分层架构

```
schema/          → 类型定义（LLMMessage, LLMStreamEvent, LLMError）
    │
protocols/       → 协议适配（将统一类型转换为各 API 格式）
    ├── openai-chat.ts              → OpenAI Chat Completions
    ├── openai-responses.ts         → OpenAI Responses API
    ├── openai-compatible-chat.ts   → OpenAI 兼容协议（DeepSeek/Ollama/Groq 等）
    ├── anthropic-messages.ts       → Anthropic Messages API
    └── gemini.ts                   → Google Gemini
    │
providers/       → Provider 配置注册（管理认证、路由、重试）
    ├── openai          → OpenAI (gpt-4o, gpt-4o-mini...)
    ├── anthropic       → Anthropic (claude-sonnet-4, claude-opus-4...)
    ├── deepseek        → DeepSeek (deepseek-chat, deepseek-reasoner)
    ├── ollama          → Ollama (本地 llama3 等)
    ├── groq            → Groq (llama3-70b, mixtral...)
    ├── fireworks       → Fireworks AI
    ├── together        → Together AI
    ├── cerebras        → Cerebras
    ├── perplexity      → Perplexity
    ├── gemini          → Google Gemini (gemini-2.0-flash...)
    ├── vertex          → Vertex AI (gemini 协议适配)
    └── custom          → 自定义 OpenAI 兼容 API
    │
route/           → 路由客户端（根据 provider 自动选择协议和认证方式）
```

### 4.3 工具系统

```typescript
// 工具定义 — 使用 make() + Zod Schema
export const myTool = make({
  name: "my_tool",
  description: "What this tool does",
  inputSchema: z.object({
    path: z.string().describe("Path to file"),
  }),
  outputSchema: z.string(),
  permission: "read",
  async execute(input, ctx) {
    // 1. 参数已由 Zod 验证
    // 2. 路径操作用 ctx.workspace 做基路径
    // 3. 捕获异常返回 { success: false, error }
    // 4. 成功返回 { success: true, output }
  },
})
```

38 个工具通过 `system/registry.ts` + `system/registry-init.ts` 注册，分为 8 类：

| 分类 | 工具 | 说明 |
|------|------|------|
| **core** | read/write/edit/list/grep/glob/git(bash/status/diff/log/commit)/code-search/search-history/create-docx/bash-security | 文件、搜索、Git、文档 |
| **knowledge** | web-search/web-browse/web-fetch/data-analysis/memory-search/memory-recall | 网络、数据、记忆 |
| **execution** | bash/code-exec/image-gen | Shell、代码、图片 |
| **orchestrate** | agent-tools/delegate-task/team-tool/task-tool/cron-tool/worktree-tool/workflow-tool/spawn-agent/wait-agents/list-subagents | 子 Agent、任务、调度 |
| **infra** | lsp-definition/lsp-references/lsp-hover/create-mcp | 代码智能 |
| **interaction** | question | 用户交互 |
| **skill** | skills-list/skill-view | Skill 系统 |
| **shared** | tool-loader/tool-meta/tool-output-store | 工具元数据/输出 |

- 并行执行声明
- 权限过滤（permission 字段）
- 工具 allowlist（按模式过滤）
- 错误分类（RecoverableError / FatalError）
- 输出截断上限（maxOutputLength）

### 4.4 权限系统 (`system/permission/`)

```typescript
// 声明式权限规则
const rules: PermissionRule[] = [
  { action: "read_file", resource: "*", effect: "allow" },
  { action: "bash", resource: "ls *", effect: "allow" },
  { action: "bash", resource: "*", effect: "ask" },
  { action: "write_file", resource: "*", effect: "ask" },
]
```

- 通配符匹配（`*` 和 `**`）
- 硬拒绝列表（`rm -rf /`, `sudo` 等）
- 运行时审批（用户可选 allow/deny/always）
- 审批存储（记住用户选择，`approval-store.ts`）
- 过期缓存机制

### 4.5 记忆系统

五层记忆，5 个 Provider：

| Provider | 层级 | 存储 | 说明 |
|----------|------|------|------|
| CheckpointProvider | Session | JSON 文件 | 会话检查点、状态恢复 |
| BuiltinMemoryProvider | Session | 内存 | 高频事实追踪 |
| FTSMemoryProvider | Session | SQLite FTS | 全文检索 |
| FileMemoryProvider | Project | .mira/knowledge/ | 项目级持久知识 |
| VectorMemoryProvider | Project | 本地 ONNX | Transformers.js 向量嵌入 |

MemoryManager 支持：预算注入（按 token 控制检索量）、跨 Provider 去重、批量刷入写缓冲区、记忆提升（session → project）。

### 4.6 上下文管理 (`session/context.ts`)

```
ContextManager
  ├→ 监控上下文 token 用量
  ├→ 4 层压缩管线（L1 Snip → L2 Micro Compact → L3 大结果持久化 → L4 LLM 摘要）
  ├→ 触发 checkpoint（早期，20%/45%/70%）
  ├→ 主动重建（接近上限时）
  ├→ 应急重建（超出上限时）
  ├→ 注入 checkpoint + 项目记忆 + 全局记忆
  └→ Agent 在新窗口中醒来，状态连续
```

## 五、高级特性

### 5.1 Goal Judge (`orchestrate/`)

独立的验证 Agent，判断任务是否真正完成。

```
Agent 尝试终止 → GoalJudge.evaluate()
    → 独立 LLM 调用审查完整对话
    → 满足 → 允许终止
    → 不满足 → 反馈差距，Agent 继续
    → 连续失败 3 次 → 自动终止
```

### 5.2 Max Mode (`agent/max-mode.ts`)

并行采样选优，每轮生成 N 个候选方案。

```
Agent 决策点 → 并行生成 N 个候选（默认 5）
    → 每个候选独立推理 + 工具规划
    → Judge 模型对比选出最优
    → 执行最优方案
```

### 5.3 Compose Mode (`compose-mode.ts`)

代码开发的完整流水线，通过 7 阶段子 Agent 编排完成从需求到合并的全流程：

```
plan → execute → review → test → debug → verify → merge
```

### 5.4 Dynamic Workflow (`workflow/`)

代码级编排，将流程从 prompt 变为代码。

```javascript
// 主 Agent 生成的 workflow 脚本
export const meta = { name: "refactor", description: "重构流程" }

export default async function(args) {
  const result = await agent("分析代码结构")
  const plan = await agent(`基于分析制定重构计划: ${result}`)
  await parallel([
    () => agent("重构模块 A"),
    () => agent("重构模块 B"),
  ])
  await agent("运行测试验证")
}
```

### 5.5 Dream/Distill (`orchestrate/dream.ts`)

- **Dream**：扫描会话轨迹，提取持久知识到项目记忆
- **Distill**：发现重复工作流，打包为可复用 skill/subagent

### 5.6 Failover (`orchestrate/failover.ts`)

Provider 故障自动降级链：当主 Provider 不可用时，按配置顺序自动切换到次选 Provider。

### 5.7 Subagent 管理 (`orchestrate/subagent.ts`)

基于 Actor 模型的子 Agent 系统，支持以下能力：

```
SubagentManager
  ├→ 调度模式: subagent（共享会话）/ peer（独立工作目录）
  ├→ 注册表持久化: SQLite actor_registry 表 + 孤儿恢复
  ├→ 任务门控: TaskGate 验证任务完成度，最多 2 次自动重试
  ├→ 标准化返回协议: **Status** / **Summary** 结构化输出
  ├→ 上下文继承: none（仅 prompt）/ state（checkpoint 摘要）/ full（前缀缓存）
  ├→ ReAct 循环: preStop 3 轮 + postStop 3 轮
  ├→ 粘滞检测: 5 分钟无活动自动标记 stuck
  ├→ 并发控制: 最大并行 5（可配置），嵌套深度 8，总生命周期 100
  ├→ 团队通信总线 (team-bus)
  ├→ 任务追踪 (task-tracker)
  └→ 结果汇总回主 Agent
```

### 5.8 Skill 系统 (`skill/`)

- `skill-loader.ts` — 从目录动态加载 Skill 定义
- `skill-commands.ts` — Slash 命令补全（`/` 触发）
- `skill-tools.ts` — Skill 导出为可调用工具

## 六、IPC 通信层

### 6.1 模块划分

| 模块 | 职责 |
|------|------|
| handlers.ts | 基础处理（窗口控制、文件对话框、通知、API Key 加解密） |
| compose-ipc.ts | 组合模式全流程 |
| config-ipc.ts | 配置读写 |
| dream-ipc.ts | Dream/Distill 操作 |
| goal-ipc.ts | Goal 管理 |
| live2d-ipc.ts | Live2D 头像控制 |
| memory-ipc.ts | 记忆操作 |
| question-ipc.ts | 用户交互 |
| session-ipc.ts | 会话/项目 CRUD |
| sidecar-bridge.ts | Sidecar 进程通信（HTTP 代理层） |
| skill-ipc.ts | Skill 加载 |
| subagent-ipc.ts | 子 Agent 状态 |
| task-ipc.ts | 任务管理 |

### 6.2 Preload 桥接

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld("electronAPI", {
  agent: { run, cancel, replyPermission, onEvent, ... },
  session: { createProject, listProjects, createSession, listSessions, deleteSession, searchMessages, ... },
  config: { get, set, getEnv, ... },
  encryptApiKey / decryptApiKey / isEncryptionAvailable,
  memory: { search, recall, getStatus, ... },
  question: { ask, ... },
  task: { create, update, list, ... },
  subagent: { list, cancel, ... },
  goal: { create, evaluate, ... },
  dreamDistill: { runDream, runDistill, ... },
  compose: { run, ... },
  platform, notify,
  openFile / openDirectory / saveFile,
  minimizeWindow / maximizeWindow / closeWindow,
  getPythonStatus / getPythonLogs / restartPython,
})
```

## 七、数据库

SQLite (sql.js WASM)，WAL 模式 + 防抖持久化。表结构：

```sql
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  project_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  workspace TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')),
  tool_call_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE permissions (
  workspace TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT DEFAULT '*',
  effect TEXT NOT NULL,
  PRIMARY KEY (workspace, action, resource)
);

CREATE TABLE goals (
  session_id TEXT NOT NULL,
  id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active',
  satisfied_at TEXT,
  timeout_ms INTEGER DEFAULT 0,
  evaluations_json TEXT DEFAULT '[]',
  PRIMARY KEY (session_id, id)
);
```

## 八、配置系统

多层配置合并（优先级从高到低）：

1. **环境变量** — `{env:VAR_NAME}` 语法引用
2. **项目配置** — `{workspace}/mira.json`
3. **全局配置** — `~/.config/mira/config.json`
4. **默认值** — 代码内置

支持配置项：
- `provider` / `model` — LLM 选择
- `apiKey` / `apiUrl` — 认证
- `providers` — 多 Provider 配置
- `maxSteps` / `maxContextTokens` — Agent 限制
- `mode` — 默认 Agent 模式
- `mcpServers` — MCP 服务器配置
- `plugins` — 插件配置
- `customAgents` — 自定义 Agent 配置目录

## 九、开发工作流

```bash
# 开发启动
pnpm dev
# → Vite HMR → Electron → Agent Core

# 添加新工具
# 1. 在 packages/core/src/tools/ 创建 .ts 文件
# 2. 使用 make() + Zod Schema
# 3. 在 tools/index.ts 导出
# 4. 在 system/registry-init.ts 注册

# 添加新 Provider
# 1. 在 packages/core/src/llm/providers/index.ts 添加配置
# 2. 如需新协议，在 llm/protocols/ 创建协议适配

# 添加新模式
# 1. 在 config/profile.ts 的 createDefaultRegistry() 中注册
# 2. 或在 ~/.config/mira/agents/ 创建 JSON 配置文件

# 测试
pnpm test          # 运行测试
pnpm typecheck     # 类型检查
pnpm lint          # 代码检查

# 打包
pnpm package:win   # Windows 便携模式
pnpm package:mac   # macOS
pnpm package:linux # Linux
```

## 十、关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 技术栈 | 全 TypeScript | 零 Python 依赖，单一技术栈 |
| 数据库 | SQLite (sql.js WASM) | 零配置，适合桌面应用 |
| 通信方式 | IPC (contextBridge) + Sidecar HTTP | IPC 为主流程，Sidecar 为可选代理层 |
| 前端 UI | @assistant-ui/react | 现代化 AI 聊天组件 |
| 状态管理 | React hooks | 轻量级，桌面应用足够 |
| LLM 架构 | 分层（schema→protocols→providers→route） | 可扩展，新协议/Provider 无侵入 |
| 权限 | 声明式规则 + 硬拒绝 + 运行时审批 | 灵活且安全 |
| 记忆 | 五层 + 预算注入 + 去重 | 可审查、可扩展、不阻塞主 Agent |
| 打包 | 便携模式（electron-builder） | 目标电脑无需安装任何运行时 |
