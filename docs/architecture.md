# OmniAgent 架构文档

## 系统架构

```
┌─────────────────────────────────────────┐
│          Electron 桌面应用               │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │     渲染进程 (React + TypeScript)   │ │
│  │     ChatWindow / Sidebar / TitleBar │ │
│  └──────────────┬─────────────────────┘ │
│                 │ IPC                    │
│  ┌──────────────┴─────────────────────┐ │
│  │     主进程 (Node.js / TypeScript)  │ │
│  │     窗口 / 托盘 / 快捷键 / 菜单     │ │
│  └──────────────┬─────────────────────┘ │
│                 │ spawn                  │
│  ┌──────────────┴─────────────────────┐ │
│  │     Python 子进程 (FastAPI)         │ │
│  │     Agent / Tools / LLM / Memory    │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## 关键文件

| 文件 | 职责 |
|------|------|
| `electron/main.ts` | 应用入口，创建窗口，启动 Python |
| `electron/python-manager.ts` | 管理 Python 子进程生命周期 |
| `electron/preload.ts` | 安全的 IPC 桥接 |
| `src/App.tsx` | React 根组件 |
| `agent-backend/app/main.py` | FastAPI 后端入口 |
| `agent-backend/app/core/agent.py` | Agent ReAct 循环 |

## 数据流

1. 用户输入 → 渲染进程 `ChatWindow`
2. 通过 IPC 获取后端地址 → HTTP SSE 请求 Python 后端
3. Python 后端调用 LLM + 工具 → SSE 流式返回
4. 渲染进程实时渲染文本和工具调用状态
