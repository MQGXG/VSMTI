/**
 * Provider 注册表 — 使用 Route 层组合 Protocol + Endpoint + Auth
 * 参考 OpenCode 的四层模型：Schema → Protocol → Route → Provider
 *
 * 添加新 Provider 只需在 providerConfigs 中注册，无需写适配器代码
 */

import { LLMError } from "../schema"
import { OpenAIChatProtocol } from "../protocols/openai-chat"
import { AnthropicMessagesProtocol } from "../protocols/anthropic-messages"
import { OpenAICompatibleChatProtocol } from "../protocols/openai-compatible-chat"
import { makeRoute, type RouteInstance } from "../route/route"
import type { Auth, Endpoint, Framing } from "../route/types"

export type ProviderType = "openai" | "anthropic" | "deepseek" | "ollama" | "groq" | "fireworks" | "together" | "cerebras" | "perplexity" | "custom"

export type ProviderInstance = RouteInstance

/** Provider 配置 */
interface ProviderConfig {
  protocol: "openai-chat" | "anthropic-messages" | "openai-compatible"
  defaultBaseUrl: string
  authType: "bearer" | "api-key"
  /** Anthropic 等使用 x-api-key header */
  authHeader?: string
  framing?: Framing
}

/** 注册的 Provider 配置表 */
const providerConfigs: Record<string, ProviderConfig> = {
  openai: { protocol: "openai-chat", defaultBaseUrl: "https://api.openai.com/v1", authType: "bearer" },
  anthropic: { protocol: "anthropic-messages", defaultBaseUrl: "https://api.anthropic.com", authType: "api-key", authHeader: "x-api-key" },
  deepseek: { protocol: "openai-compatible", defaultBaseUrl: "https://api.deepseek.com", authType: "bearer" },
  ollama: { protocol: "openai-compatible", defaultBaseUrl: "http://localhost:11434/v1", authType: "bearer" },
  groq: { protocol: "openai-compatible", defaultBaseUrl: "https://api.groq.com/openai/v1", authType: "bearer" },
  fireworks: { protocol: "openai-compatible", defaultBaseUrl: "https://api.fireworks.ai/inference/v1", authType: "bearer" },
  together: { protocol: "openai-compatible", defaultBaseUrl: "https://api.together.xyz/v1", authType: "bearer" },
  cerebras: { protocol: "openai-compatible", defaultBaseUrl: "https://api.cerebras.ai/v1", authType: "bearer" },
  perplexity: { protocol: "openai-compatible", defaultBaseUrl: "https://api.perplexity.ai", authType: "bearer" },
}

/** 获取协议实例 */
function getProtocol(protocolName: string) {
  switch (protocolName) {
    case "openai-chat": return OpenAIChatProtocol
    case "anthropic-messages": return AnthropicMessagesProtocol
    case "openai-compatible": return OpenAICompatibleChatProtocol
    default: throw LLMError.invalidRequest(`Unknown protocol: ${protocolName}`)
  }
}

/** 创建 Route 即 Provider */
export function createProvider(type: string, apiKey: string = "", baseUrl?: string, headers?: Record<string, string>): RouteInstance {
  let config = providerConfigs[type]

  // 处理已知类型的 baseUrl 覆盖
  if (!config) {
    // 尝试作为自定义 provider（OpenAI 兼容）
    if (baseUrl) {
      return makeRoute({
        protocol: OpenAICompatibleChatProtocol,
        endpoint: { baseUrl, path: "/chat/completions" },
        auth: { type: "bearer", token: apiKey },
        framing: "sse",
        headers,
      })
    }
    throw LLMError.invalidRequest(`Unknown provider: ${type}`)
  }

  const endpoint: Endpoint = {
    baseUrl: baseUrl || config.defaultBaseUrl,
    path: config.protocol === "anthropic-messages" ? "/v1/messages" : "/chat/completions",
  }

  const auth: Auth = config.authType === "api-key"
    ? { type: "api-key", key: apiKey, header: config.authHeader || "x-api-key" }
    : { type: "bearer", token: apiKey }

  return makeRoute({
    protocol: getProtocol(config.protocol),
    endpoint,
    auth,
    framing: config.framing || "sse",
    headers,
  })
}

export function getProviderNames(): string[] {
  return Object.keys(providerConfigs)
}

/** 运行时注册新 Provider（用于自定义配置） */
export function registerProvider(name: string, config: ProviderConfig): void {
  providerConfigs[name] = config
}
