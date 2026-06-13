# OmniAgent 架构文档

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
│  │          │  │          │  │ └─────────────────────┘  │  │
│  └──────────┘  └──────────┘  └───────────────────────────┘  │
│                           │                                   │
│                  ┌────────┴────────┐                          │
│                  ▼ IPC             ▼ HTTP/SSE                  │
├──────────────────────────────────────────────────────────────┤
│                    主进程 (Node.js)                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ electron/agent-core/  ← TypeScript Agent Core           │  │
│  │  tool.ts          工具定义工厂 (make/settle/toOpenAI)    │  │
│  │  registry.ts      注册表 + 物化 + 权限过滤               │  │
│  │  permission.ts    声明式权限系统                          │  │
│  │  tools/read-file.ts  读文件 (fs)                        │  │
│  │  tools/write-file.ts 写文件 (fs)                        │  │
│  │  tools/list-files.ts 列目录 (fs)                        │  │
│  │  tools/web-search.ts 网络搜索 (fetch)                   │  │
│  │  tools/grep.ts     文件内容搜索 (ripgrep)                │  │
│  │  tools/glob.ts     文件查找 (rglob)                     │  │
│  │  tools/code-exec.ts Python代码执行 (subprocess)          │  │
│  │  tools/bash.ts     Shell命令 (execFile)                  │  │
│  │  ipc-bridge.ts     IPC 桥接 → 暴露给渲染进程              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                           │ spawn                              │
├──────────────────────────────────────────────────────────────┤
│                    Python FastAPI                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ app/core/    Agent 循环 / LLM 调用 / 权限 / 记忆 / 压缩  │  │
│  │ app/api/     REST API (chat/projects/sessions/files)     │  │
│  │ app/tools/   Python 工具系统 (32 个工具自动注册)          │  │
│  │ app/config   配置加载 (.env → 环境变量)                   │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## 二、目录规范

