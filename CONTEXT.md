# Mira 开发上下文

## 当前阶段

原型阶段 — 核心功能已就绪，正在完善集成稳定性和开发者体验。

## 关键架构决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 桌面框架 | Electron | 跨平台成熟，社区支持强 |
| Agent Core | TypeScript | 零 Python 依赖，单一技术栈 |
| 数据库 | SQLite (sql.js WASM) | 零配置，适合桌面应用 |
| 通信方式 | IPC (contextBridge) | 安全、高效、Electron 原生 |
| 前端 UI | @assistant-ui/react | 现代化 AI 聊天组件 |
| 状态管理 | React hooks | 轻量级，桌面应用足够 |
| 向量记忆 | Transformers.js | 本地 ONNX 推理，零外部依赖 |
| LLM 架构 | 分层（schema→protocols→providers→route） | 可扩展，新协议/Provider 无侵入 |

## 包结构

```
packages/
├── core/          # @mira/core — 核心逻辑（Agent/LLM/Tools/Memory）
├── electron/      # @mira/electron — Electron 主进程
├── ui/            # @mira/ui — React 前端组件
└── apps/desktop/  # @mira/desktop — Electron 应用壳
```

## Agent 系统

### 消息流

```
用户输入 → useMiraChat → IPC → Agent.run() → LLM.stream() → Provider API
                                                            ↓
                                                    AgentEvent (AsyncGenerator)
                                                            ↓
                                                  ChatWindow 消费事件
```

### 事件类型

| 事件 | 前端处理 | 说明 |
|------|----------|------|
| content | 追加文本 | 流式文本增量 |
| tool_start | 创建 ToolCall 卡片 | 工具调用开始，显示参数 |
| tool_result | 更新 ToolCall 状态 | 显示工具执行结果 |
| permission_request | 显示权限弹窗 | 需要用户审批 |
| thinking | 显示思考过程 | Agent 内部推理 |
| finish | 完成 | 响应结束 |
| error | 显示错误 | 不可恢复的错误 |
| goal_status | 显示 Goal 状态 | 任务完成度验证 |
| context_rebuild | 显示重建通知 | 上下文窗口重建 |
| subagent_status | 显示子 Agent 状态 | 子 Agent 生命周期 |

## LLM Provider 支持

| Provider | 状态 | 特殊说明 |
|----------|------|----------|
| OpenAI | 可用 | 完整支持工具调用 |
| Anthropic Claude | 可用 | 工具格式自动转换 |
| DeepSeek | 可用 | 兼容 OpenAI 格式 |
| Ollama (Local) | 可用 | 需要本地运行 Ollama |
| Groq | 可用 | 高速推理 |
| Gemini | 可用 | 协议适配器 |
| Custom | 可用 | 任意 OpenAI 兼容 API |

## 高级特性

### Goal Judge
独立验证 Agent，判断任务是否真正完成。防止 Agent 提前宣称"完成"。

### Max Mode
并行采样选优，每轮生成 N 个候选方案，由 judge 模型选出最优。

### Dynamic Workflow
代码级编排，将流程从 prompt 变为代码，确定性执行。

### Dream/Distill
- Dream：扫描会话轨迹，提取持久知识到项目记忆
- Distill：发现重复工作流，打包为可复用 skill/subagent

### Subagent
最大并行 5 个子 Agent，支持委派、团队通信、任务追踪。

### MCP
Model Context Protocol，支持 MCP 服务器扩展工具能力。

### LSP
Language Server Protocol，代码智能：定义跳转、引用查找、悬停信息。

## 日志系统

- Electron 日志: `%APPDATA%/Mira/logs/mira-YYYY-MM-DD.log`
- 控制台输出 + 文件同时写入

## 常见问题

### API Key 未配置

在设置页面添加 Provider 并配置 API Key。目前支持：
- OpenAI: sk-xxx
- Claude: sk-ant-xxx
- DeepSeek: sk-xxx
- 自定义: 任意 API Key

### Playwright 未安装

如果需要使用 `web_browse` 工具，请运行：
```bash
npx playwright install chromium
```

## 下一步优化方向

1. 会话搜索/分组功能
2. 模型列表自动获取（拉取供应商可用模型）
3. CI/CD 自动构建流程
4. 代码块语法高亮增强
5. 记忆系统增强（Dream/Distill 自动触发）
6. Workflow 可视化编辑器
