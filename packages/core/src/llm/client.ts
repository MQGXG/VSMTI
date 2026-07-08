import { z } from "zod"
import { createProvider } from "./providers"
import { LLMError } from "./schema/errors"
import type { LLMMessage } from "./schema/messages"
import { getToolResultOutput } from "./schema/messages"
import type { LLMRequest as LLMRequestSchema } from "./schema/options"
import { zodToJsonSchema } from "../shared/zod-converter"

export type ProviderType = string
export type { LLMMessage }

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
  | { type: "done"; usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number } }
  | { type: "retry"; attempt: number; error: string }
  | { type: "error"; error: { message: string } }

export type LLMToolSet = Record<string, { description: string; inputSchema: z.ZodType; parameters?: z.ZodType }>

export interface LLMRequest2 {
  messages: LLMMessage[]
  tools?: LLMToolSet
}

/** @deprecated 使用 LLMRequest2 */
export type LLMRequest = LLMRequest2

export interface LLMClient {
  stream(request: LLMRequest2): AsyncGenerator<LLMStreamEvent>
  complete(request: LLMRequest2): Promise<{ content: string; toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }>
}

function convertMessages(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string"
      ? m.content
      : m.content.map((part: any) => {
          if (part.type === "text") return { type: "text" as const, text: part.text }
          if (part.type === "tool-call") return { type: "tool-call" as const, toolCallId: part.toolCallId, toolName: part.toolName, args: part.args }
          if (part.type === "tool-result") return { type: "tool-result" as const, toolCallId: part.toolCallId, toolName: part.toolName, output: getToolResultOutput(part.output) }
          return { type: "text" as const, text: "" }
        }),
    tool_call_id: "tool_call_id" in m ? m.tool_call_id as string : undefined,
  }))
}

function convertTools(tools?: LLMToolSet): any {
  if (!tools || Object.keys(tools).length === 0) return undefined
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.inputSchema),
  }))
}

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
      yield { type: "retry", attempt, error: lastError?.message || "Unknown error" }
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
      const llmRequest: LLMRequestSchema = {
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
            yield { type: "done", usage: event.usage ? {
              promptTokens: event.usage.promptTokens,
              completionTokens: event.usage.completionTokens,
              totalTokens: event.usage.totalTokens,
              cacheReadTokens: event.usage.cacheReadTokens,
              cacheWriteTokens: event.usage.cacheWriteTokens,
            } : undefined }
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
