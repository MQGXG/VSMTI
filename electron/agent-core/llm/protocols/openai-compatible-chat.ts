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
