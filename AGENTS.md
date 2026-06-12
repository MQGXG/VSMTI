# OmniAgent 项目文档

## 项目概述

OmniAgent 是一个全能 AI 助手桌面应用，基于 **Electron + Python FastAPI** 架构打造。

## 技术栈

| 层次 | 技术选型 |
|------|----------|
| 桌面框架 | Electron (electron-vite) |
| 前端 | React 18 + TypeScript + Tailwind CSS |
| 后端 | Python FastAPI + Uvicorn |
| LLM | OpenAI / Anthropic Claude / Ollama / 自定义 API |
| 数据库 | SQLite (via ChromaDB for history) |
| 便携 Python | portable-python/ (自包含 Python 环境) |

## 目录结构

```
├── electron/              # Electron 主进程
│   ├── main.ts            # 应用入口
│   ├── python-manager.ts  # Python 后端进程管理
│   ├── preload.ts         # 预加载脚本
│   ├── managers/
│   │   ├── window-manager.ts  # 窗口管理
│   │   └── tray-manager.ts    # 托盘管理
│   ├── ipc/
│   │   └── handlers.ts        # IPC 通信处理
│   └── utils/
│       ├── logger.ts          # 日志系统
│       └── shell-env.ts       # 环境变量注入
├── src/                   # React 前端
│   ├── components/
│   │   ├── chat/              # 聊天相关组件
│   │   ├── sidebar/           # 侧边栏
│   │   └── layout/            # 布局组件
│   └── styles/                # 全局样式
├── agent-backend/          # Python 后端
│   ├── app/
│   │   ├── api/               # API 路由
│   │   ├── core/              # 核心逻辑
│   │   ├── tools/             # 工具系统
│   │   └── prompts/           # 提示词
│   └── requirements.txt
├── portable-python/        # 便携 Python 环境
├── data/                   # 运行时数据
├── dist/                   # 前端构建输出
├── dist-electron/          # Electron 构建输出
└── release/                # 打包发布
```

## Agent 模式

| 模式 | 描述 | 可用工具 |
|------|------|----------|
| 助手 (assistant) | 日常问答、写作、分析 | web_search, file_read |
| 专家 (expert) | 深度研究、数据分析 | + code_exec, data_analysis |
| 执行 (action) | 自动化任务、批量处理 | 全部工具（含文件写入） |
| 安全 (safe) | 只读探索 | web_search, file_read |

## 开发指南

```bash
# 启动开发模式
.\start.ps1 dev

# 仅启动后端
.\start.ps1 backend

# 打包
.\start.ps1 package
```

## 环境要求

- Node.js 18+
- Python 3.10+（或使用 portable-python/）
- Windows / macOS / Linux
