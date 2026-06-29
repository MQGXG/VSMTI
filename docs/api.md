# Mira API 文档

## 概述

Mira 采用 Electron IPC 通信，**不使用 HTTP API**。所有通信通过 `contextBridge` 暴露的 `electronAPI` 进行。

## IPC 通道

### Agent 相关

| 通道 | 方法 | 说明 |
|------|------|------|
| `agent:run` | run(config, messages) | 启动 Agent 执行，返回事件流 |
| `agent:cancel` | cancel(sessionId) | 取消正在执行的 Agent |
| `agent:replyPermission` | reply(id, reply) | 回复权限审批 |
| `agent:replyQuestion` | reply(id, answer) | 回复用户提问 |
| `agent:getSkills` | getSkills() | 获取可用 Skill 列表 |

### 会话管理

| 通道 | 方法 | 说明 |
|------|------|------|
| `session:create` | create(projectId, title?) | 创建新会话 |
| `session:list` | list(projectId?) | 获取会话列表 |
| `session:delete` | delete(sessionId) | 删除会话 |
| `session:getMessages` | getMessages(sessionId) | 获取会话消息 |
| `session:searchMessages` | searchMessages(query) | 搜索消息 |

### 项目管理

| 通道 | 方法 | 说明 |
|------|------|------|
| `session:createProject` | createProject(name, path) | 创建项目 |
| `session:listProjects` | listProjects() | 获取项目列表 |
| `session:updateProject` | updateProject(id, data) | 更新项目 |
| `session:deleteProject` | deleteProject(id) | 删除项目 |

### 配置

| 通道 | 方法 | 说明 |
|------|------|------|
| `config:get` | get(key?) | 获取配置 |
| `config:set` | set(key, value) | 设置配置 |
| `config:getProviders` | getProviders() | 获取 Provider 列表 |
| `config:addProvider` | addProvider(config) | 添加 Provider |
| `config:deleteProvider` | deleteProvider(name) | 删除 Provider |

### 记忆

| 通道 | 方法 | 说明 |
|------|------|------|
| `memory:search` | search(query, scope?) | 搜索记忆 |
| `memory:recall` | recall(query, scope?) | 召回记忆 |
| `memory:list` | list(scope?) | 列出记忆 |
| `memory:delete` | delete(path) | 删除记忆 |

### Goal

| 通道 | 方法 | 说明 |
|------|------|------|
| `goal:create` | create(sessionId, description) | 创建 Goal |
| `goal:evaluate` | evaluate(sessionId, goalId) | 评估 Goal |
| `goal:list` | list(sessionId) | 列出 Goals |
| `goal:cancel` | cancel(sessionId, goalId) | 取消 Goal |

### Dream/Distill

| 通道 | 方法 | 说明 |
|------|------|------|
| `dream:run` | run(sessionId) | 执行 Dream（知识提取） |
| `distill:run` | run(sessionId) | 执行 Distill（工作流发现） |

### Skill

| 通道 | 方法 | 说明 |
|------|------|------|
| `skill:list` | list() | 列出可用 Skill |
| `skill:load` | load(name) | 加载 Skill |

### 子 Agent

| 通道 | 方法 | 说明 |
|------|------|------|
| `subagent:list` | list() | 列出活跃子 Agent |
| `subagent:getStatus` | getStatus(id) | 获取子 Agent 状态 |
| `subagent:cancel` | cancel(id) | 取消子 Agent |

### 任务管理

| 通道 | 方法 | 说明 |
|------|------|------|
| `task:create` | create(summary, parentId?) | 创建任务 |
| `task:list` | list(status?) | 列出任务 |
| `task:get` | get(id) | 获取任务详情 |
| `task:start` | start(id) | 开始任务 |
| `task:done` | done(id) | 完成任务 |

### Sidecar

| 通道 | 方法 | 说明 |
|------|------|------|
| `sidecar:start` | start() | 启动 Sidecar 进程 |
| `sidecar:stop` | stop() | 停止 Sidecar 进程 |
| `sidecar:send` | send(message) | 发送消息到 Sidecar |

### 安全存储

| 通道 | 方法 | 说明 |
|------|------|------|
| `safeStorage:encrypt` | encrypt(value) | 加密值 |
| `safeStorage:decrypt` | decrypt(value) | 解密值 |

### 文件对话框

| 通道 | 方法 | 说明 |
|------|------|------|
| `dialog:showOpenDialog` | showOpenDialog(options) | 打开文件选择对话框 |
| `dialog:showSaveDialog` | showSaveDialog(options) | 打开保存对话框 |
| `dialog:showMessageBox` | showMessageBox(options) | 显示消息框 |

### 窗口控制

| 通道 | 方法 | 说明 |
|------|------|------|
| `window:minimize` | minimize() | 最小化窗口 |
| `window:maximize` | maximize() | 最大化窗口 |
| `window:close` | close() | 关闭窗口 |

## 使用示例

```typescript
// 在渲染进程中使用
const { electronAPI } = window

// 创建会话
const session = await electronAPI.session.create(projectId, "新会话")

// 运行 Agent
const events = await electronAPI.agent.run({
  sessionID: session.session_id,
  model: "gpt-4",
  apiKey: "sk-xxx",
  apiUrl: "https://api.openai.com/v1",
  messages: [{ role: "user", content: "你好" }]
})

// 消费事件流
for await (const event of events) {
  switch (event.type) {
    case 'content':
      appendText(event.text)
      break
    case 'tool_start':
      showToolCall(event.id, event.name, event.args)
      break
    case 'finish':
      console.log('完成:', event.reason)
      break
  }
}
```
