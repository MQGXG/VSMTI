/**
 * Memory Manager — 协调多个 Memory Provider
 * 参考 Hermes Agent memory_manager.py
 */

import { MemoryProvider } from "./types"
import { logError } from "../logger"

export class MemoryManager {
  private providers: MemoryProvider[] = []

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

  async prefetch(query: string, sessionID: string): Promise<string> {
    const parts = await Promise.all(
      this.providers.map(async (p) => {
        try { return await p.prefetch(query, sessionID) } catch (e) {
          logError(`[MemoryManager] Provider "${p.name}" prefetch 失败`, e)
          return ""
        }
      }),
    )
    return parts.filter(Boolean).join("\n\n")
  }

  async syncTurn(user: string, assistant: string, sessionID: string): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try { await p.syncTurn(user, assistant, sessionID) } catch (e) {
          logError(`[MemoryManager] Provider "${p.name}" syncTurn 失败`, e)
        }
      }),
    )
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
