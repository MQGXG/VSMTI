import type { LLMMessage, LLMEvent, FinishReason } from "../schema"
import { getToolResultOutput } from "../schema/messages"
import type { Protocol } from "../route/types"

interface OpenAIChunk {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    completion_tokens_details?: { reasoning_tokens?: number }
  }
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
        content: getToolResultOutput(toolResults[0].output),
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
  const finishReason = chunk.choices?.[0]?.finish_reason as FinishReason | undefined
  let usage: LLMEvent extends { type: "finish"; usage?: infer U } ? U : undefined = undefined

  // 提取 usage（如果存在）
  if (chunk.usage) {
    usage = {
      promptTokens: chunk.usage.prompt_tokens || 0,
      completionTokens: chunk.usage.completion_tokens || 0,
      totalTokens: chunk.usage.total_tokens || 0,
      cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
      cacheWriteTokens: undefined,
    } as any
  }

  if (!delta) {
    if (finishReason) {
      return { type: "finish", reason: finishReason, usage } as LLMEvent
    }
    // usage-only chunk（stream_options 启用时的最终 usage 块）
    if (usage) {
      return { type: "finish", reason: "stop", usage } as LLMEvent
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

  // delta = {} 空对象，但有 finish_reason 或 usage
  if (finishReason || usage) {
    return { type: "finish", reason: finishReason || "stop", usage } as LLMEvent
  }

  return null
}

export function getFinishReason(chunk: OpenAIChunk): string | undefined {
  return chunk.choices?.[0]?.finish_reason || undefined
}

/** 完整的 OpenAI Chat Protocol 实现 */
export const OpenAIChatProtocol: Protocol = {
  name: "openai-chat",
  serializeRequest(request) {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: serializeMessages(request.messages),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }
    const gen = request.generation || {}
    if (gen.maxTokens !== undefined) body.max_tokens = gen.maxTokens
    if (gen.temperature !== undefined) body.temperature = gen.temperature
    if (gen.topP !== undefined) body.top_p = gen.topP
    if (gen.stop !== undefined) body.stop = gen.stop
    if (gen.seed !== undefined) body.seed = gen.seed
    if (gen.presencePenalty !== undefined) body.presence_penalty = gen.presencePenalty
    if (gen.frequencyPenalty !== undefined) body.frequency_penalty = gen.frequencyPenalty
    return body
  },

  deserializeEvent(data) {
    return deserializeChunk(data as OpenAIChunk)
  },

  parseResponse(data) {
    const choice = (data as any)?.choices?.[0]
    const content = choice?.message?.content || ""
    const toolCalls = (choice?.message?.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      args: tc.function.arguments,
    }))
    return { content, toolCalls }
  },
}