```
D:\开发\VSMTI\
├── electron/                        # Electron 主进程 (TypeScript)
│   ├── main.ts                      # 应用入口
│   ├── preload.ts                   # IPC 安全桥接
│   ├── python-manager.ts            # Python 子进程管理
│   ├── agent-core/                  # TypeScript Agent Core ★ 核心
│   │   ├── tool.ts                  # 工具定义工厂
│   │   ├── registry.ts              # 工具注册表
│   │   ├── permission.ts            # 权限系统
│   │   ├── ipc-bridge.ts            # IPC 暴露
│   │   ├── index.ts                 # 统一导出
│   │   └── tools/                   # 工具实现
│   │       ├── read-file.ts         # 读文件
│   │       ├── write-file.ts        # 写文件
│   │       ├── list-files.ts        # 列目录
│   │       ├── web-search.ts        # 网络搜索
│   │       ├── grep.ts              # 内容搜索
│   │       ├── glob.ts              # 文件查找
│   │       ├── code-exec.ts         # 代码执行
│   │       ├── bash.ts              # Shell 命令
│   │       └── index.ts             # 工具统一导出
│   ├── ipc/
│   │   └── handlers.ts              # IPC 处理器
│   ├── managers/
│   │   ├── window-manager.ts        # 窗口管理
│   │   └── tray-manager.ts          # 托盘管理
│   └── utils/
│       ├── logger.ts                # 日志
│       ├── python-finder.ts         # Python 路径查找
│       └── shell-env.ts             # 环境变量注入
│
├── src/                             # 渲染进程 (React + TypeScript)
│   ├── App.tsx                      # 根组件
│   ├── main.tsx                     # React 入口
│   ├── contexts/
│   │   └── ThemeContext.tsx          # 主题上下文
│   ├── styles/
│   │   └── globals.css              # 全局样式 + CSS 变量 + 工具类
│   ├── types/
│   │   └── electron.d.ts            # Electron API 类型定义
│   └── components/
│       ├── chat/                    # 聊天相关
│       │   ├── ChatWindow.tsx       # 主聊天窗口 (状态管理)
│       │   ├── ChatInput.tsx        # 输入框
│       │   ├── ModelSelector.tsx    # 模型/模式选择
│       │   ├── ToolPalette.tsx       # 工具面板 (IPC 直调) ★
│       │   ├── ToolCallView.tsx     # 工具调用展示
│       │   ├── MarkdownRenderer.tsx # Markdown 渲染
│       │   ├── CodeBlock.tsx        # 代码块
│       │   ├── PermissionDialog.tsx # 权限审批弹窗
│       │   ├── QuestionDialog.tsx   # 提问弹窗
│       │   ├── types.ts            # 类型定义
│       │   └── useChatStream.ts    # SSE 流式聊天 Hook
│       ├── sidebar/                 # 侧边栏
│       │   ├── Sidebar.tsx          # 主侧边栏
│       │   ├── ProjectBar.tsx       # 项目栏
│       │   ├── SettingsDialog.tsx   # 设置
│       │   ├── ProviderConfigPanel.tsx  # 提供商配置
│       │   ├── ModelManager.tsx    # 模型管理
│       │   ├── NewProjectDialog.tsx # 新建项目
│       │   ├── EditProjectDialog.tsx# 编辑项目
│       │   ├── NewTaskDialog.tsx   # 新建任务
│       │   └── types.ts            # 类型定义
│       ├── layout/
│       │   └── TitleBar.tsx        # 标题栏
│       └── ui/                     # 共享 UI 组件
│           ├── GlassPanel.tsx      # 玻璃面板
│           ├── Modal.tsx           # 弹窗
│           ├── IconButton.tsx      # 图标按钮
│           └── index.ts            # 统一导出
│
├── agent-backend/                   # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py                 # FastAPI 应用入口
│   │   ├── config.py               # 配置加载 (.env)
│   │   ├── api/                    # REST API
│   │   │   ├── chat.py             # 聊天 SSE 流
│   │   │   ├── projects.py         # 项目 CRUD
│   │   │   ├── sessions.py         # 会话/任务管理
│   │   │   ├── files.py            # 文件上传
│   │   │   ├── models.py           # 模型列表
│   │   │   └── workspace_api.py    # 工作目录
│   │   ├── core/                   # 核心逻辑
│   │   │   ├── agent.py            # Agent ReAct 循环
│   │   │   ├── llm.py              # LLM Provider 抽象
│   │   │   ├── modes.py            # 模式配置
│   │   │   ├── normalize.py        # 消息规范化
│   │   │   ├── events.py           # 事件/SSE 格式
│   │   │   ├── hooks.py            # Hook 系统
│   │   │   ├── hooks_setup.py      # 默认 Hook
│   │   │   ├── permission.py       # 权限检查
│   │   │   ├── permission_config.py# 权限配置文件
│   │   │   ├── permission_store.py # 审批存储
│   │   │   ├── question_store.py   # 问题存储
│   │   │   ├── prompt_builder.py   # 提示词组装
│   │   │   ├── compaction.py       # 上下文压缩
│   │   │   ├── recovery.py         # 错误恢复
│   │   │   ├── memory.py           # SQLite 会话存储
│   │   │   ├── memory_manager.py   # 文件级记忆
│   │   │   ├── workspace.py        # 工作目录
│   │   │   ├── background.py       # 后台任务
│   │   │   ├── cron_scheduler.py   # 定时调度
│   │   │   ├── task_system.py      # 任务系统
│   │   │   ├── skill_manager.py    # 技能管理
│   │   │   └── team_bus.py         # 团队通信
│   │   ├── tools/                  # Python 工具 (32个自动注册)
│   │   │   ├── base.py             # BaseTool 基类
│   │   │   ├── registry.py         # 工具注册表
│   │   │   ├── discovery.py        # 自动发现注册
│   │   │   ├── file_ops.py         # 文件操作
│   │   │   ├── search_tools.py     # 搜索 (web/grep/glob)
│   │   │   ├── code_exec.py        # 代码执行
│   │   │   ├── data_analysis.py    # 数据分析
│   │   │   ├── image_gen.py        # 图片生成
│   │   │   ├── web_browse.py       # 网页浏览
│   │   │   ├── question_tool.py    # 提问
│   │   │   ├── todo_write.py       # 待办
│   │   │   ├── task_tool.py        # 子智能体
│   │   │   ├── task_management_tools.py  # 任务管理
│   │   │   ├── cron_tools.py       # 定时任务
│   │   │   ├── team_tools.py       # 团队工具
│   │   │   ├── worktree_tools.py   # Worktree
│   │   │   ├── skill_tool.py       # 技能加载
│   │   │   └── schema_tool.py      # Schema 基类
│   │   └── prompts/
│   │       └── system.py           # 系统提示词
│   ├── omniagent.json              # 权限配置
│   └── requirements.txt            # Python 依赖
│
├── docs/                           # 文档
│   ├── architecture.md             # 本文件
│   └── plans/                      # 设计/实施计划
│
├── data/                           # 运行时数据
│   ├── sessions.db                 # SQLite 会话
│   ├── chroma/                     # ChromaDB 向量
│   ├── uploads/                    # 上传文件
│   └── workspace.json              # 工作目录
│
├── package.json                    # 前端依赖
├── electron.vite.config.ts         # Vite 构建配置
├── electron-builder.yml            # 打包配置
├── tailwind.config.js              # Tailwind 主题
├── postcss.config.js               # PostCSS
├── tsconfig.json                   # TypeScript
├── .env.example                    # 环境变量模板
├── .env                            # 环境变量 (gitignore)
└── start.ps1                       # 启动脚本
```

