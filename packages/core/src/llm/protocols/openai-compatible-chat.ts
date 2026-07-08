/**
 * 通用 OpenAI 兼容协议
 * 适用于 DeepSeek、Ollama、Groq、Fireworks、Together 等
 * 与 openai-chat 协议相同，但可配置 baseUrl
 */

import { serializeMessages, deserializeChunk, getFinishReason } from "./openai-chat"
import type { LLMMessage, LLMEvent } from "../schema"

export { serializeMessages, deserializeChunk, getFinishReason }

export function createCompatibleBody(messages: LLMMessage[], tools?: any[], options?: any) {
  return {
    messages: serializeMessages(messages),
    tools: tools?.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    ...options,
  }
}

/** OpenAI 兼容协议 — 复用 openai-chat 的序列化/反序列化 */
import type { Protocol } from "../route/types"
export const OpenAICompatibleChatProtocol: Protocol = {
  name: "openai-compatible-chat",
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
    return deserializeChunk(data as any)
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
