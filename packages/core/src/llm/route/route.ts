/**
 * Route 组合层 — 将 Protocol + Endpoint + Auth + Framing 组合为可调用的 Route
 * 参考 OpenCode 的 Route.make() + route.prepareTransport + route.streamPrepared
 */

import { LLMError, type LLMEvent } from "../schema"
import type { RouteConfig, Protocol, Auth, Framing } from "./types"
import type { LLMMessage } from "../schema"

export interface RouteInstance {
  readonly name: string
  readonly protocol: Protocol
  readonly framing: Framing
  stream(request: {
    model: string
    messages: LLMMessage[]
    tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
    generation?: Record<string, unknown>
  }): AsyncGenerator<LLMEvent>

  complete(request: {
    model: string
    messages: LLMMessage[]
    tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
    generation?: Record<string, unknown>
  }): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }>
}

/** 构建请求头 */
function buildHeaders(auth: Auth, framing: Framing, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  switch (auth.type) {
    case "bearer":
      headers["Authorization"] = `Bearer ${auth.token}`
      break
    case "api-key":
      headers[auth.header] = auth.key
      break
  }
  if (framing === "sse") {
    headers["Accept"] = "text/event-stream"
  }
  return { ...headers, ...extra }
}

/** 创建 Route 实例 */
export function makeRoute(config: RouteConfig): RouteInstance {
  const { protocol, endpoint, auth, framing, headers: extraHeaders, timeout } = config
  const url = `${endpoint.baseUrl.replace(/\/+$/, "")}${endpoint.path}`
  const headers = buildHeaders(auth, framing, extraHeaders)

  async function* stream(
    request: Parameters<RouteInstance["stream"]>[0],
  ): AsyncGenerator<LLMEvent> {
    const body = protocol.serializeRequest(request)

    if (framing === "json") {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: timeout ? AbortSignal.timeout(timeout) : undefined,
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw LLMError.provider(protocol.name, `HTTP ${response.status}: ${errorText.slice(0, 1000)}`)
      }
      const data = await response.json()
      if (protocol.parseResponse) {
        yield { type: "text-delta", delta: protocol.parseResponse(data).content }
      }
      yield { type: "finish", reason: "stop" }
      return
    }

    // SSE 模式
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw LLMError.provider(protocol.name, `HTTP ${response.status}: ${errorText.slice(0, 1000)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw LLMError.provider(protocol.name, "No response body")

    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim()
            if (data === "[DONE]") {
              yield { type: "finish", reason: "stop" }
              return
            }
            try {
              const parsed = JSON.parse(data)
              const event = protocol.deserializeEvent(parsed)
              if (event) yield event
            } catch {
              // 跳过无法解析的 chunk
            }
          }
        }
      }
      yield { type: "finish", reason: "stop" }
    } catch (err: any) {
      if (err.name === "AbortError") {
        yield { type: "error", message: "Request timed out" }
        return
      }
      throw err
    } finally {
      reader.releaseLock()
    }
  }

  async function complete(
    request: Parameters<RouteInstance["complete"]>[0],
  ): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
    const body = protocol.serializeRequest(request)
    body.stream = false

    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers, Accept: "application/json" },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw LLMError.provider(protocol.name, `HTTP ${response.status}: ${errorText.slice(0, 1000)}`)
    }

    const data = await response.json()
    if (protocol.parseResponse) {
      return protocol.parseResponse(data)
    }
    return { content: JSON.stringify(data), toolCalls: [] }
  }

  return {
    name: protocol.name,
    protocol,
    framing,
    stream,
    complete,
  }
}

/** 封装 Protocol 为 RouteConfig 的快捷工厂 */
export function executeRoute(
  route: RouteInstance,
  request: Parameters<RouteInstance["stream"]>[0],
): AsyncGenerator<LLMEvent> {
  return route.stream(request)
}
