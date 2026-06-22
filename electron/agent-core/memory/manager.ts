/**
 * Memory Manager — 协调多个 Memory Provider
 * 参考 MiMo-Code memory/service.ts — 预算注入 + 重要性排序
 *
 * 增强点：
 * 1. Token 预算控制 — prefetch 结果按 token 预算截断
 * 2. 重要性排序 — checkpoint > builtin > fts > vector
 * 3. 自动 Dream 触发 — 每 N 回合自动提取知识
 */

import { MemoryProvider } from "./types"
import { logError } from "../logger"

/** Provider 优先级（数值越小越重要） */
const PROVIDER_PRIORITY: Record<string, number> = {
  checkpoint: 0,
  builtin: 1,
  "fts-memory": 2,
  vector: 3,
}

/** Token 估算：1 token ≈ 4 字符（中英混合） */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export class MemoryManager {
  private providers: MemoryProvider[] = []
  private turnCount = 0
  private dreamAutoTriggerInterval = 10

  addProvider(provider: MemoryProvider): void {
    this.providers.push(provider)
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
   * 参考 MiMo-Code 的 budgeted injection：重要性排序 + 预算截断
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

    // 按优先级排序（checkpoint 最重要）
    const sorted = results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.content.length > 0)
      .sort((a, b) => a.priority - b.priority)

    // 预算注入：按优先级依次填充，超出预算截断
    const parts: string[] = []
    let usedTokens = 0

    for (const item of sorted) {
      const itemTokens = estimateTokens(item.content)
      if (usedTokens + itemTokens > tokenBudget) {
        // 剩余预算不足，按比例截断
        const remaining = tokenBudget - usedTokens
        if (remaining > 200) {
          const truncated = item.content.slice(0, remaining * 4)
          parts.push(truncated)
        }
        break
      }
      parts.push(item.content)
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

  /**
   * 判断是否应该自动触发 Dream
   * 每 N 回合自动提取知识到持久化记忆
   */
  shouldAutoDream(): boolean {
    return this.turnCount > 0 && this.turnCount % this.dreamAutoTriggerInterval === 0
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
