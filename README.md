# Mira

全能 AI 助手桌面应用 — 集聊天、搜索、编程、数据分析于一体。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 31 + electron-vite |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS |
| 后端 | Python 3.10+ / FastAPI / OpenAI SDK |
| 构建 | electron-builder |

## 跨平台运行

本应用将 Python 后端打包进 .exe，**目标电脑无需安装 Python**。

### 首次使用

```powershell
# 1. 一键设置（创建便携 Python + 安装前端依赖）
.\setup.ps1

# 2. 如果要使用数据分析、图表等功能（需额外下载）
.\setup.ps1 -full

# 3. 开发模式启动
npm run dev
```

### 打包给其他电脑

```powershell
npm run package:win
# 生成 release\Mira-1.0.0-portable.exe
# 复制到其他电脑直接双击运行！
```

## 项目结构

```
├── electron/               # Electron 主进程
│   ├── main.ts             # 窗口管理、IPC、系统托盘
│   ├── preload.ts          # 安全桥接
│   ├── agent-core/         # TypeScript Agent Core ★
│   ├── ipc/
│   ├── managers/           # 窗口/托盘管理
│   └── utils/
├── src/                    # 渲染进程 (React)
│   ├── App.tsx
│   ├── components/
│   │   ├── chat/           # 聊天相关
│   │   ├── sidebar/        # 侧边栏
│   │   ├── layout/         # 布局组件
│   │   └── ui/             # 通用 UI 组件
│   ├── contexts/           # React Context
│   ├── styles/             # 全局样式
│   └── types/              # 类型定义
├── agent-backend/          # Python 后端
│   ├── app/
│   │   ├── api/            # FastAPI 路由
│   │   ├── core/           # Agent 核心
│   │   ├── tools/          # 工具集
│   │   └── prompts/        # 提示词
│   ├── skills/             # Skill 定义
│   └── requirements.txt
├── docs/                   # 文档
│   ├── api.md
│   ├── architecture.md
│   ├── deployment.md
│   └── testing.md
├── data/                   # 运行时数据 (SQLite + ChromaDB)
├── portable-python/        # 内置 Python 环境 (自动生成)
├── package.json
├── electron.vite.config.ts
├── tailwind.config.js
└── electron-builder.yml
```

## 桌面特性

- 无边框窗口 + 自定义标题栏
- 系统托盘 + 全局快捷键 `Ctrl+Shift+A`
- Python 后端自动管理（内置便携 Python）
- 本地文件拖拽分析
- 多模型切换 (OpenAI / Claude / 本地)
- 离线打包，目标电脑无需安装 Python
