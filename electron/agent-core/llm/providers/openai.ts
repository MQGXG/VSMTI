import { LLMError, type LLMRequest, type LLMEvent } from "../schema"
import { serializeMessages, deserializeChunk } from "../protocols/openai-chat"
import { RouteClient, type RouteConfig } from "../route/client"

export class OpenAIProvider {
  private client: RouteClient

  constructor(config: RouteConfig) {
    this.client = new RouteClient({
      ...config,
      baseUrl: config.baseUrl || "https://api.openai.com/v1",
    })
  }

  name = "openai"

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
      if (err.message?.includes("401")) throw LLMError.auth("OpenAI")
      if (err.message?.includes("429")) throw LLMError.rateLimit("OpenAI")
      throw LLMError.provider("OpenAI", err.message)
    }
  }
}
