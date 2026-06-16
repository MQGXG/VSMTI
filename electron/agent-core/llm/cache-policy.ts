import type { CachePolicy } from "./schema/options"

export function resolveCacheMarkers(policy: CachePolicy, provider: string): Record<string, unknown> {
  if (policy === "none") return {}

  if (policy === "auto") {
    switch (provider) {
      case "anthropic":
        return { cache_control: { type: "ephemeral" } }
      case "openai":
        return {} // OpenAI 服务端自动缓存
      default:
        return {}
    }
  }

  if (typeof policy === "object") {
    const markers: Record<string, unknown> = {}
    if (policy.ttlSeconds && provider === "anthropic") {
      markers.ttl = policy.ttlSeconds
    }
    return markers
  }

  return {}
}

export function shouldCache(provider: string): boolean {
  return ["anthropic", "openai"].includes(provider)
}
