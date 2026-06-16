import { OpenAIProvider } from "./openai"
import { AnthropicProvider } from "./anthropic"
import { OpenAICompatibleProvider, type CompatibleProviderConfig } from "./openai-compatible"
import { LLMError } from "../schema"

export type ProviderType = "openai" | "anthropic" | "deepseek" | "ollama" | "groq" | "fireworks" | "together" | "cerebras" | "perplexity" | "custom"

export type ProviderInstance = OpenAIProvider | AnthropicProvider | OpenAICompatibleProvider

/**
 * OpenAI 兼容 Provider 的默认配置
 * 添加新 Provider 只需在这里新增一条，无需写适配器代码
 */
const compatibleProviders: Record<string, CompatibleProviderConfig> = {
  deepseek: { name: "deepseek", baseUrl: "https://api.deepseek.com", apiKey: "" },
  ollama: { name: "ollama", baseUrl: "http://localhost:11434/v1", apiKey: "" },
  groq: { name: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "" },
  fireworks: { name: "fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", apiKey: "" },
  together: { name: "together", baseUrl: "https://api.together.xyz/v1", apiKey: "" },
  cerebras: { name: "cerebras", baseUrl: "https://api.cerebras.ai/v1", apiKey: "" },
  perplexity: { name: "perplexity", baseUrl: "https://api.perplexity.ai", apiKey: "" },
}

export function createProvider(type: string, apiKey: string = "", baseUrl?: string, headers?: Record<string, string>): ProviderInstance {
  switch (type) {
    case "openai":
      return new OpenAIProvider({ apiKey: apiKey, baseUrl: baseUrl || "https://api.openai.com/v1", headers })
    case "anthropic":
      return new AnthropicProvider({ apiKey: apiKey, baseUrl: baseUrl || "https://api.anthropic.com", headers })
    case "custom":
      if (!baseUrl) throw LLMError.invalidRequest("Custom provider requires baseUrl")
      return new OpenAICompatibleProvider({ name: "custom", baseUrl, apiKey: apiKey, headers })
    default: {
      const defaults = compatibleProviders[type]
      if (!defaults) {
        if (baseUrl) return new OpenAICompatibleProvider({ name: type, baseUrl, apiKey: apiKey, headers })
        throw LLMError.invalidRequest(`Unknown provider: ${type}`)
      }
      return new OpenAICompatibleProvider({
        name: defaults.name,
        baseUrl: baseUrl || defaults.baseUrl,
        apiKey: apiKey,
        headers,
      })
    }
  }
}

export function getProviderNames(): string[] {
  return ["openai", "anthropic", ...Object.keys(compatibleProviders)]
}

export { OpenAIProvider } from "./openai"
export { AnthropicProvider } from "./anthropic"
export { OpenAICompatibleProvider } from "./openai-compatible"
