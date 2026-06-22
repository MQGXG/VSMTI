/**
 * LLM SDK — 向后兼容的 Vercel AI SDK 封装
 * 
 * 底层实现已迁移到 llm/ 包（分层架构: schema → protocols → providers → route）
 * 此文件保持导出一致性，以便 agent.ts 等消费者无需修改
 */

import { z } from "zod"
import { createProvider } from "./llm/providers"
import { LLMError } from "./llm/schema/errors"
import type { LLMMessage as SchemaMessage } from "./llm/schema/messages"
import type { LLMRequest as SchemaLLMRequest } from "./llm/schema/options"
import { zodToJsonSchema } from "./zod-converter"

export type LLMMessage = SchemaMessage

export type ProviderType = string

export interface SDKConfig {
  provider: string
  model: string
  apiKey: string
  apiUrl?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
}

export type LLMStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: string; index: number } }
  | { type: "done" }
  | { type: "error"; error: { message: string } }

export type LLMToolSet = Record<string, { description: string; inputSchema: z.ZodType; parameters?: z.ZodType }>

/** 向后兼容的旧 LLMRequest（仅 messages + tools） */
export interface LLMRequest {
  messages: LLMMessage[]
  tools?: LLMToolSet
}

export interface LLMClient {
  stream(request: LLMRequest2): AsyncGenerator<LLMStreamEvent>
  complete(request: LLMRequest2): Promise<{ content: string; toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }>
}

interface LLMRequest2 {
  messages: LLMMessage[]
  tools?: LLMToolSet
}

function convertMessages(messages: LLMMessage[]): SchemaMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string"
      ? m.content
      : m.content.map((part: any) => {
          if (part.type === "text") return { type: "text" as const, text: part.text }
          if (part.type === "tool-call") return { type: "tool-call" as const, toolCallId: part.toolCallId, toolName: part.toolName, args: part.args }
          if (part.type === "tool-result") return { type: "tool-result" as const, toolCallId: part.toolCallId, toolName: part.toolName, output: typeof part.output === "string" ? part.output : (part.output as any)?.value || "" }
          return { type: "text" as const, text: "" }
        }),
    tool_call_id: (m as any).tool_call_id,
  }))
}

function convertTools(tools?: LLMToolSet): SchemaLLMRequest["tools"] {
  if (!tools || Object.keys(tools).length === 0) return undefined
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.inputSchema),
  }))
}

/**
 * 指数退避重试包装器 — 仅重试可恢复的网络错误
 * HTTP 4xx（除 429 限流外）立刻失败，不重试
 */
function isRetryableError(message: string): boolean {
  const code = parseInt(message.match(/HTTP (\d+)/)?.[1] || "0", 10)
  if (code >= 400 && code < 500) return code === 429
  if (code >= 500) return true
  return true
}

async function* withRetry(
  fn: () => AsyncGenerator<LLMStreamEvent>,
  maxRetries = 2,
  baseDelay = 800,
): AsyncGenerator<LLMStreamEvent> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelay * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, delay))
    }
    try {
      let hasError = false
      for await (const event of fn()) {
        if (event.type === "error") {
          hasError = true
          lastError = new Error(event.error.message)
          break
        }
        yield event
      }
      if (!hasError) return
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    if (lastError && !isRetryableError(lastError.message)) break
  }
  yield { type: "error", error: { message: lastError?.message || "Unknown error" } }
}

export function createLLMClient(config: SDKConfig): LLMClient {
  const provider = createProvider(
    config.provider,
    config.apiKey,
    config.apiUrl,
    config.headers,
  )

  async function* innerStream(request: LLMRequest2): AsyncGenerator<LLMStreamEvent> {
    try {
      const llmRequest: SchemaLLMRequest = {
        model: config.model,
        messages: convertMessages(request.messages),
        tools: convertTools(request.tools),
        generation: config.options as any,
      }

      let accumulatedArgs = ""
      let currentToolId = ""
      let currentToolName = ""

      for await (const event of provider.stream(llmRequest)) {
        switch (event.type) {
          case "text-delta":
            if (currentToolId) {
              accumulatedArgs += event.delta
            } else {
              yield { type: "delta", delta: event.delta }
            }
            break
          case "tool-call":
            if (currentToolId && currentToolName) {
              yield { type: "tool_call", toolCall: { id: currentToolId, name: currentToolName, arguments: accumulatedArgs || "{}", index: 0 } }
            }
            currentToolId = event.id
            currentToolName = event.name
            accumulatedArgs = event.args || ""
            break
          case "finish":
            if (currentToolId && currentToolName) {
              yield { type: "tool_call", toolCall: { id: currentToolId, name: currentToolName, arguments: accumulatedArgs || "{}", index: 0 } }
            }
            yield { type: "done" }
            break
          case "error":
            yield { type: "error", error: { message: event.message } }
            break
        }
      }
    } catch (err: any) {
      if (err instanceof LLMError) {
        yield { type: "error", error: { message: err.message } }
      } else {
        yield { type: "error", error: { message: err.message || String(err) } }
      }
    }
  }

  async function* stream(request: LLMRequest2): AsyncGenerator<LLMStreamEvent> {
    yield* withRetry(() => innerStream(request), 2, 800)
  }

  async function complete(request: LLMRequest2) {
    const textParts: string[] = []
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = []

    for await (const event of stream(request)) {
      if (event.type === "delta") {
        textParts.push(event.delta)
      } else if (event.type === "tool_call") {
        toolCalls.push({
          id: event.toolCall.id,
          type: "function",
          function: {
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
          },
        })
      }
    }

    return { content: textParts.join(""), toolCalls }
  }

  return { stream, complete }
}
