import { streamText, generateText, APICallError, EmptyResponseBodyError, NoOutputGeneratedError } from "ai"
import { z } from "zod"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

export type ProviderType = "openai" | "anthropic" | "deepseek" | "ollama" | "custom"

export interface SDKConfig {
  provider: ProviderType
  model: string
  apiKey: string
  apiUrl?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | Array<
    | { type: "tool-result"; toolCallId: string; toolName: string; output: { type: "text"; value: string } }
    | { type: "text"; text: string }
    | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  >
  tool_call_id?: string
}

export type LLMStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: string; index: number } }
  | { type: "done" }
  | { type: "error"; error: { message: string } }

export type LLMToolSet = Record<string, { description: string; inputSchema: z.ZodType; parameters?: z.ZodType }>

export interface LLMRequest {
  messages: LLMMessage[]
  tools?: LLMToolSet
}

export interface LLMClient {
  stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent>
  complete(request: LLMRequest): Promise<{ content: string; toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }>
}

function buildLanguageModel(config: SDKConfig): any {
  switch (config.provider) {
    case "openai": {
      const provider = createOpenAI({ apiKey: config.apiKey })
      return provider(config.model)
    }
    case "anthropic": {
      const provider = createAnthropic({ apiKey: config.apiKey })
      return provider(config.model)
    }
    case "deepseek":
    case "ollama":
    case "custom": {
      const baseURL = (config.apiUrl || "https://api.openai.com/v1").replace(/\/+$/, "")
      const provider = createOpenAICompatible({
        name: config.provider,
        baseURL,
        apiKey: config.apiKey,
        headers: config.headers as Record<string, string>,
      })
      return provider.chatModel(config.model)
    }
  }
}

export function createLLMClient(config: SDKConfig): LLMClient {
  const model = buildLanguageModel(config)

  async function* stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    const hasTools = request.tools && Object.keys(request.tools).length > 0

    // 使用 onChunk 实现增量流式
    const textQueue: string[] = []
    let streamDone = false
    let streamError: string | null = null
    let pendingToolCalls: any[] = []
    let finalText = ""

    const streamPromise = streamText({
      model: model as any,
      messages: request.messages as any[],
      ...(hasTools ? { tools: request.tools as any } : {}),
      allowSystemInMessages: true,
      onChunk(event: any) {
        const type = event.chunk?.type
        if (type === "text-delta" && event.chunk.textDelta) {
          textQueue.push(event.chunk.textDelta)
        } else if (type === "reasoning-delta" && event.chunk.delta) {
          textQueue.push(event.chunk.delta)
        }
      },
    })

    // 后台启动流消费（触发 onChunk）
    const consumePromise = (async () => {
      try {
        const text = await streamPromise.text
        finalText = text || ""
        console.log("[LLM SDK] stream finished, text length:", finalText.length)
        pendingToolCalls = [...(await streamPromise.toolCalls)]
        console.log("[LLM SDK] tool calls:", pendingToolCalls.length)
        streamDone = true
      } catch (e: any) {
        console.error("[LLM SDK] stream error:", e?.message || e)
        // 提取底层错误（API key 无效、模型不可用、速率限制等）
        if (e instanceof APICallError) {
          const status = e.statusCode ? ` (HTTP ${e.statusCode})` : ""
          const body = e.responseBody ? `: ${e.responseBody}` : ""
          streamError = `AI 服务错误${status}${body}`
        } else if (e instanceof NoOutputGeneratedError) {
          const cause = (e as any).cause
          streamError = cause ? `AI 无输出: ${cause.message || cause}` : "AI 服务未返回有效输出，请检查 API Key 和模型名称是否正确"
        } else if (e instanceof EmptyResponseBodyError) {
          streamError = `AI 服务返回空响应，请检查网络连接和 API Key 是否有效`
        } else {
          streamError = e instanceof Error ? e.message : String(e)
        }
        streamDone = true
      }
    })()

    // 轮询队列直到流完成
    while (!streamDone) {
      while (textQueue.length > 0) {
        yield { type: "delta", delta: textQueue.shift()! }
      }
      if (!streamDone) {
        // 等一会儿再检查
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    // 消费剩余的文本
    while (textQueue.length > 0) {
      yield { type: "delta", delta: textQueue.shift()! }
    }

    // fallback: 如果 onChunk 从未捕获到文本但 finalText 有内容
    // （某些模型/提供商的 chunk 类型不受支持）
    if (finalText && textQueue.length === 0) {
      console.log("[LLM SDK] fallback: emitting finalText directly, len:", finalText.length)
      yield { type: "delta", delta: finalText }
    }

    if (streamError) {
      yield { type: "error", error: { message: streamError } }
      return
    }

    for (const tc of pendingToolCalls) {
      yield {
        type: "tool_call",
        toolCall: {
          id: tc.toolCallId || tc.id || "tc",
          name: tc.toolName || tc.name || "",
          arguments: JSON.stringify(tc.args || tc.arguments || {}),
          index: 0,
        },
      }
    }

    yield { type: "done" }
  }

  async function complete(request: LLMRequest) {
    const hasTools = request.tools && Object.keys(request.tools).length > 0
    const result = await generateText({
      model: model as any,
      messages: request.messages as any[],
      ...(hasTools ? { tools: request.tools as any } : {}),
      allowSystemInMessages: true,
    })

    return {
      content: result.text,
      toolCalls: (result.toolCalls || []).map((tc: any) => ({
        id: tc.toolCallId || tc.id || "tc",
        type: "function" as const,
        function: {
          name: tc.toolName || tc.name || "",
          arguments: JSON.stringify(tc.args || tc.arguments || {}),
        },
      })),
    }
  }

  return { stream, complete }
}