## 三、数据流

### 3.1 工具面板流（TypeScript Agent Core）

```
用户点击 🔧 → ToolPalette → IPC "agent:executeTool"
    → ipc-bridge.ts → registry.execute()
    → 具体工具 (readFile / webSearch / bash...)
    → 结果返回 → 显示在聊天区
```

**全程 2 次 IPC 调用，不经过 Python、不经过 HTTP、不依赖 API Key。**

### 3.2 AI 对话流（Python + LLM）

```
用户输入 → ChatInput → ChatWindow.sendMessage()
    → fetch POST /api/chat (SSE)
    → Python Agent.run() → LLM 调用 → 工具执行
    → SSE 流回 (content / tool_start / tool_result / finish)
    → ChatWindow 逐事件渲染
```

**全程 HTTP/SSE，需要 Python 后端运行 + API Key 配置。**

### 3.3 混合模式（未来）

```
用户输入 → Python Agent 决定调用工具
    → Agent 发出 tool_start SSE
    → 前端截获 → IPC 调 TypeScript Core 执行
    → 结果通过 HTTP 送回 Python Agent
    → Agent 继续 ReAct 循环
```

## 四、代码规范

### 4.1 TypeScript Agent Core 规范

```typescript
// 工具定义规范 — 使用 make() + Zod Schema
export const myTool = make({
  name: "my_tool",                    // 短横线命名
  description: "What this tool does", // 一句话描述
  inputSchema: z.object({             // Zod 定义输入
    path: z.string().describe("Path to file"),
    option: z.number().optional(),
  }),
  outputSchema: z.string(),           // 输出类型
  permission: "read",                 // 权限组: read/edit/bash/run_code/web_search
  async execute(input, ctx) {         // 实现
    // 1. 参数已由 Zod 验证，直接使用
    // 2. 路径操作用 ctx.workspace 做基路径
    // 3. 捕获异常返回 { success: false, error }
    // 4. 成功返回 { success: true, output }
  },
})
```

### 4.2 React 组件规范

```typescript
// Props 接口放在组件文件顶部
interface Props {
  sessionId: string
  onSessionChange?: (id: string) => void
}

// 函数组件
export function ComponentName({ prop1, prop2 }: Props) {
  // 1. useState / useRef / useCallback 在顶部
  // 2. useEffect 在中间
  // 3. 事件处理函数用 useCallback
  // 4. JSX 在 return 中
}
```

### 4.3 Python 工具规范

