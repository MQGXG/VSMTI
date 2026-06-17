import type { LLMMessage, LLMEvent } from "../schema"

interface OpenAIChunk {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }
    finish_reason?: string
  }>
}

interface OpenAIMessage {
  role: string
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
}

export function serializeMessages(messages: LLMMessage[]): OpenAIMessage[] {
  return messages.map((msg) => {
    if (typeof msg.content === "string") {
      const out: OpenAIMessage = { role: msg.role, content: msg.content }
      if (msg.role === "tool" && msg.tool_call_id) out.tool_call_id = msg.tool_call_id
      return out
    }
    const parts = msg.content
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("")
    const toolCalls = parts.filter((p) => p.type === "tool-call")
    const toolResults = parts.filter((p) => p.type === "tool-result")

    if (toolResults.length > 0 && msg.role === "tool") {
      return {
        role: "tool",
        tool_call_id: toolResults[0].toolCallId,
        content: toolResults[0].output,
      } as OpenAIMessage
    }

    if (toolCalls.length > 0 && msg.role === "assistant") {
      return {
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.toolCallId,
          type: "function" as const,
          function: { name: tc.toolName, arguments: JSON.stringify(tc.args) },
        })),
      } as OpenAIMessage
    }

    return { role: msg.role, content: text || null } as OpenAIMessage
  })
}

export function deserializeChunk(chunk: OpenAIChunk): LLMEvent | null {
  const delta = chunk.choices?.[0]?.delta
  if (!delta) {
    if (chunk.choices?.[0]?.finish_reason) {
      return { type: "finish", reason: chunk.choices[0].finish_reason as any || "stop" }
    }
    return null
  }

  if (delta.content) {
    return { type: "text-delta", delta: delta.content }
  }

  if (delta.tool_calls) {
    const tc = delta.tool_calls[0]
    if (tc.function?.name) {
      return { type: "tool-call", id: tc.id || "", name: tc.function.name, args: tc.function.arguments || "" }
    }
    if (tc.function?.arguments) {
      return { type: "text-delta", delta: tc.function.arguments }
    }
  }

  return null
}

export function getFinishReason(chunk: OpenAIChunk): string | undefined {
  return chunk.choices?.[0]?.finish_reason || undefined
}
