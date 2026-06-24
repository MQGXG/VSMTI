import { MemoryProvider } from "./types"
import type { FTSMemoryProvider } from "./fts-memory-provider"
import { logError } from "../logger"

const PROVIDER_PRIORITY: Record<string, number> = {
  checkpoint: 0,
  builtin: 1,
  "fts-memory": 2,
  file_memory: 3,
  vector: 4,
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export class MemoryManager {
  private providers: MemoryProvider[] = []
  private turnCount = 0
  private dreamAutoTriggerInterval = 10
  private seenFacts = new Set<string>()

  addProvider(provider: MemoryProvider): void {
    this.providers.push(provider)
  }

  /** 获取 FTS Provider（用于联动操作） */
  getFTSProvider(): FTSMemoryProvider | null {
    return (this.providers.find(p => p.name === "fts-memory") as FTSMemoryProvider) || null
  }

  async initialize(sessionID: string, workspace: string): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try { await p.initialize(sessionID, workspace) } catch (e) {
          logError(`[MemoryManager] Provider "${p.name}" 初始化失败`, e)
        }
      }),
    )
  }

  buildSystemPrompt(): string {
    return this.providers
      .map((p) => {
        try { return p.buildSystemPrompt() } catch (e) {
          logError(`[MemoryManager] Provider "${p.name}" buildSystemPrompt 失败`, e)
          return ""
        }
      })
      .filter(Boolean)
      .join("\n\n")
  }

  /**
   * 预算注入 — 按 token 预算控制 prefetch 结果
   * 支持跨 session 搜索（FTS 提供）
   */
  async prefetch(query: string, sessionID: string, tokenBudget = 2000): Promise<string> {
    const results = await Promise.all(
      this.providers.map(async (p) => {
        try {
          const content = await p.prefetch(query, sessionID)
          return { name: p.name, content, priority: PROVIDER_PRIORITY[p.name] ?? 99 }
        } catch (e) {
          logError(`[MemoryManager] Provider "${p.name}" prefetch 失败`, e)
          return null
        }
      }),
    )

    const ftsProvider = this.getFTSProvider()
    if (ftsProvider) {
      try {
        const crossSessionContent = await ftsProvider.prefetchMemory(query)
        if (crossSessionContent) {
          results.push({ name: "fts-memory", content: crossSessionContent, priority: PROVIDER_PRIORITY["fts-memory"] })
        }
      } catch { /* 跨 session 搜索失败不阻塞 */ }
    }

    const sorted = results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.content.length > 0)
      .sort((a, b) => a.priority - b.priority)

    const parts: string[] = []
    let usedTokens = 0

    for (const item of sorted) {
      const dedupedContent = this.deduplicateContent(item.content)
      const itemTokens = estimateTokens(dedupedContent)
      if (usedTokens + itemTokens > tokenBudget) {
        const remaining = tokenBudget - usedTokens
        if (remaining > 200) {
          const truncated = dedupedContent.slice(0, remaining * 4)
          parts.push(truncated)
        }
        break
      }
      parts.push(dedupedContent)
      usedTokens += itemTokens
    }

    return parts.join("\n\n")
  }

  async syncTurn(user: string, assistant: string, sessionID: string): Promise<void> {
    this.turnCount++

    await Promise.all(
      this.providers.map(async (p) => {
        try { await p.syncTurn(user, assistant, sessionID) } catch (e) {
          logError(`[MemoryManager] Provider "${p.name}" syncTurn 失败`, e)
        }
      }),
    )
  }

  shouldAutoDream(): boolean {
    return this.turnCount > 0 && this.turnCount % this.dreamAutoTriggerInterval === 0
  }

  /** 去重：移除跨 provider 的重复内容 */
  private deduplicateContent(content: string): string {
    const lines = content.split("\n").filter(Boolean)
    const unique: string[] = []
    for (const line of lines) {
      const normalized = line.trim().toLowerCase()
      if (!this.seenFacts.has(normalized)) {
        this.seenFacts.add(normalized)
        unique.push(line)
      }
    }
    return unique.join("\n")
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try { await p.shutdown() } catch (e) {
          logError(`[MemoryManager] Provider "${p.name}" shutdown 失败`, e)
        }
      }),
    )
  }
}
