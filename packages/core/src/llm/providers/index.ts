import { LLMError } from "../schema"
import { OpenAIChatProtocol } from "../protocols/openai-chat"
import { AnthropicMessagesProtocol } from "../protocols/anthropic-messages"
import { OpenAICompatibleChatProtocol } from "../protocols/openai-compatible-chat"
import { GeminiProtocol } from "../protocols/gemini"
import { OpenAIResponsesProtocol } from "../protocols/openai-responses"
import { makeRoute, type RouteInstance } from "../route/route"
import type { Auth, Endpoint, Framing, Protocol } from "../route/types"

export type ProviderType =
  | "openai" | "anthropic" | "deepseek" | "ollama"
  | "groq" | "fireworks" | "together" | "cerebras"
  | "perplexity" | "custom" | "gemini" | "vertex"

export type ProviderInstance = RouteInstance

interface ProviderConfig {
  protocol: "openai-chat" | "anthropic-messages" | "openai-compatible" | "gemini" | "openai-responses"
  defaultBaseUrl: string
  authType: "bearer" | "api-key" | "oauth" | "none"
  authHeader?: string
  framing?: Framing
  models?: string[]
  /** 默认模型名 */
  defaultModel?: string
  /** Anthropic 等需要的版本头 */
  versionHeader?: { name: string; value: string }
  /** 自定义 path 覆盖（如 Anthropic 用 /v1/messages，Gemini 用 /v1beta/models） */
  path?: string
}

const providerConfigs: Record<string, ProviderConfig> = {
  openai: {
    protocol: "openai-chat",
    defaultBaseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1", "o3-mini"],
  },
  anthropic: {
    protocol: "anthropic-messages",
    defaultBaseUrl: "https://api.anthropic.com",
    authType: "api-key",
    authHeader: "x-api-key",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    versionHeader: { name: "anthropic-version", value: "2023-06-01" },
    path: "/v1/messages",
  },
  deepseek: {
    protocol: "openai-compatible", defaultBaseUrl: "https://api.deepseek.com", authType: "bearer",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  ollama: {
    protocol: "openai-compatible", defaultBaseUrl: "http://localhost:11434/v1", authType: "bearer",
    defaultModel: "llama3",
  },
  groq: {
    protocol: "openai-compatible", defaultBaseUrl: "https://api.groq.com/openai/v1", authType: "bearer",
    defaultModel: "llama3-70b-8192",
    models: ["llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"],
  },
  fireworks: {
    protocol: "openai-compatible", defaultBaseUrl: "https://api.fireworks.ai/inference/v1", authType: "bearer",
    defaultModel: "accounts/fireworks/models/llama-v3p1-405b-instruct",
  },
  together: {
    protocol: "openai-compatible", defaultBaseUrl: "https://api.together.xyz/v1", authType: "bearer",
    defaultModel: "mistralai/Mixtral-8x7B-Instruct-v0.1",
  },
  cerebras: {
    protocol: "openai-compatible", defaultBaseUrl: "https://api.cerebras.ai/v1", authType: "bearer",
    defaultModel: "llama3.1-70b",
  },
  perplexity: {
    protocol: "openai-compatible", defaultBaseUrl: "https://api.perplexity.ai", authType: "bearer",
    defaultModel: "llama-3.1-sonar-huge-128k-online",
  },
  gemini: {
    protocol: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    authType: "api-key",
    authHeader: "x-goog-api-key",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro-preview-03-25"],
    path: "/v1beta/models",
  },
  vertex: {
    protocol: "gemini",
    defaultBaseUrl: "https://us-central1-aiplatform.googleapis.com",
    authType: "bearer",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    path: "/v1/projects",
  },
}

function getProtocol(protocolName: string): Protocol {
  switch (protocolName) {
    case "openai-chat": return OpenAIChatProtocol
    case "anthropic-messages": return AnthropicMessagesProtocol
    case "openai-compatible": return OpenAICompatibleChatProtocol
    case "gemini": return GeminiProtocol
    case "openai-responses": return OpenAIResponsesProtocol
    default: throw LLMError.invalidRequest(`Unknown protocol: ${protocolName}`)
  }
}

function getEndpoint(type: string, config: ProviderConfig, baseUrl?: string): Endpoint {
  const url = baseUrl || config.defaultBaseUrl
  const path = config.path || (config.protocol === "anthropic-messages" ? "/v1/messages" : "/chat/completions")
  return { baseUrl: url, path }
}

function getAuth(type: string, config: ProviderConfig, apiKey: string): Auth {
  if (config.authType === "none") return { type: "none" }
  if (config.authType === "api-key") {
    return { type: "api-key", key: apiKey, header: config.authHeader || "x-api-key" }
  }
  if (config.authType === "oauth") {
    return { type: "bearer", token: apiKey }
  }
  return { type: "bearer", token: apiKey }
}

function getExtraHeaders(config: ProviderConfig): Record<string, string> | undefined {
  if (!config.versionHeader) return undefined
  return { [config.versionHeader.name]: config.versionHeader.value }
}

export function createProvider(
  type: string,
  apiKey: string = "",
  baseUrl?: string,
  headers?: Record<string, string>,
): RouteInstance {
  let config = providerConfigs[type]

  if (!config) {
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

  const endpoint = getEndpoint(type, config, baseUrl)
  const auth = getAuth(type, config, apiKey)
  const versionHeaders = getExtraHeaders(config)

  try {
    return makeRoute({
      protocol: getProtocol(config.protocol),
      endpoint,
      auth,
      framing: config.framing || "sse",
      headers: { ...versionHeaders, ...headers },
    })
  } catch (err) {
    throw LLMError.provider(type, `Failed to create provider: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function getProviderNames(): string[] {
  return Object.keys(providerConfigs)
}

export function getProviderInfo(name: string): { defaultModel: string; models?: string[] } | null {
  const config = providerConfigs[name]
  if (!config) return null
  return { defaultModel: config.defaultModel || "", models: config.models }
}

export function registerProvider(name: string, config: ProviderConfig): void {
  providerConfigs[name] = config
}
