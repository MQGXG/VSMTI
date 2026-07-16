import { LLMError } from "./schema"
import { OpenAIChatProtocol } from "./protocols/openai-chat"
import { AnthropicMessagesProtocol } from "./protocols/anthropic-messages"
import { OpenAICompatibleChatProtocol } from "./protocols/openai-compatible-chat"
import { GeminiProtocol } from "./protocols/gemini"
import { OpenAIResponsesProtocol } from "./protocols/openai-responses"
import { makeRoute, type RouteInstance } from "./route/route"
import type { Auth, Endpoint, Framing, Protocol } from "./route/types"
import { BUILTIN_PROVIDERS, type ProviderDef, type ModelDef } from "./builtin-providers"

export type { ProviderDef, ModelDef } from "./builtin-providers"

export interface ProviderUserConfig {
  apiKey?: string
  baseUrl?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
  enabled?: boolean
  models?: Record<string, { name?: string; enabled?: boolean; context?: number }>
}

const providers = new Map<string, ProviderDef>()
const userConfigs = new Map<string, ProviderUserConfig>()
let initialized = false

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

function getEndpoint(def: ProviderDef, baseUrl?: string): Endpoint {
  const url = baseUrl || def.defaultBaseUrl
  const path = def.path || (def.protocol === "anthropic-messages" ? "/v1/messages" : "/chat/completions")
  return { baseUrl: url, path }
}

function getAuth(def: ProviderDef, apiKey: string): Auth {
  if (def.authType === "none") return { type: "none" }
  if (def.authType === "api-key") {
    return { type: "api-key", key: apiKey, header: def.authHeader || "x-api-key" }
  }
  return { type: "bearer", token: apiKey }
}

function getExtraHeaders(def: ProviderDef): Record<string, string> | undefined {
  if (!def.versionHeader) return undefined
  return { [def.versionHeader.name]: def.versionHeader.value }
}

export class ProviderCatalog {
  static registerBuiltins(): void {
    for (const def of BUILTIN_PROVIDERS) {
      providers.set(def.id, { ...def, models: [...def.models] })
    }
    initialized = true
  }

  static register(id: string, def: ProviderDef): void {
    providers.set(id, { ...def, models: [...def.models] })
  }

  static unregister(id: string): boolean {
    return providers.delete(id)
  }

  static getProvider(id: string): ProviderDef | undefined {
    return providers.get(id)
  }

  static getModel(providerId: string, modelId: string): ModelDef | undefined {
    const prov = providers.get(providerId)
    return prov?.models.find(m => m.id === modelId)
  }

  static listProviders(): ProviderDef[] {
    return Array.from(providers.values())
  }

  static listModels(providerId?: string): ModelDef[] {
    if (providerId) return providers.get(providerId)?.models ?? []
    const all: ModelDef[] = []
    for (const p of providers.values()) all.push(...p.models)
    return all
  }

  static applyUserConfig(configs: Record<string, ProviderUserConfig>): void {
    for (const [id, cfg] of Object.entries(configs)) {
      userConfigs.set(id, cfg)
      const existing = providers.get(id)
      if (existing) {
        if (cfg.baseUrl) existing.defaultBaseUrl = cfg.baseUrl
        if (cfg.models) {
          for (const [mid, mc] of Object.entries(cfg.models)) {
            const model = existing.models.find(m => m.id === mid)
            if (model && mc.name) model.label = mc.name
          }
        }
      }
    }
  }

  static getUserConfig(id: string): ProviderUserConfig | undefined {
    return userConfigs.get(id)
  }

  static createRoute(providerId: string, apiKey: string, baseUrl?: string, extraHeaders?: Record<string, string>): RouteInstance {
    if (!initialized) ProviderCatalog.registerBuiltins()
    const def = providers.get(providerId)
    if (!def) {
      if (baseUrl) {
        return makeRoute({
          protocol: OpenAICompatibleChatProtocol,
          endpoint: { baseUrl, path: "/chat/completions" },
          auth: { type: "bearer", token: apiKey },
          framing: "sse",
          headers: extraHeaders,
        })
      }
      throw LLMError.invalidRequest(`Unknown provider: ${providerId}`)
    }

    const endpoint = getEndpoint(def, baseUrl)
    const auth = getAuth(def, apiKey)
    const versionHeaders = getExtraHeaders(def)
    const userCfg = userConfigs.get(providerId)
    const configHeaders = userCfg?.headers

    try {
      return makeRoute({
        protocol: getProtocol(def.protocol),
        endpoint,
        auth,
        framing: def.framing || "sse",
        headers: { ...versionHeaders, ...configHeaders, ...extraHeaders },
      })
    } catch (err) {
      throw LLMError.provider(providerId, `Failed to create route: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  static getCatalogForUI(): Array<{
    id: string; label: string; website?: string
    defaultBaseUrl: string; authType: string
    models: Array<{ id: string; label?: string; context?: number }>
  }> {
    return Array.from(providers.values()).map(p => ({
      id: p.id, label: p.label, website: p.website,
      defaultBaseUrl: p.defaultBaseUrl, authType: p.authType,
      models: p.models.map(m => ({ id: m.id, label: m.label, context: m.context })),
    }))
  }

  static isInitialized(): boolean {
    return initialized
  }
}
