# Mira API 文档

## 基础 URL

- 开发环境: `http://localhost:8000`
- 生产环境: 按部署配置

## 接口列表

### 聊天接口

**POST /api/chat**

流式 SSE 聊天接口。

请求体：
```json
{
  "message": "你好",
  "session_id": "uuid-string",
  "model": "openai"
}
```

响应（SSE 流式）：
```
data: {"type": "content", "text": "你好！"}
data: {"type": "tool_start", "name": "web_search", "args": {...}}
data: {"type": "tool_result", "name": "web_search", "output": "..."}
data: {"type": "done"}
```

### 会话管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/sessions | 获取会话列表 |
| POST | /api/sessions | 创建会话 |
| GET | /api/sessions/{id}/messages | 获取会话消息 |
| DELETE | /api/sessions/{id} | 删除会话 |

### 文件管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/files/upload | 上传文件 |
| GET | /api/files | 获取文件列表 |
| GET | /api/files/{filename} | 下载文件 |

### 健康检查

**GET /api/health**

```json
{"status": "ok", "version": "1.0.0"}
```
