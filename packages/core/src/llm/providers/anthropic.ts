import { LLMError, type LLMRequest, type LLMEvent } from "../schema"
import { serializeMessages, serializeSystem, deserializeStreamEvent } from "../protocols/anthropic-messages"
import { RouteClient, type RouteConfig } from "../route/client"

export class AnthropicProvider {
  private client: RouteClient

  constructor(config: RouteConfig) {
    this.client = new RouteClient({
      ...config,
      baseUrl: config.baseUrl || "https://api.anthropic.com",
      headers: {
        ...config.headers,
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
    })
  }

  name = "anthropic"

  async *stream(request: LLMRequest): AsyncGenerator<LLMEvent> {
    const system = serializeSystem(request.messages)
    const body: Record<string, unknown> = {
      model: request.model,
      messages: serializeMessages(request.messages.filter((m) => m.role !== "system")),
      max_tokens: request.generation?.maxTokens || 4096,
      stream: true,
    }

    if (system) body.system = system
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }))
    }
    if (request.generation?.temperature !== undefined) body.temperature = request.generation.temperature
    if (request.generation?.topP !== undefined) body.top_p = request.generation.topP
    if (request.generation?.stop) body.stop_sequences = request.generation.stop

    try {
      for await (const chunk of this.client.postStream("/v1/messages", body)) {
        const text = new TextDecoder().decode(chunk)
        const parsed = JSON.parse(text) as any
        const event = deserializeStreamEvent(parsed)
        if (event) yield event
      }
      yield { type: "finish", reason: "stop" }
    } catch (err: any) {
      if (err.name === "AbortError") {
        yield { type: "error", message: "Request timed out" }
        return
      }
      if (err.message?.includes("401")) throw LLMError.auth("Anthropic")
      if (err.message?.includes("429")) throw LLMError.rateLimit("Anthropic")
      throw LLMError.provider("Anthropic", err.message)
    }
  }
}
