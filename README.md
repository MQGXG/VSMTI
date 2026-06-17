# Mira

全能 AI 助手桌面应用 — 集聊天、搜索、编程、数据分析于一体。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 31 + electron-vite |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS + @assistant-ui/react |
| Agent Core | TypeScript（纯 TS 实现，零 Python 依赖） |
| 数据库 | SQLite (sql.js WASM) |
| 构建 | electron-builder |

## 快速开始

```powershell
# 1. 安装依赖
npm install

# 2. 开发模式启动
npm run dev

# 3. 打包给其他电脑
npm run package:win
# 生成 release\Mira-1.0.0-portable.exe
# 复制到其他电脑直接双击运行！
```

## 项目结构

```
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 应用入口
│   ├── preload.ts               # 安全桥接 (contextBridge)
│   ├── agent-core/              # ★ TypeScript Agent Core
│   │   ├── agent.ts             #   Agent 核心循环
│   │   ├── llm/                 #   LLM 多 Provider 支持
│   │   ├── tools/               #   23 个工具
│   │   ├── memory/              #   记忆系统
│   │   ├── skill/               #   Skill 系统
│   │   ├── permission.ts        #   声明式权限
│   │   ├── modes.ts             #   5 种 Agent 模式
│   │   └── ...                  #   配置/数据库/会话管理等
│   ├── managers/                # 窗口/托盘管理
│   ├── ipc/                     # IPC 通信
│   └── utils/                   # 日志/环境变量
├── src/                         # React 渲染进程
│   ├── components/
│   │   ├── chat/                # 聊天组件（流式渲染/工具视图/权限弹窗）
│   │   ├── sidebar/             # 侧边栏（项目/会话/设置）
│   │   ├── layout/              # 自定义标题栏
│   │   └── ui/                  # 通用 UI
│   ├── hooks/useMiraChat.ts     # 核心聊天 Hook
│   ├── styles/                  # 全局样式
│   └── types/                   # 类型声明
├── data/                        # 运行时数据
├── docs/                        # 文档
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
└── tailwind.config.js
```

## 桌面特性

- 无边框窗口 + 自定义标题栏
- 系统托盘 + 全局快捷键 `Ctrl+Shift+A`
- 本地文件拖拽分析
- 多模型切换（OpenAI / Anthropic / DeepSeek / Ollama / Groq 等 10+ Provider）
- 5 种 Agent 模式（助手 / 专家 / 执行 / 安全 / 规划）
- 23 个内置工具（文件操作 / 代码执行 / 网页搜索 / Git / 数据分析等）
- 声明式权限系统（通配符匹配 + 模式叠加 + 运行时审批）
- Skill 系统（Slash 命令 + 动态加载）
- API Key 加密存储（Electron safeStorage）
- 便携打包，目标电脑无需安装任何运行时
