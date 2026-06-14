/**
 * Memory Manager — 协调多个 Memory Provider
 * 参考 Hermes Agent memory_manager.py
 */

import { MemoryProvider } from "./types"

export class MemoryManager {
  private providers: MemoryProvider[] = []

  addProvider(provider: MemoryProvider): void {
    this.providers.push(provider)
  }

  async initialize(sessionID: string, workspace: string): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try { await p.initialize(sessionID, workspace) } catch { /* 单个 provider 失败不影响其他 */ }
      }),
    )
  }

  buildSystemPrompt(): string {
    return this.providers
      .map((p) => {
        try { return p.buildSystemPrompt() } catch { return "" }
      })
      .filter(Boolean)
      .join("\n\n")
  }

  async prefetch(query: string, sessionID: string): Promise<string> {
    const parts = await Promise.all(
      this.providers.map(async (p) => {
        try { return await p.prefetch(query, sessionID) } catch { return "" }
      }),
    )
    return parts.filter(Boolean).join("\n\n")
  }

  async syncTurn(user: string, assistant: string, sessionID: string): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try { await p.syncTurn(user, assistant, sessionID) } catch { /* log */ }
      }),
    )
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try { await p.shutdown() } catch { /* log */ }
      }),
    )
  }
}