```python
class MyTool(BaseTool):
    name = "my_tool"
    description = "工具描述"
    parameters = [
        ToolParam(name="path", type="string", description="文件路径"),
    ]

    async def execute(self, **kwargs) -> ToolResult:
        try:
            path = self._check_path(kwargs.get("path", ""))
            # 实现逻辑
            return ToolResult(success=True, output=result)
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    def to_model_output(self, result: ToolResult) -> str:
        """格式化输出给 LLM（可选覆写）"""
        return result.output
```

## 五、工具系统对比

### TypeScript Agent Core（8 工具）

| 工具 | 实现 | 依赖 | 权限组 |
|------|------|------|--------|
| `read_file` | `fs.readFile` | 无 | read |
| `write_file` | `fs.writeFile` | 无 | edit |
| `list_files` | `fs.readdir` | 无 | read |
| `web_search` | `fetch(DuckDuckGo)` | 网络 | web_search |
| `grep` | `ripgrep` / `findstr` | rg 可选 | read |
| `glob` | `fs.readdir` 递归 | 无 | read |
| `run_code` | `subprocess("python")` | Python | run_code |
| `bash` | `execFile` | 无 | bash |

**调用方式**: IPC (`window.electronAPI.agent.executeTool`)
**速度**: 毫秒级
**可用条件**: 任何时候

### Python 工具（32 工具自动注册）

| 类别 | 工具 | 说明 |
|------|------|------|
| 文件 | read_file, write_file, list_files | 编码检测 |
| 搜索 | web_search, grep, glob | 异步实现 |
| 代码 | run_code | asyncio subprocess |
| 数据 | data_analysis | pandas + matplotlib |
| 图片 | image_generate | DALL-E API |
| 网络 | browse_web | Playwright |
| 任务 | create_task, list_tasks, get_task, claim_task, complete_task | DAG 依赖 |
| 定时 | schedule_cron, list_crons, cancel_cron | cron 表达式 |
| 团队 | spawn_teammate, send_message, check_inbox, request_shutdown, request_plan, review_plan | 通信总线 |
| Worktree | worktree_*, 5 个 | Git worktree |
| 其他 | todo_write, question, load_skill | |

**调用方式**: HTTP/SSE (`POST /api/chat`)
**速度**: 百毫秒级（含 HTTP 开销）
**可用条件**: 需要 Python 后端运行

## 六、关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 前端框架 | React 18 | 生态成熟，类型安全 |
| 样式方案 | Tailwind CSS | 原子化 CSS，避免样式冲突 |
| 构建工具 | electron-vite | 快速 HMR，原生 Electron 支持 |
| 打包 | electron-builder | 跨平台分发 |
| 后端语言 | Python | 数据分析/图表生态不可替代 |
| 核心工具语言 | TypeScript | 零依赖，IPC 直调 |
| Schema 验证 | Zod (TS) / Pydantic (Python) | 编译时 + 运行时双校验 |
| 状态管理 | React useState + Immer-style | 简单项目，不需要 Redux |
| IPC 通信 | contextBridge + ipcRenderer | 安全隔离 |
| HTTP 通信 | SSE (Server-Sent Events) | 单向流式，适合 AI 响应 |
| 数据库 | SQLite + ChromaDB | 零配置，单文件 |
| 权限配置 | omniagent.json | 声明式，用户可编辑 |

## 七、开发工作流

```bash
# 开发启动
.\start.ps1 dev
# → 启动 Vite HMR → Electron → Python 后端

# 仅启动后端
.\start.ps1 backend

# 构建前端
npm run build

# 打包桌面应用
npm run package:win   # Windows
npm run package:mac   # macOS
npm run package:linux # Linux

# 添加新工具 (TypeScript Core)
# 1. 在 electron/agent-core/tools/ 创建 .ts 文件
# 2. 使用 make() + Zod Schema
# 3. 在 tools/index.ts 导出
# 4. 在 index.ts 的 createDefaultRegistry() 注册
# 5. 自动出现在前端工具面板

# 添加新工具 (Python)
# 1. 在 agent-backend/app/tools/ 创建 .py 文件
# 2. 继承 BaseTool
# 3. discovery.py 自动扫描注册
# 4. 在 omniagent.json 配置权限
```
