import type { LLMMessage, LLMEvent } from "../schema"

interface AnthropicMessage {
  role: "user" | "assistant"
  content: string | AnthropicContentBlock[]
}

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  content?: string
}

interface AnthropicStreamEvent {
  type: string
  content_block?: { type: string; id?: string; name?: string }
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }
  content_block_start?: { content_block: AnthropicContentBlock }
  content_block_delta?: { delta: AnthropicContentBlock }
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  error?: { message: string }
}

export function serializeMessages(messages: LLMMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = []

  for (const msg of messages) {
    if (msg.role === "system") continue

    if (typeof msg.content === "string") {
      result.push({ role: msg.role as "user" | "assistant", content: msg.content })
      continue
    }

    const blocks: AnthropicContentBlock[] = msg.content.map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text }
        case "tool-call":
          return { type: "tool_use", id: part.toolCallId, name: part.toolName, input: part.args }
        case "tool-result":
          return { type: "tool_result", tool_use_id: part.toolCallId, content: typeof part.output === "string" ? part.output : part.output.value }
      }
    })

    result.push({ role: msg.role as "user" | "assistant", content: blocks })
  }

  return result
}

export function serializeSystem(messages: LLMMessage[]): string | undefined {
  const systemParts = messages.filter((m) => m.role === "system")
  if (systemParts.length === 0) return undefined
  return systemParts.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n")
}

export function deserializeStreamEvent(event: AnthropicStreamEvent): LLMEvent | undefined {
  switch (event.type) {
    case "content_block_delta": {
      const delta = event.delta as any
      if (delta?.type === "text_delta") {
        return { type: "text-delta", delta: delta.text }
      }
      if (delta?.type === "input_json_delta") {
        return { type: "text-delta", delta: delta.partial_json }
      }
      return undefined
    }
    case "content_block_start": {
      const block = event.content_block as any
      if (block?.type === "tool_use") {
        return { type: "tool-call", id: block.id, name: block.name, args: "" }
      }
      return undefined
    }
    case "message_delta": {
      const usage = event.usage as any
      return {
        type: "finish",
        reason: (event.delta as any)?.stop_reason || "stop",
        usage: usage ? {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          cacheWriteTokens: usage.cache_creation_input_tokens,
        } : undefined,
      }
    }
    case "message_stop":
      return { type: "finish", reason: "stop" }
    case "error":
      return { type: "error", message: event.error?.message || "Unknown error" }
    default:
      return undefined
  }
}
