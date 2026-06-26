/**
 * Route 层类型定义 — 参考 OpenCode 的 Protocol/Route/Endpoint/Auth/Framing 四层模型
 *
 * 一个 Route 组合了：
 *  - Protocol: API 语义（序列化请求 + 反序列化事件）
 *  - Endpoint: 服务器地址 + 路径
 *  - Auth: 认证方式
 *  - Framing: 传输帧格式（SSE / JSON）
 */

import type { LLMMessage, LLMEvent } from "../schema"

/** API 端点（地址 + 路径） */
export interface Endpoint {
  baseUrl: string
  path: string
}

/** 认证方式 */
export type Auth =
  | { type: "bearer"; token: string }
  | { type: "api-key"; key: string; header: string }
  | { type: "none" }

/** 传输帧格式 */
export type Framing = "sse" | "json"

/** 协议定义：消息序列化 + 事件反序列化 */
export interface Protocol {
  name: string
  serializeRequest(request: {
    model: string
    messages: LLMMessage[]
    tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
    generation?: Record<string, unknown>
  }): Record<string, unknown>

  deserializeEvent(data: unknown): LLMEvent | null

  /** 从原始 HTTP 响应解析（非 SSE 模式） */
  parseResponse?(response: unknown): { content: string; toolCalls: Array<{ id: string; name: string; args: string }> }
}

/** Route 配置：组合协议 + 端点 + 认证 + 帧格式 */
export interface RouteConfig {
  protocol: Protocol
  endpoint: Endpoint
  auth: Auth
  framing: Framing
  headers?: Record<string, string>
  timeout?: number
}
