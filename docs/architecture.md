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
│  │  agent.ts          Agent 核心循环                        │  │
│  │  llm/              LLM 分层架构                         │  │
│  │    schema/         消息/事件/错误类型                    │  │
│  │    protocols/      OpenAI/Anthropic/Gemini 协议适配     │  │
│  │    providers/      Provider 实现                        │  │
│  │    route/          路由客户端                           │  │
│  │  tools/            32 个工具（文件/执行/网络/Git/LSP）   │  │
│  │  memory/           四层记忆系统                         │  │
│  │  permission.ts     声明式权限系统                       │  │
│  │  modes.ts          Agent 模式配置                       │  │
│  │  workflow/         Dynamic Workflow 编排                │  │
│  │  mcp/              MCP 协议支持                         │  │
│  │  lsp/              LSP 代码智能                         │  │
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
├── packages/
│   ├── core/          # @mira/core — 核心逻辑（无外部依赖）
│   ├── electron/      # @mira/electron — Electron 主进程
│   ├── ui/            # @mira/ui — React 前端组件
│   └── apps/desktop/  # @mira/desktop — Electron 应用壳
├── docs/
├── data/              # 运行时数据 (SQLite)
└── package.json       # 根 package.json (pnpm monorepo)
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

**全程 IPC 通信，零 HTTP 开销。**

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
主 Agent → delegate_task → SubagentManager.spawn()
    → 子 Agent 独立运行（最大并行 5）
    → 完成后结果返回主 Agent
    → 主 Agent 继续工作
```

## 四、Agent Core 核心模块

### 4.1 Agent 主循环 (`agent.ts`)

```
Agent.run()
  ├→ AgentStateMachine 管理生命周期
  ├→ ContextManager 管理上下文窗口
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
    ├── openai-chat.ts          → OpenAI Chat Completions
    ├── openai-responses.ts     → OpenAI Responses API
    ├── openai-compatible-chat.ts → OpenAI 兼容协议
    ├── anthropic-messages.ts   → Anthropic Messages API
    └── gemini.ts               → Google Gemini
    │
providers/       → Provider 实现（管理认证、路由、重试）
    ├── openai.ts               → OpenAI
    ├── anthropic.ts            → Anthropic
    └── openai-compatible.ts    → DeepSeek/Ollama/Groq/自定义
    │
route/           → 路由客户端（根据 provider 自动选择协议）
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

工具通过 `registry.ts` 注册，支持：
- 分类元数据（core/knowledge/execution/orchestration/infrastructure）
- 并行执行声明
- 权限过滤
- 工具 allowlist（按模式过滤）

### 4.4 权限系统

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
- 审批存储（记住用户选择）

### 4.5 记忆系统

四层记忆，5 个 Provider：

| Provider | 层级 | 存储 | 说明 |
|----------|------|------|------|
| CheckpointProvider | Session | JSON 文件 | Writer subagent 异步写入 |
| BuiltinMemoryProvider | Session | 内存 | 高频事实追踪 |
| FTSMemoryProvider | Session | SQLite FTS | 全文检索 |
| FileMemoryProvider | Project | .mira/knowledge/ | 项目级持久知识 |
| VectorMemoryProvider | Project | 本地 ONNX | Transformers.js 向量嵌入 |

### 4.6 上下文管理

```
ContextManager
  ├→ 监控上下文 token 用量
  ├→ 触发 checkpoint（早期，20%/45%/70%）
  ├→ Writer subagent 异步提取结构化状态
  ├→ 触发 rebuild（接近上限时）
  ├→ 注入 checkpoint + 项目记忆 + 全局记忆
  └→ Agent 在新窗口中醒来，状态连续
```

## 五、高级特性

### 5.1 Goal Judge

独立的验证 Agent，判断任务是否真正完成。

```
Agent 尝试终止 → GoalJudge.evaluate()
    → 独立 LLM 调用审查完整对话
    → 满足 → 允许终止
    → 不满足 → 反馈差距，Agent 继续
    → 连续失败 3 次 → 自动终止
```

### 5.2 Max Mode

并行采样选优，每轮生成 N 个候选方案。

```
Agent 决策点 → 并行生成 5 个候选
    → 每个候选独立推理 + 工具规划
    → Judge 模型对比选出最优
    → 执行最优方案
```

### 5.3 Dynamic Workflow

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

### 5.4 Dream/Distill

- **Dream**：扫描会话轨迹，提取持久知识到项目记忆
- **Distill**：发现重复工作流，打包为可复用 skill/subagent

### 5.5 Subagent 管理

```
SubagentManager
  ├→ 最大并行 5 个子 Agent
  ├→ 委派任务 → 子 Agent 独立运行
  ├→ 团队通信总线 (team-bus)
  ├→ 任务追踪 (task-tracker)
  └→ 结果汇总回主 Agent
```

## 六、IPC 通信层

### 6.1 模块划分

| 模块 | 职责 |
|------|------|
| agent-ipc.ts | Agent 流式执行、权限回复、工具调用 |
| compose-ipc.ts | 组合模式 |
| config-ipc.ts | 配置读写 |
| dream-ipc.ts | Dream/Distill 操作 |
| goal-ipc.ts | Goal 管理 |
| memory-ipc.ts | 记忆操作 |
| question-ipc.ts | 用户交互 |
| session-ipc.ts | 会话/项目 CRUD |
| sidecar-bridge.ts | Sidecar 进程通信 |
| skill-ipc.ts | Skill 加载 |
| subagent-ipc.ts | 子 Agent 状态 |
| task-ipc.ts | 任务管理 |

### 6.2 Preload 桥接

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld("electronAPI", {
  agent: { run, cancel, replyPermission, ... },
  session: { create, list, delete, ... },
  config: { get, set, ... },
  dream: { run, ... },
  goal: { create, evaluate, ... },
  memory: { search, recall, ... },
  // ...
})
```

## 七、数据库

SQLite (sql.js WASM)，表结构：

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
- `mcp` — MCP 服务器配置
- `plugins` — 插件配置

## 九、开发工作流

```bash
# 开发启动
pnpm dev
# → Vite HMR → Electron → Agent Core

# 添加新工具
# 1. 在 packages/core/src/tools/ 创建 .ts 文件
# 2. 使用 make() + Zod Schema
# 3. 在 tools/index.ts 导出
# 4. 在 registry-init.ts 注册

# 添加新 Provider
# 1. 在 packages/core/src/llm/providers/ 创建实现
# 2. 在 packages/core/src/llm/protocols/ 创建协议适配（如需要）
# 3. 在 route/route.ts 注册路由

# 添加新模式
# 1. 在 agent-profile.ts 的 createDefaultRegistry() 中注册
# 2. 或在 ~/.config/mira/agents/ 创建 JSON 配置文件
```

## 十、关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 技术栈 | 全 TypeScript | 零 Python 依赖，单一技术栈 |
| 数据库 | SQLite (sql.js WASM) | 零配置，适合桌面应用 |
| 通信方式 | IPC (contextBridge) | 安全、高效、Electron 原生 |
| 前端 UI | @assistant-ui/react | 现代化 AI 聊天组件 |
| 状态管理 | React hooks | 轻量级，桌面应用足够 |
| LLM 架构 | 分层（schema→protocols→providers→route） | 可扩展，新协议/Provider 无侵入 |
| 权限 | 声明式规则 + 硬拒绝 | 灵活且安全 |
| 记忆 | 四层 + Writer subagent | 可审查、可扩展、不阻塞主 Agent |
| 打包 | 便携模式 | 目标电脑无需安装任何运行时 |
