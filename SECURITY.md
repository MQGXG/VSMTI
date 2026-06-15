# 安全策略

## API Key 保护

- API Key 使用 **Electron safeStorage** 加密后存储在 `localStorage`
- 加密前缀 `enc:` 标识已加密的 Key
- 支持从环境变量（`OPENAI_API_KEY` 等）和配置文件加载，无需在界面填写

## 权限系统

Agent 执行敏感操作（文件读写、Shell 命令、网络请求）时触发权限确认：

| 权限级别 | 行为 |
|----------|------|
| 拒绝 | 阻止本次操作 |
| 允许 | 允许本次操作 |
| 始终允许 | 信任该工具，后续自动放行 |

可在设置中启用「自动接受权限」跳过确认。

## 数据存储

| 数据类型 | 存储位置 | 加密 |
|----------|----------|------|
| 会话消息 | `data/sessions.db` (SQLite) | 明文 |
| 向量数据 | `data/chroma/` (ChromaDB) | 明文 |
| API Key | localStorage | safeStorage 加密 |
| 设置偏好 | localStorage | 明文 |

## 网络安全

- CSP 策略限制：仅允许连接 `http://127.0.0.1:*`（本地后端）
- 所有 LLM API 调用经后端转发，前端不直接暴露
- 无外部 CDN 依赖，资源全部本地加载

## 报告漏洞

如发现安全漏洞，请通过 GitHub Issues 报告，避免公开披露。
