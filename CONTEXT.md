# OmniAgent 开发上下文

## 当前阶段

原型阶段 — 核心功能已就绪，正在完善集成稳定性和开发者体验。

## 关键架构决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 桌面框架 | Electron | 跨平台成熟，社区支持强，Python 集成方便 |
| 后端启动 | Python spawn | Python 生态丰富，无需重写现有工具 |
| 数据库 | SQLite + ChromaDB | 零配置，适合桌面应用 |
| 便携 Python | portable-python/ | 目标机器可能无 Python 环境 |
| 通信方式 | HTTP API (REST + SSE) | 简单可靠，前端通用 |
| 状态管理 | localStorage | 桌面应用无需复杂状态管理 |

## Agent 系统

### 消息流

```
用户输入 → Chat API → Agent.run() → LLM.chat_stream() → Provider API
                                              ↓
                                      StreamEvent (SSE)
                                              ↓
                                    ChatWindow 消费事件
```

### 事件类型

| 事件 | 前端处理 | 说明 |
|------|----------|------|
| content | 追加文本 | 流式文本增量 |
| tool_start | 创建 ToolCall 卡片 | 工具调用开始，显示参数输入框 |
| tool_delta | 更新参数内容 | 参数流式输入（打字机效果） |
| tool_result | 更新 ToolCall 状态 | 显示工具执行结果 |
| tool_error | 显示错误 | 工具执行失败（不中断流程） |
| finish | 完成 | 响应结束 |
| error | 显示错误 | 不可恢复的错误 |

## LLM Provider 支持

| Provider | 状态 | 特殊说明 |
|----------|------|----------|
| OpenAI | 可用 | 完整支持工具调用 |
| Anthropic Claude | 可用 | 工具格式自动转换 |
| Ollama (Local) | 可用 | 需要本地运行 Ollama |
| Custom | 可用 | 任意 OpenAI 兼容 API |

## 日志系统

- Electron 日志: `%APPDATA%/OmniAgent/logs/omniagent-YYYY-MM-DD.log`
- Python 日志: `%APPDATA%/OmniAgent/logs/python-YYYY-MM-DD.log`
- CLI 日志: 控制台输出 + 文件同时写入

## 常见问题

### Python 后端启动失败

1. 检查 `portable-python/Scripts/python.exe` 是否存在
2. 运行 `pip install -r agent-backend/requirements.txt`
3. 运行 `.\start.ps1 backend` 单独测试后端
4. 查看日志文件获取详细错误

### API Key 未配置

在设置页面添加 Provider 并配置 API Key。目前支持：
- OpenAI: sk-xxx
- Claude: sk-ant-xxx
- 自定义: 任意 API Key

## 下一步优化方向

1. 会话搜索/分组功能
2. 模型列表自动获取（拉取供应商可用模型）
3. CI/CD 自动构建流程
4. 可执行文件体积优化（portable-python 裁剪）
5. 代码块语法高亮增强（使用 highlight.js）
