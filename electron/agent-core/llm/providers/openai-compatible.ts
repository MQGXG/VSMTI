/**
 * 通用 OpenAI 兼容 Provider 适配器
 * 
 * 支持: DeepSeek, Ollama, Groq, Fireworks, Together AI, Cerebras, xAI, Perplexity 等
 * 添加新 Provider 只需在 index.ts 中新增一条配置，无需编写代码
 */

import { LLMError, type LLMRequest, type LLMEvent } from "../schema"
import { serializeMessages, deserializeChunk } from "../protocols/openai-compatible-chat"
import { RouteClient, type RouteConfig } from "../route/client"

export interface CompatibleProviderConfig extends RouteConfig {
  name: string
}

export class OpenAICompatibleProvider {
  private client: RouteClient
  readonly name: string

  constructor(config: CompatibleProviderConfig) {
    this.name = config.name
    this.client = new RouteClient(config)
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMEvent> {
    const body = {
      model: request.model,
      messages: serializeMessages(request.messages),
      tools: request.tools?.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      stream: true,
      ...request.generation,
    }

    try {
      for await (const chunk of this.client.postStream("/chat/completions", body)) {
        const text = new TextDecoder().decode(chunk)
        const parsed = JSON.parse(text)
        const event = deserializeChunk(parsed)
        if (event) yield event
      }
      yield { type: "finish", reason: "stop" }
    } catch (err: any) {
      if (err.name === "AbortError") {
        yield { type: "error", message: "Request timed out" }
        return
      }
      throw LLMError.provider(this.name, err.message)
    }
  }
}
